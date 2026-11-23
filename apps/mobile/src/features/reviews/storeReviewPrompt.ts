import * as StoreReview from 'expo-store-review';
import { Linking, Platform } from 'react-native';

import { STORAGE_KEYS } from '@/config';
import { kvStorage } from '@/services/storage/kvStore';

interface ReviewPromptState {
  /** IDs of placed orders already counted — keeps `noteOrderPlacedAsync`
   * idempotent if it's ever called twice for the same order (e.g. a
   * remounted success screen). */
  countedOrderIds: string[];
  placedOrderCount: number;
  lastPromptedAt: number | null;
}

const DEFAULT_STATE: ReviewPromptState = {
  countedOrderIds: [],
  placedOrderCount: 0,
  lastPromptedAt: null,
};

/** Wait for at least this many successfully placed orders before the very
 * first prompt — a single first order isn't a strong enough signal of real
 * usage.
 * TEMPORARY: set to 1 for testing, so the prompt is reachable without
 * placing 3 real orders — put this back to 3 before release. */
const MIN_ORDERS_BEFORE_FIRST_PROMPT = 1;
/** Don't re-trigger for ~4 months after a prompt, win or lose — a courtesy on
 * top of the OS's own quota (iOS caps at 3 per 365 days), not a replacement
 * for it. */
const COOLDOWN_MS = 120 * 24 * 60 * 60 * 1000;
/** Cap on how many order IDs are remembered, so this never grows unbounded
 * for a long-time customer. */
const MAX_TRACKED_IDS = 200;

function readState(): ReviewPromptState {
  try {
    return kvStorage.getObject<ReviewPromptState>(STORAGE_KEYS.reviewPromptState) ?? DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

function writeState(state: ReviewPromptState): void {
  try {
    kvStorage.setObject(STORAGE_KEYS.reviewPromptState, state);
  } catch {
    // storage unavailable — the in-memory trigger already fired this session regardless
  }
}

/**
 * Call once per order the app has confirmed was placed successfully (payment
 * captured, order created) — idempotent per order ID, safe to call again for
 * the same order. After enough successful placements, outside the cooldown
 * window, triggers the OS review prompt.
 *
 * Never call this from a sentiment pre-filter ("are you happy with your
 * order?") — both Apple's and Google's review guidelines prohibit gating the
 * prompt behind a happiness check first. This must fire on behavior
 * (orders successfully placed) alone.
 */
export async function noteOrderPlacedAsync(orderId: string): Promise<void> {
  const state = readState();
  if (state.countedOrderIds.includes(orderId)) {
    return;
  }

  const countedOrderIds = [...state.countedOrderIds, orderId].slice(-MAX_TRACKED_IDS);
  const placedOrderCount = (state.placedOrderCount ?? 0) + 1;
  const nextState: ReviewPromptState = { ...state, countedOrderIds, placedOrderCount };
  writeState(nextState);

  const withinCooldown =
    nextState.lastPromptedAt !== null && Date.now() - nextState.lastPromptedAt < COOLDOWN_MS;
  if (placedOrderCount < MIN_ORDERS_BEFORE_FIRST_PROMPT || withinCooldown) {
    return;
  }

  const available = await StoreReview.isAvailableAsync();
  if (!available) {
    return;
  }

  // Record the prompt attempt before calling — the OS doesn't report back
  // whether the dialog actually appeared, so "we asked" is the only signal
  // we can track regardless of outcome.
  writeState({ ...nextState, lastPromptedAt: Date.now() });
  try {
    await StoreReview.requestReview();
  } catch {
    // Rejects with ERR_STORE_REVIEW_FAILED whenever the OS declines to show
    // anything — the common case for a non-Play-Store/non-TestFlight
    // install, not a real failure this app can act on. Best-effort, same as
    // every other best-effort call in this review-prompt feature.
  }
}

/** Deep-links straight into the review-writing flow instead of the store
 * listing's main page — per expo-store-review's own docs, since there's no
 * shared query param for this: Android takes `showAllReviews=true`, iOS
 * takes `action=write-review`. */
function writeReviewUrl(storeUrl: string): string {
  const separator = storeUrl.includes('?') ? '&' : '?';
  return Platform.OS === 'ios'
    ? `${storeUrl}${separator}action=write-review`
    : `${storeUrl}${separator}showAllReviews=true`;
}

/** Manual "Rate Mealawe" entry point (Profile/Settings) — opens the store's
 * review-writing flow directly via the OS store app, bypassing the
 * automatic prompt's own quota. Returns `false` if no store URL is
 * available on this platform. */
export async function openStoreListingForReviewAsync(): Promise<boolean> {
  const url = StoreReview.storeUrl();
  if (!url) {
    return false;
  }
  await Linking.openURL(writeReviewUrl(url));
  return true;
}

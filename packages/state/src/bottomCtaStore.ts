import { create } from 'zustand';

import type { AccentTone } from '@mealawe/design-tokens';

/** A feed's sticky CTA (Subscribe / Continue), pre-formatted so the store
 * carries no currency/label logic of its own. */
export interface BottomCtaSlide {
  priceLabel: string;
  subtitle: string;
  buttonLabel: string;
  onPress: () => void;
  /** Overrides the card's default brand-green background/accent — e.g.
   * `'food'` for Dine In, matching every other dine-in-aware CTA in the app. */
  tone?: AccentTone;
}

interface BottomCtaState {
  /** Keyed by owning tab (e.g. 'subscription' | 'dinein') — each feed keeps
   * its own slot so switching tabs never shows another tab's stale CTA. */
  slides: Record<string, BottomCtaSlide | null>;
  /** Which tab is currently active — the only slot `BottomOverlayStack` reads from. */
  activeOwnerKey: string | null;
  setCta: (ownerKey: string, cta: BottomCtaSlide | null) => void;
  setActiveOwnerKey: (key: string | null) => void;
}

/**
 * The active feed tab's sticky CTA — pushed here by whichever feed
 * (SubscriptionHome, DineInHome, ...) currently has one, so
 * `BottomOverlayStack` (rendered once at the Home level) can combine it with
 * open-order tracking in a single swipeable slot instead of two separately
 * stacked bars. Mirrors deskdyneApp's `bottom-overlay-stack` +
 * `app-track-open-order` pattern.
 */
export const useBottomCtaStore = create<BottomCtaState>((set) => ({
  slides: {},
  activeOwnerKey: null,
  setCta: (ownerKey, cta) => set((s) => ({ slides: { ...s.slides, [ownerKey]: cta } })),
  setActiveOwnerKey: (key) => set({ activeOwnerKey: key }),
}));

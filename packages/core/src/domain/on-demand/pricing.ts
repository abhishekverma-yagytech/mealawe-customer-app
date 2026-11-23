import { isAllDayUpcoming, isOrderingWindowOpen, type OrderingWindows } from './schedule';
import type { DiscountOffer, ItemStatus, OnDemandKitchen, OnDemandMenuGroup, OnDemandMenuItem, OnDemandMode } from './types';

/** Exact port of `fetchKitchenMenu`'s fixed group ordering — unrecognized
 * groups sort to the end. */
const GROUP_ORDER = ['Main course', 'Thalis', 'Combo', 'Breads', 'Rice', 'Deserts', 'Desserts', 'Breakfast'];

function groupNameFor(item: OnDemandMenuItem): string {
  if (item.groupCategory) return item.groupCategory;
  if (item.itemIsCombo) return 'Combo';
  if (item.itemType) return item.itemType;
  return 'Other';
}

/**
 * Buckets a kitchen's full item list into one mode's menu, grouped and
 * sorted — exact port of `fetchKitchenMenu`'s `allDayItemList`/`advItemList`
 * split + `groupOrder`/`sortByGroup`. Daily uses `item.serveDaily`, Advance
 * uses `item.itemAvailable`.
 */
export function groupMenuByMode(items: OnDemandMenuItem[], mode: OnDemandMode): OnDemandMenuGroup[] {
  const eligible = items.filter((item) => (mode === 'allDay' ? item.serveDaily : item.itemAvailable));
  const byGroup = new Map<string, { groupName: string; items: OnDemandMenuItem[] }>();
  for (const item of eligible) {
    const name = groupNameFor(item);
    const key = name.toLowerCase();
    const bucket = byGroup.get(key) ?? { groupName: name, items: [] };
    bucket.items.push(item);
    byGroup.set(key, bucket);
  }
  const groups = Array.from(byGroup.values());
  groups.sort((a, b) => {
    const ai = GROUP_ORDER.findIndex((g) => g.toLowerCase() === a.groupName.toLowerCase());
    const bi = GROUP_ORDER.findIndex((g) => g.toLowerCase() === b.groupName.toLowerCase());
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return groups;
}

/**
 * Per-item ordering status. Daily: 'missed' when the window is closed,
 * 'coming-next' when within 2h of opening, 'sold-out' when a stock cap
 * exists and is exhausted (cartCount included, matching the legacy's
 * `quantityAvailable - quantityBooked - item.count` check). Advance items
 * are never stock-capped — only gated by the window being open at all
 * (there's no advance-specific missed/coming-next state in the legacy app;
 * an advance order just isn't placeable outside its window, enforced at
 * checkout, not per-item).
 */
export function itemStatusFor(
  item: OnDemandMenuItem,
  mode: OnDemandMode,
  windows: OrderingWindows,
  cartCount: number,
): ItemStatus {
  if (mode === 'allDay') {
    if (!isOrderingWindowOpen('allDay', windows)) {
      return isAllDayUpcoming(windows) ? 'coming-next' : 'missed';
    }
    if (
      typeof item.quantityAvailable === 'number' &&
      item.quantityAvailable - (item.quantityBooked ?? 0) - cartCount <= 0
    ) {
      return 'sold-out';
    }
    return 'available';
  }
  return item.itemAvailable ? 'available' : 'not-available';
}

/**
 * Kitchen-level discount offer resolved against a subtotal — exact port of
 * `checkForOffers()`/`getKitchenDiscount()`: percentage capped by maxLimit,
 * flat capped by the subtotal itself, gated by start/expiry date.
 */
export function kitchenDiscountFor(
  offer: DiscountOffer | undefined,
  subTotal: number,
  now = new Date(),
): number {
  if (!offer) return 0;
  const start = new Date(offer.startDate).getTime();
  const expiry = new Date(offer.expiryDate).getTime();
  const time = now.getTime();
  if (time < start || time > expiry) return 0;
  if (offer.discountType === 'flat') {
    return Math.min(offer.discountValue, subTotal);
  }
  const raw = Math.floor((subTotal / 100) * offer.discountValue);
  return offer.maxLimit ? Math.min(raw, offer.maxLimit) : raw;
}

/** Formats an offer for the kitchen-card badge — "Upto 20% OFF" / "FLAT 50 OFF". */
export function offerBadgeText(kitchen: OnDemandKitchen, now = new Date()): string | null {
  const offer = kitchen.discountOffer;
  if (!offer) return null;
  const start = new Date(offer.startDate).getTime();
  const expiry = new Date(offer.expiryDate).getTime();
  const time = now.getTime();
  if (time < start || time > expiry) return null;
  return offer.discountType === 'percentage'
    ? `Upto ${offer.discountValue}% OFF`
    : `FLAT ${offer.discountValue} OFF`;
}

/** Distance (km) under which a kitchen counts as "nearby" — drives both the
 * card's "Near & Fast" tag and the home list's near/other section split. */
export const NEAR_KM = 5;

/** Close-by, quick-turnaround tag for the kitchen card — "Near & Fast" once
 * within `NEAR_KM`, else a concrete prep-time/distance fallback so the tag
 * never renders empty when a kitchen has one of those fields but not both. */
export function speedTag(kitchen: OnDemandKitchen): string | null {
  if (typeof kitchen.distance === 'number' && kitchen.distance <= NEAR_KM) return 'Near & Fast';
  if (typeof kitchen.preparationTime === 'number') return `Ready in ${kitchen.preparationTime} min`;
  if (typeof kitchen.distance === 'number') return `${kitchen.distance.toFixed(1)} km away`;
  return null;
}

/** Whether a kitchen belongs in the "near you" section vs. "other kitchens" —
 * known distance within `NEAR_KM`. Kitchens with no distance data (or
 * farther away) fall into "other" rather than being guessed into "near". */
export function isNearby(kitchen: OnDemandKitchen): boolean {
  return typeof kitchen.distance === 'number' && kitchen.distance <= NEAR_KM;
}

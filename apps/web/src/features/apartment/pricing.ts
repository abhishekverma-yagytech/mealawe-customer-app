import type {
  ApartmentCartLine,
  ApartmentDish,
  ApartmentDishOffer,
  ApartmentKitchen,
  ApartmentMenuItem,
  ApartmentStandardMenuItem,
  MealType,
  OrderType,
} from './types';

export const ORDER_TYPES: OrderType[] = ['instant', 'today', 'advance'];

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  instant: 'Instant',
  today: 'Today',
  advance: 'Advance',
};

/** Fallback ETA shown when a kitchen never sets its own `preparationTime` override (a common, optional-field gap) — labelled "tentative". */
export const DEFAULT_INSTANT_PREP_MINUTES = 10;

/** A different-kitchen offer that's still orderable (not blocked) — gets its own bordered treatment in the kitchen picker. */
export function isDifferentKitchenOffer(offer: ApartmentDishOffer, cartKitchenId: string | null | undefined): boolean {
  return !offer.blocked && !!cartKitchenId && offer.kitchenId !== cartKitchenId;
}

/** Stable dish-grouping key. `mealType` folds in only when passed (Advance); Today/Instant stay name-only so all slots/kitchens merge into one dish. */
export function dishKeyFor(name: string, mealType?: string): string {
  const base = name.trim().toLowerCase();
  return mealType ? `${base}|${mealType}` : base;
}

/** Deterministic pseudo-random index — same `seed` always yields the same index (unlike `Math.random()`, safe inside `useMemo`). */
export function stableIndexFor(seed: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % length;
}

/** Random-among-eligible-kitchens auto-pick for Instant. `null` means no kitchen can cover `count` units. */
export function autoPickInstantOffer(dish: ApartmentDish, count: number): ApartmentDishOffer | null {
  const seen = new Set<string>();
  const candidates: ApartmentDishOffer[] = [];
  for (const o of dish.offers) {
    if (seen.has(o.kitchenId)) continue;
    seen.add(o.kitchenId);
    candidates.push(o);
  }
  const eligible = candidates.filter((o) => !o.blocked && (o.availableQty === undefined || o.availableQty >= count));
  if (eligible.length === 0) return null;
  const seed = `${dish.key}|${eligible.map((o) => o.kitchenId).sort().join(',')}`;
  return eligible[stableIndexFor(seed, eligible.length)];
}

export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** T+1 / T+2 — `day` is 1 or 2. */
export function isoForDay(day: 1 | 2, now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + day);
  return todayIso(d);
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** e.g. "Wed, 3 Sep" for a T+1/T+2 Advance day. Hand-rolled weekday/month arrays instead of `Intl.DateTimeFormat` (Hermes locale-data support varies). */
export function dayLabel(day: 1 | 2, now = new Date()): string {
  const iso = isoForDay(day, now);
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAY_SHORT[date.getDay()]}, ${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`;
}

/** Same "Wed, 3 Sep" formatting as `dayLabel`, but for an already-placed order's absolute ISO date rather than a T+1/T+2 offset from now.
 * Malformed input falls back to the raw string. */
export function isoDateLabel(iso: string): string {
  const datePart = iso.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) return iso;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return iso;
  return `${WEEKDAY_SHORT[date.getDay()]}, ${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`;
}

/** "HH:mm" (24h wire format) → "7:00 AM". Malformed input falls back to the raw string (fail-open, same as other kitchen-config reads). */
export function formatHHmm(hhmm: string): string {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!match) return hhmm;
  const h24 = Number(match[1]);
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${match[2]} ${period}`;
}

/** Wing/block + delivery-mode fields shared by both merge functions below, pulled out once so they can't drift apart. */
function kitchenOfferFields(
  kitchen: ApartmentKitchen,
  orderType: OrderType,
  // Today only — which meal slot this offer is for (for prepEndTime lookup below).
  mealType?: MealType,
): Pick<ApartmentDishOffer, 'kitchenWingName' | 'kitchenRoomNumber' | 'kitchenFulfillmentModes' | 'kitchenStreetAddress' | 'kitchenPrepEndTime'> {
  return {
    kitchenWingName: kitchen.apartmentSettings?.wingName ?? undefined,
    kitchenRoomNumber: kitchen.apartmentSettings?.roomNumber ?? undefined,
    kitchenFulfillmentModes: kitchen.apartmentSettings?.fulfillmentModes?.[orderType],
    kitchenPrepEndTime: orderType === 'today' && mealType ? kitchen.apartmentSettings?.todaySubTypes?.[mealType]?.prepEndTime : undefined,
    // Kitchen's real street address (address1 + landmark), not a distance figure.
    kitchenStreetAddress: [kitchen.address?.address1, kitchen.address?.landmark].filter(Boolean).join(', ') || undefined,
  };
}

function upsertDish(
  byKey: Map<string, ApartmentDish>,
  key: string,
  seed: Omit<ApartmentDish, 'offers' | 'badgeTypes'>,
  offer: ApartmentDishOffer,
  badgeType: OrderType,
): void {
  // Bug fix (product report — "some menu cards show only the image, no
  // name/price/description text"): a dish's `name`/`description`/`imageUrl`
  // are only ever set HERE, from whichever kitchen's raw item is the FIRST
  // one seen for this `key` — nothing re-checks them on a later merge for
  // the same dish. A kitchen menu entry with a genuinely blank `itemName`
  // on the server (a data-entry gap, not a client bug) still produces a
  // real (blank-derived) key, so it collapses into its own dish entry that
  // renders exactly as reported: a card with no text, only whatever image
  // happened to come along with it. Skipping any item with no real name
  // here — rather than rendering a broken-looking card for it — means a
  // malformed server entry just doesn't show up at all, the same "fail
  // gracefully, don't show garbage" convention this file already uses for
  // a fetch failure.
  if (!seed.name?.trim()) return;
  const existing = byKey.get(key);
  if (existing) {
    existing.offers.push(offer);
    if (!existing.badgeTypes.includes(badgeType)) existing.badgeTypes.push(badgeType);
  } else {
    byKey.set(key, { ...seed, offers: [offer], badgeTypes: [badgeType] });
  }
}

/** Whether a daily `ApartmentMenu.itemList` entry belongs to the active tab. `today`/`advance` are inferred from which date-scoped endpoint
 * returned the item, not the stored `tags` array (kitchens may never populate it) — only `instant` is genuinely kitchen-curated. */
function matchesActiveTag(item: ApartmentMenuItem, activeTag: OrderType): boolean {
  if (activeTag === 'instant') return item.tags.includes('instant');
  return true; // 'today' / 'advance'
}

/** Merges one kitchen's daily `ApartmentMenu.itemList` entries (already date-scoped by the caller's fetch) into the dish map.
 * `blocked` is the caller's call, since this function stays pure/IO-free. */
export function mergeDailyItems(
  byKey: Map<string, ApartmentDish>,
  kitchen: ApartmentKitchen,
  items: ApartmentMenuItem[],
  activeTag: OrderType,
  isBlocked: (item: ApartmentMenuItem) => { blocked: boolean; reason?: string; kind?: 'cutoff' | 'other' },
): void {
  for (const item of items) {
    if (!matchesActiveTag(item, activeTag)) continue;
    // Meal-type-scoped key for Advance only — Instant/Today stay name-only (one dish carries every slot's offers).
    const key = dishKeyFor(item.itemName, activeTag === 'advance' ? item.mealType : undefined);
    const { blocked, reason, kind } = isBlocked(item);
    // Instant/Today only: `quantityAvailable` is the server's real, already-net-of-booked remaining qty — don't subtract quantityBooked again.
    // Advance's own availableQuantity/quantityBooked aren't meaningful (real stock lives in a separate per-date ledger); enforced server-side only.
    const availableQty =
      (activeTag === 'instant' || activeTag === 'today') && typeof item.quantityAvailable === 'number' ? Math.max(0, item.quantityAvailable) : undefined;
    // A fully-sold-out offer also counts as blocked, with its own "Out of stock" reason (takes priority over any other block reason).
    const outOfStock = availableQty === 0;
    const offer: ApartmentDishOffer = {
      kitchenId: kitchen._id,
      kitchenName: kitchen.kitchenName,
      source: 'daily',
      itemId: item._id,
      price: item.itemPrice,
      mealType: item.mealType,
      itemServingDate: item.itemServingDate.slice(0, 10),
      preparationTime: item.preparationTime,
      servingQuantity: item.servingQuantity,
      servingQuantityUnit: item.servingQuantityUnit,
      moq: item.moq,
      pairedItemIds: item.pairedItemIds,
      blocked: blocked || outOfStock,
      blockReason: outOfStock ? 'Out of stock' : reason,
      blockKind: outOfStock ? 'outOfStock' : blocked ? (kind ?? 'other') : undefined,
      kitchenMealTiming: kitchen.mealTiming,
      kitchenRating: kitchen.rating,
      kitchenCuisine: kitchen.cuisine,
      ...kitchenOfferFields(kitchen, activeTag, item.mealType),
      availableQty,
    };
    upsertDish(
      byKey,
      key,
      {
        key,
        name: item.itemName,
        imageUrl: item.imageUrl,
        description: item.itemDescription,
        isVeg: item.itemType === 'Veg' || item.itemType === 'Jain',
        mealType: item.mealType,
        servesTo: item.servesTo,
        // Daily items have no dedicated banner-media field, only this one imageUrl — used as a single-image "reel" fallback.
        bannerImages: item.imageUrl ? [item.imageUrl] : undefined,
      },
      offer,
      activeTag,
    );
    // Surface an extra 'instant' badge when this same item is also tagged instant.
    if (activeTag !== 'instant' && item.tags.includes('instant')) {
      const dish = byKey.get(key)!;
      if (!dish.badgeTypes.includes('instant')) dish.badgeTypes.push('instant');
    }
  }
}

/** Merges one kitchen's opt-in shared-catalog items for the active standing type (instant/advance — never today).
 * `blocked`/`reason` covers the Advance lead-time floor, computed by the caller. */
export function mergeStandardItem(
  byKey: Map<string, ApartmentDish>,
  kitchen: ApartmentKitchen,
  item: ApartmentStandardMenuItem,
  activeTag: 'instant' | 'advance',
  itemServingDate: string | undefined,
  isBlocked: (item: ApartmentStandardMenuItem) => { blocked: boolean; reason?: string; kind?: 'cutoff' | 'other' },
): void {
  // Meal-type-scoped key for Advance only — Instant standing items stay name-only.
  const key = dishKeyFor(item.itemName, activeTag === 'advance' ? item.mealType : undefined);
  const { blocked, reason, kind } = isBlocked(item);
  const standardAvailableQty =
    activeTag === 'instant' && typeof item.instantQty === 'number'
      ? Math.max(0, item.instantQty - (item.instantQtyBookedDate === todayIso() ? item.instantQtyBookedToday ?? 0 : 0))
      : undefined;
  const standardOutOfStock = standardAvailableQty === 0;
  const offer: ApartmentDishOffer = {
    kitchenId: kitchen._id,
    kitchenName: kitchen.kitchenName,
    source: 'standard',
    itemId: item._id,
    price: item.itemPrice,
    mealType: item.mealType,
    itemServingDate,
    blocked: blocked || standardOutOfStock,
    blockReason: standardOutOfStock ? 'Out of stock' : reason,
    blockKind: standardOutOfStock ? 'outOfStock' : blocked ? (kind ?? 'other') : undefined,
    kitchenRating: kitchen.rating,
    kitchenCuisine: kitchen.cuisine,
    ...kitchenOfferFields(kitchen, activeTag),
    // Root-cause fix: this offer used to carry `item.preparationTime`
    // through from a "kitchen's own per-opt-in override" that never
    // actually existed on the server schema (a real `standardMenuSelections`
    // sub-doc has no `preparationTime` field) — so it silently reached the
    // add-sheet's Instant ETA banner as `undefined` every time, regardless
    // of what the admin actually set. `item.preparationTime` now sources
    // from the shared catalog's real `estimatedTime` (see
    // loadStandardMenuItems in api.ts and mergeStandardCatalog in
    // catalog.ts) — same passthrough here, now backed by a real value. Only
    // meaningful when activeTag === 'instant' — item.mealType itself is
    // undefined for advance anyway, so this reads the same way
    // advanceLeadDays below already does (present on `item` only when
    // relevant to THIS activeTag, per catalog.ts's orderType gate).
    preparationTime: item.preparationTime,
    // K4 — REMAINING Instant stock, not the raw declared cap: the server
    // now tracks a real running `instantQtyBookedToday` for standing items
    // too (mirrors the daily dated-item quantityAvailable/quantityBooked
    // path above in mergeDailyItems), reserved atomically at order time via
    // `reserveInstantStock`. `instantQtyBookedDate` uses the server's own
    // 'YYYY-MM-DD' LOCAL-date convention (see `toServerDateString` in
    // apartmentMenu.dao.js) — same shape as this file's own `todayIso()` —
    // and the server resets lazily on a date mismatch rather than on a
    // schedule, so treat any non-today date here as "nothing booked yet
    // today" rather than trusting a possibly-stale `instantQtyBookedToday`
    // number. Still just a client-side UX-accuracy improvement, not the
    // real enforcement — `reserveInstantStock`'s atomic reservation is what
    // actually prevents overselling; this only keeps residents from being
    // shown a stale higher number and then hitting an INSTANT_OUT_OF_STOCK
    // rejection at checkout that an accurate number would have avoided.
    availableQty: standardAvailableQty,
  };
  upsertDish(
    byKey,
    key,
    {
      key,
      name: item.itemName,
      imageUrl: item.imageUrl,
      description: item.itemDescription,
      isVeg: item.itemType === 'Veg' || item.itemType === 'Jain',
      mealType: item.mealType,
      cuisines: item.cuisines,
      standingType: activeTag,
      advanceLeadDays: item.advanceLeadDays,
      bannerImages: item.bannerImages,
      bannerVideos: item.bannerVideos,
    },
    offer,
    activeTag,
  );
  for (const t of item.menuTypes) {
    if (t !== activeTag) {
      const dish = byKey.get(key);
      if (dish && !dish.badgeTypes.includes(t as OrderType)) dish.badgeTypes.push(t as OrderType);
    }
  }
}

/** Search filtering for the browse grid. A dish with at least one selectable offer stays visible even if others are blocked; fully-blocked
 * dishes still render (disabled) — except Today, where the caller (`ApartmentHome.tsx`) hides them entirely on top of this result. */
export function filterDishes(dishes: ApartmentDish[], search: string): ApartmentDish[] {
  const q = search.trim().toLowerCase();
  if (!q) return dishes;
  return dishes.filter((d) => {
    const kitchenNames = d.offers.map((o) => o.kitchenName).join(' ');
    return `${d.name} ${d.description ?? ''} ${kitchenNames}`.toLowerCase().includes(q);
  });
}

/** Client-side mirror of the server's cutoff math (slot start = servingDate + kitchen's acceptOrderFrom time-of-day, minus cutoffMinutes),
 * so the Advance add sheet can pre-emptively warn — server's own enforcement is untouched. Fails open (false) on any missing input. */
export function isPastAdvanceCutoff(
  mealTiming: ApartmentKitchen['mealTiming'],
  mealType: MealType | undefined,
  itemServingDateIso: string | undefined,
  cutoffMinutes: number,
  now = new Date(),
): boolean {
  if (!mealType || !itemServingDateIso) return false;
  const entry = (mealTiming || []).find((slot) => slot.mealType === mealType && slot.acceptOrderFrom);
  if (!entry?.acceptOrderFrom) return false;
  const from = new Date(entry.acceptOrderFrom);
  if (Number.isNaN(from.getTime())) return false;
  const [y, m, d] = itemServingDateIso.split('-').map(Number);
  if (!y || !m || !d) return false;
  const slotStart = new Date(y, m - 1, d, from.getHours(), from.getMinutes(), 0, 0);
  const cutoffAt = new Date(slotStart.getTime() - cutoffMinutes * 60 * 1000);
  return now.getTime() >= cutoffAt.getTime();
}

/** Client-side MIRROR of `orderCutoff.util.js`'s `isPastNextDayCutoffHour`
 * (server: `orderCutoff.service.js`'s `assertWithinNextDayCutoff`, the
 * `ADVANCE_NEXT_DAY_CUTOFF_PASSED` business rule) — a SEPARATE, independent
 * rule from `isPastAdvanceCutoff` above: orders for T+1 ("Tomorrow")
 * specifically stop being accepted after a configurable wall-clock hour
 * TODAY (default 22 = 10 PM, `ApartmentConfig.advanceNextDayCutoffHour`),
 * regardless of which meal slot or kitchen — a pure date-relative check, no
 * per-kitchen data involved. T+2 ("Day after") is never affected by this
 * rule at all. Same "client mirror for UX only, server remains the real
 * enforcement" convention as `isPastAdvanceCutoff` — lets the day picker
 * grey out "Tomorrow" once this passes instead of only finding out from the
 * server's rejection after Add/Place order. */
export function isPastNextDayCutoffHour(day: 1 | 2, cutoffHour: number, now = new Date()): boolean {
  if (day !== 1) return false;
  return now.getHours() * 60 + now.getMinutes() >= cutoffHour * 60;
}

/** A bare 0-23 wall-clock hour (`ApartmentConfig.advanceNextDayCutoffHour`)
 * → "10 PM" — for `isPastNextDayCutoffHour`'s own messaging, shared by both
 * ApartmentAddSheet.tsx (the day picker's blocked reason) and
 * apartment-cart.tsx (the cart's own re-validation banner), so the two
 * surfaces can never phrase the same hour differently. No minutes
 * component at all on this config value (it's a whole-hour Ops setting,
 * unlike `formatHour12` above which formats a real `Date`), so this is
 * intentionally simpler than that. */
export function formatHourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** Bug fix (product report, 2026-09-03 — "make PM capital"): was lowercase
 * "am"/"pm" — every OTHER time-of-day formatter in this file
 * (`formatHHmm`/`formatHourLabel`) already uses uppercase "AM"/"PM";
 * matches that convention now instead of being the one inconsistent one. */
export function formatHour12(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = m === 0 ? '' : `:${String(m).padStart(2, '0')}`;
  return `${h12}${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

/** A kitchen's overall operating window, e.g. "12 pm–7 pm" — the earliest
 * `acceptOrderFrom` to the latest `acceptOrderTill` across every meal type
 * it has configured, not one specific slot (the kitchen picker shows this
 * as general "when this kitchen is open" context, not tied to whichever
 * slot the resident happens to have selected). `acceptOrderFrom`/
 * `acceptOrderTill` are full ISO datetimes (see isPastAdvanceCutoff above)
 * — only the time-of-day is used here, same as the rest of this file's
 * cutoff math. Returns `null` when the kitchen has no timing configured at
 * all, or none of it parses. */
export function kitchenHoursLabel(mealTiming: ApartmentKitchen['mealTiming']): string | null {
  let earliest: Date | null = null;
  let latest: Date | null = null;
  for (const slot of mealTiming ?? []) {
    if (slot.acceptOrderFrom) {
      const from = new Date(slot.acceptOrderFrom);
      if (!Number.isNaN(from.getTime()) && (!earliest || from.getHours() * 60 + from.getMinutes() < earliest.getHours() * 60 + earliest.getMinutes())) {
        earliest = from;
      }
    }
    if (slot.acceptOrderTill) {
      const till = new Date(slot.acceptOrderTill);
      if (!Number.isNaN(till.getTime()) && (!latest || till.getHours() * 60 + till.getMinutes() > latest.getHours() * 60 + latest.getMinutes())) {
        latest = till;
      }
    }
  }
  if (!earliest || !latest) return null;
  return `${formatHour12(earliest)}–${formatHour12(latest)}`;
}

export function isDishBlocked(dish: ApartmentDish): boolean {
  return dish.offers.every((o) => o.blocked);
}

/** The reference price shown on a dish card — the cheapest offer. Prefers a real positive price over a 0/missing one, only falling back
 * to zero-priced offers when every offer on the dish has one. */
export function cheapestOfferFor(offers: ApartmentDishOffer[]): ApartmentDishOffer {
  const positivePriced = offers.filter((o) => o.price > 0);
  const pool = positivePriced.length > 0 ? positivePriced : offers;
  return pool.reduce((min, o) => (o.price < min.price ? o : min), pool[0]);
}

const MEAL_ORDER: MealType[] = ['Breakfast', 'Lunch', 'HighTea', 'Dinner'];
/** Default meal-period time windows (24h) — ordering purposes only (which section shows first), never gates availability. */
const MEAL_TIME_WINDOWS: [MealType, number, number][] = [
  ['Breakfast', 5, 11],
  ['Lunch', 11, 16],
  ['HighTea', 16, 19],
  ['Dinner', 19, 23],
];

export function currentMealType(now = new Date()): MealType {
  const hour = now.getHours();
  const hit = MEAL_TIME_WINDOWS.find(([, start, end]) => hour >= start && hour < end);
  return hit ? hit[0] : 'Dinner'; // late night (11pm–5am) — Dinner is the nearest still-relevant slot
}

/** Breakfast/Lunch/HighTea/Dinner rotated so `current` comes first — e.g. at 1pm: Lunch, HighTea, Dinner, Breakfast. */
export function mealOrderFrom(current: MealType): MealType[] {
  const idx = MEAL_ORDER.indexOf(current);
  return idx === -1 ? MEAL_ORDER : [...MEAL_ORDER.slice(idx), ...MEAL_ORDER.slice(0, idx)];
}

/** Groups dishes into menu sections by `mealType`, falling back to a single "Menu" section when absent. `mealOrder` defaults to
 * Breakfast→Dinner; pass `mealOrderFrom(currentMealType())` (Today only) to surface the current meal first. */
export function sectionsFor(dishes: ApartmentDish[], mealOrder: string[] = MEAL_ORDER): { mealType: string; dishes: ApartmentDish[] }[] {
  const byMeal = new Map<string, ApartmentDish[]>();
  for (const dish of dishes) {
    const meal = dish.mealType || 'Menu';
    const bucket = byMeal.get(meal) ?? [];
    bucket.push(dish);
    byMeal.set(meal, bucket);
  }
  return Array.from(byMeal.entries())
    .map(([mealType, list]) => ({ mealType, dishes: list }))
    .sort((a, b) => {
      const ai = mealOrder.indexOf(a.mealType);
      const bi = mealOrder.indexOf(b.mealType);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
}

/** Filters hydrated pairing recommendations down to those not already in the cart, for the cart screen's add-ons block. */
export function pairingNotInCart(recommendations: ApartmentMenuItem[], lines: ApartmentCartLine[]): ApartmentMenuItem[] {
  const inCart = new Set(lines.map((l) => dishKeyFor(l.dishName)));
  return recommendations.filter((r) => !inCart.has(dishKeyFor(r.itemName)));
}

/**
 * The cart line already covering this dish name, if any — the single
 * source every "show a qty +/- stepper instead of an Add button once this
 * is already in the cart" surface reads from (the browse grid's own dish
 * cards, the add-sheet's "GOES WELL WITH" pairing cards, the cart screen's
 * "Add more from kitchen" upsell cards). A dish name can in principle match
 * more than one line at once (the SAME dish served across more than one
 * meal slot on the same day, e.g. an Advance item listed at both Breakfast
 * and Dinner) — `preferredMealType` (the ONE mealType this particular card
 * is actually being shown under, from `dish.mealType`/`sectionsFor`) picks
 * the right one of those instead of an arbitrary one; omitted (Instant,
 * which has no such ambiguity) just takes whichever line matches. `null`
 * means nothing's in the cart for this dish yet — callers fall back to
 * their own normal "Add"/"View more" UI.
 *
 * NOT used for Today (see `cartLineForTodayDish` below instead) — since the
 * cross-kitchen-dedup rework (2026-08-30), a Today `ApartmentDish.mealType`
 * is just whichever slot's offer happened to merge in first, not reliably
 * "the" slot this card is showing, so `preferredMealType` can no longer be
 * trusted for it the way it still can for Advance.
 */
export function cartLineForDish(lines: ApartmentCartLine[], dishName: string, preferredMealType?: MealType): ApartmentCartLine | null {
  const key = dishKeyFor(dishName);
  const matches = lines.filter((l) => dishKeyFor(l.dishName) === key);
  if (matches.length === 0) return null;
  if (preferredMealType) {
    const preferred = matches.find((l) => l.offer.mealType === preferredMealType);
    if (preferred) return preferred;
  }
  return matches[0];
}

/**
 * Today-specific variant of `cartLineForDish` above. A Today
 * `ApartmentDish` can now carry offers across MULTIPLE meal slots at once
 * (Today no longer keys dishes by mealType — see `dishKeyFor`'s own
 * comment), so `dish.mealType` is unreliable here: it's just whichever
 * slot's offer happened to be merged in first, not "the" slot this card
 * actually represents. Rather than guess and risk binding a stepper to the
 * WRONG slot's line, this only returns a line when there's exactly ONE
 * unambiguous cart match for this dish name — if the resident already has
 * the same dish in cart under two different slots at once, callers should
 * fall back to their normal "View more" (open the add-sheet, whose slot
 * picker disambiguates) instead of arbitrarily picking one of those lines.
 */
export function cartLineForTodayDish(lines: ApartmentCartLine[], dishName: string): ApartmentCartLine | null {
  const key = dishKeyFor(dishName);
  const matches = lines.filter((l) => dishKeyFor(l.dishName) === key);
  return matches.length === 1 ? matches[0] : null;
}

/** Groups cart lines into what will each become one SEPARATE placed order
 * (R14/U7/U8, plus the "multiple order types, same kitchen" product
 * decision — see ApartmentCartLine's own comment). Two axes:
 *  - `orderType` always splits groups — an Instant line and a Today line
 *    never land in the same order, even from the same kitchen/cart.
 *  - WITHIN one order type, Today/Advance additionally club by `mealType`
 *    (Breakfast/Lunch/HighTea/Dinner each their own group — R14/U7), so a
 *    single Today checkout can place one order for Breakfast, another for
 *    Dinner, etc. Instant never sub-groups by mealType even if an item
 *    happens to carry one as incidental catalog metadata — it has no real
 *    meal-slot concept, so splitting on it would be meaningless. */
export function groupCartLines(
  lines: ApartmentCartLine[],
): { key: string; orderType: OrderType; mealType: MealType | null; lines: ApartmentCartLine[] }[] {
  const byGroup = new Map<string, ApartmentCartLine[]>();
  for (const line of lines) {
    const subKey = line.orderType === 'today' || line.orderType === 'advance' ? line.offer.mealType ?? 'single' : 'single';
    const key = `${line.orderType}|${subKey}`;
    const bucket = byGroup.get(key) ?? [];
    bucket.push(line);
    byGroup.set(key, bucket);
  }
  return Array.from(byGroup.entries()).map(([key, groupLines]) => {
    const [, subKey] = key.split('|');
    return {
      key,
      orderType: groupLines[0].orderType,
      mealType: subKey === 'single' ? null : (subKey as MealType),
      lines: groupLines,
    };
  });
}

/** Catalog orchestration — fans out per-kitchen/catalog calls in `api.ts` and merges them via `pricing.ts` into the `ApartmentDish[]` the browse screen renders; one call per order-type tab, switching types re-fetches the whole catalog. */
import {
  loadApartmentAdvanceMenu,
  loadApartmentInstantMenu,
  loadApartmentTodayMenu,
  loadEligibleKitchens,
  loadKitchenById,
  loadStandardMenuItems,
  loadStandardMenuSelections,
  type ApartmentItemFilters,
  type ApartmentKitchenFilters,
  type ApartmentMenuFetchOptions,
  type ApartmentMenuFoodItem,
} from './api';
import { isoForDay, mergeDailyItems, mergeStandardItem, todayIso } from './pricing';
import type { ApartmentDish, ApartmentKitchen, ApartmentMenuItem, ApartmentStandardMenuItem, MealType, OrderType } from './types';

export interface ApartmentCatalog {
  kitchens: ApartmentKitchen[];
  dishes: ApartmentDish[];
  /** Advance only — which of T+1/T+2 each kitchen is eligible for, keyed by kitchenId. */
  eligibleDaysByKitchen?: Map<string, Set<1 | 2>>;
  /** Whether calling `loadApartmentCatalog` again with `page + 1` would return more dishes. */
  hasMore: boolean;
}

/** Resident's "Refine your menu" filter state. `cuisines`/`kitchenIds`/`deliveryType` are kitchen-level (filtered via a separate, unfiltered-registry `loadEligibleKitchens` call so the "Refine your menu" modal's checklist still shows every eligible kitchen); `search`/`diet` are item-level, enforced client-side via `matchesItemFilters` (diet is also sent server-side as `itemType`). `mealSlot` (Today only) carries the meal-slot filter through to the fetch. */
export type ApartmentCatalogFilters = ApartmentItemFilters & ApartmentKitchenFilters & { mealSlot?: MealType };

/** Maps this app's filter state onto the merged menu fetch's `itemType`/`mealSlot` params; `kitchenIds`/`deliveryMode`/`region` are deliberately not sent here since that would shrink the fetch's own kitchen set — kitchen-level filtering happens via the `dishKitchenIds` cross-reference below instead. */
function toMenuFetchOptions(page: number, filters?: ApartmentCatalogFilters): ApartmentMenuFetchOptions {
  return {
    page,
    limit: MENU_PAGE_LIMIT,
    itemType: filters?.diet,
    mealSlot: filters?.mealSlot,
  };
}

const EMPTY: ApartmentCatalog = { kitchens: [], dishes: [], hasMore: false };

// One page's worth of dishes per fetch, matching the server's own default — kept as a constant so the FlatList's `onEndReached` batch size stays a single source of truth.
const MENU_PAGE_LIMIT = 20;

// Mirrors the server's own TODAY_MEAL_SLOTS, in the same fixed display order used elsewhere in this app.
const ALL_TODAY_MEAL_SLOTS: MealType[] = ['Breakfast', 'Lunch', 'HighTea', 'Dinner'];

/** Client-side fallback for search/diet filtering — the server doesn't currently filter Today/Instant by these despite receiving them; safe either way since re-applying is a no-op if the server does filter later. */
function matchesItemFilters(item: ApartmentMenuFoodItem, filters?: ApartmentCatalogFilters): boolean {
  if (filters?.search) {
    const q = filters.search.trim().toLowerCase();
    if (q && !item.itemName.toLowerCase().includes(q)) return false;
  }
  if (filters?.diet === 'veg' && item.itemType === 'NonVeg') return false;
  if (filters?.diet === 'nonveg' && item.itemType !== 'NonVeg') return false;
  return true;
}

const hasKitchenFilters = (filters?: ApartmentCatalogFilters): boolean =>
  !!filters && (!!filters.cuisines?.length || !!filters.kitchenIds?.length || !!filters.deliveryType);

export async function loadApartmentCatalog(
  apartmentId: string,
  orderType: OrderType,
  geo: { lng: number; lat: number },
  filters?: ApartmentCatalogFilters,
  page = 1,
): Promise<ApartmentCatalog> {
  if (orderType === 'advance') return loadAdvanceCatalog(apartmentId, geo, filters, page);
  if (orderType === 'today') return loadTodayCatalogFromApartmentMenu(apartmentId, geo, filters, page);
  return loadInstantCatalogFromApartmentMenu(apartmentId, geo, filters, page);
}

/** Builds the minimal `ApartmentKitchen` this feature needs from the (kitchenId, kitchenName) pairs on every item the merged Today/Instant endpoints return — that's all those endpoints expose (no cuisine/rating/wing/fulfillment data, unlike Advance's `getNearestKitchensOfApartment`); every field left undefined already has a graceful fallback, and `mergeEnrichedKitchens` below fills most back in from a second call. */
function kitchenRegistry(itemLists: ApartmentMenuFoodItem[][]): Map<string, ApartmentKitchen> {
  const byId = new Map<string, ApartmentKitchen>();
  for (const list of itemLists) {
    for (const item of list) {
      if (!byId.has(item.kitchenId)) byId.set(item.kitchenId, { _id: item.kitchenId, kitchenName: item.kitchenName, kitchenOpened: true });
    }
  }
  return byId;
}

/** Root-cause fix (2026-09-01 — kitchen picker showing only name): the merged Today/Instant endpoints never carry rating/cuisine/fulfillment/wing data at all, so this enriches the minimal registry with the same richer per-kitchen data Advance's `loadEligibleKitchens` already provides, merged onto (not replacing) existing entries — a kitchen this second call misses just keeps its bare fallback. One extra network call per Today/Instant catalog load, accepted as the only source for this data on these tabs. */
function mergeEnrichedKitchens(byId: Map<string, ApartmentKitchen>, eligible: ApartmentKitchen[]): void {
  for (const rich of eligible) {
    const existing = byId.get(rich._id);
    if (!existing) continue;
    byId.set(rich._id, { ...existing, ...rich, _id: existing._id, kitchenName: existing.kitchenName });
  }
}

// Perf fix ("apartment API calls not fluid, slows the whole app"): a large
// apartment complex can leave MANY kitchens without `apartmentSettings` (the
// "rare case" comment below assumed few) — an unbounded `Promise.all` over
// all of them fires one HTTP request per kitchen simultaneously, and this
// app's `httpClient` does synchronous AES decryption of every response body
// on the JS thread, so a burst of dozens of concurrent responses lands as a
// burst of back-to-back synchronous decrypts, stalling the JS thread (and
// with it, everything else — taps, tab switches, animations) for however
// long that burst takes. Capping how many run at once bounds that burst
// regardless of kitchen count, at the cost of slightly more wall-clock time
// for the (already best-effort, fire-and-forget) backfill itself.
const BACKFILL_CONCURRENCY = 4;
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Bug fix (2026-09-04 — Delivery pill wrongly active for a self-pickup-only kitchen): `mergeEnrichedKitchens` only fills `apartmentSettings` for kitchens in the separately-filtered `loadEligibleKitchens` result, so this is a one-by-one fallback via `loadKitchenById` (no eligibility filter) for any kitchen still left bare — failures just leave it as bare as before. */
async function backfillMissingKitchenSettings(byId: Map<string, ApartmentKitchen>): Promise<void> {
  const missing = Array.from(byId.values()).filter((k) => !k.apartmentSettings);
  if (missing.length === 0) return;
  const profiles = await mapWithConcurrency(missing, BACKFILL_CONCURRENCY, (k) => loadKitchenById(k._id));
  for (const rich of profiles) {
    if (!rich) continue;
    const existing = byId.get(rich._id);
    if (!existing) continue;
    byId.set(rich._id, { ...existing, ...rich, _id: existing._id, kitchenName: existing.kitchenName });
  }
}

/** Raw → internal item adapter shared by the Today/Instant merged-fetch loaders; maps `sellPrice` (never BUY `itemPrice`) onto `itemPrice`, and folds `itemAvailable: false` into the existing quantity-exhaustion mechanism (qty fields forced to 0) so `mergeDailyItems`'s stock-out check already handles it. */
function toApartmentMenuItem(item: ApartmentMenuFoodItem, mealType: MealType | undefined, servingDate: string, activeTag: 'today' | 'instant' | 'advance'): ApartmentMenuItem {
  const forcedOutOfStock = !item.itemAvailable;
  return {
    _id: item._id,
    itemId: item._id,
    itemName: item.itemName,
    imageUrl: item.imageUrl,
    itemType: item.itemType,
    itemServingDate: servingDate,
    mealType,
    itemPrice: item.sellPrice,
    // Root-cause fix (2026-09-01): both used to read the wrong field — `itemDescription` was hardcoded undefined, `tasteOfRegion` reused the unrelated `item.itemFlavour`; `ApartmentMenuFoodItem` now parses the real, correctly-named dish-level fields.
    itemDescription: item.itemDescription,
    tasteOfRegion: item.tasteOfRegion,
    // Bug fix (same pass): "Serves N" used to read `item.servingQuantity`, actually a serving-SIZE unit, not a people-count — the real field is `servesTo`, now wired up here too.
    servesTo: item.servesTo,
    // Product instruction, 2026-09-03 — "View More — Serving Quantity & Unit": kitchen-specific passthrough from this row's own fields, never a dish-level default.
    servingQuantity: item.servingQuantity,
    servingQuantityUnit: item.servingQuantityUnit,
    quantityAvailable: forcedOutOfStock ? 0 : item.availableQuantity,
    quantityBooked: forcedOutOfStock ? 0 : item.quantityBooked,
    preparationTime: item.preparationTime,
    moq: item.moq,
    tags: [activeTag],
  };
}

/** Today — root-cause fix (server contract change, 2026-08-30): the server now dedupes across kitchens (not by meal slot) with each row's `isActive` already computed server-side, so this just expands each row into one `ApartmentMenuItem` per slot it serves rather than hand-reconciling buckets; dishes are no longer keyed by meal type (one dish carries all slots, resident picks the slot in the add-sheet); and `[...activeItems, ...inactiveItems]` is iterated in that exact order so Map insertion order naturally comes out active-first, matching the server's own ordering. */
async function loadTodayCatalogFromApartmentMenu(
  apartmentId: string,
  geo: { lng: number; lat: number },
  filters?: ApartmentCatalogFilters,
  page = 1,
): Promise<ApartmentCatalog> {
  // The enrichment fetch has no dependency on the menu response, so both start immediately rather than a sequential round-trip; this unfiltered `eligible` call stays unfiltered on purpose — it builds the modal's always-complete checklist.
  const [res, eligible] = await Promise.all([
    loadApartmentTodayMenu(apartmentId, toMenuFetchOptions(page, filters)),
    loadEligibleKitchens(apartmentId, 'today', geo.lng, geo.lat).catch(() => []),
  ]);
  if (!res) return EMPTY;

  const allById = kitchenRegistry([res.activeItems, res.inactiveItems]);
  mergeEnrichedKitchens(allById, eligible);
  // Perf fix ("cuisines/menus take 4-5 seconds"): this used to be awaited, keeping the whole catalog on the loading skeleton for an extra sequential round-trip even though it only affects a rare few kitchens; now fired without awaiting so first paint proceeds immediately, with any missed kitchen just keeping its fail-open badges until the next refresh.
  void backfillMissingKitchenSettings(allById);
  const kitchens = Array.from(allById.values());
  if (kitchens.length === 0) return EMPTY;

  // Kitchen-level filters use a separate, filtered `loadEligibleKitchens` call, only made when one's active; `null` means every kitchen qualifies (common case, no extra round-trip).
  let dishKitchenIds: Set<string> | null = null;
  if (hasKitchenFilters(filters)) {
    const filteredEligible = await loadEligibleKitchens(apartmentId, 'today', geo.lng, geo.lat, undefined, filters).catch(() => []);
    dishKitchenIds = new Set(filteredEligible.map((k) => k._id));
  }

  const servingDate = todayIso();
  const byKey = new Map<string, ApartmentDish>();
  const byKitchen = new Map<string, ApartmentMenuFoodItem[]>();
  for (const raw of [...res.activeItems, ...res.inactiveItems]) {
    if (dishKitchenIds && !dishKitchenIds.has(raw.kitchenId)) continue;
    if (!matchesItemFilters(raw, filters)) continue;
    const list = byKitchen.get(raw.kitchenId) ?? [];
    list.push(raw);
    byKitchen.set(raw.kitchenId, list);
  }
  for (const [kitchenId, rawItems] of byKitchen) {
    const kitchen = allById.get(kitchenId)!;
    // One raw (kitchen, dish) row → one ApartmentMenuItem per slot it serves, sharing one stock pool across every slot (same underlying itemId), not a separate booking per slot.
    interface Entry {
      raw: ApartmentMenuFoodItem;
      item: ApartmentMenuItem;
    }
    // Bug fix (2026-09-05 — items silently disappearing): a kitchen item with no meal slot configured (`mealSlots: []`) used to produce zero expanded entries, dropping the dish entirely; now falls back to all four slots instead, so it shows as available all day rather than nowhere (client-only fix — the real fix belongs in mealaweKitchenPartner).
    const entries: Entry[] = rawItems.flatMap((raw) =>
      (raw.mealSlots.length ? raw.mealSlots : ALL_TODAY_MEAL_SLOTS).map((mealType) => ({ raw, item: toApartmentMenuItem(raw, mealType, servingDate, 'today') })),
    );
    // `activeMealSlots` is the per-slot breakdown (falls back to row-level isActive if omitted) — needed since isActive alone is one flag for the whole row and could wrongly make a cutoff slot look orderable; only applied when the row has real configured mealSlots.
    const blockedByKey = new Map(
      entries.map((e) => {
        const slotActive =
          e.raw.mealSlots.length > 0 && e.raw.activeMealSlots
            ? !!e.item.mealType && e.raw.activeMealSlots.includes(e.item.mealType)
            : e.raw.isActive;
        return [`${e.item._id}|${e.item.mealType}`, !slotActive];
      }),
    );
    mergeDailyItems(
      byKey,
      kitchen,
      entries.map((e) => e.item),
      'today',
      (item) => {
        const blocked = blockedByKey.get(`${item._id}|${item.mealType}`) ?? false;
        // Kitchen-named + direction-neutral message: applies whether the slot hasn't started yet or has already ended (never says "closed", wrong for the former).
        return blocked
          ? { blocked: true, reason: `${kitchen.kitchenName} isn't taking ${item.mealType} orders right now`, kind: 'cutoff' }
          : { blocked: false };
      },
    );
  }
  return { kitchens, dishes: Array.from(byKey.values()), hasMore: res.meta.hasNextPage };
}

/** Instant — Today's counterpart, no meal-slot dimension (one raw row = one `ApartmentMenuItem`); reads each row's own `isActive` rather than trusting which bucket it came from, since a dish can land in `activeItems` if any of its kitchens is active. */
async function loadInstantCatalogFromApartmentMenu(
  apartmentId: string,
  geo: { lng: number; lat: number },
  filters?: ApartmentCatalogFilters,
  page = 1,
): Promise<ApartmentCatalog> {
  const [res, eligible] = await Promise.all([
    loadApartmentInstantMenu(apartmentId, toMenuFetchOptions(page, filters)),
    loadEligibleKitchens(apartmentId, 'instant', geo.lng, geo.lat).catch(() => []),
  ]);
  if (!res) return EMPTY;

  const allById = kitchenRegistry([res.activeItems, res.inactiveItems]);
  mergeEnrichedKitchens(allById, eligible);
  // Same rare/fails-open enrichment as the Today loader — no longer blocking first paint.
  void backfillMissingKitchenSettings(allById);
  const kitchens = Array.from(allById.values());
  if (kitchens.length === 0) return EMPTY;

  // Same kitchen-level filter split as the Today loader above.
  let dishKitchenIds: Set<string> | null = null;
  if (hasKitchenFilters(filters)) {
    const filteredEligible = await loadEligibleKitchens(apartmentId, 'instant', geo.lng, geo.lat, undefined, filters).catch(() => []);
    dishKitchenIds = new Set(filteredEligible.map((k) => k._id));
  }

  const rawItems = [...res.activeItems, ...res.inactiveItems].filter(
    (raw) => (!dishKitchenIds || dishKitchenIds.has(raw.kitchenId)) && matchesItemFilters(raw, filters),
  );

  const servingDate = todayIso();
  const byKey = new Map<string, ApartmentDish>();
  const byKitchen = new Map<string, ApartmentMenuFoodItem[]>();
  for (const raw of rawItems) {
    const list = byKitchen.get(raw.kitchenId) ?? [];
    list.push(raw);
    byKitchen.set(raw.kitchenId, list);
  }
  for (const [kitchenId, kitchenRawItems] of byKitchen) {
    const kitchen = allById.get(kitchenId)!;
    const items = kitchenRawItems.map((raw) => toApartmentMenuItem(raw, undefined, servingDate, 'instant'));
    const activeById = new Map(kitchenRawItems.map((raw, i) => [items[i]._id, raw.isActive]));
    mergeDailyItems(byKey, kitchen, items, 'instant', (item) => {
      // Instant's own isActive conflates stock and time-window into one flag; availableQty > 0 is trusted over the flag whenever it says something's left.
      const availableQty = typeof item.quantityAvailable === 'number' ? Math.max(0, item.quantityAvailable) : undefined;
      const hasStock = availableQty === undefined || availableQty > 0;
      const blocked = !(activeById.get(item._id) ?? false) && !hasStock;
      // Same direction-neutral wording as Today's message — true whether the window hasn't started or already ended.
      return blocked ? { blocked: true, reason: `${kitchen.kitchenName} isn't running Instant orders right now`, kind: 'cutoff' } : { blocked: false };
    });
  }
  return { kitchens, dishes: Array.from(byKey.values()), hasMore: res.meta.hasNextPage };
}

async function loadAdvanceCatalog(
  apartmentId: string,
  geo: { lng: number; lat: number },
  filters?: ApartmentCatalogFilters,
  page = 1,
): Promise<ApartmentCatalog> {
  const day1 = isoForDay(1);
  const day2 = isoForDay(2);
  // Advance's merged endpoint is date-agnostic and replaces the older per-kitchen loadFutureMenu fetch; T+1/T+2 eligibility still needs per-day loadEligibleKitchens calls crossed against the merged item data. .catch() (matching Today/Instant) keeps an expired session from throwing inside this Promise.all.
  const [kitchensDay1, kitchensDay2, advanceRes] = await Promise.all([
    loadEligibleKitchens(apartmentId, 'advance', geo.lng, geo.lat, day1).catch(() => []),
    loadEligibleKitchens(apartmentId, 'advance', geo.lng, geo.lat, day2).catch(() => []),
    loadApartmentAdvanceMenu(apartmentId, toMenuFetchOptions(page, filters)),
  ]);

  const eligibleDaysByKitchen = new Map<string, Set<1 | 2>>();
  for (const k of kitchensDay1) eligibleDaysByKitchen.set(k._id, new Set([1]));
  for (const k of kitchensDay2) {
    const set = eligibleDaysByKitchen.get(k._id) ?? new Set<1 | 2>();
    set.add(2);
    eligibleDaysByKitchen.set(k._id, set);
  }
  const kitchenById = new Map<string, ApartmentKitchen>();
  for (const k of [...kitchensDay1, ...kitchensDay2]) kitchenById.set(k._id, k);
  const kitchens = Array.from(kitchenById.values());
  if (kitchens.length === 0) return EMPTY;

  // Same "unfiltered universe for the modal, filtered subset for the merge" split as the non-Advance branch above.
  let dishKitchens = kitchens;
  if (hasKitchenFilters(filters)) {
    const [filteredDay1, filteredDay2] = await Promise.all([
      loadEligibleKitchens(apartmentId, 'advance', geo.lng, geo.lat, day1, filters),
      loadEligibleKitchens(apartmentId, 'advance', geo.lng, geo.lat, day2, filters),
    ]);
    const filteredById = new Map<string, ApartmentKitchen>();
    for (const k of [...filteredDay1, ...filteredDay2]) filteredById.set(k._id, k);
    dishKitchens = Array.from(filteredById.values());
  }
  if (dishKitchens.length === 0) return { kitchens, dishes: [], hasMore: false };

  const byKey = new Map<string, ApartmentDish>();
  const dishKitchenById = new Map(dishKitchens.map((k) => [k._id, k]));

  // Same "raw row → one ApartmentMenuItem per applicable day" expansion as Today's per-meal-slot one: a kitchen eligible for both T+1 and T+2 gets two offers, one eligible for only one gets one.
  if (advanceRes) {
    const rawItems = [...advanceRes.activeItems, ...advanceRes.inactiveItems].filter(
      (raw) => dishKitchenById.has(raw.kitchenId) && matchesItemFilters(raw, filters),
    );
    const byKitchen = new Map<string, ApartmentMenuFoodItem[]>();
    for (const raw of rawItems) {
      const list = byKitchen.get(raw.kitchenId) ?? [];
      list.push(raw);
      byKitchen.set(raw.kitchenId, list);
    }
    for (const [kitchenId, kitchenRawItems] of byKitchen) {
      const kitchen = dishKitchenById.get(kitchenId)!;
      const eligibleDays = Array.from(eligibleDaysByKitchen.get(kitchenId) ?? new Set<1 | 2>());
      if (eligibleDays.length === 0) continue;
      interface Entry {
        raw: ApartmentMenuFoodItem;
        item: ApartmentMenuItem;
      }
      const entries: Entry[] = kitchenRawItems.flatMap((raw) =>
        eligibleDays.map((day) => ({ raw, item: toApartmentMenuItem(raw, undefined, day === 1 ? day1 : day2, 'advance') })),
      );
      // Which days get an entry is already decided above by eligibleDays — no separate "kitchen marked this date off" check needed here.
      const blockedById = new Map(entries.map((e) => [e.item._id, !e.raw.isActive]));
      mergeDailyItems(byKey, kitchen, entries.map((e) => e.item), 'advance', (item) => {
        const blocked = blockedById.get(item._id) ?? false;
        // kind stays 'other' (not 'outOfStock') — that category is reserved for mergeDailyItems' own stock-exhaustion check, which takes priority.
        return blocked ? { blocked: true, reason: `${kitchen.kitchenName} isn't taking orders for this item right now`, kind: 'other' } : { blocked: false };
      });
    }
  }

  await mergeStandardCatalog(byKey, dishKitchens, 'advance', filters);

  // Reflects only the paginated advanceRes items — mergeStandardCatalog's shared standing catalog above is unpaginated and never contributes to hasMore.
  return { kitchens, dishes: Array.from(byKey.values()), eligibleDaysByKitchen, hasMore: advanceRes ? advanceRes.meta.hasNextPage : false };
}

// orderType stays the broader 'instant' | 'advance' union even though Advance is the only real caller now, so a future Instant fetch could resume calling this without a signature change.
async function mergeStandardCatalog(
  byKey: Map<string, ApartmentDish>,
  kitchens: ApartmentKitchen[],
  orderType: 'instant' | 'advance',
  filters?: ApartmentItemFilters,
): Promise<void> {
  const [catalog, selections] = await Promise.all([loadStandardMenuItems(orderType, filters), loadStandardMenuSelections(kitchens.map((k) => k._id))]);
  const catalogById = new Map<string, ApartmentStandardMenuItem>(catalog.map((c) => [c._id, c]));
  const kitchenById = new Map(kitchens.map((k) => [k._id, k]));
  for (const sel of selections) {
    const kitchen = kitchenById.get(sel.kitchenId);
    if (!kitchen || !sel.kitchenOpened) continue;
    for (const pick of sel.selections) {
      if (pick.menuType !== orderType) continue;
      const catalogItem = catalogById.get(pick.itemId);
      if (!catalogItem) continue;
      try {
        // Bug fix: `pick`'s own advanceLeadDays override was computed but never applied; each field below is ONLY ever set when `orderType` is the one type it applies to (never falling back to `catalogItem`'s shared copy for another type), since `catalogItem` is shared across every kitchen/order-type iteration and an unconditional fallback would leak a field onto an irrelevant order type (confirmed bug class — MOQ leaking onto Instant). `preparationTime` is not a per-kitchen override (no such field exists on a real selection sub-doc) — it's the catalog's own admin-set value, re-asserted here gated to 'instant' for the same reason.
        const item: ApartmentStandardMenuItem = {
          ...catalogItem,
          advanceLeadDays: orderType === 'advance' ? pick.advanceLeadDays : undefined,
          preparationTime: orderType === 'instant' ? catalogItem.preparationTime : undefined,
          instantQty: orderType === 'instant' ? pick.instantQty : undefined,
          instantQtyBookedToday: orderType === 'instant' ? pick.instantQtyBookedToday : undefined,
          instantQtyBookedDate: orderType === 'instant' ? pick.instantQtyBookedDate : undefined,
        };
        // Standing items carry no fixed serving date — the resident picks T+1/T+2 in the add sheet, which stamps it on once chosen.
        mergeStandardItem(byKey, kitchen, item, orderType, undefined, () => ({ blocked: false }));
      } catch {
        // one malformed catalog row must never blank the whole catalog
      }
    }
  }
}

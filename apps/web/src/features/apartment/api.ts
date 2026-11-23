import { ENDPOINTS, getCoreConfig, http, HttpError, imageUri, runtimeCacheInterceptor } from '@mealawe/core';

import type { ApartmentItemForOrder, CustomerLocation } from '@/payment/types';

import type {
  AdvanceDeliverySlot,
  ApartmentKitchen,
  ApartmentMenuItem,
  ApartmentOrder,
  ApartmentStandardMenuItem,
  MealType,
  OrderType,
  StandardMenuSelection,
} from './types';

function resolveImage(path: unknown): string | undefined {
  return typeof path === 'string' && path ? imageUri(path) : undefined;
}

/** Like `resolveImage`, but for `bannerVideos` (`env.videoUrl`); passes an already-full http(s) URL through unchanged. */
function resolveVideo(path: unknown): string | undefined {
  if (typeof path !== 'string' || !path) return undefined;
  return /^https?:\/\//i.test(path) ? path : `${getCoreConfig().serverUrl}/videos/${path}`;
}

/** Array version of `resolveImage`; drops non-string entries. */
function resolveImages(paths: unknown): string[] | undefined {
  if (!Array.isArray(paths)) return undefined;
  const resolved = paths.map(resolveImage).filter((p): p is string => !!p);
  return resolved.length > 0 ? resolved : undefined;
}

function resolveVideos(paths: unknown): string[] | undefined {
  if (!Array.isArray(paths)) return undefined;
  const resolved = paths.map(resolveVideo).filter((p): p is string => !!p);
  return resolved.length > 0 ? resolved : undefined;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v != null ? String(v) : '';
}

/** Like `str`, but for numeric fields — falls back to `0` instead of `NaN`. */
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Server-side filter params plumbed through menu/kitchen fetches; all fields optional/absent = no filter. */
export interface ApartmentItemFilters {
  search?: string;
  diet?: 'veg' | 'nonveg';
}

export interface ApartmentKitchenFilters {
  cuisines?: string[];
  kitchenIds?: string[];
  deliveryType?: 'delivery' | 'pickup';
}

// Built by hand — URLSearchParams isn't reliably available on RN/Hermes.
function itemFilterQuery(filters?: ApartmentItemFilters): string {
  const parts: string[] = [];
  if (filters?.search) parts.push(`search=${encodeURIComponent(filters.search)}`);
  if (filters?.diet) parts.push(`diet=${encodeURIComponent(filters.diet)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

// ── 1. Which apartment am I in? ────────────────────────────────────────────

export interface ResolvedApartment {
  apartmentId: string;
  apartmentName?: string;
}

/** `null` means genuinely no apartment kitchen here (not "still loading"); a real failure rejects instead. */
export async function resolveApartment(lng: number, lat: number): Promise<ResolvedApartment | null> {
  // Server returns either a bare kitchen array or { kitchens, showBulk } — accept both.
  const res = await http.get<Record<string, unknown>[] | { kitchens?: Record<string, unknown>[] }>(`${ENDPOINTS.apartment.resolveApartment}/${lng}/${lat}`);
  const kitchens = Array.isArray(res) ? res : res?.kitchens;
  const list = Array.isArray(kitchens) ? kitchens : [];
  if (list.length === 0) return null;
  const info = list[0]?.apartmentInfo as Record<string, unknown> | undefined;
  if (!info?.apartmentId) return null;
  return { apartmentId: str(info.apartmentId), apartmentName: info.apartmentName ? str(info.apartmentName) : undefined };
}

// ── 1b. Today/Instant merged menu (the "new buy/sell flow" endpoints) ─────

/** One flattened (dish, kitchen) row from the grouped Today/Instant/Advance endpoints (server groups by dish, flattened here). */
export interface ApartmentMenuFoodItem {
  _id: string;
  foodItemId: string;
  itemName: string;
  imageUrl?: string;
  itemType: 'Veg' | 'NonVeg' | 'Jain';
  itemFlavour?: string;
  /** Distinct dish-level fields — don't confuse `tasteOfRegion` with `itemFlavour`, or `servesTo` (people count) with `servingQuantity` (serving size). */
  itemDescription?: string;
  spicyLevel?: number;
  servesTo?: number;
  tasteOfRegion?: string;
  /** BUY price — what the kitchen is paid. NEVER surface this to the resident. */
  itemPrice: number;
  /** SELL price — what the resident actually pays; maps to `ApartmentMenuItem.itemPrice`. */
  sellPrice: number;
  maxItemPrice?: number;
  availableQuantity?: number;
  quantityBooked?: number;
  itemAvailable: boolean;
  moq?: number;
  /** Today: which meal slot(s) this kitchen serves this dish under. Instant: always `[]`. */
  mealSlots: MealType[];
  preparationTime?: number;
  itemServingType?: string;
  servingQuantity?: number;
  servingQuantityUnit?: string;
  kitchenId: string;
  kitchenName: string;
  /** Server-computed eligibility for this kitchen's copy of this dish (stock + itemAvailable, plus Today's prep-start cutoff). */
  isActive: boolean;
  /** Today only. Per-slot subset of `mealSlots` still orderable (unlike `isActive`'s OR-across-slots); falls back to `isActive` if omitted. */
  activeMealSlots?: MealType[];
  /** Advance only — this kitchen's enabled Advance delivery windows (kitchen-level); absent for Today/Instant. */
  advanceDeliverySlots?: AdvanceDeliverySlot[];
}

/** Dish-level fields shared by every row in a dish's `kitchens[]`, lifted once per dish and spread onto each flattened kitchen row. */
function normalizeGroupedFoodItemList(raw: unknown): ApartmentMenuFoodItem[] {
  if (!Array.isArray(raw)) return [];
  const flattened: ApartmentMenuFoodItem[] = [];
  for (const dishRaw of raw as Record<string, unknown>[]) {
    const foodItemId = str(dishRaw.foodItemId);
    const itemName = str(dishRaw.itemName);
    const imageUrl = resolveImage(dishRaw.imageUrl);
    const itemType = (dishRaw.itemType as 'Veg' | 'NonVeg' | 'Jain') ?? 'Veg';
    const itemFlavour = dishRaw.itemFlavour ? str(dishRaw.itemFlavour) : undefined;
    const itemServingType = dishRaw.itemServingType ? str(dishRaw.itemServingType) : undefined;
    const preparationTime = typeof dishRaw.preparationTime === 'number' ? dishRaw.preparationTime : undefined;
    const itemDescription = dishRaw.itemDescription ? str(dishRaw.itemDescription) : undefined;
    const spicyLevel = typeof dishRaw.spicyLevel === 'number' ? dishRaw.spicyLevel : undefined;
    const servesTo = typeof dishRaw.servesTo === 'number' ? dishRaw.servesTo : undefined;
    const tasteOfRegion = dishRaw.tasteOfRegion ? str(dishRaw.tasteOfRegion) : undefined;
    const kitchens = Array.isArray(dishRaw.kitchens) ? (dishRaw.kitchens as Record<string, unknown>[]) : [];
    for (const k of kitchens) {
      flattened.push({
        _id: str(k._id),
        foodItemId,
        itemName,
        imageUrl,
        itemType,
        itemFlavour,
        itemDescription,
        spicyLevel,
        servesTo,
        tasteOfRegion,
        itemPrice: num(k.itemPrice),
        sellPrice: num(k.sellPrice),
        maxItemPrice: typeof k.maxItemPrice === 'number' ? k.maxItemPrice : undefined,
        availableQuantity: typeof k.availableQuantity === 'number' ? k.availableQuantity : undefined,
        quantityBooked: typeof k.quantityBooked === 'number' ? k.quantityBooked : undefined,
        itemAvailable: k.itemAvailable !== false,
        moq: typeof k.moq === 'number' ? k.moq : undefined,
        mealSlots: Array.isArray(k.mealSlots) ? (k.mealSlots as MealType[]) : [],
        // Genuinely absent (not just empty) for Instant/Advance rows — see ApartmentMenuFoodItem.
        activeMealSlots: Array.isArray(k.activeMealSlots) ? (k.activeMealSlots as MealType[]) : undefined,
        advanceDeliverySlots: Array.isArray(k.advanceDeliverySlots) ? (k.advanceDeliverySlots as AdvanceDeliverySlot[]) : undefined,
        // A kitchen row's own preparationTime wins over the dish-level default.
        preparationTime: typeof k.preparationTime === 'number' ? k.preparationTime : preparationTime,
        itemServingType,
        servingQuantity: typeof k.servingQuantity === 'number' ? k.servingQuantity : undefined,
        servingQuantityUnit: k.servingQuantityUnit ? str(k.servingQuantityUnit) : undefined,
        kitchenId: str(k.kitchenId),
        kitchenName: str(k.kitchenName),
        isActive: k.isActive === true,
      });
    }
  }
  return flattened;
}

/** Server-side filter/pagination params for the three merged menu fetches below (distinct from `ApartmentKitchenFilters`, used by `loadEligibleKitchens`). */
export interface ApartmentMenuFetchOptions {
  page?: number;
  limit?: number;
  /** Comma-joined server-side; restricts the candidate kitchen list itself, not a post-hoc filter. */
  kitchenIds?: string[];
  /** Kitchen must support this mode for this menu type; `'both'`/omitted excludes no kitchen. */
  deliveryMode?: 'selfpickup' | 'delivery' | 'both';
  /** `'all'`/omitted = no filter. `jain` is its own category, not folded into `veg`. */
  itemType?: 'veg' | 'nonveg' | 'jain' | 'all';
  /** Free-text, case-insensitive substring match against `tasteOfRegion` (not an item-name search). */
  region?: string;
  /** Today only — server ignores this for Instant/Advance. Case-sensitive, must match `Breakfast`/`Lunch`/`HighTea`/`Dinner` exactly. */
  mealSlot?: MealType;
}

const ITEM_TYPES: readonly NonNullable<ApartmentMenuFetchOptions['itemType']>[] = ['veg', 'nonveg', 'jain', 'all'];
const DELIVERY_MODES: readonly NonNullable<ApartmentMenuFetchOptions['deliveryMode']>[] = ['selfpickup', 'delivery', 'both'];
const MEAL_SLOTS: readonly MealType[] = ['Breakfast', 'Lunch', 'HighTea', 'Dinner'];

/** Query string for the three fetches below. Invalid `itemType`/`deliveryMode`/`mealSlot` are dropped rather than sent. */
function menuQueryString(options?: ApartmentMenuFetchOptions): string {
  if (!options) return '';
  const params = new URLSearchParams();
  if (options.page !== undefined) params.set('page', String(options.page));
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.kitchenIds?.length) params.set('kitchenIds', options.kitchenIds.join(','));
  if (options.deliveryMode) {
    const mode = options.deliveryMode.toLowerCase() as ApartmentMenuFetchOptions['deliveryMode'];
    if (mode && DELIVERY_MODES.includes(mode)) params.set('deliveryMode', mode);
  }
  if (options.itemType) {
    const type = options.itemType.toLowerCase() as ApartmentMenuFetchOptions['itemType'];
    if (type && ITEM_TYPES.includes(type)) params.set('itemType', type);
  }
  if (options.region?.trim()) params.set('region', options.region.trim());
  if (options.mealSlot && MEAL_SLOTS.includes(options.mealSlot)) params.set('mealSlot', options.mealSlot);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Stable cache-key suffix for a set of fetch options — fixed field order (not `JSON.stringify`) so the same filters hash the same. */
function menuCacheKeySuffix(options?: ApartmentMenuFetchOptions): string {
  if (!options) return '';
  return [
    options.page ?? '',
    options.limit ?? '',
    (options.kitchenIds ?? []).join(','),
    options.deliveryMode ?? '',
    options.itemType ?? '',
    options.region ?? '',
    options.mealSlot ?? '',
  ].join(':');
}

/** Shared response shape for all three merged menu fetches — the server always wraps in `meta`. */
export interface ApartmentMenuMeta {
  currentPage: number;
  totalPages: number;
  totalActive: number;
  totalInactive: number;
  totalItems: number;
  /** One combined flag — active+inactive are paginated as a single ordered list (active first). */
  hasNextPage: boolean;
}

export interface ApartmentGroupedMenuResponse {
  apartmentId: string;
  activeItems: ApartmentMenuFoodItem[];
  inactiveItems: ApartmentMenuFoodItem[];
  meta: ApartmentMenuMeta;
}

/** Type aliases, not fresh interfaces — Today/Instant/Advance are byte-for-byte the same wire shape. */
export type ApartmentTodayMenuResponse = ApartmentGroupedMenuResponse;
export type ApartmentInstantMenuResponse = ApartmentGroupedMenuResponse;
export type ApartmentAdvanceMenuResponse = ApartmentGroupedMenuResponse;

/** Parses one of the three merged-menu responses; returns `null` (never throws) for anything not matching the contract, including a missing `meta`. */
function parseApartmentGroupedMenuResponse(raw: unknown): ApartmentGroupedMenuResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const metaRaw = obj.meta;
  if (!metaRaw || typeof metaRaw !== 'object') return null;
  const meta = metaRaw as Record<string, unknown>;
  return {
    apartmentId: str(obj.apartmentId),
    activeItems: normalizeGroupedFoodItemList(obj.activeItems),
    inactiveItems: normalizeGroupedFoodItemList(obj.inactiveItems),
    meta: {
      currentPage: typeof meta.currentPage === 'number' ? meta.currentPage : 1,
      totalPages: typeof meta.totalPages === 'number' ? meta.totalPages : 1,
      totalActive: typeof meta.totalActive === 'number' ? meta.totalActive : 0,
      totalInactive: typeof meta.totalInactive === 'number' ? meta.totalInactive : 0,
      totalItems: typeof meta.totalItems === 'number' ? meta.totalItems : 0,
      hasNextPage: meta.hasNextPage === true,
    },
  };
}

/** Resolves every kitchen linked to this apartment, deduped by dish, with eligibility pre-computed server-side. Never throws — `null` on failure. */
export async function loadApartmentTodayMenu(apartmentId: string, options?: ApartmentMenuFetchOptions): Promise<ApartmentGroupedMenuResponse | null> {
  return runtimeCacheInterceptor(
    `APARTMENT_TODAY_MENU:${apartmentId}:${menuCacheKeySuffix(options)}`,
    async () => {
      try {
        const raw = await http.get<Record<string, unknown>>(`${ENDPOINTS.apartment.todayMenu}/${apartmentId}${menuQueryString(options)}`);
        const parsed = parseApartmentGroupedMenuResponse(raw);
        if (!parsed) {
          // 200 with an unrecognized body — log (don't throw) so contract drift is visible in dev.
          console.warn('[apartment] getApartmentTodayMenu: response did not match the expected shape', raw);
        }
        return parsed;
      } catch (error) {
        console.warn('[apartment] getApartmentTodayMenu failed', error);
        return null;
      }
    },
    45_000,
  );
}

/** Instant's counterpart of `loadApartmentTodayMenu` — no meal-slot dimension; never pass `mealSlot` here. */
export async function loadApartmentInstantMenu(apartmentId: string, options?: ApartmentMenuFetchOptions): Promise<ApartmentGroupedMenuResponse | null> {
  return runtimeCacheInterceptor(
    `APARTMENT_INSTANT_MENU:${apartmentId}:${menuCacheKeySuffix(options)}`,
    async () => {
      try {
        const raw = await http.get<Record<string, unknown>>(`${ENDPOINTS.apartment.instantMenu}/${apartmentId}${menuQueryString(options)}`);
        const parsed = parseApartmentGroupedMenuResponse(raw);
        if (!parsed) {
          console.warn('[apartment] getApartmentInstantMenu: response did not match the expected shape', raw);
        }
        return parsed;
      } catch (error) {
        console.warn('[apartment] getApartmentInstantMenu failed', error);
        return null;
      }
    },
    45_000,
  );
}

/** Advance's counterpart above — active means stock + itemAvailable only, date-agnostic by design; never pass `mealSlot` here either. */
export async function loadApartmentAdvanceMenu(apartmentId: string, options?: ApartmentMenuFetchOptions): Promise<ApartmentGroupedMenuResponse | null> {
  return runtimeCacheInterceptor(
    `APARTMENT_ADVANCE_MENU:${apartmentId}:${menuCacheKeySuffix(options)}`,
    async () => {
      try {
        const raw = await http.get<Record<string, unknown>>(`${ENDPOINTS.apartment.advanceMenu}/${apartmentId}${menuQueryString(options)}`);
        const parsed = parseApartmentGroupedMenuResponse(raw);
        if (!parsed) {
          console.warn('[apartment] getApartmentAdvanceMenu: response did not match the expected shape', raw);
        }
        return parsed;
      } catch (error) {
        console.warn('[apartment] getApartmentAdvanceMenu failed', error);
        return null;
      }
    },
    45_000,
  );
}

// ── 2. Eligible kitchens for one order type ────────────────────────────────

function normalizeKitchen(raw: Record<string, unknown>): ApartmentKitchen {
  const info = raw.apartmentInfo as Record<string, unknown> | undefined;
  const settings = raw.apartmentSettings as Record<string, unknown> | undefined;
  return {
    _id: str(raw._id),
    kitchenName: str(raw.kitchenName),
    imageUrl: resolveImage(raw.imageUrl),
    rating: typeof raw.rating === 'number' ? raw.rating : undefined,
    kitchenOpened: raw.kitchenOpened !== false,
    mealType: Array.isArray(raw.mealType) ? (raw.mealType as string[]) : undefined,
    cuisine: raw.speciality ? str(raw.speciality) : raw.mainSpeciality ? str(raw.mainSpeciality) : undefined,
    mealTiming: Array.isArray(raw.mealTiming) ? (raw.mealTiming as ApartmentKitchen['mealTiming']) : undefined,
    apartmentInfo: info?.apartmentId ? { apartmentId: str(info.apartmentId), apartmentName: info.apartmentName ? str(info.apartmentName) : undefined } : undefined,
    apartmentSettings: settings as ApartmentKitchen['apartmentSettings'],
    distance: typeof raw.distance === 'number' ? raw.distance : undefined,
    address: raw.address as ApartmentKitchen['address'],
  };
}

/** Eligible kitchens for one order type, server-filtered. Fans out across pages since the server filters AFTER its own `$skip`/`$limit`. */
export async function loadEligibleKitchens(
  apartmentId: string,
  orderType: OrderType,
  lng: number,
  lat: number,
  itemServingDate?: string,
  kitchenFilters?: ApartmentKitchenFilters,
): Promise<ApartmentKitchen[]> {
  const cacheKey = `APARTMENT_ELIGIBLE_KITCHENS:${apartmentId}:${orderType}:${lng}:${lat}:${itemServingDate ?? ''}:${(kitchenFilters?.cuisines ?? []).join(',')}:${(kitchenFilters?.kitchenIds ?? []).join(',')}:${kitchenFilters?.deliveryType ?? ''}`;
  return runtimeCacheInterceptor(
    cacheKey,
    async () => {
      const MAX_PAGES = 3;
      const requestPage = (page: number) =>
        http.post<Record<string, unknown>[]>(`${ENDPOINTS.apartment.nearestKitchensOfApartment}/${page}/${lng}/${lat}`, {
          apartmentId,
          orderType,
          itemServingDate,
          cuisines: kitchenFilters?.cuisines,
          kitchenIds: kitchenFilters?.kitchenIds,
          deliveryType: kitchenFilters?.deliveryType,
        });
      const toKitchens = (raw: unknown) => (Array.isArray(raw) ? raw : []).map(normalizeKitchen);

      const all: ApartmentKitchen[] = [];
      // Page 1 alone first (most apartments have <20 kitchens); pages 2/3 only fetched if page 1 shows there are that many.
      const page1 = await requestPage(1).catch((error: unknown) => {
        throw error; // a real failure — don't cache it as an empty answer
      });
      const list1 = toKitchens(page1);
      all.push(...list1);
      if (list1.length < 20) return all; // short page — nothing more to fetch

      const [page2, page3] = await Promise.allSettled(Array.from({ length: MAX_PAGES - 1 }, (_, i) => requestPage(i + 2)));
      if (page2.status !== 'fulfilled') return all; // at least page 1 succeeded — degrade to that partial list, same as before
      const list2 = toKitchens(page2.value);
      all.push(...list2);
      if (list2.length < 20 || page3.status !== 'fulfilled') return all;
      all.push(...toKitchens(page3.value));
      return all;
    },
    45_000,
  );
}

/** Plain by-id kitchen lookup with no eligibility filter — fallback source when `loadEligibleKitchens` excludes a kitchen. `null` on failure. */
export async function loadKitchenById(kitchenId: string): Promise<ApartmentKitchen | null> {
  try {
    const raw = await http.get<Record<string, unknown>>(`${ENDPOINTS.onDemand.kitchenProfile}/${kitchenId}`);
    return raw ? normalizeKitchen(raw) : null;
  } catch {
    return null;
  }
}

// ── 3. Daily menu (Today + a kitchen's own curated Instant/Advance dishes) ─

function normalizeMenuItem(raw: Record<string, unknown>): ApartmentMenuItem {
  return {
    _id: str(raw._id),
    itemId: str(raw._id), // daily items: _id IS the itemId the order/stock contract needs
    itemName: str(raw.itemName),
    imageUrl: resolveImage(raw.imageUrl),
    itemType: (raw.itemType as 'Veg' | 'NonVeg' | 'Jain') ?? 'Veg',
    itemServingDate: str(raw.itemServingDate),
    mealType: raw.mealType as MealType | undefined,
    itemPrice: num(raw.itemPrice),
    itemDescription: raw.itemDescription ? str(raw.itemDescription) : undefined,
    tasteOfRegion: raw.tasteOfRegion ? str(raw.tasteOfRegion) : undefined,
    servesTo: typeof raw.servesTo === 'number' ? raw.servesTo : undefined,
    quantityAvailable: typeof raw.quantityAvailable === 'number' ? raw.quantityAvailable : undefined,
    quantityBooked: typeof raw.quantityBooked === 'number' ? raw.quantityBooked : undefined,
    preparationTime: typeof raw.preparationTime === 'number' ? raw.preparationTime : undefined,
    tags: Array.isArray(raw.tags) ? (raw.tags as ApartmentMenuItem['tags']) : [],
    pairedItemIds: Array.isArray(raw.pairedItemIds) ? raw.pairedItemIds.map(str) : [],
  };
}

/** Meal types still inside today's cutoff for this kitchen. Empty means past cutoff or unconfigured — treated as "nothing orderable". */
export async function loadOrderableMealTypes(kitchenId: string): Promise<MealType[]> {
  try {
    const list = await http.get<string[]>(`${ENDPOINTS.apartment.orderableMealTypes}/${kitchenId}/orderableMealTypes`);
    return Array.isArray(list) ? (list as MealType[]) : [];
  } catch {
    return [];
  }
}

/** Same-kitchen pairing suggestions for one item (older apartmentMenu.model.js collection, Advance-only in practice); filters to today's date client-side. */
export async function loadRecommendations(
  kitchenId: string,
  itemId: string,
  todayIso: string,
  menuType?: 'instant' | 'advance',
): Promise<ApartmentMenuItem[]> {
  try {
    const qs = menuType ? `?menuType=${menuType}` : '';
    const raw = await http.get<Record<string, unknown>[]>(
      `${ENDPOINTS.apartment.recommendations}/${kitchenId}/item/${itemId}/recommendations${qs}`,
    );
    const list = Array.isArray(raw) ? raw : [];
    // A standing (shared-catalog) item has no itemServingDate — passes through untouched.
    return list.map(normalizeMenuItem).filter((item) => !item.itemServingDate || item.itemServingDate.slice(0, 10) === todayIso);
  } catch {
    return [];
  }
}

/** `loadRecommendations`'s counterpart for the buy/sell flow. Maps `sellPrice` (never BUY `itemPrice`) onto `itemPrice`; inactive forces qty fields to 0. */
export async function loadItemPairings(kitchenId: string, type: 'today' | 'instant' | 'advance', itemId: string, servingDate: string): Promise<ApartmentMenuItem[]> {
  try {
    const raw = await http.get<Record<string, unknown>[]>(
      `${ENDPOINTS.apartment.kitchenTypeMenuRecommendations}/${kitchenId}/${type}/items/${itemId}/recommendations`,
    );
    const list = Array.isArray(raw) ? raw : [];
    return list.map((item) => {
      const forcedInactive = item.isActive !== true;
      const mealSlots = Array.isArray(item.mealSlots) ? (item.mealSlots as MealType[]) : [];
      return {
        _id: str(item._id),
        itemId: str(item._id),
        itemName: str(item.itemName),
        imageUrl: resolveImage(item.imageUrl),
        itemType: (item.itemType as 'Veg' | 'NonVeg' | 'Jain') ?? 'Veg',
        itemServingDate: servingDate,
        mealType: mealSlots[0],
        itemPrice: num(item.sellPrice),
        itemDescription: item.itemDescription ? str(item.itemDescription) : undefined,
        tasteOfRegion: item.tasteOfRegion ? str(item.tasteOfRegion) : undefined,
        servesTo: typeof item.servesTo === 'number' ? item.servesTo : undefined,
        quantityAvailable: forcedInactive ? 0 : typeof item.availableQuantity === 'number' ? item.availableQuantity : undefined,
        quantityBooked: forcedInactive ? 0 : typeof item.quantityBooked === 'number' ? item.quantityBooked : undefined,
        preparationTime: typeof item.preparationTime === 'number' ? item.preparationTime : undefined,
        moq: typeof item.moq === 'number' ? item.moq : undefined,
        tags: [type],
        pairedItemIds: Array.isArray(item.pairedItemIds) ? item.pairedItemIds.map(str) : undefined,
      };
    });
  } catch {
    return [];
  }
}

// ── 4. The shared 1,700-item standard catalog (Instant/Advance) ───────────

export async function loadStandardMenuItems(
  menuType?: 'instant' | 'advance',
  filters?: ApartmentItemFilters,
): Promise<ApartmentStandardMenuItem[]> {
  try {
    const path = menuType ? `${ENDPOINTS.apartment.standardMenuItems}/${menuType}` : ENDPOINTS.apartment.standardMenuItems;
    const raw = await http.get<Record<string, unknown>[]>(`${path}${itemFilterQuery(filters)}`);
    return Array.isArray(raw)
      ? raw.map((item) => ({
          _id: str(item._id),
          itemName: str(item.itemName),
          imageUrl: resolveImage(item.imageUrl),
          itemDescription: item.itemDescription ? str(item.itemDescription) : undefined,
          itemType: (item.itemType as 'Veg' | 'NonVeg' | 'Jain') ?? 'Veg',
          itemPrice: num(item.itemPrice),
          menuTypes: Array.isArray(item.menuTypes)
            ? (item.menuTypes as ApartmentStandardMenuItem['menuTypes'])
            : item.menuType
              ? [item.menuType as ApartmentStandardMenuItem['menuTypes'][number]]
              : [],
          advanceLeadDays: typeof item.advanceLeadDays === 'number' ? item.advanceLeadDays : undefined,
          // Server field is `estimatedTime`; renamed to `preparationTime` for consistency with daily-item/offer fields of the same name.
          preparationTime: typeof item.estimatedTime === 'number' ? item.estimatedTime : undefined,
          mealType: item.mealType as MealType | undefined,
          cuisines: Array.isArray(item.cuisines) ? item.cuisines.map(str) : undefined,
          bannerImages: resolveImages(item.bannerImages),
          bannerVideos: resolveVideos(item.bannerVideos),
        }))
      : [];
  } catch {
    return [];
  }
}

export async function loadStandardMenuSelections(kitchenIds: string[]): Promise<StandardMenuSelection[]> {
  if (kitchenIds.length === 0) return [];
  try {
    const raw = await http.post<Record<string, unknown>[]>(ENDPOINTS.apartment.standardMenuSelections, { kitchenIds });
    return Array.isArray(raw)
      ? raw.map((row) => ({
          kitchenId: str(row.kitchenId),
          kitchenOpened: row.kitchenOpened !== false,
          selections: Array.isArray(row.standardMenuSelections)
            ? (row.standardMenuSelections as Record<string, unknown>[])
                .filter((s) => s.menuType !== 'today') // never surface a 'today' standing selection
                .map((s) => ({
                  itemId: str(s.itemId),
                  menuType: s.menuType as StandardMenuSelection['selections'][number]['menuType'],
                  advanceLeadDays: typeof s.advanceLeadDays === 'number' ? s.advanceLeadDays : undefined,
                  // Root-cause fix: removed `preparationTime` here — a kitchen's opt-in sub-doc never had this field server-side (unlike advanceLeadDays/instantQty); prep time is the shared catalog's own admin-set value (see loadStandardMenuItems/mergeStandardCatalog), so mapping a field the server never sends just masked the real bug with `undefined`.
                  instantQty: typeof s.instantQty === 'number' ? s.instantQty : undefined,
                  instantQtyBookedToday: typeof s.instantQtyBookedToday === 'number' ? s.instantQtyBookedToday : undefined,
                  instantQtyBookedDate: typeof s.instantQtyBookedDate === 'string' ? s.instantQtyBookedDate : undefined,
                }))
            : [],
        }))
      : [];
  } catch {
    return [];
  }
}

// ── 5. Checkout ─────────────────────────────────────────────────────────────

export interface ApartmentOrderItemInput {
  /** The `ApartmentMenu.itemList` subdoc id (daily) or `ApartmentStandardMenu` catalog id (standing) — drives stock booking, never client-minted. */
  _id: string;
  itemId: string;
  itemName: string;
  itemPrice: number;
  count: number;
  itemType?: string;
  mealType?: string;
  /** Include on EVERY line or on NONE — a partial mix makes the server's one-kitchen guard misfire. */
  kitchenId?: string;
  isStandardMenu?: boolean;
  standingType?: 'instant' | 'advance';
  itemServingDate?: string;
  /** Overwritten by the server's own live menu data regardless — sent purely for payload parity. */
  imageUrl?: string;
  preparationTime?: number;
}

export interface CreateApartmentOrderInput {
  apartmentId: string;
  apartmentName?: string;
  wingName?: string;
  roomNumber?: string;
  /** Required for a delivery order, same as On Demand/Bulk already send. */
  customerLocation?: CustomerLocation;
  kitchenId?: string; // omit to let the server auto-assign
  kitchenName?: string;
  customerId: string;
  customerName: string;
  customerPhoneNo: string;
  orderType: OrderType;
  /** For Today, the per-item slot. For Advance, the resident's whole-order delivery-window pick (required by server) — from cart's slot choice, not a line's offer. */
  mealType?: MealType;
  itemServingDate?: string; // required for advance
  fulfillmentMode: 'delivery' | 'pickup';
  itemList: ApartmentOrderItemInput[];
  /** Computed by `bill.ts`'s `computeApartmentCharges`; server trusts the client here, unlike `deliveryCharges`/`taxes` which are always server-recomputed. */
  packagingCharges?: number;
  /** Config-driven, computed by `bill.ts`'s `computeApartmentCharges` alongside `cgst`/`sgst`/`*GST` below. */
  platformCharges?: number;
  discount?: number;
  /** GST computed client-side via `bill.ts`'s `computeApartmentCharges`; `cgst`/`sgst` are the two halves of item-amount GST, `packagingChargesGST` is GST on `packagingCharges`. */
  cgst?: number;
  sgst?: number;
  deliveryChargesGST?: number;
  packagingChargesGST?: number;
  platformChargesGST?: number;
  /** Mealawe Wallet redemption, validated & debited at placement time; when checkout splits across groups, callers must split this so the sum matches the intended redemption. */
  moneyWalletPointsUsed?: number;
  /** Mealawe cashback redemption — same "split across groups" rule as `moneyWalletPointsUsed`. */
  mealaweWalletPointsUsed?: number;
}

/** A parsed `CODE: human message` error from the apartment order pipeline (e.g. NO_ELIGIBLE_KITCHEN); some rejections are a plain string with no code. */
export interface ApartmentOrderError {
  code?: string;
  message: string;
}

export function parseApartmentOrderError(error: unknown): ApartmentOrderError {
  const message = error instanceof HttpError ? error.message : error instanceof Error ? error.message : 'Something went wrong';
  const match = /^([A-Z][A-Z_]+):\s*(.+)$/.exec(message);
  return match ? { code: match[1], message: match[2] } : { message };
}

/** Server's `orderType` enum is prefixed (`apartment_today`, ...) but item-level vocabulary stays bare — only order create/lookup needs translating. */
const APARTMENT_ORDER_TYPE_PREFIX = 'apartment_';

function toWireOrderType(type: OrderType): string {
  return `${APARTMENT_ORDER_TYPE_PREFIX}${type}`;
}

function fromWireOrderType(raw: unknown): OrderType {
  const s = typeof raw === 'string' ? raw : '';
  return (s.startsWith(APARTMENT_ORDER_TYPE_PREFIX) ? s.slice(APARTMENT_ORDER_TYPE_PREFIX.length) : s) as OrderType;
}

function normalizeApartmentOrder(raw: Record<string, unknown>): ApartmentOrder {
  return { ...raw, orderType: fromWireOrderType(raw.orderType) } as unknown as ApartmentOrder;
}

/** Today/Instant/Advance — the JusPay-gated counterpart to `createApartmentOrder`. Cashback is deliberately not accepted here — only wallet gates the charge, so forwarding cashback would silently overcharge. */
export function toApartmentItemForOrder(items: ApartmentOrderItemInput[]): ApartmentItemForOrder[] {
  return items.map((l) => ({
    _id: l._id,
    itemId: l.itemId,
    itemName: l.itemName,
    itemPrice: l.itemPrice,
    count: l.count,
    itemType: l.itemType,
    mealType: l.mealType,
    kitchenId: l.kitchenId,
    isStandardMenu: l.isStandardMenu,
    standingType: l.standingType,
    itemServingDate: l.itemServingDate,
    imageUrl: l.imageUrl,
    preparationTime: l.preparationTime,
  }));
}

export interface ApartmentQuote {
  itemAmount: number;
  deliveryCharges: number;
  taxes: number;
  payableAmount: number;
}

/** Real, server-computed price for a `startApartmentPayment` call (gross, wallet/cashback omitted); call before capping wallet/cashback. `null` on failure. */
export async function quoteApartmentOrder(
  input: Omit<CreateApartmentOrderInput, 'orderType' | 'moneyWalletPointsUsed' | 'mealaweWalletPointsUsed'> & {
    orderType: 'today' | 'instant' | 'advance';
  },
): Promise<ApartmentQuote | null> {
  try {
    const body = {
      apartmentId: input.apartmentId,
      apartmentName: input.apartmentName,
      wingName: input.wingName,
      roomNumber: input.roomNumber,
      customerLocation: input.customerLocation,
      kitchenId: input.kitchenId,
      kitchenName: input.kitchenName,
      customerId: input.customerId,
      itemServingDate: input.itemServingDate,
      fulfillmentMode: input.fulfillmentMode,
      itemList: toApartmentItemForOrder(input.itemList),
      packagingCharges: input.packagingCharges,
      platformCharges: input.platformCharges,
      discount: input.discount,
      // Same GST fields/source as startApartmentPayment — omitting these would silently under-quote.
      cgst: input.cgst,
      sgst: input.sgst,
      deliveryChargesGST: input.deliveryChargesGST,
      packagingChargesGST: input.packagingChargesGST,
      platformChargesGST: input.platformChargesGST,
      // Matches startApartmentPayment's own dispatch marker — the quote route branches on this exact same value.
      orderType: 'apartment',
    };
    const raw = await http.post<ApartmentQuote>(ENDPOINTS.apartment.quote, body);
    return raw ?? null;
  } catch {
    return null;
  }
}

/** Server-computed "ready in ~N min" estimate for Instant cart contents — same calc the server runs at placement, just run early. `null` on failure. */
export async function loadInstantFulfillmentEstimate(kitchenId: string, itemIds: string[]): Promise<number | null> {
  if (!kitchenId || itemIds.length === 0) return null;
  try {
    const raw = await http.post<{ minutes?: number }>(ENDPOINTS.apartment.estimateFulfillment, { kitchenId, itemIds });
    return typeof raw?.minutes === 'number' ? raw.minutes : null;
  } catch {
    return null;
  }
}

export async function loadOrderHistory(customerId: string, orderType?: OrderType): Promise<ApartmentOrder[]> {
  try {
    const query = orderType ? `?orderType=${toWireOrderType(orderType)}` : '';
    const raw = await http.get<Record<string, unknown>[]>(`${ENDPOINTS.apartment.ordersByCustomer}/${customerId}${query}`);
    return Array.isArray(raw) ? raw.map(normalizeApartmentOrder) : [];
  } catch {
    return [];
  }
}

/** `GET .../:orderId` never 404s — a missing order comes back as a 500 ("order not found"), treated here as `null`. */
export async function loadOrderById(orderId: string): Promise<ApartmentOrder | null> {
  try {
    const raw = await http.get<Record<string, unknown>>(`${ENDPOINTS.apartment.orderById}/${orderId}`);
    return normalizeApartmentOrder(raw);
  } catch (error) {
    if (error instanceof HttpError && error.message === 'order not found') return null;
    throw error;
  }
}

/** Resident's "Mark complete" action. Only valid once at `readyToDelivery` (server re-checks, throws NOT_READY_TO_DELIVER otherwise); returns the updated order. */
export async function markApartmentOrderDelivered(orderId: string, customerId: string): Promise<ApartmentOrder> {
  const raw = await http.put<Record<string, unknown>>(`${ENDPOINTS.apartment.markDelivered}/${orderId}/markDelivered`, { customerId });
  return normalizeApartmentOrder(raw);
}

/** Resolves a parent order id (from `startApartmentPayment`) to the real orderNo-bearing child order(s); call only after payment resolves 'success'. `[]` on failure. */
export async function loadOrdersByParent(parentOrderId: string): Promise<ApartmentOrder[]> {
  try {
    const raw = await http.get<Record<string, unknown>[]>(`${ENDPOINTS.apartment.ordersByParent}/${parentOrderId}`);
    return Array.isArray(raw) ? raw.map(normalizeApartmentOrder) : [];
  } catch {
    return [];
  }
}

/** A kitchen's address for the "View order" self-pickup case (orders only carry kitchenName/kitchenId); reuses on-demand's generic KitchenPartner-by-id lookup. */
export async function loadKitchenAddress(kitchenId: string): Promise<string | null> {
  try {
    const raw = await http.get<Record<string, unknown>>(`${ENDPOINTS.onDemand.kitchenProfile}/${kitchenId}`);
    const addr = raw?.address as Record<string, unknown> | undefined;
    const parts = [addr?.address1, addr?.address2, addr?.landmark].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
    return parts.length ? parts.join(', ') : null;
  } catch {
    return null;
  }
}

/** `estimatedFulfillmentMinutes` is Instant-only server-side, so Today orders read `apartmentSettings.todaySubTypes[mealType].prepEndTime` instead. `null` on failure/unconfigured. */
export async function loadKitchenTodayPrepEndTime(kitchenId: string, mealType: string): Promise<string | null> {
  try {
    const raw = await http.get<Record<string, unknown>>(`${ENDPOINTS.onDemand.kitchenProfile}/${kitchenId}`);
    const settings = raw?.apartmentSettings as Record<string, unknown> | undefined;
    const todaySubTypes = settings?.todaySubTypes as Record<string, Record<string, unknown>> | undefined;
    const prepEndTime = todaySubTypes?.[mealType]?.prepEndTime;
    return typeof prepEndTime === 'string' && prepEndTime ? prepEndTime : null;
  } catch {
    return null;
  }
}

/** Server-computed price for one payment bucket (the body from `buildApartmentQuoteBody`). `null` on any failure — callers fall back to the local estimate. */
export async function quoteBucket(body: Record<string, unknown>): Promise<ApartmentQuote | null> {
  try {
    const raw = await http.post<ApartmentQuote>(ENDPOINTS.apartment.quote, body);
    return raw ?? null;
  } catch {
    return null;
  }
}

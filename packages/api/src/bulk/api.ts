import { session } from '../session';
import { ENDPOINTS, http, getCoreConfig, type SubscriptionCoupon, type OrderSummary, type BulkCategory, type BulkMenuItem, type BulkMenuResponse, type BulkOrderType, type BulkPackaging } from '@mealawe/core';
import { mapOrder } from '../orders/api';


/** Bug fix ("bulk menu images not showing"): the backend's real field is
 * `imageUrl` (confirmed against MealaweUserApp's `item-card.component.html:41`
 * — `[src]="imageUrl + item.imageUrl"`), not `itemImage` — this used to read a
 * field the server never sends, so it was always `undefined`. The raw value
 * is also a relative path, never a full URL (same `env.imageUrl` CDN-prefix
 * convention already used by the apartment/on-demand features' own
 * `resolveImage`), so it still needs prefixing even once read correctly. */
function resolveImage(path: unknown): string | undefined {
  return typeof path === 'string' && path ? `${getCoreConfig().serverUrl}/images/${path}` : undefined;
}

function normalizeItem(raw: Record<string, unknown>): BulkMenuItem {
  const slab1 = Number(raw.slab1Price ?? raw.itemPrice ?? 0);
  // Backend field is `itemType: 'Veg' | 'NonVeg' | 'Jain'` (verified against
  // item-card.component.html, the reference's shared item template — the
  // bulk-specific templates only ever check 'Veg'/'NonVeg' and silently
  // render nothing for 'Jain', a gap this app doesn't repeat, see
  // `ItemDietMark`). `isVeg` is true for both 'Veg' and 'Jain' — Jain is a
  // stricter vegetarian subtype, never non-veg — so filtering/grouping that
  // reads `isVeg` (the Veg/Non-Veg chips, the custom food box's veg/non-veg
  // bucket fallback) correctly includes Jain items under "veg".
  const itemType = (['Veg', 'NonVeg', 'Jain'] as const).find(
    (t) => t.toLowerCase() === String(raw.itemType ?? '').toLowerCase(),
  ) ?? 'Veg';
  return {
    _id: String(raw._id ?? raw.id ?? ''),
    itemName: String(raw.itemName ?? raw.name ?? ''),
    itemImage: resolveImage(raw.imageUrl),
    isVeg: itemType !== 'NonVeg',
    itemType,
    itemPrice: Number(raw.itemPrice ?? slab1),
    slab1Price: slab1,
    slab2Price: Number(raw.slab2Price ?? slab1),
    slab3Price: Number(raw.slab3Price ?? raw.slab2Price ?? slab1),
    slab4Price: Number(raw.slab4Price ?? raw.slab3Price ?? slab1),
    itemDescription: raw.itemDescription ? String(raw.itemDescription) : undefined,
    group: raw.group ? String(raw.group) : undefined,
  };
}

function normalizeMenu(raw: Record<string, unknown>): BulkMenuResponse {
  const itemList = Array.isArray(raw.itemList)
    ? (raw.itemList as Record<string, unknown>[]).map(normalizeItem)
    : [];
  return {
    moq: Number(raw.moq ?? 1),
    slabLimit1: Number(raw.slabLimit1 ?? 0),
    slabLimit2: Number(raw.slabLimit2 ?? 0),
    slabLimit3: Number(raw.slabLimit3 ?? 0),
    dateLimit1: Number(raw.dateLimit1 ?? 0),
    dateLimit2: Number(raw.dateLimit2 ?? 0),
    dateLimit3: Number(raw.dateLimit3 ?? 0),
    deliverySlab1: Number(raw.deliverySlab1 ?? 0),
    deliverySlab2: Number(raw.deliverySlab2 ?? 0),
    deliverySlab3: Number(raw.deliverySlab3 ?? 0),
    deliverySlab4: Number(raw.deliverySlab4 ?? 0),
    packagingCharges: Number(raw.packagingCharges ?? 0),
    platformCharges: Number(raw.platformCharges ?? 0),
    itemList,
  };
}

/**
 * `/api/fetchBulkMenu/:category` path segment per category + packaging mode.
 * Verified against MealaweUserApp's actual call sites (`bulk-meals`, `bulk-snacks`,
 * `foodbox` components) — every category goes through this one endpoint.
 */
const CATEGORY_SEGMENT: Record<BulkCategory, Record<BulkPackaging, BulkOrderType>> = {
  meals: { individual: 'individualMeals', bulk: 'bulkMeals' },
  snacks: { individual: 'individualSnacks', bulk: 'bulkSnacks' },
  foodbox: { individual: 'predefinedSnackbox', bulk: 'customSnackbox' },
};

/** The backend's `orderType` for a category + packaging mode — the exact
 * same mapping the menu-fetch path segment uses (see `CATEGORY_SEGMENT`),
 * also what `startBulkJusPayPaymentProcess` expects. */
export function bulkOrderType(category: BulkCategory, packaging: BulkPackaging): BulkOrderType {
  return CATEGORY_SEGMENT[category][packaging];
}

/** Fetch a bulk menu for one category + packaging mode. Empty-safe on failure. */
export async function loadBulkMenu(
  category: BulkCategory,
  packaging: BulkPackaging,
): Promise<BulkMenuResponse | null> {
  try {
    const path = `${ENDPOINTS.bulk.fetchMenu}/${CATEGORY_SEGMENT[category][packaging]}`;
    const raw = await http.get<Record<string, unknown>>(path);
    return raw ? normalizeMenu(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Valid bulk-order coupons for the current cluster(s). Coupons are a single
 * customer-wide list (same endpoint as Subscription's `loadSubscriptionCoupons`)
 * tagged per order type — filtering for `'bulk'` here is all that differs.
 * Returns [] for guests / on error so callers can fall back.
 */
export async function loadBulkCoupons(): Promise<SubscriptionCoupon[]> {
  const clusters = session().getClusterIds();
  if (clusters.length === 0) {
    return [];
  }
  const profileId = session().getProfileId() ?? 'all';
  try {
    const list = await http.post<SubscriptionCoupon[]>(
      `${ENDPOINTS.subscription.validCoupons}/${profileId}`,
      { clusters },
    );
    if (!Array.isArray(list)) {
      return [];
    }
    return list
      .filter((c) => Array.isArray(c?.orderTypes) && c.orderTypes!.indexOf('bulk') > -1)
      .sort((a, b) => (b.seqWeightage || 0) - (a.seqWeightage || 0));
  } catch {
    return [];
  }
}

async function loadPastOrders(endpoint: string, page: number): Promise<OrderSummary[]> {
  const profileId = session().getProfileId();
  if (!profileId) return [];
  try {
    const raw = await http.get<unknown>(`${endpoint}/${profileId}/${page}`);
    return Array.isArray(raw) ? raw.map((o) => mapOrder(o as Record<string, unknown>)) : [];
  } catch {
    return [];
  }
}

export function loadBulkPastOrders(page = 1): Promise<OrderSummary[]> {
  return loadPastOrders(ENDPOINTS.bulk.pastOrders, page);
}

export function loadApartmentBulkPastOrders(page = 1): Promise<OrderSummary[]> {
  return loadPastOrders(ENDPOINTS.bulk.apartmentPastOrders, page);
}

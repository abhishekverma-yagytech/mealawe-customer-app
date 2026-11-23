import { session } from '../session';
import { ENDPOINTS, http, getCoreConfig, type SubscriptionCoupon, type OnDemandKitchen, type OnDemandMenuItem, type OnDemandMode } from '@mealawe/core';


/** Absolute URL for a backend image path — the legacy templates always
 * concatenate `environment.imageUrl + item.imageUrl`/`kitchen.imageUrl`
 * (confirmed in kitchen-card.component.html:5 and item-card.component.html:41);
 * the raw field itself is a relative path, never a full URL. */
function resolveImage(path: unknown): string | undefined {
  return typeof path === 'string' && path ? `${getCoreConfig().serverUrl}/images/${path}` : undefined;
}

function normalizeKitchen(raw: Record<string, unknown>): OnDemandKitchen {
  const offerRaw = raw.discountOffer as Record<string, unknown> | undefined;
  return {
    _id: String(raw._id ?? raw.id ?? ''),
    kitchenName: String(raw.kitchenName ?? raw.name ?? ''),
    imageUrl: resolveImage(raw.imageUrl),
    kitchenOpened: raw.kitchenOpened !== false,
    distance: typeof raw.distance === 'number' ? raw.distance : undefined,
    rating: typeof raw.rating === 'number' ? raw.rating : undefined,
    speciality: raw.speciality ? String(raw.speciality) : undefined,
    mainSpeciality: raw.mainSpeciality ? String(raw.mainSpeciality) : undefined,
    mealType: Array.isArray(raw.mealType) ? (raw.mealType as string[]) : undefined,
    discountOffer: offerRaw
      ? {
          discountType: offerRaw.discountType === 'flat' ? 'flat' : 'percentage',
          discountValue: Number(offerRaw.discountValue ?? 0),
          minAmount: offerRaw.minAmount !== undefined ? Number(offerRaw.minAmount) : undefined,
          maxLimit: offerRaw.maxLimit !== undefined ? Number(offerRaw.maxLimit) : undefined,
          startDate: String(offerRaw.startDate ?? ''),
          expiryDate: String(offerRaw.expiryDate ?? ''),
        }
      : undefined,
    preparationTime: typeof raw.preparationTime === 'number' ? raw.preparationTime : undefined,
  };
}

/**
 * `index` is the item's position in its source array — used ONLY as a last
 * resort when the server sends no `_id`/`id` at all (confirmed to happen for
 * real: at least one live `KitchenMenu` doc has every item subdocument
 * missing its Mongoose `_id`, apparently written by a path that bypassed
 * subdocument `_id` generation). Every card in the list shared the same `''`
 * id when that happened — `key={item._id}` collided, and `countFor`/`change`
 * (both keyed by `_id`) resolved every single item to the same cart line, so
 * adding one item bumped the quantity shown on all of them. The array order
 * is stable across a single fetch (same static list, un-reordered), so
 * `item-<index>` is stable enough to keep each item distinct for the
 * lifetime of one screen visit even against that broken data.
 */
function normalizeMenuItem(raw: Record<string, unknown>, index: number): OnDemandMenuItem {
  const itemType = String(raw.itemType ?? 'Veg') as 'Veg' | 'NonVeg' | 'Jain';
  return {
    _id: String(raw._id ?? raw.id ?? `item-${index}`),
    itemName: String(raw.itemName ?? ''),
    itemDescription: raw.itemDescription ? String(raw.itemDescription) : undefined,
    // Legacy field is `imageUrl` (item-card.component.html:41), not `itemImage`
    // — that name only exists in this app's unrelated bulk-menu item type.
    itemImage: resolveImage(raw.imageUrl),
    itemPrice: Number(raw.itemPrice ?? 0),
    // True for both 'Veg' and 'Jain' — Jain is a stricter vegetarian
    // subtype, never non-veg, so the VEG-only toggle (`ClusterMenuList`)
    // correctly keeps showing Jain items instead of hiding them.
    isVeg: itemType !== 'NonVeg',
    itemType,
    mealType: raw.mealType ? String(raw.mealType) : undefined,
    groupCategory: raw.groupCategory ? String(raw.groupCategory) : undefined,
    itemIsCombo: raw.itemIsCombo === true,
    serveDaily: raw.serveDaily === true,
    itemAvailable: raw.itemAvailable === true,
    quantityAvailable: typeof raw.quantityAvailable === 'number' ? raw.quantityAvailable : undefined,
    quantityBooked: typeof raw.quantityBooked === 'number' ? raw.quantityBooked : undefined,
    preparationTime: typeof raw.preparationTime === 'number' ? raw.preparationTime : undefined,
  };
}

/**
 * Cluster-scoped kitchen list for on-demand ordering. `mode` is accepted for
 * future server-side filtering but the current endpoint returns every
 * on-demand kitchen regardless of mode (mode-eligibility is per-item, not
 * per-kitchen — see `groupMenuByMode`). Empty (not thrown) when
 * unserviceable, missing location, or on any request failure.
 */
export async function loadNearestKitchens(_mode: OnDemandMode): Promise<OnDemandKitchen[]> {
  const clusterList = session().getClusterIds();
  const geo = session().getGeolocation();
  if (clusterList.length === 0 || !geo) {
    return [];
  }
  try {
    const path = `${ENDPOINTS.onDemand.nearestKitchens}/1/${geo.lng}/${geo.lat}`;
    const list = await http.post<Record<string, unknown>[]>(path, { clusterList });
    return Array.isArray(list) ? list.map(normalizeKitchen) : [];
  } catch {
    return [];
  }
}

/** A single kitchen's profile (used when deep-linking straight to a kitchen). */
export async function loadKitchenProfile(kitchenId: string): Promise<OnDemandKitchen | null> {
  try {
    const raw = await http.get<Record<string, unknown>>(`${ENDPOINTS.onDemand.kitchenProfile}/${kitchenId}`);
    return raw && raw._id ? normalizeKitchen(raw) : null;
  } catch {
    return null;
  }
}

/** A kitchen's full item list (both modes' eligibility flags included in one response). */
export async function loadKitchenMenu(kitchenId: string): Promise<OnDemandMenuItem[]> {
  try {
    const raw = await http.get<{ itemList?: Record<string, unknown>[] }>(
      `${ENDPOINTS.onDemand.kitchenMenu}/${kitchenId}`,
    );
    const itemList = raw?.itemList;
    return Array.isArray(itemList) ? itemList.map((item, index) => normalizeMenuItem(item, index)) : [];
  } catch {
    return [];
  }
}

/**
 * The Kota-only aggregated cluster menu — one pre-merged menu for the whole
 * cluster instead of picking a kitchen first. Mirrors MealaweUserApp's
 * `tabClusterMenu.component.ts`, adapted for overlapping-cluster matches: uses
 * the LAST serviceable cluster (`clusters[clusters.length - 1]`), not the
 * first — this must match `detectClusters()`'s own resolution order, since
 * `showClusterMenu` (the flag gating whether this even gets called) is itself
 * resolved from that same last cluster's config. Using a different cluster
 * here would fetch the wrong (possibly non-Kota) cluster's menu. Same
 * last-cluster convention as `clusterStore.currentConfigName()` and
 * `subscription/api.ts`'s `loadWeeklyMenu()`. Hardcoded `kitchenType` of
 * `'Tier2'`. Returns `null` when there's no serviceable cluster or the
 * request fails — same empty-safe contract as the other loaders.
 */
export async function loadClusterMenu(): Promise<{ kitchen: OnDemandKitchen; items: OnDemandMenuItem[] } | null> {
  const clusters = session().getClusters();
  const clusterId = clusters[clusters.length - 1]?.clusterId;
  if (!clusterId) {
    return null;
  }
  try {
    const raw = await http.get<Record<string, unknown>>(
      `${ENDPOINTS.onDemand.clusterMenu}/${clusterId}/Tier2`,
    );
    if (!raw || !raw.kitchenId) {
      return null;
    }
    const itemList = raw.itemList;
    const kitchen: OnDemandKitchen = {
      _id: String(raw.kitchenId),
      kitchenName: String(raw.kitchenName ?? 'On Demand'),
      kitchenOpened: true,
      clusterMenu: true,
    };
    const items = Array.isArray(itemList)
      ? (itemList as Record<string, unknown>[]).map((item, index) => normalizeMenuItem(item, index))
      : [];
    return { kitchen, items };
  } catch {
    return null;
  }
}

/**
 * Valid on-demand coupons for the current cluster(s), filtered to the given
 * mode's `orderTypes` tag (`'allDay'` or `'advance'` — confirmed against the
 * legacy coupon model's `orderTypes: ['advance','daily','allDay']`). Same
 * `validCoupons` endpoint bulk/subscription already call.
 */
export async function loadOnDemandCoupons(mode: OnDemandMode): Promise<SubscriptionCoupon[]> {
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
      .filter((c) => Array.isArray(c?.orderTypes) && c.orderTypes!.indexOf(mode) > -1)
      .sort((a, b) => (b.seqWeightage || 0) - (a.seqWeightage || 0));
  } catch {
    return [];
  }
}

import { session } from '../session';
import { ENDPOINTS, http, type AddOn, type MealPackage } from '@mealawe/core';

/** Raw shape of a `DineInPackage` document as returned by
 * `getDineInPackageListCluster` — see `MealaweServerApp/src/model/dineInPackage.model.js`.
 * Only the fields this normalizer reads are declared; anything else on the
 * real document is ignored (not needed client-side today). */
interface RawDineInPackage {
  _id?: string;
  packageName?: string;
  packagePrice?: number;
  packageCategory?: { name?: string; selected?: boolean }[];
  packageSubCategory?: string;
  packageType?: string;
  days?: number;
  vegMealDescription?: string;
  nonVegMealDescription?: string;
  deliveryOnWeekends?: boolean;
  discount?: number;
  packageInfo?: string;
  priority?: number;
  clusters?: string[];
  offerText?: string;
  offerColor?: string;
  multiDateAllowed?: boolean;
  isBestSeller?: boolean;
  searchCategory?: string;
  imageUrl?: string;
  addonsList?: AddOn[];
  dineInLocation?: string;
}

/** `DineInPackage.packageCategory` is a `{name:'Lunch'|'Dinner', selected}[]`
 * subdocument array server-side — collapse the selected entries into the
 * plain display string `MealPackage.packageCategory` expects, e.g. "Lunch,
 * Dinner". Falls back to `''` if nothing is selected (matches how an empty
 * category renders elsewhere — no category chip shown). */
function packageCategoryLabel(raw: RawDineInPackage['packageCategory']): string {
  if (!Array.isArray(raw)) return '';
  return raw
    .filter((c) => c?.selected && c.name)
    .map((c) => c.name as string)
    .join(', ');
}

function normalizeDineInPackage(raw: RawDineInPackage): MealPackage {
  return {
    _id: raw._id,
    packageName: raw.packageName,
    packagePrice: raw.packagePrice ?? 0,
    packageCategory: packageCategoryLabel(raw.packageCategory),
    packageSubCategory: raw.packageSubCategory,
    packageType: raw.packageType,
    days: raw.days ?? 0,
    vegMealDescription: raw.vegMealDescription,
    nonVegMealDescription: raw.nonVegMealDescription,
    deliveryOnWeekends: raw.deliveryOnWeekends,
    discount: raw.discount ?? 0,
    packageInfo: raw.packageInfo,
    priority: raw.priority,
    clusters: raw.clusters,
    offerText: raw.offerText,
    offerColor: raw.offerColor,
    multiDateAllowed: raw.multiDateAllowed,
    isBestSeller: raw.isBestSeller,
    searchCategory: raw.searchCategory,
    imageUrl: raw.imageUrl,
    addonsList: raw.addonsList,
    dineInLocation: raw.dineInLocation,
  };
}

/** Dine-in packages for the current cluster(s) — the real backend models
 * "Dine In" as a Subscription package flagged `isDineIn: true`, not a kitchen/
 * table-booking system (see the design spec). Empty (not thrown) when
 * unserviceable or on any request failure — callers render an empty state. */
export async function loadDineInPackages(): Promise<MealPackage[]> {
  const clusterList = session().getClusterIds();
  if (clusterList.length === 0) {
    return [];
  }
  try {
    const list = await http.post<RawDineInPackage[]>(ENDPOINTS.dineInPackage.listCluster, {
      custerList: clusterList,
    });
    return Array.isArray(list)
      ? list
          .filter((r): r is RawDineInPackage => r != null && typeof r === 'object')
          .map(normalizeDineInPackage)
      : [];
  } catch {
    return [];
  }
}

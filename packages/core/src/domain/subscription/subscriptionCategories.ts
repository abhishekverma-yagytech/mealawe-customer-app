import { imageUri } from './media';
import type { IncludedItem } from './types';

/** A local `require()` asset id, or a remote `{ uri }` — the two image
 * source shapes every category-image consumer (`CategoryThumbnail`,
 * `expo-image`) accepts. Deliberately narrower than RN's `ImageSourcePropType`
 * (no arrays, no header/cache options) since these two are all this app ever produces. */
export type CategoryImageSource = number | { uri: string };

/**
 * A subscription category tile (display + route param + detail-popup copy).
 * Ports mealaweApp's `SubCategory`. Server-driven via `SubscriptionCategory`
 * (see `fromServerCategory` below). "What's included" comes from this
 * category's own `includedItemsVeg`/`includedItemsNonVeg` — see
 * `subscription-detail.tsx`.
 */
export interface SubCategory {
  name: string;
  /** Route/query param sent to the plan list + used to match packages. */
  param: string;
  /** Cluster-wise tile/detail image — a `{ uri }` for a server-hosted
   * `SubscriptionCategory` image (a local `require()` id is also accepted by
   * the type, but nothing currently constructs one). */
  image?: CategoryImageSource;
  /** Detail-screen hero image, when it differs from the tile/card `image`
   * above — falls back to `image` when omitted, so most categories still
   * share one photo everywhere. */
  detailImage?: CategoryImageSource;
  /** Home screen's full-width bestseller banner photo — a distinct slot from
   * `image`/`detailImage` (different crop/purpose). Only meaningful when
   * `isBestseller` is true; `BestsellerBanner` falls back to `detailImage`/
   * `image` when a showcase category hasn't set one yet. */
  showcaseImage?: CategoryImageSource;
  offerText?: string;
  /** true = veg badge (default); false = non-veg. */
  veg?: boolean;
  rating?: number;
  tagline?: string;
  /** Small colored ribbon on the category tile (e.g. "BESTSELLER", "BEST VALUE"). */
  badge?: { label: string; color: string };
  /** This category is the hero-banner showcase for its cluster — the one flag
   * driving `SubscriptionHome`'s bestseller banner, uniformly across every
   * cluster (replaces the old Pune-only special case). */
  isBestseller?: boolean;
  /** Which meal times this category accepts orders for, and each one's
   * accept window — admin-set per category in the dashboard, HH:MM 24h. */
  mealTimes?: MealTimeWindow[];
  /** Structured "what's included" rows, one list PER DIET, shared by every
   * package under this category (moved from per-package since the list is
   * almost always identical across a category's plans) — a thali's veg and
   * non-veg versions don't include the same items, same split as the legacy
   * per-package `vegMealDescription`/`nonVegMealDescription` pair.
   * `subscription-detail.tsx` falls back to that legacy comma-split only when
   * a category has none set yet for the diet currently being viewed. */
  includedItemsVeg?: IncludedItem[];
  includedItemsNonVeg?: IncludedItem[];
  /** Admin-picked `MealPackage._id` whose price shows on this category's
   * Home tile (dashboard's Subscription Category form) — `undefined` means
   * "no explicit pick", in which case the cheapest ₹/day match is used
   * instead (see `cheapestPriceLabels`). */
  homeTilePackageId?: string;
}

/** One accepted meal-time window on a category — `mealType` matches
 * `MealPackage.isBreakFast`'s domain conceptually but is category-level and
 * covers all three meal times, not just breakfast. */
export interface MealTimeWindow {
  mealType: 'breakfast' | 'lunch' | 'dinner';
  /** HH:MM, 24h, local time. */
  startTime: string;
  endTime: string;
}

/** The `SubscriptionCategory` shape returned by `getSubscriptionCategoryListByClusterConfig`. */
export interface ServerSubCategory {
  _id: string;
  name: string;
  param: string;
  tileImage?: string;
  detailImage?: string;
  showcaseImage?: string;
  tagline?: string;
  badge?: { label: string; color: string };
  dietDefault?: 'veg' | 'nonveg';
  order?: number;
  /** Cluster CONFIG group names this category is scoped to, not raw cluster
   * zone ids — unused client-side (the fetch itself is already config-scoped
   * server-side), kept only for parity with the server doc shape. */
  clusterConfigNames?: string[];
  isBestseller?: boolean;
  mealTimes?: MealTimeWindow[];
  includedItemsVeg?: IncludedItem[];
  includedItemsNonVeg?: IncludedItem[];
  isActive?: boolean;
  /** Populated on the server (`.populate('homeTilePackage')`) — an object
   * when set, absent/null otherwise. */
  homeTilePackage?: { _id: string } | null;
}

/** Maps a server `SubscriptionCategory` doc onto the `SubCategory` shape every
 * existing render site (`CategoryCard`, `CategoryThumbnail`, …) already consumes. */
export function fromServerCategory(sc: ServerSubCategory): SubCategory {
  const tile = imageUri(sc.tileImage);
  const detail = imageUri(sc.detailImage);
  const showcase = imageUri(sc.showcaseImage);
  return {
    name: sc.name,
    param: sc.param,
    image: tile ? { uri: tile } : undefined,
    detailImage: detail ? { uri: detail } : tile ? { uri: tile } : undefined,
    showcaseImage: showcase ? { uri: showcase } : undefined,
    veg: sc.dietDefault !== 'nonveg',
    tagline: sc.tagline,
    badge: sc.badge?.label ? sc.badge : undefined,
    isBestseller: !!sc.isBestseller,
    mealTimes: sc.mealTimes,
    includedItemsVeg: sc.includedItemsVeg,
    includedItemsNonVeg: sc.includedItemsNonVeg,
    homeTilePackageId: sc.homeTilePackage?._id,
  };
}

/** Resolve a route param (e.g. "Special") to its category (or a minimal fallback). */
export function resolveCategory(
  categories: readonly SubCategory[],
  param: string,
): SubCategory {
  const key = (param ?? '').toLowerCase();
  return (
    categories.find((c) => c.param.toLowerCase() === key || c.name.toLowerCase() === key) ?? {
      name: param || 'Subscription',
      param: param || 'Subscription',
    }
  );
}

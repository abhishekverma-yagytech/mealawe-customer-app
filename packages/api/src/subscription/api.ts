import { session } from '../session';
import { ENDPOINTS, http, type ServerReview, type ServerSubCategory, type MealPackage, type SubscriptionCoupon, type WeekMenu } from '@mealawe/core';


/** The user's last-detected cluster id, or '' when unresolved — the weekly
 * menu is scoped to a single raw cluster zone (not the multi-cluster
 * `custerList` the package list takes). */
function lastClusterId(): string {
  const clusters = session().getClusters();
  return clusters.length ? clusters[clusters.length - 1].clusterId : '';
}

/** The user's current cluster CONFIG name (e.g. "Pune"), or '' when
 * unresolved — categories and reviews are admin-managed per config group
 * (`SubscriptionCategory`/`SubscriptionReview`'s `clusterConfigNames`, same
 * scoping level as `ClusterConfigVariable`'s `showSubscription`-etc. flags),
 * not per raw geofenced zone — several zones can share one config, and a
 * category/review's availability is a config-level decision. */
function lastClusterConfigName(): string {
  return session().getCurrentConfigName();
}

/**
 * Cluster-aware subscription data: meal packages (grouped by category), the
 * weekly menu, and valid subscription coupons. Ports mealaweApp's
 * PackageService — cluster ids come from the shared `clusterStore`.
 */

/** Match a (possibly short) category name to the real grouped key. */
export function matchCategoryKey(keys: string[], category: string): string | undefined {
  const c = category.toLowerCase();
  return (
    keys.find((k) => k.toLowerCase() === c) ??
    keys.find((k) => k.toLowerCase().includes(c) || c.includes(k.toLowerCase()))
  );
}

/** All packages for the current cluster(s), grouped by packageCategory + searchCategory. */
export async function loadGroupedPackages(): Promise<Record<string, MealPackage[]>> {
  const custerList = session().getClusterIds();
  if (custerList.length === 0) {
    return {};
  }

  const list = await http.post<MealPackage[]>(ENDPOINTS.subscription.mealPackageList, {
    custerList, // backend spelling — do not "fix"
  });
  if (!Array.isArray(list) || list.length === 0) {
    return {};
  }
  const grouped: Record<string, MealPackage[]> = {};
  const add = (cat: string, pkg: MealPackage): void => {
    (grouped[cat] ??= []).push(pkg);
  };
  for (const pkg of list) {
    // Not a stored package field (no `count` in `mealPackage.model.js`) — a
    // per-package order quantity the checkout payload's `mealPackage.count`
    // needs. Must default to 1, not 0: the backend's
    // `itemAmount = (payToKitchenPerMeal + addonAmount) * mealPackage.count`
    // silently zeroes (or NaNs, if payToKitchenPerMeal is also missing) the
    // whole order otherwise.
    pkg.count = pkg.count ?? 1;
    // `category` (the populated `SubscriptionCategory` ref) is the
    // server-authoritative grouping key — the dashboard's own "packages in
    // this category" count is ref-based. `packageCategory` is only a
    // denormalized mirror of `category.param`, auto-backfilled server-side
    // whenever a package's `category` is saved (see
    // SUBSCRIPTION_CATALOG_DYNAMIC_PLAN.md §8) — but a package whose ref was
    // set through a path that didn't carry the backfill (or was set before
    // that logic existed) can have a `packageCategory` that no longer
    // matches its real `category`, so the app's grouping silently drifts
    // from the dashboard's ref-based count. Prefer the live ref; fall back
    // to `packageCategory` only for a package with no `category` ref at all.
    const categoryParam = typeof pkg.category === 'object' && pkg.category ? pkg.category.param : undefined;
    const primaryCategory = categoryParam || pkg.packageCategory;
    if (primaryCategory) {
      add(primaryCategory, pkg);
    }
    if (pkg.searchCategory) {
      pkg.searchCategory
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((cat) => add(cat, pkg));
    }
  }
  // shortest plan first (5 → 10 → 20 → 60 days)
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => (a.days || 0) - (b.days || 0));
  }
  return grouped;
}

/** Packages for a single category (param resolved case-insensitively), empty if none. */
export async function loadPackagesForCategory(category: string): Promise<MealPackage[]> {
  const grouped = await loadGroupedPackages();
  const key = matchCategoryKey(Object.keys(grouped), category);
  return key ? grouped[key] : [];
}

/**
 * Categories for the user's current cluster CONFIG (not raw cluster zone —
 * several zones can share one config), admin-managed via `SubscriptionCategory`.
 * `[]` when unresolved or on error, same convention as `loadWeeklyMenu`.
 */
export async function loadSubscriptionCategories(): Promise<ServerSubCategory[]> {
  const clusterConfigName = lastClusterConfigName();
  if (!clusterConfigName) {
    return [];
  }
  try {
    const list = await http.get<ServerSubCategory[]>(
      `${ENDPOINTS.subscription.categoryList}/${encodeURIComponent(clusterConfigName)}`,
    );
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Home-screen customer testimonials for the user's current cluster CONFIG
 * (same scoping as `loadSubscriptionCategories`), admin-managed via
 * `SubscriptionReview`.
 */
export async function loadSubscriptionReviews(): Promise<ServerReview[]> {
  const clusterConfigName = lastClusterConfigName();
  if (!clusterConfigName) {
    return [];
  }
  try {
    const list = await http.get<ServerReview[]>(
      `${ENDPOINTS.subscription.reviewList}/${encodeURIComponent(clusterConfigName)}`,
    );
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Weekly menu for a category, scoped to the user's (last) cluster. Pass the
 * resolved server category (a package's `packageCategory`) for a reliable match.
 */
export async function loadWeeklyMenu(category: string): Promise<WeekMenu[]> {
  const clusterId = lastClusterId();
  if (!clusterId) {
    return [];
  }
  try {
    const result = await http.get<{ weekMenuList?: WeekMenu[] }[]>(
      `${ENDPOINTS.subscription.weeklyMenu}/${encodeURIComponent(category)}/${clusterId}`,
    );
    return result?.[0]?.weekMenuList ?? [];
  } catch {
    return [];
  }
}

/**
 * Valid subscription coupons for the current cluster(s), sorted by descending
 * seqWeightage. Returns [] for guests / on error so callers can fall back.
 */
export async function loadSubscriptionCoupons(): Promise<SubscriptionCoupon[]> {
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
      .filter((c) => Array.isArray(c?.orderTypes) && c.orderTypes!.indexOf('subscription') > -1)
      .sort((a, b) => (b.seqWeightage || 0) - (a.seqWeightage || 0));
  } catch {
    return [];
  }
}

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useClusterStore } from '@mealawe/state';

import { loadGroupedPackages, loadSubscriptionCategories, matchCategoryKey } from '@mealawe/api';
import { fromServerCategory, type SubCategory, type MealPackage } from '@mealawe/core';

interface Catalog {
  loading: boolean;
  error: string | null;
  /** Admin-managed categories for the current cluster — server-driven only,
   * no static fallback. Empty while loading or if none are configured yet
   * for this cluster (see `SubscriptionHome`'s empty state). */
  categories: readonly SubCategory[];
  /** Packages grouped by server category. */
  grouped: Record<string, MealPackage[]>;
  /** Packages for a category param (resolved to the grouped key). */
  packagesFor: (categoryParam: string) => MealPackage[];
  reload: () => void;
}

/**
 * Loads the cluster's categories + meal packages and exposes the catalog + a
 * lookup. Categories are admin-managed (`SubscriptionCategory`, fetched via
 * `loadSubscriptionCategories`, cluster-scoped server-side) — always the live
 * data, never the static arrays in `subscriptionCategories.ts` (kept in that
 * file only as historical reference/migration-seed source, not read here).
 * Packages come from the single cluster-scoped package call.
 */
export interface CatalogOptions {
  /**
   * Also list package groups that have no admin-managed category record, as basic tiles (name + plans).
   * Default false = exact mobile behaviour (only managed categories). Managed categories always come first.
   */
  includeUnmanaged?: boolean;
}

/** Basic tile for a package group the admin never created a `SubscriptionCategory` for. */
function unmanagedCategory(key: string, packages: readonly MealPackage[]): SubCategory {
  const veg = packages.some((p) => p.packageType !== 'NonVeg');
  return { name: key, param: key, veg, isBestseller: false };
}

export function useSubscriptionCatalog(options: CatalogOptions = {}): Catalog {
  const includeUnmanaged = options.includeUnmanaged ?? false;
  const clusters = useClusterStore((s) => s.clusters);
  // Cluster detection is still resolving (fired at boot, fire-and-forget —
  // see `_layout.tsx`/`locationStore.setCurrent`). `loadGroupedPackages()`
  // returns `{}` immediately when there are no cluster ids yet (api.ts), so
  // without this guard, a screen mounted while detection is still in flight
  // (a fresh navigation creates its own hook instance with no shared cache,
  // so this can happen well after Home's own catalog already loaded) would
  // report itself "loaded, zero packages" — `loading` flips false, category
  // content (e.g. the Breakfast meal-time slot, the weekly menu) renders as
  // empty — and only actually appears once cluster detection finishes and
  // *something else* triggers a re-render, reading as "stuck until I tap
  // something." Wait for detection to actually settle before trusting an
  // empty cluster list. `detecting` alone isn't enough: it's `false` both
  // before detection has ever started AND after it's finished, so a screen
  // that mounts in the narrow window before the boot-time `detectClusters()`
  // call has actually set `detecting: true` would misread "hasn't started"
  // as "finished, genuinely zero clusters" — same race `hasDetected` was
  // added to `clusterStore` to distinguish (see its own doc comment), just
  // never wired into this guard until now.
  const detectingCluster = useClusterStore((s) => s.detecting);
  const hasDetectedCluster = useClusterStore((s) => s.hasDetected);
  const clusterKey = clusters.map((c) => c.clusterId).join(',');

  const [grouped, setGrouped] = useState<Record<string, MealPackage[]>>({});
  const [managed, setCategories] = useState<readonly SubCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (clusters.length === 0 && (detectingCluster || !hasDetectedCluster)) {
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([loadGroupedPackages(), loadSubscriptionCategories()])
      .then(([packages, serverCategories]) => {
        if (!active) {
          return;
        }
        setGrouped(packages);
        setCategories(serverCategories.map(fromServerCategory));
      })
      .catch(() => {
        if (active) {
          setError('Could not load subscription plans');
          setGrouped({});
          setCategories([]);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [clusterKey, detectingCluster, hasDetectedCluster, nonce]);

  const packagesFor = useCallback(
    (categoryParam: string): MealPackage[] => {
      const key = matchCategoryKey(Object.keys(grouped), categoryParam);
      return key ? grouped[key] : [];
    },
    [grouped],
  );

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const categories = useMemo<readonly SubCategory[]>(() => {
    if (!includeUnmanaged) return managed;
    const seen = new Set<string>();
    for (const c of managed) {
      seen.add(c.param.toLowerCase());
      seen.add(c.name.toLowerCase());
    }
    const extras = Object.keys(grouped)
      .filter((key) => !seen.has(key.toLowerCase()))
      .sort((a, b) => a.localeCompare(b))
      .map((key) => unmanagedCategory(key, grouped[key]));
    return [...managed, ...extras];
  }, [includeUnmanaged, managed, grouped]);

  return { loading, error, categories, grouped, packagesFor, reload };
}

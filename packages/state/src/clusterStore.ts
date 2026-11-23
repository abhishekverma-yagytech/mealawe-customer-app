import { create } from 'zustand';

import { STORAGE_KEYS , kvStorage } from '@mealawe/core';
import { clusterApi, clustersForPoint, type Cluster, type GeoPoint } from '@mealawe/api';

/** Cluster-config boolean flags this store tracks — every key here mirrors a
 * `ClusterConfigVariable` field on the server (see mealaweDashboard's
 * cluster-config-variables form), gating one order-mode tab each. The
 * Apartment tab is deliberately NOT one of these — it's a fixed bottom-nav
 * entry regardless of location/serviceability (see `(tabs)/index.tsx`); its
 * own apartment-complex resolution lives in `features/apartment`, entirely
 * decoupled from this geofencing/cluster-config mechanism. */
type ClusterFlagKey =
  | 'showSubscription'
  | 'showBulk'
  | 'showDineIn'
  | 'showOndemand'
  | 'showClusterMenu'
  | 'showNavmool'
  | 'showRainyNotification';

const CLUSTER_FLAG_KEYS: readonly ClusterFlagKey[] = [
  'showSubscription',
  'showBulk',
  'showDineIn',
  'showOndemand',
  'showClusterMenu',
  'showNavmool',
  'showRainyNotification',
];

/**
 * Cluster (serviceable-area) state. Ports mealaweApp's ClusterService: download
 * the geofencing polygons once, detect which cluster(s) a delivery point falls
 * into locally, and expose cluster ids for cluster-scoped API calls. This is the
 * shared "which serviceable zone am I in" layer used by every vertical
 * (subscription / dine-in / bulk), driven by `locationStore.current`.
 */
type ClusterFlagState = Record<ClusterFlagKey, boolean | null>;

interface ClusterState extends ClusterFlagState {
  /** Clusters the current location belongs to (empty = not serviceable). */
  clusters: Cluster[];
  /** True while geofencing is being fetched / detection is running. */
  detecting: boolean;
  /** True once `detectClusters` has resolved at least once this session.
   * Distinguishes "genuinely not serviceable" (`clusters.length === 0` AND
   * `hasDetected`) from "detection just hasn't run yet" (same empty array,
   * but before the very first attempt) — those two states look identical
   * under a naive `!detecting` check, and a screen that reads `clusters`
   * before the app's own fire-and-forget boot-time `detectClusters` call has
   * even started would otherwise misread "not yet checked" as "checked,
   * found nothing" and could wrongly show a "not serviceable" UI to a user
   * who's actually in a fully serviceable area. */
  hasDetected: boolean;

  hydrate: () => void;
  /** Cluster ids for cluster-scoped calls (e.g. getMealPackageListCluster). */
  clusterIds: () => string[];
  /** True when the current location is inside at least one serviceable cluster. */
  isServiceable: () => boolean;
  /**
   * Read-only serviceability check for a candidate point (e.g. an address
   * being previewed before saving) — reuses the same cached geofencing
   * polygons as `detectClusters` but never writes `clusters`/flags state, so
   * previewing an address can't clobber the user's actual current location.
   */
  previewServiceable: (point: GeoPoint) => Promise<boolean>;
  /**
   * Same read-only preview as `previewServiceable`, but returns the matched
   * clusters themselves instead of a plain boolean — for callers that need
   * to compare a candidate point's cluster(s) against a specific required
   * cluster id (e.g. "is this saved address in the same cluster the current
   * order was configured for"), not just "is it serviceable somewhere".
   */
  previewClusters: (point: GeoPoint) => Promise<Cluster[]>;
  /** The most-recently-detected cluster's config name (for cluster-scoped config fetches), or '' if not serviceable. */
  currentConfigName: () => string;
  /**
   * Detect the clusters containing `point`, persist them, update state, and
   * return the matches. Geofencing polygons are fetched once and cached.
   * Also fires (non-blocking) a refresh of every cluster-config flag for the
   * newly detected cluster.
   */
  detectClusters: (point: GeoPoint) => Promise<Cluster[]>;
}

/**
 * Config group name for a set of matched clusters: the MOST SPECIFIC (last) cluster that actually has one.
 * Overlapping zones are common (e.g. "pune" / "pune full" / "Pune Extended") and some rows carry no
 * `clusterConfigName`; taking the literal last cluster then resolved '' and silently disabled categories,
 * reviews and every cluster flag for that address.
 */
export function configNameOf(clusters: readonly Cluster[]): string {
  for (let i = clusters.length - 1; i >= 0; i--) {
    const name = clusters[i].clusterConfigName;
    if (typeof name === 'string' && name.trim()) return name;
  }
  return '';
}

let geofencingCache: Cluster[] | null = null;
/** Resolved flag value per `${flagKey}:${clusterConfigName}` — avoids
 * re-fetching the same flag on every detectClusters call. */
const flagCache = new Map<string, boolean>();
/** In-flight/resolved searchClusterVariable response per configName, shared by
 * every flag refresh so a single detectClusters() call fires one HTTP
 * request, not one per flag, for the same configName. Failures are evicted
 * (not cached) so a later call can retry. */
const clusterConfigCache = new Map<string, Promise<Record<string, unknown> | null>>();

function loadClusterConfig(configName: string): Promise<Record<string, unknown> | null> {
  const existing = clusterConfigCache.get(configName);
  if (existing) {
    return existing;
  }
  const promise = clusterApi.searchClusterVariable(configName).catch(() => {
    clusterConfigCache.delete(configName);
    return null;
  });
  clusterConfigCache.set(configName, promise);
  return promise;
}

function readFromStorage(): Cluster[] {
  try {
    return kvStorage.getObject<Cluster[]>(STORAGE_KEYS.clusters) ?? [];
  } catch {
    return [];
  }
}

function writeToStorage(clusters: Cluster[]): void {
  try {
    kvStorage.setObject(STORAGE_KEYS.clusters, clusters);
  } catch {
    // storage unavailable (e.g. Expo Go) — in-memory state still works
  }
}

async function loadGeofencing(): Promise<Cluster[]> {
  if (geofencingCache) {
    return geofencingCache;
  }
  try {
    const list = await clusterApi.getGeoFencingList();
    geofencingCache = Array.isArray(list) ? list : [];
  } catch {
    geofencingCache = [];
  }
  return geofencingCache;
}

/** Fetch (and cache) one cluster-config boolean flag. Sets state to `null` on
 * failure/no-config — never `false` — so callers can distinguish "known not
 * enabled" from "couldn't ask" (each flag's caller decides whether a
 * name-heuristic fallback applies, e.g. showDineIn's `.includes('kota')`). */
async function refreshFlag(
  key: ClusterFlagKey,
  configName: string,
  set: (partial: Partial<ClusterState>) => void,
): Promise<void> {
  if (!configName) {
    set({ [key]: null } as Partial<ClusterState>);
    return;
  }
  const cacheKey = `${key}:${configName}`;
  const cached = flagCache.get(cacheKey);
  if (cached !== undefined) {
    set({ [key]: cached } as Partial<ClusterState>);
    return;
  }
  const cfg = await loadClusterConfig(configName);
  if (!cfg) {
    set({ [key]: null } as Partial<ClusterState>);
    return;
  }
  const flag = cfg[key] === true || cfg[key] === 'true';
  flagCache.set(cacheKey, flag);
  set({ [key]: flag } as Partial<ClusterState>);
}

const INITIAL_FLAGS: ClusterFlagState = CLUSTER_FLAG_KEYS.reduce(
  (acc, key) => ({ ...acc, [key]: null }),
  {} as ClusterFlagState,
);

export const useClusterStore = create<ClusterState>((set, get) => ({
  clusters: [],
  detecting: false,
  hasDetected: false,
  ...INITIAL_FLAGS,

  hydrate: () => {
    set({ clusters: readFromStorage() });
  },

  clusterIds: () => get().clusters.map((c) => c.clusterId).filter(Boolean),

  isServiceable: () => get().clusters.length > 0,

  previewServiceable: async (point) => {
    return (await get().previewClusters(point)).length > 0;
  },

  previewClusters: async (point) => {
    if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') {
      return [];
    }
    const geofencing = await loadGeofencing();
    return clustersForPoint(geofencing, point);
  },

  currentConfigName: () => configNameOf(get().clusters),

  detectClusters: async (point) => {
    if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') {
      return get().clusters;
    }
    set({ detecting: true });
    try {
      const geofencing = await loadGeofencing();
      const matched = clustersForPoint(geofencing, point);
      writeToStorage(matched);
      set({ clusters: matched });
      // Fire-and-forget: refresh every cluster-config flag for the newly
      // detected cluster. Non-blocking so it never adds a loading state to
      // callers awaiting detectClusters — home already has a
      // clusterName-based fallback for showDineIn while this resolves.
      const configName = configNameOf(matched);
      for (const key of CLUSTER_FLAG_KEYS) {
        void refreshFlag(key, configName, set);
      }
      return matched;
    } finally {
      set({ detecting: false, hasDetected: true });
    }
  },
}));

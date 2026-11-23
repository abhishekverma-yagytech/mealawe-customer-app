import type { Cluster, GeoPoint } from './location/types';

/**
 * Read-only view of the current user/cluster/location session that API
 * functions need to scope their requests. Each app registers an implementation
 * backed by its own stores (mobile: Zustand stores; web: its stores) at startup,
 * so API code never imports a store or UI module.
 */
export interface SessionContext {
  /** Logged-in customer id (undefined when logged out). */
  getProfileId(): string | undefined;
  /** Clusters the user's current address falls in (last = most specific). */
  getClusters(): Cluster[];
  getClusterIds(): string[];
  /** Cluster CONFIG group name (e.g. "Pune"), or '' when unresolved. */
  getCurrentConfigName(): string;
  /** Lat/lng of the selected delivery address, if any. */
  getGeolocation(): GeoPoint | undefined;
}

let ctx: SessionContext | null = null;

export function registerSessionContext(next: SessionContext): void {
  ctx = next;
}

export function session(): SessionContext {
  if (!ctx) throw new Error('[api] registerSessionContext() must be called at app startup');
  return ctx;
}

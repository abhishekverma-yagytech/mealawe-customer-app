import { ENDPOINTS, http } from '@mealawe/core';

import type { Cluster } from './types';

/**
 * Cluster (serviceable-area) API — the geofencing polygon list. Ports
 * mealaweApp's apiMain.getGeoFencingList. The polygon list is downloaded once;
 * cluster detection then runs locally (point-in-polygon) — there is no lat/lng
 * query to the server.
 */
export const clusterApi = {
  /** All geofencing clusters (polygons). */
  getGeoFencingList: () => http.get<Cluster[]>(ENDPOINTS.cluster.geoFencingList),

  /** Per-cluster config values (charges, GST %) keyed by `clusterConfigName`. */
  searchClusterVariable: (configName: string) =>
    http.post<Record<string, unknown>>(ENDPOINTS.cluster.searchVariable, { configName }),
};

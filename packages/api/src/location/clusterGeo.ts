import type { Cluster, GeoPoint } from './types';

/**
 * Ray-casting point-in-polygon test (x = lng, y = lat). Ports mealaweApp's
 * ClusterService.containsPoint — no Google Maps geometry dependency. Handles
 * both `{lat,lng}` vertices and `[lat,lng]` tuples.
 */
export function clusterContainsPoint(cluster: Cluster, point: GeoPoint): boolean {
  const poly = (cluster.clusterCoordinates ?? []).map((v) =>
    Array.isArray(v) ? { lat: v[0], lng: v[1] } : v,
  );
  if (poly.length < 3) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng;
    const yi = poly[i].lat;
    const xj = poly[j].lng;
    const yj = poly[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

/** Clusters whose polygon contains the point. */
export function clustersForPoint(clusters: Cluster[], point: GeoPoint): Cluster[] {
  return clusters.filter((c) => clusterContainsPoint(c, point));
}

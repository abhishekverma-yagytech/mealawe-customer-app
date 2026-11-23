import type { Address, GeoPoint } from './types';

/** Great-circle distance between two points, in metres (haversine). */
export function distanceMeters(a: GeoPoint, b?: GeoPoint): number {
  if (!a || !b || typeof b.lat !== 'number') {
    return Number.POSITIVE_INFINITY;
  }
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Find the saved address within `radiusM` of a point (default 500m). Returns the
 * closest match, or null. Lets a raw GPS fix resolve to a known saved address
 * (ported from mealaweApp's matchSavedAddress).
 */
export function matchSavedAddress(point: GeoPoint, saved: Address[], radiusM = 500): Address | null {
  let best: Address | null = null;
  let bestDist = radiusM;
  for (const a of saved) {
    const d = distanceMeters(point, a.geolocation);
    if (d <= bestDist) {
      best = a;
      bestDist = d;
    }
  }
  return best;
}

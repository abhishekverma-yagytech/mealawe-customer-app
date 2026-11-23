import { getGreatCircleBearing } from 'geolib';

import type { LatLng } from './types';

/** Loosely-shaped API location → validated LatLng, or null. Ports the Ionic app's normalizeLatLng. */
export function normalizeLatLng(raw: unknown): LatLng | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const lat = Number(r.lat ?? r.latitude);
  const lng = Number(r.lng ?? r.long ?? r.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** Closest point on segment a→b to point p, via equirectangular projection (accurate at route-segment scale). */
function closestPointOnSegment(p: LatLng, a: LatLng, b: LatLng): LatLng {
  const cosLat = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const ax = a.lng * cosLat;
  const ay = a.lat;
  const bx = b.lng * cosLat;
  const by = b.lat;
  const px = p.lng * cosLat;
  const py = p.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const rawT = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  const t = Math.max(0, Math.min(1, rawT));
  return { lat: ay + t * dy, lng: (ax + t * dx) / cosLat };
}

function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Snaps a noisy GPS fix onto the route polyline when within `toleranceMeters`
 * of a segment; otherwise returns the original point unchanged (a genuinely
 * off-route runner isn't falsely placed on the path). Ports the Ionic app's
 * snapToRoute/closestPointOnSegment (75m tolerance there).
 */
export function snapToRoute(point: LatLng, routePath: LatLng[], toleranceMeters = 75): LatLng {
  if (routePath.length < 2) return point;
  let best = point;
  let bestDist = Infinity;
  for (let i = 0; i < routePath.length - 1; i++) {
    const snapped = closestPointOnSegment(point, routePath[i], routePath[i + 1]);
    const dist = distanceMeters(point, snapped);
    if (dist < bestDist) {
      bestDist = dist;
      best = snapped;
    }
  }
  return bestDist <= toleranceMeters ? best : point;
}

/** Heading in degrees (0-360) from `from` facing toward `to`, for rotating the runner marker icon. */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  return getGreatCircleBearing(
    { latitude: from.lat, longitude: from.lng },
    { latitude: to.lat, longitude: to.lng },
  );
}

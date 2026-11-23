import type { Address, GeoPoint, LocationProvider } from '@mealawe/api';

import { loadGeocoding } from './maps';

const GPS_TIMEOUT_MS = 6000;
const GEOCODE_TIMEOUT_MS = 4000;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      () => { clearTimeout(t); resolve(fallback); },
    );
  });
}

async function getGps(): Promise<GeoPoint | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  const fix = new Promise<GeoPoint | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: GPS_TIMEOUT_MS, maximumAge: 60_000 },
    );
  });
  return withTimeout(fix, GPS_TIMEOUT_MS + 500, null);
}

type Component = { long_name: string; types: string[] };
const pick = (cs: Component[], type: string) => cs.find((c) => c.types.includes(type))?.long_name;

/** Maps address components to our Address fields (shared by GPS + Places flows). */
export function addressFromComponents(formatted: string, comps: Component[]): Partial<Address> {
  return {
    location: formatted || 'Current location',
    city: pick(comps, 'locality') ?? pick(comps, 'administrative_area_level_2'),
    state: pick(comps, 'administrative_area_level_1'),
    pincode: pick(comps, 'postal_code'),
  };
}

async function reverseGeocode(point: GeoPoint): Promise<Partial<Address>> {
  const fallback: Partial<Address> = { location: 'Current location' };
  const geocoding = await withTimeout(loadGeocoding(), GEOCODE_TIMEOUT_MS, null);
  if (!geocoding) return fallback;
  try {
    const res = await withTimeout(
      new geocoding.Geocoder().geocode({ location: { lat: point.lat, lng: point.lng } }),
      GEOCODE_TIMEOUT_MS,
      null,
    );
    const top = res?.results?.[0];
    if (!top) return fallback;
    return addressFromComponents(top.formatted_address, top.address_components as Component[]);
  } catch {
    return fallback;
  }
}

export const webLocationProvider: LocationProvider = { getGps, reverseGeocode };

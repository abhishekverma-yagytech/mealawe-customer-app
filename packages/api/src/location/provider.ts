import type { Address, GeoPoint } from './types';

/**
 * Platform location port. Mobile: expo-location; web: navigator.geolocation +
 * a geocoder. Registered once at app startup.
 */
export interface LocationProvider {
  /** Current device position, or null if denied / failed / timed out. */
  getGps(): Promise<GeoPoint | null>;
  /** Reverse-geocode a point to address fields; `location` always resolves to a string. */
  reverseGeocode(point: GeoPoint): Promise<Partial<Address>>;
}

let provider: LocationProvider | null = null;

export function registerLocationProvider(next: LocationProvider): void {
  provider = next;
}

function required(): LocationProvider {
  if (!provider) throw new Error('[api] registerLocationProvider() must be called at app startup');
  return provider;
}

export const getGps = (): Promise<GeoPoint | null> => required().getGps();
export const reverseGeocode = (point: GeoPoint): Promise<Partial<Address>> => required().reverseGeocode(point);

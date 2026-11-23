import * as Location from 'expo-location';

import { type Address, type GeoPoint } from '@mealawe/api';

/** Caps how long the GPS fix itself can take. `getCurrentPositionAsync` has
 * no built-in timeout — on a cold/indoor fix it can run well past
 * `LocationSplash`'s own boot-safety timer, which used to leave `current`
 * still null when the splash gave up (the fetch itself kept running
 * unbounded in the background, sometimes resolving seconds later on Home,
 * sometimes never at all). Bounding it here means `getGps()` always settles
 * in reasonable time, so the caller's own timeout is a rare last resort
 * rather than the thing usually deciding the outcome. */
const GPS_FIX_TIMEOUT_MS = 6000;
/** Caps the reverse-geocode call the same way — it's a network/OS lookup
 * with no timeout of its own either. */
const REVERSE_GEOCODE_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/**
 * Read the device GPS position, requesting foreground permission first.
 * Returns null if permission is denied, the fix fails, or it takes too long.
 */
async function getGpsExpo(): Promise<GeoPoint | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) {
      return null;
    }
    const pos = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      GPS_FIX_TIMEOUT_MS,
      null,
    );
    if (!pos) {
      return null;
    }
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Reverse-geocode a point into address fields. Uses the OS geocoder (no API key).
 * Returns a partial Address; `location` always resolves to a human string.
 */
async function reverseGeocodeExpo(point: GeoPoint): Promise<Partial<Address>> {
  try {
    const [place] = await withTimeout(
      Location.reverseGeocodeAsync({ latitude: point.lat, longitude: point.lng }),
      REVERSE_GEOCODE_TIMEOUT_MS,
      [],
    );
    if (!place) {
      return { location: 'Current location' };
    }
    const area = [place.name, place.street, place.district, place.city]
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i) // de-dupe
      .join(', ');
    return {
      location: area || place.city || place.region || 'Current location',
      city: place.city ?? undefined,
      state: place.region ?? undefined,
      pincode: place.postalCode ?? undefined,
    };
  } catch {
    return { location: 'Current location' };
  }
}


/** expo-location implementation of the shared LocationProvider port. */
export const expoLocationProvider = { getGps: getGpsExpo, reverseGeocode: reverseGeocodeExpo };

export { getGps, reverseGeocode, distanceMeters, matchSavedAddress } from '@mealawe/api';

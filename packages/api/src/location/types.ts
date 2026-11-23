/** Location / address models — mirror the live backend (see mealaweApp AddressService). */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export type TagLocation = 'home' | 'work' | 'other';

/** A saved or current delivery address. */
export interface Address {
  _id?: string;
  tagLocation?: TagLocation;
  geolocation: GeoPoint;
  /** Flat / house / street line. */
  address?: string;
  /** Formatted area string (always present — the human label). */
  location: string;
  landmark?: string;
  pincode?: string;
  city?: string;
  state?: string;
  /** Mirrors customerProfile.model.js's own addresses[] schema fields — kept
   * here purely so apartment-cart.tsx's existing `address?.wingName` read
   * type-checks. Not collected by AddressForm.tsx (product decision — kept
   * cart-only, seeded from the cart's own per-device `kvStorage` instead),
   * so these stay unset from this client; only matters if some other path
   * ever writes them onto a saved address. */
  wingName?: string;
  roomNumber?: string;
}

/**
 * A serviceable-area cluster (geofenced zone) from `getGeoFencingList`. The
 * primary scoping key for categories, packages, menus, coupons and charges.
 * `clusterCoordinates` is a polygon of lat/lng vertices (some backend rows use
 * `[lat, lng]` tuples — the point-in-polygon helper normalizes both).
 */
export interface Cluster {
  clusterId: string;
  clusterName?: string;
  clusterConfigName?: string;
  clusterCoordinates?: (GeoPoint | [number, number])[];
  orderTypes?: string[];
  active?: boolean;
}

/** Short header label for an address ("Home · Kothrud"), or a prompt when none. */
export function addressLabel(addr: Address | null | undefined): string {
  if (!addr) {
    return 'Set your location';
  }
  const area = [addr.address, addr.location].filter(Boolean).join(', ') || addr.location;
  const tag = addr.tagLocation ? capitalize(addr.tagLocation) : '';
  return tag ? `${tag} · ${area}` : area || 'Selected location';
}

/**
 * Do `a` and `b` refer to the same address? Prefers a shared `_id`; falls
 * back to comparing geo coordinates (for GPS-only addresses that have no
 * `_id` yet). Symmetric — argument order doesn't matter. The one compare
 * rule for "is this my current/selected address", shared by the location
 * store, `/addresses`, and any screen that lets a user pick a delivery
 * address (e.g. the subscription Configure screen).
 */
export function isSameAddress(a: Address | null, b: Address | null): boolean {
  if (!a || !b) return false;
  if (a._id && b._id) return a._id === b._id;
  return a.geolocation?.lat === b.geolocation?.lat && a.geolocation?.lng === b.geolocation?.lng;
}

/** Is `current` one of the user's saved addresses — not an ad-hoc, unsaved
 * GPS-only "current location"? The gate every checkout screen uses before
 * allowing an order to proceed (see the design spec's Part 2). */
export function hasSavedAddress(current: Address | null, saved: Address[]): boolean {
  return current != null && saved.some((a) => isSameAddress(current, a));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

import { create } from 'zustand';

import { STORAGE_KEYS, kvStorage, trackAddAddress, trackLocateMe, trackSelectAddress, type AddressEventPayload } from '@mealawe/core';
import { type CustomerProfile, type Address, getGps, matchSavedAddress, reverseGeocode, locationApi, isSameAddress } from '@mealawe/api';

import { useAuthStore } from './authStore';
import { useClusterStore } from './clusterStore';

// Re-exported for convenience; the canonical model lives in features/location.
export type { Address, GeoPoint, TagLocation } from '@mealawe/api';

interface LocationState {
  /** Active delivery address (null until one is chosen). */
  current: Address | null;
  /** Saved addresses (kept in sync with profile.addressList). */
  saved: Address[];
  /** Whether the current address falls in a serviceable area. */
  isServiceable: boolean;
  /** True while a GPS fix is in flight (drives the location gate UI). */
  gettingLocation: boolean;

  /** Seed from local storage + the logged-in profile. Call once at boot. */
  hydrate: () => void;
  /** Make `addr` the active address: persist locally + sync to backend. */
  setCurrent: (addr: Address) => Promise<void>;
  /** Capture GPS → reverse-geocode → match a saved address → set current.
   * Re-run on every app open (see `LocationSplash`), not just the first —
   * a returning user's persisted `current` is last session's answer, which
   * can be stale the moment they've physically moved. */
  useCurrentLocation: () => Promise<Address | null>;
  /** Add a saved address and make it current. */
  addAddress: (addr: Address) => Promise<void>;
  /** Update a saved address by index (refreshes current if it's the one). */
  updateAddress: (index: number, addr: Address) => Promise<void>;
  /** Delete a saved address. Returns an error message, or null on success. */
  removeAddress: (index: number) => Promise<string | null>;
}

function readCurrentFromStorage(): Address | null {
  try {
    return kvStorage.getObject<Address>(STORAGE_KEYS.selectedAddress);
  } catch {
    return null;
  }
}

function writeCurrentToStorage(addr: Address | null): void {
  try {
    if (addr) {
      kvStorage.setObject(STORAGE_KEYS.selectedAddress, addr);
    } else {
      kvStorage.remove(STORAGE_KEYS.selectedAddress);
    }
  } catch {
    // storage unavailable (e.g. Expo Go) — in-memory state still works
  }
}

/** Best-effort geo point from any of the shapes the backend has used. */
function readGeo(a: Record<string, unknown>): { lat: number; lng: number } | null {
  const g = (a.geolocation ?? a.geoLocation ?? a.location) as Record<string, unknown> | undefined;
  if (!g || typeof g !== 'object') {
    return null;
  }
  const lat = Number(g.lat ?? g.latitude);
  const lng = Number(g.lng ?? g.lon ?? g.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/**
 * Saved addresses off the profile. Keeps any address that carries a real label or
 * geo (backend rows vary: geolocation vs geoLocation, lat/lng vs latitude/longitude,
 * string vs number) and normalises the geo — so valid addresses never get dropped.
 */
function savedFromProfile(profile: CustomerProfile | null): Address[] {
  const list = Array.isArray(profile?.addressList) ? (profile?.addressList as Record<string, unknown>[]) : [];
  return list
    .filter((a) => a && (a.address || a.location || a.geolocation || a.geoLocation))
    .map((a) => {
      const geo = readGeo(a);
      return { ...(a as unknown as Address), geolocation: geo ?? { lat: 0, lng: 0 } };
    });
}

function addressEventPayload(addr: Address): AddressEventPayload {
  return { flat: addr.address, landmark: addr.landmark, pincode: addr.pincode, city: addr.city, state: addr.state };
}

/** Persist the address list onto the profile (backend + auth store). */
async function persistAddressList(saved: Address[]): Promise<void> {
  const { profile, setProfile } = useAuthStore.getState();
  if (!profile?._id) {
    return;
  }
  const updated: CustomerProfile = { ...profile, addressList: saved };
  try {
    const res = await locationApi.saveProfile(profile._id, updated);
    await setProfile(res ?? updated);
  } catch {
    await setProfile(updated);
  }
}

export const useLocationStore = create<LocationState>((set, get) => ({
  current: null,
  saved: [],
  isServiceable: true,
  gettingLocation: false,

  hydrate: () => {
    const current = readCurrentFromStorage();
    const saved = savedFromProfile(useAuthStore.getState().profile);
    set({ current, saved });
  },

  setCurrent: async (addr) => {
    writeCurrentToStorage(addr);
    set({ current: addr });
    trackSelectAddress(addressEventPayload(addr));
    // Re-detect the serviceable cluster(s) for the new address (shared combo).
    if (addr.geolocation) {
      void useClusterStore
        .getState()
        .detectClusters(addr.geolocation)
        .then((clusters) => set({ isServiceable: clusters.length > 0 }));
    }
    const { profile } = useAuthStore.getState();
    if (profile?._id) {
      try {
        await locationApi.setCurrentLocation(profile._id, addr);
      } catch {
        // keep the local selection even if the sync fails
      }
    }
  },

  useCurrentLocation: async () => {
    set({ gettingLocation: true });
    // Snapshot before the async GPS/reverse-geocode work below, which can
    // take several seconds — long enough for the user to make their own
    // fresh pick in the meantime (e.g. manually choosing a saved address
    // from `/addresses` while a fire-and-forget boot-time refresh, see
    // `LocationSplash`, is still resolving). Only commit the result if
    // `current` is still exactly what it was when this call started; a
    // stale resolution finishing late must never clobber a newer choice.
    const startingCurrent = get().current;
    try {
      const point = await getGps();
      if (!point) {
        trackLocateMe(null);
        return null;
      }
      const matched = matchSavedAddress(point, get().saved, 500);
      let addr: Address;
      if (matched) {
        addr = matched;
      } else {
        const geo = await reverseGeocode(point);
        addr = {
          geolocation: point,
          tagLocation: 'other',
          ...geo,
          location: geo.location ?? 'Current location',
        };
      }
      trackLocateMe(addressEventPayload(addr));
      const stillCurrent = get().current;
      if (startingCurrent ? isSameAddress(startingCurrent, stillCurrent) : !stillCurrent) {
        await get().setCurrent(addr);
      }
      return addr;
    } finally {
      set({ gettingLocation: false });
    }
  },

  addAddress: async (addr) => {
    const saved = [...get().saved, addr];
    set({ saved });
    trackAddAddress(addressEventPayload(addr));
    await persistAddressList(saved);
    await get().setCurrent(addr);
  },

  updateAddress: async (index, addr) => {
    const saved = [...get().saved];
    if (index < 0 || index >= saved.length) {
      return;
    }
    saved[index] = { ...saved[index], ...addr };
    set({ saved });
    await persistAddressList(saved);
    if (isSameAddress(saved[index], get().current)) {
      await get().setCurrent(saved[index]);
    }
  },

  removeAddress: async (index) => {
    const saved = [...get().saved];
    if (index < 0 || index >= saved.length) {
      return 'Address not found';
    }
    if (saved.length === 1) {
      return 'You cannot delete all addresses';
    }
    if (isSameAddress(saved[index], get().current)) {
      return 'Cannot delete the current address — switch to another first';
    }
    saved.splice(index, 1);
    set({ saved });
    await persistAddressList(saved);
    return null;
  },
}));

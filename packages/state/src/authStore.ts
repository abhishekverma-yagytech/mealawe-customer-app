import { create } from 'zustand';

import { STORAGE_KEYS , kvStorage, secureStorage } from '@mealawe/core';
import type { CustomerProfile } from '@mealawe/api';

interface AuthState {
  token: string | null;
  profile: CustomerProfile | null;
  isHydrated: boolean;
  isAuthenticated: boolean;
  /** New users (no name/email yet) route to the register/profile step. */
  needsProfile: boolean;
  hydrate: () => Promise<void>;
  /** Persist the token first so subsequent (authenticated) requests carry the
   *  Bearer header and use the token-based encryption key. */
  setToken: (token: string) => Promise<void>;
  setSession: (token: string, profile: CustomerProfile) => Promise<void>;
  setProfile: (profile: CustomerProfile) => Promise<void>;
  clearSession: () => Promise<void>;
}

function computeNeedsProfile(profile: CustomerProfile | null): boolean {
  if (!profile) return true;
  return !(profile.userName && profile.email);
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  profile: null,
  isHydrated: false,
  isAuthenticated: false,
  needsProfile: false,

  hydrate: async () => {
    const [token, profile] = await Promise.all([
      secureStorage.get(STORAGE_KEYS.sessionToken),
      secureStorage.getObject<CustomerProfile>(STORAGE_KEYS.user),
    ]);
    set({
      token,
      profile,
      isAuthenticated: Boolean(token),
      needsProfile: computeNeedsProfile(profile),
      isHydrated: true,
    });
  },

  setToken: async (token) => {
    await secureStorage.set(STORAGE_KEYS.sessionToken, token);
    set({ token, isAuthenticated: true });
  },

  setSession: async (token, profile) => {
    await secureStorage.set(STORAGE_KEYS.sessionToken, token);
    await secureStorage.setObject(STORAGE_KEYS.user, profile);
    set({
      token,
      profile,
      isAuthenticated: true,
      needsProfile: computeNeedsProfile(profile),
    });
  },

  setProfile: async (profile) => {
    await secureStorage.setObject(STORAGE_KEYS.user, profile);
    set({ profile, needsProfile: computeNeedsProfile(profile) });
  },

  clearSession: async () => {
    await secureStorage.remove(STORAGE_KEYS.sessionToken);
    await secureStorage.remove(STORAGE_KEYS.user);
    set({ token: null, profile: null, isAuthenticated: false, needsProfile: false });
  },
}));

const INSTALL_MARKER_KEY = 'mw.install.marker';

/**
 * iOS Keychain (which `expo-secure-store` is backed by) survives an app
 * uninstall — unlike every other storage this app uses, which the OS wipes
 * along with the app's sandbox on uninstall. Left alone, a user who
 * uninstalls and reinstalls lands right back in whatever session was active
 * before, which reads as "uninstalling didn't actually log me out."
 * `INSTALL_MARKER_KEY` lives in MMKV (`kvStorage`), which *does* get wiped on
 * uninstall — its absence is what distinguishes a fresh install (post-
 * uninstall, or truly first-ever launch) from a normal relaunch, so this only
 * clears the stale session on the former. Must run — and be awaited — before
 * `hydrate()` reads secure storage, or `hydrate()` would restore the very
 * session this is meant to clear.
 */
export async function clearStaleSessionOnFreshInstall(): Promise<void> {
  if (kvStorage.getBoolean(INSTALL_MARKER_KEY)) return;
  await useAuthStore.getState().clearSession();
  kvStorage.set(INSTALL_MARKER_KEY, true);
}

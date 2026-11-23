import { create } from 'zustand';

import { STORAGE_KEYS } from '@/config';
import { kvStorage } from '@/services/storage/kvStore';

import { authenticateWithBiometricsAsync, checkBiometricAvailabilityAsync } from './biometricAuth';
import type { BiometricUnavailableReason } from './biometricAuth';

export type SetBiometricLockResult =
  | { ok: true }
  | { ok: false; reason: BiometricUnavailableReason | 'authentication_failed' };

interface SecurityState {
  biometricLockEnabled: boolean;
  /** True whenever the app should be showing the lock overlay — set on cold
   * start (if enabled) and on every foreground resume, cleared on a
   * successful unlock. Owned here (not local component state) so it survives
   * remounts of `BiometricGate`. */
  isLocked: boolean;
  /** Read the persisted preference. Call once at startup. */
  hydrate: () => void;
  /** Turning ON requires passing a real biometric check first, so a user
   * can never enable a lock they can't actually pass. Turning OFF is
   * immediate. */
  setBiometricLockEnabled: (enabled: boolean) => Promise<SetBiometricLockResult>;
  lock: () => void;
  unlock: () => void;
}

export const useSecurityStore = create<SecurityState>((set, get) => ({
  biometricLockEnabled: false,
  isLocked: false,

  hydrate: () => {
    let biometricLockEnabled = false;
    try {
      biometricLockEnabled = kvStorage.getBoolean(STORAGE_KEYS.biometricLockEnabled) ?? false;
    } catch {
      // storage unavailable (e.g. Expo Go) — default to off
    }
    set({ biometricLockEnabled, isLocked: biometricLockEnabled });
  },

  setBiometricLockEnabled: async (enabled) => {
    if (!enabled) {
      try {
        kvStorage.set(STORAGE_KEYS.biometricLockEnabled, false);
      } catch {
        // storage unavailable — in-memory preference still applies this session
      }
      set({ biometricLockEnabled: false, isLocked: false });
      return { ok: true };
    }

    const availability = await checkBiometricAvailabilityAsync();
    if (!availability.available) {
      return { ok: false, reason: availability.reason ?? 'no_hardware' };
    }
    const passed = await authenticateWithBiometricsAsync('Enable biometric lock for Mealawe');
    if (!passed) {
      return { ok: false, reason: 'authentication_failed' };
    }
    try {
      kvStorage.set(STORAGE_KEYS.biometricLockEnabled, true);
    } catch {
      // storage unavailable — in-memory preference still applies this session
    }
    set({ biometricLockEnabled: true });
    return { ok: true };
  },

  lock: () => {
    if (get().biometricLockEnabled) set({ isLocked: true });
  },

  unlock: () => set({ isLocked: false }),
}));

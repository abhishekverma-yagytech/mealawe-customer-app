import { create } from 'zustand';

import { STORAGE_KEYS , kvStorage } from '@mealawe/core';

interface VegModeState {
  vegOnly: boolean;
  toggle: () => void;
  /** Read the persisted preference. Call once at startup. */
  hydrate: () => void;
}

/**
 * Global "Pure Veg" preference — lives in Profile (see `profile.tsx`), read
 * directly by any screen that filters on diet (WeeklyMenuSheet, OnDemandHome)
 * rather than threaded down as a prop from Home.
 */
export const useVegModeStore = create<VegModeState>((set, get) => ({
  vegOnly: false,

  toggle: () => {
    const next = !get().vegOnly;
    try {
      kvStorage.set(STORAGE_KEYS.vegOnly, next);
    } catch {
      // storage unavailable (e.g. Expo Go) — in-memory preference still applies
    }
    set({ vegOnly: next });
  },

  hydrate: () => {
    let vegOnly = false;
    try {
      vegOnly = kvStorage.getBoolean(STORAGE_KEYS.vegOnly) ?? false;
    } catch {
      // ignore — default to off
    }
    set({ vegOnly });
  },
}));

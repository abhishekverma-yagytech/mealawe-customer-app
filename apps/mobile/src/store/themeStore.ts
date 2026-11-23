import { Appearance } from 'react-native';
import { create } from 'zustand';

import { STORAGE_KEYS } from '@/config';
import { kvStorage } from '@/services/storage/kvStore';

/** User's theme choice. `system` follows the OS; `light`/`dark` override it. */
export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * Apply a preference to the app. NativeWind v5 + React Navigation + Gluestack all
 * read `Appearance` / RN `useColorScheme()`, so a single `Appearance.setColorScheme`
 * call re-themes the whole app. `'unspecified'` = follow the OS (RN 0.86).
 */
function apply(pref: ThemePreference): void {
  Appearance.setColorScheme(pref === 'system' ? 'unspecified' : pref);
}

interface ThemeState {
  preference: ThemePreference;
  /** Set + persist + apply the preference. */
  setPreference: (pref: ThemePreference) => void;
  /** Read the persisted preference and apply it. Call once at startup. */
  hydrate: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: 'system',

  setPreference: (pref) => {
    try {
      kvStorage.set(STORAGE_KEYS.themePreference, pref);
    } catch {
      // storage unavailable (e.g. Expo Go) — in-memory preference still applies
    }
    apply(pref);
    set({ preference: pref });
  },

  hydrate: () => {
    let pref: ThemePreference = 'system';
    try {
      const stored = kvStorage.getString(STORAGE_KEYS.themePreference);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        pref = stored;
      }
    } catch {
      // ignore — default to system
    }
    apply(pref);
    set({ preference: pref });
  },
}));

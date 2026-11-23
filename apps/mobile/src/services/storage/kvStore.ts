import type { MMKV } from 'react-native-mmkv';

/**
 * Fast synchronous key-value storage (MMKV) for non-sensitive app state:
 * cart drafts, cached lists, flags, last-known location.
 *
 * MMKV v4 is a Nitro native module — it is NOT available in Expo Go and does
 * its native lookup at import time. We therefore `require` it lazily (only the
 * `MMKV` *type* is imported statically, which is erased at runtime), so the app
 * boots even where the native module is absent. Calling any method below in
 * Expo Go will throw — use a Dev Client / native build for MMKV features.
 */
let mmkv: MMKV | null = null;

function store(): MMKV {
  if (!mmkv) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    mmkv = createMMKV({ id: 'mealawe.kv' });
  }
  return mmkv;
}

export const kvStorage = {
  getString(key: string): string | undefined {
    return store().getString(key);
  },

  getBoolean(key: string): boolean | undefined {
    return store().getBoolean(key);
  },

  set(key: string, value: string | number | boolean): void {
    store().set(key, value);
  },

  getObject<T>(key: string): T | null {
    const raw = store().getString(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  setObject<T>(key: string, value: T): void {
    store().set(key, JSON.stringify(value));
  },

  remove(key: string): void {
    store().remove(key);
  },

  clearAll(): void {
    store().clearAll();
  },
};

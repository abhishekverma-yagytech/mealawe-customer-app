import type { KeyValueStore, SecureStore } from '@mealawe/core';

/** localStorage with an in-memory fallback (SSR, private mode, blocked storage). */
function makeBackend() {
  const mem = new Map<string, string>();
  const ls = (): Storage | null => {
    try {
      if (typeof window === 'undefined') return null;
      const k = '__mw_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return window.localStorage;
    } catch {
      return null;
    }
  };
  return {
    get: (key: string): string | undefined => {
      const s = ls();
      if (s) return s.getItem(key) ?? undefined;
      return mem.get(key);
    },
    set: (key: string, value: string) => {
      const s = ls();
      if (s) s.setItem(key, value);
      else mem.set(key, value);
    },
    remove: (key: string) => {
      const s = ls();
      if (s) s.removeItem(key);
      else mem.delete(key);
    },
    clear: () => {
      const s = ls();
      if (s) {
        // Only our own namespace — never wipe unrelated site data.
        Object.keys(s)
          .filter((k) => k.startsWith('mw.'))
          .forEach((k) => s.removeItem(k));
      }
      mem.clear();
    },
  };
}

const backend = makeBackend();

export const webKv: KeyValueStore = {
  getString: (key) => backend.get(key),
  getBoolean: (key) => {
    const v = backend.get(key);
    return v === undefined ? undefined : v === 'true';
  },
  set: (key, value) => backend.set(key, String(value)),
  remove: (key) => backend.remove(key),
  clearAll: () => backend.clear(),
};

/**
 * Session token + profile. localStorage is required (not an httpOnly cookie):
 * the API derives its AES key from the Bearer token, so JS must read it —
 * same trade-off as the Angular web app.
 */
export const webSecure: SecureStore = {
  get: async (key) => backend.get(key) ?? null,
  set: async (key, value) => backend.set(key, value),
  remove: async (key) => backend.remove(key),
};

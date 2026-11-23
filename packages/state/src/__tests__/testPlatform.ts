import { registerPlatform, type KeyValueStore, type SecureStore } from '@mealawe/core';

/** In-memory adapters + a recorder for analytics events, for store tests. */
export function installTestPlatform() {
  const kv = new Map<string, string>();
  const secure = new Map<string, string>();
  const events: { name: string; payload: Record<string, unknown> }[] = [];

  const kvStore: KeyValueStore = {
    getString: (k) => kv.get(k),
    getBoolean: (k) => (kv.has(k) ? kv.get(k) === 'true' : undefined),
    set: (k, v) => void kv.set(k, String(v)),
    remove: (k) => void kv.delete(k),
    clearAll: () => kv.clear(),
  };
  const secureStore: SecureStore = {
    get: async (k) => secure.get(k) ?? null,
    set: async (k, v) => void secure.set(k, v),
    remove: async (k) => void secure.delete(k),
  };
  registerPlatform({ kv: kvStore, secure: secureStore, analytics: { track: (name, payload) => void events.push({ name, payload }) } });
  return { kv, secure, events };
}

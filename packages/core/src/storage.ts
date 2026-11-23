import { getAdapter } from './ports';

/** Typed facades over the platform KeyValueStore / SecureStore adapters (mobile: MMKV + SecureStore; web: localStorage / cookies). */
export const kvStorage = {
  getString: (key: string) => getAdapter('kv').getString(key),
  getBoolean: (key: string) => getAdapter('kv').getBoolean(key),
  set: (key: string, value: string | number | boolean) => getAdapter('kv').set(key, value),
  remove: (key: string) => getAdapter('kv').remove(key),
  clearAll: () => getAdapter('kv').clearAll(),
  getObject<T>(key: string): T | null {
    const raw = getAdapter('kv').getString(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setObject<T>(key: string, value: T): void {
    getAdapter('kv').set(key, JSON.stringify(value));
  },
};

export const secureStorage = {
  get: (key: string) => getAdapter('secure').get(key),
  set: (key: string, value: string) => getAdapter('secure').set(key, value),
  remove: (key: string) => getAdapter('secure').remove(key),
  async getObject<T>(key: string): Promise<T | null> {
    const raw = await getAdapter('secure').get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  async setObject<T>(key: string, value: T): Promise<void> {
    await getAdapter('secure').set(key, JSON.stringify(value));
  },
};

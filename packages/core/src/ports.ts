/**
 * Platform ports. Shared packages depend on these interfaces only; each app
 * injects its implementation (mobile: MMKV / SecureStore / Netcore SDK ...,
 * web: localStorage / cookies / web SDKs ...).
 */
export interface KeyValueStore {
  getString(key: string): string | undefined;
  getBoolean(key: string): boolean | undefined;
  set(key: string, value: string | number | boolean): void;
  remove(key: string): void;
  clearAll(): void;
}

export interface SecureStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface Analytics {
  track(eventName: string, payload: Record<string, unknown>): void;
}

export interface CrashReporter {
  recordError(error: unknown, context?: Record<string, unknown>): void;
}

export interface PaymentGateway {
  /** Start a payment for an order; resolves with the final gateway status. */
  pay(params: { orderId: string; payload: unknown }): Promise<{ status: 'success' | 'failed' | 'cancelled'; raw?: unknown }>;
}

export interface PlatformAdapters {
  kv: KeyValueStore;
  secure: SecureStore;
  analytics: Analytics;
  crash: CrashReporter;
  payment: PaymentGateway;
}

let adapters: Partial<PlatformAdapters> = {};

export function registerPlatform(next: Partial<PlatformAdapters>): void {
  adapters = { ...adapters, ...next };
}

export function tryAdapter<K extends keyof PlatformAdapters>(key: K): PlatformAdapters[K] | undefined {
  return adapters[key] as PlatformAdapters[K] | undefined;
}

export function getAdapter<K extends keyof PlatformAdapters>(key: K): PlatformAdapters[K] {
  const adapter = adapters[key];
  if (!adapter) throw new Error(`[core] platform adapter "${String(key)}" is not registered`);
  return adapter as PlatformAdapters[K];
}

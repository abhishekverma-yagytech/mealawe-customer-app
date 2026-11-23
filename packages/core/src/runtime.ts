/**
 * Platform-injected runtime config for the shared packages.
 *
 * Shared code never reads `process.env`, `__DEV__` or an app-local `env`
 * module directly — each app calls `configureCore()` once at startup
 * (mobile: from its root layout; web: from its root provider).
 */
export interface CoreConfig {
  /** API origin, e.g. https://api.mealawe.com (no trailing slash). */
  serverUrl: string;
  /** Shared AES passphrase used when there is no session token. */
  apiSecretKey: string;
  /** Verbose request/response logging. */
  isDev: boolean;
  /** Value stamped as `registeredPlatform` on auth calls (backend enum; mobile: mealawe_app_android | mealawe_app_ios). */
  registeredPlatform: string;
}

let config: CoreConfig | null = null;

export function configureCore(next: CoreConfig): void {
  config = next;
}

export function getCoreConfig(): CoreConfig {
  if (!config) {
    throw new Error('[core] configureCore() must be called before using http/crypto');
  }
  return config;
}

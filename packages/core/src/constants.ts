/**
 * Static, environment-independent constants.
 * (Store URLs, app name/version, and per-env keys live in `environments.ts` /
 * `env`.)
 */

/** Network defaults. */
export const HTTP = {
  timeoutMs: 30_000,
} as const;

/** Storage keys used across secure + kv stores. */
export const STORAGE_KEYS = {
  sessionToken: 'mw.session.token',
  user: 'mw.user',
  selectedAddress: 'mw.location.address',
  clusters: 'mw.location.clusters',
  cart: 'mw.cart',
  bulkCart: 'mw.cart.bulk',
  onDemandCart: 'mw.cart.ondemand',
  apartmentCart: 'mw.cart.apartment',
  apartmentCartAddress: 'mw.cart.apartment.address',
  apartmentActiveOrders: 'mw.orders.apartment.active',
  themePreference: 'mw.theme.preference',
  vegOnly: 'mw.vegOnly',
  biometricLockEnabled: 'mw.security.biometricLockEnabled',
  reviewPromptState: 'mw.reviewPrompt.state',
  activeTrackedOrder: 'mw.tracking.activeOrder',
  configureContext: 'mw.configure.context',
} as const;

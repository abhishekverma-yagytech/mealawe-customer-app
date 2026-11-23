import { registerLocationProvider, registerSessionContext } from '@mealawe/api';
import { configureCore, registerPlatform, setAuthTokenProvider } from '@mealawe/core';
import { useAuthStore, useClusterStore, useLocationStore } from '@mealawe/state';

import { ENV } from '@/lib/env';

import { webAnalytics } from './analytics';
import { webLocationProvider } from './location';
import { webKv, webSecure } from './storage';

let done = false;

/**
 * Registers every platform port the shared packages need (web equivalent of
 * apps/mobile/src/bootstrap/*). Idempotent. Static config only — it is safe to run during SSR
 * because it never reads per-user data.
 */
export function registerWebPlatform(): void {
  if (done) return;
  done = true;

  configureCore({
    serverUrl: ENV.apiUrl,
    apiSecretKey: ENV.apiSecretKey,
    isDev: ENV.isDev,
    registeredPlatform: ENV.registeredPlatform,
  });
  registerPlatform({
    kv: webKv,
    secure: webSecure,
    analytics: webAnalytics,
    crash: { recordError: (error, context) => console.error('[web]', error, context) },
  });
  registerLocationProvider(webLocationProvider);
  setAuthTokenProvider(() => useAuthStore.getState().token);
  registerSessionContext({
    getProfileId: () => useAuthStore.getState().profile?._id,
    getClusters: () => useClusterStore.getState().clusters,
    getClusterIds: () => useClusterStore.getState().clusterIds(),
    getCurrentConfigName: () => useClusterStore.getState().currentConfigName(),
    getGeolocation: () => useLocationStore.getState().current?.geolocation,
  });
}

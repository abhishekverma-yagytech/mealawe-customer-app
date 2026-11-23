'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { useAuthStore, useBulkCartStore, useCartStore, useClusterStore, useConfigureStore, useLocationStore, useOnDemandCartStore, useVegModeStore } from '@mealawe/state';

import { ApartmentEligibilityResolver } from '@/components/apartment/ApartmentEligibilityResolver';
import { useApartmentCartStore } from '@/features/apartment/cartStore';
import { assertEnv } from '@/lib/env';
import { registerWebPlatform } from '@/platform/register';

// Register at module load so it is in place before any child touches http/stores.
registerWebPlatform();

const BootContext = createContext<{ ready: boolean; missingEnv: string[] }>({ ready: false, missingEnv: [] });

/** True once auth + location + cluster state have been restored from storage. */
export const useBoot = () => useContext(BootContext);

let started = false;

/**
 * Web equivalent of mobile's `initStores()` + RootLayout hydrate effect.
 * Order matters (see apps/mobile/src/store/index.ts): hydrate persisted state, then auth,
 * then the saved address (needs the profile), then cluster detection — once, from here only.
 */
export function AppBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const missingEnv = assertEnv();

  useEffect(() => {
    if (started || missingEnv.length > 0) {
      // StrictMode double-invoke / missing config: don't start twice, don't fire requests without config.
      if (started) setReady(true);
      return;
    }
    started = true;
    let cancelled = false;

    useVegModeStore.getState().hydrate();
    useLocationStore.getState().hydrate();
    useClusterStore.getState().hydrate();
    useCartStore.getState().hydrate();
    useBulkCartStore.getState().hydrate();
    useOnDemandCartStore.getState().hydrate();
    useApartmentCartStore.getState().hydrate();
    useConfigureStore.getState().hydrate(); // survive a page refresh mid-flow

    // Saved addresses come from the profile: re-sync whenever it loads/changes.
    useAuthStore.subscribe((state, prev) => {
      if (state.profile !== prev.profile) useLocationStore.getState().hydrate();
    });

    (async () => {
      await useAuthStore.getState().hydrate();
      useLocationStore.getState().hydrate();
      const geo = useLocationStore.getState().current?.geolocation;
      if (geo) void useClusterStore.getState().detectClusters(geo);
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [missingEnv.length]);

  return (
    <BootContext.Provider value={{ ready, missingEnv }}>
      {ready ? <ApartmentEligibilityResolver /> : null}
      {children}
    </BootContext.Provider>
  );
}

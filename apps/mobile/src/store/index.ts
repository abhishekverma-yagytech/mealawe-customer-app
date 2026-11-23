import { useActiveOrdersStore } from '@/features/apartment/useActiveOrdersStore';
import { useApartmentCartStore } from '@/features/apartment/useApartmentCartStore';
import { useBulkCartStore } from '@/features/bulk/useBulkCartStore';
import { useOnDemandCartStore } from '@/features/on-demand/useOnDemandCartStore';
import { useSecurityStore } from '@/features/security';
import { setAuthTokenProvider } from '@/services/http';

import { useAuthStore } from './authStore';
import { useCartStore } from './cartStore';
import { useClusterStore } from './clusterStore';
import { useLocationStore } from './locationStore';
import { useThemeStore } from './themeStore';
import { useVegModeStore } from './vegModeStore';

/** Call once at startup to connect stores to cross-cutting services. */
export function initStores(): void {
  // HTTP client reads the token straight from the auth store on each request.
  setAuthTokenProvider(() => useAuthStore.getState().token);
  // Apply the persisted theme preference before first render (no flash).
  useThemeStore.getState().hydrate();
  useVegModeStore.getState().hydrate();
  // Seed the persisted delivery address before anything reads `current` —
  // the profile isn't hydrated yet at this point, so `saved` (which needs
  // it) comes back empty here, but that's corrected below once the profile
  // loads. Doing this now (instead of only in _layout.tsx's later, async
  // auth-hydrate callback) closes a boot race: the app/index.tsx boot gate,
  // LocationSplash, and Home's screen all read `current` on their very
  // first render, and without this they'd see `null` for a returning user
  // who actually has a saved address — wrongly taking their "no address"
  // branch — until the later hydrate flips it, which reads as the address
  // (and any UI gated on it) "resetting" a few ms after first paint.
  useLocationStore.getState().hydrate();
  // Seed cached clusters from storage only — do NOT trigger detectClusters()
  // here. `current` at this point is pre-profile-hydrate (see the comment
  // above) and may not match the address `RootLayout`'s post-auth-hydrate
  // effect resolves a moment later. Firing detectClusters() from both places
  // raced two writes to clusterStore's `clusters`: this call could resolve a
  // real cluster and render content, then the later, more-authoritative call
  // would overwrite it with a different (possibly empty/unserviceable)
  // cluster, reading as data flashing in and then disappearing within ms.
  // `RootLayout`'s effect (src/app/_layout.tsx) is the single trigger point.
  useClusterStore.getState().hydrate();
  // Restore any in-progress cart.
  useCartStore.getState().hydrate();
  useBulkCartStore.getState().hydrate();
  useOnDemandCartStore.getState().hydrate();
  useApartmentCartStore.getState().hydrate();
  // Resume polling any apartment order that was still active when the app
  // was last closed — see useActiveOrdersStore's own doc.
  useActiveOrdersStore.getState().hydrate();
  // Restore the biometric-lock preference (and engage the lock immediately
  // if it was on) before first render.
  useSecurityStore.getState().hydrate();

  // Keep saved addresses in sync when the profile loads/changes after boot
  // (login fetches the profile async — its addressList must reflow into the store).
  useAuthStore.subscribe((state, prev) => {
    if (state.profile !== prev.profile) {
      useLocationStore.getState().hydrate();
    }
  });
}

export { useAuthStore, clearStaleSessionOnFreshInstall } from './authStore';
export { resetCartStores } from './resetOnLogout';
export { useThemeStore, type ThemePreference } from './themeStore';
export { useVegModeStore } from './vegModeStore';
export { useClusterStore } from './clusterStore';
export { useCartStore } from './cartStore';
export { useBulkCartStore } from '@/features/bulk/useBulkCartStore';
export { useOnDemandCartStore } from '@/features/on-demand/useOnDemandCartStore';
export { useApartmentCartStore } from '@/features/apartment/useApartmentCartStore';
export { useSecurityStore } from '@/features/security';
export {
  useLocationStore,
  type Address,
  type GeoPoint,
  type TagLocation,
} from './locationStore';
export type { Cluster } from '@/features/location/types';

import { Redirect } from 'expo-router';
import { useState } from 'react';

import { LocationSplash } from '@/components/LocationSplash';
import { useAuthStore, useLocationStore } from '@/store';

/**
 * Boot gate. The native OS splash hands off directly to `LocationSplash` —
 * shown on every cold launch, no separate branded splash in between — which
 * detects the user's current location. Once that step finishes (and the
 * auth store has hydrated), routes:
 *   - not authenticated          -> /login (the old /welcome carousel is
 *                                  gone — straight to sign-in now)
 *   - authenticated, no profile  -> /register
 *   - authenticated + profile    -> /(tabs)
 */
export default function Index() {
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const needsProfile = useAuthStore((s) => s.needsProfile);
  const currentAddress = useLocationStore((s) => s.current);

  const [locationStepDone, setLocationStepDone] = useState(false);

  if (!locationStepDone || !isHydrated) {
    return <LocationSplash hasAddress={!!currentAddress} onDone={() => setLocationStepDone(true)} />;
  }

  if (!isAuthenticated) return <Redirect href="/login" />;
  if (needsProfile) return <Redirect href="/register" />;
  return <Redirect href="/(tabs)" />;
}

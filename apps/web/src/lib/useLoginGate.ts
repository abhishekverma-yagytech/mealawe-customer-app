'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { useAuthStore } from '@mealawe/state';

/**
 * Guest-friendly login gate. Browsing is anonymous; call the returned function at the moment a guest commits (adds to the cart).
 * Returns true when logged in; otherwise sends the guest to /login (which explains why) and brings them back to this exact page
 * afterwards, and returns false — the caller must stop.
 */
export function useLoginGate(): (reason?: 'cart') => boolean {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (reason = 'cart') => {
      if (useAuthStore.getState().isAuthenticated) return true;
      const here = pathname + window.location.search;
      router.push(`/login?redirect=${encodeURIComponent(here)}&reason=${reason}`);
      return false;
    },
    [router, pathname],
  );
}

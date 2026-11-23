'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuthStore } from '@mealawe/state';

import { useBoot } from '@/components/AppBootstrap';

/**
 * Redirects guests to /login?redirect=<here>. Returns true once the user is authenticated.
 * Reads the query string from `window.location` inside the effect (not `useSearchParams`) so any
 * page can use this hook without needing its own <Suspense> boundary for static prerender.
 */
export function useRequireLogin(): boolean {
  const { ready } = useBoot();
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname + window.location.search)}`);
    }
  }, [ready, isAuthenticated, pathname, router]);

  return ready && isAuthenticated;
}

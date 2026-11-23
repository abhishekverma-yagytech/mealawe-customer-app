'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { useAuthStore, useLocationStore } from '@mealawe/state';

import { useBoot } from '@/components/AppBootstrap';
import { Spinner } from '@/components/ui/Skeleton';

const LOCATION_CAP_MS = 9000;

/** Boot gate: wait for hydration, resolve location once, then open Home. Browsing is anonymous; login happens later (add to cart etc.). */
export default function BootGate() {
  const router = useRouter();
  const { ready, missingEnv } = useBoot();
  const ran = useRef(false);

  useEffect(() => {
    if (!ready || ran.current) return;
    ran.current = true;
    (async () => {
      const loc = useLocationStore.getState();
      if (!loc.current) {
        // No saved address: try GPS, but never block the app longer than the cap.
        await Promise.race([loc.useCurrentLocation(), new Promise((r) => setTimeout(r, LOCATION_CAP_MS))]).catch(() => undefined);
      }
      const { isAuthenticated, needsProfile } = useAuthStore.getState();
      router.replace(isAuthenticated && needsProfile ? '/register' : '/home');
    })();
  }, [ready, router]);

  if (missingEnv.length > 0) {
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-xl font-black">Configuration missing</h1>
        <p className="mt-2 text-muted-foreground">Set {missingEnv.join(', ')} (see apps/web/.env.example) and restart.</p>
      </main>
    );
  }
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-gradient-to-b from-primary-dark to-[#042a33] text-white">
      <h1 className="text-4xl font-black">Mealawe</h1>
      <Spinner className="border-white border-t-transparent" />
      <p className="text-white/80">Finding kitchens near you…</p>
    </main>
  );
}

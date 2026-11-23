'use client';

import Link from 'next/link';

import { useClusterStore, useLocationStore } from '@mealawe/state';

import { Button } from '@/components/ui/Button';

/** Shown when the selected address is outside every cluster (mobile NotServiceableHome). */
export function NotServiceable() {
  const detecting = useClusterStore((s) => s.detecting);
  const detectClusters = useClusterStore((s) => s.detectClusters);
  const current = useLocationStore((s) => s.current);
  return (
    <section className="mx-auto mt-10 max-w-md rounded-3xl border border-border bg-card p-6 text-center">
      <h2 className="text-2xl font-black">We&apos;re not here yet</h2>
      <p className="mt-2 text-muted-foreground">Mealawe doesn&apos;t deliver to this location yet. Try another address, or check again.</p>
      <div className="mt-5 flex flex-col gap-2">
        <Button asChild>
          <Link href="/addresses">Change location</Link>
        </Button>
        <Button variant="outline" disabled={detecting || !current?.geolocation} onClick={() => current?.geolocation && void detectClusters(current.geolocation)}>
          {detecting ? 'Checking…' : 'Bring Mealawe here'}
        </Button>
      </div>
    </section>
  );
}

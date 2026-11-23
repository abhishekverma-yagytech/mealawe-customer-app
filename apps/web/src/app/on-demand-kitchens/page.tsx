'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { loadNearestKitchens } from '@mealawe/api';
import type { OnDemandKitchen, OnDemandMode } from '@mealawe/core';
import { useClusterStore } from '@mealawe/state';

import { Page, PageHeader } from '@/components/layout/PageHeader';
import { KitchenGrid } from '@/components/on-demand/KitchenGrid';
import { Skeleton } from '@/components/ui/Skeleton';

function Content() {
  const mode = (useSearchParams().get('mode') === 'advance' ? 'advance' : 'allDay') as OnDemandMode;
  const serviceable = useClusterStore((s) => s.clusters.length > 0);
  const [kitchens, setKitchens] = useState<OnDemandKitchen[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    loadNearestKitchens(mode).then((r) => { if (active) { setKitchens(r); setLoading(false); } });
    return () => { active = false; };
  }, [mode]);
  return (
    <>
      <PageHeader title={mode === 'advance' ? 'Order in advance' : 'Kitchens near you'} />
      <Page>
        {loading ? <Skeleton className="h-64" /> : !serviceable ? <p className="text-muted-foreground">We don&apos;t deliver to your location yet.</p> : <KitchenGrid kitchens={kitchens} mode={mode} />}
      </Page>
    </>
  );
}
export default function Kitchens() { return <Suspense><Content /></Suspense>; }

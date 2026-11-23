'use client';

import { MapPin, Star } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { loadKitchenMenu, loadKitchenProfile } from '@mealawe/api';
import type { OnDemandKitchen, OnDemandMenuItem, OnDemandMode } from '@mealawe/core';

import { Page, PageHeader } from '@/components/layout/PageHeader';
import { KitchenMenuView } from '@/components/on-demand/KitchenMenuView';
import { Skeleton } from '@/components/ui/Skeleton';

function Content() {
  const router = useRouter();
  const params = useSearchParams();
  const kitchenId = params.get('kitchenId');
  const mode = (params.get('mode') === 'advance' ? 'advance' : 'allDay') as OnDemandMode;
  const [state, setState] = useState<{ kitchen: OnDemandKitchen | null; items: OnDemandMenuItem[] } | null>(null);

  useEffect(() => {
    if (!kitchenId) { router.replace('/home?tab=ondemand'); return; }
    let active = true;
    Promise.all([loadKitchenProfile(kitchenId), loadKitchenMenu(kitchenId)]).then(([kitchen, items]) => active && setState({ kitchen, items })).catch(() => active && setState({ kitchen: null, items: [] }));
    return () => { active = false; };
  }, [kitchenId, router]);

  return (
    <>
      <PageHeader title={state?.kitchen?.kitchenName ?? 'Kitchen'} />
      <Page>
        {!state ? <Skeleton className="h-64" /> : !state.kitchen ? <p className="text-muted-foreground">This kitchen isn&apos;t available right now.</p> : (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-black">{state.kitchen.kitchenName}</h2>
              <p className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                {state.kitchen.rating ? <span className="flex items-center gap-1 font-bold text-rating"><Star className="size-4 fill-current" />{state.kitchen.rating.toFixed(1)}</span> : null}
                {state.kitchen.mainSpeciality ? <span>{state.kitchen.mainSpeciality}</span> : null}
                {typeof state.kitchen.distance === 'number' ? <span className="flex items-center gap-1"><MapPin className="size-4" />{state.kitchen.distance.toFixed(1)} km</span> : null}
              </p>
            </div>
            <KitchenMenuView kitchen={state.kitchen} items={state.items} initialMode={mode} />
          </div>
        )}
      </Page>
    </>
  );
}
export default function KitchenPage() { return <Suspense><Content /></Suspense>; }

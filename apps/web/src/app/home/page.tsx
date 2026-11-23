'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { useVisibleOrderModes, type OrderModeKey } from '@mealawe/hooks';
import { useClusterStore, useLocationStore, useVegModeStore } from '@mealawe/state';

import { useApartmentEligibilityStore } from '@/features/apartment/eligibility';

import { useBoot } from '@/components/AppBootstrap';
import { BulkHome } from '@/components/home/BulkHome';
import { DineInHome } from '@/components/home/DineInHome';
import { OutsideServiceAreaBanner, RainBanner } from '@/components/home/HomeBanners';
import { LottieHero } from '@/components/home/LottieHero';
import { NotServiceable } from '@/components/home/NotServiceable';
import { OnDemandHome } from '@/components/home/OnDemandHome';
import { OrderTabs } from '@/components/home/OrderTabs';
import { SubscriptionHome } from '@/components/home/SubscriptionHome';
import { Switch } from '@/components/ui/Switch';
import { Skeleton } from '@/components/ui/Skeleton';
import { BottomNav } from '@/components/layout/BottomNav';
import { OpenOrdersRibs } from '@/components/orders/OpenOrdersRibs';
import { TopNav } from '@/components/layout/TopNav';

const KEYS: OrderModeKey[] = ['subscription', 'bulk', 'dinein', 'ondemand'];

function HomeContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { ready } = useBoot();
  const current = useLocationStore((s) => s.current);
  const gettingLocation = useLocationStore((s) => s.gettingLocation);
  const clusters = useClusterStore((s) => s.clusters);
  const detecting = useClusterStore((s) => s.detecting);
  const hasDetected = useClusterStore((s) => s.hasDetected);
  const vegOnly = useVegModeStore((s) => s.vegOnly);
  const toggleVeg = useVegModeStore((s) => s.toggle);
  const visible = useVisibleOrderModes();
  const apartment = useApartmentEligibilityStore((s) => s.apartment);
  const apartmentHere = !!apartment;

  // Safety nets (mobile (tabs)/index.tsx): resolve location / clusters if boot didn't.
  useEffect(() => {
    if (ready && !current && !gettingLocation) void useLocationStore.getState().useCurrentLocation();
  }, [ready, current, gettingLocation]);
  useEffect(() => {
    if (ready && current?.geolocation && !hasDetected && !detecting) void useClusterStore.getState().detectClusters(current.geolocation);
  }, [ready, current, hasDetected, detecting]);

  const outside = !!current && hasDetected && !detecting && clusters.length === 0;
  // Apartment is the only thing offered here (outside every delivery cluster): make it the default landing page.
  useEffect(() => {
    if (ready && outside && apartment) router.replace('/apartment');
  }, [ready, outside, apartment, router]);
  const requested = params.get('tab') as OrderModeKey | null;
  const active: OrderModeKey = requested && KEYS.includes(requested) && visible.has(requested) ? requested : (KEYS.find((k) => visible.has(k)) ?? 'subscription');
  const setTab = (k: OrderModeKey) => router.replace(`/home?tab=${k}`, { scroll: false });

  return (
    <>
      <TopNav />
      <RainBanner />
      <OutsideServiceAreaBanner active={outside && apartment === null} />
      {!outside || apartmentHere ? <OrderTabs visible={outside ? new Set<OrderModeKey>() : visible} active={active} onChange={setTab} apartment={apartmentHere} /> : null}
      <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-5 sm:px-8 lg:px-12">
        {!ready ? (
          <Skeleton className="h-64" />
        ) : !current ? (
          <section className="mt-10 text-center">
            <h2 className="text-xl font-black">Set your delivery location</h2>
            <p className="mt-1 text-muted-foreground">{gettingLocation ? 'Detecting your location…' : 'Allow location access or choose an address to see kitchens near you.'}</p>
            <Link href="/addresses" className="mt-4 inline-block rounded-card bg-primary px-5 py-3 font-bold text-primary-foreground">Choose location</Link>
          </section>
        ) : outside && apartment === undefined ? (
          <Skeleton className="h-64" />
        ) : outside && apartment ? (
          // Outside every delivery cluster but inside an apartment complex: Apartment is the only thing offered (same as mobile).
          <section className="mx-auto mt-10 max-w-md text-center">
            <h2 className="text-xl font-black">Apartment ordering is available here</h2>
            <p className="mt-1 text-muted-foreground">{apartment.apartmentName ?? 'Your apartment complex'} has kitchens you can order from.</p>
            <Link href="/apartment" className="mt-4 inline-block rounded-card bg-primary px-5 py-3 font-bold text-primary-foreground">Browse apartment menu</Link>
          </section>
        ) : outside ? (
          <NotServiceable />
        ) : (
          <>
            <div className="mb-5"><LottieHero tab={active} /></div>
            <div className="mb-4 flex items-center justify-end gap-2 text-sm font-bold">
              <span id="veg-label">Veg only</span>
              <Switch label="Veg only" checked={vegOnly} onCheckedChange={() => toggleVeg()} />
            </div>
            {active === 'subscription' ? <SubscriptionHome /> : null}
            {active === 'bulk' ? <BulkHome /> : null}
            {active === 'dinein' ? <DineInHome /> : null}
            {active === 'ondemand' ? <OnDemandHome /> : null}
          </>
        )}
      </main>
      <OpenOrdersRibs />
      <BottomNav />
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}

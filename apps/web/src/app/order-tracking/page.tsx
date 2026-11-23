'use client';

import { Clock, Phone } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { fetchFoodOrder, normalizeLatLng, type TrackingParams } from '@mealawe/api';
import { useTrackingStore } from '@mealawe/state';

import { Page, PageHeader } from '@/components/layout/PageHeader';
import { TrackingMap } from '@/components/orders/TrackingMap';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useRequireLogin } from '@/lib/useRequireLogin';

function Content() {
  const authed = useRequireLogin();
  const orderId = useSearchParams().get('orderId');
  const start = useTrackingStore((s) => s.start);
  const stop = useTrackingStore((s) => s.stop);
  const runner = useTrackingStore((s) => s.runnerLocation);
  const route = useTrackingStore((s) => s.routePath);
  const eta = useTrackingStore((s) => s.etaText);
  const status = useTrackingStore((s) => s.status);
  const [params, setParams] = useState<TrackingParams | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!authed || !orderId) return;
    let active = true;
    fetchFoodOrder(orderId).then((o) => {
      if (!active) return;
      const raw = (o ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const destination = normalizeLatLng(raw.customerLocation?.geolocation ?? raw.customerLocation?.location);
      if (!o || !destination) return setFailed(true);
      setParams({ orderId, shiftId: raw.shiftId ?? null, deliveryTaskId: raw.deliveryTaskId ?? null, deliveryVendor: raw.deliveryVendor ?? null, destination, initialRunnerLocation: normalizeLatLng(raw.runner?.location) });
    });
    return () => { active = false; };
  }, [authed, orderId]);

  useEffect(() => {
    if (!params) return;
    start(params);
    return () => stop(params.orderId);
  }, [params, start, stop]);

  if (!authed) return null;
  const activeRunner = runner ?? params?.initialRunnerLocation ?? null;
  return (
    <>
      <PageHeader title="Track order" />
      <Page narrow>
        {failed || !orderId ? <p className="py-10 text-center text-muted-foreground">Live tracking isn&apos;t available for this order.</p> : !params ? <Skeleton className="h-96" /> : (
          <div className="space-y-4">
            <TrackingMap destination={params.destination} runner={activeRunner} route={route} />
            <Card className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3"><Clock className="size-6 text-info" /><div><p className="font-black">{status === 'loading' ? 'Locating your order…' : eta ? 'On the way' : 'Preparing your order'}</p><p className="text-xs text-muted-foreground">Updates automatically</p></div></div>
              {eta ? <span className="rounded-card bg-primary/15 px-3 py-2 font-bold text-primary-dark">{eta}</span> : null}
            </Card>
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Phone className="size-4" />Need to reach your delivery partner? Contact support from Help.</p>
          </div>
        )}
      </Page>
    </>
  );
}

export default function TrackingPage() { return <Suspense><Content /></Suspense>; }

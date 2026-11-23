'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { type OrderSummary } from '@mealawe/core';
import { useSubscriptionOrders } from '@mealawe/hooks';
import { useOrderStore } from '@mealawe/state';

import { BottomNav } from '@/components/layout/BottomNav';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { OrderFilters, type DateRange } from '@/components/orders/OrderFilters';
import { OrderRow } from '@/components/orders/OrderRow';
import { PendingPaymentBanner } from '@/components/orders/PendingPaymentBanner';
import { Skeleton } from '@/components/ui/Skeleton';
import { useRequireLogin } from '@/lib/useRequireLogin';

type StatusKey = 'all' | 'placed' | 'accepted' | 'paymentFailed';
const CHIPS: { key: StatusKey; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'placed', label: 'Placed' }, { key: 'accepted', label: 'Accepted' }, { key: 'paymentFailed', label: 'Failed' }];

export default function OrdersPage() {
  const router = useRouter();
  const authed = useRequireLogin();
  const { loading, error, ongoing, past, isEmpty, reload } = useSubscriptionOrders();
  const select = useOrderStore((s) => s.select);
  const [status, setStatus] = useState<StatusKey>('all');
  const [range, setRange] = useState<DateRange | null>(null);

  const match = (o: OrderSummary) => (status === 'all' || o.status === status) && (!range || ((o.date?.slice(0, 10) ?? '') >= range.from && (o.date?.slice(0, 10) ?? '') <= range.to));
  const fOngoing = useMemo(() => ongoing.filter(match), [ongoing, status, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const fPast = useMemo(() => past.filter(match), [past, status, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (o: OrderSummary) => { select(o); router.push(`/order-detail?id=${encodeURIComponent(o.id)}`); };
  const manage = (o: OrderSummary) => router.push(`/manage-subscription?orderId=${encodeURIComponent(o.id)}`);

  if (!authed) return null;
  const section = (title: string, list: OrderSummary[]) => list.length === 0 ? null : (
    <section aria-label={title} className="space-y-2">
      <h2 className="text-lg font-black">{title}</h2>
      {list.map((o) => <OrderRow key={o.id} order={o} onOpen={() => (title === 'Ongoing' ? manage(o) : open(o))} />)}
    </section>
  );

  return (
    <>
      <PageHeader title="Your orders" right={<Link href="/help" className="text-sm font-bold text-primary">Help</Link>} />
      <Page narrow>
        <div className="space-y-5">
          <PendingPaymentBanner />
          {!loading && !isEmpty ? <OrderFilters chips={CHIPS} status={status} onStatus={setStatus} range={range} onRange={setRange} /> : null}
          {loading ? <Skeleton className="h-48" /> : error ? (
            <div className="text-center"><p>{error}</p><button onClick={reload} className="mt-2 font-bold text-primary">Retry</button></div>
          ) : isEmpty ? <p className="py-10 text-center text-muted-foreground">Your subscription deliveries will show up here once you place an order.</p> : fOngoing.length + fPast.length === 0 ? <p className="text-muted-foreground">No orders match these filters.</p> : (
            <>{section('Ongoing', fOngoing)}{section('Past', fPast)}</>
          )}
        </div>
      </Page>
      <BottomNav />
    </>
  );
}

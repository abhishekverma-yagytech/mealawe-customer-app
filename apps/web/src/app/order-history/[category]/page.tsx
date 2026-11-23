'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { statusGroup, type OrderSummary, type StatusGroup } from '@mealawe/core';
import { useOrderStore } from '@mealawe/state';

import { Page, PageHeader } from '@/components/layout/PageHeader';
import { OrderFilters, type DateRange } from '@/components/orders/OrderFilters';
import { OrderRow } from '@/components/orders/OrderRow';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { getOrderHistoryCategory } from '@/lib/orderCategories';
import { useRequireLogin } from '@/lib/useRequireLogin';

type Key = 'all' | StatusGroup;
const CHIPS: { key: Key; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'ongoing', label: 'Ongoing' }, { key: 'completed', label: 'Completed' }, { key: 'cancelled', label: 'Cancelled' }];

export default function OrderHistoryCategoryPage() {
  const router = useRouter();
  const authed = useRequireLogin();
  const { category: key } = useParams<{ category: string }>();
  const category = getOrderHistoryCategory(key);
  const select = useOrderStore((s) => s.select);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(1);
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState<Key>('all');
  const [range, setRange] = useState<DateRange | null>(null);

  const loadPage = useCallback(async (p: number, replace: boolean) => {
    if (!category) return;
    const rows = await category.load(p);
    setOrders((prev) => (replace ? rows : [...prev, ...rows]));
    setDone(rows.length === 0);
  }, [category]);

  useEffect(() => {
    if (!category || !authed) return;
    setLoading(true);
    setPage(1);
    loadPage(1, true).finally(() => setLoading(false));
  }, [category, authed, loadPage]);

  const filtered = useMemo(() => orders.filter((o) => (status === 'all' || statusGroup(o.status) === status) && (!range || ((o.date?.slice(0, 10) ?? '') >= range.from && (o.date?.slice(0, 10) ?? '') <= range.to))), [orders, status, range]);

  if (!authed) return null;
  if (!category) return <Page narrow><p className="py-10 text-center">Unknown order category.</p></Page>;
  const open = (o: OrderSummary) => { select(o); router.push(`/order-detail?id=${encodeURIComponent(o.id)}`); };

  return (
    <>
      <PageHeader title={category.title} />
      <Page narrow>
        <div className="space-y-4">
          {!loading && orders.length > 0 ? <OrderFilters chips={CHIPS} status={status} onStatus={setStatus} range={range} onRange={setRange} /> : null}
          {loading ? <Skeleton className="h-48" /> : orders.length === 0 ? <p className="py-10 text-center text-muted-foreground">{category.emptyMessage}</p> : filtered.length === 0 ? <p className="text-muted-foreground">No orders match these filters.</p> : (
            <ul className="space-y-2">{filtered.map((o) => <li key={o.id}><OrderRow order={o} onOpen={() => open(o)} /></li>)}</ul>
          )}
          {!loading && !done && orders.length > 0 ? <Button variant="outline" block disabled={more} onClick={async () => { setMore(true); const next = page + 1; await loadPage(next, false); setPage(next); setMore(false); }}>{more ? 'Loading…' : 'Load more'}</Button> : null}
        </div>
      </Page>
    </>
  );
}

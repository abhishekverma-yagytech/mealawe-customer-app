'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { formatINR } from '@mealawe/core';
import { useAuthStore } from '@mealawe/state';

import { Page, PageHeader } from '@/components/layout/PageHeader';
import { BottomNav } from '@/components/layout/BottomNav';
import { PendingPaymentBanner } from '@/components/orders/PendingPaymentBanner';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { loadOrderHistory } from '@/features/apartment/api';
import { APARTMENT_TONE_CLASS, apartmentOrderStatusLabel, apartmentOrderStatusTone } from '@/features/apartment/orderStatus';
import { ORDER_TYPES, ORDER_TYPE_LABEL, isoDateLabel } from '@/features/apartment/pricing';
import type { ApartmentOrder, OrderType } from '@/features/apartment/types';
import { cn } from '@/lib/cn';
import { useRequireLogin } from '@/lib/useRequireLogin';

export default function ApartmentOrdersPage() {
  const authed = useRequireLogin();
  const customerId = useAuthStore((s) => s.profile?._id);
  const [orders, setOrders] = useState<ApartmentOrder[] | null>(null);
  const [type, setType] = useState<OrderType | 'all'>('all');

  useEffect(() => {
    if (!authed || !customerId) return;
    let active = true;
    loadOrderHistory(customerId).then((o) => active && setOrders(o));
    return () => {
      active = false;
    };
  }, [authed, customerId]);

  const shown = (orders ?? []).filter((o) => type === 'all' || o.orderType === type).sort((a, b) => (b.orderDate ?? '').localeCompare(a.orderDate ?? ''));

  return (
    <>
      <PageHeader title="Apartment orders" />
      <Page narrow>
        <div className="mb-4"><PendingPaymentBanner /></div>
        <div role="tablist" aria-label="Order type" className="mb-4 flex gap-2 overflow-x-auto">
          {(['all', ...ORDER_TYPES] as const).map((t) => (
            <button key={t} role="tab" aria-selected={type === t} onClick={() => setType(t)} className={cn('shrink-0 rounded-full px-4 py-2 text-sm font-bold', type === t ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
              {t === 'all' ? 'All' : ORDER_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        {orders === null ? (
          <Skeleton className="h-40" />
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">No apartment orders yet. <Link href="/apartment" className="font-bold text-primary">Browse the menu</Link></p>
        ) : (
          <ul className="space-y-3">
            {shown.map((o) => (
              <li key={o._id}>
                <Link href={`/apartment/orders/${o._id}`}>
                  <Card className="transition hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black">{ORDER_TYPE_LABEL[o.orderType]}{o.mealType ? ` · ${o.mealType}` : ''}</p>
                        <p className="truncate text-sm text-muted-foreground">#{o.orderNo} · {o.kitchenName}{o.itemServingDate ? ` · ${isoDateLabel(o.itemServingDate)}` : ''}</p>
                        <p className="mt-1 truncate text-sm">{(o.itemList ?? []).map((i) => `${i.count}× ${i.itemName}`).join(', ')}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-black">{formatINR(o.payableAmount)}</p>
                        <span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold', APARTMENT_TONE_CLASS[apartmentOrderStatusTone(o.orderstatus)])}>{apartmentOrderStatusLabel(o.orderstatus)}</span>
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Page>
      <BottomNav />
    </>
  );
}

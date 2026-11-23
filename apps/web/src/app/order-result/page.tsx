'use client';

import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { loadOrderDetail } from '@mealawe/api';
import { formatINR } from '@mealawe/core';

import { loadOrdersByParent } from '@/features/apartment/api';
import { useApartmentCartStore } from '@/features/apartment/cartStore';
import { apartmentOrderStatusLabel } from '@/features/apartment/orderStatus';
import { ORDER_TYPE_LABEL } from '@/features/apartment/pricing';
import type { ApartmentOrder } from '@/features/apartment/types';

import { Page } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { fmtDate } from '@/components/orders/OrderRow';
import { cn } from '@/lib/cn';

type Status = 'success' | 'failed' | 'pending';

const COPY: Record<Status, { title: string; message: string }> = {
  success: { title: 'Order placed!', message: "You're all set — we'll start preparing your order." },
  failed: { title: 'Payment failed', message: "That didn't go through. Your cart is untouched, so you can try again. If any money was deducted, it'll be refunded within 4-5 business days." },
  pending: { title: 'Still confirming your payment', message: "We haven't received the final confirmation from your bank yet. Please don't pay again — check Your Orders in a few minutes. If the payment went through, your order will appear there; if not, any deducted amount is refunded automatically." },
};
const AUTH_EXPIRED = { title: 'Session expired', message: 'Your session expired before this could go through — no payment was made. Please log in again and retry.' };

function Content() {
  const q = useSearchParams();
  const raw = q.get('status');
  const status: Status = raw === 'success' || raw === 'pending' ? raw : 'failed';
  const reason = q.get('reason');
  const mode = q.get('mode'); // absent = Subscription (same convention as mobile)
  const foodOrderId = q.get('foodOrderId');
  const recapTitle = q.get('recapTitle');
  const recapAmount = Number(q.get('recapAmount'));
  const recapDays = q.get('recapDays');
  const copy = status === 'failed' && reason === 'auth-expired' ? AUTH_EXPIRED : COPY[status];

  const apartment = mode === 'apartment';
  const remaining = useApartmentCartStore((s) => s.lines.length);
  const [aptOrders, setAptOrders] = useState<ApartmentOrder[]>([]);
  useEffect(() => {
    if (!apartment || status === 'failed' || !foodOrderId) return;
    let active = true;
    loadOrdersByParent(foodOrderId).then((o) => active && setAptOrders(o));
    return () => { active = false; };
  }, [apartment, status, foodOrderId]);

  const [first, setFirst] = useState<{ date: string; meal: string; address: string } | null>(null);
  useEffect(() => {
    if (status !== 'success' || mode || !foodOrderId) return; // subscription only
    let active = true;
    loadOrderDetail(foodOrderId).then((d) => {
      if (!active || !d) return;
      const r = d.raw as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const dates: string[] = Array.isArray(r.userSelectedDates) ? r.userSelectedDates : [];
      const iso = dates[0] ?? (typeof r.subscriptionStartDate === 'string' ? r.subscriptionStartDate : d.date);
      if (!iso) return;
      setFirst({ date: fmtDate(iso), meal: [r.mealTimeLunch ? 'Lunch' : null, r.mealTimeDinner ? 'Dinner' : null].filter(Boolean).join(' + '), address: r.customerLocation?.location || r.customerLocation?.address || '' });
    });
    return () => { active = false; };
  }, [status, mode, foodOrderId]);

  const Icon = status === 'success' ? CheckCircle2 : status === 'pending' ? Clock : XCircle;
  const tone = status === 'success' ? 'text-primary' : status === 'pending' ? 'text-rating' : 'text-destructive';

  return (
    <Page narrow>
      <div className="flex flex-col items-center py-10 text-center">
        <Icon aria-hidden className={cn('size-20', tone)} />
        <h1 className="mt-5 text-2xl font-black" role="status">{copy.title}</h1>
        <p className="mt-2 max-w-md text-muted-foreground">{copy.message}</p>

        {status !== 'failed' && recapTitle ? (
          <Card className="mt-6 w-full text-left">
            <p className="text-lg font-black">{recapTitle}</p>
            {recapDays ? <p className="text-xs text-muted-foreground">{recapDays} days</p> : null}
            <p className="mt-2 flex justify-between text-sm"><span>{status === 'success' ? 'Amount paid' : 'Amount'}</span><span className="font-bold">{formatINR(recapAmount || 0)}</span></p>
          </Card>
        ) : null}

        {apartment && aptOrders.length > 0 ? (
          <Card className="mt-3 w-full space-y-2 text-left">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Your orders</p>
            {aptOrders.map((o) => (
              <Link key={o._id} href={`/apartment/orders/${o._id}`} className="flex items-center justify-between rounded-card border border-border p-3 hover:bg-muted">
                <span><span className="block font-bold">{ORDER_TYPE_LABEL[o.orderType]}{o.mealType ? ` · ${o.mealType}` : ''}</span><span className="text-xs text-muted-foreground">#{o.orderNo} · {o.kitchenName}</span></span>
                <span className="text-sm font-bold">{apartmentOrderStatusLabel(o.orderstatus)}</span>
              </Link>
            ))}
          </Card>
        ) : null}

        {first ? (
          <Card className="mt-3 w-full text-left">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">First delivery</p>
            <p>{first.date}{first.meal ? ` · ${first.meal}` : ''}</p>
            {first.address ? <p className="text-sm text-muted-foreground">{first.address}</p> : null}
          </Card>
        ) : null}

        <div className="mt-8 flex w-full flex-col gap-2">
          {status === 'failed' ? (
            <>
              <Button asChild size="lg"><Link href={reason === 'auth-expired' ? '/login' : mode === 'bulk' ? '/bulk-cart' : mode === 'ondemand' ? '/on-demand-cart' : mode === 'apartment' ? '/apartment/cart' : '/cart'}>{reason === 'auth-expired' ? 'Log in' : 'Try again'}</Link></Button>
              <Button asChild variant="outline"><Link href="/home">Back to home</Link></Button>
            </>
          ) : (
            <>
              {apartment && remaining > 0 ? <Button asChild size="lg"><Link href="/apartment/cart">Pay for the remaining items</Link></Button> : null}
              <Button asChild size="lg" variant={apartment && remaining > 0 ? 'outline' : 'primary'}><Link href={apartment ? '/apartment/orders' : !mode && status === 'success' && foodOrderId ? `/manage-subscription?orderId=${encodeURIComponent(foodOrderId)}` : '/my-orders'}>{!mode && status === 'success' ? 'Manage subscription' : 'View my orders'}</Link></Button>
              <Button asChild variant="outline"><Link href="/home">Back to home</Link></Button>
            </>
          )}
        </div>
      </div>
    </Page>
  );
}

export default function OrderResultPage() {
  return <Suspense><Content /></Suspense>;
}

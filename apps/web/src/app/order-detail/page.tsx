'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { loadFoodOrdersByPackage, loadOrderDetail, loadPackageOrderDetail } from '@mealawe/api';
import { extractPackageBilling, formatINR, isSameDay, ORDER_STEPS, statusGroup, statusStepIndex, type DailyOrderEntry, type OrderSummary } from '@mealawe/core';
import { useOrderStore } from '@mealawe/state';

import { Page, PageHeader } from '@/components/layout/PageHeader';
import { RescheduleDialog, type RescheduleTarget } from '@/components/orders/RescheduleDialog';
import { BillSummary } from '@/components/cart/CartParts';
import { fmtDate, StatusPill } from '@/components/orders/OrderRow';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { useRequireLogin } from '@/lib/useRequireLogin';
import { pollPayment } from '@/payment/engine';

function Content() {
  const authed = useRequireLogin();
  const id = useSearchParams().get('id');
  const selected = useOrderStore((s) => s.selected);
  const select = useOrderStore((s) => s.select);
  const [order, setOrder] = useState<OrderSummary | null>(selected && (!id || selected.id === id) ? selected : null);
  const [loading, setLoading] = useState(!order);
  const [daily, setDaily] = useState<DailyOrderEntry[]>([]);
  const [checking, setChecking] = useState(false);
  const [payMsg, setPayMsg] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);

  // Refresh-safe: if the in-memory hand-off is gone, load by id (single-order endpoint, then package endpoint).
  useEffect(() => {
    if (!authed || order || !id) return;
    let active = true;
    (async () => {
      const found = (await loadOrderDetail(id)) ?? (await loadPackageOrderDetail(id));
      if (active) {
        if (found) select(found);
        setOrder(found);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [authed, order, id, select]);

  const raw = (order?.raw ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const isParent = Array.isArray(raw.dailyOrderList);

  useEffect(() => {
    if (!isParent || !order?.id) return;
    let active = true;
    loadFoodOrdersByPackage(order.id).then((r) => active && setDaily(r));
    return () => { active = false; };
  }, [isParent, order?.id]);

  if (!authed) return null;
  if (loading) return <><PageHeader title="Order" /><Page narrow><Skeleton className="h-64" /></Page></>;
  if (!order) return <><PageHeader title="Order" /><Page narrow><p className="py-10 text-center text-muted-foreground">We couldn&apos;t find this order.</p></Page></>;

  const group = statusGroup(order.status);
  const step = statusStepIndex(order.status);
  const billing = isParent ? extractPackageBilling(raw) : null;
  const dates: string[] = Array.isArray(raw.userSelectedDates) ? raw.userSelectedDates : [];
  const address: string = raw.customerLocation?.location || raw.customerLocation?.address || '';
  const today = daily.find((d) => d.orderDate && isSameDay(new Date(d.orderDate), new Date()));
  const trackId = isParent ? today?.foodOrderId : order.id;
  // A single delivery of a subscription can be moved while the kitchen has only accepted it (same rule as mobile).
  const canReschedule = !isParent && !!raw.subscriptionMasterId && order.status === 'accepted';
  const rescheduleTarget: RescheduleTarget | null = canReschedule ? { foodOrderId: order.id, packageOrderId: String(raw.subscriptionMasterId), orderNo: order.orderNo, orderDate: order.date, mealType: typeof raw.mealType === 'string' ? raw.mealType : undefined } : null;
  const refreshAfterReschedule = async () => {
    const fresh = await loadOrderDetail(order.id);
    if (fresh) {
      select(fresh);
      setOrder(fresh);
    }
  };
  const trackable = (isParent ? statusStepIndex(today?.orderstatus) : step) === 4;

  // An order still `paymentInprogress` may have been paid (closed tab, slow bank): re-check with the server
  // (same confirm + status logic as the payment return page) instead of making the customer pay twice.
  const checkPayment = async () => {
    setChecking(true);
    setPayMsg(null);
    try {
      const state = await pollPayment({ orderType: order.orderType ?? '', foodOrderId: order.id, order_id: typeof raw.order_id === 'string' ? raw.order_id : undefined }, { attempts: 3, delayMs: 2000 });
      if (state === 'success') {
        const fresh = (await loadOrderDetail(order.id)) ?? (await loadPackageOrderDetail(order.id));
        if (fresh) {
          select(fresh);
          setOrder(fresh);
        }
        setPayMsg('Payment confirmed — your order is placed.');
      } else if (state === 'failed') {
        setPayMsg("This payment didn't go through. If any amount was deducted it will be refunded in 4-5 business days.");
      } else {
        setPayMsg("Still processing — your bank hasn't confirmed yet. Please check again in a moment.");
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <PageHeader title={`Order ${order.orderNo ? `#${order.orderNo}` : ''}`} />
      <Page narrow>
        <div className="space-y-4">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-lg font-black">{order.title}</p><p className="text-sm text-muted-foreground">{[fmtDate(order.date), order.subtitle].filter(Boolean).join(' · ')}</p></div>
              <StatusPill status={order.status} />
            </div>
            <p className="mt-2 text-xl font-black">{formatINR(order.amount)}</p>
            {address ? <p className="mt-2 text-sm text-muted-foreground">Delivering to: {address}</p> : null}
            {dates.length ? <p className="mt-1 text-sm text-muted-foreground">Dates: {dates.slice(0, 3).map((d) => fmtDate(d)).join(', ')}{dates.length > 3 ? ` +${dates.length - 3} more` : ''}</p> : null}
          </Card>

          {!isParent ? (
            group === 'cancelled' ? <Card className="border-nonveg text-nonveg">This order was cancelled.</Card> : (
              <Card>
                <ol className="space-y-3" aria-label="Order progress">
                  {ORDER_STEPS.map((s, i) => (
                    <li key={s.key} className="flex items-center gap-3">
                      <span className={cn('flex size-6 items-center justify-center rounded-full text-xs', i <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{i <= step ? <Check className="size-4" /> : i + 1}</span>
                      <span className={cn(i === step && 'font-bold')}>{s.label}</span>
                    </li>
                  ))}
                </ol>
              </Card>
            )
          ) : (
            <section aria-labelledby="days-h" className="space-y-2">
              <h2 id="days-h" className="text-lg font-black">Deliveries</h2>
              {daily.length === 0 ? <p className="text-sm text-muted-foreground">Delivery schedule will appear here.</p> : (
                <ul className="divide-y divide-border rounded-card border border-border bg-card">
                  {daily.map((d) => (
                    <li key={d.foodOrderId} className="flex items-center justify-between gap-3 p-3">
                      <div><p className="font-bold">{fmtDate(d.orderDate)}</p><p className="text-xs text-muted-foreground">{d.mealType}</p></div>
                      <StatusPill status={d.orderstatus} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {isParent ? <Button asChild block size="lg"><Link href={`/manage-subscription?orderId=${encodeURIComponent(order.id)}`}>Manage subscription</Link></Button> : null}
          {canReschedule ? <Button block variant="outline" onClick={() => setRescheduling(true)}>Reschedule this delivery</Button> : null}
          {trackable && trackId ? <Button asChild block size="lg"><Link href={`/order-tracking?orderId=${encodeURIComponent(trackId)}`}>Track your order</Link></Button> : null}

          {billing ? (
            <BillSummary total={billing.total} rows={[
              { label: 'Items', value: billing.itemAmount },
              { label: 'Discount', value: billing.discount, negative: true },
              { label: `Coupon${billing.couponCode ? ` (${billing.couponCode})` : ''}`, value: billing.couponDiscount, negative: true },
              { label: 'Delivery', value: billing.delivery, original: billing.deliveryOriginal },
              { label: 'Packaging', value: billing.packaging, original: billing.packagingOriginal },
              { label: 'Platform fee', value: billing.platform, original: billing.platformOriginal },
              { label: 'Taxes', value: billing.taxes },
              { label: 'Cashback used', value: billing.cashbackUsed, negative: true },
              { label: 'Wallet used', value: billing.walletUsed, negative: true },
            ]} />
          ) : null}

          {order.status === 'paymentInprogress' ? (
            <Card className="space-y-2">
              <p className="font-bold">Payment not confirmed yet</p>
              <p className="text-sm text-muted-foreground">If you already paid, check the status — please don&apos;t pay again.</p>
              {payMsg ? <p role="status" className="text-sm">{payMsg}</p> : null}
              <Button block variant="outline" disabled={checking} onClick={checkPayment}>{checking ? 'Checking…' : 'Check payment status'}</Button>
            </Card>
          ) : null}

          <Button asChild variant="outline" block><Link href="/help">Need help with this order?</Link></Button>
        </div>
      </Page>
      <RescheduleDialog target={rescheduling ? rescheduleTarget : null} onClose={() => setRescheduling(false)} onRescheduled={refreshAfterReschedule} />
    </>
  );
}

export default function OrderDetailPage() { return <Suspense><Content /></Suspense>; }

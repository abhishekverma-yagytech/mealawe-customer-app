'use client';

import { Check, Phone } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { formatINR } from '@mealawe/core';
import { useAuthStore } from '@mealawe/state';

import { fmtDate } from '@/components/orders/OrderRow';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { loadKitchenAddress, loadKitchenTodayPrepEndTime, loadOrderById, markApartmentOrderDelivered } from '@/features/apartment/api';
import {
  APARTMENT_TONE_CLASS,
  apartmentOrderReadyLabel,
  apartmentOrderStatusLabel,
  apartmentOrderStatusTone,
  apartmentOrderStepIndex,
  apartmentOrderStepTimestamp,
  apartmentOrderSteps,
} from '@/features/apartment/orderStatus';
import { ORDER_TYPE_LABEL } from '@/features/apartment/pricing';
import type { ApartmentOrder } from '@/features/apartment/types';
import { cn } from '@/lib/cn';
import { useRequireLogin } from '@/lib/useRequireLogin';

const TERMINAL = new Set(['delivered', 'pickedUp', 'cancelledByUser', 'cancelledByKitchen', 'rejectedByKitchen', 'autoCancelled', 'refundCompleted', 'paymentFailed']);
const FAILED = new Set(['cancelledByUser', 'cancelledByKitchen', 'rejectedByKitchen', 'autoCancelled', 'refundCompleted', 'paymentFailed']);

function timeOf(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function ApartmentOrderDetailPage() {
  const authed = useRequireLogin();
  const { id } = useParams<{ id: string }>();
  const customerId = useAuthStore((s) => s.profile?._id);
  const [order, setOrder] = useState<ApartmentOrder | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickupAddress, setPickupAddress] = useState<string | null>(null);
  const [prepEnd, setPrepEnd] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setOrder(await loadOrderById(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this order');
    }
  }, [id]);

  useEffect(() => {
    if (authed) void load();
  }, [authed, load]);

  // Live status while the order is in progress.
  useEffect(() => {
    if (!order || TERMINAL.has(order.orderstatus)) return;
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [order, load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!order) return;
    if (order.fulfillmentMode === 'pickup') void loadKitchenAddress(order.kitchenId).then(setPickupAddress);
    if (order.orderType === 'today' && order.mealType) void loadKitchenTodayPrepEndTime(order.kitchenId, order.mealType).then(setPrepEnd);
  }, [order]);

  if (!authed || order === undefined) return <><PageHeader title="Order" /><Page narrow>{error ? <p role="alert" className="text-destructive">{error}</p> : <Skeleton className="h-64" />}</Page></>;
  if (order === null) return <><PageHeader title="Order" /><Page narrow><p className="py-10 text-center text-muted-foreground">We couldn&apos;t find this order.</p></Page></>;

  const mode = order.fulfillmentMode;
  const steps = apartmentOrderSteps(mode);
  const stepIdx = apartmentOrderStepIndex(order.orderstatus, mode);
  const failed = FAILED.has(order.orderstatus);
  const ready = apartmentOrderReadyLabel(order, null, prepEnd);
  // Instant: minutes left on the kitchen's prep clock, which starts when the order was accepted.
  const acceptedAt = order.statusHistory?.find((h) => h.orderstatus === 'accepted')?.updatedOn;
  const minsLeft = order.orderType === 'instant' && order.orderstatus === 'preparing' && acceptedAt && order.estimatedFulfillmentMinutes
    ? Math.max(0, Math.ceil((new Date(acceptedAt).getTime() + order.estimatedFulfillmentMinutes * 60_000 - now) / 60_000))
    : null;
  const phone = order.kitchenmapTelNo || order.kitchenPhoneNo;
  const deliverTo = [order.wingName, order.roomNumber].filter(Boolean).join(' · ');
  const addr = order.customerLocation ? [order.customerLocation.address, order.customerLocation.location, order.customerLocation.landmark].filter(Boolean).join(', ') : '';

  const complete = async () => {
    if (!customerId) return;
    setBusy(true);
    setError(null);
    try {
      setOrder(await markApartmentOrderDelivered(order._id, customerId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark this order complete');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={`Order #${order.orderNo}`} />
      <Page narrow>
        <div className="space-y-4">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-black">{ORDER_TYPE_LABEL[order.orderType]}{order.mealType ? ` · ${order.mealType}` : ''}</p>
                <p className="text-sm text-muted-foreground">{order.kitchenName}{order.orderDate ? ` · ${fmtDate(order.orderDate)}` : ''}</p>
              </div>
              <span className={cn('rounded-full px-3 py-1 text-xs font-bold', APARTMENT_TONE_CLASS[apartmentOrderStatusTone(order.orderstatus)])}>{apartmentOrderStatusLabel(order.orderstatus)}</span>
            </div>
            {minsLeft !== null ? <p className="mt-2 font-bold text-primary">Ready in about {minsLeft} min</p> : ready && !TERMINAL.has(order.orderstatus) ? <p className="mt-2 text-sm font-bold">{ready}</p> : null}
            {phone ? <Button asChild variant="outline" size="sm" className="mt-3"><a href={`tel:${phone}`}><Phone className="size-4" /> Call kitchen</a></Button> : null}
          </Card>

          {!failed ? (
            <Card>
              <ol className="space-y-3" aria-label="Order progress">
                {steps.map((s, i) => {
                  const done = i <= stepIdx;
                  const at = timeOf(apartmentOrderStepTimestamp(order.statusHistory, i, mode));
                  return (
                    <li key={s.key} className="flex items-center gap-3">
                      <span aria-hidden className={cn('flex size-6 items-center justify-center rounded-full border-2', done ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>{done ? <Check className="size-3.5" /> : null}</span>
                      <span className={cn('flex-1', done ? 'font-bold' : 'text-muted-foreground')}>{s.label}</span>
                      <span className="text-xs text-muted-foreground">{at}</span>
                    </li>
                  );
                })}
              </ol>
            </Card>
          ) : null}

          <Card>
            <h2 className="mb-2 font-black">Items</h2>
            <ul className="space-y-1 text-sm">
              {(order.itemList ?? []).map((i, idx) => (
                <li key={idx} className="flex justify-between"><span>{i.count} × {i.itemName}</span><span>{formatINR(i.itemPrice * i.count)}</span></li>
              ))}
            </ul>
          </Card>

          <Card className="text-sm">
            <h2 className="mb-2 font-black">{mode === 'pickup' ? 'Pickup' : 'Delivery'}</h2>
            {mode === 'pickup' ? <p>{pickupAddress ?? order.kitchenName}</p> : <p>{[deliverTo, order.apartmentName].filter(Boolean).join(', ')}{addr ? <span className="block text-muted-foreground">{addr}</span> : null}</p>}
          </Card>

          <Card>
            <h2 className="mb-2 font-black">Bill details</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt>Items</dt><dd>{formatINR(order.itemAmount)}</dd></div>
              {order.deliveryCharges ? <div className="flex justify-between"><dt>Delivery</dt><dd>{formatINR(order.deliveryCharges)}</dd></div> : null}
              {order.platformCharges ? <div className="flex justify-between"><dt>Platform fee</dt><dd>{formatINR(order.platformCharges)}</dd></div> : null}
              {order.packagingCharges ? <div className="flex justify-between"><dt>Packaging</dt><dd>{formatINR(order.packagingCharges)}</dd></div> : null}
              {order.moneyWalletPointsUsed ? <div className="flex justify-between text-primary"><dt>Wallet used</dt><dd>− {formatINR(order.moneyWalletPointsUsed)}</dd></div> : null}
              <div className="flex justify-between border-t border-border pt-2 text-base font-black"><dt>Total</dt><dd>{formatINR(order.payableAmount)}</dd></div>
            </dl>
          </Card>

          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {order.orderstatus === 'readyToDelivery' ? <Button size="lg" block disabled={busy} onClick={complete}>{busy ? 'Updating…' : 'Mark as received'}</Button> : null}
        </div>
      </Page>
    </>
  );
}

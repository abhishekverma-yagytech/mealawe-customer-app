'use client';

import { ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { normalizeLatLng } from '@mealawe/api';
import { statusGroup, statusLabel, statusTone, type OrderSummary } from '@mealawe/core';
import { useOpenOrders } from '@mealawe/hooks';
import { useOrderStore } from '@mealawe/state';

import { cn } from '@/lib/cn';

/** Friendly labels for `FoodOrder.orderType`; the rib only ever lists per-day orders, so "Order #N · <type>" reads the same for every kind. */
const TYPE_LABEL: Record<string, string> = {
  subscription: 'Subscription',
  daily: 'On Demand',
  allDay: 'On Demand',
  advance: 'On Demand',
  dineIn: 'Dine In',
  oyo: 'Oyo',
  apartment_today: 'Apartment',
  apartment_advance: 'Apartment',
  delivery: 'Delivery',
};

const TONE_DOT: Record<string, string> = { food: 'bg-food', info: 'bg-info', location: 'bg-location', plan: 'bg-plan', offer: 'bg-offer', danger: 'bg-destructive', success: 'bg-primary', muted: 'bg-muted-foreground' };
const TONE_TEXT: Record<string, string> = { food: 'text-food', info: 'text-info', location: 'text-location', plan: 'text-plan', offer: 'text-offer', danger: 'text-destructive', success: 'text-primary', muted: 'text-muted-foreground' };

export function ribLabel(order: OrderSummary): { title: string; subtitle: string } {
  const type = order.orderType ? (TYPE_LABEL[order.orderType] ?? order.orderType) : '';
  return { title: order.orderNo ? `Order #${order.orderNo}` : 'Order', subtitle: type };
}

/** Whether the live map can be shown for this order (a rider position and a destination are known, and it isn't finished). */
export function isTrackable(order: OrderSummary): boolean {
  const raw = (order.raw ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const runner = normalizeLatLng(raw.runner?.location ?? raw.runnerLocation);
  const destination = normalizeLatLng(raw.customerLocation?.geolocation ?? raw.customerLocation?.location);
  return !!runner && !!destination && statusGroup(order.status) !== 'cancelled' && order.status !== 'delivered';
}

/**
 * Today's orders that are out for delivery, as a swipeable bar above the floating nav (mobile's BottomOverlayStack, minus
 * its subscribe/continue CTA slide). Up to 3 orders; tapping opens live tracking when available, else the order detail.
 */
export function OpenOrdersRibs() {
  const router = useRouter();
  const orders = useOpenOrders().slice(0, 3);
  const select = useOrderStore((s) => s.select);
  const scroller = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= orders.length && orders.length > 0) {
      setIndex(0);
      scroller.current?.scrollTo({ left: 0 });
    }
  }, [orders.length, index]);

  if (orders.length === 0) return null;

  const open = (o: OrderSummary) => {
    if (isTrackable(o)) return router.push(`/order-tracking?orderId=${encodeURIComponent(o.id)}`);
    select(o);
    router.push(`/order-detail?id=${encodeURIComponent(o.id)}`);
  };

  return (
    <section aria-label="Orders on the way" className="fixed inset-x-3 bottom-[5.5rem] z-30 mx-auto max-w-2xl">
      <ul
        ref={scroller}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]">
        {orders.map((o) => {
          const tone = statusTone(o.status);
          const l = ribLabel(o);
          return (
            <li key={o.id} className="w-full shrink-0 snap-center">
              <button type="button" onClick={() => open(o)} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 text-left shadow-lg backdrop-blur">
                <span aria-hidden className={cn('size-2 shrink-0 rounded-full', TONE_DOT[tone] ?? 'bg-primary')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{l.title}{l.subtitle ? ` · ${l.subtitle}` : ''}</span>
                  <span className={cn('block truncate text-xs', TONE_TEXT[tone] ?? 'text-primary')}>{statusLabel(o.status)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">Track<ChevronRight className="size-3.5" /></span>
              </button>
            </li>
          );
        })}
      </ul>
      {orders.length > 1 ? (
        <div className="mt-1 flex justify-center gap-1" aria-hidden>
          {orders.map((o, i) => <span key={o.id} className={cn('size-1.5 rounded-full', i === index ? 'bg-primary' : 'bg-muted-foreground/40')} />)}
        </div>
      ) : null}
    </section>
  );
}

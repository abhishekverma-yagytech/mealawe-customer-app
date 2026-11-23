import { useEffect, useState } from 'react';

import { useRefreshBumpStore, useAuthStore } from '@mealawe/state';

import { loadOpenOrders } from '@mealawe/api';
import { isSameDay, statusStepIndex, type OrderSummary } from '@mealawe/core';

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/** Only the out-for-delivery stage (`ORDER_STEPS` index 4 —
 * onTheWay/inTransit/outForDelivery) — the bottom bar is specifically for
 * "your rider is on the way right now", not every order somewhere in the
 * kitchen pipeline. Earlier stages (placed, accepted, being prepared,
 * delivery partner assigned — steps 0–3) and delivered (step 5) don't
 * belong here; neither does any cancelled/unknown status, which
 * `statusStepIndex` also falls back to 0 for. */
function isLiveStage(status: string | undefined): boolean {
  return statusStepIndex(status) === 4;
}

/** Today's live orders only — a delivery scheduled for tomorrow (or one
 * still sitting from yesterday for any reason) doesn't belong in a bar
 * whose whole point is "what's happening right now". */
function isToday(order: OrderSummary): boolean {
  if (!order.date) return false;
  const d = new Date(order.date);
  return !Number.isNaN(d.getTime()) && isSameDay(d, new Date());
}

/** Excludes subscription/package PARENT docs — despite its name, the
 * `currentOpen` endpoint doesn't only return real per-day FoodOrder docs:
 * server-side it merges three separate queries (see
 * `foodorder.service.js`'s `getCustomerCurrentOpenOrders`) — plain FoodOrder
 * docs, plus a same-day `FoodOrderSubscription` lookup, plus a same-day
 * `FoodOrderPackage` lookup — flattened into one array. Both parent doc
 * types embed a `dailyOrderList[]` a real child FoodOrder never has (same
 * detection `order-detail.tsx`'s `isSubscriptionParent` uses), so this is
 * the one reliable way to keep only genuine single-day child orders here. */
function isChildOrder(order: OrderSummary): boolean {
  const raw = order.raw as Record<string, unknown> | undefined;
  return !Array.isArray(raw?.dailyOrderList);
}

/**
 * The customer's currently-open orders — today's, in an active delivery
 * stage, real per-day child orders only (see `isLiveStage`/`isToday`/
 * `isChildOrder`) — powers the bottom live-orders bar. Mirrors the Ionic
 * app's `TrackOpenOrder` polling cadence (`getOpenOrder()` on mount + a
 * 10-minute interval), plus an immediate refetch whenever an "Order Status"
 * push arrives — the RN equivalent of
 * `sendDataToComponent.publish('UPDATE_OPEN_ORDERS', true)`.
 */
export function useOpenOrders(): OrderSummary[] {
  const profileId = useAuthStore((s) => s.profile?._id);
  const ordersVersion = useRefreshBumpStore((s) => s.ordersVersion);
  const [orders, setOrders] = useState<OrderSummary[]>([]);

  useEffect(() => {
    if (!profileId) {
      setOrders([]);
      return;
    }
    let active = true;
    const fetchOrders = (): void => {
      loadOpenOrders().then((rows) => {
        if (active) {
          setOrders(rows.filter((o) => isChildOrder(o) && isLiveStage(o.status) && isToday(o)));
        }
      });
    };
    fetchOrders();
    const interval = setInterval(fetchOrders, REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [profileId, ordersVersion]);

  return orders;
}

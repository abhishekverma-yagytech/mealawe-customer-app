import { useEffect } from 'react';

import { HttpError } from '@/services/http';
import { useAuthStore } from '@/store';

import { loadOrderById } from './api';
import type { ApartmentOrder } from './types';
import { isTerminalApartmentStatus, useActiveOrdersStore } from './useActiveOrdersStore';

/** Apartment's acceptance window is short, so this polls tighter than `useOpenOrders`'s 10-minute FoodOrder cadence. */
const POLL_INTERVAL_MS = 30 * 1000;

/** Tracked apartment orders for the "open order" rib, polled individually via `GET /api/apartmentOrder/:orderId`; untracks once status is terminal. */
export function useActiveApartmentOrders(): ApartmentOrder[] {
  // Defensive: reads straight from useAuthStore so a stale/forced logout can't leave the rib showing another account's order.
  const profile = useAuthStore((s) => s.profile);
  const orders = useActiveOrdersStore((s) => s.orders);
  const update = useActiveOrdersStore((s) => s.update);
  const untrack = useActiveOrdersStore((s) => s.untrack);

  const ids = profile ? Object.keys(orders) : [];
  const idsKey = ids.join(',');

  useEffect(() => {
    if (!idsKey) return;
    let active = true;
    // A 401 means the session is stale, so stop polling instead of hammering a doomed request.
    let sessionExpired = false;
    const poll = () => {
      if (sessionExpired) return;
      for (const id of idsKey.split(',')) {
        loadOrderById(id)
          .then((fresh) => {
            if (!active || !fresh) return;
            if (isTerminalApartmentStatus(fresh.orderstatus)) untrack(id);
            else update(fresh);
          })
          .catch((error) => {
            if (error instanceof HttpError && error.status === 401) {
              sessionExpired = true;
              clearInterval(interval);
              return;
            }
            // Any other failure (timeout, network blip) just retries next interval.
          });
      }
    };
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return profile ? Object.values(orders) : [];
}

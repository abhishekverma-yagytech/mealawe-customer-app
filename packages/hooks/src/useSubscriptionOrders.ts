import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { loadSubscriptionOrders } from '@mealawe/api';
import { statusGroup, type OrderSummary } from '@mealawe/core';
import { useAuthStore } from '@mealawe/state';

export interface SubscriptionOrdersState {
  loading: boolean;
  error: string | null;
  ongoing: OrderSummary[];
  past: OrderSummary[];
  isEmpty: boolean;
  reload: () => void;
}

/**
 * Loads the customer's subscription orders and splits them into ongoing vs past.
 * `refreshSignal` is optional: when it changes (e.g. mobile's push-driven `ordersVersion`) the list is
 * silently re-fetched without flashing the loading state.
 */
export function useSubscriptionOrders(refreshSignal = 0): SubscriptionOrdersState {
  const profileId = useAuthStore((s) => s.profile?._id);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loadSubscriptionOrders(1)
      .then((rows) => active && setOrders(rows))
      .catch(() => {
        if (active) {
          setError('Could not load your orders');
          setOrders([]);
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [profileId, nonce]);

  const seen = useRef(refreshSignal);
  useEffect(() => {
    if (seen.current === refreshSignal) return;
    seen.current = refreshSignal;
    if (!profileId) return;
    let active = true;
    loadSubscriptionOrders(1).then((rows) => {
      if (active) setOrders(rows);
    });
    return () => {
      active = false;
    };
  }, [refreshSignal, profileId]);

  const { ongoing, past } = useMemo(() => {
    const on: OrderSummary[] = [];
    const pa: OrderSummary[] = [];
    for (const o of orders) (statusGroup(o.status) === 'ongoing' ? on : pa).push(o);
    return { ongoing: on, past: pa };
  }, [orders]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { loading, error, ongoing, past, isEmpty: orders.length === 0, reload };
}

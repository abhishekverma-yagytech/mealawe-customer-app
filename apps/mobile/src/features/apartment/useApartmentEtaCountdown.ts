import { useEffect, useState } from 'react';

import type { ApartmentOrder } from './types';

/** Live "ready in MM:SS" countdown for an Instant order, visible only while `'preparing'`, anchored to that status's `statusHistory` timestamp; `null` otherwise, clamped to 0. */
export function useApartmentEtaCountdown(order: ApartmentOrder | null | undefined): number | null {
  const preparingAt = order?.statusHistory?.find((h) => h.orderstatus === 'preparing')?.updatedOn;
  const isPreparing = order?.orderstatus === 'preparing';
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!preparingAt || !isPreparing) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [preparingAt, isPreparing]);

  if (!order || order.orderType !== 'instant' || !order.estimatedFulfillmentMinutes || !preparingAt || !isPreparing) return null;
  return Math.max(0, new Date(preparingAt).getTime() + order.estimatedFulfillmentMinutes * 60000 - now);
}

/** `ms` → "M:SS", clamped to 0. */
export function formatEtaCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

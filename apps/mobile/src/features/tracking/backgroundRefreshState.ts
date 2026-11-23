import { STORAGE_KEYS } from '@/config';
import { kvStorage } from '@/services/storage/kvStore';

/**
 * Persisted record of "the order the background refresh task should check" —
 * separate from `trackingStore`'s in-memory polling state, since this needs
 * to survive the app being killed and be readable from the headless JS
 * context a background task runs in (see `backgroundOrderRefreshTask.ts`).
 */
export interface ActiveTrackedOrder {
  orderId: string;
  riderPhone: string | null;
  /** Status as of the last check (foreground or background) — lets the
   * background task tell "nothing changed" from "needs a notification
   * refresh" without extra bookkeeping. */
  lastKnownStatus: string | null;
}

export function getActiveTrackedOrder(): ActiveTrackedOrder | null {
  try {
    return kvStorage.getObject<ActiveTrackedOrder>(STORAGE_KEYS.activeTrackedOrder);
  } catch {
    return null;
  }
}

/** Call when the in-app tracking screen starts following an order. */
export function setActiveTrackedOrder(orderId: string, riderPhone?: string | null): void {
  try {
    kvStorage.setObject<ActiveTrackedOrder>(STORAGE_KEYS.activeTrackedOrder, {
      orderId,
      riderPhone: riderPhone ?? null,
      lastKnownStatus: null,
    });
  } catch {
    // storage unavailable — background refresh simply has nothing to check this session
  }
}

export function updateActiveTrackedOrderStatus(status: string): void {
  const current = getActiveTrackedOrder();
  if (!current) return;
  try {
    kvStorage.setObject<ActiveTrackedOrder>(STORAGE_KEYS.activeTrackedOrder, {
      ...current,
      lastKnownStatus: status,
    });
  } catch {
    // ignore — non-critical bookkeeping
  }
}

/** Call when tracking stops or the order completes — guarded by `orderId` so
 * a stale/superseded caller can't clear a *newer* order's entry. */
export function clearActiveTrackedOrderIfMatches(orderId: string): void {
  const current = getActiveTrackedOrder();
  if (current?.orderId !== orderId) return;
  try {
    kvStorage.remove(STORAGE_KEYS.activeTrackedOrder);
  } catch {
    // ignore — non-critical bookkeeping
  }
}

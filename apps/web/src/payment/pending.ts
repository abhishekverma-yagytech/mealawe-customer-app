import type { CartKind, OrderRef, PaymentRecap } from './types';

/**
 * Remembers what was being paid for across the Juspay redirect round-trip (the return URL only carries the
 * Juspay `order_id`). Ids and recap only — no PII. Expires after 30 minutes.
 */
export interface PendingPayment {
  ref: OrderRef;
  cartKind: CartKind;
  recap: PaymentRecap;
  /** Apartment only: the cart groups this payment bucket covers, removed from the cart once it settles. */
  apartmentGroupKeys?: string[];
  createdAt: number;
}

export const PENDING_TTL_MS = 30 * 60 * 1000;
const PREFIX = 'mw.payment.pending.';

export interface KeyStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  keys(): string[];
}

function browserStore(): KeyStore {
  const mem = new Map<string, string>();
  const ls = (): Storage | null => {
    try {
      return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
      return null;
    }
  };
  return {
    getItem: (k) => ls()?.getItem(k) ?? mem.get(k) ?? null,
    setItem: (k, v) => {
      try {
        const s = ls();
        if (s) s.setItem(k, v);
        else mem.set(k, v);
      } catch {
        mem.set(k, v);
      }
    },
    removeItem: (k) => {
      try {
        ls()?.removeItem(k);
      } catch {
        // ignore
      }
      mem.delete(k);
    },
    keys: () => {
      const s = ls();
      const out = new Set(mem.keys());
      if (s) for (let i = 0; i < s.length; i++) out.add(s.key(i) ?? '');
      return [...out].filter(Boolean);
    },
  };
}

let store: KeyStore | null = null;
const st = (): KeyStore => (store ??= browserStore());
/** Test hook. */
export function setPendingStore(next: KeyStore | null): void {
  store = next;
}

/** The record is keyed by the Juspay order id; zero-amount orders (no gateway) never need one. */
export function savePending(p: PendingPayment): void {
  if (!p.ref.order_id) return;
  st().setItem(PREFIX + p.ref.order_id, JSON.stringify(p));
}

function parse(raw: string | null, now: number): PendingPayment | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as PendingPayment;
    if (!p?.ref?.foodOrderId || !p.ref.orderType || typeof p.createdAt !== 'number') return null;
    return now - p.createdAt > PENDING_TTL_MS ? null : p;
  } catch {
    return null;
  }
}

export function loadPending(orderId: string, now = Date.now()): PendingPayment | null {
  const rec = parse(st().getItem(PREFIX + orderId), now);
  if (!rec) st().removeItem(PREFIX + orderId); // expired or corrupt
  return rec;
}

export function clearPending(orderId: string): void {
  st().removeItem(PREFIX + orderId);
}

/** Non-expired pending payments (for the "you have a payment to finish" banner). Prunes expired ones. */
export function listPending(now = Date.now()): PendingPayment[] {
  const out: PendingPayment[] = [];
  for (const k of st().keys()) {
    if (!k.startsWith(PREFIX)) continue;
    const rec = parse(st().getItem(k), now);
    if (rec) out.push(rec);
    else st().removeItem(k);
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

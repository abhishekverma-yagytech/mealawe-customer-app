import { create } from 'zustand';

import { STORAGE_KEYS } from '@/config';
import { kvStorage } from '@/services/storage/kvStore';

import type { ApartmentOrder } from './types';

const DONE_STATUSES = new Set(['delivered', 'pickedUp']);
const CANCELLED_STATUSES = new Set(['cancelledByUser', 'cancelledByKitchen', 'rejectedByKitchen', 'autoCancelled', 'refundCompleted', 'paymentFailed']);

export function isTerminalApartmentStatus(status: string): boolean {
  return DONE_STATUSES.has(status) || CANCELLED_STATUSES.has(status);
}

/** Distinguishes a cancelled/rejected/refunded/failed order (its own "won't be delivered" treatment) from normal Placed→...→Delivered progression. */
export function isCancelledApartmentStatus(status: string): boolean {
  return CANCELLED_STATUSES.has(status);
}

interface ApartmentActiveOrdersState {
  /** Keyed by `_id` — a plain object so it survives the kvStorage JSON round-trip. */
  orders: Record<string, ApartmentOrder>;
  hydrate: () => void;
  /** Shows the rib immediately after a successful `createApartmentOrder`. */
  track: (order: ApartmentOrder) => void;
  /** Called by the poller once an order's status comes back terminal. */
  untrack: (orderId: string) => void;
  /** Called by the poller with a fresher copy of a still-active order. */
  update: (order: ApartmentOrder) => void;
  /** Clears persisted state on logout so a stale order's rib doesn't leak into the next account (called from `resetCartStores`). */
  reset: () => void;
}

function readPersisted(): Record<string, ApartmentOrder> {
  try {
    return kvStorage.getObject<Record<string, ApartmentOrder>>(STORAGE_KEYS.apartmentActiveOrders) ?? {};
  } catch {
    return {};
  }
}

function writePersisted(orders: Record<string, ApartmentOrder>): void {
  try {
    kvStorage.setObject(STORAGE_KEYS.apartmentActiveOrders, orders);
  } catch {
    // storage unavailable (e.g. Expo Go) — in-memory state still works for this session
  }
}

/** Apartment orders tracked for the "open order" rib (`BottomOverlayStack`), not sourced from `getCustomerCurrentOpenOrders`; persisted across app restarts. */
export const useActiveOrdersStore = create<ApartmentActiveOrdersState>((set, get) => ({
  orders: {},

  hydrate: () => set({ orders: readPersisted() }),

  track: (order) => {
    if (isTerminalApartmentStatus(order.orderstatus)) return;
    const orders = { ...get().orders, [order._id]: order };
    set({ orders });
    writePersisted(orders);
  },

  update: (order) => {
    if (!(order._id in get().orders)) return;
    const orders = { ...get().orders, [order._id]: order };
    set({ orders });
    writePersisted(orders);
  },

  untrack: (orderId) => {
    const orders = { ...get().orders };
    delete orders[orderId];
    set({ orders });
    writePersisted(orders);
  },

  reset: () => {
    set({ orders: {} });
    writePersisted({});
  },
}));

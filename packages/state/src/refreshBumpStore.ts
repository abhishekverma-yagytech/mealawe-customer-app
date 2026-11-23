import { create } from 'zustand';

interface RefreshBumpState {
  /** Increments whenever a push signals "something about your orders changed" —
   * screens that poll (e.g. `useOpenOrders`) can depend on this to force an
   * immediate refetch instead of waiting for their next scheduled poll.
   * Mirrors the Ionic app's `sendDataToComponent.publish('UPDATE_OPEN_ORDERS', true)`. */
  ordersVersion: number;
  bumpOrders: () => void;
}

export const useRefreshBumpStore = create<RefreshBumpState>((set) => ({
  ordersVersion: 0,
  bumpOrders: () => set((s) => ({ ordersVersion: s.ordersVersion + 1 })),
}));

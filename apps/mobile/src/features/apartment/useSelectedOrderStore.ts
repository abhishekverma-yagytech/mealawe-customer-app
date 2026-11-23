import { create } from 'zustand';

import type { ApartmentOrder } from './types';

interface ApartmentSelectedOrderState {
  selected: ApartmentOrder | null;
  select: (order: ApartmentOrder) => void;
}

/** Currently-viewing apartment order, set before navigating to the detail screen so it renders instantly; falls back to `loadOrderById` on mismatch. */
export const useSelectedOrderStore = create<ApartmentSelectedOrderState>((set) => ({
  selected: null,
  select: (order) => set({ selected: order }),
}));

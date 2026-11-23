import { create } from 'zustand';

import type { OrderType } from './types';

interface ApartmentOrderTypeState {
  orderType: OrderType;
  setOrderType: (type: OrderType) => void;
}

/** Apartment tab's active order type (Instant/Today/Advance). Lifted out of
 * `ApartmentHome` since `HomeBottomNav` also reads/sets it, avoiding prop-drilling. */
export const useApartmentOrderTypeStore = create<ApartmentOrderTypeState>((set) => ({
  orderType: 'instant',
  setOrderType: (orderType) => set({ orderType }),
}));

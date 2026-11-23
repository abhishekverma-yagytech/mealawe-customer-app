'use client';

import { create } from 'zustand';

import type { OrderType } from './types';
import type { ResolvedApartment } from './api';

interface EligibilityState {
  /** `undefined` = not resolved yet, `null` = no apartment complex at this address, else available. */
  apartment: ResolvedApartment | null | undefined;
  setApartment: (apartment: ResolvedApartment | null | undefined) => void;
}

/** Shared by the home Apartment tab and the /apartment page; resolved once per address by ApartmentEligibilityResolver. */
export const useApartmentEligibilityStore = create<EligibilityState>((set) => ({ apartment: undefined, setApartment: (apartment) => set({ apartment }) }));

interface OrderTypeState {
  orderType: OrderType;
  setOrderType: (type: OrderType) => void;
}

export const useApartmentOrderTypeStore = create<OrderTypeState>((set) => ({ orderType: 'instant', setOrderType: (orderType) => set({ orderType }) }));

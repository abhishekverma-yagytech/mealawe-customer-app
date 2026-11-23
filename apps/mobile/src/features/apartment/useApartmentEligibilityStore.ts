import { create } from 'zustand';

import type { ResolvedApartment } from './api';

interface ApartmentEligibilityState {
  /** `undefined` = not resolved yet, `null` = no apartment complex here, else available; shared by the nav pill and ApartmentHome's empty state from one `resolveApartment` call. */
  apartment: ResolvedApartment | null | undefined;
  setApartment: (apartment: ResolvedApartment | null | undefined) => void;
}

export const useApartmentEligibilityStore = create<ApartmentEligibilityState>((set) => ({
  apartment: undefined,
  setApartment: (apartment) => set({ apartment }),
}));

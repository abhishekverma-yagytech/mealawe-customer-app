import { create } from 'zustand';

import type { OrderSummary } from '@mealawe/core';

interface OrderState {
  /** The order the detail screen renders (handed over from the list). */
  selected: OrderSummary | null;
  select: (order: OrderSummary) => void;
  clear: () => void;
}

/**
 * Hands the tapped order from the list to the detail screen without
 * serialising it through route params (mirrors the configure-context pattern).
 */
export const useOrderStore = create<OrderState>((set) => ({
  selected: null,
  select: (order) => set({ selected: order }),
  clear: () => set({ selected: null }),
}));

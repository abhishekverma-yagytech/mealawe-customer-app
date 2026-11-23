import { create } from 'zustand';

import { type SubCategory, type MealPackage } from '@mealawe/core';

export interface SubscriptionBrowseSelection {
  category: SubCategory | null;
  /** Weekday identifier (e.g. "Monday") — matches `DayMenu.day` from the weekly menu. */
  selectedDay: string | null;
  selectedPackage: MealPackage | null;
}

const EMPTY_SELECTION: SubscriptionBrowseSelection = {
  category: null,
  selectedDay: null,
  selectedPackage: null,
};

interface SubscriptionBrowseState extends SubscriptionBrowseSelection {
  setCategory: (category: SubCategory | null) => void;
  setSelectedDay: (day: string | null) => void;
  setSelectedPackage: (pkg: MealPackage | null) => void;
  reset: () => void;
}

/**
 * Selection state carried across the Subscription browse flow — Home (category
 * grid) → Detail (day picker) → Plan (meal time + duration/package picker).
 * In-memory only (no persistence middleware): this is a short-lived, page-to-page
 * hand-off, not a durable cart. Once a package is chosen on the Plan screen, that
 * selection is handed off to `useConfigureStore` (the shared Configure hand-off
 * used by both this flow and the unrelated dine-in flow) — this store does not
 * reach into or replace that one.
 *
 * Deliberately does not hold the catalog/package list — each screen fetches that
 * independently via `useSubscriptionCatalog()`. Meal-time (lunch/dinner) selection
 * lives on the Plan screen itself and is handed off via `ConfigureContext` — a
 * package can include both meals, so it's no longer a single mutually-exclusive
 * field here.
 */
export const useSubscriptionBrowseStore = create<SubscriptionBrowseState>((set) => ({
  ...EMPTY_SELECTION,

  setCategory: (category) => set({ category }),
  setSelectedDay: (selectedDay) => set({ selectedDay }),
  setSelectedPackage: (selectedPackage) => set({ selectedPackage }),

  reset: () => set({ ...EMPTY_SELECTION }),
}));

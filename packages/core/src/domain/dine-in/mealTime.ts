import type { MealPackage } from '../subscription/types';

export interface DineInMealTime {
  hasLunch: boolean;
  hasDinner: boolean;
  /** True only when at least one of Lunch/Dinner is set — an
   * admin-misconfigured package with neither checked has nothing to lock
   * onto, so callers should fall back to letting the user pick. */
  isDetermined: boolean;
  /** 0, 1, or 2 — meals included per delivery day. */
  mealsPerDay: number;
  label: 'Lunch' | 'Dinner' | 'Both' | '';
}

/**
 * Parses a Dine In package's `packageCategory` (a "Lunch"/"Dinner"/"Lunch,
 * Dinner" string built server-side from admin-checked boxes — see
 * `dine-in/api.ts`'s `packageCategoryLabel`) into which meal time(s) it's
 * fixed to. Unlike a regular Subscription package (where `packageCategory`
 * means the thali TYPE, e.g. "Deluxe", not a meal time), a Dine In package's
 * meal time is baked into the package itself, not a user choice on the Plan
 * screen — this is the one place that string gets interpreted, shared by
 * the plan card's meal-count badge and the Configure screen's locked
 * meal-time display so the two can never disagree about what a given
 * package actually means.
 */
export function dineInMealTime(pkg: Pick<MealPackage, 'packageCategory'>): DineInMealTime {
  const text = (pkg.packageCategory ?? '').toLowerCase();
  const hasLunch = text.includes('lunch');
  const hasDinner = text.includes('dinner');
  const label: DineInMealTime['label'] = hasLunch && hasDinner ? 'Both' : hasDinner ? 'Dinner' : hasLunch ? 'Lunch' : '';
  return {
    hasLunch,
    hasDinner,
    isDetermined: hasLunch || hasDinner,
    mealsPerDay: (hasLunch ? 1 : 0) + (hasDinner ? 1 : 0),
    label,
  };
}

import { formatINR } from '../../utils/currency';

import type { AddOn, MealPackage } from './types';

/** Stable identity for an add-on — its `_id`, falling back to its name. */
export function addonKey(a: AddOn): string {
  return a._id ?? a.addonName ?? '';
}

/**
 * ₹ line total for one add-on over the whole plan (its per-meal price ×
 * meals/day × the number of days it applies for). The single formula behind
 * both the Configure screen's running add-ons total and its per-card total
 * in the extras grid, so the two can never drift apart.
 */
export function addonLineTotal(a: AddOn, mealsPerDay: number, days: number): number {
  const price = a.extraPrice ?? a.addonPrice ?? 0;
  const unitDays = a.daily === false && a.dayCount ? a.dayCount : days;
  return price * mealsPerDay * unitDays;
}

/**
 * Extra delivery days contributed by selected "Include Saturday"/"Include
 * Sunday" add-ons (`addonIconType` 'saturday'/'sunday') — each carries its
 * own `dayCount` (e.g. 4 extra Saturdays), which the plan's own `days` never
 * includes. Summed across every selected add-on of that kind, so picking
 * both Saturday and Sunday adds both counts.
 *
 * `deliveryOnWeekends` (the package's own admin-set flag, not a user
 * toggle) zeroes this out entirely when true — mirrors the Ionic
 * reference's `getSubscriptionPayAmt` guard (`addon.day === 1 || addon.day
 * === 7) && !ele.deliveryOnWeekends`): a package that already delivers on
 * weekends has those days baked into its own `days` already, so adding the
 * add-on's `dayCount` on top would double-count them.
 */
export function extraAddonDays(selectedAddons: readonly AddOn[], deliveryOnWeekends = false): number {
  if (deliveryOnWeekends) {
    return 0;
  }
  return selectedAddons.reduce((sum, a) => {
    const isWeekendAddon = a.addonIconType === 'saturday' || a.addonIconType === 'sunday';
    return isWeekendAddon && a.dayCount ? sum + a.dayCount : sum;
  }, 0);
}

/**
 * "60" or "60 + 4" — the plan's day count plus any selected weekend add-on
 * days, formatted as the running total shown across Configure/Cart. Display
 * only: the plan's actual `days` and generated delivery dates are unchanged.
 */
export function daysLabel(days: number, extraDays: number): string {
  return extraDays > 0 ? `${days} + ${extraDays}` : `${days}`;
}

/** Final per-plan price after the flat discount. */
export function finalPrice(pkg: MealPackage): number {
  return Math.max(0, (pkg.packagePrice || 0) - (pkg.discount || 0));
}

/** Discount as a whole-number percentage (derived — backend has no % field). */
export function offPercent(pkg: MealPackage): number {
  if (!pkg.packagePrice) {
    return 0;
  }
  return Math.round(((pkg.discount || 0) / pkg.packagePrice) * 100);
}

/** Per-day price of the plan (floored). */
export function perDay(pkg: MealPackage): number {
  if (!pkg.days) {
    return finalPrice(pkg);
  }
  return Math.floor(finalPrice(pkg) / pkg.days);
}

/** Per-day price before the discount (floored) — the line-through figure
 * shown alongside `perDay`'s current price wherever a category/plan's price
 * needs to show the discount, not just the post-discount number. */
export function originalPerDay(pkg: MealPackage): number {
  if (!pkg.days) {
    return pkg.packagePrice || 0;
  }
  return Math.floor((pkg.packagePrice || 0) / pkg.days);
}

/** The package with the lowest post-discount ₹/meal rate among `plans` — the
 * "cheapest plan" a category's price tile always means (Home's grid,
 * Detail's cross-sell carousel, …), so every caller resolves it the same way. */
export function cheapestPlan(plans: readonly MealPackage[]): MealPackage | null {
  if (!plans.length) {
    return null;
  }
  return plans.reduce((min, p) => (perDay(p) < perDay(min) ? p : min), plans[0]);
}

/**
 * Current + original (pre-discount) ₹/meal price labels for `plans` —
 * normally the cheapest plan, but `preferredPackageId` (a category's
 * admin-picked `homeTilePackageId`, dashboard's Subscription Category form)
 * wins when it's set and still among `plans`, so an admin's explicit "show
 * this one on Home" pick actually takes effect instead of always being
 * silently overridden by whichever plan happens to be cheapest. `original`
 * is `null` when that plan carries no discount, so callers know not to
 * render a line-through. `null` overall when `plans` is empty (category has
 * no packages yet).
 */
export function cheapestPriceLabels(
  plans: readonly MealPackage[],
  preferredPackageId?: string,
): { current: string; original: string | null } | null {
  const preferred = preferredPackageId ? plans.find((p) => p._id === preferredPackageId) : undefined;
  const plan = preferred ?? cheapestPlan(plans);
  if (!plan) {
    return null;
  }
  const current = perDay(plan);
  const original = originalPerDay(plan);
  return { current: `${formatINR(current)}/meal`, original: original > current ? `${formatINR(original)}/meal` : null };
}

/**
 * The one rule every screen uses to preselect a plan: the server's explicit
 * `isDefaultSelection` flag, else `isBestSeller`, else the cheapest ₹/day
 * plan. Replaces three screens that used to each guess differently
 * (a hardcoded `days === 10` check, an ad-hoc `isBestSeller` pick, and a
 * separate `planTag`-derived "MOST POPULAR" ribbon that could badge a
 * *different* tile than the one actually selected) — see
 * SUBSCRIPTION_CATALOG_DYNAMIC_PLAN.md §5. `null` when `plans` is empty.
 */
export function pickDefaultPackage(plans: readonly MealPackage[]): MealPackage | null {
  if (!plans.length) {
    return null;
  }
  return plans.find((p) => p.isDefaultSelection) ?? plans.find((p) => p.isBestSeller) ?? cheapestPlan(plans);
}

/** Friendly duration label under the day count (Trial / Biweekly / 1 Month …). */
export function planTag(pkg: MealPackage): string {
  const d = pkg.days || 0;
  if (d <= 6) {
    return 'Trial';
  }
  if (d <= 12) {
    return 'Biweekly';
  }
  if (d <= 22) {
    return '1 Month';
  }
  return `${d} Days`;
}

/**
 * Short, honest recommendation copy derived purely from `pkg` and
 * `allPackages`'s ₹/day rates — no fabricated numbers, no randomness. If a
 * single other package beats `pkg`'s per-day rate, names it and the ₹/day
 * gap; otherwise affirms `pkg` already has the best rate.
 */
export function aiRecommendationCopy(pkg: MealPackage, allPackages: readonly MealPackage[]): string {
  const currentPerDay = perDay(pkg);
  let best: MealPackage | null = null;
  let bestPerDay = currentPerDay;

  for (const candidate of allPackages) {
    const isSamePackage = candidate === pkg || (!!pkg._id && candidate._id === pkg._id);
    if (isSamePackage) {
      continue;
    }
    const candidatePerDay = perDay(candidate);
    if (candidatePerDay < bestPerDay) {
      bestPerDay = candidatePerDay;
      best = candidate;
    }
  }

  if (!best) {
    return "You've already got the best per-meal rate available.";
  }
  const amount = currentPerDay - bestPerDay;
  return `Switching to the ${best.days}-day plan saves ${formatINR(amount)} per meal vs your current pick.`;
}

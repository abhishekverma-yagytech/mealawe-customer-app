import { palette } from '@/theme';

import { HOME_HERO_LOTTIES, lottiesForTab, type LottieSource } from './homeLotties';
import type { HeroLottiesByTab } from './useHeroLotties';

export interface TabTheme {
  /** Hero gradient / active-nav-pill accent for this order mode. Reuses an
   * existing meaning-mapped accent rather than inventing a new hue — e.g.
   * Bulk gets Plan Violet because bulk orders ARE a planning activity. */
  accent: string;
  lotties: LottieSource[];
}

/**
 * One accent + hero animation per order-mode tab (see `HomeTab.key` in
 * `HomeBottomNav.tsx`). Subscription keeps the original brand green — it's
 * the flagship/default tab, not a carve-out.
 */
export const TAB_THEME: Record<string, TabTheme> = {
  subscription: { accent: palette.brand.green, lotties: HOME_HERO_LOTTIES.subscription },
  bulk: { accent: palette.accent.plan, lotties: HOME_HERO_LOTTIES.bulk },
  dinein: { accent: palette.accent.food, lotties: HOME_HERO_LOTTIES.dinein },
  ondemand: { accent: palette.accent.info, lotties: HOME_HERO_LOTTIES.ondemand },
  // Apartment has no single hero of its own — this only carries the flat
  // hero-TINT accent (fixed gold regardless of order type, a deliberate
  // product decision). Its actual lottie SOURCES are resolved per order type
  // (`apartment_instant`/`apartment_today`/`apartment_advance`, see
  // `HOME_HERO_LOTTIES`) inside `tabThemeFor` below, not looked up here.
  apartment: { accent: palette.bottomNav.apartment, lotties: [] },
  apartmentBulk: { accent: palette.bottomNav.apartment, lotties: [] },
  navmool: { accent: palette.bottomNav.navmool, lotties: [] },
};

export const DEFAULT_TAB_THEME: TabTheme = TAB_THEME.subscription;

/**
 * `isKota` swaps in Kota's own hero animation set (currently empty — see
 * `KOTA_SUBSCRIPTION_LOTTIES`) instead of the Bangalore/Pune thali lotties,
 * which don't represent Kota's hostel/student-focused catalog. Only used as
 * the BUNDLED fallback now — `heroLotties` (from `useHeroLotties`, dashboard-
 * managed) wins whenever a tab has server-configured slides, since the
 * server already resolved its own cluster-specific-vs-global precedence
 * (including any Kota override) before returning them.
 *
 * `apartmentOrderType` (Instant/Today/Advance, from
 * `useApartmentOrderTypeStore`) is only consulted when `key === 'apartment'`
 * — it redirects the lottie lookup to that sub-mode's own
 * `apartment_${orderType}` slot instead of the (nonexistent) bare
 * `apartment` one, so switching order type while on the Apartment tab swaps
 * the carousel too. The hero TINT (`base.accent`) deliberately does NOT vary
 * with it — stays one fixed gold across all three sub-modes.
 */
export function tabThemeFor(key: string, isKota = false, heroLotties: HeroLottiesByTab = {}, apartmentOrderType?: string): TabTheme {
  const base = TAB_THEME[key] ?? DEFAULT_TAB_THEME;
  const lottieKey = key === 'apartment' && apartmentOrderType ? `apartment_${apartmentOrderType}` : key;
  const serverSlides = heroLotties[lottieKey];
  const lotties = serverSlides?.length ? [...serverSlides] : lottiesForTab(lottieKey, isKota);
  return { accent: base.accent, lotties };
}

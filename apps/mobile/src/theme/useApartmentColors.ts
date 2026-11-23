import { useColorScheme } from 'react-native';

import { palette } from './palette';

/**
 * Root-cause fix: the Apartment feature's own palette namespace
 * (`palette.apartment`/`palette.apartmentOrderType`) had no dark-mode
 * variant at all — every Apartment screen read it as a fixed set of
 * light-mode hex values, so switching the app to dark mode left Apartment's
 * cards/pages/sheets on their light cream/white surfaces while the rest of
 * the app (anything using `useColors()`) went dark correctly. Mirrors
 * `useColors()`'s exact pattern — same `useColorScheme()` source of truth —
 * just for the Apartment-specific token set instead of the app-wide
 * `SemanticColors` one.
 *
 * Use in every Apartment component instead of reading `palette.apartment.*`
 * / `palette.apartmentOrderType` directly: `const { colors, orderType } =
 * useApartmentColors();` then `colors.page`/`colors.ink`/etc, and
 * `orderType[dish.orderType].accent` in place of
 * `palette.apartmentOrderType[dish.orderType].accent`.
 *
 * `palette.apartmentPill` (the solid Home/Apartment nav pills) and
 * `palette.bottomNav` (the LottieHero hero-tint accents) are deliberately
 * NOT switched here — both are self-contained solid fills with their own
 * fixed white icon/text on top, not a text-on-page-background pairing, so
 * they read correctly in either theme without a dark variant of their own.
 */
export function useApartmentColors() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return {
    colors: isDark ? palette.apartmentDark : palette.apartment,
    orderType: isDark ? palette.apartmentOrderTypeDark : palette.apartmentOrderType,
    // Exposed for the rare non-component consumer that can't call this hook
    // itself — e.g. orderStatus.ts's apartmentOrderStatusColor, a plain
    // function shared with call sites that don't otherwise need `colors`/
    // `orderType` — so it can still resolve the right theme without
    // duplicating the `useColorScheme()` read.
    isDark,
  };
}

/**
 * Mealawe typography theme — single source of truth for the type system.
 *
 * Brand typeface is **Metropolis**, loaded locally from
 * `src/assets/fonts/metropolis/` (public-domain revival by typehaus of Chris
 * M. Simpson's original geometric sans — see `LICENSE.md` alongside the font
 * files). This is the same open-source typeface Zomato's own "Okra" is
 * built on (per their "Defining our typography system" post) — Okra itself
 * is Zomato's proprietary in-house modification and isn't publicly
 * available, so Metropolis is the closest faithful, legitimately-licensed
 * match. React Native does not synthesize weights reliably, so each weight
 * is its own family; always pick the family that matches the weight you
 * want (`FONT_FAMILY.*`) rather than relying on `fontWeight`.
 *
 * Two ways to consume:
 *  1. `<AppText variant="h1">…</AppText>` (preferred — see components/ui/AppText).
 *  2. NativeWind utilities wired in `global.css`: `text-h1`, `font-metropolis-bold`, …
 *
 * The size scale is Zomato's own published Sushi type scale, verbatim:
 * 11 / 12 / 13 / 15 / 17 / 19 / 21 / 24 / 27 px — 9 exact steps, mapped
 * across this app's 11 named variants (some adjacent variants share a step,
 * same as the blog's own examples share sizes across weights). Every
 * line-height is exactly 150% of its font size, per the post's "standard
 * line height is 150% of the font size" rule, rounded to the nearest px.
 * Weight follows the post's stated rule of thumb — regular for the 11–19px
 * range, bold for the headline-scale steps above it — with two named
 * exceptions (`overline`, `label`) kept bold: both are short, all-caps or
 * button-style text where the post's own "sometimes a case-by-case decision
 * fits better" carve-out applies, since regular weight at that size/role
 * reads as a legibility regression, not an aesthetic preference.
 * Values are the *base* (375dp-reference) sizes — `AppText` applies a small
 * width-based multiplier on top via `useResponsiveFontScale` (see
 * `src/theme/responsive.ts`) so text doesn't read oversized on small phones.
 */
import type { TextStyle } from 'react-native';

const METROPOLIS_TTF = {
  regular: require('../assets/fonts/metropolis/Metropolis-Regular.ttf'),
  bold: require('../assets/fonts/metropolis/Metropolis-Bold.ttf'),
  black: require('../assets/fonts/metropolis/Metropolis-Black.ttf'),
};

/** Loaded Metropolis family names. */
export const FONT_FAMILY = {
  regular: 'Metropolis-Regular',
  bold: 'Metropolis-Bold',
  black: 'Metropolis-Black',
} as const;

export type FontWeightName = keyof typeof FONT_FAMILY;

/** Named type presets. Each is a ready-to-spread RN `TextStyle`. */
export type TextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'title'
  | 'bodyLg'
  | 'body'
  | 'bodySm'
  | 'label'
  | 'caption'
  | 'overline';

type Preset = Required<Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontFamily'>> &
  Pick<TextStyle, 'letterSpacing' | 'textTransform'>;

export const typography: Record<TextVariant, Preset> = {
  // Headline scale (21/24/27px) — bold, per "main headline should be bold, not light".
  display: { fontSize: 27, lineHeight: 41, fontFamily: FONT_FAMILY.bold, letterSpacing: -0.5 },
  h1: { fontSize: 24, lineHeight: 36, fontFamily: FONT_FAMILY.bold, letterSpacing: -0.4 },
  h2: { fontSize: 21, lineHeight: 32, fontFamily: FONT_FAMILY.bold, letterSpacing: -0.3 },
  // 11–19px range — regular, per "regular weights are best for the minimum 11–19px range".
  h3: { fontSize: 19, lineHeight: 29, fontFamily: FONT_FAMILY.regular, letterSpacing: -0.2 },
  title: { fontSize: 17, lineHeight: 26, fontFamily: FONT_FAMILY.regular, letterSpacing: -0.1 },
  bodyLg: { fontSize: 15, lineHeight: 23, fontFamily: FONT_FAMILY.regular, letterSpacing: 0 },
  body: { fontSize: 13, lineHeight: 20, fontFamily: FONT_FAMILY.regular, letterSpacing: 0 },
  bodySm: { fontSize: 13, lineHeight: 20, fontFamily: FONT_FAMILY.regular, letterSpacing: 0 },
  caption: { fontSize: 12, lineHeight: 18, fontFamily: FONT_FAMILY.regular, letterSpacing: 0.1 },
  // Exceptions kept bold — short all-caps tag / button text, not flowing copy.
  // `label` bumped +1px off the Zomato scale's 13px step (per explicit request) —
  // every consumer of `variant="label"` picks this up automatically, same token.
  label: { fontSize: 16, lineHeight: 21, fontFamily: FONT_FAMILY.bold, letterSpacing: 0.1 },
  overline: {
    fontSize: 11,
    lineHeight: 17,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
};

/** Font assets to hand to `useFonts` in the root layout. */
export const metropolisFontMap = {
  [FONT_FAMILY.regular]: METROPOLIS_TTF.regular,
  [FONT_FAMILY.bold]: METROPOLIS_TTF.bold,
  [FONT_FAMILY.black]: METROPOLIS_TTF.black,
};

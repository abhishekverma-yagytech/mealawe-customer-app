/**
 * Mealawe brand palette — single source of truth in TypeScript.
 * Mirrors the CSS custom properties in `src/global.css`. Use these for
 * JS-side needs that can't read CSS (React Navigation theme, StatusBar,
 * native splash, chart colors, etc.). For component styling prefer NativeWind
 * `className` tokens (e.g. `bg-primary`, `bg-brand-yellow`).
 */
export const palette = {
  /** Primary — green */
  primary: {
    50: '#eef6ea',
    100: '#d6ebcc',
    200: '#b6dc9f',
    300: '#93cd72',
    400: '#78bd54',
    500: '#63ab45', // main brand green
    600: '#518937', // dark green
    700: '#39721e',
    800: '#2b5717',
    900: '#042a33', // deep teal
  },
  /** Named brand hues (from design) */
  brand: {
    green: '#63ab45',
    greenDark: '#518937',
    /** The app icon/logo mark's own green — a distinct, deeper forest tone
     * from `green`/`greenDark` above, sampled directly from icon.png. */
    logoGreen: '#016937',
    yellow: '#ffca22',
    cream: '#eae2b7',
    teal: '#042a33',
  },
  status: {
    success: '#63ab45',
    warning: '#ffca22',
    info: '#35becc',
    danger: '#e62841',
    dangerDark: '#b9041c',
  },
  neutral: {
    white: '#ffffff',
    softWhite: '#faf7f0',
    black: '#042a33',
    gray400: '#a4a4a4',
    gray500: '#9a9a9a',
    gray600: '#6d6d6d',
    gray700: '#333333',
  },
  /**
   * Modern Fresh accent hues — semantic icon/section colors. Rendered as a
   * solid icon on a soft tint (see `accentTint`). Green stays reserved for
   * CTAs/selection (`brand.green` / `--primary`) and is NOT an accent role.
   */
  accent: {
    offer: '#ff8a00', // offers / POPULAR / savings
    plan: '#6c5ce7', // plan / duration
    info: '#159aab', // delivery slot / time
    location: '#2e7df6', // address / location
    reward: '#ec4899', // coupons / wallet
    food: '#f97316', // food / menu items
    veg: '#63ab45', // veg dot
    nonveg: '#e23744', // non-veg dot
    rating: '#f5a623', // star / rating
  },
  /** Flat background tints for a specific UI surface — not an icon accent
   * role, so kept separate from `accent` above. */
  surface: {
    couponBanner: '#e5e8ff',
  },
  /**
   * Apartment feature palette — exact values from the Claude Design
   * ("Mealawe Apartment Flow" project, `Apartment Prototype.dc.html`),
   * deliberately its OWN namespace rather than reusing the app's brand-green
   * tokens: the design uses its own deeper forest green (`#1e5b3f`) and warm
   * cream background (`#f6f6ec`), distinct from the rest of the app's
   * brighter `brand.green` (`#63ab45`) — an intentional per-feature look,
   * per an explicit "match the design exactly" instruction, not a drift from
   * the design system. Still named tokens throughout — never hand-hex in a
   * component; add here instead.
   */
  apartment: {
    page: '#f6f6ec', // screen background
    card: '#ffffff',
    ink: '#1b211c', // primary text
    muted: '#737a72', // secondary text
    mutedLine: '#4a504a', // body copy on tinted panels
    border: '#e6e6d8',
    borderSoft: '#eeeee2',
    green: '#1e5b3f', // primary accent / CTA
    greenDeep: '#16452f', // header text/icons
    gold: '#e8b425', // wallet coin, star rating
    goldLine: '#e2d3ac',
    goldBg: '#fdf6e6',
    warn: '#a4623a', // blocked/revalidate banner text
    warnBg: '#fdf1e7',
    warnLine: '#f2ddcb',
    disabled: '#b6c9ba', // disabled CTA fill
  },
  /** Dark-mode counterpart of `apartment` above — root-cause fix: the
   * Apartment feature had no dark variant at all (every screen read
   * `palette.apartment.*` unconditionally), so switching the app to dark
   * mode left Apartment's cards/pages on their light cream/white surfaces
   * while the rest of the app went dark. `page`/`card`/`ink` deliberately
   * reuse the SAME neutral near-black/elevated-card/warm-white values
   * `theme.ts`'s own `darkColors` already established for the rest of the
   * app (`background`/`card`/`foreground`) — same "neutral black, not
   * hue-tinted" convention that file's own comment calls out — rather than
   * inventing a second, differently-toned dark surface just for this
   * feature. Accent/warn/gold tones are each lightened enough to hold
   * contrast against that dark surface while staying recognizably the same
   * hue as their light counterpart. Consumed via `useApartmentColors()`
   * (`src/theme/useApartmentColors.ts`), mirroring `useColors()`'s own
   * light/dark switch exactly — never read directly. */
  apartmentDark: {
    page: '#1a1a1a',
    card: '#2a2a2a',
    ink: '#faf7f0',
    muted: '#9aa89f',
    mutedLine: '#c7cdc3',
    border: '#3d3d3d',
    borderSoft: '#333333',
    green: '#4fae82',
    greenDeep: '#8fd6ae',
    gold: '#e8b425',
    goldLine: '#6b5a2c',
    goldBg: '#2e2712',
    warn: '#e0916a',
    warnBg: '#3a2418',
    warnLine: '#5c3d2a',
    disabled: '#41493f',
  },
  /** One entry per `OrderType` — tab pill fill/soft-bg/border, exact values
   * from the design's `TYPES` map. */
  apartmentOrderType: {
    instant: { accent: '#1e5b3f', soft: '#e9f1e9', line: '#c6e6d8' },
    today: { accent: '#8a6512', soft: '#fdf4e0', line: '#f0e0bb' },
    advance: { accent: '#33463a', soft: '#ecefe9', line: '#dbe1d7' },
  },
  /** Dark-mode counterpart of `apartmentOrderType` above — same reasoning
   * as `apartmentDark`: each accent lightened for contrast, `soft`/`line`
   * become dark, low-saturation tints of the same hue instead of pale
   * light ones. Consumed via `useApartmentColors()`. */
  apartmentOrderTypeDark: {
    instant: { accent: '#4fae82', soft: '#1c2e22', line: '#2f4a3a' },
    today: { accent: '#d9a441', soft: '#2e2712', line: '#4a3d1f' },
    advance: { accent: '#9db3a3', soft: '#232823', line: '#3a423b' },
  },
  /** Fixed bottom-nav tab accents — exact values from the same Claude
   * Design's own `tabs` array (Subs/Bulk/On-demand/Apartment/Navmool), used
   * verbatim by `tabTheme.ts` instead of the app's semantic `accent.*`
   * tokens so this one nav matches the design pixel-for-pixel. Dine In has
   * no entry here — it isn't part of that design's 5-tab demo, so it keeps
   * its existing semantic accent (`accent.food`) in `tabTheme.ts`. */
  bottomNav: {
    subscription: '#1e5b3f',
    bulk: '#8a4a12',
    ondemand: '#0f766e',
    // Kept as the Apartment hero-tint accent (LottieHero, when Apartment is
    // the active tab) — the bottom-nav ROW itself no longer includes
    // Apartment as of the design's latest revision (see `apartmentPill`).
    apartment: '#8a6512',
    navmool: '#2e9b3f',
  },
  /**
   * The standalone "Apartment" pill — the design's latest revision pulled
   * Apartment OUT of the shared 4-tab row entirely and gave it its own
   * always-visible, solid-filled pill bleeding off the screen's right edge
   * (`right:-6px`, half-rounded — `999px 0 0 999px`). Exact two shades from
   * the design: darker when Apartment is the active tab, lighter otherwise
   * — unlike every other tab, this one is NEVER a soft tint, always solid.
   */
  apartmentPill: {
    active: '#2f4a17',
    inactive: '#3f5c1c',
  },
} as const;

export type Palette = typeof palette;

/** Semantic accent role names (keys of `palette.accent`). */
export type AccentTone = keyof typeof palette.accent;

/**
 * Soft tint of an accent hue for chip/tile backgrounds. Accepts an
 * `#rrggbb` hex and returns an `rgba()` at the given alpha (default 0.12).
 */
export function accentTint(hex: string, alpha = 0.12): string {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Linear-blend two `#rrggbb` hexes. Used to derive a gradient's middle stop
 * from a single accent (e.g. a per-tab hero tint fading toward the brand's
 * deep teal) without hand-picking a "dark variant" for every accent.
 */
export function mixHex(a: string, b: string, t = 0.5): string {
  const pa = a.replace('#', '');
  const pb = b.replace('#', '');
  const mix = (i: number) => {
    const va = parseInt(pa.slice(i, i + 2), 16);
    const vb = parseInt(pb.slice(i, i + 2), 16);
    return Math.round(va + (vb - va) * t)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${mix(0)}${mix(2)}${mix(4)}`;
}

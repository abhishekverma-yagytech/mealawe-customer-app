/**
 * Corner-radius and border-width scale — matches `DESIGN.md`'s documented
 * `rounded` foundation exactly (same "make the existing spec real" move as
 * `spacing.ts`). Use `RADIUS` instead of a bare number for a card/button/tile
 * corner, and `BORDER_WIDTH` instead of a bare `1`/`2` for hairline vs.
 * selected-state borders.
 */
export const RADIUS = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  full: 999,
} as const;

export type RadiusKey = keyof typeof RADIUS;

export const BORDER_WIDTH = {
  /** Resting card/input border. */
  hairline: 1,
  /** Selected/active state (e.g. a selected plan card's ring). */
  emphasis: 2,
} as const;

export type BorderWidthKey = keyof typeof BORDER_WIDTH;

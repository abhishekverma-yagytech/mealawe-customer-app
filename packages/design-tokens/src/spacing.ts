/**
 * Spacing scale — matches `DESIGN.md`'s documented foundation exactly (this
 * makes that spec real/importable rather than living only as YAML prose).
 * Existing Tailwind spacing utilities (`gap-3`, `px-4`, …) already sit on the
 * same 4px grid — reach for `SPACING` when a numeric px value is needed in a
 * `style` prop (e.g. a computed layout offset) instead of picking an
 * arbitrary number.
 */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
} as const;

export type SpacingKey = keyof typeof SPACING;

/**
 * Width-based font scaling so the fixed px type ramp in `typography.ts` doesn't
 * read oversized on small phones or undersized on large ones. `AppText` applies
 * this on top of each variant's base size — nothing else needs to call it directly.
 */
import { useWindowDimensions } from 'react-native';

const SMALL_WIDTH_BREAKPOINT = 360;
const LARGE_WIDTH_BREAKPOINT = 414;
const SMALL_WIDTH_SCALE = 0.94;
const LARGE_WIDTH_SCALE = 1.06;
const MIN_SCALE = 0.9;
const MAX_SCALE = 1.1;

/** Pure function so the breakpoints are unit-testable without rendering. */
export function getFontScaleForWidth(width: number): number {
  const scale =
    width < SMALL_WIDTH_BREAKPOINT
      ? SMALL_WIDTH_SCALE
      : width > LARGE_WIDTH_BREAKPOINT
        ? LARGE_WIDTH_SCALE
        : 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function useResponsiveFontScale(): number {
  const { width } = useWindowDimensions();
  return getFontScaleForWidth(width);
}

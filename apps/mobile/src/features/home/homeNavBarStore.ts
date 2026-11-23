import { create } from 'zustand';

/**
 * Fallback estimate of `HomeBottomNav`'s rendered height, used only until the
 * bar's own `onLayout` reports a real measurement. The bar's actual height
 * varies with the device's font scale (OS accessibility text size, and the
 * app's own responsive `AppText` scale) and label wrapping, so anything
 * anchored above it (`BottomOverlayStack`, feed scroll padding) reads this
 * store's live `measuredHeight` instead of trusting a baked-in guess — on a
 * small/short screen or with large system text, the guess and the real
 * height can drift enough to make the two bars visually collide.
 */
export const HOME_NAV_BAR_HEIGHT_FALLBACK = 62;
/** Gap between the bar and the screen's safe-area bottom edge. */
export const HOME_NAV_BAR_BOTTOM_GAP = 16;
/** Small breathing room between the nav bar and whatever sits above it. */
const CLEARANCE_BUFFER = 4;

interface HomeNavBarState {
  measuredHeight: number;
  setMeasuredHeight: (height: number) => void;
}

export const useHomeNavBarStore = create<HomeNavBarState>((set) => ({
  measuredHeight: HOME_NAV_BAR_HEIGHT_FALLBACK,
  setMeasuredHeight: (height) =>
    set((s) => (Math.abs(s.measuredHeight - height) < 1 ? s : { measuredHeight: height })),
}));

/** Total extra bottom offset other bottom-pinned UI should add to clear the
 * real, currently-rendered nav bar (not the fallback estimate). */
export function useHomeNavBarClearance(): number {
  const measuredHeight = useHomeNavBarStore((s) => s.measuredHeight);
  return measuredHeight + HOME_NAV_BAR_BOTTOM_GAP + CLEARANCE_BUFFER;
}

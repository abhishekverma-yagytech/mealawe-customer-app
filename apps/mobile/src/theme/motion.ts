import { Easing } from 'react-native-reanimated';

/**
 * Shared animation timing/easing tokens — the RN/Reanimated equivalent of a
 * GSAP timeline's duration/ease presets (GSAP itself has no React Native
 * binding; it animates DOM/CSS properties, which don't exist here).
 * Reanimated's worklets run on the UI thread the same way GSAP runs off the
 * browser's main thread, which is what gives either one its "fluid" feel.
 * New motion work in this app should pull timings from here rather than
 * hand-picking a duration per component, so animations stay consistent.
 */
export const MOTION = {
  /** Press-in/out feedback on buttons and tappable rows. */
  press: {
    scale: 0.97,
    durationMs: 120,
  },
  /** Banners, header transitions, and other single-element state changes. */
  standard: {
    durationMs: 350,
    easingIn: Easing.out(Easing.cubic),
    easingOut: Easing.in(Easing.cubic),
  },
  /** Staggered list/card entrances — capped at `maxItems` concurrently
   * animating items; beyond that the tail feels laggy rather than fluid. */
  stagger: {
    itemDurationMs: 300,
    delayPerItemMs: 35,
    maxItems: 8,
  },
} as const;

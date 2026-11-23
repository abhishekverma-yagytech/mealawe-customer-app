import { useState } from 'react';
import {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** How much scroll (px) the backdrop takes to fade from transparent to solid,
 * ending exactly when the hero finishes collapsing. */
const SOLID_FADE_RANGE = 50;

/**
 * Drives the Home hero's transparent-over-video header into a solid bar once
 * scrolled past the collapse point — and keeps `StatusBar` in sync so its
 * (previously hardcoded "light") icons don't go invisible against the
 * now-light solid background.
 *
 * Returns `backdropStyle` — spread onto a backdrop `Animated.View` sized to
 * the collapsed header row, fading in a solid background as the hero
 * finishes collapsing — and `solid`, true once fully solid (flip text/icon
 * colors via `HomeHeader`'s `solid` prop and the `StatusBar` style in
 * response; a discrete flip reads cleanly here since it lands right as the
 * backdrop finishes fading to fully opaque, not mid-fade).
 */
export function useScrollSolidHeader(scrollY: SharedValue<number>, collapseDistance: number) {
  const [solid, setSolid] = useState(false);
  const fadeStart = Math.max(0, collapseDistance - SOLID_FADE_RANGE);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [fadeStart, collapseDistance], [0, 1], Extrapolation.CLAMP),
  }));

  useAnimatedReaction(
    () => scrollY.value >= collapseDistance,
    (curr, prev) => {
      if (curr !== prev) scheduleOnRN(setSolid, curr);
    },
  );

  return { backdropStyle, solid };
}

import { useEffect, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/ui/AppText';
import { accentTint, palette } from '@/theme';

import { useRainBannerStore } from '../rainBannerStore';
import { BannerWave } from './BannerWave';

/** How long the banner stays fully visible before sliding back out. */
const HOLD_MS = 2000;
const SLIDE_IN_MS = 450;
const SLIDE_OUT_MS = 300;
/** Safely off-screen before the real height is known (first layout pass). */
const INITIAL_HIDDEN_Y = -1000;

const BANNER_TINT = accentTint(palette.accent.location, 0.12);

interface RainBannerProps {
  /** Cluster-config `showRainyNotification` flag — `null`/`false` renders nothing. */
  active: boolean | null;
  /** Shared value the parent screen reads to translate its top content (hero +
   * feed) down while this banner is visible — derived directly from this
   * banner's own slide position every frame (see the `useAnimatedReaction`
   * below), so it "pushes" the layout down and always returns it to exactly
   * 0 once the banner finishes hiding. */
  heightValue: SharedValue<number>;
}

/**
 * Top banner shown when the current cluster's admin config has
 * `showRainyNotification` on — mirrors the Blinkit-style reference: slides
 * down from above the safe area, holds briefly, then slides back out. Unlike
 * the legacy Ionic app's persistent Lottie banner, this plays once per
 * app-foreground session so it informs without nagging.
 */
export function RainBanner({ active, heightValue }: RainBannerProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const hasShownThisSession = useRainBannerStore((s) => s.hasShownThisSession);
  const markShown = useRainBannerStore((s) => s.markShown);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const translateY = useSharedValue(INITIAL_HIDDEN_Y);
  // Mirrors `-measuredHeight` on the UI thread — lets the reaction below
  // derive the push amount without closing over the JS `measuredHeight`
  // state (which a worklet can't safely read live).
  const hiddenYShared = useSharedValue(INITIAL_HIDDEN_Y);
  const playedRef = useRef(false);

  const shouldShow = active === true && !hasShownThisSession;

  // `heightValue` (the parent's push amount) is DERIVED directly from
  // `translateY` every frame, rather than animated as a second, independent
  // sequence — two separately-scheduled animations could drift a frame out
  // of sync (a visible seam while sliding) and, worse, had no guarantee of
  // both reaching exactly 0 together once the banner finished hiding. Deriving
  // it makes "back to original position" true by construction.
  //
  // Reacts to BOTH `translateY` and `hiddenYShared` (not just `translateY`)
  // so a late height correction still corrects the push — Android can report
  // `useSafeAreaInsets()` as 0 on the very first layout pass, then update to
  // the real inset a frame later, which re-flows this banner taller than the
  // height captured when the slide-in animation was kicked off below. Without
  // this, the push amount stays locked to that first (too-short) measurement
  // forever, leaving a gap of stale background between the banner and the
  // hero it's supposed to sit flush against.
  useAnimatedReaction(
    () => ({ t: translateY.value, h: hiddenYShared.value }),
    ({ t, h }) => {
      heightValue.value = Math.max(0, t - h);
    },
  );

  // Keeps `hiddenYShared` mirroring the LATEST measured height at all times —
  // independent of `playedRef` below, so a post-first-measurement relayout
  // (see above) still updates the push even after the slide-in has already
  // been triggered once.
  useEffect(() => {
    if (measuredHeight !== null) {
      hiddenYShared.value = -measuredHeight;
    }
  }, [measuredHeight, hiddenYShared]);

  useEffect(() => {
    if (!shouldShow || measuredHeight === null || playedRef.current) return;
    playedRef.current = true;
    const hiddenY = -measuredHeight;

    if (reducedMotion) {
      // No slide — just hold the fully-visible state for the same duration,
      // then disappear instantly, per the app's reduced-motion principle.
      translateY.value = 0;
      translateY.value = withDelay(
        HOLD_MS,
        withTiming(hiddenY, { duration: 0 }, (finished) => {
          if (finished) scheduleOnRN(markShown);
        }),
      );
      return;
    }

    translateY.value = hiddenY;
    translateY.value = withSequence(
      withTiming(0, { duration: SLIDE_IN_MS, easing: Easing.out(Easing.cubic) }),
      withDelay(
        HOLD_MS,
        withTiming(hiddenY, { duration: SLIDE_OUT_MS, easing: Easing.in(Easing.cubic) }, (finished) => {
          if (finished) scheduleOnRN(markShown);
        }),
      ),
    );
  }, [shouldShow, measuredHeight, reducedMotion, markShown, translateY, hiddenYShared]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (active !== true || hasShownThisSession) {
    return null;
  }

  function onLayout(e: LayoutChangeEvent) {
    setMeasuredHeight(e.nativeEvent.layout.height);
  }

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={onLayout}
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }, animatedStyle]}>
      <View style={{ paddingTop: insets.top + 10, paddingBottom: 12, backgroundColor: BANNER_TINT }}>
        <AppText
          variant="title"
          weight="bold"
          className="text-center"
          style={{ color: palette.accent.location }}>
          It's raining near this location
        </AppText>
        <AppText variant="body" className="mt-0.5 text-center text-muted-foreground">
          Our delivery partners may take longer to reach you
        </AppText>
      </View>
      <BannerWave color={BANNER_TINT} />
    </Animated.View>
  );
}

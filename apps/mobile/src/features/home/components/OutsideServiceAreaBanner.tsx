import { useEffect, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/ui/AppText';
import { IconArrowRight, IconMapPin } from '@/components/ui/icons';
import { accentTint, palette } from '@/theme';

import { BannerWave } from './BannerWave';

const SHOW_MS = 400;
const HIDE_MS = 300;
/** Safely off-screen before the real height is known (first layout pass). */
const INITIAL_HIDDEN_Y = -1000;

const BANNER_TINT = accentTint(palette.status.danger, 0.12);

interface OutsideServiceAreaBannerProps {
  /** True once the active delivery address is known to fall outside every
   * serviceable cluster. `false` (including "not yet determined") renders
   * nothing. */
  active: boolean;
  /** Shared value the parent screen reads to translate its top content (hero +
   * feed) down while this banner is visible — derived from this banner's own
   * slide position every frame, same technique as `RainBanner`'s prop of the
   * same name. */
  heightValue: SharedValue<number>;
  onChangeLocation: () => void;
}

/**
 * Top banner shown while the active delivery address falls outside every
 * serviceable cluster (`clusterStore.isServiceable() === false`). Visually a
 * sibling of `RainBanner` (same slide/tint/wave treatment), but unlike it
 * this reflects a real, ongoing condition rather than a point-in-time
 * notice — it stays up for as long as `active` is true and slides away the
 * moment the user picks a serviceable address, instead of playing once per
 * session.
 */
export function OutsideServiceAreaBanner({ active, heightValue, onChangeLocation }: OutsideServiceAreaBannerProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(active);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const translateY = useSharedValue(INITIAL_HIDDEN_Y);
  // Mirrors `-measuredHeight` on the UI thread — see RainBanner for why the
  // push amount is derived from both shared values instead of closing over
  // JS `measuredHeight` state.
  const hiddenYShared = useSharedValue(INITIAL_HIDDEN_Y);

  useAnimatedReaction(
    () => ({ t: translateY.value, h: hiddenYShared.value }),
    ({ t, h }) => {
      heightValue.value = Math.max(0, t - h);
    },
  );

  useEffect(() => {
    if (measuredHeight !== null) {
      hiddenYShared.value = -measuredHeight;
    }
  }, [measuredHeight, hiddenYShared]);

  useEffect(() => {
    if (measuredHeight === null) {
      // Nothing to slide yet — mirror `active` directly so the first paint
      // (which triggers the layout measurement below) shows the banner
      // immediately instead of waiting a frame for an animation that can't
      // start without a known height.
      setVisible(active);
      return;
    }
    const hiddenY = -measuredHeight;
    if (active) {
      setVisible(true);
      translateY.value = withTiming(0, {
        duration: reducedMotion ? 0 : SHOW_MS,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      translateY.value = withTiming(
        hiddenY,
        { duration: reducedMotion ? 0 : HIDE_MS, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) scheduleOnRN(setVisible, false);
        },
      );
    }
  }, [active, measuredHeight, reducedMotion, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) {
    return null;
  }

  function onLayout(e: LayoutChangeEvent) {
    setMeasuredHeight(e.nativeEvent.layout.height);
  }

  return (
    <Animated.View
      onLayout={onLayout}
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }, animatedStyle]}>
      <View
        style={{
          paddingTop: insets.top + 10,
          paddingBottom: 12,
          paddingHorizontal: 20,
          backgroundColor: BANNER_TINT,
        }}>
        <View className="flex-row items-center justify-center gap-1.5">
          <IconMapPin size={16} color={palette.status.danger} />
          <AppText variant="title" weight="bold" className="text-center" style={{ color: palette.status.danger }}>
            You're outside our delivery area
          </AppText>
        </View>
        <AppText variant="body" className="mt-0.5 text-center text-muted-foreground">
          We're expanding fast — we'll be reaching your area soon
        </AppText>
        <Pressable
          onPress={onChangeLocation}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Change delivery location"
          className="mt-2 flex-row items-center justify-center gap-1 self-center active:opacity-70">
          <AppText variant="label" weight="bold" style={{ color: palette.status.danger }}>
            Change Location
          </AppText>
          <IconArrowRight size={14} color={palette.status.danger} />
        </Pressable>
      </View>
      <BannerWave color={BANNER_TINT} />
    </Animated.View>
  );
}

import { useEffect } from 'react';
import { View } from 'react-native';
import LottieView from 'lottie-react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { MOTION, palette, accentTint } from '@/theme';
import { formatINR } from '@/utils/currency';

const SURPRISE_BOX_LOTTIE = require('@/assets/lottie/coupon-surprise-box.json');

interface SavingsBannerProps {
  /** Rupees saved on this order. */
  saving: number;
  /** Whole-number percent saved. */
  percent: number;
}

/**
 * Celebratory top-of-cart strip — "You're saving ₹X (Y%)" on a soft green
 * tint with a green border, matching the light-tint treatment every other
 * accent card in the cart uses (coupon banner, add-on chips) instead of a
 * heavier solid-fill gradient. Fades + settles into place on mount (and
 * whenever it reappears, e.g. a coupon pushing `saving` back above 0) using
 * this app's shared `MOTION.standard` timing.
 */
export function SavingsBanner({ saving, percent }: SavingsBannerProps) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 1 : 0);
  const translateY = useSharedValue(reduced ? 0 : -8);

  useEffect(() => {
    if (reduced) return;
    opacity.value = withTiming(1, { duration: MOTION.standard.durationMs, easing: MOTION.standard.easingIn });
    translateY.value = withTiming(0, { duration: MOTION.standard.durationMs, easing: MOTION.standard.easingIn });
    // Re-fires only on mount — `saving`/`percent` changing while already
    // visible (e.g. a bigger coupon applied) should update the numbers in
    // place, not replay the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      className="flex-row items-center rounded-2xl border p-3.5"
      style={[
        { gap: 12, borderColor: palette.brand.green, backgroundColor: accentTint(palette.brand.green, 0.08) },
        animatedStyle,
      ]}
    >
      <LottieView
        source={SURPRISE_BOX_LOTTIE}
        autoPlay={!reduced}
        loop={!reduced}
        style={{ width: 44, height: 44 }}
      />
      <View style={{ flex: 1 }}>
        <AppText variant="bodySm" style={{ color: palette.brand.greenDark }}>
          You&apos;re saving {formatINR(saving)} on this order
        </AppText>
        {percent > 0 ? (
          <AppText
            variant="overline"
            style={{ color: palette.brand.greenDark, opacity: 0.85, textTransform: 'none', letterSpacing: 0 }}>
            That&apos;s {percent}% off your subscription 🎉
          </AppText>
        ) : null}
      </View>
    </Animated.View>
  );
}

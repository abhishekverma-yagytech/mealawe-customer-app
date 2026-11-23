import { useEffect, useRef, type ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';
import LottieView from 'lottie-react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { IconTicket, type IconProps } from '@/components/ui/icons';
import { palette, accentTint, shadow, useColors, type AccentTone } from '@/theme';
import { formatINR } from '@/utils/currency';

const HURRAY_LOTTIE = require('@/assets/lottie/hurray.json');
// Sized well beyond the card so the burst isn't clipped by its rounded
// corners — it plays behind/around the popup, not inside it.
const LOTTIE_SIZE = 280;

interface CouponCelebrationProps {
  /** Increments each time the celebration should fire (0 = never shown). */
  trigger: number;
  /** Coupon code — builds the default "CODE applied" title when `title` isn't given. */
  code?: string;
  /** Coupon saving amount — builds the default "you saved" subtitle when `subtitle` isn't given. */
  saving?: number;
  /** Overrides the default coupon title, for reusing this overlay outside the coupon flow. */
  title?: string;
  /** Overrides the default "you saved ₹X" subtitle. Omit for no subtitle line. */
  subtitle?: string;
  /** Icon glyph — defaults to the coupon ticket icon. */
  icon?: ComponentType<IconProps>;
  /** Accent tone driving the icon tile + glyph color — defaults to 'reward' (coupon pink). */
  tone?: AccentTone;
}

/**
 * A brief centred celebration overlay — pop + fade, plus the same "hurray"
 * burst animation the Ionic reference app plays for a coupon apply
 * (`offer-flash.component`). Generalized beyond coupons: pass `title` /
 * `subtitle` / `icon` / `tone` to reuse it for any other celebratory moment
 * (e.g. a successful order); omit them and it renders the original "CODE
 * applied, you saved ₹X" coupon copy from `code` / `saving`.
 * Decorative feedback; ignores touches.
 */
export function CouponCelebration({
  trigger,
  code,
  saving,
  title,
  subtitle,
  icon: Icon = IconTicket,
  tone = 'reward',
}: CouponCelebrationProps) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.85);
  const lottieRef = useRef<LottieView>(null);

  useEffect(() => {
    if (trigger === 0) return;
    if (reduced) {
      // No burst animation — hold the static tile instead, same duration.
      opacity.value = withSequence(withTiming(1, { duration: 120 }), withDelay(900, withTiming(0, { duration: 260 })));
      scale.value = 1;
      return;
    }
    opacity.value = withSequence(withTiming(1, { duration: 160 }), withDelay(900, withTiming(0, { duration: 300 })));
    scale.value = withSequence(
      withTiming(1, { duration: 260, easing: Easing.out(Easing.back(1.7)) }),
      withDelay(760, withTiming(0.92, { duration: 300 })),
    );
    lottieRef.current?.reset();
    lottieRef.current?.play();
  }, [trigger, reduced, opacity, scale]);

  const cardStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  const burstStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const iconColor = palette.accent[tone];
  const resolvedTitle = title ?? (code ? `${code} applied 🎉` : '');
  const resolvedSubtitle =
    subtitle ?? (saving !== undefined ? `You saved ${formatINR(saving)} on this order` : undefined);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {/* burst sits behind + around the card, unclipped by its rounded
          corners — a Lottie confetti burst reads as clutter when boxed in */}
      {!reduced ? (
        <Animated.View style={[{ position: 'absolute' }, burstStyle]}>
          <LottieView
            ref={lottieRef}
            source={HURRAY_LOTTIE}
            loop={false}
            autoPlay={false}
            style={{ width: LOTTIE_SIZE, height: LOTTIE_SIZE }}
          />
        </Animated.View>
      ) : null}
      <Animated.View
        style={[
          {
            alignItems: 'center',
            paddingHorizontal: 26,
            paddingVertical: 22,
            borderRadius: 24,
            backgroundColor: colors.card,
          },
          shadow.lifted,
          cardStyle,
        ]}
      >
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: accentTint(iconColor, 0.16),
          }}
        >
          <Icon size={30} color={iconColor} />
        </View>
        <AppText variant="title" className="text-foreground" style={{ marginTop: 12 }}>
          {resolvedTitle}
        </AppText>
        {resolvedSubtitle ? (
          <AppText variant="caption" style={{ color: palette.accent.veg, marginTop: 2 }}>
            {resolvedSubtitle}
          </AppText>
        ) : null}
      </Animated.View>
    </View>
  );
}

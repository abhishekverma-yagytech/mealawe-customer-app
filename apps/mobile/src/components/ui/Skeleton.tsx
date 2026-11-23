import { useEffect } from 'react';
import type { DimensionValue, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useColors } from '@/theme';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: ViewStyle;
}

/**
 * A shimmering placeholder block for loading states — the product-register answer
 * to "skeletons, not a spinner in the middle of content." Pulses opacity on the
 * muted surface; honours reduced-motion (holds a static block).
 */
export function Skeleton({ width = '100%', height = 16, radius = 10, style }: SkeletonProps) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0.55);

  useEffect(() => {
    if (reduced) {
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 850 }), -1, true);
  }, [reduced, pulse]);

  const anim = useAnimatedStyle(() => ({ opacity: reduced ? 0.6 : pulse.value }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.muted }, anim, style]}
    />
  );
}

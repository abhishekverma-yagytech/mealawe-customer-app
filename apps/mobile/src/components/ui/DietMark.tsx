import { View } from 'react-native';

import { palette } from '@/theme';

interface DietMarkProps {
  /** true = veg (circle), false = non-veg (triangle). */
  veg: boolean;
  /** Outer square size (px). Default 16. */
  size?: number;
}

/**
 * The standard India veg / non-veg mark — a bordered square with an inner symbol.
 * Colour-blind safe by design: **veg is a circle, non-veg is a triangle**, so the
 * meaning survives without colour (green/red is a reinforcement, not the signal).
 */
export function DietMark({ veg, size = 16 }: DietMarkProps) {
  const tone = veg ? palette.accent.veg : palette.accent.nonveg;
  const inner = Math.round(size * 0.44);
  return (
    <View
      accessibilityLabel={veg ? 'Vegetarian' : 'Non-vegetarian'}
      style={{
        width: size,
        height: size,
        borderWidth: Math.max(1.4, size * 0.09),
        borderColor: tone,
        borderRadius: Math.round(size * 0.18),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {veg ? (
        <View style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: tone }} />
      ) : (
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: inner / 2,
            borderRightWidth: inner / 2,
            borderBottomWidth: inner,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: tone,
          }}
        />
      )}
    </View>
  );
}

import { View } from 'react-native';

import { DietMark } from '@/components/ui/DietMark';
import { IconDot, IconSweet } from '@/components/ui/icons';
import { palette, accentTint, useColors } from '@/theme';

interface AddonTypeIconProps {
  /** `AddOn.addOnType` — 'Veg' | 'NonVeg' | 'Sweet' | 'NA', or missing. */
  type?: string;
  size?: number;
}

/**
 * Per-add-on diet marker — the standard veg/non-veg square mark for
 * 'Veg'/'NonVeg' (same `DietMark` the Detail screen's diet toggle uses), a
 * candy icon for 'Sweet', and a neutral dot for 'NA' or any missing/
 * unrecognized type, so every add-on always shows something instead of a
 * blank gap where its type would be.
 */
export function AddonTypeIcon({ type, size = 18 }: AddonTypeIconProps) {
  const colors = useColors();

  if (type === 'Veg' || type === 'NonVeg') {
    return <DietMark veg={type === 'Veg'} size={size} />;
  }

  const tileSize = size + 12;
  const iconSize = size - 2;

  if (type === 'Sweet') {
    return (
      <View
        style={{
          width: tileSize,
          height: tileSize,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: accentTint(palette.accent.rating),
        }}>
        <IconSweet size={iconSize} color={palette.accent.rating} />
      </View>
    );
  }

  return (
    <View
      style={{
        width: tileSize,
        height: tileSize,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.muted,
      }}>
      <IconDot size={iconSize} color={colors.mutedForeground} />
    </View>
  );
}

import type { ComponentType } from 'react';
import { View, type ViewProps } from 'react-native';

import { palette, accentTint, type AccentTone } from '@/theme';
import type { IconProps } from './icons';

interface AccentIconProps extends ViewProps {
  /** A Lucide icon component (e.g. `IconMapPin`). */
  icon: ComponentType<IconProps>;
  /** Semantic accent role — picks the hue + tint. */
  tone: AccentTone;
  /** Icon glyph size (px). Default 20. */
  size?: number;
  /** Tile size (px). Default 40. Set `bare` to skip the tile. */
  tileSize?: number;
  /** Render just the colored glyph, no tinted tile. */
  bare?: boolean;
  strokeWidth?: number;
  className?: string;
}

/**
 * A semantic, colored icon — the app's answer to "different colors for icons
 * everywhere." Renders a solid-hue Lucide glyph on a soft (~12%) tint tile,
 * driven by an accent role from the Modern Fresh palette. Green is never an
 * accent tone here — it stays reserved for CTAs (`<Button variant="primary">`).
 *
 * @example
 * <AccentIcon icon={IconMapPin} tone="location" />
 * <AccentIcon icon={IconGift} tone="reward" size={18} tileSize={36} />
 * <AccentIcon icon={IconStar} tone="rating" bare size={14} />
 */
export function AccentIcon({
  icon: Icon,
  tone,
  size = 20,
  tileSize = 40,
  bare = false,
  strokeWidth = 2,
  className,
  style,
  ...rest
}: AccentIconProps) {
  const color = palette.accent[tone];
  const glyph = <Icon size={size} color={color} strokeWidth={strokeWidth} />;

  if (bare) {
    return glyph;
  }

  return (
    <View
      className={className}
      style={[
        {
          width: tileSize,
          height: tileSize,
          borderRadius: tileSize * 0.3,
          backgroundColor: accentTint(color),
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
      {...rest}
    >
      {glyph}
    </View>
  );
}

import type { ComponentType } from 'react';
import { View } from 'react-native';

import type { IconProps } from '@/components/ui/icons';

interface MapMarkerBadgeProps {
  icon: ComponentType<IconProps>;
  color: string;
  size?: number;
}

/** A white-halo, colored-circle map pin — the shared look for every marker on
 * `TrackingMap` (destination, pickup, rider). Reads clearly at small sizes
 * against any map terrain, unlike a bare colored glyph or a detailed
 * illustration. */
export function MapMarkerBadge({ icon: Icon, color, size = 40 }: MapMarkerBadgeProps) {
  const iconSize = Math.round(size * 0.5);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.22,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
        elevation: 4,
      }}>
      <View
        style={{
          width: size - 6,
          height: size - 6,
          borderRadius: (size - 6) / 2,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Icon size={iconSize} color="#fff" strokeWidth={2.25} />
      </View>
    </View>
  );
}

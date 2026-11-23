import { View } from 'react-native';

import { IconDelivery } from '@/components/ui/icons';
import { palette } from '@/theme';

import { MapMarkerBadge } from './MapMarkerBadge';

/** Small triangular heading pointer that orbits the badge's rim — sized
 * relative to the badge, not the marker's overall bounding box. */
const ARROW_SIZE = 6;

interface RunnerMarkerIconProps {
  size?: number;
  /** Heading in degrees — rotates the pointer around the badge's rim to face
   * the direction of travel, without rotating the bike glyph itself (which
   * would read upside-down at some headings). */
  rotation?: number;
}

/**
 * Live rider position on the map — a colored badge (bike glyph on a solid
 * circle, white halo) plus a small pointer that orbits the rim to show
 * heading. Replaces the old photorealistic illustration, which read as an
 * indistinct dark blob at map-marker scale.
 */
export function RunnerMarkerIcon({ size = 40, rotation = 0 }: RunnerMarkerIconProps) {
  const box = size + ARROW_SIZE * 2;
  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: box,
          height: box,
          alignItems: 'center',
          transform: [{ rotate: `${rotation}deg` }],
        }}>
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: ARROW_SIZE,
            borderRightWidth: ARROW_SIZE,
            borderBottomWidth: ARROW_SIZE + 2,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: palette.accent.info,
          }}
        />
      </View>
      <MapMarkerBadge icon={IconDelivery} color={palette.accent.info} size={size} />
    </View>
  );
}

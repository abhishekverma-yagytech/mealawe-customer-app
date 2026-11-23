import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { AccentIcon } from '@/components/ui/AccentIcon';
import { IconChevronDown, IconMapPin } from '@/components/ui/icons';
import { useClusterStore, useLocationStore } from '@/store';
import { addressLabel } from '../types';

interface LocationClusterBarProps {
  /** Override the default tap action (defaults to opening /addresses). */
  onPress?: () => void;
  /** Compact single-line variant (for headers). */
  compact?: boolean;
  /** Hide the "DELIVERING TO" eyebrow label (used when the context is obvious). */
  hideEyebrow?: boolean;
  className?: string;
}

/**
 * The shared **location + cluster combo**. Shows the active delivery address and
 * derives serviceability from the detected cluster(s). Reused across every
 * ordering vertical (subscription / dine-in / bulk) so "where am I ordering to,
 * and is it serviceable" is answered once, consistently.
 *
 * Tapping opens the address manager. On mount it lazily runs cluster detection
 * if an address exists but no cluster is cached yet.
 */
export function LocationClusterBar({
  onPress,
  compact = false,
  hideEyebrow = false,
  className,
}: LocationClusterBarProps) {
  const router = useRouter();
  const current = useLocationStore((s) => s.current);
  const clusters = useClusterStore((s) => s.clusters);
  const detectClusters = useClusterStore((s) => s.detectClusters);

  const serviceable = clusters.length > 0;
  const label = addressLabel(current);

  useEffect(() => {
    if (current?.geolocation && clusters.length === 0) {
      void detectClusters(current.geolocation);
    }
  }, [current, clusters.length, detectClusters]);

  const handlePress = onPress ?? (() => router.push('/addresses'));

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Delivery location: ${label}. Tap to change.`}
      className={[
        'flex-row items-center gap-3 active:opacity-80',
        compact ? '' : 'rounded-2xl bg-card px-3 py-2.5 border border-border',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <AccentIcon icon={IconMapPin} tone="location" size={18} tileSize={compact ? 34 : 38} />
      <View className="flex-1">
        {!hideEyebrow ? (
          <AppText variant="overline" className="text-muted-foreground">
            {serviceable ? 'DELIVERING TO' : 'SET LOCATION'}
          </AppText>
        ) : null}
        <AppText variant="label" numberOfLines={1} className="text-foreground">
          {label}
        </AppText>
        {!serviceable && current ? (
          <AppText variant="caption" className="text-danger">
            We don&apos;t deliver here yet — try another area
          </AppText>
        ) : null}
      </View>
      <IconChevronDown size={20} color="#6d6d6d" />
    </Pressable>
  );
}

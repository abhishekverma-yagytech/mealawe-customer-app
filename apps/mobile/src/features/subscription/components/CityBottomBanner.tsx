import { View } from 'react-native';
import { Image } from 'expo-image';

import { bannerForClusters } from '@/features/location';
import { useClusterStore } from '@/store';

/**
 * City-specific "we deliver here" banner — ports mealaweApp's cluster-gated
 * `assets/bottomBanner` images (Pune/Kota/Bangalore/Mumbai) onto the bottom of
 * the subscription detail screen. Resolves the current cluster via
 * `useClusterStore` and renders nothing when it doesn't match a known city,
 * mirroring the Ionic app's `selectedCluster === 'Other'` (no banner) case.
 */
export function CityBottomBanner() {
  const clusters = useClusterStore((s) => s.clusters);
  const banner = bannerForClusters(clusters);

  if (!banner) {
    return null;
  }

  return (
    <View style={{ borderRadius: 18, overflow: 'hidden', width: '100%' }} className="mt-8">
      <Image
        source={banner.image}
        style={{ width: '100%', aspectRatio: banner.aspectRatio }}
        contentFit="cover"
      />
    </View>
  );
}

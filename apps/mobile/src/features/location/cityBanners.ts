import type { ImageSourcePropType } from 'react-native';

import type { Cluster } from './types';

/** One city's "we deliver here" banner — mirrors mealaweApp's `assets/bottomBanner`. */
export interface CityBanner {
  /** Substring matched against `clusterName` (case-insensitive). */
  match: string;
  image: ImageSourcePropType;
  /** Source image's own width/height ratio — each city's banner is a distinct
   * poster graphic (not a shared frame), so it's sized exactly, never cropped. */
  aspectRatio: number;
}

const CITY_BANNERS: readonly CityBanner[] = [
  { match: 'pune', image: require('../../assets/images/bottom-banner/LivePune.png'), aspectRatio: 1536 / 1024 },
  { match: 'kota', image: require('../../assets/images/bottom-banner/LiveKota.png'), aspectRatio: 1402 / 1122 },
  {
    match: 'bangalore',
    image: require('../../assets/images/bottom-banner/LiveBlr.png'),
    aspectRatio: 1402 / 1122,
  },
  { match: 'mumbai', image: require('../../assets/images/bottom-banner/LiveMumbai.png'), aspectRatio: 1536 / 1024 },
];

/**
 * Resolve the city-specific bottom banner for the user's current cluster(s),
 * or `null` when no cluster matches a known city (mirrors mealaweApp's
 * `selectedCluster === 'Other'` case, where no banner renders).
 */
export function bannerForClusters(clusters: readonly Cluster[]): CityBanner | null {
  const names = clusters.map((c) => (c.clusterName ?? '').toLowerCase()).join(' ');
  return CITY_BANNERS.find((banner) => names.includes(banner.match)) ?? null;
}

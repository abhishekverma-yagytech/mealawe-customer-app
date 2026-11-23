import { View } from 'react-native';

export const WAVE_HEIGHT = 14;

interface BannerWaveProps {
  /** Fill color — should match the banner's tinted background so the edge
   * reads as a continuation of it, not a separate shape. */
  color: string;
}

/** Straight bottom edge shared by the top-of-home banners (rain, outside
 * service area, …) — factored out of `RainBanner` so every such banner draws
 * the same shape from one place instead of drifting copies. */
export function BannerWave({ color }: BannerWaveProps) {
  return <View style={{ height: WAVE_HEIGHT, backgroundColor: color }} />;
}

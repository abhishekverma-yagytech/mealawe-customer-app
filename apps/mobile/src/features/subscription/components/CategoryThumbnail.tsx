import { Image, type ImageContentFit } from 'expo-image';
import { View } from 'react-native';

import { IconUtensils } from '@/components/ui/icons';
import { palette, accentTint } from '@/theme';

import type { CategoryImageSource } from '../subscriptionCategories';

interface CategoryThumbnailProps {
  /** Category image — omit to show the fallback tile. */
  image?: CategoryImageSource;
  /** Square box size (width = height). Omit when the caller already sizes +
   * clips its own container (e.g. `CategoryCard`'s image band, which isn't
   * square) — the thumbnail then just fills whatever space it's given. */
  size?: number;
  /** Fallback icon size when there's no image. */
  iconSize: number;
  /** Corner radius when `size` is set. Ignored (and unnecessary) when `size`
   * is omitted, since the caller's own container owns the clipping then. */
  radius?: number;
  /** @default 'cover' */
  contentFit?: ImageContentFit;
}

/**
 * Shared "category photo, else a tinted utensils icon" thumbnail — the exact
 * image/fallback treatment both `CategoryCard` (the home grid's photo band)
 * and `CategoriesSheet` (the "See all" sheet's small square tiles) need, just
 * at different sizes/shapes, so neither has to duplicate the fallback markup.
 */
export function CategoryThumbnail({ image, size, iconSize, radius = 0, contentFit = 'cover' }: CategoryThumbnailProps) {
  const boxStyle = size != null ? { width: size, height: size, borderRadius: radius, overflow: 'hidden' as const } : { flex: 1 };
  return (
    <View style={boxStyle}>
      {image ? (
        <Image source={image} style={{ width: '100%', height: '100%' }} contentFit={contentFit} />
      ) : (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: accentTint(palette.accent.food, 0.14),
          }}
        >
          <IconUtensils size={iconSize} color={palette.accent.food} />
        </View>
      )}
    </View>
  );
}

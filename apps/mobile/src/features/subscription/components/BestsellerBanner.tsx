import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { shadow } from '@/theme';

import { CategoryThumbnail } from './CategoryThumbnail';
import { IconFeatureStrip } from './IconFeatureStrip';
import { BESTSELLER_FEATURES } from '../promises';
import type { SubCategory } from '../subscriptionCategories';

/** Fixed banner box ratio (3:1) — `contentFit="contain"` below fits whatever
 * source image (any native aspect) inside it uncropped, letterboxing rather
 * than cropping the old hardcoded photo's 3:2 crop used to do. */
const BANNER_ASPECT_RATIO = 3 / 1;
/** Bigger than CategoryCard's 28 — the banner is full-width, not a small grid tile. */
const FALLBACK_ICON_SIZE = 48;

interface BestsellerBannerProps {
  category: SubCategory;
  priceLabel: string;
  onPress: () => void;  
}

/**
 * Full-width "bestseller" promo banner for the Home screen, right under the
 * search bar — a real dish photo instead of the old flat teal "Picked for
 * you" card. `category`'s own tile is dropped from the grid below so it
 * isn't shown twice (see `SubscriptionHome`). Gradient-scrimmed name/tagline/
 * price/CTA sit over the photo; the feature strip (Fresh Ingredient's /
 * Weekly menu / Flexible Plans / Hygienic & safe) sits underneath it.
 *
 * Image is the category's own admin-set `showcaseImage` — was a single
 * hardcoded static photo for every category before this existed. Falls back
 * to `detailImage`/`image` for a bestseller category that hasn't had a
 * dedicated showcase photo uploaded yet, then — via `CategoryThumbnail` — to
 * the same tinted-icon placeholder every category card already shows for a
 * missing image, instead of a specific dish photo that could misrepresent
 * whichever category is actually marked bestseller.
 */
export function BestsellerBanner({ category, priceLabel, onPress }: BestsellerBannerProps) {
  const bannerImage = category.showcaseImage ?? category.detailImage ?? category.image;
  return (
    <View className="mx-4 mt-4" style={{ gap: 10 }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={[shadow.card, { borderRadius: 16, overflow: 'hidden' }]}>
        <View style={{ width: '100%', aspectRatio: BANNER_ASPECT_RATIO }}>
          <CategoryThumbnail image={bannerImage} iconSize={FALLBACK_ICON_SIZE} contentFit="cover" />
        </View>
      </Pressable>
    </View>
  );
}

import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { PriceWithOriginal } from '@/components/ui/PriceWithOriginal';
import { shadow, useColors } from '@/theme';

import { CategoryThumbnail } from './CategoryThumbnail';
import type { SubCategory } from '../subscriptionCategories';

const IMAGE_HEIGHT = 120;

interface CategoryCardProps {
  category: SubCategory;
  /** Resolved current (post-discount) price label, e.g. "₹89/meal" — pricing is resolved by the caller. */
  priceLabel: string;
  /** Pre-discount price label to show struck through next to `priceLabel`, or
   * `null` when the cheapest plan carries no discount. */
  originalPriceLabel: string | null;
  onPress: () => void;
}

/**
 * 2-column grid card for browsing subscription categories on the Home screen —
 * photo with an optional badge ribbon (top-left), then name, a "Starting at"
 * price (current + struck-through original when discounted), and a
 * "View more" outline button. The full description lives on the detail
 * screen (view more), not truncated here — this card is a teaser, not the
 * full pitch. Sized by its parent grid column (~48%, same convention
 * `SubscriptionHome`/`KitchenGrid` use), not a fixed width, so it fills
 * whichever column width the grid gives it.
 */
export function CategoryCard({ category, priceLabel, originalPriceLabel, onPress }: CategoryCardProps) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[shadow.card, { width: '100%', borderRadius: 18, overflow: 'hidden', backgroundColor: colors.card }]}
      className="active:opacity-90">
      <View style={{ height: IMAGE_HEIGHT }}>
        <CategoryThumbnail image={category.image} iconSize={28} />
        {category.badge ? (
          <View
            className="absolute left-0 top-2 px-2.5 py-1"
            style={{
              backgroundColor: category.badge.color,
              borderTopRightRadius: 10,
              borderBottomRightRadius: 10,
            }}>
            <AppText variant="overline" className="text-white">
              {category.badge.label}
            </AppText>
          </View>
        ) : null}
      </View>

      <View className="gap-1 p-3">
        <AppText variant="label" className="text-foreground" numberOfLines={1}>
          {category.name}
        </AppText>
        <View style={{ marginTop: 2 }}>
          <AppText variant="caption" className="text-muted-foreground">
            Starting at
          </AppText>
          <PriceWithOriginal price={priceLabel} originalPrice={originalPriceLabel} priceVariant="title" />
        </View>
        <View style={{ marginTop: 6 }}>
          <Button label="View more" variant="outline" size="sm" block onPress={onPress} accessible={false} />
        </View>
      </View>
    </Pressable>
  );
}

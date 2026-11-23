import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { palette, shadow } from '@/theme';

import type { BulkCategory } from '../types';

const TILE: Record<BulkCategory, { label: string; tag: string; photo: number }> = {
  meals: {
    label: 'Meals',
    tag: 'Feed a crowd',
    photo: require('../../../assets/images/bulk/bulk-meals.webp'),
  },
  snacks: {
    label: 'Snacks',
    tag: 'Bites & sides',
    photo: require('../../../assets/images/bulk/bulk-snacks.webp'),
  },
  foodbox: {
    label: 'Food Box',
    tag: 'Build your own',
    photo: require('../../../assets/images/bulk/bulk-foodbox.webp'),
  },
};

const PHOTO_HEIGHT = 104;

interface BulkCategoryTileProps {
  category: BulkCategory;
  onPress: () => void;
  /** Real item count for this category's menu (from `useBulkCategorySummaries`).
   * Undefined while loading or on fetch failure — never fabricate a number. */
  itemCount?: number;
  /** Real org-wide MOQ for this category, same source as `itemCount`. */
  moq?: number;
}

/** Category card — a real photo banner over a plain white footer (title,
 * tagline, item-count/MOQ meta in the Bulk accent), laid out as a 2-column
 * grid. Matches the design reference's plain-card treatment (border +
 * subtle shadow, real photography) rather than an illustrated gradient
 * banner. */
export function BulkCategoryTile({ category, onPress, itemCount, moq }: BulkCategoryTileProps) {
  const { label, tag, photo } = TILE[category];
  // Only ever real numbers off the menu response — falls back to MOQ-only if
  // the item count isn't known (moq undefined too → line omitted entirely).
  const moqLine = moq === undefined ? null : itemCount === undefined ? `MOQ ${moq}` : `${itemCount} items · MOQ ${moq}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[shadow.card, { borderRadius: 18, overflow: 'hidden' }]}
      className="w-[48%] border border-border bg-card active:opacity-90">
      <Image source={photo} style={{ width: '100%', height: PHOTO_HEIGHT }} contentFit="contain" />
      <View className="px-3 pb-3 pt-2.5">
        <AppText variant="title" className="text-foreground">
          {label}
        </AppText>
        <AppText variant="caption" className="mt-0.5 text-muted-foreground">
          {tag}
        </AppText>
        {moqLine ? (
          <AppText variant="caption" weight="bold" className="mt-1.5" style={{ color: palette.accent.plan }}>
            {moqLine}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

import { forwardRef } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { BottomSheetScrollView, type BottomSheetModal } from '@gorhom/bottom-sheet';

import { AppSheet } from '@/components/ui/AppSheet';
import { AppText } from '@/components/ui/AppText';
import { IconClose } from '@/components/ui/icons';
import { useColors } from '@/theme';

import { CategoryThumbnail } from './CategoryThumbnail';
import type { SubCategory } from '../subscriptionCategories';

interface CategoriesSheetProps {
  /** Every category to list — the Home grid only passes the search-filtered
   * subset it's showing, this sheet always gets the full, unfiltered set. */
  categories: readonly SubCategory[];
  /** Resolved starting price label for a category, e.g. "₹89/meal" — same
   * resolver the Home grid's `CategoryCard`s use. */
  priceLabelFor: (category: SubCategory) => string;
  onSelectCategory: (category: SubCategory) => void;
  onClose: () => void;
}

/** Below this window width, 3 columns starts feeling cramped (small/older
 * phones, ~iPhone SE class) — drop to 2 there. Typical phones and up get 3,
 * since 2 large 88px tiles leave clearly unused width at normal sizes. */
const NARROW_WIDTH_BREAKPOINT = 340;

/**
 * "See all" bottom sheet opened from the Home screen's Categories header —
 * every category in the caller's (cluster-aware) `categories` list as a
 * thumbnail + name + price grid, 3 columns on typical phones (2 on genuinely
 * narrow ones — see `NARROW_WIDTH_BREAKPOINT`). Tapping a tile dismisses the
 * sheet and behaves the same as tapping a `CategoryCard`.
 */
export const CategoriesSheet = forwardRef<BottomSheetModal, CategoriesSheetProps>(
  ({ categories, priceLabelFor, onSelectCategory, onClose }, ref) => {
    const colors = useColors();
    const { width } = useWindowDimensions();
    const columns = width >= NARROW_WIDTH_BREAKPOINT ? 3 : 2;
    const thumbSize = columns === 3 ? 76 : 88;
    const itemWidth = columns === 3 ? '31%' : '48%';
    return (
      <AppSheet ref={ref} snapPoints={['75%']} onDismiss={onClose}>
        <View className="flex-row items-center justify-between px-5 pt-2 pb-3">
          <AppText variant="h2" className="text-foreground">
            All Categories
          </AppText>
          <Pressable
            onPress={() => (ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: colors.muted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconClose size={17} color={colors.foreground} />
          </Pressable>
        </View>

        <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <View className="flex-row flex-wrap justify-between" style={{ rowGap: 22 }}>
            {categories.map((category) => (
              <Pressable
                key={category.param}
                onPress={() => {
                  (ref as React.RefObject<BottomSheetModal>)?.current?.dismiss();
                  onSelectCategory(category);
                }}
                accessibilityRole="button"
                style={{ width: itemWidth, alignItems: 'center' }}
                className="gap-2 active:opacity-80"
              >
                <CategoryThumbnail
                  image={category.image}
                  size={thumbSize}
                  iconSize={columns === 3 ? 24 : 30}
                  radius={columns === 3 ? 16 : 20}
                />
                <AppText
                  variant="label"
                  className="text-foreground"
                  numberOfLines={1}
                  style={{ textAlign: 'center' }}
                >
                  {category.name}
                </AppText>
                <AppText variant="bodySm" className="text-muted-foreground" numberOfLines={1}>
                  {priceLabelFor(category)}
                </AppText>
              </Pressable>
            ))}
          </View>
        </BottomSheetScrollView>
      </AppSheet>
    );
  },
);

CategoriesSheet.displayName = 'CategoriesSheet';

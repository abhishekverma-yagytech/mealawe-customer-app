import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  type SharedValue,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { IconChevronRight, IconSearch, IconUtensils } from '@/components/ui/icons';
import { useBottomStackClearance } from '@/features/orders';
import { trackCategoryViewed } from '@/services/netcore';
import { palette, shadow } from '@/theme';

import { BestsellerBanner } from './BestsellerBanner';
import { CategoriesSheet } from './CategoriesSheet';
import { CategoryCard } from './CategoryCard';
import { ReasonsGrid } from './ReasonsGrid';
import { TestimonialCard } from './TestimonialCard';
import { cheapestPriceLabels } from '../pricing';
import type { SubCategory } from '../subscriptionCategories';
import { useSubscriptionBrowseStore } from '../subscriptionBrowseStore';
import { useSubscriptionCatalog } from '../useSubscriptionCatalog';
import { useSubscriptionReviews } from '../testimonials';

interface SubscriptionHomeProps {
  /** Shared scroll offset — lets the home hero collapse as this feed scrolls. */
  scrollY?: SharedValue<number>;
  /** Top padding so content starts below the home hero band (the collapse zone). */
  topInset?: number;
  /** Increment to scroll this feed back to the top — e.g. tapping the
   * already-active Subscription tab again. */
  scrollToTopSignal?: number;
}

/**
 * The Subscription tab body — a browse-first discovery screen: search the
 * category catalog, jump into the full list from a "See all" sheet, browse
 * the 2-col category grid, a featured-category promo banner (whichever
 * category is admin-flagged `isBestseller` for this cluster — see
 * `featuredCategory`; works identically for every cluster, not just Pune),
 * social proof, and a "why choose us" grid. Picking a category (grid, sheet,
 * or banner) hands it to `useSubscriptionBrowseStore` and pushes into the
 * category's Detail screen — this screen no longer picks a duration/package
 * itself, that's the Detail → Plan screens' job.
 */
export function SubscriptionHome({
  scrollY,
  topInset = 0,
  scrollToTopSignal = 0,
}: SubscriptionHomeProps) {
  const router = useRouter();
  const setCategory = useSubscriptionBrowseStore((s) => s.setCategory);
  // `categories` is already cluster-config-scoped server-side
  // (`getSubscriptionCategoryListByClusterConfig`) — no client-side cluster
  // matching needed here.
  const { loading, categories, packagesFor, reload: reloadCatalog } = useSubscriptionCatalog();
  const bottomStackClearance = useBottomStackClearance();
  const scrollRef = useRef<Animated.ScrollView>(null);
  const sheetRef = useRef<BottomSheetModal>(null);

  const [search, setSearch] = useState('');

  const { testimonials, reload: reloadReviews } = useSubscriptionReviews();

  // Pull-to-refresh — re-fetches both the catalog (categories + packages) and
  // testimonials for the current cluster config. `loading` (from the catalog
  // hook) doubles as the spinner's own state, same convention `orders.tsx`
  // already uses, rather than tracking a separate local flag.
  function onRefresh(): void {
    reloadCatalog();
    reloadReviews();
  }

  const onScroll = useAnimatedScrollHandler((e) => {
    if (scrollY) {
      scrollY.value = e.contentOffset.y;
    }
  });

  useEffect(() => {
    if (scrollToTopSignal) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [scrollToTopSignal]);

  // Category to feature in the bestseller banner — whichever category this
  // cluster's admin flagged `isBestseller`, or none. Works identically for
  // every cluster (Mumbai, Bangalore, Pune, Kota) — no more Pune-only special
  // case, and no more guessing via `categories[0]` when nothing is flagged.
  const featuredCategory: SubCategory | null = categories.find((c) => c.isBestseller) ?? null;

  // Every category shows in the grid below, in the same priority order as
  // the catalog itself — including the featured one, so Deluxe (or whichever
  // category is promoted via the banner) still appears at its own precedence
  // position instead of only existing above the fold.
  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;
  }, [search, categories]);

  // The bestseller banner follows the search too — it's a category tile like
  // any other, so a search that doesn't match it shouldn't leave it floating
  // above results that disagree with what's typed. No query at all still
  // always shows it (that's its normal, un-searched state). `false` for any
  // cluster with no `isBestseller` category flagged, not just Pune.
  const showFeaturedBanner =
    !!featuredCategory &&
    (!search.trim() || featuredCategory.name.toLowerCase().includes(search.trim().toLowerCase()));

  /** Current (post-discount) price label for a category — its admin-picked
   * `homeTilePackageId` when set, else the cheapest ₹/meal match — or a
   * loading/fallback string. Used by the featured-category banner and
   * `CategoriesSheet`'s simpler (non-struck-through) price line. */
  function priceLabelFor(category: SubCategory): string {
    const price = cheapestPriceLabels(packagesFor(category.param), category.homeTilePackageId)?.current;
    return price ?? (loading ? 'Loading…' : 'View plans');
  }

  /** Current (post-discount) + original per-meal price labels for a
   * category's Home-tile plan (admin-picked, else cheapest) — `original` is
   * `null` when that plan carries no discount, so `CategoryCard` knows not
   * to render a line-through. */
  function priceLabelsFor(category: SubCategory): { current: string; original: string | null } | null {
    return cheapestPriceLabels(packagesFor(category.param), category.homeTilePackageId);
  }

  function selectCategory(category: SubCategory): void {
    trackCategoryViewed(category.name);
    setCategory(category);
    router.push({ pathname: '/subscription-detail', params: { categoryParam: category.param } });
  }

  return (
    <View className="flex-1">
      <Animated.ScrollView
        ref={scrollRef}
        className="flex-1"
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={palette.brand.green} />}
        contentContainerStyle={{ paddingTop: topInset, paddingBottom: 40 + bottomStackClearance }}>
        {/* 1. search */}
        <View className="px-4 pt-3">
          <View
            className="flex-row items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3.5"
            style={shadow.card}>
            <IconSearch size={20} color={palette.neutral.gray500} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search category"
              placeholderTextColor={palette.neutral.gray500}
              className="flex-1 font-metropolis text-title text-foreground"
              style={{ paddingVertical: 0 }}
            />
          </View>
        </View>

        {/* 2. bestseller banner — full-width photo + feature strip, right
            under search. Also still appears in the grid below at its own
            precedence position — not deduped out, so the category catalog
            below always reads as the complete, correctly-ordered list.
            Follows the search like any other category tile — hidden when a
            query doesn't match it (see `showFeaturedBanner`). */}
        {showFeaturedBanner && featuredCategory ? (
          <BestsellerBanner
            category={featuredCategory}
            priceLabel={priceLabelFor(featuredCategory)}
            onPress={() => selectCategory(featuredCategory)}
          />
        ) : null}

        {/* 3. categories header + see all */}
        <View className="flex-row items-center justify-between px-4 pt-4">
          <AppText variant="h3" className="text-foreground">
            Meals for you
          </AppText>
          <Pressable
            onPress={() => sheetRef.current?.present()}
            accessibilityRole="button"
            hitSlop={6}
            className="flex-row items-center gap-1 active:opacity-70">
            <AppText variant="h3" className="text-primary">
              See all
            </AppText>
            <IconChevronRight size={16} color={palette.brand.green} />
          </Pressable>
        </View>

        {/* 4. category grid */}
        <View className="px-4 pt-4">
          {filteredCategories.length === 0 ? (
            <EmptyState title="No matching categories" message="Try a different search term." />
          ) : (
            <View className="flex-row flex-wrap justify-between" style={{ rowGap: 14 }}>
              {filteredCategories.map((category) => {
                const prices = priceLabelsFor(category);
                return (
                  <View key={category.param} style={{ width: '48%' }}>
                    <CategoryCard
                      category={category}
                      priceLabel={prices?.current ?? (loading ? 'Loading…' : 'View plans')}
                      originalPriceLabel={prices?.original ?? null}
                      onPress={() => selectCategory(category)}
                    />
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* 5. testimonials — cluster-wise, hidden entirely when the current
            cluster has none (mirrors MealaweUserApp's tabOrder.page reviews
            section, `*ngIf="reviews.length > 0"`). */}
        {testimonials.length > 0 ? (
          <View className="pt-8">
            <AppText variant="h3" className="px-4 text-foreground">
              Loved by our subscribers
            </AppText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingTop: 12 }}>
              {testimonials.map((testimonial) => (
                <TestimonialCard key={testimonial.name} testimonial={testimonial} />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* 6. why choose us */}
        <View className="px-4 pt-8">
          <AppText variant="h3" className="text-foreground" style={{ marginBottom: 12 }}>
            Why choose us
          </AppText>
          <ReasonsGrid />
        </View>
      </Animated.ScrollView>

      <CategoriesSheet
        ref={sheetRef}
        categories={categories}
        priceLabelFor={priceLabelFor}
        onSelectCategory={selectCategory}
        onClose={() => {}}
      />
    </View>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View className="items-center px-8 py-14">
      <AccentIcon icon={IconUtensils} tone="food" size={26} tileSize={56} />
      <AppText variant="title" className="text-foreground" style={{ marginTop: 12, textAlign: 'center' }}>
        {title}
      </AppText>
      <AppText
        variant="bodySm"
        className="text-muted-foreground"
        style={{ marginTop: 4, textAlign: 'center' }}
      >
        {message}
      </AppText>
    </View>
  );
}

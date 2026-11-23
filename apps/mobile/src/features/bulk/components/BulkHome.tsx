import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, type SharedValue } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { IconSearch } from '@/components/ui/icons';
import { useBottomStackClearance } from '@/features/orders';
import { trackCategoryViewed } from '@/services/netcore';
import { mixHex, palette, shadow } from '@/theme';

import { useBulkCategorySummaries } from '../useBulkCategorySummaries';
import { BulkCategoryTile } from './BulkCategoryTile';

const CATEGORY_NAMES: Record<'meals' | 'snacks' | 'foodbox', string> = {
  meals: 'Meals',
  snacks: 'Snacks',
  foodbox: 'Food Box',
};

interface BulkHomeProps {
  /** Shared scroll offset — lets the home hero collapse as this feed scrolls,
   * same contract as SubscriptionHome. */
  scrollY?: SharedValue<number>;
  /** Top padding so content starts below the home hero band. */
  topInset?: number;
  /** Increment to scroll this feed back to the top — e.g. tapping the
   * already-active Bulk tab again. */
  scrollToTopSignal?: number;
}

/**
 * The Bulk tab body — search + a 3-tile category grid (Meals/Snacks/Food
 * Box) and a "how slabs work" note. Mirrors SubscriptionHome's own
 * `Animated.ScrollView` scroll wiring so the shared home hero collapses and
 * the nav bar hides the same way it does on every other feed tab.
 */
export function BulkHome({ scrollY, topInset = 0, scrollToTopSignal = 0 }: BulkHomeProps) {
  const router = useRouter();
  const bottomStackClearance = useBottomStackClearance();
  const scrollRef = useRef<Animated.ScrollView>(null);
  const summaries = useBulkCategorySummaries(true);

  const [search, setSearch] = useState('');

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

  const categories = useMemo(() => {
    const all: Array<'meals' | 'snacks' | 'foodbox'> = ['meals', 'snacks', 'foodbox'];
    const q = search.trim().toLowerCase();
    return q ? all.filter((c) => CATEGORY_NAMES[c].toLowerCase().includes(q)) : all;
  }, [search]);

  return (
    <Animated.ScrollView
      ref={scrollRef}
      className="flex-1"
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={{ paddingTop: topInset, paddingBottom: 40 + bottomStackClearance }}>
      {/* search */}
      <View className="px-4 pt-3">
        <View
          className="flex-row items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3.5"
          style={shadow.card}>
          <IconSearch size={20} color={palette.neutral.gray500} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search meals, snacks, food box"
            placeholderTextColor={palette.neutral.gray500}
            className="flex-1 font-metropolis text-title text-foreground"
            style={{ paddingVertical: 0 }}
          />
        </View>
      </View>

      <View className="px-5 pt-6">
        <AppText variant="h2" className="text-foreground">
          Bulk order
        </AppText>
        <AppText variant="body" className="mt-1 text-muted-foreground">
          Select from a variety of food options to satisfy your needs. Slab pricing, MOQ 20 per item.
        </AppText>

        <View className="mt-4 flex-row flex-wrap gap-3">
          {categories.map((category) => (
            <BulkCategoryTile
              key={category}
              category={category}
              itemCount={summaries[category]?.itemCount}
              moq={summaries[category]?.moq}
              onPress={() => {
                trackCategoryViewed(CATEGORY_NAMES[category]);
                router.push({ pathname: '/bulk-menu', params: { category } });
              }}
            />
          ))}
        </View>

        <View
          className="mt-5 gap-1 rounded-2xl p-4"
          style={{ backgroundColor: mixHex(palette.accent.plan, palette.brand.teal, 0.55) }}>
          <AppText variant="overline" style={{ color: 'rgba(255,255,255,0.75)' }}>
            HOW SLABS WORK
          </AppText>
          <AppText variant="bodySm" style={{ color: '#ffffff' }}>
            Unit price steps down at 51, 151 and 301 units. Bigger orders need a day or two more to prep — the
            cart tells you the earliest date.
          </AppText>
        </View>
      </View>
    </Animated.ScrollView>
  );
}

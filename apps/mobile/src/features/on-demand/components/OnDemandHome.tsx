import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedScrollHandler, type SharedValue } from 'react-native-reanimated';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { IconMapPin, IconSearch } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { useBottomStackClearance } from '@/features/orders';
import { useClusterStore, useVegModeStore } from '@/store';
import { palette, shadow } from '@/theme';

import { loadNearestKitchens } from '../api';
import { isNearby } from '../pricing';
import type { OnDemandKitchen } from '../types';
import { KitchenGrid } from './KitchenGrid';
import { VegFilterChips, type DietFilter } from './VegFilterChips';
import { ClusterMenuList } from './ClusterMenuList';

interface OnDemandHomeProps {
  /** Top padding so content starts below the home hero band — same contract as SubscriptionHome/DineInHome. */
  topInset?: number;
  /** Shared scroll offset — lets the home hero collapse as this feed scrolls, same contract as SubscriptionHome. */
  scrollY?: SharedValue<number>;
}

/** The On Demand tab body: a title/description (matching Bulk's in-home
 * teaser), search + a veg/non-veg/Jain filter, then every nearby kitchen
 * split into "near you" vs "other" sections — no separate "see all" screen,
 * this page is the full list. */
export function OnDemandHome({ topInset = 0, scrollY }: OnDemandHomeProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const serviceable = useClusterStore((s) => s.clusters.length > 0);
  const showClusterMenu = useClusterStore((s) => s.showClusterMenu);
  const vegOnly = useVegModeStore((s) => s.vegOnly);
  const bottomStackClearance = useBottomStackClearance();
  const onScroll = useAnimatedScrollHandler((e) => {
    if (scrollY) {
      scrollY.value = e.contentOffset.y;
    }
  });

  const [kitchens, setKitchens] = useState<OnDemandKitchen[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [diet, setDiet] = useState<DietFilter>(null);

  useEffect(() => {
    if (showClusterMenu) {
      setLoading(false);
      return;
    }
    let active = true;
    loadNearestKitchens('allDay').then((res) => {
      if (active) {
        setKitchens(res);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [showClusterMenu]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kitchens.filter((k) => {
      const matchesSearch = !q || k.kitchenName.toLowerCase().includes(q);
      const matchesGlobalVeg = !vegOnly || (k.mealType?.includes('Veg') ?? false);
      const matchesDiet = !diet || (k.mealType?.includes(diet) ?? false);
      return matchesSearch && matchesGlobalVeg && matchesDiet;
    });
  }, [kitchens, search, diet, vegOnly]);

  const { near, other } = useMemo(() => {
    const n: OnDemandKitchen[] = [];
    const o: OnDemandKitchen[] = [];
    for (const k of filtered) {
      (isNearby(k) ? n : o).push(k);
    }
    return { near: n, other: o };
  }, [filtered]);

  function openKitchen(kitchen: OnDemandKitchen) {
    router.push({ pathname: '/on-demand-kitchen', params: { kitchenId: kitchen._id, mode: 'allDay' } } as Href);
  }

  if (showClusterMenu) {
    return <ClusterMenuList topInset={topInset} scrollY={scrollY} />;
  }

  return (
    <Animated.ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={{ paddingTop: topInset, paddingBottom: 24 + insets.bottom + bottomStackClearance }}>
      <View className="px-4 pt-4">
        <AppText variant="h2" className="text-foreground">
          Order on demand
        </AppText>
        <AppText variant="body" className="mt-1 text-muted-foreground">
          Home kitchens cooking near you right now. One meal at a time, no plan needed.
        </AppText>
      </View>

      <View className="gap-3 px-4 pt-4">
        <View
          className="flex-row items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3.5"
          style={shadow.card}>
          <IconSearch size={20} color={palette.neutral.gray500} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search kitchens"
            placeholderTextColor={palette.neutral.gray500}
            className="flex-1 font-metropolis text-title text-foreground"
            style={{ paddingVertical: 0 }}
          />
        </View>
        <VegFilterChips value={diet} onChange={setDiet} />
      </View>

      <View className="pt-5" style={{ gap: 12 }}>
        {loading ? (
          <View className="flex-row flex-wrap justify-between px-4" style={{ rowGap: 16 }}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ width: '48%', borderRadius: 16, overflow: 'hidden' }}>
                <Skeleton height={130} radius={0} />
                <View style={{ padding: 10, gap: 6 }}>
                  <Skeleton width="80%" height={14} />
                  <Skeleton width="50%" height={11} />
                </View>
              </View>
            ))}
          </View>
        ) : !serviceable ? (
          <EmptyState
            title="Set a delivery location"
            message="Choose your location to see kitchens open for on-demand orders near you."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search ? 'No matching kitchens' : 'No kitchens here yet'}
            message={search ? 'Try a different search term.' : 'On-demand ordering isn’t available in your area right now.'}
          />
        ) : (
          <>
            {near.length > 0 ? (
              <View style={{ gap: 12 }}>
                <AppText variant="overline" className="px-4 text-muted-foreground">
                  KITCHENS NEAR YOU
                </AppText>
                <KitchenGrid kitchens={near} onPressKitchen={openKitchen} />
              </View>
            ) : null}
            {other.length > 0 ? (
              <View style={{ gap: 12 }}>
                <AppText variant="overline" className="px-4 text-muted-foreground">
                  OTHER KITCHENS
                </AppText>
                <KitchenGrid kitchens={other} onPressKitchen={openKitchen} />
              </View>
            ) : null}
          </>
        )}
      </View>
    </Animated.ScrollView>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View className="items-center px-4 py-14">
      <AccentIcon icon={IconMapPin} tone="location" size={26} tileSize={56} />
      <AppText variant="title" className="text-foreground" style={{ marginTop: 12, textAlign: 'center' }}>
        {title}
      </AppText>
      <AppText variant="bodySm" className="text-muted-foreground" style={{ marginTop: 4, textAlign: 'center' }}>
        {message}
      </AppText>
    </View>
  );
}

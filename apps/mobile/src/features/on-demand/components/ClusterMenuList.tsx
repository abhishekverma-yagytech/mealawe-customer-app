import { useEffect, useMemo, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { TextInput, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, type SharedValue } from 'react-native-reanimated';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { IconSearch, IconUtensils } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { useBottomStackClearance, useBottomCtaStore } from '@/features/orders';
import { useVegModeStore } from '@/store';
import { palette, shadow } from '@/theme';

import { loadClusterMenu } from '../api';
import { groupMenuByMode, itemStatusFor } from '../pricing';
import { loadOrderingWindows, type OrderingWindows } from '../schedule';
import { useOnDemandCartStore } from '../useOnDemandCartStore';
import type { OnDemandKitchen, OnDemandMenuItem } from '../types';
import { OnDemandItemCard } from './OnDemandItemCard';
import { VegFilterChips, type DietFilter } from './VegFilterChips';

/** This feed's slot key in `useBottomCtaStore` — see BottomOverlayStack.
 * `ClusterMenuList` renders as the 'ondemand' Home tab's body for Kota (see
 * `OnDemandHome`'s `showClusterMenu` branch), same tree as
 * `BottomOverlayStack`, so it can push its cart strip through the same
 * shared owner-key pattern Subscription/Dine In already use — rather than
 * the bespoke absolutely-positioned `OnDemandCartFooter` this used to render
 * directly, which had no coordinated stacking with `BottomOverlayStack`
 * (both could end up on screen with no shared z-index). `on-demand-kitchen.tsx`
 * (the non-Kota per-kitchen menu screen) is a separately pushed route
 * outside the Home tab tree — `BottomOverlayStack` isn't mounted there, so
 * it keeps using `OnDemandCartFooter` directly; this store only reaches
 * screens living inside Home's own tab pager. */
const CTA_OWNER_KEY = 'ondemand';

interface ClusterMenuListProps {
  /** Top padding so content starts below the home hero band — same contract as OnDemandHome/SubscriptionHome. */
  topInset?: number;
  /** Shared scroll offset — lets the home hero collapse as this feed scrolls, same contract as OnDemandHome. */
  scrollY?: SharedValue<number>;
}

/**
 * Kota's on-demand flow: one aggregated cluster-wide menu, no kitchen
 * selection — mirrors MealaweUserApp's `tabClusterMenu.component.ts`. Always
 * Daily/`allDay` mode (the source app hardcodes this too — there is no
 * Advance mode for a cluster menu).
 */
export function ClusterMenuList({ topInset = 0, scrollY }: ClusterMenuListProps) {
  const router = useRouter();
  const bottomStackClearance = useBottomStackClearance();
  const cart = useOnDemandCartStore((s) => s.cart);
  const setCount = useOnDemandCartStore((s) => s.setCount);
  const setCta = useBottomCtaStore((s) => s.setCta);
  const vegOnly = useVegModeStore((s) => s.vegOnly);

  const [kitchen, setKitchen] = useState<OnDemandKitchen | null>(null);
  const [items, setItems] = useState<OnDemandMenuItem[]>([]);
  const [windows, setWindows] = useState<OrderingWindows | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [diet, setDiet] = useState<DietFilter>(null);

  const onScroll = useAnimatedScrollHandler((e) => {
    if (scrollY) {
      scrollY.value = e.contentOffset.y;
    }
  });

  useEffect(() => {
    let active = true;
    Promise.all([loadClusterMenu(), loadOrderingWindows()]).then(([res, w]) => {
      if (!active) return;
      setKitchen(res?.kitchen ?? null);
      setItems(res?.items ?? []);
      setWindows(w);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const groups = useMemo(() => groupMenuByMode(items, 'allDay'), [items]);

  const q = search.trim().toLowerCase();
  const filteredGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          items: g.items.filter((item) => {
            if (vegOnly && !item.isVeg) return false;
            if (diet && item.itemType !== diet) return false;
            if (q && !item.itemName.toLowerCase().includes(q)) return false;
            return true;
          }),
        }))
        .filter((g) => g.items.length > 0),
    [groups, diet, q, vegOnly],
  );

  const cartMatchesView = cart.kitchen?.clusterMenu === true && cart.kitchen._id === kitchen?._id;
  const countFor = (itemId: string): number =>
    cartMatchesView ? (cart.lines.find((l) => l.item._id === itemId)?.count ?? 0) : 0;

  function change(itemId: string, delta: number): void {
    if (!kitchen) return;
    const item = items.find((i) => i._id === itemId);
    if (!item) return;
    setCount(item, kitchen, 'allDay', Math.max(0, countFor(itemId) + delta));
  }

  const itemCount = cartMatchesView ? cart.lines.reduce((sum, l) => sum + l.count, 0) : 0;
  const subTotal = cartMatchesView ? cart.lines.reduce((sum, l) => sum + l.item.itemPrice * l.count, 0) : 0;

  useEffect(() => {
    if (itemCount > 0) {
      setCta(CTA_OWNER_KEY, {
        priceLabel: `₹${subTotal}`,
        subtitle: `${itemCount} item${itemCount > 1 ? 's' : ''}`,
        buttonLabel: 'View cart',
        onPress: () => router.push('/on-demand-cart' as Href),
        tone: 'info',
      });
    } else {
      setCta(CTA_OWNER_KEY, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemCount, subTotal, setCta]);

  return (
    <View style={{ flex: 1 }}>
      <Animated.ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: topInset, paddingBottom: 24 + bottomStackClearance }}>
        <View className="px-4 pt-4">
          <AppText variant="h2" className="text-foreground">
            Order on demand
          </AppText>
          <AppText variant="body" className="mt-1 text-muted-foreground">
            Today's menu, cooked fresh and delivered same-day.
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
              placeholder="Search menu"
              placeholderTextColor={palette.neutral.gray500}
              className="flex-1 font-metropolis text-title text-foreground"
              style={{ paddingVertical: 0 }}
            />
          </View>
          <VegFilterChips value={diet} onChange={setDiet} />
        </View>

        <View className="pt-5" style={{ gap: 16, paddingHorizontal: 16 }}>
          {loading ? (
            [0, 1, 2].map((i) => (
              <View key={i} className="flex-row gap-3 rounded-2xl border border-border bg-card p-3">
                <View style={{ flex: 1, gap: 8 }}>
                  <Skeleton width="60%" height={15} />
                  <Skeleton width="35%" height={13} />
                </View>
                <Skeleton width={118} height={118} radius={14} />
              </View>
            ))
          ) : filteredGroups.length === 0 ? (
            <View className="items-center px-4 py-14">
              <AccentIcon icon={IconUtensils} tone="food" size={26} tileSize={56} />
              <AppText variant="title" className="text-center text-foreground" style={{ marginTop: 12 }}>
                {search || diet ? 'No matching items' : 'No items on the menu right now'}
              </AppText>
              <AppText variant="bodySm" className="mt-1 text-center text-muted-foreground">
                {search || diet ? 'Try a different search term or filter.' : 'Check back again soon.'}
              </AppText>
            </View>
          ) : (
            filteredGroups.map((group) => (
              <View key={group.groupName} style={{ gap: 10 }}>
                <AppText variant="label" className="text-foreground">
                  {group.groupName}
                </AppText>
                {group.items.map((item) => (
                  <OnDemandItemCard
                    key={item._id}
                    item={item}
                    count={countFor(item._id)}
                    status={windows ? itemStatusFor(item, 'allDay', windows, countFor(item._id)) : 'available'}
                    onIncrease={() => change(item._id, 1)}
                    onDecrease={() => change(item._id, -1)}
                  />
                ))}
              </View>
            ))
          )}
        </View>
      </Animated.ScrollView>
    </View>
  );
}

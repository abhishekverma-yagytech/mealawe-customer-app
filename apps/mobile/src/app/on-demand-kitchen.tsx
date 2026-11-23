import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { SectionList, TextInput, View } from 'react-native';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IconMapPin, IconSearch, IconStar, IconUtensils } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  groupMenuByMode,
  itemStatusFor,
  loadKitchenMenu,
  loadKitchenProfile,
  loadOrderingWindows,
  ModeToggle,
  OnDemandCartFooter,
  OnDemandItemCard,
  useOnDemandCartStore,
  VegFilterChips,
  type DietFilter,
  type OnDemandKitchen,
  type OnDemandMenuGroup,
  type OnDemandMenuItem,
  type OnDemandMode,
  type OrderingWindows,
} from '@/features/on-demand';
import { useScreenTracking } from '@/services/netcore';
import { palette } from '@/theme';

export default function OnDemandKitchenScreen() {
  useScreenTracking('ondemand_kitchen');

  const router = useRouter();
  const { kitchenId, mode: modeParam } = useLocalSearchParams<{ kitchenId?: string; mode?: string }>();

  const cart = useOnDemandCartStore((s) => s.cart);
  const setCount = useOnDemandCartStore((s) => s.setCount);

  const [kitchen, setKitchen] = useState<OnDemandKitchen | null>(null);
  const [items, setItems] = useState<OnDemandMenuItem[]>([]);
  const [windows, setWindows] = useState<OrderingWindows | null>(null);
  const [mode, setMode] = useState<OnDemandMode>(modeParam === 'advance' ? 'advance' : 'allDay');
  const [dietFilter, setDietFilter] = useState<DietFilter>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingSwitch, setPendingSwitch] = useState<{ itemId: string; delta: number } | null>(null);

  useEffect(() => {
    if (!kitchenId) return;
    let active = true;
    setLoading(true);
    Promise.all([loadKitchenProfile(kitchenId), loadKitchenMenu(kitchenId), loadOrderingWindows()]).then(
      ([k, menuItems, w]) => {
        if (!active) return;
        setKitchen(k);
        setItems(menuItems);
        setWindows(w);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [kitchenId]);

  const menusByMode = useMemo(
    () => ({ allDay: groupMenuByMode(items, 'allDay'), advance: groupMenuByMode(items, 'advance') }),
    [items],
  );

  if (!kitchenId) {
    return <Redirect href={'/(tabs)' as Href} />;
  }

  const groups: OnDemandMenuGroup[] = menusByMode[mode];

  const q = search.trim().toLowerCase();
  const itemMatches = (item: OnDemandMenuItem): boolean => {
    if (dietFilter && item.itemType !== dietFilter) return false;
    if (q && !item.itemName.toLowerCase().includes(q)) return false;
    return true;
  };

  const sections = groups
    .map((g) => ({ title: g.groupName, data: g.items.filter(itemMatches) }))
    .filter((s) => s.data.length > 0);

  const cartMatchesView = cart.kitchen?._id === kitchenId && cart.mode === mode;

  const countFor = (itemId: string): number =>
    cartMatchesView ? (cart.lines.find((l) => l.item._id === itemId)?.count ?? 0) : 0;

  const applyChange = (itemId: string, delta: number): void => {
    if (!kitchen) return;
    const item = items.find((i) => i._id === itemId);
    if (!item) return;
    setCount(item, kitchen, mode, Math.max(0, countFor(itemId) + delta));
  };

  const change = (itemId: string, delta: number): void => {
    const wouldClearCart = !cartMatchesView && cart.lines.length > 0 && delta > 0;
    if (wouldClearCart) {
      setPendingSwitch({ itemId, delta });
      return;
    }
    applyChange(itemId, delta);
  };

  const itemCount = cartMatchesView ? cart.lines.reduce((sum, l) => sum + l.count, 0) : 0;
  const subTotal = cartMatchesView ? cart.lines.reduce((sum, l) => sum + l.item.itemPrice * l.count, 0) : 0;

  const hasDailyMenu = menusByMode.allDay.length > 0;
  const hasAdvanceMenu = menusByMode.advance.length > 0;

  // Real backend field, not a live delivery-partner ETA — see the design
  // spec's "Explicitly out of scope" (no 3rd-party ETA infra in this app).
  const dailySubtext =
    typeof kitchen?.preparationTime === 'number' ? `Cooking now · Ready in ${kitchen.preparationTime} min` : 'Cooking now';
  // Advance orders are always for tomorrow or the day after (never today —
  // see `advanceDates()` in schedule.ts / OnDemandSlotPicker's "Daily is
  // always today" comment), so the subtext says exactly that rather than
  // the more generic "today or tomorrow".
  const advanceSubtext = 'Schedule for tomorrow or the day after';

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: kitchen?.kitchenName ?? 'Kitchen' }} />
      <StatusBar style="auto" />

      {loading ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton height={140} radius={18} />
          <Skeleton width="60%" height={22} />
          <Skeleton width="40%" height={16} />
          {[0, 1, 2].map((i) => (
            <View key={i} className="flex-row gap-3 rounded-2xl border border-border bg-card p-3">
              <Skeleton width={118} height={118} radius={14} />
              <View style={{ flex: 1, gap: 8, paddingTop: 4 }}>
                <Skeleton width="60%" height={15} />
                <Skeleton width="35%" height={13} />
              </View>
            </View>
          ))}
        </View>
      ) : !kitchen ? (
        <View className="flex-1 items-center justify-center px-10">
          <AccentIcon icon={IconUtensils} tone="nonveg" size={26} tileSize={56} />
          <AppText variant="title" className="text-center text-foreground" style={{ marginTop: 12 }}>
            Kitchen not found
          </AppText>
          <View style={{ marginTop: 16 }}>
            <Button label="Go back" variant="outline" onPress={() => router.back()} />
          </View>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 12 }}
          ListHeaderComponent={
            <View style={{ gap: 12, marginBottom: 4 }}>
              <View style={{ height: 140, borderRadius: 18, overflow: 'hidden' }}>
                {kitchen.imageUrl ? (
                  <Image
                    source={{ uri: kitchen.imageUrl }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                ) : (
                  <LinearGradient
                    colors={[palette.accent.food, palette.brand.teal]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <IconUtensils size={32} color="#ffffff" strokeWidth={1.5} style={{ opacity: 0.9 }} />
                  </LinearGradient>
                )}
              </View>

              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <AppText variant="h2" className="text-foreground" numberOfLines={1}>
                    {kitchen.kitchenName}
                  </AppText>
                  {kitchen.speciality ? (
                    <AppText variant="bodySm" className="text-muted-foreground" numberOfLines={1}>
                      {kitchen.speciality}
                    </AppText>
                  ) : null}
                  <View className="flex-row items-center gap-3">
                    {typeof kitchen.distance === 'number' ? (
                      <View className="flex-row items-center gap-1">
                        <IconMapPin size={13} color={palette.neutral.gray600} />
                        <AppText variant="caption" className="text-muted-foreground">
                          {kitchen.distance.toFixed(1)} Km
                        </AppText>
                      </View>
                    ) : null}
                    {kitchen.rating ? (
                      <View className="flex-row items-center gap-1">
                        <IconStar size={13} color={palette.accent.rating} fill={palette.accent.rating} />
                        <AppText variant="caption" className="text-muted-foreground">
                          {kitchen.rating.toFixed(1)}
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              <View className="flex-row items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
                <IconSearch size={16} color={palette.neutral.gray500} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder={`Search in ${kitchen.kitchenName}`}
                  placeholderTextColor={palette.neutral.gray500}
                  className="flex-1 text-foreground"
                />
              </View>

              <ModeToggle
                mode={mode}
                onChange={setMode}
                showDaily={hasDailyMenu}
                showAdvance={hasAdvanceMenu}
                dailySubtext={dailySubtext}
                advanceSubtext={advanceSubtext}
              />
              <VegFilterChips value={dietFilter} onChange={setDietFilter} />
            </View>
          }
          renderSectionHeader={({ section }) => (
            <AppText variant="label" className="bg-background text-foreground" style={{ paddingVertical: 6 }}>
              {section.title}
            </AppText>
          )}
          renderItem={({ item }) => (
            <View style={{ marginBottom: 12 }}>
              <OnDemandItemCard
                item={item}
                count={countFor(item._id)}
                status={windows ? itemStatusFor(item, mode, windows, countFor(item._id)) : 'available'}
                onIncrease={() => change(item._id, 1)}
                onDecrease={() => change(item._id, -1)}
              />
            </View>
          )}
          ListEmptyComponent={
            <View className="items-center px-8 py-14">
              <AccentIcon icon={IconUtensils} tone="food" size={26} tileSize={56} />
              <AppText variant="title" className="text-center text-foreground" style={{ marginTop: 12 }}>
                {q || dietFilter ? 'No matching items' : 'No items in this mode'}
              </AppText>
              <AppText variant="bodySm" className="mt-1 text-center text-muted-foreground">
                {q || dietFilter
                  ? 'Try a different search term or filter.'
                  : `Try switching to ${mode === 'allDay' ? 'Advance' : 'Daily'} instead.`}
              </AppText>
            </View>
          }
        />
      )}

      <OnDemandCartFooter itemCount={itemCount} subTotal={subTotal} onPress={() => router.push('/on-demand-cart' as Href)} />

      <ConfirmDialog
        visible={pendingSwitch !== null}
        title="Switch kitchen or mode?"
        message="Adding an item here will clear your current on-demand cart."
        confirmLabel="Switch"
        onConfirm={() => {
          if (pendingSwitch) applyChange(pendingSwitch.itemId, pendingSwitch.delta);
          setPendingSwitch(null);
        }}
        onCancel={() => setPendingSwitch(null)}
      />
    </View>
  );
}

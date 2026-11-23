import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { AccentIcon } from '@/components/ui/AccentIcon';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { IconCalendar, IconClose } from '@/components/ui/icons';
import {
  DateRangeSheet,
  OrderRow,
  FilterChip,
  useOrderStore,
  statusGroup,
  type DateRange,
  type DateRangeSheetHandle,
  type OrderSummary,
  type StatusGroup,
} from '@/features/orders';
import { getOrderHistoryCategory } from '@/features/orders/historyCategories';
import { formatShort } from '@/features/subscription';
import { useScreenTracking } from '@/services/netcore';
import { useRefreshBumpStore } from '@/services/push';
import { palette, accentTint, useColors, BORDER_WIDTH } from '@/theme';

/** Coarser than `/orders.tsx`'s subscription-specific status chips
 * (all/placed/accepted/paymentFailed) — every order-history category shares
 * `statusGroup` (see orderStatus.ts) uniformly, but each category's *actual*
 * status vocabulary differs (Bulk/On-Demand have delivery-tracking states
 * Subscription never uses, and vice versa), so filtering by the universal
 * group reads correctly everywhere instead of hardcoding one category's
 * specific status names onto every other category's list. */
type GroupFilterKey = 'all' | StatusGroup;

const GROUP_FILTERS: { key: GroupFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

function matchesFilters(order: OrderSummary, statusFilter: GroupFilterKey, dateRange: DateRange | null): boolean {
  if (statusFilter !== 'all' && statusGroup(order.status) !== statusFilter) return false;
  if (dateRange) {
    const buyDate = order.date?.slice(0, 10);
    if (!buyDate || buyDate < dateRange.from || buyDate > dateRange.to) return false;
  }
  return true;
}

/**
 * Categories `order-detail.tsx` knows how to render: subscription/package
 * parents (with their own daily-order timeline) plus plain FoodOrder docs —
 * Meal Orders and On Demand Orders both resolve to the same `FoodOrder` shape
 * server-side and both open `OrderDetailsComponent` (with runner tracking) in
 * the Ionic app's `my-past-order` screen. `bulk` goes through the exact same
 * `mapOrder()` as every other category (see `loadBulkPastOrders` →
 * `loadPastOrders` in `features/bulk/api.ts`) — its live-tracking/reschedule
 * sections just stay empty (BulkFoodOrder has no `dailyOrderList`/
 * `subscriptionMasterId`), same as any FoodOrder without those fields,
 * matching the Ionic reference's fully generic order-detail page (no
 * category exclusion at all there). `marketplace` (MarketPlaceItemOrder) is
 * the one still genuinely unmapped — no detail screen yet — so it stays
 * read-only.
 */
const DETAIL_CAPABLE = new Set(['subscription', 'dineIn', 'mealOrders', 'onDemand', 'bulk']);

export default function OrderHistoryCategoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { category: categoryKey } = useLocalSearchParams<{ category: string }>();
  useScreenTracking(`order_history_${categoryKey}`);
  const category = getOrderHistoryCategory(categoryKey ?? '');
  const select = useOrderStore((s) => s.select);

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageOver, setPageOver] = useState(false);

  // Status + buy-date filters — same UI/behavior as `/orders.tsx`'s
  // subscription-specific filter row, generalized (see `GROUP_FILTERS`'s
  // comment) so every order-history category gets it, not just Subscription.
  const [statusFilter, setStatusFilter] = useState<GroupFilterKey>('all');
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const dateRangeSheetRef = useRef<DateRangeSheetHandle>(null);
  const filteredOrders = useMemo(
    () => orders.filter((o) => matchesFilters(o, statusFilter, dateRange)),
    [orders, statusFilter, dateRange],
  );
  const noFilterMatches =
    orders.length > 0 && (statusFilter !== 'all' || dateRange !== null) && filteredOrders.length === 0;
  const clearFilters = (): void => {
    setStatusFilter('all');
    setDateRange(null);
  };

  // Reset during render (not in the effect below) when the category changes —
  // the React-endorsed alternative to an Effect for "adjust state on prop change".
  const [resolvedForKey, setResolvedForKey] = useState<string | null>(null);
  if ((category?.key ?? null) !== resolvedForKey) {
    setResolvedForKey(category?.key ?? null);
    setLoading(true);
    setPage(1);
    setPageOver(false);
    setStatusFilter('all');
    setDateRange(null);
  }

  const loadPage = useCallback(
    async (p: number, replace: boolean) => {
      if (!category) return;
      const rows = await category.load(p);
      setOrders((prev) => (replace ? rows : [...prev, ...rows]));
      setPageOver(!category.paginated || rows.length === 0);
    },
    [category],
  );

  useEffect(() => {
    if (!category) return;
    loadPage(1, true).finally(() => setLoading(false));
  }, [category?.key, loadPage]);

  // Silent refresh whenever a push signals "something about your orders
  // changed" — resets back to page 1 and swaps in fresh rows without
  // touching `loading`/`refreshing`, so it doesn't flash the skeleton or the
  // pull-to-refresh spinner while the user is browsing this list. Skips the
  // version's initial value so mounting doesn't double-fetch alongside the
  // effect above.
  const ordersVersion = useRefreshBumpStore((s) => s.ordersVersion);
  const seenVersionRef = useRef(ordersVersion);
  useEffect(() => {
    if (seenVersionRef.current === ordersVersion) return;
    seenVersionRef.current = ordersVersion;
    if (!category) return;
    setPage(1);
    setPageOver(false);
    void loadPage(1, true);
  }, [ordersVersion, category, loadPage]);

  if (!category) {
    return <Redirect href="/my-orders" />;
  }

  function onRefresh() {
    setRefreshing(true);
    setPage(1);
    loadPage(1, true).finally(() => setRefreshing(false));
  }

  function onEndReached() {
    if (loading || refreshing || pageOver || !category!.paginated) return;
    const next = page + 1;
    setPage(next);
    void loadPage(next, false);
  }

  function openDetail(order: OrderSummary) {
    if (!DETAIL_CAPABLE.has(category!.key)) return;
    select(order);
    router.push('/order-detail' as Href);
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: category.title }} />
      <StatusBar style="auto" />

      {!loading && orders.length > 0 ? (
        <FilterRow
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          dateRange={dateRange}
          onOpenDateRange={() => dateRangeSheetRef.current?.present()}
          onClearDateRange={() => setDateRange(null)}
        />
      ) : null}

      {loading ? (
        <View style={{ padding: 20, gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} className="rounded-2xl border border-border p-3">
              <View className="flex-row gap-3">
                <Skeleton width={64} height={64} radius={14} />
                <View style={{ flex: 1, gap: 8, paddingTop: 4 }}>
                  <Skeleton width="60%" height={16} />
                  <Skeleton width="40%" height={13} />
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 20 + insets.bottom, gap: 12, flexGrow: 1 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.brand.green} />
          }
          onEndReachedThreshold={0.4}
          onEndReached={onEndReached}
          renderItem={({ item }) => (
            <OrderRow
              order={item}
              interactive={DETAIL_CAPABLE.has(category.key)}
              onPress={() => openDetail(item)}
            />
          )}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-10" style={{ paddingTop: 60 }}>
              <AccentIcon icon={category.icon} tone={category.tone} size={26} tileSize={56} />
              <AppText variant="title" className="text-foreground" style={{ marginTop: 12 }}>
                {noFilterMatches ? 'No orders match these filters' : 'No orders yet'}
              </AppText>
              <AppText
                variant="bodySm"
                className="text-muted-foreground"
                style={{ marginTop: 4, textAlign: 'center' }}>
                {noFilterMatches ? 'Try a different status or date range.' : category.emptyMessage}
              </AppText>
              {noFilterMatches ? (
                <View style={{ marginTop: 16 }}>
                  <Button label="Clear filters" variant="outline" onPress={clearFilters} />
                </View>
              ) : null}
            </View>
          }
        />
      )}

      <DateRangeSheet ref={dateRangeSheetRef} initialRange={dateRange} onApply={setDateRange} />
    </View>
  );
}

/** Status-group chips + buy-date range — same UI `/orders.tsx` uses for
 * Subscription, factored out here so every order-history category can share
 * it verbatim. */
function FilterRow({
  statusFilter,
  onStatusFilterChange,
  dateRange,
  onOpenDateRange,
  onClearDateRange,
}: {
  statusFilter: GroupFilterKey;
  onStatusFilterChange: (key: GroupFilterKey) => void;
  dateRange: DateRange | null;
  onOpenDateRange: () => void;
  onClearDateRange: () => void;
}) {
  const colors = useColors();
  return (
    <View className="border-b border-border px-5 pt-3 pb-3">
      {/* Status chips + the buy-date pill share one horizontally scrollable
          strip (compact text/icon throughout), matching `/orders.tsx`. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
        {GROUP_FILTERS.map((f) => (
          <FilterChip
            key={f.key}
            label={f.label}
            active={statusFilter === f.key}
            onPress={() => onStatusFilterChange(f.key)}
          />
        ))}
        <View style={{ width: 1, height: 18, backgroundColor: colors.border }} />
        <Pressable
          onPress={onOpenDateRange}
          accessibilityRole="button"
          accessibilityLabel="Filter by buy date"
          accessibilityState={{ selected: !!dateRange }}
          className="flex-row items-center active:opacity-70"
          style={{
            gap: 5,
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderWidth: BORDER_WIDTH.hairline,
            borderColor: dateRange ? palette.brand.green : colors.border,
            backgroundColor: dateRange ? accentTint(palette.brand.green, 0.1) : colors.card,
          }}>
          <IconCalendar size={12} color={dateRange ? palette.brand.green : colors.mutedForeground} />
          <AppText variant="caption" style={{ color: dateRange ? palette.brand.green : colors.foreground }}>
            {dateRange
              ? `${formatShort(dateRange.from)}${dateRange.to !== dateRange.from ? ` – ${formatShort(dateRange.to)}` : ''}`
              : 'Any date'}
          </AppText>
        </Pressable>
        {dateRange ? (
          <Pressable
            onPress={onClearDateRange}
            accessibilityRole="button"
            accessibilityLabel="Clear buy-date filter"
            hitSlop={8}>
            <IconClose size={14} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

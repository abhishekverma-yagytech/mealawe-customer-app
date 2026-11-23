import { Stack, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { AccentIcon } from '@/components/ui/AccentIcon';
import { Skeleton } from '@/components/ui/Skeleton';
import { IconCalendar, IconClose, IconReceipt } from '@/components/ui/icons';
import {
  DateRangeSheet,
  useOrders,
  useOrderStore,
  OrderRow,
  FilterChip,
  type DateRange,
  type DateRangeSheetHandle,
  type OrderSummary,
} from '@/features/orders';
import { formatShort } from '@/features/subscription';
import { useScreenTracking } from '@/services/netcore';
import { palette, accentTint, useColors, BORDER_WIDTH } from '@/theme';

/** The package's own top-level `orderstatus` (see
 * `foodOrderPackage.model.js`) — narrowed to the four states a customer
 * actually cares to filter by, mirroring the status-wise chips ask. */
type StatusFilterKey = 'all' | 'placed' | 'accepted' | 'paymentFailed';

const STATUS_FILTERS: { key: StatusFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'placed', label: 'Placed' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'paymentFailed', label: 'Failed' },
];

function matchesFilters(order: OrderSummary, statusFilter: StatusFilterKey, dateRange: DateRange | null): boolean {
  if (statusFilter !== 'all' && order.status !== statusFilter) return false;
  if (dateRange) {
    const buyDate = order.date?.slice(0, 10);
    if (!buyDate || buyDate < dateRange.from || buyDate > dateRange.to) return false;
  }
  return true;
}

export default function OrdersScreen() {
  useScreenTracking('orders');

  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { loading, error, ongoing, past, isEmpty, reload } = useOrders();
  const select = useOrderStore((s) => s.select);

  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all');
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const dateRangeSheetRef = useRef<DateRangeSheetHandle>(null);
  const filtersActive = statusFilter !== 'all' || dateRange !== null;

  // On the first load only, default to "Accepted" when at least one package
  // is sitting in that state — that's the status a customer opening this
  // screen almost always cares about first. A later manual refresh (or the
  // user switching filters themselves) never overrides it again — only the
  // very first successful load does.
  const didAutoSelectRef = useRef(false);
  useEffect(() => {
    if (loading || didAutoSelectRef.current) return;
    didAutoSelectRef.current = true;
    if (ongoing.some((o) => o.status === 'accepted')) {
      setStatusFilter('accepted');
    }
  }, [loading, ongoing]);

  const filteredOngoing = useMemo(
    () => ongoing.filter((o) => matchesFilters(o, statusFilter, dateRange)),
    [ongoing, statusFilter, dateRange],
  );
  const filteredPast = useMemo(
    () => past.filter((o) => matchesFilters(o, statusFilter, dateRange)),
    [past, statusFilter, dateRange],
  );
  // Distinct from `isEmpty` (zero orders at all) — this is "orders exist,
  // but none match what's currently filtered", so it gets its own message
  // and a way back out instead of silently rendering nothing.
  const noFilterMatches = !isEmpty && filtersActive && filteredOngoing.length === 0 && filteredPast.length === 0;

  const clearFilters = (): void => {
    setStatusFilter('all');
    setDateRange(null);
  };

  const open = (order: OrderSummary): void => {
    select(order);
    router.push('/order-detail' as Href);
  };

  // Ongoing orders ARE subscription packages (see `useOrders`'s ongoing/past
  // split) — each gets its own "Manage subscription" entry point, not a
  // single generic link that couldn't say which package it meant once
  // there's more than one ongoing subscription.
  const manage = (order: OrderSummary): void => {
    router.push({ pathname: '/manage-subscription', params: { orderId: order.id } });
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Your orders' }} />
      {/* Expo Router v57 Toolbar API — native header-right action (liquid glass
          on iOS 26+, Material-styled on Android). Text-only (no `icon`) since
          the `icon` prop only accepts image sources on Android — an SF Symbol
          string would render blank there and hide the label. */}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button onPress={() => router.push('/help')}>Help</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <StatusBar style="auto" />

      {!loading && !isEmpty ? (
        <View className="border-b border-border px-5 pt-3 pb-3">
          {/* Status chips + the buy-date pill share one horizontally
              scrollable strip (compact text/icon throughout) instead of the
              date living in its own separate, wider row below. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
            {STATUS_FILTERS.map((f) => (
              <FilterChip
                key={f.key}
                label={f.label}
                active={statusFilter === f.key}
                onPress={() => setStatusFilter(f.key)}
              />
            ))}
            <View style={{ width: 1, height: 18, backgroundColor: colors.border }} />
            <Pressable
              onPress={() => dateRangeSheetRef.current?.present()}
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
                onPress={() => setDateRange(null)}
                accessibilityRole="button"
                accessibilityLabel="Clear buy-date filter"
                hitSlop={8}>
                <IconClose size={14} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
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
                  <Skeleton width="30%" height={13} />
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : isEmpty ? (
        <View className="flex-1 items-center justify-center px-10">
          <AccentIcon icon={IconReceipt} tone="plan" size={26} tileSize={56} />
          <AppText variant="title" className="text-foreground" style={{ marginTop: 12 }}>
            {error ?? 'No orders yet'}
          </AppText>
          <AppText
            variant="bodySm"
            className="text-muted-foreground"
            style={{ marginTop: 4, textAlign: 'center' }}>
            Your subscription deliveries will show up here once you place an order.
          </AppText>
          <View style={{ marginTop: 16 }}>
            <Button label="Browse plans" onPress={() => router.replace('/(tabs)')} />
          </View>
        </View>
      ) : noFilterMatches ? (
        <View className="flex-1 items-center justify-center px-10">
          <AccentIcon icon={IconReceipt} tone="plan" size={26} tileSize={56} />
          <AppText variant="title" className="text-foreground" style={{ marginTop: 12 }}>
            No orders match these filters
          </AppText>
          <AppText
            variant="bodySm"
            className="text-muted-foreground"
            style={{ marginTop: 4, textAlign: 'center' }}>
            Try a different status or date range.
          </AppText>
          <View style={{ marginTop: 16 }}>
            <Button label="Clear filters" variant="outline" onPress={clearFilters} />
          </View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 20 + insets.bottom, gap: 20 }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={reload} tintColor={palette.brand.green} />
          }>
          {filteredOngoing.length > 0 ? (
            <View style={{ gap: 12 }}>
              <AppText variant="overline" className="text-muted-foreground">
                ACTIVE
              </AppText>
              {/* Each ongoing order opens its OWN manage screen (bill/invoice,
                  reschedule, real child-order list) — no more single generic
                  link that couldn't say which subscription it meant. */}
              {filteredOngoing.map((o) => (
                <OrderRow key={o.id} order={o} tracked onPress={() => manage(o)} />
              ))}
            </View>
          ) : null}
          {filteredPast.length > 0 ? (
            <View style={{ gap: 12 }}>
              <AppText variant="overline" className="text-muted-foreground">
                PAST
              </AppText>
              {filteredPast.map((o) => (
                <OrderRow key={o.id} order={o} onPress={() => open(o)} />
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}

      <DateRangeSheet ref={dateRangeSheetRef} initialRange={dateRange} onApply={setDateRange} />
    </View>
  );
}

import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { AccentIcon } from '@/components/ui/AccentIcon';
import { IconApartment, IconCalendar, IconChevronRight, IconClose } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { loadOrderHistory } from '@/features/apartment/api';
import { apartmentOrderStatusBg, apartmentOrderStatusColor, apartmentOrderStatusLabel } from '@/features/apartment/orderStatus';
import { ORDER_TYPE_LABEL } from '@/features/apartment/pricing';
import type { ApartmentOrder } from '@/features/apartment/types';
import { useSelectedOrderStore } from '@/features/apartment/useSelectedOrderStore';
import { DateRangeSheet, type DateRange, type DateRangeSheetHandle } from '@/features/orders';
import { formatShort } from '@/features/subscription';
import { useAuthStore } from '@/store';
import { accentTint, palette, shadow, useApartmentColors, useColors, BORDER_WIDTH } from '@/theme';
import { formatINR } from '@/utils/currency';

/**
 * "Apartment Orders" in the My Orders hub — bypasses the generic
 * `order-history/[category].tsx` screen entirely (same precedent as
 * 'subscription' routing to `/orders` instead of it — see `my-orders.tsx`),
 * because that screen's `OrderRow`/`order-detail.tsx` machinery is built for
 * `OrderSummary`/FoodOrder shapes; `ApartmentOrder` has its own richer detail
 * screen (`apartment-order-detail.tsx`) already, so this renders its own
 * list rather than lossily squeezing the data through the generic path.
 *
 * Status/date filtering (product instruction: "just like Subscription
 * package Order") mirrors `orders.tsx`'s own pattern exactly — client-side
 * filtering over the already-fetched full list, same `DateRangeSheet`
 * component, no new server endpoint: `GET /apartmentOrder/customer/:id`
 * already returns every order with its real `orderstatus`/`orderDate`, and
 * Subscription's own reference screen filters that same way (no date-range
 * query param exists there either) — so there's nothing to add server-side
 * for this specifically, the existing API already carries everything this
 * screen needs.
 */

/** A resident-meaningful GROUP of the real `orderstatus` enum
 * (`apartmentOrder.model.js`) — Apartment has many more granular statuses
 * than Subscription's own three-way filter (placed/accepted/paymentFailed),
 * so each chip here maps to several literal values rather than one. */
type StatusFilterKey = 'all' | 'placed' | 'preparing' | 'delivered' | 'cancelled';

const STATUS_FILTERS: { key: StatusFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'placed', label: 'Placed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
];

const STATUS_FILTER_MATCH: Record<Exclude<StatusFilterKey, 'all'>, string[]> = {
  placed: ['placed', 'accepted'],
  preparing: ['preparing', 'readyToDelivery', 'deliveryBoyAssigned', 'handedOverToDeliveryBoy', 'onTheWay', 'readyForPickup'],
  delivered: ['delivered', 'pickedUp'],
  cancelled: ['cancelledByUser', 'cancelledByKitchen', 'rejectedByKitchen', 'autoCancelled', 'paymentFailed'],
};

function matchesFilters(order: ApartmentOrder, statusFilter: StatusFilterKey, dateRange: DateRange | null): boolean {
  if (statusFilter !== 'all' && !STATUS_FILTER_MATCH[statusFilter].includes(order.orderstatus)) return false;
  if (dateRange) {
    const orderDay = order.orderDate?.slice(0, 10);
    if (!orderDay || orderDay < dateRange.from || orderDay > dateRange.to) return false;
  }
  return true;
}

export default function ApartmentOrderHistoryScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);

  const [orders, setOrders] = useState<ApartmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all');
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const dateRangeSheetRef = useRef<DateRangeSheetHandle>(null);
  const filtersActive = statusFilter !== 'all' || dateRange !== null;

  function fetchOrders(): Promise<void> {
    if (!profile) return Promise.resolve();
    return loadOrderHistory(profile._id).then((rows) => setOrders(rows));
  }

  useEffect(() => {
    fetchOrders().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?._id]);

  function onRefresh(): void {
    setRefreshing(true);
    fetchOrders().finally(() => setRefreshing(false));
  }

  function openDetail(order: ApartmentOrder): void {
    useSelectedOrderStore.getState().select(order);
    router.push({ pathname: '/apartment-order-detail', params: { orderId: order._id } });
  }

  const filteredOrders = useMemo(() => orders.filter((o) => matchesFilters(o, statusFilter, dateRange)), [orders, statusFilter, dateRange]);
  // Distinct from the plain "no orders yet" empty state — orders exist, just
  // none match what's currently filtered, so it gets its own message and a
  // clear way back out instead of silently rendering an empty list.
  const noFilterMatches = orders.length > 0 && filtersActive && filteredOrders.length === 0;

  function clearFilters(): void {
    setStatusFilter('all');
    setDateRange(null);
  }

  // Bug fix (product report, 2026-09-05 — "Apartment Order should view only
  // when user is loggedIn"): browsing/adding to cart stays open for a
  // guest (per the same report's point 1), but past orders are inherently
  // per-customer — same "Log in to view your X" gate cashback.tsx/wallet.tsx
  // already use for their own per-customer screens, not a blank list.
  if (!profile) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ headerShown: true, title: 'Apartment Orders' }} />
        <StatusBar style="auto" />
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <AppText variant="h3" className="text-center text-foreground">
            Log in to view your Apartment Orders
          </AppText>
          <Pressable onPress={() => router.replace('/login')} className="rounded-2xl bg-primary px-6 py-3 active:opacity-80">
            <AppText variant="label" className="text-primary-foreground">
              Login
            </AppText>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Apartment Orders' }} />
      <StatusBar style="auto" />

      {!loading && orders.length > 0 ? (
        <View className="border-b border-border px-5 pt-3 pb-3" style={{ gap: 12 }}>
          {/* Status filter — its own scrollable chip row, same pattern as
              Subscription's `orders.tsx`. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {STATUS_FILTERS.map((f) => (
              <FilterChip key={f.key} label={f.label} active={statusFilter === f.key} onPress={() => setStatusFilter(f.key)} />
            ))}
          </ScrollView>

          {/* Order date — a separate row, distinct from the status chips
              above, so it reads as an independent filter combinable with
              any status choice. */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center" style={{ gap: 6 }}>
              <IconCalendar size={14} color={colors.mutedForeground} />
              <AppText variant="caption" className="text-muted-foreground">
                Order date
              </AppText>
            </View>
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <Pressable
                onPress={() => dateRangeSheetRef.current?.present()}
                accessibilityRole="button"
                accessibilityState={{ selected: !!dateRange }}
                className="active:opacity-70"
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderWidth: BORDER_WIDTH.hairline,
                  borderColor: dateRange ? palette.brand.green : colors.border,
                  backgroundColor: dateRange ? accentTint(palette.brand.green, 0.1) : colors.card,
                }}>
                <AppText variant="bodySm" style={{ color: dateRange ? palette.brand.green : colors.foreground }}>
                  {dateRange ? `${formatShort(dateRange.from)}${dateRange.to !== dateRange.from ? ` – ${formatShort(dateRange.to)}` : ''}` : 'Any date'}
                </AppText>
              </Pressable>
              {dateRange ? (
                <Pressable onPress={() => setDateRange(null)} accessibilityRole="button" accessibilityLabel="Clear order-date filter" hitSlop={8}>
                  <IconClose size={16} color={colors.mutedForeground} />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={{ padding: 20, gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={72} radius={16} />
          ))}
        </View>
      ) : noFilterMatches ? (
        <View className="flex-1 items-center justify-center px-10">
          <AccentIcon icon={IconApartment} tone="plan" size={26} tileSize={56} />
          <AppText variant="title" className="text-foreground" style={{ marginTop: 12 }}>
            No orders match these filters
          </AppText>
          <AppText variant="bodySm" className="text-muted-foreground" style={{ marginTop: 4, textAlign: 'center' }}>
            Try a different status or date range.
          </AppText>
          <View style={{ marginTop: 16 }}>
            <Button label="Clear filters" variant="outline" onPress={clearFilters} />
          </View>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(o) => o._id}
          contentContainerStyle={{ padding: 20, paddingBottom: 20 + insets.bottom, gap: 12, flexGrow: 1 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.brand.green} />}
          renderItem={({ item }) => <ApartmentOrderRow order={item} onPress={() => openDetail(item)} />}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-10" style={{ paddingTop: 60 }}>
              <AccentIcon icon={IconApartment} tone="plan" size={26} tileSize={56} />
              <AppText variant="title" className="text-foreground" style={{ marginTop: 12 }}>
                No orders yet
              </AppText>
              <AppText variant="bodySm" className="text-muted-foreground" style={{ marginTop: 4, textAlign: 'center' }}>
                Your apartment orders will show up here.
              </AppText>
            </View>
          }
        />
      )}

      <DateRangeSheet ref={dateRangeSheetRef} initialRange={dateRange} onApply={setDateRange} />
    </View>
  );
}

/** One status filter pill (All / Placed / Preparing / Delivered / Cancelled) — identical styling to `orders.tsx`'s own `FilterChip`. */
function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="active:opacity-70"
      style={{
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderWidth: BORDER_WIDTH.hairline,
        borderColor: active ? palette.brand.green : colors.border,
        backgroundColor: active ? accentTint(palette.brand.green, 0.1) : colors.card,
      }}>
      <AppText variant="bodySm" style={{ color: active ? palette.brand.green : colors.foreground }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function ApartmentOrderRow({ order, onPress }: { order: ApartmentOrder; onPress: () => void }) {
  // Root-cause fix: the type badge's accent and the chevron icon used to
  // read the Apartment feature's own (light-mode-only) palette directly,
  // the one hardcoded piece left in a row that's otherwise correctly
  // theme-aware via NativeWind's bg-card/text-foreground classes below.
  const { colors: apartmentColors, orderType: orderTypeColors, isDark } = useApartmentColors();
  const tone = orderTypeColors[order.orderType];
  const statusColor = apartmentOrderStatusColor(order.orderstatus, isDark);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={shadow.card}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3.5 active:opacity-80">
      <View className="rounded-lg px-2 py-1" style={{ backgroundColor: tone.soft, borderWidth: 1, borderColor: tone.line }}>
        <AppText variant="caption" weight="bold" style={{ color: tone.accent }}>
          {ORDER_TYPE_LABEL[order.orderType]}
        </AppText>
      </View>
      <View className="min-w-0 flex-1">
        <AppText variant="label" className="text-foreground" numberOfLines={1}>
          {order.kitchenName} · #{order.orderNo}
        </AppText>
        <AppText variant="caption" className="text-muted-foreground" numberOfLines={1} style={{ marginTop: 1 }}>
          {formatShort(order.orderDate?.slice(0, 10))} · {formatINR(order.payableAmount)}
        </AppText>
        {/* Status pill — label carries meaning (not colour-only), same dot +
            tinted-background treatment as the shared `OrderRow`'s own badge
            (features/orders/components/OrderRow.tsx) used by Subscription. */}
        {/* Bug fix (product report, 2026-09-02 — "yellow text on a gray
            background... contrast is too low"): same fix as apartment-order-
            detail.tsx's own status card — see `apartmentOrderStatusBg`'s own
            comment for why a plain `accentTint` isn't reliable for gold. */}
        <View className="mt-1.5 flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1" style={{ backgroundColor: apartmentOrderStatusBg(order.orderstatus, isDark) }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
          <AppText variant="caption" style={{ color: statusColor }}>
            {apartmentOrderStatusLabel(order.orderstatus)}
          </AppText>
        </View>
      </View>
      <IconChevronRight size={18} color={apartmentColors.muted} />
    </Pressable>
  );
}

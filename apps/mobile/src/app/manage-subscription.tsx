import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BottomSheetScrollView, type BottomSheetModal } from '@gorhom/bottom-sheet';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppSheet } from '@/components/ui/AppSheet';
import { AppText } from '@/components/ui/AppText';
import { BillRow } from '@/components/ui/BillRow';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { IconCalendar, IconChevronRight, IconDownload, IconReceipt, IconUtensils } from '@/components/ui/icons';
import {
  downloadInvoice,
  extractPackageBilling,
  loadFoodOrdersByPackage,
  loadPackageOrderDetail,
  mapOrder,
  RescheduleSheet,
  statusLabel,
  statusTone,
  useOrderStore,
  type DailyOrderEntry,
  type OrderSummary,
  type RescheduleSheetHandle,
  type RescheduleTarget,
} from '@/features/orders';
import { fetchFoodOrder } from '@/features/tracking';
import { formatShort } from '@/features/subscription';
import { useScreenTracking } from '@/services/netcore';
import { palette, shadow, useColors, accentTint, RADIUS } from '@/theme';

/**
 * "My subscription" — the manage screen for one subscription package order.
 * Real backend data throughout (see `src/features/orders/api.ts`'s
 * `loadPackageOrderDetail`/`loadFoodOrdersByPackage` — the latter queries
 * child FoodOrder docs directly, never the package's own stale
 * `dailyOrderList` snapshot): a plan summary built from the package's real
 * child-order counts, a "Bill & invoice" action
 * (the real itemized charges straight off the package doc — see
 * `extractPackageBilling` — plus PDF invoice download, replacing the old
 * Pause/Swap/Address tile row since neither pause nor swap ever had a
 * backend behind them — see the removed `mockManageData.ts`), and every
 * real child (per-day) order for this package at the bottom, labelled by
 * its actual order number rather than the meal name, struck through once
 * delivered. There is no package-wide reschedule on the backend — only a
 * per-child-order one (`reschedulePackageChildOrder`) — so each eligible
 * child order gets its own "Reschedule" action instead of one generic
 * button guessing which delivery the user meant.
 */
export default function ManageSubscriptionScreen() {
  useScreenTracking('manage_subscription');

  const router = useRouter();
  const colors = useColors();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();

  const billSheetRef = useRef<BottomSheetModal>(null);
  const rescheduleSheetRef = useRef<RescheduleSheetHandle>(null);
  const selectOrder = useOrderStore((s) => s.select);

  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [childOrders, setChildOrders] = useState<DailyOrderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [openingRowId, setOpeningRowId] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all([loadPackageOrderDetail(orderId), loadFoodOrdersByPackage(orderId)])
      .then(([detail, entries]) => {
        if (!active) return;
        setOrder(detail);
        setChildOrders(entries);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [orderId, reloadNonce]);

  const totalMeals = childOrders.length;
  const deliveredCount = useMemo(
    () => childOrders.filter((c) => c.orderstatus === 'delivered').length,
    [childOrders],
  );
  const progressPct = totalMeals > 0 ? Math.round((deliveredCount / totalMeals) * 100) : 0;
  const isComplete = totalMeals > 0 && deliveredCount === totalMeals;

  // Real itemized charges straight off the package doc's own top-level
  // fields (see `extractPackageBilling`) — not a recomputed/summed
  // approximation, so the Bill popup shows exactly what was charged.
  const billing = useMemo(() => extractPackageBilling(order?.raw), [order]);

  // The specific child order the user tapped "Reschedule" on — reschedule is
  // per-child-order on the backend (`reschedulePackageChildOrder`), so this
  // is set by whichever row's action was pressed, never an implicit default.
  const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);

  const openReschedule = (entry: DailyOrderEntry): void => {
    if (!orderId) return;
    setRescheduleTarget({
      foodOrderId: entry.foodOrderId,
      packageOrderId: orderId,
      orderNo: entry.orderNo,
      orderDate: entry.orderDate,
      mealType: entry.mealType,
    });
    rescheduleSheetRef.current?.present();
  };

  // Tapping a child order opens the exact same Order Details screen a Meal
  // Order row would (see `order-detail.tsx`'s `openDailyOrder`) — re-fetch
  // that day's own FoodOrder doc (status/delivery details live there, not on
  // the package parent), hand it to the shared order store, then navigate.
  const openChildOrderDetail = async (entry: DailyOrderEntry): Promise<void> => {
    if (openingRowId) return;
    setOpeningRowId(entry.foodOrderId);
    try {
      const foodOrder = await fetchFoodOrder(entry.foodOrderId);
      if (!foodOrder) {
        Alert.alert('Order status', 'Could not load this delivery right now.');
        return;
      }
      selectOrder(mapOrder(foodOrder));
      router.push('/order-detail' as Href);
    } finally {
      setOpeningRowId(null);
    }
  };

  const onDownloadInvoice = async (): Promise<void> => {
    if (downloadingInvoice || !childOrders.length) return;
    setDownloadingInvoice(true);
    try {
      const result = await downloadInvoice({
        packageName: order?.title ?? 'Subscription',
        planSubtitle: order?.subtitle,
        orderNo: order?.orderNo,
        items: childOrders,
        billing,
      });
      if (!result.ok) {
        Alert.alert('Could not generate invoice', result.error ?? 'Please try again.');
      }
    } finally {
      setDownloadingInvoice(false);
    }
  };

  if (!orderId) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-10">
        <Stack.Screen options={{ headerShown: true, title: 'My subscription' }} />
        <StatusBar style="auto" />
        <AccentIcon icon={IconUtensils} tone="food" size={26} tileSize={56} />
        <AppText variant="title" className="mt-3 text-center text-foreground">
          No subscription selected
        </AppText>
        <View style={{ marginTop: 16 }}>
          <Button label="Go back" variant="outline" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'My subscription' }} />
      <StatusBar style="auto" />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 20, gap: 12 }}>
        {loading ? (
          <PlanSummarySkeleton />
        ) : (
          <View style={{ backgroundColor: palette.brand.teal, borderRadius: RADIUS.lg, padding: 16 }}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center" style={{ gap: 7 }}>
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    backgroundColor: isComplete ? palette.brand.yellow : palette.brand.green,
                  }}
                />
                <AppText variant="overline" style={{ color: isComplete ? palette.brand.yellow : palette.brand.cream }}>
                  {isComplete ? 'COMPLETED' : 'ACTIVE'}
                </AppText>
              </View>
            </View>
            <AppText variant="h2" className="mt-2" style={{ color: '#fff' }}>
              {order?.title ?? 'Your subscription'}
            </AppText>
            {order?.subtitle ? (
              <AppText variant="bodySm" style={{ color: 'rgba(255,255,255,0.8)' }}>
                {order.subtitle}
              </AppText>
            ) : null}
            <View
              style={{
                height: 6,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.18)',
                marginTop: 16,
                overflow: 'hidden',
              }}>
              <View style={{ width: `${progressPct}%`, height: '100%', backgroundColor: palette.brand.green }} />
            </View>
            <View className="mt-2 flex-row justify-between">
              <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }}>
                {deliveredCount} of {totalMeals} meals delivered
              </AppText>
              <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }}>
                {Math.max(0, totalMeals - deliveredCount)} meals left
              </AppText>
            </View>
          </View>
        )}

        {/* Bill & invoice — replaces the old Pause/Swap/Address row (Pause and
            Swap never had a real backend behind them; Address is still one
            tap away via the app's own Profile/Addresses screen). */}
        <Pressable
          onPress={() => billSheetRef.current?.present()}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Bill and invoice"
          style={[
            shadow.card,
            { backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: 14, opacity: loading ? 0.5 : 1 },
          ]}
          className="flex-row items-center active:opacity-80">
          <AccentIcon icon={IconReceipt} tone="plan" size={19} tileSize={42} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <AppText variant="label" className="text-foreground">
              Bill & invoice
            </AppText>
            <AppText variant="caption" className="text-muted-foreground">
              Billing details, invoice download, reschedule
            </AppText>
          </View>
          <IconChevronRight size={18} color={colors.mutedForeground} />
        </Pressable>

        <View style={[shadow.card, { backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: 14 }]}>
          <View className="flex-row items-baseline justify-between">
            <AppText variant="title" className="text-foreground">
              Child orders
            </AppText>
            <AppText variant="caption" className="text-muted-foreground">
              {totalMeals} total
            </AppText>
          </View>
          <View className="mt-3" style={{ gap: 10 }}>
            {loading ? (
              [0, 1, 2].map((i) => <Skeleton key={i} height={64} radius={16} />)
            ) : childOrders.length === 0 ? (
              <AppText variant="bodySm" className="text-muted-foreground">
                No child orders found for this subscription yet.
              </AppText>
            ) : (
              childOrders.map((entry) => (
                <ChildOrderRow
                  key={entry.foodOrderId}
                  entry={entry}
                  opening={openingRowId === entry.foodOrderId}
                  onPress={() => openChildOrderDetail(entry)}
                  onReschedule={() => openReschedule(entry)}
                />
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {/* Bill & invoice popup — the real itemized charges off the package
          doc (same `BillRow` convention as cart checkout), not a summed
          approximation. */}
      <AppSheet ref={billSheetRef} snapPoints={['65%']}>
        <BottomSheetScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <AppText variant="h2" className="text-foreground">
            Bill details
          </AppText>
          {billing ? (
            <View style={{ gap: 10 }}>
              <BillRow label={order?.title ?? 'Plan'} amount={billing.itemAmount} />
              {billing.discount > 0 ? <BillRow label="Plan discount" amount={-billing.discount} positive /> : null}
              {billing.couponDiscount > 0 ? (
                <BillRow
                  label={billing.couponCode ? `Coupon (${billing.couponCode})` : 'Coupon discount'}
                  amount={-billing.couponDiscount}
                  positive
                />
              ) : null}
              <BillRow label="Delivery" amount={billing.delivery} original={billing.deliveryOriginal} />
              <BillRow label="Packaging" amount={billing.packaging} original={billing.packagingOriginal} />
              <BillRow label="Platform fee" amount={billing.platform} original={billing.platformOriginal} />
              <BillRow label="GST & charges" amount={billing.taxes} />
              {billing.walletUsed > 0 ? <BillRow label="Wallet credit" amount={-billing.walletUsed} positive /> : null}
              {billing.cashbackUsed > 0 ? (
                <BillRow label="Cashback credit" amount={-billing.cashbackUsed} positive />
              ) : null}
              <View style={{ height: 1, backgroundColor: colors.border, marginTop: 4, marginBottom: 2 }} />
              <View className="flex-row items-center justify-between">
                <AppText variant="label" className="text-foreground">
                  Total paid
                </AppText>
                <AppText variant="title" className="text-foreground">
                  ₹{billing.total.toLocaleString('en-IN')}
                </AppText>
              </View>
            </View>
          ) : (
            <AppText variant="bodySm" className="text-muted-foreground">
              Billing details aren&apos;t available for this order yet.
            </AppText>
          )}

          <View style={{ gap: 10, marginTop: 6 }}>
            <Button
              label="Download invoice"
              leftIcon={<IconDownload size={18} color="#fff" />}
              block
              loading={downloadingInvoice}
              onPress={onDownloadInvoice}
            />
          </View>
        </BottomSheetScrollView>
      </AppSheet>

      {/* Reschedule popup — date-only, for whichever child order's
          "Reschedule" action was tapped (the backend reschedules one child
          FoodOrder at a time, not the whole package). Shared with
          Order Details, which reschedules the exact same kind of order. */}
      <RescheduleSheet
        ref={rescheduleSheetRef}
        target={rescheduleTarget}
        siblingOrders={childOrders}
        onRescheduled={() => setReloadNonce((n) => n + 1)}
      />
    </View>
  );
}

/** One child (per-day) order row — labelled by its real order number, never
 * the meal/dish name, struck through once delivered. Tapping it opens the
 * exact same Order Details screen a Meal Order row would (`openChildOrderDetail`),
 * and it has its own "Reschedule" action only while the kitchen has merely
 * accepted it (`orderstatus === 'accepted'`) — once it's being prepared or
 * further along, the kitchen has already committed to that delivery slot,
 * so rescheduling is no longer offered. */
function ChildOrderRow({
  entry,
  opening,
  onPress,
  onReschedule,
}: {
  entry: DailyOrderEntry;
  opening: boolean;
  onPress: () => void;
  onReschedule: () => void;
}) {
  const colors = useColors();
  const completed = entry.orderstatus === 'delivered';
  const tone = statusTone(entry.orderstatus);
  const dateLabel = entry.orderDate ? formatShort(entry.orderDate.slice(0, 10)) : '—';
  const canReschedule = entry.orderstatus === 'accepted';

  return (
    <Pressable
      onPress={onPress}
      disabled={opening}
      accessibilityRole="button"
      accessibilityLabel={`Order #${entry.orderNo ?? ''} details`}
      className="rounded-2xl border border-border p-3 active:opacity-80"
      style={{ gap: 10, backgroundColor: completed ? colors.muted : colors.card }}>
      <View className="flex-row items-center" style={{ gap: 12 }}>
        <View style={{ width: 52, alignItems: 'center' }}>
          <AppText variant="label" className="text-foreground">
            {dateLabel}
          </AppText>
        </View>
        <View className="flex-1">
          <AppText
            variant="body"
            style={{
              color: completed ? colors.mutedForeground : colors.foreground,
              textDecorationLine: completed ? 'line-through' : 'none',
            }}>
            Order #{entry.orderNo ?? '—'}
          </AppText>
          {/* Lunch/Dinner/Breakfast — so a child order reads as more than
              just a number, matching what the parent's own DAILY MEAL
              ORDERS list already shows. */}
          {entry.mealType ? (
            <AppText variant="caption" className="text-muted-foreground">
              {entry.mealType}
            </AppText>
          ) : null}
        </View>
        <View
          style={{
            borderRadius: 999,
            paddingHorizontal: 9,
            paddingVertical: 5,
            backgroundColor: accentTint(palette.accent[tone], 0.14),
          }}>
          <AppText variant="caption" style={{ color: palette.accent[tone] }}>
            {statusLabel(entry.orderstatus)}
          </AppText>
        </View>
        {opening ? (
          <ActivityIndicator size="small" color={colors.mutedForeground} />
        ) : (
          <IconChevronRight size={16} color={colors.mutedForeground} />
        )}
      </View>
      {canReschedule ? (
        <Pressable
          onPress={onReschedule}
          accessibilityRole="button"
          accessibilityLabel={`Reschedule order #${entry.orderNo ?? ''}`}
          className="flex-row items-center self-start active:opacity-70"
          style={{ gap: 5, paddingLeft: 64 }}>
          <IconCalendar size={14} color={palette.brand.green} />
          <AppText variant="caption" style={{ color: palette.brand.green }}>
            Reschedule
          </AppText>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function PlanSummarySkeleton() {
  return (
    <View style={{ backgroundColor: palette.brand.teal, borderRadius: RADIUS.lg, padding: 16, gap: 10 }}>
      <Skeleton width={80} height={12} style={{ backgroundColor: 'rgba(255,255,255,0.16)' }} />
      <Skeleton width="70%" height={22} style={{ backgroundColor: 'rgba(255,255,255,0.16)' }} />
      <Skeleton width="45%" height={14} style={{ backgroundColor: 'rgba(255,255,255,0.16)' }} />
      <Skeleton height={6} radius={999} style={{ backgroundColor: 'rgba(255,255,255,0.16)', marginTop: 8 }} />
    </View>
  );
}

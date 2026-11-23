import { useEffect, useMemo, useRef, useState } from 'react';
import { Redirect, Stack, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ComponentType } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { AccentIcon } from '@/components/ui/AccentIcon';
import {
  IconCalendar,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconHelp,
  IconMapPin,
  IconSystem,
  IconUtensils,
  type IconProps,
} from '@/components/ui/icons';
import {
  useOrderStore,
  ORDER_STEPS,
  statusLabel,
  statusGroup,
  statusStepIndex,
  statusTone,
  isSameDay,
  loadFoodOrdersByPackage,
  loadOrderDetail,
  mapOrder,
  RescheduleSheet,
  type DailyOrderEntry,
  type RescheduleSheetHandle,
  type RescheduleTarget,
} from '@/features/orders';
import {
  normalizeLatLng,
  fetchFoodOrder,
  fetchDirections,
  fetchShiftLocation,
  useTrackingStore,
  useOngoingTrackingNotification,
  useDeliveryLiveActivity,
  setActiveTrackedOrder,
  clearActiveTrackedOrderIfMatches,
  TrackingMap,
  type LatLng,
} from '@/features/tracking';
import { formatShort } from '@/features/subscription';
import { pollPaymentStatus } from '@/services/payment';
import { useRefreshBumpStore } from '@/services/push';
import { useScreenTracking } from '@/services/netcore';
import { palette, accentTint, useColors } from '@/theme';

/** Mirrors the Ionic app's `TrackOpenOrder.TRACK_ORDER_MAX_SECONDS` — hide the
 * map until the rider is within 1 hour, so it doesn't appear (then have
 * nothing useful to show) the moment a rider is merely assigned. */
const TRACK_ORDER_MAX_SECONDS = 3600;

/** Stable empty-array reference for the `canTrack === false` branch below —
 * a `[]` literal inline in the render body would be a fresh reference every
 * render, defeating `TrackingMap`'s `React.memo` shallow-compare on its
 * `routePath` prop whenever any unrelated state on this screen changes. */
const EMPTY_ROUTE: LatLng[] = [];

export default function OrderDetailScreen() {
  useScreenTracking('order_detail');

  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const order = useOrderStore((s) => s.selected);
  const selectOrder = useOrderStore((s) => s.select);

  const raw = (order?.raw ?? {}) as Record<string, any>;
  // A subscription/package parent's own doc never carries `runner`/
  // `deliveryTaskId` — only its per-day child FoodOrder does. A plain Meal /
  // On Demand order *is* the FoodOrder, so it's its own trackable unit. The
  // `dailyOrderList` array itself is only used to DETECT "is this a package
  // parent" (the field only exists on that doc shape) — the actual child
  // orders come from `loadFoodOrdersByPackage`, a live query straight off
  // the FoodOrder collection, never that array's own (possibly stale/
  // incomplete) snapshot.
  const isSubscriptionParent = Array.isArray(raw.dailyOrderList);

  const [dailyOrders, setDailyOrders] = useState<DailyOrderEntry[]>([]);
  // Reset during render (not in the effect below) when the order changes —
  // the same React-endorsed pattern `resolvedForId` below uses.
  const [dailyOrdersForId, setDailyOrdersForId] = useState<string | null>(null);
  if ((order?.id ?? null) !== dailyOrdersForId) {
    setDailyOrdersForId(order?.id ?? null);
    setDailyOrders([]);
  }

  useEffect(() => {
    if (!isSubscriptionParent || !order?.id) return;
    let cancelled = false;
    loadFoodOrdersByPackage(order.id).then((rows) => {
      if (!cancelled) setDailyOrders(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [isSubscriptionParent, order?.id]);

  const todayDailyOrder = isSubscriptionParent
    ? (dailyOrders.find((e) => e.orderDate && isSameDay(new Date(e.orderDate), new Date())) ?? null)
    : null;
  const trackedFoodOrderId = isSubscriptionParent ? todayDailyOrder?.foodOrderId ?? null : order?.id ?? null;

  const [trackedFoodOrder, setTrackedFoodOrder] = useState<Record<string, any> | null>(null);
  // Reset during render (not in the effect below) when the resolved id changes —
  // the React-endorsed alternative to an Effect for "adjust state on prop change".
  const [resolvedForId, setResolvedForId] = useState<string | null>(null);
  if (trackedFoodOrderId !== resolvedForId) {
    setResolvedForId(trackedFoodOrderId);
    setTrackedFoodOrder(null);
  }

  useEffect(() => {
    if (!trackedFoodOrderId) return;
    let cancelled = false;
    fetchFoodOrder(trackedFoodOrderId).then((result) => {
      if (!cancelled) setTrackedFoodOrder(result);
    });
    return () => {
      cancelled = true;
    };
  }, [trackedFoodOrderId]);

  // Silent refresh whenever a push signals "something about your orders
  // changed" — this is exactly the screen a customer is watching for an
  // "on the way" transition (live map, status pill, stepper), so it needs to
  // update on its own even though we deliberately suppress the OS
  // notification for that specific status change (see `notifications.ts`).
  // Skips the version's initial value so mounting doesn't double-fetch
  // alongside the effects above.
  const ordersVersion = useRefreshBumpStore((s) => s.ordersVersion);
  const seenVersionRef = useRef(ordersVersion);
  useEffect(() => {
    if (seenVersionRef.current === ordersVersion) return;
    seenVersionRef.current = ordersVersion;
    if (trackedFoodOrderId) {
      fetchFoodOrder(trackedFoodOrderId).then((result) => {
        if (result) setTrackedFoodOrder(result);
      });
    }
    if (isSubscriptionParent && order?.id) {
      loadFoodOrdersByPackage(order.id).then((rows) => setDailyOrders(rows));
    } else if (order?.id) {
      fetchFoodOrder(order.id).then((foodOrder) => {
        if (foodOrder) selectOrder(mapOrder(foodOrder));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordersVersion]);

  const [checkingDayId, setCheckingDayId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const rescheduleSheetRef = useRef<RescheduleSheetHandle>(null);

  // Seed runner location for the trackability gate/ETA precheck below.
  // `runner.location`/`runnerLocation` are only ever populated for 3rd-party
  // vendor orders (Porter/Shadowfax/Pidge) — a Mealawe self-delivery rider's
  // position lives on `RiderShift`/`RiderLocationPing` instead, reachable via
  // the order's own `shiftId` (see `fetchShiftLocation`). Without this fetch,
  // `hasTrackableData` would never turn true for a self-delivery order — the
  // common case — since the synchronous fields are always empty for it.
  const shiftId = (trackedFoodOrder?.shiftId as string | null | undefined) ?? null;
  // Memoized: `normalizeLatLng` always returns a fresh `{lat, lng}` object
  // literal, so without this it would be a new reference every render —
  // including renders triggered by state this screen holds that has nothing
  // to do with location — which would defeat `TrackingMap`'s `React.memo`
  // downstream (this feeds `activeRunnerLocation` below via `??`, which is
  // itself just a passthrough of whichever operand is non-null).
  const syncRunnerLocation = useMemo(
    () => normalizeLatLng(trackedFoodOrder?.runner?.location ?? trackedFoodOrder?.runnerLocation),
    [trackedFoodOrder],
  );
  // Tagged with the order it was fetched for, so a stale in-flight result from
  // a previously-viewed order can never leak into this one — checked at read
  // time below instead of reset imperatively when the order/shift changes.
  const [shiftLocationResult, setShiftLocationResult] = useState<{
    orderId: string;
    location: LatLng | null;
  } | null>(null);
  useEffect(() => {
    if (!trackedFoodOrderId || !shiftId || syncRunnerLocation) return;
    let cancelled = false;
    fetchShiftLocation(shiftId).then((shift) => {
      if (!cancelled) setShiftLocationResult({ orderId: trackedFoodOrderId, location: shift?.location ?? null });
    });
    return () => {
      cancelled = true;
    };
    // This is a one-time seed for the gate/ETA precheck below, not a live feed
    // (that's `trackingStore`'s job once `canTrack` turns true) — deliberately
    // ignores `syncRunnerLocation` changing on its own so it doesn't refetch
    // mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedFoodOrderId, shiftId]);
  const fetchedShiftLocation =
    shiftLocationResult?.orderId === trackedFoodOrderId ? shiftLocationResult.location : null;
  const resolvedRunnerLocation = syncRunnerLocation ?? fetchedShiftLocation;

  // Computed without touching `order` directly (all `?.`-guarded) so these —
  // and the tracking hooks below that depend on them — can run *before* the
  // `!order` early return, keeping every hook call unconditional every render.
  // Memoized for the same reason as `syncRunnerLocation` above — `raw` is
  // included as a dep even though it's usually the same `order.raw`
  // reference across renders (only a fresh `{}` when `order.raw` is
  // nullish), so this only recomputes when the underlying data actually
  // changes rather than on every render of this screen.
  const destination = useMemo(
    () =>
      normalizeLatLng(
        trackedFoodOrder?.customerLocation?.geolocation ??
          trackedFoodOrder?.customerLocation?.location ??
          raw.customerLocation?.geolocation ??
          raw.customerLocation?.location,
      ),
    [trackedFoodOrder, raw],
  );
  // Kitchen/pickup point — only actually used once we know there's no live
  // runner fix yet (see the fallback map below), so a real destination
  // customers can orient against isn't just a blank map.
  const pickupLocation = useMemo(
    () => normalizeLatLng(trackedFoodOrder?.kitchenGeolocation ?? raw.kitchenGeolocation),
    [trackedFoodOrder, raw],
  );
  const trackedStatusGroup = statusGroup(trackedFoodOrder?.orderstatus);
  const hasTrackableData =
    !!resolvedRunnerLocation &&
    !!destination &&
    !!trackedFoodOrderId &&
    trackedStatusGroup !== 'cancelled' &&
    trackedFoodOrder?.orderstatus !== 'delivered';
  // "Out for delivery" (onTheWay/inTransit/outForDelivery all map to this
  // one step — see `statusStepIndex`) is when a rider should be en route —
  // the map section shows live tracking when a runner fix + in-range ETA is
  // actually available (`canTrack` below), else the static pickup + customer
  // fallback, so this section is never just blank while GPS catches up.
  const isOutForDeliveryStage =
    trackedStatusGroup !== 'cancelled' && statusStepIndex(trackedFoodOrder?.orderstatus) === 4;

  // ETA pre-check, ported from the Ionic app's `fetchEtaForOrder` — don't show
  // "Track order" for a runner who's still over an hour out (the CTA/map
  // shouldn't flash on for an order that turns out to be too far away).
  // `null` means "not checked yet" — canTrack stays false until it resolves.
  const [etaGateSeconds, setEtaGateSeconds] = useState<number | null>(null);
  useEffect(() => {
    setEtaGateSeconds(null);
    if (!hasTrackableData || !resolvedRunnerLocation || !destination) return;
    let cancelled = false;
    fetchDirections(resolvedRunnerLocation, destination).then((result) => {
      if (!cancelled) setEtaGateSeconds(result?.durationSeconds ?? null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTrackableData, trackedFoodOrderId]);

  const canTrack =
    hasTrackableData && typeof etaGateSeconds === 'number' && etaGateSeconds < TRACK_ORDER_MAX_SECONDS;

  // `useTrackingStore` is a single global "one order at a time" store (see
  // its own comments) — this screen is the only thing allowed to start/stop
  // it for `trackedFoodOrderId`, so the live map can render inline here
  // instead of navigating to a separate `/order-tracking` screen.
  const start = useTrackingStore((s) => s.start);
  const stop = useTrackingStore((s) => s.stop);
  const liveRunnerLocation = useTrackingStore((s) => s.runnerLocation);
  const liveRiderPhone = useTrackingStore((s) => s.riderPhone);
  const routePath = useTrackingStore((s) => s.routePath);
  const etaText = useTrackingStore((s) => s.etaText);
  const status = useTrackingStore((s) => s.status);

  // Falls back to `runner.phone_number` only for the 3rd-party-vendor case
  // before the store's first poll resolves — for Mealawe's own riders that
  // field is never populated (see `fetchRunnerLocation`'s shift-first
  // priority), so `liveRiderPhone` is the real source once tracking starts.
  const fallbackRiderPhone = (trackedFoodOrder?.runner as Record<string, unknown> | undefined)?.phone_number as
    | string
    | undefined;
  const riderPhone = liveRiderPhone ?? fallbackRiderPhone ?? undefined;

  useEffect(() => {
    if (!canTrack || !trackedFoodOrderId || !destination) return;
    start({
      orderId: trackedFoodOrderId,
      shiftId,
      deliveryTaskId: (trackedFoodOrder?.deliveryTaskId as string | null) ?? null,
      deliveryVendor: (trackedFoodOrder?.deliveryVendor as string | null) ?? null,
      destination,
      initialRunnerLocation: resolvedRunnerLocation,
    });
    return () => stop(trackedFoodOrderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canTrack, trackedFoodOrderId]);

  // Feeds the OS-scheduled background-refresh task (see
  // `backgroundOrderRefreshTask.ts`) — a resilience fallback for when a push
  // update doesn't arrive, entirely separate from `trackingStore`'s
  // foreground-only polling above.
  useEffect(() => {
    if (!canTrack || !trackedFoodOrderId) return;
    setActiveTrackedOrder(trackedFoodOrderId, riderPhone);
    return () => clearActiveTrackedOrderIfMatches(trackedFoodOrderId);
  }, [canTrack, trackedFoodOrderId, riderPhone]);

  useOngoingTrackingNotification(trackedFoodOrderId ?? undefined, etaText, status, riderPhone, {
      title: order?.title,
      statusText: statusLabel(trackedFoodOrder?.orderstatus as string | undefined),
      // Coarse lifecycle progress (placed → accepted → preparing → assigned →
      // out for delivery → delivered), same steps as the on-screen stepper —
      // simpler and more stable than a live distance-travelled ratio, and
      // needs no new tracking-store state.
      progress: (statusStepIndex(trackedFoodOrder?.orderstatus as string | undefined) / (ORDER_STEPS.length - 1)) * 100,
    },
  );

  // iOS counterpart to the Android notification above — see
  // `docs/LIVE-ORDER-TRACKING-PLAN.md` Phase 3.
  useDeliveryLiveActivity(
    trackedFoodOrderId ?? undefined,
    order?.title ?? 'Mealawe',
    statusLabel(trackedFoodOrder?.orderstatus as string | undefined),
    etaText,
    canTrack,
  );

  if (!order) {
    return <Redirect href="/orders" />;
  }

  const group = statusGroup(order.status);
  const cancelled = group === 'cancelled';
  const currentStep = statusStepIndex(order.status);

  // Only a per-day child FoodOrder can be rescheduled (a package parent has
  // no `subscriptionMasterId` of its own — it *is* the package the id would
  // point to), and only while the kitchen has merely accepted it — once
  // it's being prepared or further along, that delivery slot is already
  // committed, so rescheduling is no longer offered.
  const canReschedule = !isSubscriptionParent && !!raw.subscriptionMasterId && order.status === 'accepted';
  const rescheduleTarget: RescheduleTarget | null = canReschedule
    ? {
        foodOrderId: order.id,
        packageOrderId: String(raw.subscriptionMasterId),
        orderNo: order.orderNo,
        orderDate: order.date,
        mealType: typeof raw.mealType === 'string' ? raw.mealType : undefined,
      }
    : null;

  const dates: string[] = Array.isArray(raw.userSelectedDates) ? raw.userSelectedDates : [];
  // A package/subscription-parent doc exposes `mealTimeLunch`/`mealTimeDinner`
  // booleans (a plan can include both); a single child FoodOrder has no such
  // flags — it carries its own `mealType` string instead (Breakfast/Lunch/
  // HighTea/Dinner) — so fall back to that rather than leaving this blank
  // when viewing one specific day's order.
  const meal =
    [raw.mealTimeLunch ? 'Lunch' : null, raw.mealTimeDinner ? 'Dinner' : null].filter(Boolean).join(' + ') ||
    (typeof raw.mealType === 'string' ? raw.mealType : '');
  const address: string = raw.customerLocation?.location || raw.customerLocation?.address || '';
  const platformLabel = order.orderCreatedBy ? ORDER_CREATED_BY_LABEL[order.orderCreatedBy] : undefined;

  const activeRunnerLocation = liveRunnerLocation ?? resolvedRunnerLocation ?? null;

  // "DAILY MEAL ORDERS" → tap: resolve that day's own FoodOrder, then open
  // its own order-detail page — the same destination tapping that day's row
  // from the Meal Orders list would land on. That page shows the live map
  // itself when trackable, so there's no separate branch needed here.
  async function openDailyOrder(entry: DailyOrderEntry) {
    if (checkingDayId) return;
    setCheckingDayId(entry.foodOrderId);
    try {
      const foodOrder = (await fetchFoodOrder(entry.foodOrderId)) as Record<string, any> | null;
      if (!foodOrder) {
        Alert.alert('Order status', 'Could not load this delivery right now.');
        return;
      }
      selectOrder(mapOrder(foodOrder));
      router.push('/order-detail' as Href);
    } finally {
      setCheckingDayId(null);
    }
  }

  // Re-fetch this exact child FoodOrder after a successful reschedule (not
  // `loadOrderDetail` — that hits the subscription-order endpoint, wrong doc
  // for a single day's FoodOrder) so the STATUS/DELIVERY DETAILS on screen
  // reflect the new date immediately, the same fetch `openDailyOrder` uses.
  async function refreshAfterReschedule() {
    if (!order) return;
    const foodOrder = (await fetchFoodOrder(order.id)) as Record<string, any> | null;
    if (foodOrder) selectOrder(mapOrder(foodOrder));
  }

  async function checkPaymentStatus() {
    if (verifying || !order) return;
    setVerifying(true);
    try {
      const result = await pollPaymentStatus(order.orderType ?? '', order.id, { attempts: 3, delayMs: 2000 });
      if (result === 'success') {
        const refreshed = await loadOrderDetail(order.id);
        if (refreshed) selectOrder(refreshed);
        Alert.alert('Payment confirmed', 'Your order has been placed successfully.');
      } else {
        Alert.alert(
          'Still processing',
          "We haven't received confirmation from the payment gateway yet. Please check again in a moment.",
        );
      }
    } finally {
      setVerifying(false);
    }
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Order details' }} />
      <StatusBar style="auto" />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 20 + insets.bottom, gap: 14 }}>
        {/* item */}
        <View className="rounded-2xl border border-border bg-card p-3">
          <View className="flex-row gap-3">
            <View style={{ width: 64, height: 64, borderRadius: 14, overflow: 'hidden' }}>
              {order.imageUrl ? (
                <Image source={{ uri: order.imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              ) : (
                <View
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: accentTint(palette.accent.food, 0.14),
                  }}>
                  <IconUtensils size={22} color={palette.accent.food} />
                </View>
              )}
            </View>
            <View className="flex-1">
              <View className="flex-row items-start justify-between" style={{ gap: 8 }}>
                <AppText variant="title" className="flex-1 text-foreground">
                  {order.title}
                </AppText>
                {/* Quick-glance status — the ONLY status indicator a package
                    parent shows at this level (its per-day statuses live in
                    DAILY MEAL ORDERS below), so this fills what used to be a
                    blank spot for that case, not just a redundant chip. */}
                {order.status ? (
                  <View
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 9,
                      paddingVertical: 4,
                      backgroundColor: accentTint(palette.accent[statusTone(order.status)], 0.14),
                    }}>
                    <AppText variant="caption" style={{ color: palette.accent[statusTone(order.status)] }}>
                      {statusLabel(order.status)}
                    </AppText>
                  </View>
                ) : null}
              </View>
              {order.subtitle ? (
                <AppText variant="bodySm" className="text-muted-foreground">
                  {order.subtitle}
                </AppText>
              ) : null}
              {order.orderNo ? (
                <AppText variant="caption" className="text-muted-foreground" style={{ marginTop: 2 }}>
                  Order #{order.orderNo}
                </AppText>
              ) : null}
            </View>
          </View>
        </View>

        {/* status — parent subscription/package docs skip this: each day
            already has its own status below in DAILY MEAL ORDERS, and the
            generic delivery timeline doesn't describe a multi-day plan. */}
        {!isSubscriptionParent ? (
        <View className="rounded-2xl border border-border bg-card p-4" style={{ gap: 4 }}>
          <AppText variant="overline" className="text-muted-foreground">
            STATUS
          </AppText>
          {cancelled ? (
            <View
              className="mt-1 rounded-xl px-3 py-3"
              style={{ backgroundColor: accentTint(palette.accent[statusTone(order.status)], 0.12) }}>
              <AppText variant="label" style={{ color: palette.accent[statusTone(order.status)] }}>
                {statusLabel(order.status)}
              </AppText>
              <AppText variant="caption" className="text-muted-foreground" style={{ marginTop: 2 }}>
                This order won&apos;t be delivered. Any charge is refunded to your wallet.
              </AppText>
            </View>
          ) : (
            <View style={{ marginTop: 8 }}>
              {ORDER_STEPS.map((step, i) => {
                const done = i < currentStep;
                const active = i === currentStep;
                const reached = done || active;
                const tone = reached ? palette.brand.green : colors.mutedForeground;
                const last = i === ORDER_STEPS.length - 1;
                return (
                  <View key={step.key} className="flex-row" style={{ gap: 12 }}>
                    {/* rail */}
                    <View className="items-center" style={{ width: 24 }}>
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: reached ? palette.brand.green : 'transparent',
                          borderWidth: reached ? 0 : 1.5,
                          borderColor: colors.border,
                        }}>
                        {done ? (
                          <IconCheck size={12} color="#fff" strokeWidth={3} />
                        ) : active ? (
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />
                        ) : null}
                      </View>
                      {!last ? (
                        <View
                          style={{
                            width: 2,
                            flex: 1,
                            minHeight: 22,
                            backgroundColor: done ? palette.brand.green : colors.border,
                          }}
                        />
                      ) : null}
                    </View>
                    {/* label */}
                    <View style={{ paddingBottom: last ? 0 : 14, flex: 1 }}>
                      <AppText
                        variant={active ? 'label' : 'body'}
                        style={{ color: reached ? colors.foreground : colors.mutedForeground }}>
                        {step.label}
                      </AppText>
                      {active ? (
                        <AppText variant="caption" style={{ color: palette.brand.green, marginTop: 1 }}>
                          {statusLabel(order.status)}
                        </AppText>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          {order.status === 'paymentInprogress' ? (
            <View style={{ marginTop: 10, gap: 6 }}>
              <Button
                label="Check payment status"
                variant="outline"
                size="sm"
                loading={verifying}
                onPress={checkPaymentStatus}
              />
              <AppText variant="caption" className="text-muted-foreground">
                Charged but still shows in progress? Tap to re-check with the payment gateway.
              </AppText>
            </View>
          ) : null}
        </View>
        ) : null}

        {/* live map — rendered inline for the whole "out for delivery" stage,
            not just once a runner fix actually arrives: live tracking when
            `canTrack` (rider assigned + in-range ETA) is true, else a static
            pickup + customer fallback so this section is never just blank
            while GPS catches up. `useTrackingStore` above keeps polling
            while this screen is mounted; no separate screen needed. */}
        {isOutForDeliveryStage && destination ? (
          <View style={{ gap: 10 }}>
            <TrackingMap
              destination={destination}
              pickup={canTrack ? null : pickupLocation}
              runnerLocation={canTrack ? activeRunnerLocation : null}
              routePath={canTrack ? routePath : EMPTY_ROUTE}
              height={220}
            />
            <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3">
              <AccentIcon icon={IconClock} tone="info" size={16} tileSize={32} />
              <View className="flex-1">
                <AppText variant="caption" className="text-muted-foreground">
                  {canTrack
                    ? status === 'loading'
                      ? 'Locating your delivery partner…'
                      : 'Estimated arrival'
                    : 'Live tracking'}
                </AppText>
                <AppText variant="label" className="text-foreground">
                  {canTrack ? etaText ?? 'On the way' : 'Your order is out for delivery'}
                </AppText>
              </View>
            </View>
          </View>
        ) : null}

        {/* daily meal orders — mirrors the Ionic subscription-detail's child-order list */}
        {dailyOrders.length > 0 ? (
          <View className="rounded-2xl border border-border bg-card p-4" style={{ gap: 2 }}>
            <AppText variant="overline" className="text-muted-foreground" style={{ marginBottom: 8 }}>
              DAILY MEAL ORDERS
            </AppText>
            {dailyOrders.map((entry, i) => (
              <View key={entry.foodOrderId}>
                <Pressable
                  accessibilityRole="button"
                  disabled={checkingDayId === entry.foodOrderId}
                  className="flex-row items-center justify-between active:opacity-70"
                  style={{ paddingVertical: 10 }}
                  onPress={() => openDailyOrder(entry)}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <AppText variant="body" className="text-foreground">
                      {entry.orderDate
                        ? new Date(entry.orderDate).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            timeZone: 'Asia/Kolkata',
                          })
                        : `Order #${entry.orderNo ?? i + 1}`}
                    </AppText>
                    <View className="flex-row items-center" style={{ gap: 6, marginTop: 2 }}>
                      {entry.mealType ? (
                        <AppText variant="caption" className="text-muted-foreground">
                          {entry.mealType}
                        </AppText>
                      ) : null}
                      {entry.orderstatus ? (
                        <AppText
                          variant="caption"
                          style={{ color: palette.accent[statusTone(entry.orderstatus)] }}>
                          {statusLabel(entry.orderstatus)}
                        </AppText>
                      ) : null}
                    </View>
                  </View>
                  <View className="flex-row items-center" style={{ gap: 8 }}>
                    {typeof entry.amount === 'number' ? (
                      <AppText variant="label" className="text-foreground">
                        ₹{entry.amount}
                      </AppText>
                    ) : null}
                    {checkingDayId === entry.foodOrderId ? (
                      <AppText variant="caption" className="text-muted-foreground">
                        Checking…
                      </AppText>
                    ) : (
                      <IconChevronRight size={18} color={colors.mutedForeground} />
                    )}
                  </View>
                </Pressable>
                {i < dailyOrders.length - 1 ? <View className="border-b border-border" /> : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* delivery details */}
        <View className="rounded-2xl border border-border bg-card p-4" style={{ gap: 12 }}>
          <AppText variant="overline" className="text-muted-foreground">
            DELIVERY DETAILS
          </AppText>
          <DetailRow icon={IconCalendar} tone="plan" label="Schedule">
            {dates.length
              ? `${dates.length} delivery day${dates.length > 1 ? 's' : ''}`
              : order.date
                ? formatShort(order.date.slice(0, 10))
                : 'See plan'}
          </DetailRow>
          <DetailRow icon={IconClock} tone="info" label="Meal">
            {meal || 'Not specified'}
          </DetailRow>
          <DetailRow icon={IconMapPin} tone="location" label="Delivering to">
            {address || 'Your saved address'}
          </DetailRow>
          {platformLabel ? (
            <DetailRow icon={IconSystem} tone="info" label="Placed via">
              {platformLabel}
            </DetailRow>
          ) : null}
        </View>

        {/* bill */}
        {order.amount > 0 ? (
          <View className="rounded-2xl border border-border bg-card p-4 flex-row items-center justify-between">
            <AppText variant="label" className="text-foreground">
              Amount paid
            </AppText>
            <AppText variant="title" className="text-foreground">
              ₹{order.amount}
            </AppText>
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          {canReschedule ? (
            <Button
              label="Reschedule this delivery"
              variant="outline"
              block
              leftIcon={<IconCalendar size={18} color={palette.brand.green} />}
              onPress={() => rescheduleSheetRef.current?.present()}
            />
          ) : null}
          <Button
            label="Need help with this order?"
            variant="outline"
            block
            leftIcon={<IconHelp size={18} color={palette.brand.green} />}
            onPress={() => router.push('/help' as Href)}
          />
        </View>
      </ScrollView>

      <RescheduleSheet ref={rescheduleSheetRef} target={rescheduleTarget} onRescheduled={refreshAfterReschedule} />
    </View>
  );
}

/** Only the two customer-app values are shown — `orderCreatedBy` can also be
 * 'Admin'/'Auto'/'navmool_web'/etc. server-side, which isn't meaningful to
 * surface to the customer viewing their own order. */
const ORDER_CREATED_BY_LABEL: Record<string, string> = {
  mealawe_app_android: 'Android app',
  mealawe_app_ios: 'iOS app',
};

function DetailRow({
  icon: Icon,
  tone,
  label,
  children,
}: {
  icon: ComponentType<IconProps>;
  tone: 'plan' | 'info' | 'location';
  label: string;
  children: string;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <AccentIcon icon={Icon} tone={tone} size={17} tileSize={36} />
      <View className="flex-1">
        <AppText variant="caption" className="text-muted-foreground">
          {label}
        </AppText>
        <AppText variant="body" className="text-foreground">
          {children}
        </AppText>
      </View>
    </View>
  );
}

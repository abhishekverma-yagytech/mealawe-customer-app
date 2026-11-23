import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { IconArrowLeft, IconCheck, IconChevronDown, IconChevronUp, IconClock, IconMapPin, IconPhone, IconRefresh, IconUtensils } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { loadKitchenAddress, loadOrderById, markApartmentOrderDelivered, parseApartmentOrderError } from '@/features/apartment/api';
import {
  apartmentOrderReadyLabel,
  apartmentOrderStatusBg,
  apartmentOrderStatusColor,
  apartmentOrderStatusLabel,
  apartmentOrderStepIndex,
  apartmentOrderStepTimestamp,
  apartmentOrderSteps,
} from '@/features/apartment/orderStatus';
import type { ApartmentOrder } from '@/features/apartment/types';
import { isCancelledApartmentStatus, isTerminalApartmentStatus, useActiveOrdersStore } from '@/features/apartment/useActiveOrdersStore';
import { useApartmentAdvanceSlotWindow } from '@/features/apartment/useApartmentAdvanceSlotWindow';
import { formatEtaCountdown, useApartmentEtaCountdown } from '@/features/apartment/useApartmentEtaCountdown';
import { useApartmentTodayPrepEndTime } from '@/features/apartment/useApartmentTodayPrepEndTime';
import { useSelectedOrderStore } from '@/features/apartment/useSelectedOrderStore';
import { useAuthStore } from '@/store';
import { accentTint, shadow, useApartmentColors } from '@/theme';
import { formatINR } from '@/utils/currency';

const DONE_STATUSES = new Set(['delivered', 'pickedUp']);

/** Same `en-GB`/`Asia/Kolkata` convention `order-detail.tsx` (the regular,
 * non-apartment order-history screen) already uses for its own order-date
 * display, plus a time — this screen's "Placed on" line is a single order,
 * not a list row, so the extra precision is worth the couple more words. */
function formatOrderPlacedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  return `${date} · ${time}`;
}

/** Bug fix: this screen polls its OWN copy of the order independently of
 * `useActiveApartmentOrders` (the rib's separate 30s poller) — the two
 * never shared data, so a resident staring at "Delivered" right here could
 * still see the rib for the SAME order for up to another 30 seconds, until
 * the rib's own poll happened to catch up on its own schedule. Feeding
 * every fresh fetch straight into the shared store closes that gap: the
 * rib now updates/disappears the instant THIS screen learns the order is
 * done, not on a second, unrelated timer. */
function syncActiveOrder(order: ApartmentOrder): void {
  if (isTerminalApartmentStatus(order.orderstatus)) {
    useActiveOrdersStore.getState().untrack(order._id);
  } else {
    useActiveOrdersStore.getState().update(order);
  }
}

/**
 * "View order" — reference: Claude Design's `orderKitchenCard`/`showEta`/
 * bill-details treatment (`Apartment Prototype.dc.html`), the same visual
 * language `apartment-cart.tsx` already uses, applied here in a read-only
 * "already placed" mode instead of an editable cart — minus the order-type
 * pill and the Advance "can't be modified" note, both a deliberate later
 * removal (product decision, matches the same removal from the add-to-
 * order sheet). Reached from
 * the placement-result rib (`apartment-cart.tsx`) with the order object
 * already in hand via `useSelectedOrderStore` — the `orderId` param is only a
 * fallback for a cold start / deep link, where it re-fetches via `loadOrderById`.
 */
export default function ApartmentOrderDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Root-cause fix: this screen used to read the Apartment feature's own
  // palette directly — fixed light-mode hex with no dark-mode counterpart —
  // so it stayed on its light cream page background even after the app was
  // switched to dark mode.
  const { colors } = useApartmentColors();
  // Bug fix (product report, 2026-09-05 — "Apartment Order should view only
  // when user is loggedIn"): this screen used to have no auth check
  // at all — a guest reaching it (deep link, or a stale preselected order)
  // would just fetch/render whatever `loadOrderById` returned. Read here so
  // both fetch effects below can skip the wasted call, and the final render
  // gate (near the bottom, after every hook — Rules of Hooks) can show the
  // same "Log in to view your X" pattern cashback.tsx/wallet.tsx/apartment-
  // order-history.tsx already use, instead of an empty/error state.
  const profile = useAuthStore((s) => s.profile);
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const preselected = useSelectedOrderStore((s) => s.selected);

  const [order, setOrder] = useState<ApartmentOrder | null>(preselected && preselected._id === orderId ? preselected : null);
  const [loading, setLoading] = useState(!order);
  const [refreshing, setRefreshing] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Frozen at mount — whether we already had something to show (from
  // useSelectedOrderStore) BEFORE this screen's own fetch below ever runs.
  // Only matters for deciding whether a failed/empty fetch means "genuinely
  // not found" vs. "the refresh failed, but keep showing what we already
  // had" — a plain `!order` check inside the effect would go stale the
  // moment the effect's own setOrder call resolves.
  const hadPreselected = useRef(order !== null).current;
  const resolvedOrderId = order?._id ?? orderId;

  // Pull the LATEST status on open — always, not just when there's no
  // cached order in hand. A pre-selected order (from the moment it was
  // placed/last viewed) can be stale by the time the resident reopens this
  // screen, so this refetches in the background even then; the skeleton
  // only shows when there's nothing to display meanwhile.
  useEffect(() => {
    if (!resolvedOrderId || !profile) {
      setLoading(false);
      return;
    }
    let active = true;
    loadOrderById(resolvedOrderId)
      .then((res) => {
        if (!active) return;
        if (res) {
          setOrder(res);
          syncActiveOrder(res);
        } else if (!hadPreselected) setNotFound(true);
      })
      .catch(() => {
        if (active && !hadPreselected) setNotFound(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // Deliberately mount-only (resolvedOrderId won't meaningfully change
    // after mount for this screen) — see handleRefresh for the manual,
    // repeatable version of the same fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bug fix (product report, 2026-09-03 — "Placed Order screen is not
  // tracking properly... Placed / Accepted / Being prepared"): this screen
  // used to fetch the order's status exactly ONCE, on mount, and never
  // again unless the resident noticed and tapped the manual refresh icon —
  // so a resident who stayed on this exact screen while the kitchen
  // actually accepted/started preparing just kept seeing "Placed" frozen in
  // place, with nothing to tell them it had gone stale. Polls the same way
  // the bottom rib's own live tracking already does
  // (`useActiveApartmentOrders`'s `POLL_INTERVAL_MS` — 30s, apartment's
  // acceptance window is short) so this screen self-updates through every
  // real status change on its own, not just at open. Stops once the order
  // is terminal (delivered/picked up/cancelled/...) — nothing left to poll
  // for at that point.
  useEffect(() => {
    if (!resolvedOrderId || !profile) return;
    let active = true;
    const interval = setInterval(() => {
      if (order && isTerminalApartmentStatus(order.orderstatus)) {
        clearInterval(interval);
        return;
      }
      loadOrderById(resolvedOrderId)
        .then((res) => {
          if (!active || !res) return;
          setOrder(res);
          syncActiveOrder(res);
          if (isTerminalApartmentStatus(res.orderstatus)) clearInterval(interval);
        })
        .catch(() => {
          // a missed poll just retries next interval — same "don't surface
          // a background status pull failure" convention `handleRefresh`
          // below already uses.
        });
    }, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedOrderId, order?.orderstatus]);

  async function handleRefresh(): Promise<void> {
    if (!resolvedOrderId || refreshing) return;
    setRefreshing(true);
    try {
      const res = await loadOrderById(resolvedOrderId);
      if (res) {
        setOrder(res);
        syncActiveOrder(res);
      }
    } catch {
      // a failed manual refresh just leaves the last-known status showing —
      // no need to surface an error for a background status pull
    } finally {
      setRefreshing(false);
    }
  }

  // Bug fix (product report, 2026-09-05 — "Apartment Order should view only
  // when user is loggedIn"): same "Log in to view your X" gate cashback.tsx/
  // wallet.tsx/apartment-order-history.tsx already use — placed after every
  // hook above (Rules of Hooks), before the real content below.
  if (!profile) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.page }}>
        <StatusBar style="dark" />
        <View className="flex-row items-center gap-3 px-4 pb-3" style={{ paddingTop: insets.top + 10 }}>
          <Pressable
            onPress={() => router.back()}
            className="h-9 w-9 items-center justify-center rounded-2xl"
            style={{ borderWidth: 1, borderColor: colors.border }}>
            <IconArrowLeft size={18} color={colors.ink} />
          </Pressable>
          <AppText variant="h3" style={{ color: colors.ink, flex: 1 }}>
            Order details
          </AppText>
        </View>
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <AppText variant="h3" style={{ color: colors.ink, textAlign: 'center' }}>
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
    <View className="flex-1" style={{ backgroundColor: colors.page }}>
      <StatusBar style="dark" />
      <View className="flex-row items-center gap-3 px-4 pb-3" style={{ paddingTop: insets.top + 10 }}>
        <Pressable
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-2xl"
          style={{ borderWidth: 1, borderColor: colors.border }}>
          <IconArrowLeft size={18} color={colors.ink} />
        </Pressable>
        <AppText variant="h3" style={{ color: colors.ink, flex: 1 }}>
          {order ? `Order #${order.orderNo}` : 'Order details'}
        </AppText>
        {order ? (
          <Pressable
            onPress={handleRefresh}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Refresh order status"
            className="h-9 w-9 items-center justify-center rounded-2xl"
            style={{ borderWidth: 1, borderColor: colors.border }}>
            {refreshing ? <ActivityIndicator size="small" color={colors.ink} /> : <IconRefresh size={16} color={colors.ink} />}
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton height={70} radius={16} />
          <Skeleton height={90} radius={16} />
          <Skeleton height={140} radius={16} />
        </View>
      ) : !order || notFound ? (
        <View className="flex-1 items-center justify-center px-8">
          <AppText variant="h3" style={{ color: colors.ink }}>
            Order not found
          </AppText>
          <AppText variant="bodySm" style={{ color: colors.muted, marginTop: 6, textAlign: 'center' }}>
            This order may have been from a different session, or the link is out of date.
          </AppText>
        </View>
      ) : (
        <OrderDetailBody
          order={order}
          onOrderUpdated={(updated) => {
            setOrder(updated);
            syncActiveOrder(updated);
          }}
        />
      )}
    </View>
  );
}

function OrderDetailBody({ order, onOrderUpdated }: { order: ApartmentOrder; onOrderUpdated: (order: ApartmentOrder) => void }) {
  const insets = useSafeAreaInsets();
  const { colors, orderType: orderTypeColors, isDark } = useApartmentColors();
  const profile = useAuthStore((s) => s.profile);
  const statusColor = apartmentOrderStatusColor(order.orderstatus, isDark);
  // Bug fix (product report, 2026-09-02 — "order status is displayed with
  // yellow text on a gray background... contrast is too low"): see
  // `apartmentOrderStatusBg`'s own comment for why a plain
  // `accentTint(statusColor, 0.1)` isn't reliable for gold specifically.
  const statusBg = apartmentOrderStatusBg(order.orderstatus, isDark);
  // Bug fix: the kitchen-icon tile and (Instant-only) ETA card below both
  // used to hardcode `colors.green` regardless of this order's
  // actual type — right for Instant (its own accent happens to BE that
  // exact green) but wrong for Today/Advance/Bulk, which each have their
  // own accent (gold/grey-green/brown) elsewhere in the feature.
  const tone = orderTypeColors[order.orderType];
  const items = order.itemList ?? [];
  // See `useApartmentAdvanceSlotWindow`/`useApartmentTodayPrepEndTime`'s own
  // doc comments — the one real source for an Advance order's actual
  // delivery TIME window, and Today's own real prep-end time, resolved
  // once here and handed to `apartmentOrderReadyLabel` below.
  const advanceSlotWindow = useApartmentAdvanceSlotWindow(order);
  const todayPrepEndTime = useApartmentTodayPrepEndTime(order);

  // Bug fix: the countdown now only exists while status is literally
  // 'preparing', anchored to THAT transition's real timestamp — see
  // useApartmentEtaCountdown's own (longer) comment for why acceptance was
  // the wrong anchor. `showEta` follows the same rule: no banner at all
  // before prep starts, and it disappears (replaced by the "Mark complete"
  // button below Bill Details, once status reaches readyToDelivery — OTP
  // removed, product instruction 2026-08-27) the moment status moves past
  // 'preparing'.
  const remainingMs = useApartmentEtaCountdown(order);
  const showEta = order.orderType === 'instant' && order.orderstatus === 'preparing';

  // Root-cause simplification (product instruction, 2026-09-02 — "show all
  // details for that order which comes from API"): the order itself now
  // carries `kitchenAddress` straight from the API (per the "Apartment
  // Orders API Reference" doc, 2 Sep 2026) — this used to ALWAYS make a
  // separate `loadKitchenAddress` fetch for a pickup order regardless, as
  // if the order response had no address of its own at all. Prefers that
  // already-in-hand field now; the fetch only ever runs as a fallback for
  // an OLDER order placed before this field existed on the model.
  const orderKitchenAddress = order.kitchenAddress
    ? [order.kitchenAddress.address1, order.kitchenAddress.address2, order.kitchenAddress.landmark].filter(Boolean).join(', ')
    : null;
  const [fetchedKitchenAddress, setFetchedKitchenAddress] = useState<string | null>(null);
  useEffect(() => {
    if (order.fulfillmentMode !== 'pickup' || orderKitchenAddress) return;
    let active = true;
    loadKitchenAddress(order.kitchenId).then((addr) => {
      if (active) setFetchedKitchenAddress(addr);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.fulfillmentMode, order.kitchenId, orderKitchenAddress]);
  const kitchenAddress = orderKitchenAddress || fetchedKitchenAddress;
  const kitchenPhone = order.kitchenPhoneNo || order.kitchenmapTelNo;

  // GST breakup — same tap-to-expand convention apartment-cart.tsx's own
  // pre-placement Bill Details already uses (see its own `gstBreakupOpen`).
  const itemGst = (order.cgst ?? 0) + (order.sgst ?? 0);
  const gstTotal = itemGst + (order.deliveryChargesGST ?? 0) + (order.platformChargesGST ?? 0) + (order.packagingChargesGST ?? 0);
  const [gstBreakupOpen, setGstBreakupOpen] = useState(false);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 + insets.bottom }}>
      <View
        className="flex-row items-center gap-3 rounded-2xl p-3.5"
        style={[
          shadow.card,
          {
            backgroundColor: statusBg,
            borderWidth: 1,
            borderColor: accentTint(statusColor, 0.28),
            borderLeftWidth: 4,
            borderLeftColor: statusColor,
          },
        ]}>
        <View style={{ flex: 1 }}>
          <AppText variant="label" style={{ color: statusColor }}>
            {apartmentOrderStatusLabel(order.orderstatus)}
          </AppText>
          {/* Product instruction, 2026-09-02 — "show all details for that
              order which comes from API": `orderDate` was fetched all along
              but never actually shown anywhere on this screen. */}
          {order.orderDate ? (
            <AppText variant="caption" style={{ color: statusColor, opacity: 0.75, marginTop: 1 }}>
              Placed {formatOrderPlacedAt(order.orderDate)}
            </AppText>
          ) : null}
          {/* Product instruction, 2026-09-03 — "when Order placed and I
              open View Order on that screen also show like XX.XX PM in
              caps": same Instant/Today "ready to deliver" (or Advance
              selected slot) text the placement-confirmation screen and the
              bottom rib already show. */}
          {apartmentOrderReadyLabel(order, advanceSlotWindow, todayPrepEndTime) ? (
            <AppText variant="caption" style={{ color: statusColor, opacity: 0.75, marginTop: 1 }}>
              {apartmentOrderReadyLabel(order, advanceSlotWindow, todayPrepEndTime)}
            </AppText>
          ) : null}
        </View>
        {DONE_STATUSES.has(order.orderstatus) ? <IconCheck size={16} color={statusColor} /> : null}
      </View>

      {/* Bug fix (product report, 2026-09-03 — "order-status carousel
          should show all statuses from Placed through Ready to Deliver...
          not all statuses are being displayed"): this screen used to show
          ONLY the single card above (current status alone) — no progression
          at all, so a resident could never see Placed/Accepted had already
          happened. Mirrors the general (non-apartment) order-detail
          screen's own proven step-rail pattern, adapted to apartment's own
          status set and split by fulfillment mode (see
          `apartmentOrderSteps`/`apartmentOrderStepIndex`, orderStatus.ts).
          Replaced by the plain "won't be delivered" framing already above
          for a cancelled/rejected/refunded/failed order — a step rail
          implies forward progress that never actually happened there. */}
      {!isCancelledApartmentStatus(order.orderstatus) ? (
        <View className="rounded-2xl p-3.5" style={[shadow.card, { backgroundColor: colors.card }]}>
          {(() => {
            const steps = apartmentOrderSteps(order.fulfillmentMode === 'pickup' ? 'pickup' : 'delivery');
            const currentStep = apartmentOrderStepIndex(order.orderstatus, order.fulfillmentMode === 'pickup' ? 'pickup' : 'delivery');
            const fulfillmentMode = order.fulfillmentMode === 'pickup' ? 'pickup' : 'delivery';
            return steps.map((step, i) => {
              const done = i < currentStep;
              const active = i === currentStep;
              const reached = done || active;
              const stepColor = reached ? tone.accent : colors.muted;
              const last = i === steps.length - 1;
              // Product instruction, 2026-09-03 — "on description[,] status
              // changed[,] placed add time stamp here[,] accepted time
              // stamp[,] onwards": every REACHED step shows when it actually
              // happened, straight from this order's own `statusHistory` —
              // never a guess, and never shown for a step that hasn't
              // happened yet.
              const stepTimestamp = reached ? apartmentOrderStepTimestamp(order.statusHistory, i, fulfillmentMode) : null;
              return (
                <View key={step.key} className="flex-row" style={{ gap: 12 }}>
                  <View className="items-center" style={{ width: 22 }}>
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: reached ? tone.accent : 'transparent',
                        borderWidth: reached ? 0 : 1.5,
                        borderColor: colors.border,
                      }}>
                      {done ? <IconCheck size={12} color="#fff" strokeWidth={3} /> : null}
                    </View>
                    {!last ? <View style={{ width: 2, flex: 1, minHeight: 20, backgroundColor: done ? tone.accent : colors.border, marginTop: 2 }} /> : null}
                  </View>
                  <View style={{ paddingBottom: last ? 0 : 14, flex: 1 }}>
                    <AppText variant="body" weight={active ? 'bold' : undefined} style={{ color: stepColor }}>
                      {step.label}
                    </AppText>
                    {stepTimestamp ? (
                      <AppText variant="caption" style={{ color: colors.muted, marginTop: 1 }}>
                        {formatOrderPlacedAt(stepTimestamp)}
                      </AppText>
                    ) : null}
                  </View>
                </View>
              );
            });
          })()}
        </View>
      ) : null}

      {/* Order-type pill and the "Advance orders can't be modified..." note
          both deliberately removed here — product decision (same one that
          already dropped Order Type display from the add-to-order sheet). */}
      <View className="flex-row items-center gap-3 rounded-2xl p-3.5" style={[shadow.card, { backgroundColor: colors.card }]}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            backgroundColor: accentTint(tone.accent, 0.12),
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
          <IconUtensils size={18} color={tone.accent} />
        </View>
        <View className="flex-1">
          <AppText variant="label" style={{ color: colors.ink }}>
            {order.kitchenName}
          </AppText>
          <AppText variant="caption" style={{ color: colors.muted }}>
            {/* Root-cause fix (product instruction, 2026-09-02 — "Apartment
                Orders API Reference" doc): `mealType` used to be Today-only
                in practice (an Advance order's was always undefined, so
                this always fell through to the generic Delivery/Self-pickup
                fallback for it) — the server now REQUIRES `mealType` on
                every Advance order too (the resident's own delivery-slot
                pick, see apartment-cart.tsx's checkout payload), so this
                same line already shows it correctly ("Lunch", "Dinner", ...)
                with no Advance-specific branch needed here anymore. */}
            {order.mealType ?? (order.fulfillmentMode === 'pickup' ? 'Self-pickup' : 'Delivery')}
            {order.roomNumber ? ` · ${order.wingName ? `${order.wingName}-` : ''}${order.roomNumber}` : ''}
          </AppText>
          {order.fulfillmentMode === 'pickup' && kitchenAddress ? (
            <AppText variant="caption" style={{ color: colors.muted, marginTop: 3, lineHeight: 16 }}>
              {kitchenAddress}
            </AppText>
          ) : null}
        </View>
        {/* Product instruction, 2026-09-02 — "show all details for that
            order which comes from API": `kitchenPhoneNo`/`kitchenmapTelNo`
            were persisted on every order all along but never surfaced
            anywhere on this screen — most useful for self-pickup, where the
            resident may actually need to call ahead or ask directions. Same
            direct-dial convention `order-tracking.tsx`'s own "Call" button
            already uses. */}
        {kitchenPhone ? (
          <Pressable
            onPress={() => Linking.openURL(`tel:${kitchenPhone}`).catch(() => {})}
            accessibilityRole="button"
            accessibilityLabel="Call kitchen"
            className="h-10 w-10 items-center justify-center rounded-2xl active:opacity-70"
            style={{ backgroundColor: accentTint(tone.accent, 0.12), flexShrink: 0 }}>
            <IconPhone size={17} color={tone.accent} />
          </Pressable>
        ) : null}
      </View>

      {/* Product instruction, 2026-09-02 — delivery-address confirmation:
          `customerLocation` is the resident's own address snapshot at
          placement time, meaningful to show only for an actual delivery
          order (a pickup order's "address" is the KITCHEN's, already shown
          above). */}
      {order.fulfillmentMode === 'delivery' && order.customerLocation ? (
        <View className="flex-row items-start gap-3 rounded-2xl p-3.5" style={[shadow.card, { backgroundColor: colors.card }]}>
          <View
            style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: accentTint(tone.accent, 0.12), alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <IconMapPin size={18} color={tone.accent} />
          </View>
          <View className="flex-1">
            <AppText variant="label" style={{ color: colors.ink }}>
              {order.customerLocation.tagLocation || 'Delivery address'}
            </AppText>
            <AppText variant="caption" style={{ color: colors.muted, marginTop: 2, lineHeight: 16 }}>
              {[order.customerLocation.address, order.customerLocation.location, order.customerLocation.landmark].filter(Boolean).join(', ')}
            </AppText>
          </View>
        </View>
      ) : null}

      {showEta ? (
        <View className="rounded-2xl p-4" style={[shadow.card, { backgroundColor: tone.accent }]}>
          <View className="flex-row items-center gap-2">
            <IconClock size={15} color="rgba(255,255,255,.8)" />
            <AppText variant="overline" style={{ color: 'rgba(255,255,255,.8)', letterSpacing: 0.6 }}>
              {remainingMs === null ? 'PREPARING' : remainingMs > 0 ? 'PREPARING YOUR ORDER' : 'ALMOST READY'}
            </AppText>
          </View>
          {remainingMs === null ? (
            <>
              <AppText variant="h2" style={{ color: '#fff', marginTop: 6 }}>
                ~{order.estimatedFulfillmentMinutes} min
              </AppText>
              <AppText variant="caption" style={{ color: 'rgba(255,255,255,.75)', marginTop: 2 }}>
                Tentative estimate.
              </AppText>
            </>
          ) : remainingMs > 0 ? (
            <>
              <AppText variant="display" style={{ color: '#fff', marginTop: 4, fontVariant: ['tabular-nums'] }}>
                {formatEtaCountdown(remainingMs)}
              </AppText>
              <AppText variant="caption" style={{ color: 'rgba(255,255,255,.75)', marginTop: 2 }}>
                Tentative — the kitchen is preparing your order.
              </AppText>
            </>
          ) : (
            <>
              <AppText variant="h3" style={{ color: '#fff', marginTop: 4 }}>
                Should be ready any moment
              </AppText>
              <AppText variant="caption" style={{ color: 'rgba(255,255,255,.75)', marginTop: 2 }}>
                Refresh above for the latest status.
              </AppText>
            </>
          )}
        </View>
      ) : null}
      {/* OTP handover/pickup card removed (product instruction, 2026-08-27)
          — replaced by the resident's own "Mark complete" button below
          Bill details, gated on orderstatus === 'readyToDelivery'. */}

      {items.length > 0 ? (
        <View className="overflow-hidden rounded-2xl" style={[shadow.card, { backgroundColor: colors.card }]}>
          <View
            className="flex-row items-center justify-between px-3.5 py-3"
            style={{ backgroundColor: colors.page, borderBottomWidth: 1, borderColor: colors.borderSoft }}>
            <AppText variant="label" style={{ color: colors.ink }}>
              Items
            </AppText>
            <AppText variant="caption" style={{ color: colors.muted }}>
              {items.length} item{items.length > 1 ? 's' : ''}
            </AppText>
          </View>
          {items.map((item, i) => (
            <View
              key={item.itemId ?? i}
              className="flex-row items-center justify-between px-3.5 py-3"
              style={{ borderBottomWidth: i === items.length - 1 ? 0 : 1, borderColor: colors.borderSoft }}>
              <View className="min-w-0 flex-1">
                <AppText variant="body" style={{ color: colors.ink }} numberOfLines={1}>
                  {item.itemName}
                </AppText>
                <AppText variant="caption" style={{ color: colors.muted }}>
                  {formatINR(item.itemPrice)} × {item.count}
                </AppText>
              </View>
              <AppText variant="label" style={{ color: colors.ink }}>
                {formatINR(item.itemPrice * item.count)}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      <View className="rounded-2xl p-4" style={[shadow.card, { backgroundColor: colors.card }]}>
        <AppText variant="label" style={{ color: colors.ink, marginBottom: 10 }}>
          Bill details
        </AppText>
        <BillRow label="Item total" value={formatINR(order.itemAmount)} />
        <BillRow label="Delivery" value={order.fulfillmentMode === 'pickup' ? 'Self-pickup' : formatINR(order.deliveryCharges)} />
        {order.packagingCharges ? <BillRow label="Packaging" value={formatINR(order.packagingCharges)} /> : null}
        {order.platformCharges ? <BillRow label="Platform fee" value={formatINR(order.platformCharges)} /> : null}
        {/* Product instruction, 2026-09-02 — "show all details for that
            order which comes from API": coupon/voucher/extra discounts used
            to all collapse into the one generic `discount` row, with no way
            to see WHICH code was actually applied or how much IT
            contributed versus a plain discount. Each shown as its own row
            now, same as `discount` itself. */}
        {order.discount ? <BillRow label="Discount" value={`-${formatINR(order.discount)}`} /> : null}
        {order.couponDiscount ? <BillRow label={order.couponCode ? `Coupon · ${order.couponCode}` : 'Coupon'} value={`-${formatINR(order.couponDiscount)}`} /> : null}
        {order.voucherDiscount ? <BillRow label={order.voucherCode ? `Voucher · ${order.voucherCode}` : 'Voucher'} value={`-${formatINR(order.voucherDiscount)}`} /> : null}
        {order.extraDiscount ? <BillRow label="Extra discount" value={`-${formatINR(order.extraDiscount)}`} /> : null}
        {/* GST breakup — same "GST (govt. taxes), tap to see the breakup"
            convention apartment-cart.tsx's own pre-placement Bill Details
            already uses, now showing the REAL, PERSISTED figures this order
            was actually charged (not an estimate). Absent entirely (not a
            padded "₹0" row) for an order placed before this feature existed,
            or for Bulk (never eligible either way). */}
        {gstTotal > 0 ? (
          <>
            <Pressable onPress={() => setGstBreakupOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: gstBreakupOpen }} className="active:opacity-70">
              <View className="mb-2 flex-row items-center justify-between">
                <View className="flex-row items-center gap-1">
                  <AppText variant="caption" style={{ color: colors.mutedLine }}>
                    GST (govt. taxes)
                  </AppText>
                  {gstBreakupOpen ? <IconChevronUp size={12} color={colors.mutedLine} /> : <IconChevronDown size={12} color={colors.mutedLine} />}
                </View>
                <AppText variant="caption" style={{ color: colors.mutedLine }}>
                  {formatINR(gstTotal)}
                </AppText>
              </View>
            </Pressable>
            {gstBreakupOpen ? (
              <View style={{ gap: 2, paddingLeft: 12, marginTop: -4, marginBottom: 6 }}>
                {itemGst > 0 ? <BillRow label="Item GST (CGST + SGST)" value={formatINR(itemGst)} /> : null}
                {order.deliveryChargesGST ? <BillRow label="Delivery GST" value={formatINR(order.deliveryChargesGST)} /> : null}
                {order.platformChargesGST ? <BillRow label="Platform charge GST" value={formatINR(order.platformChargesGST)} /> : null}
                {order.packagingChargesGST ? <BillRow label="Packaging charge GST" value={formatINR(order.packagingChargesGST)} /> : null}
              </View>
            ) : null}
          </>
        ) : null}
        {order.mealaweWalletPointsUsed ? <BillRow label="Cashback credit" value={`-${formatINR(order.mealaweWalletPointsUsed)}`} /> : null}
        {order.moneyWalletPointsUsed ? <BillRow label="Wallet credit" value={`-${formatINR(order.moneyWalletPointsUsed)}`} /> : null}
        <View className="my-2.5 border-t border-dashed" style={{ borderColor: colors.border }} />
        <View className="flex-row items-center justify-between">
          <AppText variant="label" style={{ color: colors.ink }}>
            Paid
          </AppText>
          <AppText variant="label" style={{ color: colors.ink }}>
            {formatINR(order.payableAmount)}
          </AppText>
        </View>
      </View>

      {/* Product instruction (2026-08-27): the OTP-based delivery
          confirmation this replaces is gone everywhere (server, Kitchen
          Partner app, and here) — this is now the ONLY way a Today/Instant
          delivery order reaches 'delivered'. Visible only once the kitchen
          has actually marked the order ready — a resident can't jump ahead
          of the kitchen's own progress (the server re-checks this too). */}
      {order.orderstatus === 'readyToDelivery' ? (
        <MarkCompleteButton order={order} customerId={profile?._id} onOrderUpdated={onOrderUpdated} />
      ) : null}
    </ScrollView>
  );
}

function MarkCompleteButton({
  order,
  customerId,
  onOrderUpdated,
}: {
  order: ApartmentOrder;
  customerId: string | undefined;
  onOrderUpdated: (order: ApartmentOrder) => void;
}) {
  const { colors } = useApartmentColors();
  const [marking, setMarking] = useState(false);

  async function markComplete(): Promise<void> {
    if (!customerId || marking) return;
    setMarking(true);
    try {
      const updated = await markApartmentOrderDelivered(order._id, customerId);
      onOrderUpdated(updated);
    } catch (error) {
      const parsed = parseApartmentOrderError(error);
      Alert.alert('Could not mark order complete', parsed.message);
    } finally {
      setMarking(false);
    }
  }

  return (
    <Pressable
      onPress={markComplete}
      disabled={marking}
      accessibilityRole="button"
      accessibilityLabel="Mark order complete"
      className="flex-row items-center justify-center gap-2 rounded-2xl p-4 active:opacity-90"
      style={[shadow.card, { backgroundColor: colors.green, opacity: marking ? 0.7 : 1 }]}>
      {marking ? <ActivityIndicator size="small" color="#fff" /> : <IconCheck size={17} color="#fff" strokeWidth={3} />}
      <AppText variant="label" style={{ color: '#fff' }}>
        {marking ? 'Marking complete…' : 'Mark complete'}
      </AppText>
    </Pressable>
  );
}

function BillRow({ label, value }: { label: string; value: string }) {
  const { colors } = useApartmentColors();
  return (
    <View className="mb-2 flex-row items-center justify-between">
      <AppText variant="caption" style={{ color: colors.mutedLine }}>
        {label}
      </AppText>
      <AppText variant="caption" style={{ color: colors.mutedLine }}>
        {value}
      </AppText>
    </View>
  );
}

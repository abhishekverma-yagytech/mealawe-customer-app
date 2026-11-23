import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ComponentType } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { BillRow } from '@/components/ui/BillRow';
import { Button } from '@/components/ui/Button';
import {
  IconCheckCircle,
  IconChevronRight,
  IconComplaint,
  IconDelivery,
  IconReceipt,
  type IconProps,
} from '@/components/ui/icons';
import { loadOrderDetail } from '@/features/orders';
import { noteOrderPlacedAsync } from '@/features/reviews';
import { formatShort } from '@/features/subscription';
import { useScreenTracking } from '@/services/netcore';
import type { PaymentStatus } from '@/services/payment';
import { palette, type AccentTone } from '@/theme';

const COPY: Record<PaymentStatus, { title: string; message: string }> = {
  success: {
    title: 'Order placed!',
    message: "You're all set — we'll start preparing your order.",
  },
  failed: {
    title: 'Payment failed',
    message:
      "That didn't go through. Your cart is untouched, so you can try again. If any money was deducted, it'll be refunded within 4-5 business days.",
  },
};

/** Overrides `COPY.failed` when `payWithJusPay` resolved 'failed' because
 * the session token had expired, not because a payment was actually
 * attempted and declined — see `PaymentResult.reason`. */
const AUTH_EXPIRED_COPY = {
  title: 'Session expired',
  message: 'Your session expired before this could go through — no payment was made. Please log in again and retry.',
};

/** Order-Mode CTA Rule: Bulk/On-Demand success screens use their own tab
 * accent instead of green; Subscription (mode absent) keeps the veg-green
 * check it's always had — `palette.accent.veg` and `palette.brand.green` are
 * the same hex, so omitting `mode` here is visually a no-op for it. */
const ORDER_MODE_TONE: Partial<Record<string, AccentTone>> = {
  bulk: 'plan',
  ondemand: 'info',
  dinein: 'food',
};

/** First-delivery date/meal/address for a just-placed subscription order —
 * resolved via `loadOrderDetail` (the same re-fetch-by-id hook `order-detail.tsx`
 * uses), never fabricated. Stays `null` until the fetch resolves, or forever if
 * the order genuinely has no usable date yet — the FIRST DELIVERY row below is
 * omitted rather than showing a placeholder. */
interface FirstDeliveryInfo {
  dateIso: string;
  mealWord: string;
  address: string;
}

/** Subscription-only "what you can do any time" entry point. Opens
 * `/manage-subscription` for this exact order, which is also where
 * reschedule and delivery-address changes now live (per-child-order, not a
 * generic package-wide action) rather than being separate rows here. */
const SUBSCRIPTION_ACTIONS: {
  icon: ComponentType<IconProps>;
  tone: AccentTone;
  label: string;
  sub: string;
}[] = [
  {
    icon: IconReceipt,
    tone: 'plan',
    label: 'View bill & invoice',
    sub: 'See a full billing breakdown and download it anytime.',
  },
];

/**
 * Shared landing screen for every JusPay checkout outcome (Subscription/Dine
 * In/On-Demand/Bulk all route here — see `payWithJusPay`'s `PaymentResult`).
 * `payWithJusPay` now resolves a definitive `success`/`failed` before this
 * screen is even navigated to (matching the Ionic reference app's
 * single-call, no-retry model) — there's no polling, no "confirming your
 * payment" holding state here anymore. The final UI renders immediately.
 */
export default function OrderResultScreen() {
  const router = useRouter();
  const {
    status: rawStatus,
    reason,
    foodOrderId,
    mode,
    recapTitle,
    recapAmount,
    recapDays,
  } = useLocalSearchParams<{
    status?: string;
    reason?: string;
    foodOrderId?: string;
    mode?: string;
    recapTitle?: string;
    recapAmount?: string;
    recapDays?: string;
  }>();
  // `payWithJusPay`'s `PaymentStatus` is only ever 'success'/'failed' — this
  // fallback is route-param type safety (params are always optional strings
  // to Expo Router), not a real third state this screen renders differently.
  const status: PaymentStatus = rawStatus === 'success' ? 'success' : 'failed';
  useScreenTracking(`order_result_${status}`);
  const successTone: AccentTone = (mode && ORDER_MODE_TONE[mode]) || 'veg';

  // Subscription-detection convention already established by the Order-Mode
  // CTA Rule above: Bulk/On-Demand pass an explicit `mode`, and Dine In is
  // meant to (`ORDER_MODE_TONE.dinein`) — Subscription is the one order type
  // that never does, so `mode`'s absence is exactly "this is a subscription
  // order" (see the `cart.tsx` fix accompanying this change, which now sends
  // `mode: 'dinein'` for dine-in bookings so this check is actually accurate
  // at runtime, not just in comments).
  const isSubscription = !mode;

  const [firstDelivery, setFirstDelivery] = useState<FirstDeliveryInfo | null>(null);

  // Feed the store-review prompt counter — fires (subject to its own
  // min-order-count + cooldown throttle) the moment an order is confirmed
  // placed, across every order type this screen serves.
  useEffect(() => {
    if (status !== 'success' || !foodOrderId) {
      return;
    }
    void noteOrderPlacedAsync(foodOrderId);
  }, [status, foodOrderId]);

  // FIRST DELIVERY row's data — this screen only ever receives `status` /
  // `foodOrderId` / `mode` as route params (see the destructure above), none
  // of which carry a delivery date or address. Re-fetch the order by id, the
  // same way `order-detail.tsx` refreshes after a payment check, instead of
  // inventing a placeholder date.
  useEffect(() => {
    if (!isSubscription || status !== 'success' || !foodOrderId) {
      return;
    }
    let cancelled = false;
    loadOrderDetail(foodOrderId).then((detail) => {
      if (cancelled || !detail) {
        return;
      }
      const raw = detail.raw as Record<string, any>;
      const dates: string[] = Array.isArray(raw.userSelectedDates) ? raw.userSelectedDates : [];
      const dateIso: string | undefined =
        dates[0] ?? (typeof raw.subscriptionStartDate === 'string' ? raw.subscriptionStartDate : detail.date);
      if (!dateIso) {
        return;
      }
      const mealWord = [raw.mealTimeLunch ? 'Lunch' : null, raw.mealTimeDinner ? 'Dinner' : null]
        .filter(Boolean)
        .join(' + ');
      const address: string = raw.customerLocation?.location || raw.customerLocation?.address || '';
      setFirstDelivery({ dateIso, mealWord, address });
    });
    return () => {
      cancelled = true;
    };
  }, [isSubscription, status, foodOrderId]);

  const copy = status === 'failed' && reason === 'auth-expired' ? AUTH_EXPIRED_COPY : COPY[status];
  const showSubscriptionExtras = isSubscription && status === 'success';

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="auto" />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 32,
          paddingVertical: 32,
        }}>
        {status === 'success' ? (
          <AccentIcon icon={IconCheckCircle} tone={successTone} size={40} tileSize={84} />
        ) : (
          <AccentIcon icon={IconComplaint} tone="nonveg" size={40} tileSize={84} />
        )}

        <AppText variant="h2" className="mt-5 text-center text-foreground">
          {copy.title}
        </AppText>
        <AppText variant="body" className="mt-2 text-center text-muted-foreground">
          {copy.message}
        </AppText>

        {/* Order recap — what was actually bought, for every order type on
            success (not just subscriptions, unlike FIRST DELIVERY below). */}
        {status === 'success' && recapTitle && recapAmount ? (
          <View className="mt-4 w-full rounded-2xl border border-border bg-card p-4">
            <AppText variant="title" className="text-foreground">
              {recapTitle}
            </AppText>
            {recapDays ? (
              <AppText variant="caption" className="text-muted-foreground">
                {recapDays} days
              </AppText>
            ) : null}
            <View className="mt-3">
              <BillRow label="Amount paid" amount={Number(recapAmount)} />
            </View>
          </View>
        ) : null}

        {/* Subscription-only reassurance banner — soft, no strong color, just
            a quiet pointer to where this order lives from now on. */}
        {showSubscriptionExtras ? (
          <View
            className="mt-4 w-full flex-row items-center justify-center rounded-full bg-muted px-4 py-2"
            style={{ gap: 6 }}>
            <IconCheckCircle size={14} color={palette.accent.veg} />
            <AppText variant="caption" className="text-center text-muted-foreground">
              Subscription orders live in My Orders, with per-item status.
            </AppText>
          </View>
        ) : null}

        {/* FIRST DELIVERY — only renders once the real date/address resolves
            from `loadOrderDetail`; omitted entirely otherwise (see the effect
            above), never a placeholder. */}
        {showSubscriptionExtras && firstDelivery ? (
          <View className="mt-4 w-full flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <AccentIcon icon={IconDelivery} tone="info" size={18} tileSize={40} />
            <View className="flex-1">
              <AppText variant="overline" className="text-muted-foreground">
                FIRST DELIVERY
              </AppText>
              <AppText variant="body" className="text-foreground">
                {formatShort(firstDelivery.dateIso.slice(0, 10))}
                {firstDelivery.mealWord ? ` · ${firstDelivery.mealWord}` : ''}
              </AppText>
              {firstDelivery.address ? (
                <AppText variant="caption" className="text-muted-foreground" numberOfLines={2}>
                  {firstDelivery.address}
                </AppText>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* "What you can do any time" — every row opens the real
            manage-subscription screen for this exact order. */}
        {showSubscriptionExtras ? (
          <View className="mt-6 w-full" style={{ gap: 10 }}>
            <AppText variant="overline" className="text-muted-foreground">
              WHAT YOU CAN DO ANY TIME
            </AppText>
            {SUBSCRIPTION_ACTIONS.map((action) => (
              <SubscriptionActionRow
                key={action.label}
                icon={action.icon}
                tone={action.tone}
                label={action.label}
                sub={action.sub}
                onPress={() => router.push({ pathname: '/manage-subscription', params: { orderId: foodOrderId } })}
              />
            ))}
          </View>
        ) : null}

        <View className="mt-8 w-full" style={{ gap: 10 }}>
          {status === 'failed' ? (
            <Button label="Try again" block onPress={() => router.back()} />
          ) : isSubscription ? (
            <>
              <Button
                label="Manage subscription"
                block
                onPress={() =>
                  router.replace({ pathname: '/manage-subscription', params: { orderId: foodOrderId } })
                }
              />
              <Button label="Home" variant="outline" block onPress={() => router.replace('/(tabs)')} />
            </>
          ) : (
            <>
              <Button
                label="View my orders"
                block
                tone={successTone === 'veg' ? undefined : successTone}
                onPress={() => router.replace('/my-orders')}
              />
              <Button
                label="Back to home"
                variant="outline"
                block
                onPress={() => router.replace('/(tabs)')}
              />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** One tappable row in the "what you can do any time" list — icon tile +
 * label + sub-copy + chevron, all opening `/manage-subscription`. */
function SubscriptionActionRow({
  icon: Icon,
  tone,
  label,
  sub,
  onPress,
}: {
  icon: ComponentType<IconProps>;
  tone: AccentTone;
  label: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3 active:opacity-70">
      <AccentIcon icon={Icon} tone={tone} size={17} tileSize={38} />
      <View className="flex-1">
        <AppText variant="label" className="text-foreground">
          {label}
        </AppText>
        <AppText variant="caption" className="text-muted-foreground">
          {sub}
        </AppText>
      </View>
      <IconChevronRight size={18} color={palette.neutral.gray600} />
    </Pressable>
  );
}

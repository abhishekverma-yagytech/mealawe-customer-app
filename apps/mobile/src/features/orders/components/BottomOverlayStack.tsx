import { useEffect, useRef, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import {
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { IconArrowRight, IconChevronRight } from '@/components/ui/icons';
import { useHomeNavBarClearance } from '@/features/home/homeNavBarStore';
import { normalizeLatLng, useTrackingTargetStore } from '@/features/tracking';
import { palette, accentTint, shadow } from '@/theme';

import { useBottomCtaStore, type BottomCtaSlide } from '../bottomCtaStore';
import { statusGroup, statusLabel, statusTone } from '../orderStatus';
import { useOrderStore } from '../orderStore';
import type { OrderSummary } from '../types';
import { useOpenOrders } from '../useOpenOrders';

/** Height of a single slide card — used by feeds to reserve scroll bottom padding. */
export const BOTTOM_STACK_SLIDE_HEIGHT = 60;
/** Sits just below `HomeBottomNav` in paint order — if a clearance calc is
 * ever briefly stale, the nav bar (primary navigation) stays fully visible
 * and tappable rather than the two silently clipping each other. */
const OVERLAY_STACK_Z_INDEX = 10;

/** Total space (beyond `insets.bottom`) a feed's scroll content should
 * reserve to clear the nav bar AND this stack, whether or not either is
 * currently showing anything — matches deskdyneApp's always-reserve approach
 * rather than conditionally resizing padding per state. Derived from the nav
 * bar's live measured height, not a hardcoded guess (see `homeNavBarStore`). */
export function useBottomStackClearance(): number {
  const navBarClearance = useHomeNavBarClearance();
  return navBarClearance + BOTTOM_STACK_SLIDE_HEIGHT + 16;
}

/** Friendly labels for `FoodOrder.orderType` (see the model's enum) — this
 * stack only ever lists actual per-day FoodOrder docs, never a subscription/
 * package parent (`useOpenOrders`'s `isChildOrder` filters those out — the
 * open-orders endpoint itself does merge in same-day parent docs
 * server-side, despite its name), so "Order #N · <type>" reads consistently
 * across every order kind instead of the kitchen/package name `mapOrder`
 * shows in list screens. */
const ORDER_TYPE_LABEL: Record<string, string> = {
  subscription: 'Subscription',
  daily: 'On Demand',
  allDay: 'On Demand',
  advance: 'On Demand',
  dineIn: 'Dine In',
  oyo: 'Oyo',
  apartment_today: 'Apartment',
  apartment_advance: 'Apartment',
  delivery: 'Delivery',
};

function orderLabel(order: OrderSummary): { title: string; subtitle: string } {
  const type = order.orderType ? ORDER_TYPE_LABEL[order.orderType] ?? order.orderType : '';
  return { title: order.orderNo ? `Order #${order.orderNo}` : 'Order', subtitle: type };
}

type Slide = { kind: 'order'; order: OrderSummary } | { kind: 'cta'; cta: BottomCtaSlide };

/**
 * Bug fix (root cause of an intermittent Fabric crash —
 * `IllegalStateException: addViewAt: failed to insert view ... at index 1` /
 * `IndexOutOfBoundsException`): `slides` used to be keyed by its own array
 * INDEX (`key={i}`), while its own composition reorders/resizes on almost
 * every render this stack cares about — a CTA slide can appear/disappear at
 * index 0, and `orders` can grow/shrink/reorder independently. Index-as-key
 * tells React "the thing at position N is still the same logical item,"
 * which is false the moment a slide is inserted/removed/reordered anywhere
 * before it — Fabric then tries to reconcile that same identity into a child
 * list whose actual view count already changed underneath it. Each slide now
 * carries an identity that's stable across renders regardless of its
 * position: the underlying order's own id for 'order' ('cta' has no such id
 * of its own, but there's only ever one CTA slide at a time, so a fixed
 * literal is equally stable).
 */
function slideKey(slide: Slide): string {
  switch (slide.kind) {
    case 'order':
      return `order:${slide.order.id}`;
    case 'cta':
      return 'cta';
  }
}

/**
 * Fixed bottom overlay combining today's open orders with the active tab's
 * sticky CTA (Subscribe / Continue) into ONE swipeable card slot, instead of
 * two separately stacked bars — ported from deskdyneApp's
 * `bottom-overlay-stack` + `app-track-open-order` (see `track-open-order.component.ts`'s
 * `combinedSlides`). Capped at 3 order slides, same as the reference. Sits
 * directly above `HomeBottomNav`.
 */
export function BottomOverlayStack() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const navBarClearance = useHomeNavBarClearance();
  const { width: windowWidth } = useWindowDimensions();
  const orders = useOpenOrders();
  const activeOwnerKey = useBottomCtaStore((s) => s.activeOwnerKey);
  const cta = useBottomCtaStore((s) => (activeOwnerKey ? s.slides[activeOwnerKey] : null));
  const selectOrder = useOrderStore((s) => s.select);
  const setTrackingTarget = useTrackingTargetStore((s) => s.setTarget);
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const slides: Slide[] = [
    ...orders.slice(0, 3).map((order): Slide => ({ kind: 'order', order })),
    ...(cta ? [{ kind: 'cta', cta } as Slide] : []),
  ];

  // If the slide count shrinks (an order gets delivered, or the CTA clears)
  // while sitting on a now-out-of-range page, snap back to the first slide.
  useEffect(() => {
    if (index >= slides.length && slides.length > 0) {
      setIndex(0);
      scrollRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [slides.length, index]);

  if (slides.length === 0) {
    return null;
  }

  function openOrder(order: OrderSummary): void {
    const raw = order.raw as Record<string, any>;
    const runnerLocation = normalizeLatLng(raw.runner?.location ?? raw.runnerLocation);
    const destination = normalizeLatLng(raw.customerLocation?.geolocation ?? raw.customerLocation?.location);
    const trackable =
      !!runnerLocation && !!destination && statusGroup(order.status) !== 'cancelled' && order.status !== 'delivered';
    if (trackable && destination) {
      setTrackingTarget({
        params: {
          orderId: order.id,
          shiftId: (raw.shiftId as string | null) ?? null,
          deliveryTaskId: (raw.deliveryTaskId as string | null) ?? null,
          deliveryVendor: (raw.deliveryVendor as string | null) ?? null,
          destination,
          initialRunnerLocation: runnerLocation,
        },
        runnerName: (raw.runner?.name as string | undefined) ?? null,
        runnerPhone: (raw.runner?.phone_number as string | undefined) ?? null,
      });
      router.push('/order-tracking' as Href);
    } else {
      selectOrder(order);
      router.push('/order-detail' as Href);
    }
  }

  function onMomentumScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>): void {
    const pageWidth = e.nativeEvent.layoutMeasurement.width || windowWidth - 32;
    setIndex(Math.round(e.nativeEvent.contentOffset.x / pageWidth));
  }

  return (
    <View
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: insets.bottom + navBarClearance,
        zIndex: OVERLAY_STACK_Z_INDEX,
      }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}>
        {slides.map((slide) => (
          <View key={slideKey(slide)} style={{ width: windowWidth - 32 }}>
            {slide.kind === 'order' ? (
              <OrderSlideCard order={slide.order} onPress={() => openOrder(slide.order)} />
            ) : (
              <CtaSlideCard cta={slide.cta} />
            )}
          </View>
        ))}
      </ScrollView>

      {slides.length > 1 ? (
        <View className="mt-1 flex-row items-center justify-center gap-0.5">
          {slides.map((_, i) => (
            <View
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === index ? palette.brand.green : 'rgba(0,0,0,0.15)',
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function OrderSlideCard({ order, onPress }: { order: OrderSummary; onPress: () => void }) {
  const toneColor = palette.accent[statusTone(order.status)];
  const label = orderLabel(order);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={shadow.card}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 active:opacity-90">
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: toneColor, flexShrink: 0 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="label" className="text-foreground" numberOfLines={1}>
          {label.title}
          {label.subtitle ? ` · ${label.subtitle}` : ''}
        </AppText>
        <AppText variant="caption" numberOfLines={1} style={{ color: toneColor }}>
          {statusLabel(order.status)}
        </AppText>
      </View>
      <View
        className="flex-row items-center gap-1 rounded-full px-2.5 py-1"
        style={{ backgroundColor: accentTint(palette.brand.green, 0.1), flexShrink: 0 }}>
        <AppText variant="caption" className="text-primary" numberOfLines={1}>
          Track
        </AppText>
        <IconChevronRight size={14} color={palette.brand.green} />
      </View>
    </Pressable>
  );
}

function CtaSlideCard({ cta }: { cta: BottomCtaSlide }) {
  const bgColor = cta.tone ? palette.accent[cta.tone] : palette.brand.green;
  return (
    <View style={[shadow.card, { backgroundColor: bgColor }]} className="flex-row items-center justify-between rounded-2xl px-4 py-3">
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="h3" className="text-white" numberOfLines={1}>
          {cta.priceLabel}
        </AppText>
        <AppText variant="caption" className="text-white" style={{ opacity: 0.9 }} numberOfLines={1}>
          {cta.subtitle}
        </AppText>
      </View>
      <Pressable
        onPress={cta.onPress}
        accessibilityRole="button"
        className="flex-row items-center gap-2 rounded-2xl bg-white px-6 py-3 active:opacity-90">
        <AppText variant="label" style={{ color: bgColor }}>
          {cta.buttonLabel}
        </AppText>
        <IconArrowRight size={18} color={bgColor} />
      </Pressable>
    </View>
  );
}

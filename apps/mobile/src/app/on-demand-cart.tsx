import { Stack, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import {
  IconArrowLeft,
  IconChevronRight,
  IconCoins,
  IconPlus,
  IconReceipt,
  IconUtensils,
  IconWallet,
  type IconProps,
} from '@/components/ui/icons';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { Toggle } from '@/components/ui/Toggle';
import {
  advanceDates,
  advanceSlotsFor,
  allDaySlotsFor,
  buildOnDemandBill,
  chargesFromOnDemandConfig,
  formatShort,
  kitchenDiscountFor,
  loadOnDemandCoupons,
  loadOrderingWindows,
  maxRedeemableCashback,
  OnDemandBillSummarySheet,
  OnDemandSlotPicker,
  useOnDemandCartStore,
  type OnDemandBillCharges,
  type OrderingWindows,
  type TimeSlot,
} from '@/features/on-demand';
import { requireLogin } from '@/features/auth';
import {
  CouponSheet,
  SavingsBanner,
  CouponCelebration,
  discountFor,
  useEmptyCartHomeBack,
  validateCouponForUser,
} from '@/features/cart';
import { clusterApi } from '@/features/location/clusterApi';
import { hasSavedAddress } from '@/features/location';
import type { SubscriptionCoupon } from '@/features/subscription';
import { useAuthStore, useClusterStore, useLocationStore } from '@/store';
import { useBalances } from '@/features/wallet';
import {
  customerLocationFrom,
  payWithJusPay,
  type OnDemandOrderBody,
} from '@/services/payment';
import { ENDPOINTS } from '@/services/http';
import { trackProceedToCheckout, trackPurchase, trackPurchaseFailed, useScreenTracking } from '@/services/netcore';
import { accentTint, palette, shadow, SPACING, useColors } from '@/theme';

export default function OnDemandCartScreen() {
  useScreenTracking('ondemand_cart');

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const cart = useOnDemandCartStore((s) => s.cart);
  const goHomeFromEmptyCart = useEmptyCartHomeBack(cart.lines.length === 0, 'ondemand');
  const setCount = useOnDemandCartStore((s) => s.setCount);
  const profile = useAuthStore((s) => s.profile);
  const address = useLocationStore((s) => s.current);
  const savedAddresses = useLocationStore((s) => s.saved);
  const { wallet, cashback, refresh } = useBalances();

  const [windows, setWindows] = useState<OrderingWindows | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<TimeSlot | null>(null);
  const [useWallet, setUseWallet] = useState(false);
  const [useCashback, setUseCashback] = useState(false);
  const [charges, setCharges] = useState<OnDemandBillCharges | undefined>(undefined);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    loadOrderingWindows().then(setWindows);
  }, []);

  const applyCoupon = useOnDemandCartStore((s) => s.applyCoupon);
  const clearCoupon = useOnDemandCartStore((s) => s.clearCoupon);

  const [coupons, setCoupons] = useState<SubscriptionCoupon[]>([]);
  const [code, setCode] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponPulse, setCouponPulse] = useState(0);
  const [celebrated, setCelebrated] = useState({ code: '', saving: 0 });
  const couponSheetRef = useRef<BottomSheetModal>(null);
  const billSheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    if (!cart.mode) return;
    loadOnDemandCoupons(cart.mode).then(setCoupons).catch(() => setCoupons([]));
  }, [cart.mode]);

  const dateOptions = useMemo(() => advanceDates(), []);
  const slots = useMemo(() => {
    if (!windows || !cart.mode) return [];
    return cart.mode === 'advance' ? advanceSlotsFor(windows) : allDaySlotsFor(windows, cart.kitchen?.preparationTime ?? 0);
  }, [windows, cart.mode, cart.kitchen]);

  // Advance mode needs a date pinned before slots make sense; default to the
  // first offered date once it's known.
  useEffect(() => {
    if (cart.mode === 'advance' && !date && dateOptions.length) {
      setDate(dateOptions[0]);
    }
  }, [cart.mode, date, dateOptions]);

  // Default to the first available delivery slot once the window resolves —
  // most orders take the earliest slot anyway, and requiring an explicit tap
  // on every visit was pure friction. Only fills in when nothing's picked yet
  // (never overrides a slot the user already chose), and re-fires if `slots`
  // changes shape (e.g. switching kitchens/mode) while none is selected.
  useEffect(() => {
    if (!slot && slots.length) {
      setSlot(slots[0]);
    }
  }, [slot, slots]);

  useEffect(() => {
    const configName = useClusterStore.getState().currentConfigName();
    if (!configName) return;
    clusterApi
      .searchClusterVariable(configName)
      .then((cfg) => setCharges(chargesFromOnDemandConfig(cfg)))
      .catch(() => {
        // charges stays undefined — buildOnDemandBill's default param covers this
      });
  }, []);

  const walletBalance = Number.parseFloat(wallet) || 0;
  const cashbackBalance = cashback || 0;

  const kitchenDiscount = useMemo(
    () =>
      kitchenDiscountFor(
        cart.kitchen?.discountOffer,
        cart.lines.reduce((sum, l) => sum + l.item.itemPrice * l.count, 0),
      ),
    [cart.kitchen, cart.lines],
  );

  // How much cashback the customer's redeem cap allows on this order — a
  // percentage of their *balance*, tiered by order size (both admin-config,
  // see `maxRedeemableCashback`'s own comment). Computed against the bill
  // *before* any wallet/cashback discount (mirrors the Ionic reference's
  // `itemPriceAfterDiscount` gate), so toggling cashback on doesn't move its
  // own eligibility threshold underneath itself.
  const grossBeforeWallet = useMemo(
    () =>
      buildOnDemandBill(
        cart.lines,
        kitchenDiscount,
        charges,
        cart.coupon?.itemDiscount ?? 0,
        cart.coupon?.deliveryDiscount ?? 0,
        0,
        0,
      ).toPay,
    [cart.lines, kitchenDiscount, charges, cart.coupon],
  );
  const [maxCashback, setMaxCashback] = useState(0);
  useEffect(() => {
    let active = true;
    maxRedeemableCashback(cashbackBalance, grossBeforeWallet).then((max) => {
      if (active) setMaxCashback(max);
    });
    return () => {
      active = false;
    };
  }, [cashbackBalance, grossBeforeWallet]);

  // Coupons are eligible/priced against the amount *after* the kitchen's own
  // promotional discount, not the raw item subtotal — mirrors the Ionic
  // reference's `amtBeforeDiscount = mealaweTotalAmt - mealaweKitchenDiscount`
  // (tabCart.page.ts). Using the raw subtotal could let a coupon's `minAmount`
  // pass (or its percentage compute too high) against an amount the kitchen
  // discount had already reduced.
  const bill = useMemo(
    () =>
      buildOnDemandBill(
        cart.lines,
        kitchenDiscount,
        charges,
        cart.coupon?.itemDiscount ?? 0,
        cart.coupon?.deliveryDiscount ?? 0,
        useCashback ? Math.min(cashbackBalance, maxCashback) : 0,
        useWallet ? walletBalance : 0,
      ),
    [cart.lines, kitchenDiscount, charges, cart.coupon, useCashback, useWallet, cashbackBalance, walletBalance, maxCashback],
  );
  const couponEligibleSubTotal = Math.max(0, bill.subTotal - kitchenDiscount);

  const bestCoupon = useMemo(() => {
    const ctx = { itemSubTotal: couponEligibleSubTotal, deliveryCharge: bill.delivery, taxes: bill.taxes };
    let best: { coupon: SubscriptionCoupon; itemDiscount: number; deliveryDiscount: number; discount: number } | null =
      null;
    for (const c of coupons) {
      const { itemDiscount, deliveryDiscount, reason } = discountFor(c, ctx);
      const discount = itemDiscount + deliveryDiscount;
      if (!reason && discount > (best?.discount ?? 0)) {
        best = { coupon: c, itemDiscount, deliveryDiscount, discount };
      }
    }
    return best;
  }, [coupons, couponEligibleSubTotal, bill.delivery, bill.taxes]);

  const celebrate = (couponCode: string, saving: number): void => {
    setCelebrated({ code: couponCode, saving });
    setCouponPulse((n) => n + 1);
  };

  // Coupon and cashback are mutually exclusive here, matching the Ionic
  // reference (`tabCart.page.ts`: applying a coupon calls `removeMealaweWallet()`;
  // enabling cashback while a coupon is applied removes it) — money-wallet
  // use is unaffected, only cashback vs. coupon conflict.
  const confirmAndApplyCoupon = async (
    couponCode: string,
    couponHeader: string | undefined,
    itemDiscount: number,
    deliveryDiscount: number,
  ): Promise<boolean> => {
    if (applyingCoupon) return false;
    setApplyingCoupon(true);
    setCouponError(null);
    try {
      const { valid, message } = await validateCouponForUser(couponCode, profile?._id);
      if (!valid) {
        setCouponError(message ?? 'This coupon can no longer be used.');
        return false;
      }
      setUseCashback(false);
      applyCoupon({
        couponCode,
        discount: itemDiscount + deliveryDiscount,
        itemDiscount,
        deliveryDiscount,
        couponHeader,
      });
      celebrate(couponCode, itemDiscount + deliveryDiscount);
      return true;
    } finally {
      setApplyingCoupon(false);
    }
  };

  const applyByCode = async (): Promise<void> => {
    const found = coupons.find((c) => (c.couponCode ?? '').toLowerCase() === code.trim().toLowerCase());
    if (!found) {
      setCouponError('Invalid or expired coupon');
      return;
    }
    const { itemDiscount, deliveryDiscount, reason } = discountFor(found, {
      itemSubTotal: couponEligibleSubTotal,
      deliveryCharge: bill.delivery,
      taxes: bill.taxes,
    });
    if (reason) {
      setCouponError(reason);
      return;
    }
    await confirmAndApplyCoupon(found.couponCode ?? code, found.couponHeader, itemDiscount, deliveryDiscount);
  };

  const applyResolved = async (
    c: SubscriptionCoupon,
    itemDiscount: number,
    deliveryDiscount: number,
  ): Promise<void> => {
    const applied = await confirmAndApplyCoupon(c.couponCode ?? '', c.couponHeader, itemDiscount, deliveryDiscount);
    if (applied) {
      couponSheetRef.current?.dismiss();
    }
  };

  const toggleCashback = (): void => {
    setUseCashback((v) => {
      const next = !v;
      if (next && cart.coupon) clearCoupon();
      return next;
    });
  };

  const change = (itemId: string, delta: number): void => {
    const line = cart.lines.find((l) => l.item._id === itemId);
    if (!line || !cart.kitchen || !cart.mode) return;
    setCount(line.item, cart.kitchen, cart.mode, Math.max(0, line.count + delta));
  };

  const pay = async (): Promise<void> => {
    if (!requireLogin(router) || !profile || !cart.mode) return;
    if (!hasSavedAddress(address, savedAddresses)) {
      Alert.alert(
        'Select a saved address',
        "Please choose one of your saved addresses to continue — we can't deliver to an unsaved current location.",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Choose address', onPress: () => router.push('/addresses') },
        ],
      );
      return;
    }
    // Unreachable in practice — hasSavedAddress already guarantees a non-null
    // address above — but TypeScript can't narrow through that function call,
    // and `customerLocation` on OnDemandOrderBody is required (not optional
    // like the subscription cart's), so this keeps the type honest without
    // widening that shared type or asserting past a real invariant.
    if (!address) return;
    setPaying(true);
    const totals = {
      total_items: cart.lines.length,
      total_prqt: cart.lines.reduce((sum, l) => sum + l.count, 0),
      selling_amount: bill.toPay,
      discount_amt: bill.discount,
    };
    trackProceedToCheckout(cart.mode, totals);
    try {
      const body: OnDemandOrderBody = {
        orderType: cart.mode,
        amount: bill.toPay,
        orderDate: new Date().toISOString(),
        customerId: profile._id,
        customerName: profile.userName ?? '',
        customerEmail: profile.email ?? '',
        customerPhoneNo: profile.phoneNo,
        customerLocation: customerLocationFrom(address),
        kitchenId: cart.kitchen?._id,
        kitchenName: cart.kitchen?.kitchenName,
        itemList: cart.lines.map((l) => ({
          itemId: l.item._id,
          itemName: l.item.itemName,
          itemPrice: l.item.itemPrice,
          // No separate internal markup price tracked for on-demand items —
          // see `OnDemandItemForOrder.mealawePrice`'s own comment for why
          // this still has to be sent.
          mealawePrice: l.item.itemPrice,
          count: l.count,
        })),
        // On-demand has no per-item add-on concept — see
        // `OnDemandOrderBody.addOns`'s comment for why this still has to be
        // sent (an omitted `addOns` crashes the backend's validation).
        addOns: [],
        itemAmount: bill.subTotal,
        mealaweTotalAmt: bill.subTotal,
        slotStartTime: slot?.start,
        slotEndTime: slot?.end,
        orderComplitionDate: cart.mode === 'advance' ? (date ?? undefined) : undefined,
        discount: bill.discount,
        kitchenDiscount: bill.kitchenDiscount,
        taxes: bill.taxes,
        couponCode: cart.coupon?.couponCode,
        couponDiscount: cart.coupon?.discount,
        moneyWalletPointsUsed: bill.moneyWalletUsed,
        mealaweWalletPointsUsed: bill.cashbackUsed,
      };
      const result = await payWithJusPay(ENDPOINTS.juspay.startSubscription, body);
      const purchasePayload = {
        items: cart.lines.map((l) => ({
          prid: l.item._id,
          product_name: l.item.itemName,
          category_name: cart.kitchen?.kitchenName ?? '',
          product_price: l.item.itemPrice,
          prqt: l.count,
          image_url: l.item.itemImage,
        })),
        ...totals,
        amount: bill.toPay,
      };
      if (result.status !== 'failed') {
        trackPurchase(cart.mode, purchasePayload);
        useOnDemandCartStore.getState().reset();
      } else {
        trackPurchaseFailed(cart.mode, purchasePayload);
      }
      router.push({
        pathname: '/order-result',
        params: {
          status: result.status,
          orderType: result.orderType,
          foodOrderId: result.foodOrderId,
          ...(result.reason ? { reason: result.reason } : {}),
          mode: 'ondemand',
          recapTitle: cart.kitchen?.kitchenName ?? 'Mealawe',
          recapAmount: String(bill.toPay),
        },
      });
    } finally {
      setPaying(false);
    }
  };

  if (cart.lines.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Cart',
            // Back (header tap or Android hardware back) goes to the On
            // Demand home tab instead of wherever the user came from — see
            // `useEmptyCartHomeBack`. `gestureEnabled: false` blocks iOS's
            // swipe-back gesture the same way.
            gestureEnabled: false,
            headerLeft: () => (
              <Pressable
                onPress={goHomeFromEmptyCart}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Go back">
                <IconArrowLeft size={24} color={colors.foreground} />
              </Pressable>
            ),
          }}
        />
        <StatusBar style="auto" />
        <View className="flex-1 items-center justify-center px-10">
          <Image
            source={require('@/assets/images/cart/empty-cart-subscription.webp')}
            style={{ width: '80%', aspectRatio: 1 }}
            contentFit="contain"
          />
          <AppText variant="title" className="text-foreground" style={{ marginTop: 12 }}>
            Your cart is empty
          </AppText>
          <View style={{ marginTop: 16 }}>
            <Button
              label="Browse kitchens"
              onPress={() => router.replace({ pathname: '/(tabs)', params: { tab: 'ondemand' } })}
            />
          </View>
        </View>
      </View>
    );
  }

  const canCheckout = cart.mode === 'allDay' ? !!slot : !!date && !!slot;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Cart' }} />
      <StatusBar style="auto" />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24, gap: 14 }}>
        {bill.saving > 0 ? (
          <SavingsBanner
            saving={bill.saving}
            percent={bill.toPay + bill.saving > 0 ? Math.round((bill.saving / (bill.toPay + bill.saving)) * 100) : 0}
          />
        ) : null}

        {cart.kitchen ? (
          <View className="flex-row items-center justify-between">
            <AppText variant="label" className="text-foreground">
              {cart.kitchen.kitchenName}
            </AppText>
            {!cart.kitchen.clusterMenu ? (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/on-demand-kitchens',
                    params: { mode: cart.mode ?? 'allDay' },
                  } as Href)
                }
                accessibilityRole="button"
                className="active:opacity-70">
                <AppText variant="label" style={{ color: palette.accent.info }}>
                  Change
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* cart lines + their own "add something else" link — tighter
            internal gap than the outer stack since the link directly
            extends this same line list, unlike the genuinely distinct
            sections (slot picker, coupon, bill) that keep the outer gap. */}
        <View style={{ gap: SPACING.sm }}>
          {cart.lines.map((line) => (
            <View key={line.item._id} style={shadow.card} className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3">
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  overflow: 'hidden',
                  backgroundColor: accentTint(palette.accent.food, 0.14),
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                {line.item.itemImage ? (
                  <Image source={{ uri: line.item.itemImage }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : (
                  <IconUtensils size={20} color={palette.accent.food} />
                )}
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <AppText variant="label" className="flex-1 text-foreground">
                    {line.item.itemName}
                  </AppText>
                  <QuantityStepper
                    count={line.count}
                    onIncrease={() => change(line.item._id, 1)}
                    onDecrease={() => change(line.item._id, -1)}
                    decreaseLabel={`Decrease ${line.item.itemName} quantity`}
                    increaseLabel={`Increase ${line.item.itemName} quantity`}
                    tone="info"
                  />
                </View>
                <AppText variant="bodySm" className="mt-1 text-muted-foreground">
                  ₹{line.item.itemPrice} · ₹{line.item.itemPrice * line.count}
                </AppText>
                {/* Matches the Ionic reference's `preparationTime > 45` cart
                    notice — a heads-up for slow-to-cook items, not shown for
                    everything (most items are well under the threshold). */}
                {line.item.preparationTime && line.item.preparationTime > 45 ? (
                  <AppText variant="caption" style={{ color: palette.accent.offer, marginTop: 2 }}>
                    This item takes {line.item.preparationTime} mins to prepare
                  </AppText>
                ) : null}
              </View>
            </View>
          ))}

          {cart.kitchen ? (
            <Pressable
              onPress={() => {
                if (!cart.kitchen) return;
                if (cart.kitchen.clusterMenu) {
                  router.back();
                  return;
                }
                router.push({
                  pathname: '/on-demand-kitchen',
                  params: { kitchenId: cart.kitchen._id, mode: cart.mode ?? 'allDay' },
                } as Href);
              }}
              accessibilityRole="button"
              className="flex-row items-center gap-1.5 self-start active:opacity-70">
              <IconPlus size={16} color={palette.accent.info} />
              <AppText variant="label" style={{ color: palette.accent.info }}>
                Add something else
              </AppText>
            </Pressable>
          ) : null}
        </View>

        {cart.mode ? (
          <OnDemandSlotPicker
            mode={cart.mode}
            dateOptions={dateOptions}
            date={date}
            onSelectDate={setDate}
            slots={slots}
            slot={slot}
            onSelectSlot={setSlot}
          />
        ) : null}

        {coupons.length === 0 && !cart.coupon ? null : (
          <View style={shadow.card} className="rounded-2xl border border-border bg-card p-4">
            <CouponRow
              appliedCoupon={cart.coupon}
              bestCoupon={bestCoupon}
              code={code}
              onCodeChange={(t) => {
                setCode(t.toUpperCase());
                setCouponError(null);
              }}
              couponError={couponError}
              onApplyByCode={applyByCode}
              onApplyBest={() =>
                bestCoupon && applyResolved(bestCoupon.coupon, bestCoupon.itemDiscount, bestCoupon.deliveryDiscount)
              }
              onClear={clearCoupon}
              onOpenSheet={() => couponSheetRef.current?.present()}
              applyingCoupon={applyingCoupon}
            />
          </View>
        )}

        {walletBalance > 0 || cashbackBalance > 0 ? (
          <View className="rounded-2xl border border-border bg-card" style={[shadow.card, { overflow: 'hidden' }]}>
            {walletBalance > 0 ? (
              <RedeemRow
                icon={IconWallet}
                tone="reward"
                title="Use Mealawe Wallet"
                sub={useWallet && bill.moneyWalletUsed > 0 ? `Saving ₹${bill.moneyWalletUsed}` : `₹${wallet} available`}
                on={useWallet}
                onToggle={() => setUseWallet((v) => !v)}
                divider={cashbackBalance > 0}
              />
            ) : null}
            {cashbackBalance > 0 ? (
              <RedeemRow
                icon={IconCoins}
                tone="rating"
                title="Redeem Cashback"
                sub={useCashback && bill.cashbackUsed > 0 ? `Saving ₹${bill.cashbackUsed}` : `₹${cashbackBalance} available`}
                on={useCashback}
                onToggle={toggleCashback}
              />
            ) : null}
          </View>
        ) : null}

        {/* total bill — compact summary row, opens OnDemandBillSummarySheet.
            Same tap-to-expand pattern the Subscription and Bulk carts use,
            replacing the old inline expand/collapse card. */}
        <Pressable
          onPress={() => billSheetRef.current?.present()}
          accessibilityRole="button"
          className="rounded-2xl border border-border bg-card p-4 active:opacity-80"
          style={[shadow.card, { gap: 10 }]}>
          <View className="flex-row items-center gap-3">
            <AccentIcon icon={IconReceipt} tone="info" size={18} tileSize={36} />
            <View className="flex-1">
              <AppText variant="body" className="text-foreground">
                Total Bill : ₹{bill.toPay}
              </AppText>
              <AppText variant="caption" className="text-muted-foreground">
                Incl. taxes, delivery, &amp; packaging
              </AppText>
            </View>
            <IconChevronRight size={18} color={colors.mutedForeground} />
          </View>
          {bill.saving > 0 ? (
            // Universal savings green (not On Demand's own "info" accent) —
            // see OnDemandBillSummarySheet's matching comment.
            <View
              className="rounded-xl px-3 py-2"
              style={{ backgroundColor: accentTint(palette.accent.veg, 0.14) }}>
              <AppText variant="label" style={{ color: palette.accent.veg }}>
                You&apos;re saving ₹{bill.saving}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      </ScrollView>

      <View
        className="flex-row items-center justify-between border-t border-border bg-card px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}>
        <View>
          <AppText variant="h3" className="text-foreground">
            ₹{bill.toPay}
          </AppText>
          {!canCheckout ? (
            <AppText variant="caption" className="text-danger">
              Pick a delivery slot{cart.mode === 'advance' ? ' and date' : ''}
            </AppText>
          ) : null}
        </View>
        <Button
          label="Pay now"
          size="lg"
          tone="info"
          disabled={!canCheckout || paying}
          loading={paying}
          onPress={pay}
        />
      </View>

      <CouponSheet
        ref={couponSheetRef}
        coupons={coupons}
        ctx={{ itemSubTotal: couponEligibleSubTotal, deliveryCharge: bill.delivery, taxes: bill.taxes }}
        onApply={applyResolved}
        onClose={() => {}}
        applying={applyingCoupon}
      />
      <CouponCelebration trigger={couponPulse} code={celebrated.code} saving={celebrated.saving} />
      <OnDemandBillSummarySheet ref={billSheetRef} bill={bill} />
    </View>
  );
}

function CouponRow({
  appliedCoupon,
  bestCoupon,
  code,
  onCodeChange,
  couponError,
  onApplyByCode,
  onApplyBest,
  onClear,
  onOpenSheet,
  applyingCoupon,
}: {
  appliedCoupon: { couponCode: string; discount: number } | null;
  bestCoupon: { coupon: SubscriptionCoupon; itemDiscount: number; deliveryDiscount: number; discount: number } | null;
  code: string;
  onCodeChange: (t: string) => void;
  couponError: string | null;
  onApplyByCode: () => void;
  onApplyBest: () => void;
  onClear: () => void;
  onOpenSheet: () => void;
  applyingCoupon: boolean;
}) {
  // Thin wrapper kept in this file (not a shared component) since it's a
  // one-call-site adaptation of BulkCouponCard's layout for on-demand's coupon
  // shape — see BulkCouponCard for the canonical version if a 3rd cart needs it.
  return (
    <View style={{ gap: 12 }}>
      {appliedCoupon ? (
        <View className="flex-row items-center gap-3">
          <AccentIcon icon={IconCoins} tone="reward" size={18} tileSize={36} />
          <View className="flex-1">
            <AppText variant="label" className="text-foreground">
              {appliedCoupon.couponCode} applied
            </AppText>
            <AppText variant="caption" style={{ color: palette.accent.veg }}>
              You saved ₹{appliedCoupon.discount}
            </AppText>
          </View>
          <Pressable onPress={onClear} accessibilityRole="button" className="active:opacity-70">
            <AppText variant="label" className="text-danger">
              Remove
            </AppText>
          </Pressable>
        </View>
      ) : (
        <>
          {bestCoupon ? (
            <View
              className="flex-row items-center gap-3 rounded-xl px-3 py-2.5"
              style={{ backgroundColor: accentTint(palette.accent.reward, 0.1) }}>
              <View className="flex-1">
                <AppText variant="label" className="text-foreground">
                  {bestCoupon.coupon.couponCode}
                </AppText>
                <AppText variant="caption" style={{ color: palette.accent.veg }}>
                  Save ₹{bestCoupon.discount} on this order
                </AppText>
              </View>
              <Button label="Apply" size="sm" onPress={onApplyBest} disabled={applyingCoupon} loading={applyingCoupon} />
            </View>
          ) : null}
          <View className="flex-row items-center gap-2">
            <TextInput
              value={code}
              onChangeText={onCodeChange}
              placeholder="Have a coupon code?"
              placeholderTextColor={palette.neutral.gray500}
              autoCapitalize="characters"
              className="flex-1 rounded-xl border border-input px-3 py-2 font-metropolis text-body-lg text-foreground"
            />
            <Button
              label="Apply"
              variant="outline"
              size="sm"
              onPress={onApplyByCode}
              disabled={!code.trim() || applyingCoupon}
              loading={applyingCoupon}
            />
          </View>
          <Pressable onPress={onOpenSheet} accessibilityRole="button" className="active:opacity-70">
            <AppText variant="label" style={{ color: palette.accent.reward }}>
              View all coupons
            </AppText>
          </Pressable>
        </>
      )}
      {couponError ? (
        <AppText variant="caption" className="text-danger">
          {couponError}
        </AppText>
      ) : null}
    </View>
  );
}

function RedeemRow({
  icon,
  tone,
  title,
  sub,
  on,
  onToggle,
  divider,
}: {
  icon: ComponentType<IconProps>;
  tone: 'reward' | 'rating';
  title: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
  divider?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onToggle}
      className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-80"
      style={divider ? { borderBottomWidth: 1, borderBottomColor: colors.border } : undefined}>
      <AccentIcon icon={icon} tone={tone} size={18} tileSize={38} />
      <View className="flex-1">
        <AppText variant="label" className="text-foreground">
          {title}
        </AppText>
        <AppText variant="caption" style={{ color: on ? palette.accent.veg : colors.mutedForeground }}>
          {sub}
        </AppText>
      </View>
      <Toggle value={on} onChange={onToggle} accessibilityLabel={title} />
    </Pressable>
  );
}


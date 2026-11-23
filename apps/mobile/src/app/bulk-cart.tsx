import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
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
  IconWallet,
  type IconProps,
} from '@/components/ui/icons';
import { Toggle } from '@/components/ui/Toggle';
import {
  BulkBillSummarySheet,
  BulkCartLineItem,
  BulkCouponCard,
  BulkDeliveryPicker,
  buildBulkBill,
  bulkOrderType,
  chargesFromBulkConfig,
  loadBulkCoupons,
  loadBulkSlotWindow,
  loadFoodBoxVars,
  minDeliveryDate,
  nextCountFor,
  useBulkCartStore,
  type BulkBillCharges,
  type DeliverySlot,
} from '@/features/bulk';
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
  type BulkOrderBody,
} from '@/services/payment';
import { ENDPOINTS } from '@/services/http';
import { trackProceedToCheckout, trackPurchase, trackPurchaseFailed, useScreenTracking } from '@/services/netcore';
import { accentTint, palette, shadow, SPACING, useColors } from '@/theme';

function nextDates(minDate: string, count = 7): string[] {
  const dates: string[] = [];
  const start = new Date(minDate);
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export default function BulkCartScreen() {
  useScreenTracking('bulk_cart');

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const cart = useBulkCartStore((s) => s.cart);
  const setCount = useBulkCartStore((s) => s.setCount);
  const goHomeFromEmptyCart = useEmptyCartHomeBack(cart.lines.length === 0, 'bulk');
  const profile = useAuthStore((s) => s.profile);
  const address = useLocationStore((s) => s.current);
  const savedAddresses = useLocationStore((s) => s.saved);
  const { wallet, cashback, refresh } = useBalances();

  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<DeliverySlot | null>(null);
  const [useWallet, setUseWallet] = useState(false);
  const [useCashback, setUseCashback] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyCoupon = useBulkCartStore((s) => s.applyCoupon);
  const clearCoupon = useBulkCartStore((s) => s.clearCoupon);

  const [coupons, setCoupons] = useState<SubscriptionCoupon[]>([]);
  const [code, setCode] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponPulse, setCouponPulse] = useState(0);
  const [celebrated, setCelebrated] = useState({ code: '', saving: 0 });
  const couponSheetRef = useRef<BottomSheetModal>(null);
  const billSheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    loadBulkCoupons().then(setCoupons).catch(() => setCoupons([]));
  }, []);

  const minDate = useMemo(() => minDeliveryDate(cart.lines), [cart.lines]);
  const dateOptions = useMemo(() => nextDates(minDate), [minDate]);
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [charges, setCharges] = useState<BulkBillCharges | undefined>(undefined);
  const [foodBoxPackagingCost, setFoodBoxPackagingCost] = useState(0);

  useEffect(() => {
    loadBulkSlotWindow().then(setSlots);
  }, []);

  // Food Box's Customized mode bills packaging per box (not the flat
  // orgInfo.packagingCharges every other bulk category uses) — see
  // buildBulkBill's packagingOverride param.
  useEffect(() => {
    if (cart.category !== 'foodbox' || cart.packaging !== 'bulk') {
      setFoodBoxPackagingCost(0);
      return;
    }
    loadFoodBoxVars().then((vars) => setFoodBoxPackagingCost(vars.packagingCost));
  }, [cart.category, cart.packaging]);

  useEffect(() => {
    const configName = useClusterStore.getState().currentConfigName();
    if (!configName) return;
    clusterApi
      .searchClusterVariable(configName)
      .then((cfg) => setCharges(chargesFromBulkConfig(cfg)))
      .catch(() => {
        // No cluster config available — buildBulkBill's own default
        // parameter (DEFAULT_BULK_CHARGES) covers this by leaving
        // `charges` at its initial `undefined`.
      });
  }, []);

  // A quantity change can push the minimum delivery date later (crossing a
  // slab boundary) — drop a previously-selected date that's no longer offered.
  useEffect(() => {
    if (date && !dateOptions.includes(date)) {
      setDate(null);
    }
  }, [date, dateOptions]);

  // Default to the first offered delivery date — most orders take the
  // earliest date anyway, and requiring an explicit tap on every visit was
  // pure friction. Only fills in when nothing's picked (never overrides a
  // date the user already chose), and re-fires if the slab-boundary effect
  // above just cleared it.
  useEffect(() => {
    if (!date && dateOptions.length) {
      setDate(dateOptions[0]);
    }
  }, [date, dateOptions]);

  // Same default-to-first treatment for the delivery slot, once the window resolves.
  useEffect(() => {
    if (!slot && slots.length) {
      setSlot(slots[0]);
    }
  }, [slot, slots]);

  const walletBalance = Number.parseFloat(wallet) || 0;
  const cashbackBalance = cashback || 0;

  const bill = useMemo(() => {
    const packagingOverride =
      cart.category === 'foodbox' && cart.packaging === 'bulk'
        ? foodBoxPackagingCost * cart.lines.reduce((sum, l) => sum + l.count, 0)
        : undefined;
    return buildBulkBill(
      cart.lines,
      cart.orgInfo,
      cart.category ?? 'meals',
      charges,
      cart.coupon?.itemDiscount ?? 0,
      cart.coupon?.deliveryDiscount ?? 0,
      useCashback ? cashbackBalance : 0,
      useWallet ? walletBalance : 0,
      packagingOverride,
    );
  }, [cart, charges, useCashback, useWallet, cashbackBalance, walletBalance, foodBoxPackagingCost]);

  const bestCoupon = useMemo(() => {
    const ctx = { itemSubTotal: bill.subTotal, deliveryCharge: bill.delivery, taxes: bill.taxes };
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
  }, [coupons, bill.subTotal, bill.delivery, bill.taxes]);

  const celebrate = (couponCode: string, saving: number): void => {
    setCelebrated({ code: couponCode, saving });
    setCouponPulse((n) => n + 1);
  };

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
      itemSubTotal: bill.subTotal,
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

  // Steps by QUANTITY_STEP (1) once in cart, snapping below MOQ back to 0 —
  // same nextCountFor() bulk-menu.tsx uses, so this line's stepper behaves
  // identically whether it's changed from the menu or from the cart.
  const change = (lineItemId: string, delta: number): void => {
    const line = cart.lines.find((l) => l.item._id === lineItemId);
    if (!line || !cart.orgInfo || !cart.category || !cart.packaging) return;
    const next = nextCountFor(line.count, delta, cart.orgInfo.moq);
    setCount(line.item, cart.category, cart.packaging, cart.orgInfo, next);
  };

  const pay = async (): Promise<void> => {
    if (!requireLogin(router) || !profile || !cart.category || !cart.packaging) return;
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
    // and `customerLocation` on BulkOrderBody is required (not optional like
    // the subscription cart's), so this keeps the type honest without
    // widening that shared type or asserting past a real invariant.
    if (!address) return;
    setPaying(true);
    const totals = {
      total_items: cart.lines.length,
      total_prqt: cart.lines.reduce((sum, l) => sum + l.count, 0),
      selling_amount: bill.toPay,
      discount_amt: bill.discount,
    };
    trackProceedToCheckout('bulk', totals);
    try {
      const body: BulkOrderBody = {
        orderType: bulkOrderType(cart.category, cart.packaging),
        amount: bill.toPay,
        customerId: profile._id,
        customerName: profile.userName ?? '',
        customerEmail: profile.email ?? '',
        customerPhoneNo: profile.phoneNo,
        customerLocation: customerLocationFrom(address),
        itemList: cart.lines.map((l) => ({
          itemId: l.item._id,
          itemName: l.item.itemName,
          itemPrice: l.itemPrice,
          count: l.count,
        })),
        bulkItemAmount: bill.subTotal,
        packagingCostByUser: bill.packaging,
        finalBulkDelCharges: bill.delivery,
        finalBulkPlatformCharges: bill.platform,
        deliveryDate: date ?? undefined,
        slotStartTime: slot?.start,
        slotEndTime: slot?.end,
        discount: bill.discount,
        taxes: bill.taxes,
        couponCode: cart.coupon?.couponCode,
        couponDiscount: cart.coupon?.discount,
        moneyWalletPointsUsed: bill.moneyWalletUsed,
        mealaweWalletPointsUsed: bill.cashbackUsed,
        // See BulkOrderBody's doc comments — required to keep the backend's
        // totalSaving reconciliation from going NaN, not just informational.
        voucherDiscount: 0,
        mealaweKitchenDiscount: 0,
        extraDiscount: 0,
      };
      const result = await payWithJusPay(ENDPOINTS.juspay.startBulk, body);
      const purchasePayload = {
        items: cart.lines.map((l) => ({
          prid: l.item._id,
          product_name: l.item.itemName,
          category_name: cart.category!,
          product_price: l.itemPrice,
          prqt: l.count,
          image_url: l.item.itemImage,
        })),
        ...totals,
        amount: bill.toPay,
      };
      if (result.status !== 'failed') {
        trackPurchase('bulk', purchasePayload);
        useBulkCartStore.getState().reset();
      } else {
        trackPurchaseFailed('bulk', purchasePayload);
      }
      router.push({
        pathname: '/order-result',
        params: {
          status: result.status,
          orderType: result.orderType,
          foodOrderId: result.foodOrderId,
          ...(result.reason ? { reason: result.reason } : {}),
          mode: 'bulk',
          recapTitle: `${cart.lines.length} item${cart.lines.length === 1 ? '' : 's'}`,
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
            title: 'Bulk cart',
            // Back (header tap or Android hardware back) goes to the Bulk
            // home tab instead of wherever the user came from (a menu screen
            // that would just show this same empty cart again) — see
            // `useEmptyCartHomeBack`. `gestureEnabled: false` blocks iOS's
            // swipe-back gesture the same way, since it has no JS-level hook
            // to intercept and redirect like the header/hardware-back do.
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
            source={require('@/assets/images/cart/empty-cart-bulk.webp')}
            style={{ width: '80%', aspectRatio: 1 }}
            contentFit="contain"
          />
          <AppText variant="title" className="text-foreground" style={{ marginTop: 12 }}>
            Your bulk cart is empty
          </AppText>
          <View style={{ marginTop: 16 }}>
            <Button
              label="Browse bulk menu"
              onPress={() => router.replace({ pathname: '/(tabs)', params: { tab: 'bulk' } })}
            />
          </View>
        </View>
      </View>
    );
  }

  const canCheckout = !!date && !!slot;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Bulk cart' }} />
      <StatusBar style="auto" />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24, gap: 14 }}>
        {bill.saving > 0 ? (
          <SavingsBanner
            saving={bill.saving}
            percent={
              bill.toPay + bill.saving > 0
                ? Math.round((bill.saving / (bill.toPay + bill.saving)) * 100)
                : 0
            }
          />
        ) : null}

        {/* cart lines + their own "add more items" link — tighter internal
            gap than the outer stack since the link directly extends this
            same line list, unlike the genuinely distinct sections (delivery
            picker, coupon, bill) that keep the outer gap. */}
        <View style={{ gap: SPACING.sm }}>
          {cart.lines.map((line) => (
            <BulkCartLineItem
              key={line.item._id}
              line={line}
              orgInfo={cart.orgInfo}
              onIncrease={() => change(line.item._id, 1)}
              onDecrease={() => change(line.item._id, -1)}
            />
          ))}

          <Pressable
            onPress={() =>
              router.push({ pathname: '/bulk-menu', params: { category: cart.category ?? 'meals' } })
            }
            accessibilityRole="button"
            className="flex-row items-center gap-1.5 self-start active:opacity-70">
            <IconPlus size={16} color={palette.accent.plan} />
            <AppText variant="label" style={{ color: palette.accent.plan }}>
              Add more items
            </AppText>
          </Pressable>
        </View>

        <BulkDeliveryPicker
          dateOptions={dateOptions}
          date={date}
          onSelectDate={setDate}
          slots={slots}
          slot={slot}
          onSelectSlot={setSlot}
        />

        <BulkCouponCard
          appliedCoupon={cart.coupon}
          bestCoupon={bestCoupon}
          hasCoupons={coupons.length > 0}
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
                onToggle={() => setUseCashback((v) => !v)}
              />
            ) : null}
          </View>
        ) : null}

        {/* total bill — compact summary row, opens BulkBillSummarySheet.
            Same tap-to-expand pattern as the Subscription cart's own bill
            row, replacing the old fully-inline itemized card. */}
        <Pressable
          onPress={() => billSheetRef.current?.present()}
          accessibilityRole="button"
          className="rounded-2xl border border-border bg-card p-4 active:opacity-80"
          style={[shadow.card, { gap: 10 }]}>
          <View className="flex-row items-center gap-3">
            <AccentIcon icon={IconReceipt} tone="plan" size={18} tileSize={36} />
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
            // Universal savings green (not Bulk's own "plan" accent) — see
            // BulkBillSummarySheet's matching comment.
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
              Pick a delivery date and slot
            </AppText>
          ) : null}
        </View>
        <Button
          label="Place order"
          size="lg"
          tone="plan"
          disabled={!canCheckout || paying}
          loading={paying}
          onPress={pay}
        />
      </View>

      <CouponSheet
        ref={couponSheetRef}
        coupons={coupons}
        ctx={{ itemSubTotal: bill.subTotal, deliveryCharge: bill.delivery, taxes: bill.taxes }}
        onApply={applyResolved}
        onClose={() => {}}
        applying={applyingCoupon}
      />
      <CouponCelebration trigger={couponPulse} code={celebrated.code} saving={celebrated.saving} />
      <BulkBillSummarySheet ref={billSheetRef} bill={bill} />
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


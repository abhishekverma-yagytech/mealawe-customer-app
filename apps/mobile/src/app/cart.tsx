import { Redirect, Stack, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { AccentIcon } from '@/components/ui/AccentIcon';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { Toggle } from '@/components/ui/Toggle';
import {
  IconArrowLeft,
  IconCalendar,
  IconChevronRight,
  IconClock,
  IconCoins,
  IconMapPin,
  IconOffer,
  IconReceipt,
  IconTicket,
  IconUtensils,
  IconWallet,
  type IconProps,
} from '@/components/ui/icons';
import { requireLogin } from '@/features/auth';
import { addressLabel, hasSavedAddress } from '@/features/location';
import {
  addonLineTotal,
  daysLabel,
  extraAddonDays,
  fromServerCategory,
  generateRun,
  loadSubscriptionCategories,
  loadSubscriptionCoupons,
  nextStartDates,
  packageImageUri,
  useConfigureStore,
  useSubscriptionCatalog,
  formatShort,
  AddonTypeIcon,
  StartDatePickerSheet,
  type MealPackage,
  type SubCategory,
  type SubscriptionCoupon,
} from '@/features/subscription';
import {
  buildBill,
  discountFor,
  voucherDiscountFor,
  validateCouponForUser,
  validateVoucherCode,
  BillSummarySheet,
  CouponSheet,
  GstBreakdownSheet,
  OtherSubscriptionsRow,
  SavingsBanner,
  CouponCelebration,
  TreePlantationCard,
  TrustBadgesRow,
  useEmptyCartHomeBack,
  type SubscriptionCartItem,
  type SubscriptionConfig,
} from '@/features/cart';
import { useBalances } from '@/features/wallet';
import {
  customerLocationFrom,
  packageForOrder,
  payWithJusPay,
  type SubscriptionOrderBody,
} from '@/services/payment';
import { ENDPOINTS } from '@/services/http';
import { trackProceedToCheckout, trackPurchase, trackPurchaseFailed, useScreenTracking } from '@/services/netcore';
import { palette, accentTint, shadow, useColors, SPACING } from '@/theme';
import { useAuthStore, useCartStore, useClusterStore, useLocationStore } from '@/store';
import { formatINR } from '@/utils/currency';

export default function CartScreen() {
  useScreenTracking('subscription_cart');

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const cart = useCartStore((s) => s.cart);
  const goHomeFromEmptyCart = useEmptyCartHomeBack(!cart.item, 'subscription');
  const charges = useCartStore((s) => s.charges);
  const applyCoupon = useCartStore((s) => s.applyCoupon);
  const clearCoupon = useCartStore((s) => s.clearCoupon);
  const setTreePlantation = useCartStore((s) => s.setTreePlantation);
  const clearTreePlantation = useCartStore((s) => s.clearTreePlantation);
  const loadCharges = useCartStore((s) => s.loadCharges);
  const setCount = useCartStore((s) => s.setCount);
  const setSubscription = useCartStore((s) => s.setSubscription);
  const setConfigureContext = useConfigureStore((s) => s.set);
  const address = useLocationStore((s) => s.current);
  const savedAddresses = useLocationStore((s) => s.saved);
  const profile = useAuthStore((s) => s.profile);
  const { wallet, cashback, refresh: refreshBalances } = useBalances();

  const [coupons, setCoupons] = useState<SubscriptionCoupon[]>([]);
  const [categories, setCategories] = useState<SubCategory[]>([]);
  const [code, setCode] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [useWallet, setUseWallet] = useState(false);
  const [useCashback, setUseCashback] = useState(false);
  const [couponPulse, setCouponPulse] = useState(0);
  const [celebrated, setCelebrated] = useState({ code: '', saving: 0 });
  const [paying, setPaying] = useState(false);
  const couponSheetRef = useRef<BottomSheetModal>(null);
  const dateSheetRef = useRef<BottomSheetModal>(null);
  const billSheetRef = useRef<BottomSheetModal>(null);
  const gstSheetRef = useRef<BottomSheetModal>(null);
  const celebratedCodeRef = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const addressCardY = useRef(0);
  const [addressError, setAddressError] = useState<string | null>(null);

  const item = cart.item;
  const walletBalance = Number.parseFloat(wallet) || 0;
  const cashbackBalance = cashback || 0;
  const catalog = useSubscriptionCatalog();
  // Computed once, pre-guard, and reused both by `otherPackages` below and by
  // `thumbSource` post-guard — a plain `const` (not a hook), so hoisting it
  // here carries no Rules-of-Hooks concern, it just avoids doing the same
  // `categories.find` twice per render.
  const category = item ? categories.find((c) => c.name === item.category) : undefined;

  useEffect(() => {
    void loadCharges();
    void refreshBalances();
    loadSubscriptionCoupons()
      .then(setCoupons)
      .catch(() => setCoupons([]));
    loadSubscriptionCategories()
      .then((list) => setCategories(list.map(fromServerCategory)))
      .catch(() => setCategories([]));
  }, [loadCharges, refreshBalances]);

  // Celebrate whenever there's an active coupon to show off — on the cart
  // screen's very first render (e.g. a coupon persisted from an earlier
  // session, not just one applied this session) and again any time it
  // actually changes to a different code. Centralized on `cart.coupon`
  // itself (rather than called manually from each apply action) so every
  // path that can set the coupon — typed code, the coupon sheet, a future
  // auto-apply — celebrates the same way, with no call site able to forget.
  useEffect(() => {
    const code = cart.coupon?.couponCode ?? null;
    if (!code) {
      celebratedCodeRef.current = null;
      return;
    }
    if (code === celebratedCodeRef.current) {
      return;
    }
    celebratedCodeRef.current = code;
    setCelebrated({ code, saving: cart.coupon?.discount ?? 0 });
    setCouponPulse((n) => n + 1);
  }, [cart.coupon]);

  // Self-heals `addressError` regardless of how the address changed. The
  // Address row navigates to `/addresses` and back via React Navigation,
  // which keeps this screen mounted underneath the whole round trip, so
  // `addressError` would otherwise survive untouched — leaving the red error
  // text visible under a now-valid address until the next "Proceed to Pay"
  // tap. `item` is read via optional chaining since this runs pre-guard
  // (before the `if (!item)` early return below) alongside the component's
  // other hooks, so it must stay null-safe.
  useEffect(() => {
    if (addressError && (item?.isDineIn || hasSavedAddress(address, savedAddresses))) {
      setAddressError(null);
    }
  }, [address, savedAddresses, item?.isDineIn, addressError]);

  // Tree Plantation is always the full configured price (`BillCharges.
  // treePlantationAmount`, no free-eligibility discount) and is never
  // auto-selected — the user has to opt in themselves via `toggleTreePlantation`.
  const bill = useMemo(
    () =>
      buildBill(
        cart,
        charges,
        useCashback ? cashbackBalance : 0,
        useWallet ? walletBalance : 0,
      ),
    [cart, charges, useCashback, useWallet, cashbackBalance, walletBalance],
  );
  // Package-level discount only — bill.discount is item-side-only (itemDiscount
  // + couponItemDiscount, see buildBill), so subtracting the coupon's item-side
  // share (not its full discount, which may also include a delivery-side
  // component) recovers the plan's own discount exactly. Computed here (ahead
  // of the `!item` guard below) since `bestCoupon` needs it and runs
  // unconditionally as a hook, before that guard can run.
  const planDiscount = bill.discount - (cart.coupon?.itemDiscount ?? 0);

  // Best auto-surfaced coupon (max applicable saving) when none applied yet.
  const bestCoupon = useMemo(() => {
    // Matches the Ionic reference's `amtBeforeDiscount = totalAmt -
    // subscriptionItemDiscount` — the coupon's base always excludes the
    // plan's own discount already, for both 'itemAmount' and 'billAmount'.
    const ctx = {
      itemSubTotal: bill.subTotal - planDiscount,
      deliveryCharge: bill.delivery,
      taxes: bill.taxes,
      isSubscription: true,
    };
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
  }, [coupons, bill.subTotal, bill.delivery, bill.taxes, planDiscount]);

  // Sibling packages in the same category, used by the "Other subscriptions"
  // row/swap flow — only ones with a HIGHER total meal count than the plan
  // already in the cart, so this reads as "upgrade to more meals," never a
  // lateral or downgrade swap. A `useMemo`, not a post-guard `const`, so
  // it's called unconditionally every render (same as `bill`/`bestCoupon`
  // above) — the body is null-safe internally since `item` isn't guaranteed
  // non-null yet.
  const otherPackages = useMemo(() => {
    if (!item) {
      return [];
    }
    const categoryParam = category?.param ?? item.category;
    // Same "meals/day × days" formula `mealCountFor` uses for the badge on
    // each sibling card below — a sibling package carries no meal-time
    // selection of its own, so it borrows the cart item's (only `isBreakFast`
    // varies per-package).
    const mealsPerDay = item.breakfast ? 1 : item.lunch && item.dinner ? 2 : 1;
    const currentMealCount = (item.package.isBreakFast ? 1 : mealsPerDay) * item.package.days;
    return catalog
      .packagesFor(categoryParam)
      .filter((p) => p._id !== item.package._id)
      .filter((p) => (p.isBreakFast ? 1 : mealsPerDay) * p.days > currentMealCount);
    // `catalog` itself (from `useSubscriptionCatalog()`) is a fresh object
    // literal every render — only `catalog.packagesFor` is stable (wrapped in
    // `useCallback` inside the hook). Depending on the full `catalog` object
    // here would recompute this memo on every re-render (typing a coupon
    // code, toggling wallet, etc.), defeating its purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.packagesFor, category, item]);

  if (!item) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Your cart',
            // Back (header tap or Android hardware back) goes to the
            // Subscription home tab instead of wherever the user came from —
            // see `useEmptyCartHomeBack`. `gestureEnabled: false` blocks
            // iOS's swipe-back gesture the same way.
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
          <AppText variant="bodySm" className="text-muted-foreground" style={{ marginTop: 4, textAlign: 'center' }}>
            Pick a subscription plan to get started.
          </AppText>
          <View style={{ marginTop: 16 }}>
            <Button
              label="Browse plans"
              onPress={() => router.replace({ pathname: '/(tabs)', params: { tab: 'subscription' } })}
            />
          </View>
        </View>
      </View>
    );
  }

  const pkg = item.package;
  // Same live category photo Home/Detail/Plan/Configure show (Dine In's
  // synthetic "Dine In" category has no catalog entry, so it falls back to
  // the backend's own per-package image instead of a mismatched thumbnail).
  // `category` itself is computed once, pre-guard, above.
  const uri = packageImageUri(pkg);
  const thumbSource = category?.image ?? (uri ? { uri } : undefined);
  const meal = item.breakfast
    ? 'Breakfast'
    : [item.lunch ? 'Lunch' : null, item.dinner ? 'Dinner' : null].filter(Boolean).join(' + ');
  const mealsPerDay = item.breakfast ? 1 : item.lunch && item.dinner ? 2 : 1;
  // "Include Saturday"/"Include Sunday" add-ons carry extra days beyond the
  // plan's own `pkg.days` — shown as a running "60 + 4" total here, matching
  // Configure. Display only: `pkg.days` and the saved `selectedDates` are
  // unchanged.
  const totalDaysLabel = daysLabel(pkg.days, extraAddonDays(item.addOns, item.deliveryOnWeekends));
  const start = item.selectedDates[0];

  // Shared validate-then-apply core for both Apply affordances below. Guards
  // on `applyingCoupon` so a user tapping the typed-code Apply, the
  // best-coupon banner Apply, and a CouponSheet row Apply in quick succession
  // can't fire overlapping `validateCouponForUser` requests — only the first
  // tap's request goes out; the rest no-op until it settles. Clears
  // `couponError` at the *start* of the attempt (not just on success) so a
  // stale message from a previous failed attempt doesn't linger while a new
  // one is in flight, and always resets `applyingCoupon` in `finally` so a
  // thrown/rejected validation call can't leave the UI stuck disabled.
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
      return true;
    } finally {
      setApplyingCoupon(false);
    }
  };

  // Voucher's sibling to `confirmAndApplyCoupon` above — same
  // `applyingCoupon` guard (shared across both, so a coupon apply and a
  // voucher apply can't race each other either), but there's no pre-fetched
  // list to look up: the server resolves the voucher document itself. A
  // successful voucher apply lands in the exact same `cart.coupon` slot a
  // coupon would — coupon and voucher are mutually exclusive by construction
  // this way (there's only one slot), matching the Ionic reference's
  // `removeCoupon()`-on-voucher-apply behavior for free, with no separate
  // "remove the other one" step needed.
  const confirmAndApplyVoucher = async (voucherCode: string): Promise<boolean> => {
    const trimmed = voucherCode.trim();
    if (applyingCoupon || !trimmed) return false;
    setApplyingCoupon(true);
    setCouponError(null);
    try {
      const { valid, message, voucher } = await validateVoucherCode(
        trimmed,
        profile?._id,
        'subscription',
        useClusterStore.getState().clusterIds(),
      );
      if (!valid || !voucher) {
        setCouponError(message ?? 'Invalid or expired voucher code');
        return false;
      }
      const { discount, reason } = voucherDiscountFor(voucher, bill.subTotal - planDiscount);
      if (reason) {
        setCouponError(reason);
        return false;
      }
      applyCoupon({
        couponCode: voucher.voucherCode,
        discount,
        itemDiscount: discount,
        deliveryDiscount: 0,
        couponHeader: voucher.description,
      });
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
      itemSubTotal: bill.subTotal - planDiscount,
      deliveryCharge: bill.delivery,
      taxes: bill.taxes,
      isSubscription: true,
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

  const applyVoucherFromSheet = async (voucherCode: string): Promise<void> => {
    const applied = await confirmAndApplyVoucher(voucherCode);
    if (applied) {
      couponSheetRef.current?.dismiss();
    }
  };

  const requestPlanSwap = (newPkg: MealPackage): void => {
    Alert.alert(
      'Replace your plan?',
      `Switching to ${newPkg.packageName ?? 'this plan'} will reset your selected dates and add-ons.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: () => {
            // `setSubscription` treats a package-id change as a new line and
            // resets `count` to 1 (see cartStore.ts's `isNewLine` check) — a
            // swap always changes the package id, so without this the
            // user's existing quantity would silently drop to 1. Capture it
            // first and restore it right after: `set()` is synchronous, so
            // `setCount` sees the newly-swapped item already in the store.
            const previousCount = item.count;
            setSubscription(buildSwapConfig(newPkg, item));
            setCount(previousCount);
          },
        },
      ],
    );
  };

  const toggleTreePlantation = (): void => {
    if (cart.treePlantation?.enabled) {
      clearTreePlantation();
    } else {
      setTreePlantation({ enabled: true, receiverName: cart.treePlantation?.receiverName ?? '' });
    }
  };

  const setTreeReceiverName = (receiverName: string): void => {
    setTreePlantation({ enabled: true, receiverName });
  };

  const editAddons = (): void => {
    setConfigureContext({
      package: pkg,
      category: item.category,
      isDineIn: item.isDineIn,
      initial: item,
    });
    router.push('/subscription-configure' as Href);
  };

  // Inline schedule edit — changes just the start date (and the delivery-date
  // run it generates) without leaving the cart for the full Configure flow.
  // `setSubscription` preserves `count` for an existing line since the
  // package id is unchanged (see cartStore.ts's `isNewLine` check).
  const updateStartDate = (_startIso: string, newSelectedDates: string[]): void => {
    setSubscription({ ...item, selectedDates: newSelectedDates });
    dateSheetRef.current?.dismiss();
  };

  const pay = async (): Promise<void> => {
    if (!requireLogin(router) || !profile) return;
    // Dine In still has no delivery — `customerLocation` is sent for the
    // order record (see this function's own comment on that field below),
    // but there's no on-screen address section here for Dine In to fix if
    // it's missing (the DELIVERY DETAILS card shows "Eat at the kitchen"
    // instead, see the render below), so this gate only applies to real
    // delivery orders.
    if (!item.isDineIn && !hasSavedAddress(address, savedAddresses)) {
      setAddressError('Please choose a saved delivery address to continue.');
      scrollRef.current?.scrollTo({ y: Math.max(0, addressCardY.current - 20), animated: true });
      return;
    }
    setAddressError(null);
    setPaying(true);
    trackProceedToCheckout('subscription', {
      total_items: 1,
      total_prqt: item.count,
      selling_amount: bill.toPay,
      discount_amt: bill.discount,
    });
    try {
      const body: SubscriptionOrderBody = {
        orderType: 'subscriptionPackage',
        amount: bill.toPay,
        orderDate: new Date().toISOString(),
        customerId: profile._id,
        customerName: profile.userName ?? '',
        customerEmail: profile.email ?? '',
        customerPhoneNo: profile.phoneNo,
        isDineIn: item.isDineIn,
        // Sent for Dine In too, matching the Ionic reference
        // (dine-in-cart.page.ts) — Dine In still collects an address via the
        // same `DeliverToSection` Configure uses, and the backend/dashboard
        // rely on this for order records even though there's no delivery.
        customerLocation: address ? customerLocationFrom(address) : undefined,
        mealPackage: packageForOrder(pkg, item.addOns),
        // Equal to `amount` — see `SubscriptionOrderBody.mealaweTotalAmt`'s
        // own comment for why this has to be sent.
        mealaweTotalAmt: bill.toPay,
        subscriptionStartDate: start,
        subscriptionDays: pkg.days,
        userSelectedDates: item.selectedDates,
        // Gates whether the backend even saves `userSelectedDates` at all —
        // see `SubscriptionOrderBody.multiDateAllowed`'s own comment.
        multiDateAllowed: pkg.multiDateAllowed,
        mealTimeLunch: item.lunch,
        mealTimeDinner: item.dinner,
        mealTimeBreakfast: item.breakfast,
        discount: bill.discount,
        taxes: bill.taxes,
        couponCode: cart.coupon?.couponCode,
        couponDiscount: cart.coupon?.discount,
        moneyWalletPointsUsed: bill.moneyWalletUsed,
        mealaweWalletPointsUsed: bill.cashbackUsed,
        ...(cart.treePlantation?.enabled
          ? {
              treePlantationOpted: true,
              treePlantationDone: false,
              treePlantationAmount: charges.treePlantationAmount,
              treePlantationDiscount: 0,
              treeReceiverName: cart.treePlantation.receiverName || profile.userName || '',
            }
          : null),
      };
      const result = await payWithJusPay(ENDPOINTS.juspay.startSubscription, body);
      const purchasePayload = {
        items: [
          {
            prid: pkg._id ?? '',
            product_name: pkg.packageName ?? item.category,
            category_name: item.category,
            product_price: pkg.packagePrice,
            prqt: item.count,
            image_url: pkg.imageUrl,
          },
        ],
        total_items: 1,
        total_prqt: item.count,
        selling_amount: bill.toPay,
        amount: bill.toPay,
        discount_amt: bill.discount,
      };
      if (result.status !== 'failed') {
        trackPurchase('subscription', purchasePayload);
        useCartStore.getState().reset();
        // The Configure screen's own `context` is cleared here — once the
        // flow has actually ended — rather than when Configure hands off to
        // Cart, so pressing back into Configure mid-checkout still shows the
        // plan the user filled in instead of bouncing to Home (see
        // subscription-configure.tsx's `save()`).
        useConfigureStore.getState().clear();
      } else {
        trackPurchaseFailed('subscription', purchasePayload);
      }
      // Dine-in bookings share this same checkout path (`item.isDineIn`) but
      // need `order-result.tsx` to tell them apart from a real Subscription —
      // that screen's whole convention is "no `mode` param = Subscription"
      // (see its Order-Mode CTA Rule + subscription-only additions), so a
      // dine-in order must pass `mode: 'dinein'` explicitly, same as
      // Bulk/On-Demand already do for their own modes.
      router.push({
        pathname: '/order-result',
        params: {
          status: result.status,
          orderType: result.orderType,
          foodOrderId: result.foodOrderId,
          ...(result.reason ? { reason: result.reason } : {}),
          ...(item.isDineIn ? { mode: 'dinein' } : {}),
          // Recap data for the success screen — the literal cart/bill this
          // screen is about to clear, not re-derived later from a fetch that
          // may not cover every order type.
          recapTitle: item.category,
          recapAmount: String(bill.toPay),
          ...(pkg.days ? { recapDays: String(pkg.days) } : {}),
        },
      });
    } finally {
      setPaying(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Your cart' }} />
      <StatusBar style="auto" />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.lg }}>
        {/* savings banner */}
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

        {/* item + its own add-ons — tighter internal gap than the outer
            stack since add-ons directly belong to the plan card above them,
            unlike the genuinely distinct sections (delivery, coupon, bill)
            that keep the outer SPACING.lg gap. */}
        <View style={{ gap: SPACING.sm }}>
          {/* item card */}
          <View style={shadow.card} className="rounded-2xl border border-border bg-card p-3">
            <View className="flex-row gap-3">
              <View style={{ width: 74, height: 74, borderRadius: 14, overflow: 'hidden' }}>
                {thumbSource ? (
                  <Image source={thumbSource} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : (
                  <View
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: accentTint(palette.accent.food, 0.14),
                    }}
                  >
                    <IconUtensils size={24} color={palette.accent.food} />
                  </View>
                )}
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <AppText variant="h3" weight="bold" className="text-foreground">
                    {item.category}
                  </AppText>
                  <Pressable
                    onPress={editAddons}
                    accessibilityRole="button"
                    accessibilityLabel="Edit plan"
                    hitSlop={8}
                    className="active:opacity-70"
                  >
                    <AppText variant="label" className="text-primary">
                      Edit
                    </AppText>
                  </Pressable>
                </View>
                <AppText variant="bodySm" className="text-muted-foreground">
                  {totalDaysLabel} days · {meal || 'No meal selected'}
                </AppText>
              </View>
            </View>

            {/* quantity — number of subscriptions of this same plan */}
            <View className="flex-row items-center justify-between" style={{ marginTop: 12 }}>
              <AppText variant="caption" className="text-muted-foreground">
                Quantity
              </AppText>
              <QuantityStepper
                count={item.count}
                onIncrease={() => setCount(item.count + 1)}
                onDecrease={() => setCount(item.count - 1)}
                countMinWidth={40}
                decreaseLabel={`Decrease ${item.category} quantity`}
                increaseLabel={`Increase ${item.category} quantity`}
              />
            </View>

          </View>

          {/* add-ons — its own card instead of small chips crammed into the
              item card, so a longer add-on name has room and each one reads
              as a real line item (type icon, name, per-meal + plan total). */}
          {item.addOns.length > 0 ? (
            <View className="rounded-2xl border border-border bg-card p-4" style={[shadow.card, { gap: 12 }]}>
              <AppText variant="overline" className="text-muted-foreground">
                ADD-ONS
              </AppText>
              {item.addOns.map((a, index) => {
                const price = a.extraPrice ?? a.addonPrice;
                const lineTotal = addonLineTotal(a, mealsPerDay, pkg.days);
                return (
                  <View key={a._id ?? a.addonName}>
                    {index > 0 ? (
                      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 12 }} />
                    ) : null}
                    <View className="flex-row items-center" style={{ gap: 10 }}>
                      <AddonTypeIcon type={a.addOnType} />
                      <View className="flex-1">
                        <AppText variant="body" className="text-foreground">
                          {a.addonName ?? 'Add-on'}
                        </AppText>
                        {price ? (
                          <AppText variant="caption" className="text-muted-foreground">
                            +{formatINR(price)}/meal
                          </AppText>
                        ) : null}
                      </View>
                      {price ? (
                        <AppText variant="body" className="text-foreground">
                          {formatINR(lineTotal)}
                        </AppText>
                      ) : (
                        <AppText variant="body" style={{ color: palette.accent.veg }}>
                          Free
                        </AppText>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        {/* delivery details */}
        <View
          onLayout={(e) => {
            addressCardY.current = e.nativeEvent.layout.y;
          }}
          className="rounded-2xl border border-border bg-card p-4"
          style={[shadow.card, { gap: 12 }]}>
          <AppText variant="overline" className="text-muted-foreground">
            DELIVERY DETAILS
          </AppText>
          <DetailRow
            icon={IconCalendar}
            tone="plan"
            label="Schedule"
            compact
            onPress={() => dateSheetRef.current?.present()}>
            {start ? `Starts ${formatShort(start)} · ${item.selectedDates.length} days` : 'Dates not set'}
          </DetailRow>
          <DetailRow icon={IconClock} tone="info" label="Meal">
            {meal || 'Not selected'}
          </DetailRow>
          {!item.isDineIn ? (
            <DetailRow icon={IconMapPin} tone="location" label="Address">
              {addressLabel(address)}
            </DetailRow>
          ) : (
            <DetailRow icon={IconMapPin} tone="location" label="Dine-in">
              Eat at the kitchen
            </DetailRow>
          )}
          {addressError ? (
            <AppText variant="bodySm" className="text-danger">
              {addressError}
            </AppText>
          ) : null}
        </View>

        {/* other subscriptions — sibling packages in the same category; the
            card's "Add" button replaces the current plan (see requestPlanSwap) */}
        <OtherSubscriptionsRow
          packages={otherPackages}
          mealCountFor={(p) => (p.isBreakFast ? 1 : mealsPerDay) * p.days}
          onAdd={requestPlanSwap}
          tone={item.isDineIn ? 'food' : undefined}
        />

        {/* coupon */}
        <View style={[shadow.card, { overflow: 'hidden' }]} className="rounded-2xl border border-border bg-card">
          {cart.coupon ? (
            <View className="flex-row items-center gap-3 p-4">
              <AccentIcon icon={IconTicket} tone="reward" size={18} tileSize={36} />
              <View className="flex-1">
                <AppText variant="label" className="text-foreground">
                  {cart.coupon.couponCode} applied
                </AppText>
                <AppText variant="caption" style={{ color: palette.accent.veg }}>
                  You saved {formatINR(cart.coupon.discount)}
                </AppText>
              </View>
              <Pressable onPress={clearCoupon} accessibilityRole="button" className="active:opacity-70">
                <AppText variant="label" className="text-danger">
                  Remove
                </AppText>
              </Pressable>
            </View>
          ) : (
            <View>
              {/* header banner — pink/"reward" is this app's established
                  coupon accent (used by every other coupon element on this
                  screen), applied as a tint (not the old fixed-hex
                  `palette.surface.couponBanner`) so it composites against
                  whatever the current theme's card color actually is —
                  the fixed hex read as washed-out, low-contrast white-on-pale
                  text in dark mode since it never adapted. */}
              <View
                className="flex-row items-center justify-between px-4 py-3"
                style={{ backgroundColor: accentTint(palette.accent.reward, 0.12) }}
              >
                <AppText variant="label" className="text-foreground">
                  Save extra by applying coupons
                </AppText>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.card,
                  }}
                >
                  <Image
                    source={require('@/assets/images/cart/coupon-offer-badge.png')}
                    style={{ width: 20, height: 20 }}
                    contentFit="contain"
                  />
                </View>
              </View>

              <View style={{ padding: 16, gap: 12 }}>
                {bestCoupon ? (
                  <View className="flex-row items-center gap-3">
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        borderWidth: 1.5,
                        borderStyle: 'dashed',
                        borderColor: palette.accent.reward,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <IconOffer size={16} color={palette.accent.reward} />
                    </View>
                    <AppText variant="body" className="flex-1 text-foreground">
                      Save {formatINR(bestCoupon.discount)} with{' '}
                      <AppText variant="body" weight="bold" className="text-foreground">
                        &quot;{bestCoupon.coupon.couponCode}&quot;
                      </AppText>
                    </AppText>
                    <Button
                      label="Apply"
                      variant="outline"
                      size="sm"
                      accentColor={palette.accent.nonveg}
                      loading={applyingCoupon}
                      disabled={applyingCoupon}
                      onPress={() => applyResolved(bestCoupon.coupon, bestCoupon.itemDiscount, bestCoupon.deliveryDiscount)}
                    />
                  </View>
                ) : (
                  <View className="flex-row items-center gap-2">
                    <TextInput
                      value={code}
                      onChangeText={(t) => {
                        setCode(t.toUpperCase());
                        setCouponError(null);
                      }}
                      placeholder="Have a coupon code?"
                      placeholderTextColor={palette.neutral.gray500}
                      autoCapitalize="characters"
                      className="flex-1 rounded-xl border border-input px-3 py-2 font-metropolis text-body-lg text-foreground"
                    />
                    <Button
                      label="Apply"
                      variant="outline"
                      size="sm"
                      accentColor={palette.accent.nonveg}
                      onPress={applyByCode}
                      disabled={!code.trim() || applyingCoupon}
                      loading={applyingCoupon}
                    />
                  </View>
                )}

                {coupons.length > 0 ? (
                  <>
                    <View style={{ height: 1, backgroundColor: colors.border }} />
                    <Pressable
                      onPress={() => couponSheetRef.current?.present()}
                      accessibilityRole="button"
                      className="flex-row items-center justify-center gap-1.5 active:opacity-70"
                    >
                      <AppText variant="bodySm" className="text-foreground">
                        Explore more coupon for you
                      </AppText>
                      <IconChevronRight size={16} color={colors.mutedForeground} />
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
          )}
          {couponError ? (
            <AppText
              variant="caption"
              className="text-danger"
              style={{ paddingHorizontal: 16, paddingBottom: 12, marginTop: -4 }}
            >
              {couponError}
            </AppText>
          ) : null}
        </View>

        {/* redeem: Mealawe Wallet + Cashback */}
        {walletBalance > 0 || cashbackBalance > 0 ? (
          <View className="rounded-2xl border border-border bg-card" style={[shadow.card, { overflow: 'hidden' }]}>
            {walletBalance > 0 ? (
              <RedeemRow
                icon={IconWallet}
                tone="reward"
                title="Use Mealawe Wallet"
                sub={
                  useWallet && bill.moneyWalletUsed > 0
                    ? `Saving ${formatINR(bill.moneyWalletUsed)} on this order`
                    : `${formatINR(Number(wallet))} available`
                }
                on={useWallet}
                onToggle={() => setUseWallet((v) => !v)}
                divider
              />
            ) : null}
            {cashbackBalance > 0 ? (
              <RedeemRow
                icon={IconCoins}
                tone="rating"
                title="Redeem Cashback"
                sub={
                  useCashback && bill.cashbackUsed > 0
                    ? `Saving ${formatINR(bill.cashbackUsed)} on this order`
                    : `${formatINR(cashbackBalance)} available`
                }
                on={useCashback}
                onToggle={() => setUseCashback((v) => !v)}
              />
            ) : null}
          </View>
        ) : null}

        {/* tree plantation — UI/cart-state only, see the plan's Background for why */}
        <TreePlantationCard
          enabled={!!cart.treePlantation?.enabled}
          receiverName={cart.treePlantation?.receiverName ?? ''}
          amount={charges.treePlantationAmount}
          onToggle={toggleTreePlantation}
          onNameChange={setTreeReceiverName}
        />

        {/* total bill — compact summary row, opens BillSummarySheet. Plain
            neutral card (matches every other card on this screen) with a
            separate full-width savings pill below, instead of the whole row
            being green-tinted. */}
        <Pressable
          onPress={() => billSheetRef.current?.present()}
          accessibilityRole="button"
          className="rounded-2xl border border-border bg-card p-4 active:opacity-80"
          style={[shadow.card, { gap: 10 }]}
        >
          <View className="flex-row items-center gap-3">
            <AccentIcon icon={IconReceipt} tone="info" size={18} tileSize={36} />
            <View className="flex-1">
              <AppText variant="body" className="text-foreground">
                Total Bill : {formatINR(bill.toPay)}
              </AppText>
              <AppText variant="caption" className="text-muted-foreground">
                Incl. taxes, charges, &amp; donation
              </AppText>
            </View>
            <IconChevronRight size={18} color={colors.mutedForeground} />
          </View>
          {bill.saving > 0 ? (
            <View
              className="rounded-xl px-3 py-2"
              style={{ backgroundColor: accentTint(palette.accent.veg, 0.14) }}>
              <AppText variant="label" style={{ color: palette.accent.veg }}>
                You&apos;re saving {formatINR(bill.saving)}
              </AppText>
            </View>
          ) : null}
        </Pressable>

        <TrustBadgesRow />
      </ScrollView>

      {/* footer — same `shadow.lifted` token every other sticky footer in the
          app uses (subscription-plan.tsx, subscription-detail.tsx); this used
          to hand-roll a much heavier shadow (elevation 16 vs 10), which is
          what made this screen's cards read as more prominent than the rest.
          Price stacked above a full-width button, matching every other
          footer CTA in this flow (Detail's "Choose plan", Plan's "Next: set
          up", Configure's "Review & pay") instead of squeezing a fixed-width
          button in beside the price. */}
      <View
        className="border-t border-border bg-card px-5 pt-3"
        style={[shadow.lifted, { gap: 12, paddingBottom: insets.bottom + 12 }]}>
        <Image
          source={require('@/assets/images/cart/happy-customers.svg')}
          style={{ width: '100%', height: 60, borderRadius: 16 }}
          contentFit="cover"
        />
        <Button
          label={`${formatINR(bill.toPay)}   Proceed to Pay →`}
          size="lg"
          block
          tone={item.isDineIn ? 'food' : undefined}
          loading={paying}
          disabled={paying}
          onPress={pay}
        />
        <AppText variant="caption" className="text-muted-foreground text-center">
          Secure payment · Cancel anytime
        </AppText>
      </View>

      <CouponSheet
        ref={couponSheetRef}
        coupons={coupons}
        ctx={{
          itemSubTotal: bill.subTotal - planDiscount,
          deliveryCharge: bill.delivery,
          taxes: bill.taxes,
          isSubscription: true,
        }}
        onApply={applyResolved}
        onApplyVoucher={applyVoucherFromSheet}
        onClose={() => { }}
        applying={applyingCoupon}
        error={couponError}
      />

      <CouponCelebration trigger={couponPulse} code={celebrated.code} saving={celebrated.saving} />

      <StartDatePickerSheet
        ref={dateSheetRef}
        days={pkg.days}
        deliverOnWeekends={item.deliveryOnWeekends}
        initialStartIso={start ?? ''}
        isDineIn={item.isDineIn}
        onConfirm={updateStartDate}
      />

      <BillSummarySheet
        ref={billSheetRef}
        bill={bill}
        planDiscount={planDiscount}
        coupon={cart.coupon}
        treePlantationAmount={charges.treePlantationAmount}
        treePlantationOpted={!!cart.treePlantation?.enabled}
        isDineIn={item.isDineIn}
        onGstPress={() => gstSheetRef.current?.present()}
      />

      <GstBreakdownSheet ref={gstSheetRef} bill={bill} isDineIn={item.isDineIn} />
    </View>
  );
}

function DetailRow({
  icon,
  tone,
  label,
  children,
  onPress,
  compact,
}: {
  icon: ComponentType<IconProps>;
  tone: 'plan' | 'info' | 'location';
  label: string;
  children: string;
  /** When provided, the whole row becomes tappable and shows a trailing
   * "Change" affordance — e.g. Schedule opens `StartDatePickerSheet` inline
   * instead of the only option being a full trip to Configure. */
  onPress?: () => void;
  /** Smaller value text — Schedule uses this so its date/day-count string
   * doesn't compete with Meal/Address's regular-size rows. */
  compact?: boolean;
}) {
  const content = (
    <View className="flex-row items-center gap-3">
      <AccentIcon icon={icon} tone={tone} size={17} tileSize={36} />
      <View className="flex-1">
        <AppText variant="caption" className="text-muted-foreground">
          {label}
        </AppText>
        <AppText variant={compact ? 'bodySm' : 'body'} className="text-foreground">
          {children}
        </AppText>
      </View>
      {onPress ? (
        <AppText variant="bodySm" className="text-primary">
          Change
        </AppText>
      ) : null}
    </View>
  );
  if (!onPress) {
    return content;
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="active:opacity-70">
      {content}
    </Pressable>
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

/**
 * A fresh `SubscriptionConfig` for swapping the cart's current plan to a
 * different sibling package — used by `requestPlanSwap`. Resets the delivery
 * dates to a new run starting from the next eligible date (the old package's
 * run may not even have `newPkg.days` dates) and drops add-ons (they're
 * package-specific — see the design spec). Preserves the current item's
 * meal-time selection and dine-in status; a breakfast package (`isBreakFast`)
 * forces breakfast-only regardless of what was selected before, matching how
 * `subscription-configure.tsx`'s own Dine In / breakfast branches work.
 */
function buildSwapConfig(newPkg: MealPackage, current: SubscriptionCartItem): SubscriptionConfig {
  const deliveryOnWeekends = newPkg.deliveryOnWeekends ?? false;
  const chips = nextStartDates(14, deliveryOnWeekends, deliveryOnWeekends);
  const startIso = chips.find((c) => c.enabled)?.iso ?? '';
  const selectedDates = startIso
    ? generateRun(startIso, newPkg.days, deliveryOnWeekends, deliveryOnWeekends)
    : [];
  const breakfast = !!newPkg.isBreakFast;
  return {
    package: newPkg,
    category: current.category,
    deliveryOnWeekends,
    addOns: [],
    selectedDates,
    lunch: !breakfast && (current.lunch || !current.dinner),
    dinner: !breakfast && current.dinner,
    breakfast,
    isDineIn: current.isDineIn,
  };
}

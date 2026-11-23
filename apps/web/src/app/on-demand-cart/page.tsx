'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';

import { clusterApi, hasSavedAddress, loadOnDemandCoupons } from '@mealawe/api';
import { advanceDates, advanceSlotsFor, allDaySlotsFor, buildOnDemandBill, chargesFromOnDemandConfig, kitchenDiscountFor, loadOrderingWindows, maxRedeemableCashback, type OnDemandBillCharges, type OrderingWindows, type SubscriptionCoupon, type TimeSlot } from '@mealawe/core';
import { useBalances } from '@mealawe/hooks';
import { useAuthStore, useClusterStore, useLocationStore, useOnDemandCartStore } from '@mealawe/state';

import { useBoot } from '@/components/AppBootstrap';
import { BillSummary, CompleteInAppBar, CouponSection, EmptyCart, RedeemRows, type BillRow } from '@/components/cart/CartParts';
import { DateSlotPicker } from '@/components/cart/DateSlotPicker';
import { LineList } from '@/components/cart/LineCart';
import { PayBar } from '@/components/cart/PayBar';
import { usePayment } from '@/components/cart/usePayment';
import { useCouponFlow } from '@/components/cart/useCouponFlow';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { DeliverTo } from '@/components/location/DeliverTo';
import { Skeleton } from '@/components/ui/Skeleton';
import { ENV } from '@/lib/env';
import { buildOnDemandBody } from '@/payment/bodies';

function Content() {
  const { ready } = useBoot();
  const cart = useOnDemandCartStore((s) => s.cart);
  const setCount = useOnDemandCartStore((s) => s.setCount);
  const applyCoupon = useOnDemandCartStore((s) => s.applyCoupon);
  const clearCoupon = useOnDemandCartStore((s) => s.clearCoupon);
  const address = useLocationStore((s) => s.current);
  const saved = useLocationStore((s) => s.saved);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const profile = useAuthStore((s) => s.profile);
  const { wallet, cashback, refresh } = useBalances();

  const [charges, setCharges] = useState<OnDemandBillCharges | undefined>();
  const [coupons, setCoupons] = useState<SubscriptionCoupon[]>([]);
  const [useWallet, setUseWallet] = useState(false);
  const [useCashback, setUseCashback] = useState(false);
  const [maxCashback, setMaxCashback] = useState(0);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [windows, setWindows] = useState<OrderingWindows | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<TimeSlot | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const mode = cart.mode;

  useEffect(() => {
    refresh();
    loadOrderingWindows().then(setWindows);
    const configName = useClusterStore.getState().currentConfigName();
    if (configName) clusterApi.searchClusterVariable(configName).then((cfg) => setCharges(chargesFromOnDemandConfig(cfg))).catch(() => undefined);
  }, [refresh]);
  useEffect(() => {
    if (mode) loadOnDemandCoupons(mode).then(setCoupons).catch(() => setCoupons([]));
  }, [mode]);

  // Slots depend on the mode: "order now" = remaining hourly slots today (after the kitchen's prep time);
  // "advance" = a date (tomorrow / day after) + the advance window's hourly slots. Defaults as on mobile.
  const dateOptions = useMemo(() => advanceDates(), []);
  const slots = useMemo<TimeSlot[]>(() => {
    if (!windows) return [];
    return mode === 'advance' ? advanceSlotsFor(windows) : allDaySlotsFor(windows, cart.kitchen?.preparationTime ?? 0);
  }, [windows, mode, cart.kitchen]);
  useEffect(() => {
    if (mode === 'advance' && !date && dateOptions.length) setDate(dateOptions[0]);
  }, [mode, date, dateOptions]);
  useEffect(() => {
    if (slot && !slots.some((s) => s.start === slot.start)) setSlot(null);
    else if (!slot && slots.length) setSlot(slots[0]);
  }, [slot, slots]);

  const walletBalance = Number.parseFloat(wallet) || 0;
  const subtotal = cart.lines.reduce((s, l) => s + l.item.itemPrice * l.count, 0);
  const kitchenDiscount = useMemo(() => kitchenDiscountFor(cart.kitchen?.discountOffer, subtotal), [cart.kitchen, subtotal]);
  const gross = useMemo(() => buildOnDemandBill(cart.lines, kitchenDiscount, charges, cart.coupon?.itemDiscount ?? 0, cart.coupon?.deliveryDiscount ?? 0, 0, 0).toPay, [cart.lines, kitchenDiscount, charges, cart.coupon]);
  useEffect(() => {
    let active = true;
    maxRedeemableCashback(cashback, gross).then((m) => active && setMaxCashback(m));
    return () => { active = false; };
  }, [cashback, gross]);

  const bill = useMemo(() => buildOnDemandBill(cart.lines, kitchenDiscount, charges, cart.coupon?.itemDiscount ?? 0, cart.coupon?.deliveryDiscount ?? 0, useCashback ? Math.min(cashback, maxCashback) : 0, useWallet ? walletBalance : 0), [cart, kitchenDiscount, charges, useCashback, useWallet, cashback, maxCashback, walletBalance]);
  const base = bill.subTotal - bill.kitchenDiscount;
  const flow = useCouponFlow({ coupons, ctx: { itemSubTotal: base, deliveryCharge: bill.delivery, taxes: bill.taxes, isSubscription: false }, voucherBase: base, voucherOrderType: 'onDemand', apply: applyCoupon });

  const payment = usePayment({
    cartKind: 'ondemand',
    recap: { title: cart.kitchen?.kitchenName ?? 'Mealawe', amount: bill.toPay },
    build: () => {
      if (!profile || !mode) return null;
      if (!hasSavedAddress(address, saved) || !address) {
        setAddressError("Please choose one of your saved addresses to continue — we can't deliver to an unsaved current location.");
        return null;
      }
      if (!slot || (mode === 'advance' && !date)) {
        setSlotError(mode === 'advance' ? 'Please choose a delivery date and time slot.' : 'Please choose a delivery time slot.');
        return null;
      }
      setAddressError(null);
      setSlotError(null);
      return buildOnDemandBody({ profile, mode, kitchen: cart.kitchen, lines: cart.lines, bill, coupon: cart.coupon, address, slot, date, now: new Date() });
    },
  });

  if (!ready) return <Page narrow><Skeleton className="h-64" /></Page>;
  if (cart.lines.length === 0 || !cart.kitchen || !mode) return <><PageHeader title="Your cart" /><Page narrow><EmptyCart title="Add dishes from a kitchen." href="/home?tab=ondemand" cta="Browse kitchens" /></Page></>;

  const kitchen = cart.kitchen;
  const rows: BillRow[] = [
    { label: 'Items', value: bill.subTotal },
    { label: 'Kitchen offer', value: bill.kitchenDiscount, negative: true },
    { label: 'Coupon discount', value: bill.discount - bill.kitchenDiscount, negative: true },
    { label: 'Delivery', value: bill.delivery },
    { label: 'Packaging', value: bill.packaging },
    { label: 'Platform fee', value: bill.platform },
    { label: 'Taxes', value: bill.taxes },
    { label: 'Cashback used', value: bill.cashbackUsed, negative: true },
    { label: 'Wallet used', value: bill.moneyWalletUsed, negative: true },
  ];

  return (
    <>
      <PageHeader title="Your cart" />
      <Page>
        <div className="grid items-start gap-4 lg:grid-cols-2 xl:gap-8">
          <div className="space-y-4">
          <LineList header={<p className="mb-1 font-black">{kitchen.kitchenName} <span className="text-xs font-normal text-muted-foreground">· {mode === 'advance' ? 'Scheduled' : 'Order now'}</span></p>} lines={cart.lines.map((l) => ({ id: l.item._id, name: l.item.itemName, unitPrice: l.item.itemPrice, count: l.count, onChange: (n) => setCount(l.item, kitchen, mode, n) }))} />
          <CouponSection flow={flow} coupons={coupons} applied={cart.coupon} onClear={clearCoupon} />
          {isAuthenticated ? <RedeemRows wallet={walletBalance} cashback={cashback} useWallet={useWallet} useCashback={useCashback} onWallet={setUseWallet} onCashback={setUseCashback} maxCashback={maxCashback} /> : <p className="rounded-card border border-dashed border-border p-3 text-sm text-muted-foreground">Log in to use wallet and cashback.</p>}
          </div>
          <aside className="space-y-4 lg:sticky lg:top-20">
          <DateSlotPicker title={mode === 'advance' ? 'Delivery date & time' : 'Delivery time'} dates={mode === 'advance' ? dateOptions : undefined} date={date} onDate={setDate} slots={slots} slot={slot} onSlot={setSlot} emptyMessage={mode === 'advance' ? 'No time slots available.' : 'No more delivery slots today — try scheduling in advance.'} error={slotError} />
          <DeliverTo error={!hasSavedAddress(address, saved) ? addressError : null} onError={setAddressError} />
          <BillSummary rows={rows} total={bill.toPay} saving={bill.saving} />
          </aside>
        </div>
      </Page>
      {ENV.paymentsEnabled ? <PayBar total={bill.toPay} busy={payment.busy} error={payment.error} onPay={payment.pay} /> : <CompleteInAppBar total={bill.toPay} />}
    </>
  );
}

export default function OnDemandCartPage() { return <Suspense><Content /></Suspense>; }

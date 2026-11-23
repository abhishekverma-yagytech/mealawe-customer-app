'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';

import { clusterApi, hasSavedAddress, loadBulkCoupons } from '@mealawe/api';
import { buildBulkBill, chargesFromBulkConfig, loadBulkSlotWindow, loadFoodBoxVars, minDeliveryDate, nextCountFor, type BulkBillCharges, type DeliverySlot, type SubscriptionCoupon } from '@mealawe/core';
import { useBalances } from '@mealawe/hooks';
import { useAuthStore, useBulkCartStore, useClusterStore, useLocationStore } from '@mealawe/state';

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
import { buildBulkBody } from '@/payment/bodies';

/** Seven consecutive delivery dates starting at the earliest one the cart allows (same rule as mobile). */
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

function Content() {
  const { ready } = useBoot();
  const cart = useBulkCartStore((s) => s.cart);
  const setCount = useBulkCartStore((s) => s.setCount);
  const applyCoupon = useBulkCartStore((s) => s.applyCoupon);
  const clearCoupon = useBulkCartStore((s) => s.clearCoupon);
  const address = useLocationStore((s) => s.current);
  const saved = useLocationStore((s) => s.saved);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const profile = useAuthStore((s) => s.profile);
  const { wallet, cashback, refresh } = useBalances();

  const [charges, setCharges] = useState<BulkBillCharges | undefined>();
  const [coupons, setCoupons] = useState<SubscriptionCoupon[]>([]);
  const [packagingCost, setPackagingCost] = useState(0);
  const [useWallet, setUseWallet] = useState(false);
  const [useCashback, setUseCashback] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<DeliverySlot | null>(null);
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [slotError, setSlotError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
    loadBulkCoupons().then(setCoupons).catch(() => setCoupons([]));
    loadBulkSlotWindow().then(setSlots);
    const configName = useClusterStore.getState().currentConfigName();
    if (configName) clusterApi.searchClusterVariable(configName).then((cfg) => setCharges(chargesFromBulkConfig(cfg))).catch(() => undefined);
  }, [refresh]);
  useEffect(() => {
    if (cart.category !== 'foodbox' || cart.packaging !== 'bulk') return setPackagingCost(0);
    loadFoodBoxVars().then((v) => setPackagingCost(v.packagingCost));
  }, [cart.category, cart.packaging]);

  // A quantity change can push the earliest delivery date later: drop a date that is no longer offered,
  // and default to the first offered date / slot (same behaviour as the mobile cart).
  const dateOptions = useMemo(() => nextDates(minDeliveryDate(cart.lines)), [cart.lines]);
  useEffect(() => {
    if (date && !dateOptions.includes(date)) setDate(null);
    else if (!date && dateOptions.length) setDate(dateOptions[0]);
  }, [date, dateOptions]);
  useEffect(() => {
    if (!slot && slots.length) setSlot(slots[0]);
  }, [slot, slots]);

  const walletBalance = Number.parseFloat(wallet) || 0;
  const bill = useMemo(() => {
    const override = cart.category === 'foodbox' && cart.packaging === 'bulk' ? packagingCost * cart.lines.reduce((s, l) => s + l.count, 0) : undefined;
    return buildBulkBill(cart.lines, cart.orgInfo, cart.category ?? 'meals', charges, cart.coupon?.itemDiscount ?? 0, cart.coupon?.deliveryDiscount ?? 0, useCashback ? cashback : 0, useWallet ? walletBalance : 0, override);
  }, [cart, charges, useCashback, useWallet, cashback, walletBalance, packagingCost]);
  const flow = useCouponFlow({ coupons, ctx: { itemSubTotal: bill.subTotal, deliveryCharge: bill.delivery, taxes: bill.taxes, isSubscription: false }, voucherBase: bill.subTotal, voucherOrderType: 'bulk', apply: applyCoupon });

  const payment = usePayment({
    cartKind: 'bulk',
    recap: { title: `${cart.lines.length} item${cart.lines.length === 1 ? '' : 's'}`, amount: bill.toPay },
    build: () => {
      if (!profile || !cart.category || !cart.packaging) return null;
      if (!hasSavedAddress(address, saved) || !address) {
        setAddressError("Please choose one of your saved addresses to continue — we can't deliver to an unsaved current location.");
        return null;
      }
      if (!date || !slot) {
        setSlotError('Please choose a delivery date and time slot.');
        return null;
      }
      setAddressError(null);
      setSlotError(null);
      return buildBulkBody({ profile, category: cart.category, packaging: cart.packaging, lines: cart.lines, bill, coupon: cart.coupon, address, slot, date });
    },
  });

  if (!ready) return <Page narrow><Skeleton className="h-64" /></Page>;
  if (cart.lines.length === 0 || !cart.category || !cart.packaging || !cart.orgInfo) return <><PageHeader title="Bulk cart" /><Page narrow><EmptyCart title="Add items from the bulk menu." href="/home?tab=bulk" cta="Browse bulk menu" /></Page></>;

  const { category, packaging, orgInfo } = cart;
  const rows: BillRow[] = [
    { label: `Items (${bill.totalQty})`, value: bill.subTotal },
    { label: 'Discount', value: bill.discount, negative: true },
    { label: 'Delivery', value: bill.delivery },
    { label: 'Packaging', value: bill.packaging },
    { label: 'Platform fee', value: bill.platform },
    { label: 'Taxes', value: bill.taxes },
    { label: 'Cashback used', value: bill.cashbackUsed, negative: true },
    { label: 'Wallet used', value: bill.moneyWalletUsed, negative: true },
  ];

  return (
    <>
      <PageHeader title="Bulk cart" />
      <Page>
        <div className="grid items-start gap-4 lg:grid-cols-2 xl:gap-8">
          <div className="space-y-4">
          <LineList lines={cart.lines.map((l) => ({ id: l.item._id, name: l.item.itemName, unitPrice: l.itemPrice, count: l.count, onChange: (n) => setCount(l.item, category, packaging, orgInfo, nextCountFor(l.count, n - l.count, orgInfo.moq)) }))} />
          <CouponSection flow={flow} coupons={coupons} applied={cart.coupon} onClear={clearCoupon} />
          {isAuthenticated ? <RedeemRows wallet={walletBalance} cashback={cashback} useWallet={useWallet} useCashback={useCashback} onWallet={setUseWallet} onCashback={setUseCashback} /> : <p className="rounded-card border border-dashed border-border p-3 text-sm text-muted-foreground">Log in to use wallet and cashback.</p>}
          </div>
          <aside className="space-y-4 lg:sticky lg:top-20">
          <DateSlotPicker title="Delivery date & time" dates={dateOptions} date={date} onDate={setDate} slots={slots} slot={slot} onSlot={setSlot} emptyMessage="Delivery slots aren't available right now." error={slotError} />
          <DeliverTo error={!hasSavedAddress(address, saved) ? addressError : null} onError={setAddressError} />
          <BillSummary rows={rows} total={bill.toPay} saving={bill.saving} />
          </aside>
        </div>
      </Page>
      {ENV.paymentsEnabled ? <PayBar total={bill.toPay} busy={payment.busy} error={payment.error} onPay={payment.pay} /> : <CompleteInAppBar total={bill.toPay} />}
    </>
  );
}

export default function BulkCartPage() { return <Suspense><Content /></Suspense>; }

'use client';

import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

import { hasSavedAddress, loadSubscriptionCoupons } from '@mealawe/api';
import { buildBill, daysLabel, extraAddonDays, formatINR, formatShort, trackProceedToCheckout, type SubscriptionCoupon } from '@mealawe/core';
import { useBalances } from '@mealawe/hooks';
import { useAuthStore, useCartStore, useConfigureStore, useLocationStore } from '@mealawe/state';

import { useBoot } from '@/components/AppBootstrap';
import { BillSummary, CompleteInAppBar, CouponSection, EmptyCart, RedeemRows, type BillRow } from '@/components/cart/CartParts';
import { PayBar } from '@/components/cart/PayBar';
import { usePayment } from '@/components/cart/usePayment';
import { useCouponFlow } from '@/components/cart/useCouponFlow';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { DeliverTo } from '@/components/location/DeliverTo';
import { Card } from '@/components/ui/Card';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/ui/Switch';
import { Input } from '@/components/ui/Input';
import { ENV } from '@/lib/env';
import { buildSubscriptionBody } from '@/payment/bodies';

function Content() {
  const router = useRouter();
  const { ready } = useBoot();
  const cart = useCartStore((s) => s.cart);
  const charges = useCartStore((s) => s.charges);
  const loadCharges = useCartStore((s) => s.loadCharges);
  const setCount = useCartStore((s) => s.setCount);
  const applyCoupon = useCartStore((s) => s.applyCoupon);
  const clearCoupon = useCartStore((s) => s.clearCoupon);
  const setTree = useCartStore((s) => s.setTreePlantation);
  const clearTree = useCartStore((s) => s.clearTreePlantation);
  const setConfigure = useConfigureStore((s) => s.set);
  const address = useLocationStore((s) => s.current);
  const saved = useLocationStore((s) => s.saved);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { wallet, cashback, refresh } = useBalances();

  const [coupons, setCoupons] = useState<SubscriptionCoupon[]>([]);
  const [useWallet, setUseWallet] = useState(false);
  const [useCashback, setUseCashback] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  useEffect(() => {
    void loadCharges();
    refresh();
    loadSubscriptionCoupons().then(setCoupons).catch(() => setCoupons([]));
  }, [loadCharges, refresh]);

  const item = cart.item;
  const walletBalance = Number.parseFloat(wallet) || 0;
  const bill = useMemo(() => buildBill(cart, charges, useCashback ? cashback : 0, useWallet ? walletBalance : 0), [cart, charges, useCashback, useWallet, cashback, walletBalance]);
  const planDiscount = bill.discount - (cart.coupon?.itemDiscount ?? 0);
  const base = bill.subTotal - planDiscount;
  const flow = useCouponFlow({ coupons, ctx: { itemSubTotal: base, deliveryCharge: bill.delivery, taxes: bill.taxes, isSubscription: true }, voucherBase: base, voucherOrderType: 'subscription', apply: applyCoupon });

  const profile = useAuthStore((s) => s.profile);
  const payment = usePayment({
    cartKind: item?.isDineIn ? 'dinein' : 'subscription',
    recap: { title: item?.category ?? 'Mealawe', amount: bill.toPay, days: item?.package.days },
    build: () => {
      if (!item || !profile) return null;
      if (!item.isDineIn && !hasSavedAddress(address, saved)) {
        setAddressError('Please choose a saved delivery address to continue.');
        return null;
      }
      setAddressError(null);
      return buildSubscriptionBody({ profile, item, bill, coupon: cart.coupon, treePlantation: cart.treePlantation, treePlantationAmount: charges.treePlantationAmount, address, now: new Date() });
    },
  });

  useEffect(() => {
    if (addressError && (item?.isDineIn || hasSavedAddress(address, saved))) setAddressError(null);
  }, [address, saved, item?.isDineIn, addressError]);
  useEffect(() => {
    if (item) trackProceedToCheckout('subscription', { total_items: 1, total_prqt: item.count, selling_amount: bill.toPay });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.package._id]);

  if (!ready) return <Page narrow><Skeleton className="h-64" /></Page>;
  if (!item) return <><PageHeader title="Your cart" /><Page narrow><EmptyCart title="Pick a subscription plan to get started." href="/home?tab=subscription" cta="Browse plans" /></Page></>;

  const pkg = item.package;
  const meal = item.breakfast ? 'Breakfast' : [item.lunch ? 'Lunch' : null, item.dinner ? 'Dinner' : null].filter(Boolean).join(' + ');
  const rows: BillRow[] = [
    { label: `${pkg.packageName ?? 'Plan'} (${bill.meals} meals)`, value: bill.packageTotal },
    { label: 'Add-ons', value: bill.addOnTotal },
    { label: 'Discount', value: bill.discount, negative: true },
    { label: 'Delivery', value: bill.delivery, original: bill.deliveryOriginal },
    { label: 'Packaging', value: bill.packaging, original: bill.packagingOriginal },
    { label: 'Platform fee', value: bill.platform, original: bill.platformOriginal },
    { label: 'Taxes', value: bill.taxes },
    { label: 'Tree plantation', value: bill.treePlantationCharge },
    { label: 'Cashback used', value: bill.cashbackUsed, negative: true },
    { label: 'Wallet used', value: bill.moneyWalletUsed, negative: true },
  ];

  const edit = () => {
    setConfigure({ package: pkg, category: item.category, isDineIn: item.isDineIn, initial: item });
    router.push('/subscription-configure');
  };

  return (
    <>
      <PageHeader title="Your cart" />
      <Page>
        <div className="grid items-start gap-4 lg:grid-cols-2 xl:gap-8">
          <div className="space-y-4">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-black">{pkg.packageName}</p>
                <p className="text-sm text-muted-foreground">{item.category} · {meal || '—'} · {daysLabel(pkg.days, extraAddonDays(item.addOns, item.deliveryOnWeekends))} days</p>
                {item.selectedDates[0] ? <p className="text-sm">Starts {formatShort(item.selectedDates[0])}</p> : null}
                {item.addOns.length ? <p className="mt-1 text-xs text-muted-foreground">Extras: {item.addOns.map((a) => a.addonName).join(', ')}</p> : null}
              </div>
              <button onClick={edit} aria-label="Edit plan" className="rounded-full p-2 hover:bg-muted"><Pencil className="size-4" /></button>
            </div>
            <div className="mt-3 flex items-center justify-between"><span className="text-sm">Quantity</span><QuantityStepper value={item.count} min={1} max={10} onChange={setCount} /></div>
          </Card>

          <CouponSection flow={flow} coupons={coupons} applied={cart.coupon} onClear={clearCoupon} />
          {isAuthenticated ? <RedeemRows wallet={walletBalance} cashback={cashback} useWallet={useWallet} useCashback={useCashback} onWallet={setUseWallet} onCashback={setUseCashback} /> : <p className="rounded-card border border-dashed border-border p-3 text-sm text-muted-foreground">Log in to use wallet and cashback.</p>}

          <Card>
            <div className="flex items-center justify-between gap-3">
              <div><p className="font-bold">Plant a tree with this order</p><p className="text-xs text-muted-foreground">One tree per order, in your name or a loved one&apos;s ({formatINR(bill.treePlantationCharge || 0)} if applicable)</p></div>
              <Switch label="Plant a tree" checked={!!cart.treePlantation?.enabled} onCheckedChange={(v) => (v ? setTree({ enabled: true, receiverName: cart.treePlantation?.receiverName ?? '' }) : clearTree())} />
            </div>
            {cart.treePlantation?.enabled ? <div className="mt-3"><Input aria-label="Tree receiver name" placeholder="Name on the certificate" value={cart.treePlantation.receiverName} onChange={(e) => setTree({ enabled: true, receiverName: e.target.value })} /></div> : null}
          </Card>

          </div>
          <aside className="space-y-4 lg:sticky lg:top-20">
          {!item.isDineIn ? <DeliverTo error={addressError} onError={setAddressError} /> : null}
          <BillSummary rows={rows} total={bill.toPay} saving={bill.saving} />
          </aside>
        </div>
      </Page>
      {ENV.paymentsEnabled ? <PayBar total={bill.toPay} busy={payment.busy} error={payment.error} onPay={payment.pay} /> : <CompleteInAppBar total={bill.toPay} />}
    </>
  );
}

export default function CartPage() { return <Suspense><Content /></Suspense>; }

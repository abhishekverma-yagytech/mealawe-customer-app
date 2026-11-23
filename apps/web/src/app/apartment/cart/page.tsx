'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';

import { ZERO_GST_CONFIG, formatINR, kvStorage, STORAGE_KEYS } from '@mealawe/core';
import { useBalances } from '@mealawe/hooks';
import { useAuthStore, useLocationStore } from '@mealawe/state';

import { useBoot } from '@/components/AppBootstrap';
import { BillSummary, CompleteInAppBar, EmptyCart, type BillRow } from '@/components/cart/CartParts';
import { LineList } from '@/components/cart/LineCart';
import { PayBar } from '@/components/cart/PayBar';
import { usePayment } from '@/components/cart/usePayment';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { ApartmentConflictDialog } from '@/components/apartment/ApartmentConflictDialog';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/ui/Switch';
import { loadApartmentAdvanceMenu, loadEligibleKitchens, loadOrderableMealTypes, quoteBucket, type ApartmentQuote } from '@/features/apartment/api';
import { useApartmentCartStore } from '@/features/apartment/cartStore';
import { billForBucket, buildApartmentBucketBody, buildApartmentQuoteBody, paymentBucketsOf, type PaymentBucket } from '@/features/apartment/checkout';
import { loadApartmentConfig, type ApartmentConfig } from '@/features/apartment/config';
import { ORDER_TYPE_LABEL, dayLabel, formatHHmm, groupCartLines, isPastAdvanceCutoff, isoDateLabel } from '@/features/apartment/pricing';
import type { AdvanceDeliverySlot, MealType, OrderType } from '@/features/apartment/types';
import { ENV } from '@/lib/env';
import { cn } from '@/lib/cn';
import { customerFrom, customerLocationFrom } from '@/payment/bodies';

const DEFAULT_DELIVERY: Record<string, number> = { instant: 30, today: 30, advance: 30 };
const MEAL_LABEL: Record<string, string> = { Breakfast: 'Breakfast', Lunch: 'Lunch', HighTea: 'High tea', Dinner: 'Dinner' };
type Modes = Partial<Record<OrderType, { deliveryEnabled: boolean; pickupEnabled: boolean }>>;

function groupTitle(g: { orderType: OrderType; mealType: MealType | null; lines: { offer: { itemServingDate?: string } }[] }): string {
  if (g.orderType === 'advance') {
    const d = g.lines[0]?.offer.itemServingDate;
    return `Advance${d ? ` · ${isoDateLabel(d)}` : ''}`;
  }
  return g.orderType === 'today' && g.mealType ? `Today · ${MEAL_LABEL[g.mealType] ?? g.mealType}` : ORDER_TYPE_LABEL[g.orderType];
}

function Content() {
  const { ready } = useBoot();
  const profile = useAuthStore((s) => s.profile);
  const address = useLocationStore((s) => s.current);
  const lines = useApartmentCartStore((s) => s.lines);
  const meta = useApartmentCartStore((s) => s.meta);
  const pickup = useApartmentCartStore((s) => s.pickup);
  const advanceDeliverySlot = useApartmentCartStore((s) => s.advanceDeliverySlot);
  const setLineCount = useApartmentCartStore((s) => s.setLineCount);
  const setPickup = useApartmentCartStore((s) => s.setPickup);
  const setAdvanceDeliverySlot = useApartmentCartStore((s) => s.setAdvanceDeliverySlot);
  const { wallet: walletStr, refresh } = useBalances();
  const walletBalance = Math.max(0, Number(walletStr) || 0);

  const [config, setConfig] = useState<ApartmentConfig | null>(null);
  const [applyWallet, setApplyWallet] = useState(false);
  const [wingName, setWing] = useState('');
  const [roomNumber, setRoom] = useState('');
  const [kitchenDeliveryCharge, setKitchenDeliveryCharge] = useState<number | null>(null);
  const [modes, setModes] = useState<Modes>({});
  const [staleGroups, setStaleGroups] = useState<Set<string>>(new Set());
  const [kitchenStale, setKitchenStale] = useState(false);
  const [slots, setSlots] = useState<AdvanceDeliverySlot[] | undefined>();
  const [quotes, setQuotes] = useState<Record<string, ApartmentQuote>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const groups = useMemo(() => groupCartLines(lines), [lines]);
  const buckets = useMemo(() => paymentBucketsOf(groups, pickup), [groups, pickup]);
  const hasAdvance = groups.some((g) => g.orderType === 'advance');
  const allPickup = groups.length > 0 && groups.every((g) => !!pickup[g.key]);

  useEffect(() => {
    refresh();
    loadApartmentConfig().then(setConfig).catch(() => undefined);
    // Wing / room are remembered between orders (same storage key as mobile).
    try {
      const saved = kvStorage.getObject<{ wingName?: string; roomNumber?: string }>(STORAGE_KEYS.apartmentCartAddress);
      setWing(saved?.wingName ?? address?.wingName ?? '');
      setRoom(saved?.roomNumber ?? address?.roomNumber ?? '');
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);
  useEffect(() => {
    try {
      kvStorage.setObject(STORAGE_KEYS.apartmentCartAddress, { wingName, roomNumber });
    } catch {
      // ignore
    }
  }, [wingName, roomNumber]);

  // Revalidate against the live server: Today slots may have passed their cutoff, the kitchen may have dropped out, fulfilment
  // modes / delivery charge / Advance slots are read live (a cart can be days old).
  const geo = address?.geolocation;
  useEffect(() => {
    if (!meta || !geo) return;
    let active = true;
    const types = [...new Set(groups.map((g) => g.orderType))];
    (async () => {
      const todayGroups = groups.filter((g) => g.orderType === 'today');
      if (todayGroups.length > 0) {
        const orderable = await loadOrderableMealTypes(meta.kitchenId);
        if (active) setStaleGroups(new Set(todayGroups.filter((g) => g.mealType && !orderable.includes(g.mealType)).map((g) => g.key)));
      } else if (active) setStaleGroups(new Set());
      const eligible = await Promise.all(types.map((t) => loadEligibleKitchens(meta.apartmentId, t, geo.lng, geo.lat)));
      if (!active) return;
      setKitchenStale(eligible.some((list) => !list.some((k) => k._id === meta.kitchenId)));
      const mine = eligible.flat().find((k) => k._id === meta.kitchenId);
      setKitchenDeliveryCharge(typeof mine?.apartmentSettings?.deliveryCharge === 'number' ? mine.apartmentSettings.deliveryCharge : null);
      setModes((mine?.apartmentSettings?.fulfillmentModes as Modes | undefined) ?? {});
      if (types.includes('advance')) {
        const menu = await loadApartmentAdvanceMenu(meta.apartmentId);
        if (!active) return;
        const rows = menu ? [...menu.activeItems, ...menu.inactiveItems] : [];
        setSlots(rows.find((r) => r.kitchenId === meta.kitchenId)?.advanceDeliverySlots);
      } else setSlots(undefined);
    })().catch(() => undefined);
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.kitchenId, groups.length, geo?.lat, geo?.lng]);

  // A slot whose kitchen supports only one fulfilment mode must actually check out in that mode.
  useEffect(() => {
    for (const g of groups) {
      const m = modes[g.orderType] ?? g.lines[0]?.offer.kitchenFulfillmentModes;
      if (!m || m.deliveryEnabled === m.pickupEnabled) continue;
      if (!!pickup[g.key] !== m.pickupEnabled) setPickup(g.key, m.pickupEnabled);
    }
  }, [groups, pickup, modes, setPickup]);

  const defaultDelivery = config?.defaultDeliveryChargeByOrderType ?? DEFAULT_DELIVERY;
  const gst = config ?? ZERO_GST_CONFIG;
  const bills = useMemo(() => new Map(buckets.map((b) => [b.key, billForBucket(b, kitchenDeliveryCharge, defaultDelivery, gst)])), [buckets, kitchenDeliveryCharge, defaultDelivery, gst]);

  const customer = profile ? customerFrom(profile) : null;
  const location = address ? customerLocationFrom(address) : undefined;

  // Real server price per bucket; falls back to the local estimate until it (or if it fails to) arrive.
  useEffect(() => {
    setQuotes({});
    if (!meta || !customer || buckets.length === 0) return;
    let active = true;
    Promise.all(
      buckets.map((b) =>
        quoteBucket(buildApartmentQuoteBody({ customer, location, meta, wingName: wingName.trim(), roomNumber: roomNumber.trim(), bucket: b, advanceDeliverySlot, bill: bills.get(b.key)! })).then((q) => [b.key, q] as const),
      ),
    ).then((entries) => {
      if (!active) return;
      const next: Record<string, ApartmentQuote> = {};
      for (const [k, q] of entries) if (q) next[k] = q;
      setQuotes(next);
    });
    return () => {
      active = false;
    };
    // wing/room are passthrough fields (never priced), so typing there must not refire the quote.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets, bills, meta?.kitchenId, profile?._id, advanceDeliverySlot]);

  const totalOf = (b: PaymentBucket) => quotes[b.key]?.payableAmount ?? bills.get(b.key)?.estimatedTotal ?? 0;

  // Web pays one bucket per redirect: the first now, the rest from this same cart afterwards.
  const current = buckets[0];
  const currentTotal = current ? totalOf(current) : 0;
  const walletUsed = applyWallet && current ? Math.min(walletBalance, currentTotal) : 0;
  const toPay = Math.max(0, Math.round((currentTotal - walletUsed) * 100) / 100);

  const slotOptions = (slots ?? []).filter((s) => {
    const adv = groups.find((g) => g.orderType === 'advance');
    return !isPastAdvanceCutoff(adv?.lines[0]?.offer.kitchenMealTiming, s.mealType, adv?.lines[0]?.offer.itemServingDate, config?.advanceCutoffMinutes ?? 720);
  });
  const slotMissing = hasAdvance && !advanceDeliverySlot;
  const flatMissing = !allPickup && (!wingName.trim() || !roomNumber.trim());
  const blocked = staleGroups.size > 0 || kitchenStale;

  const payment = usePayment({
    cartKind: 'apartment',
    recap: { title: meta?.kitchenName ?? 'Apartment order', amount: toPay },
    apartmentGroupKeys: current?.groups.map((g) => g.key),
    build: () => {
      if (!profile || !customer || !meta || !current) return null;
      if (!address || !location) return setFormError('Choose a delivery address first.'), null;
      if (blocked) return setFormError('Some items are no longer available. Remove them to continue.'), null;
      if (slotMissing) return setFormError('Choose a delivery slot for your Advance order.'), null;
      if (flatMissing) return setFormError('Enter your wing / tower and flat number.'), null;
      setFormError(null);
      return buildApartmentBucketBody({ customer, location, meta, wingName: wingName.trim(), roomNumber: roomNumber.trim(), bucket: current, advanceDeliverySlot, bill: bills.get(current.key)!, walletUsed });
    },
  });

  if (!ready) return <Page narrow><Skeleton className="h-64" /></Page>;
  if (lines.length === 0 || !meta) return <><PageHeader title="Your order" /><Page narrow><EmptyCart title="Add dishes from your apartment kitchens." href="/apartment" cta="Browse menu" /></Page></>;

  const bill = current ? bills.get(current.key)! : undefined;
  const quote = current ? quotes[current.key] : undefined;
  const rows: BillRow[] = bill
    ? [
        { label: 'Items', value: bill.subTotal },
        { label: 'Delivery', value: quote?.deliveryCharges ?? bill.estimatedDelivery },
        { label: 'Platform fee', value: bill.platformCharges },
        { label: 'Packaging', value: bill.packagingCharges },
        { label: 'Taxes & GST', value: quote ? Math.max(0, Math.round((quote.payableAmount - quote.itemAmount - quote.deliveryCharges - bill.platformCharges - bill.packagingCharges) * 100) / 100) : bill.taxes },
        { label: 'Wallet used', value: walletUsed, negative: true },
      ]
    : [];

  return (
    <>
      <PageHeader title="Your order" right={<Link href="/apartment" className="text-sm font-bold text-primary">Add more</Link>} />
      <Page>
        <div className="grid items-start gap-4 lg:grid-cols-2 xl:gap-8">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">From <strong className="text-foreground">{meta.kitchenName}</strong>{meta.apartmentName ? ` · ${meta.apartmentName}` : ''}</p>
            {kitchenStale ? <p role="alert" className="rounded-card bg-destructive/10 p-3 text-sm text-destructive">This kitchen is no longer taking some of these orders. Clear the cart and pick again.</p> : null}
            {groups.map((g) => {
              const m = modes[g.orderType] ?? g.lines[0]?.offer.kitchenFulfillmentModes;
              const both = !m || (m.deliveryEnabled && m.pickupEnabled);
              const stale = staleGroups.has(g.key);
              return (
                <div key={g.key} className={cn('space-y-2', stale && 'opacity-70')}>
                  <LineList
                    header={<p className="mb-1 font-black">{groupTitle(g)}</p>}
                    lines={g.lines.map((l) => ({ id: l.key, name: l.dishName, unitPrice: l.offer.price, count: l.count, onChange: (n) => setLineCount(l.key, n) }))}
                  />
                  {stale ? <p role="alert" className="text-sm text-destructive">This meal slot has closed — remove these items.</p> : null}
                  <div className="flex items-center justify-between rounded-card border border-border bg-card p-3 text-sm">
                    <span className="font-bold">{pickup[g.key] ? 'Self-pickup' : 'Delivery to your flat'}</span>
                    {both ? (
                      <label className="flex items-center gap-2">Self-pickup <Switch label={`Self-pickup for ${groupTitle(g)}`} checked={!!pickup[g.key]} onCheckedChange={(v) => setPickup(g.key, v)} /></label>
                    ) : (
                      <span className="text-muted-foreground">{m?.pickupEnabled ? 'Pickup only' : 'Delivery only'}</span>
                    )}
                  </div>
                </div>
              );
            })}

            {hasAdvance ? (
              <fieldset className="rounded-card border border-border bg-card p-4">
                <legend className="px-1 font-black">Advance delivery slot</legend>
                {slotOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No delivery slots are open for this day.</p>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {slotOptions.map((s) => (
                      <button key={s.mealType} type="button" aria-pressed={advanceDeliverySlot === s.mealType} onClick={() => setAdvanceDeliverySlot(s.mealType)} className={cn('rounded-card border px-3 py-2 text-left text-sm', advanceDeliverySlot === s.mealType ? 'border-primary bg-primary/10' : 'border-border')}>
                        <span className="block font-bold">{MEAL_LABEL[s.mealType]}</span>
                        <span className="text-xs text-muted-foreground">{formatHHmm(s.deliveryStartTime)} – {formatHHmm(s.deliveryEndTime)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {slotMissing ? <p className="mt-2 text-xs text-muted-foreground">Choose when you want it delivered ({dayLabel(1)} / {dayLabel(2)} per your items).</p> : null}
              </fieldset>
            ) : null}

            <section className="divide-y divide-border rounded-card border border-border bg-card">
              <div className="flex items-center justify-between gap-3 p-4">
                <div><p className="font-bold">Mealawe wallet</p><p className="text-xs text-muted-foreground">Balance {formatINR(walletBalance)}</p></div>
                <Switch label="Use wallet" checked={applyWallet && walletBalance > 0} onCheckedChange={(v) => setApplyWallet(v && walletBalance > 0)} />
              </div>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-20">
            <Card>
              <h2 className="mb-2 text-lg font-black">Delivery details</h2>
              <p className="text-sm text-muted-foreground">{address ? [address.address, address.location].filter(Boolean).join(', ') : 'No address selected'} <Link href="/addresses" className="font-bold text-primary">Change</Link></p>
              {!allPickup ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="text-sm font-bold">Wing / tower<input value={wingName} onChange={(e) => setWing(e.target.value)} className="mt-1 w-full rounded-card border border-border bg-background px-3 py-2 font-normal" placeholder="e.g. A" /></label>
                  <label className="text-sm font-bold">Flat no.<input value={roomNumber} onChange={(e) => setRoom(e.target.value)} className="mt-1 w-full rounded-card border border-border bg-background px-3 py-2 font-normal" placeholder="e.g. 1204" /></label>
                </div>
              ) : null}
            </Card>
            {buckets.length > 1 ? (
              <p className="rounded-card border border-dashed border-border p-3 text-sm text-muted-foreground">
                Your cart needs {buckets.length} separate payments. Pay for the first one now; the rest stay here for the next payment.
              </p>
            ) : null}
            {bill ? <BillSummary rows={rows} total={toPay} /> : null}
          </aside>
        </div>
      </Page>
      <ApartmentConflictDialog />
      {ENV.paymentsEnabled ? <PayBar total={toPay} busy={payment.busy} error={formError ?? payment.error} disabled={blocked} onPay={payment.pay} /> : <CompleteInAppBar total={currentTotal} />}
    </>
  );
}

export default function ApartmentCartPage() {
  return <Suspense><Content /></Suspense>;
}

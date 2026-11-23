'use client';

import { Check, Ticket } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { formatINR, type AppliedCoupon, type SubscriptionCoupon } from '@mealawe/core';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/lib/cn';

import type { useCouponFlow } from './useCouponFlow';

export interface BillRow { label: string; value: number; original?: number; negative?: boolean; bold?: boolean }

export function BillSummary({ rows, total, saving }: { rows: BillRow[]; total: number; saving?: number }) {
  return (
    <section aria-labelledby="bill-h" className="rounded-card border border-border bg-card p-4">
      <h2 id="bill-h" className="mb-3 text-lg font-black">Bill summary</h2>
      <dl className="space-y-2 text-sm">
        {rows.filter((r) => r.value !== 0 || r.bold).map((r) => (
          <div key={r.label} className="flex justify-between gap-3">
            <dt className={cn(r.bold && 'font-bold')}>{r.label}</dt>
            <dd className={cn(r.negative && 'text-primary', r.bold && 'font-bold')}>
              {r.original && r.original > r.value ? <s className="mr-1 text-muted-foreground">{formatINR(r.original)}</s> : null}
              {r.negative ? '− ' : ''}{formatINR(Math.abs(r.value))}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex justify-between border-t border-border pt-3 text-lg font-black"><span>To pay</span><span>{formatINR(total)}</span></div>
      {saving && saving > 0 ? <p className="mt-2 rounded-card bg-primary/10 p-2 text-center text-sm font-bold text-primary">You&apos;re saving {formatINR(saving)} on this order</p> : null}
    </section>
  );
}

export function CouponSection({ flow, coupons, applied, onClear }: { flow: ReturnType<typeof useCouponFlow>; coupons: SubscriptionCoupon[]; applied: AppliedCoupon | null; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  return (
    <section aria-labelledby="coupon-h" className="rounded-card border border-border bg-card p-4">
      <h2 id="coupon-h" className="sr-only">Coupons</h2>
      {applied ? (
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-bold"><Check className="size-5 text-primary" />{applied.couponCode} applied — saving {formatINR(applied.discount)}</p>
          <button onClick={onClear} className="text-sm font-bold text-destructive">Remove</button>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="flex w-full items-center justify-between gap-2 text-left">
          <span className="flex items-center gap-2 font-bold"><Ticket className="size-5 text-reward" />Apply coupon</span>
          <span className="text-sm font-bold text-primary">{flow.best ? `Save ${formatINR(flow.best.discount)}` : 'View offers'}</span>
        </button>
      )}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) flow.setError(null); }} title="Coupons & offers">
        <form className="mb-4 flex items-start gap-2" onSubmit={async (e) => { e.preventDefault(); if (await flow.applyCode(code)) { setOpen(false); setCode(''); } }}>
          <Input aria-label="Coupon code" placeholder="Enter coupon code" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" />
          <Button type="submit" disabled={flow.busy || !code.trim()}>Apply</Button>
        </form>
        {flow.error ? <p role="alert" className="mb-3 text-sm text-destructive">{flow.error}</p> : null}
        <ul className="space-y-2">
          {coupons.length === 0 ? <li className="text-sm text-muted-foreground">No offers available right now.</li> : null}
          {coupons.map((c) => {
            const e = flow.evaluate(c);
            return (
              <li key={c.couponCode} className="rounded-card border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="font-black">{c.couponCode}</p><p className="text-sm text-muted-foreground">{c.couponHeader ?? c.description}</p>{e.reason ? <p className="mt-1 text-xs text-destructive">{e.reason}</p> : <p className="mt-1 text-xs font-bold text-primary">Save {formatINR(e.discount)}</p>}</div>
                  <Button size="sm" variant="outline" disabled={!!e.reason || flow.busy} onClick={async () => { if (await flow.applyCoupon(c)) setOpen(false); }}>Apply</Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Dialog>
    </section>
  );
}

export function RedeemRows({ wallet, cashback, useWallet, useCashback, onWallet, onCashback, maxCashback }: { wallet: number; cashback: number; useWallet: boolean; useCashback: boolean; onWallet: (v: boolean) => void; onCashback: (v: boolean) => void; maxCashback?: number }) {
  const rows = [
    { key: 'cb', label: 'Cashback', sub: maxCashback !== undefined ? `Balance ${formatINR(cashback)} · up to ${formatINR(maxCashback)} usable` : `Balance ${formatINR(cashback)}`, on: useCashback, set: onCashback, disabled: cashback <= 0 || maxCashback === 0 },
    { key: 'w', label: 'Mealawe wallet', sub: `Balance ${formatINR(wallet)}`, on: useWallet, set: onWallet, disabled: wallet <= 0 },
  ];
  return (
    <section aria-label="Redeem" className="divide-y divide-border rounded-card border border-border bg-card">
      {rows.map((r) => (
        <div key={r.key} className={cn('flex items-center justify-between gap-3 p-4', r.disabled && 'opacity-50')}>
          <div><p className="font-bold">{r.label}</p><p className="text-xs text-muted-foreground">{r.sub}</p></div>
          <Switch label={r.label} checked={r.on && !r.disabled} onCheckedChange={r.set} />
        </div>
      ))}
    </section>
  );
}

const PLAY = 'https://play.google.com/store/apps/details?id=com.mealawe.app';
const APP_STORE = 'https://itunes.apple.com/app/1602148451';

/** V1 has no payment gateway: the bar shows the total and points to the app to complete the order. */
export function CompleteInAppBar({ total }: { total: number }) {
  return (
    <div className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-2xl rounded-3xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur">
      <div className="mx-auto flex max-w-xl flex-col gap-2">
        <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">To pay</span><span className="text-xl font-black">{formatINR(total)}</span></div>
        <p className="text-center text-sm">Online checkout is coming soon. <strong>Complete your order in the Mealawe app.</strong></p>
        <div className="flex gap-2">
          <Button asChild variant="outline" block><a href={PLAY} target="_blank" rel="noopener noreferrer">Google Play</a></Button>
          <Button asChild block><a href={APP_STORE} target="_blank" rel="noopener noreferrer">App Store</a></Button>
        </div>
      </div>
    </div>
  );
}

export function EmptyCart({ title, href, cta }: { title: string; href: string; cta: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-xl font-black">Your cart is empty</p>
      <p className="mt-1 text-muted-foreground">{title}</p>
      <Button asChild className="mt-5"><Link href={href}>{cta}</Link></Button>
    </div>
  );
}

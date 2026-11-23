'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

import { hasSavedAddress } from '@mealawe/api';
import { addonKey, addonLineTotal, daysLabel, dineInMealTime, extraAddonDays, finalPrice, formatINR, formatShort, generateRun, nextStartDates, trackSubAddonSelected, type AddOn, type SubscriptionConfig } from '@mealawe/core';
import { useCartStore, useConfigureStore, useLocationStore } from '@mealawe/state';

import { useBoot } from '@/components/AppBootstrap';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { DeliverTo } from '@/components/location/DeliverTo';
import { StepProgress } from '@/components/subscription/StepProgress';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { useLoginGate } from '@/lib/useLoginGate';

function Content() {
  const router = useRouter();
  const { ready } = useBoot();
  const context = useConfigureStore((s) => s.context);
  const setSubscription = useCartStore((s) => s.setSubscription);
  const requireLogin = useLoginGate();
  const loadCharges = useCartStore((s) => s.loadCharges);
  const current = useLocationStore((s) => s.current);
  const saved = useLocationStore((s) => s.saved);

  const pkg = context?.package;
  const days = pkg?.days ?? 0;
  const initial = context?.initial;
  const isDineIn = !!context?.isDineIn;
  const breakfast = initial?.breakfast ?? context?.breakfast ?? false;
  const dineMeal = isDineIn && pkg ? dineInMealTime(pkg) : null;

  const [meal] = useState<'lunch' | 'dinner' | 'both'>(() => {
    if (initial) return initial.lunch && initial.dinner ? 'both' : initial.dinner ? 'dinner' : 'lunch';
    if (dineMeal?.isDetermined) return dineMeal.hasLunch && dineMeal.hasDinner ? 'both' : dineMeal.hasDinner ? 'dinner' : 'lunch';
    const l = context?.lunch ?? true;
    const d = context?.dinner ?? false;
    return l && d ? 'both' : d ? 'dinner' : 'lunch';
  });
  const lunch = !breakfast && (meal === 'lunch' || meal === 'both');
  const dinner = !breakfast && (meal === 'dinner' || meal === 'both');
  const weekends = pkg?.deliveryOnWeekends ?? false;

  const [startIso, setStartIso] = useState(initial?.selectedDates?.[0] ?? '');
  const [selected, setSelected] = useState<Set<string>>(() => new Set((initial?.addOns ?? []).map((a) => a._id ?? a.addonName ?? '')));
  const [addressError, setAddressError] = useState<string | null>(null);

  useEffect(() => void loadCharges(), [loadCharges]);
  const chips = useMemo(() => nextStartDates(14, weekends, weekends), [weekends]);
  useEffect(() => {
    if (!startIso || !chips.some((c) => c.iso === startIso && c.enabled)) setStartIso(chips.find((c) => c.enabled)?.iso ?? '');
  }, [chips, startIso]);
  const selectedDates = useMemo(() => (startIso ? generateRun(startIso, days, weekends, weekends) : []), [startIso, days, weekends]);

  const mealsPerDay = isDineIn ? 1 : breakfast ? 1 : lunch && dinner ? 2 : 1;
  const addons = useMemo(() => pkg?.addonsList ?? [], [pkg]);
  const chosen = addons.filter((a) => selected.has(addonKey(a)));
  const addonTotal = chosen.reduce((s, a) => s + addonLineTotal(a, mealsPerDay, days), 0);
  const extra = extraAddonDays(chosen, weekends);

  if (!ready) return <Page narrow><Skeleton className="h-64" /></Page>;
  if (!context || !pkg) {
    return (
      <Page narrow>
        <div className="py-16 text-center">
          <p className="font-bold">Your plan selection expired</p>
          <Button asChild className="mt-4"><Link href="/home">Back to home</Link></Button>
        </div>
      </Page>
    );
  }

  const planTotal = finalPrice(pkg) * mealsPerDay;
  const itemTotal = planTotal + addonTotal;
  const canSave = selectedDates.length === days && (breakfast || lunch || dinner);

  const toggle = (a: AddOn) => {
    const key = addonKey(a);
    trackSubAddonSelected(a.addonName ?? '', a.addOnType, !selected.has(key));
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const save = () => {
    if (!canSave) return;
    if (!hasSavedAddress(current, saved)) return setAddressError('Please choose a saved delivery address to continue.');
    setAddressError(null);
    const config: SubscriptionConfig = {
      package: pkg,
      category: context.category,
      deliveryOnWeekends: weekends,
      addOns: addons.filter((a) => selected.has(addonKey(a))).map((a) => ({ ...a, selected: true })),
      selectedDates: [...selectedDates].sort(),
      lunch,
      dinner,
      breakfast,
      isDineIn: context.isDineIn,
    };
    // Login is required to add a plan to the cart; the configured plan is kept (persisted store) and the user returns here.
    if (!requireLogin()) return;
    setSubscription(config);
    router.push('/cart');
  };

  return (
    <>
      <PageHeader title="Customize your plan" />
      <Page narrow>
        <div className="space-y-6">
          {!isDineIn ? <StepProgress step={2} /> : null}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{context.category} · {daysLabel(days, extra)} days</span>
            {!isDineIn ? <Link href="/subscription-plan" className="font-bold text-primary">Change plan</Link> : null}
          </div>

          <div className="rounded-card border border-border bg-card p-4">
            <p className="font-black">{pkg.packageName}</p>
            <p className="text-sm text-muted-foreground">{mealsPerDay} meal{mealsPerDay > 1 ? 's' : ''}/day · {days} days</p>
            <p className="mt-1 text-lg font-black">{formatINR(planTotal)}</p>
          </div>

          <section aria-labelledby="meal-h">
            <h2 id="meal-h" className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Meal time</h2>
            <p className="font-bold">{breakfast ? 'Breakfast' : meal === 'both' ? 'Lunch & dinner' : meal === 'dinner' ? 'Dinner' : 'Lunch'}</p>
          </section>

          {addons.length > 0 ? (
            <section aria-labelledby="extras-h">
              <h2 id="extras-h" className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Extras</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {addons.map((a) => {
                  const on = selected.has(addonKey(a));
                  return (
                    <li key={addonKey(a)}>
                      <button aria-pressed={on} onClick={() => toggle(a)} className={cn('flex w-full items-center justify-between gap-2 rounded-card border-2 p-3 text-left', on ? 'border-primary bg-primary/5' : 'border-border bg-card')}>
                        <span className="min-w-0"><span className="block truncate font-bold">{a.addonName}</span><span className="text-xs text-muted-foreground">{formatINR(addonLineTotal(a, mealsPerDay, days))}</span></span>
                        {on ? <Check className="size-5 text-primary" /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="start-h">
            <h2 id="start-h" className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Start date</h2>
            <div className="flex gap-2 overflow-x-auto pb-2" role="radiogroup" aria-label="Start date">
              {chips.map((c) => (
                <button key={c.iso} role="radio" aria-checked={startIso === c.iso} disabled={!c.enabled} onClick={() => setStartIso(c.iso)} className={cn('flex w-16 shrink-0 flex-col items-center rounded-card border-2 p-2 disabled:opacity-40', startIso === c.iso ? 'border-primary bg-primary/10' : 'border-border bg-card')}>
                  <span className="text-[10px] font-bold text-muted-foreground">{c.label}</span>
                  <span className="text-lg font-black">{c.dom}</span>
                  <span className="text-[10px]">{c.month}</span>
                </button>
              ))}
            </div>
            {selectedDates.length > 0 ? <p className="text-xs text-muted-foreground">{formatShort(selectedDates[0])} → {formatShort(selectedDates[selectedDates.length - 1])}</p> : null}
          </section>

          <DeliverTo error={addressError} onError={setAddressError} />
        </div>
      </Page>
      <div className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-2xl rounded-3xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="flex-1"><p className="text-xs text-muted-foreground">Item total</p><p className="text-lg font-black">{formatINR(itemTotal)}</p></div>
          <Button size="lg" disabled={!canSave} onClick={save}>Review cart</Button>
        </div>
      </div>
    </>
  );
}

export default function SubscriptionConfigure() { return <Suspense><Content /></Suspense>; }

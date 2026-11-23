'use client';

import { Moon, Sun } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

import { aiRecommendationCopy, finalPrice, formatINR, formatMealTimeWindow, offPercent, perDay, pickDefaultPackage, planTag, trackProductView, type MealPackage, type SubCategory } from '@mealawe/core';
import { useSubscriptionCatalog } from '@mealawe/hooks';
import { useConfigureStore, useSubscriptionBrowseStore } from '@mealawe/state';

import { Page, PageHeader } from '@/components/layout/PageHeader';
import { StepProgress } from '@/components/subscription/StepProgress';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';

type Meal = 'lunch' | 'dinner' | 'both';

function Content() {
  const router = useRouter();
  const categoryParam = useSearchParams().get('categoryParam');
  const { categories, packagesFor, loading } = useSubscriptionCatalog({ includeUnmanaged: true });
  const storeCategory = useSubscriptionBrowseStore((s) => s.category);
  const setSelectedPackage = useSubscriptionBrowseStore((s) => s.setSelectedPackage);
  const setConfigure = useConfigureStore((s) => s.set);

  // Store first (in-session), URL param second (refresh / deep link safe).
  const category: SubCategory | null = useMemo(
    () => storeCategory ?? categories.find((c) => c.param.toLowerCase() === categoryParam?.toLowerCase()) ?? null,
    [storeCategory, categories, categoryParam],
  );
  const packages = useMemo(() => (category ? packagesFor(category.param) : []), [category, packagesFor]);
  const isBreakfast = packages.some((p) => p.isBreakFast === true);

  const times = category?.mealTimes;
  const lunchWin = times?.find((m) => m.mealType === 'lunch');
  const dinnerWin = times?.find((m) => m.mealType === 'dinner');
  const breakfastWin = times?.find((m) => m.mealType === 'breakfast');
  const configured = !!times?.length;
  const showLunch = !configured || !!lunchWin;
  const showDinner = !configured || !!dinnerWin;
  const lunchLabel = lunchWin ? formatMealTimeWindow(lunchWin.startTime, lunchWin.endTime) : '12–1:30 PM';
  const dinnerLabel = dinnerWin ? formatMealTimeWindow(dinnerWin.startTime, dinnerWin.endTime) : '7:30–9 PM';
  const breakfastLabel = breakfastWin ? formatMealTimeWindow(breakfastWin.startTime, breakfastWin.endTime) : '7–9 AM';

  const [meal, setMeal] = useState<Meal>('lunch');
  useEffect(() => {
    if (isBreakfast) return;
    if (meal === 'both' && !(showLunch && showDinner)) setMeal(showDinner ? 'dinner' : 'lunch');
    else if (meal === 'lunch' && !showLunch && showDinner) setMeal('dinner');
    else if (meal === 'dinner' && !showDinner && showLunch) setMeal('lunch');
  }, [isBreakfast, showLunch, showDinner, meal]);

  const [pickedId, setPickedId] = useState<string | null>(null);
  const defaultId = useMemo(() => pickDefaultPackage(packages)?._id ?? null, [packages]);
  const selectedId = pickedId && packages.some((p) => p._id === pickedId) ? pickedId : defaultId;
  const selected: MealPackage | null = packages.find((p) => p._id === selectedId) ?? packages[0] ?? null;

  useEffect(() => {
    setSelectedPackage(selected);
    if (selected) trackProductView(selected.packageName ?? category?.name ?? '', category?.name, finalPrice(selected));
  }, [selected, setSelectedPackage, category?.name]);

  const next = () => {
    if (!category || !selected) return;
    setConfigure({
      package: selected,
      category: category.name,
      lunch: isBreakfast ? false : meal !== 'dinner',
      dinner: isBreakfast ? false : meal !== 'lunch',
      breakfast: isBreakfast,
    });
    router.push('/subscription-configure');
  };

  const slot = (key: Meal, label: string, time: string, Icon: typeof Sun) => (
    <button key={key} aria-pressed={meal === key} onClick={() => setMeal(key)} className={cn('flex min-w-0 flex-1 flex-col items-start gap-1 rounded-card border p-3 text-left sm:flex-row sm:items-center sm:gap-2', meal === key ? 'border-primary bg-primary/10' : 'border-border bg-card')}>
      <Icon className="size-5 shrink-0 text-offer" />
      <span className="min-w-0"><span className="block font-bold">{label}</span><span className="block text-[11px] leading-tight text-muted-foreground">{time}</span></span>
    </button>
  );

  return (
    <>
      <PageHeader title="Choose your plan" />
      <Page narrow>
        {loading && !category ? <Skeleton className="h-64" /> : !category ? (
          <div className="py-10 text-center">
            <p className="font-bold">No category selected</p>
            <p className="mt-1 text-muted-foreground">Pick a category to see its plans.</p>
            <Button asChild className="mt-4"><Link href="/home">Back to home</Link></Button>
          </div>
        ) : (
          <div className="space-y-6">
            <StepProgress step={1} />
            <div className="flex items-center justify-between">
              <p className="text-lg font-black">{category.name}</p>
              <Link href="/home" className="text-sm font-bold text-primary">Change</Link>
            </div>

            <section aria-labelledby="mt">
              <h2 id="mt" className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Meal time</h2>
              <div className="flex gap-2">
                {isBreakfast ? (
                  <div className="flex flex-1 items-center gap-2 rounded-card border border-primary bg-primary/10 p-3"><Sun className="size-5 text-offer" /><span><span className="block font-bold">Breakfast</span><span className="text-xs text-muted-foreground">{breakfastLabel}</span></span></div>
                ) : (
                  <>
                    {showLunch ? slot('lunch', 'Lunch', lunchLabel, Sun) : null}
                    {showDinner ? slot('dinner', 'Dinner', dinnerLabel, Moon) : null}
                    {showLunch && showDinner ? slot('both', 'Both', 'Lunch + dinner', Sun) : null}
                  </>
                )}
              </div>
            </section>

            <section aria-labelledby="pl">
              <h2 id="pl" className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Plan</h2>
              {packages.length === 0 ? <p className="text-muted-foreground">No plans available for this category right now.</p> : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {packages.map((p) => {
                    const active = p._id === selected?._id;
                    const off = offPercent(p);
                    return (
                      <li key={p._id ?? p.packageName}>
                        <button aria-pressed={active} onClick={() => setPickedId(p._id ?? null)} className={cn('relative w-full rounded-card border-2 p-4 text-left transition', active ? 'border-primary bg-primary/5' : 'border-border bg-card')}>
                          <span className="text-xs font-bold text-plan">{planTag(p)}</span>
                          {p.isBestSeller ? <span className="ml-2 rounded-full bg-offer px-2 py-0.5 text-[10px] font-bold text-white">POPULAR</span> : null}
                          <span className="mt-1 block text-lg font-black">{p.days} days</span>
                          <span className="block text-sm">{formatINR(perDay(p))}/day</span>
                          <span className="mt-1 block font-bold">{formatINR(finalPrice(p))}{off > 0 ? <> <s className="text-xs font-normal text-muted-foreground">{formatINR(p.packagePrice)}</s> <span className="text-xs text-offer">{off}% off</span></> : null}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {selected && packages.length > 1 ? <p className="mt-3 rounded-card bg-muted p-3 text-sm">{aiRecommendationCopy(selected, packages)}</p> : null}
            </section>
          </div>
        )}
      </Page>
      {category && selected ? (
        <div className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-2xl rounded-3xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="flex-1"><p className="text-xs text-muted-foreground">{selected.days} days</p><p className="text-lg font-black">{formatINR(finalPrice(selected) * (isBreakfast ? 1 : meal === 'both' ? 2 : 1))}</p></div>
            <Button size="lg" onClick={next}>Next</Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function SubscriptionPlan() { return <Suspense><Content /></Suspense>; }

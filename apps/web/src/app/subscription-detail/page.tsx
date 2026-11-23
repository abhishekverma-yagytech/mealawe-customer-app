'use client';

import { Check } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

import { loadWeeklyMenu } from '@mealawe/api';
import { cheapestPriceLabels, type IncludedItem, type SubCategory, type WeekMenu } from '@mealawe/core';
import { useSubscriptionCatalog } from '@mealawe/hooks';
import { useSubscriptionBrowseStore } from '@mealawe/state';

import { Page, PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { Img, imgUri } from '@/lib/img';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function Included({ items }: { items: IncludedItem[] | undefined }) {
  if (!items?.length) return null;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {[...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((i) => (
        <li key={i.label} className="flex items-center gap-2 text-sm"><Check className="size-4 shrink-0 text-primary" />{i.label}</li>
      ))}
    </ul>
  );
}

function Content() {
  const router = useRouter();
  const categoryParam = useSearchParams().get('categoryParam');
  const { categories, loading, packagesFor } = useSubscriptionCatalog({ includeUnmanaged: true });
  const storeCategory = useSubscriptionBrowseStore((s) => s.category);
  const setCategory = useSubscriptionBrowseStore((s) => s.setCategory);
  const selectedDay = useSubscriptionBrowseStore((s) => s.selectedDay);
  const setSelectedDay = useSubscriptionBrowseStore((s) => s.setSelectedDay);

  const category: SubCategory | null = useMemo(() => {
    const match = categoryParam ? categories.find((c) => c.param.toLowerCase() === categoryParam.toLowerCase()) : undefined;
    return match ?? storeCategory ?? null;
  }, [categoryParam, categories, storeCategory]);

  const [weeks, setWeeks] = useState<WeekMenu[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [diet, setDiet] = useState<'veg' | 'nonveg'>('veg');
  const [touched, setTouched] = useState(false);

  useEffect(() => setSelectedDay(DAYS[new Date().getDay()]), [setSelectedDay]);
  useEffect(() => {
    if (!touched) setDiet(category?.veg === false ? 'nonveg' : 'veg');
  }, [category?.veg, touched]);

  const param = category?.param;
  useEffect(() => {
    if (!param) return;
    let active = true;
    setMenuLoading(true);
    loadWeeklyMenu(param).then((r) => active && setWeeks(r)).catch(() => active && setWeeks([])).finally(() => active && setMenuLoading(false));
    return () => { active = false; };
  }, [param]);

  const week = weeks.find((w) => w.isSelected) ?? weeks[0];
  const dayList = diet === 'nonveg' ? week?.nonvegMenuList : week?.vegMenuList;
  const dayMenu = (dayList ?? []).find((d) => d.day === selectedDay);
  const hasNonveg = !!week?.nonvegMenuList?.length && !!week?.vegMenuList?.length;
  const price = category ? cheapestPriceLabels(packagesFor(category.param), category.homeTilePackageId) : null;

  const choosePlan = () => {
    if (!category) return;
    setCategory(category);
    const planUrl = `/subscription-plan?categoryParam=${encodeURIComponent(category.param)}`;
    router.push(planUrl); // anonymous browsing: login is requested when the plan is added to the cart
  };

  return (
    <>
      <PageHeader title={category?.name ?? 'Meals'} />
      <Page narrow>
        {loading && !category ? (
          <Skeleton className="h-72" />
        ) : !category ? (
          <p className="text-muted-foreground">We couldn&apos;t find that category.</p>
        ) : (
          <div className="space-y-6">
            <Img src={imgUri(category.detailImage ?? category.image)} alt={category.name} className="h-56 w-full rounded-3xl sm:h-80" />
            <div>
              <h2 className="text-2xl font-black">{category.name}</h2>
              {category.tagline ? <p className="mt-1 text-muted-foreground">{category.tagline}</p> : null}
              {price ? <p className="mt-2 font-bold">From {price.current} {price.original ? <s className="text-sm font-normal text-muted-foreground">{price.original}</s> : null}</p> : null}
            </div>

            <section aria-labelledby="menu-h">
              <div className="mb-3 flex items-center justify-between">
                <h3 id="menu-h" className="text-lg font-black">This week&apos;s menu</h3>
                {hasNonveg ? (
                  <div className="flex gap-1" role="group" aria-label="Diet">
                    {(['veg', 'nonveg'] as const).map((d) => (
                      <button key={d} aria-pressed={diet === d} onClick={() => { setTouched(true); setDiet(d); }} className={cn('rounded-full border px-3 py-1 text-xs font-bold', diet === d ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>{d === 'veg' ? 'Veg' : 'Non-veg'}</button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div role="tablist" className="mb-3 flex gap-2 overflow-x-auto">
                {DAYS.map((d) => (
                  <button key={d} role="tab" aria-selected={selectedDay === d} onClick={() => setSelectedDay(d)} className={cn('shrink-0 rounded-full px-3 py-1.5 text-sm font-bold', selectedDay === d ? 'bg-primary text-primary-foreground' : 'bg-muted')}>{d.slice(0, 3)}</button>
                ))}
              </div>
              {menuLoading ? <Skeleton className="h-28" /> : !dayMenu ? <p className="text-muted-foreground">Menu for this day will be updated soon.</p> : (
                <dl className="space-y-3 rounded-card border border-border bg-card p-4">
                  {(['breakfast', 'lunch', 'dinner'] as const).map((m) => dayMenu[m]?.description ? (
                    <div key={m}><dt className="text-xs font-bold uppercase text-muted-foreground">{m}</dt><dd>{dayMenu[m]?.description}</dd></div>
                  ) : null)}
                </dl>
              )}
            </section>

            {(diet === 'nonveg' ? category.includedItemsNonVeg : category.includedItemsVeg)?.length ? (
              <section aria-labelledby="inc-h">
                <h3 id="inc-h" className="mb-3 text-lg font-black">What&apos;s included</h3>
                <Included items={diet === 'nonveg' ? category.includedItemsNonVeg : category.includedItemsVeg} />
              </section>
            ) : null}
          </div>
        )}
      </Page>
      {category ? (
        <div className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-2xl rounded-3xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur">
          <div className="mx-auto max-w-5xl"><Button block size="lg" onClick={choosePlan}>Choose your plan</Button></div>
        </div>
      ) : null}
    </>
  );
}

export default function SubscriptionDetail() {
  return <Suspense><Content /></Suspense>;
}

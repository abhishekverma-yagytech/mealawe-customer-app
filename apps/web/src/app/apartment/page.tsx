'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { formatINR } from '@mealawe/core';
import { useLocationStore } from '@mealawe/state';

import { useBoot } from '@/components/AppBootstrap';
import { ApartmentAddSheet } from '@/components/apartment/ApartmentAddSheet';
import { ApartmentConflictDialog } from '@/components/apartment/ApartmentConflictDialog';
import { LottieHero } from '@/components/home/LottieHero';
import { BottomNav } from '@/components/layout/BottomNav';
import { TopNav } from '@/components/layout/TopNav';
import { Button } from '@/components/ui/Button';
import { CartBar } from '@/components/ui/CartBar';
import { DietMark } from '@/components/ui/DietMark';
import { Skeleton } from '@/components/ui/Skeleton';
import { loadApartmentCatalog, type ApartmentCatalogFilters } from '@/features/apartment/catalog';
import { useApartmentCartStore } from '@/features/apartment/cartStore';
import { useApartmentEligibilityStore, useApartmentOrderTypeStore } from '@/features/apartment/eligibility';
import { ORDER_TYPES, ORDER_TYPE_LABEL, cheapestOfferFor, currentMealType, isDishBlocked, mealOrderFrom } from '@/features/apartment/pricing';
import type { ApartmentDish, MealType, OrderType } from '@/features/apartment/types';
import { Img } from '@/lib/img';
import { cn } from '@/lib/cn';
import { useLoginGate } from '@/lib/useLoginGate';

const TAGLINE: Record<OrderType, string> = {
  instant: 'Ready in minutes from kitchens in your complex.',
  today: 'Order for a meal slot today.',
  advance: 'Plan ahead — tomorrow or the day after.',
};
const MEAL_LABEL: Record<MealType, string> = { Breakfast: 'Breakfast', Lunch: 'Lunch', HighTea: 'High tea', Dinner: 'Dinner' };

export default function ApartmentPage() {
  const { ready } = useBoot();
  const requireLogin = useLoginGate();
  const apartment = useApartmentEligibilityStore((s) => s.apartment);
  const orderType = useApartmentOrderTypeStore((s) => s.orderType);
  const setOrderType = useApartmentOrderTypeStore((s) => s.setOrderType);
  const geo = useLocationStore((s) => s.current?.geolocation);
  const lines = useApartmentCartStore((s) => s.lines);

  const [search, setSearch] = useState('');
  const [veg, setVeg] = useState(false);
  const [mealSlot, setMealSlot] = useState<MealType | undefined>();
  const [dishes, setDishes] = useState<ApartmentDish[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApartmentDish | null>(null);
  const seq = useRef(0);

  const filters = useMemo<ApartmentCatalogFilters>(
    () => ({ search: search.trim() || undefined, diet: veg ? 'veg' : undefined, mealSlot: orderType === 'today' ? mealSlot : undefined }),
    [search, veg, mealSlot, orderType],
  );

  const load = useCallback(
    async (nextPage: number) => {
      if (!apartment || !geo) return;
      const mine = ++seq.current;
      setLoading(true);
      setError(null);
      try {
        const res = await loadApartmentCatalog(apartment.apartmentId, orderType, { lng: geo.lng, lat: geo.lat }, filters, nextPage);
        if (mine !== seq.current) return;
        setDishes((prev) => {
          if (nextPage === 1) return res.dishes;
          const seen = new Set(prev.map((d) => d.key));
          return [...prev, ...res.dishes.filter((d) => !seen.has(d.key))];
        });
        setHasMore(res.hasMore);
        setPage(nextPage);
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : 'Could not load the menu');
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [apartment, geo, orderType, filters],
  );

  // Debounce so typing in search does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => void load(1), 250);
    return () => clearTimeout(t);
  }, [load]);

  // Today: refresh every minute so slots that cross their cutoff flip to unavailable.
  useEffect(() => {
    if (orderType === 'advance') return;
    const t = setInterval(() => void load(1), 60_000);
    return () => clearInterval(t);
  }, [orderType, load]);

  const slots = mealOrderFrom(currentMealType());
  const cartTotal = lines.reduce((sum, l) => sum + l.offer.price * l.count, 0);
  const cartCount = lines.reduce((sum, l) => sum + l.count, 0);

  return (
    <>
      <TopNav />
      <main className="mx-auto w-full max-w-7xl px-4 pb-44 pt-5 sm:px-8 lg:px-12">
        <h1 className="text-2xl font-black">Apartment</h1>
        {apartment ? <p className="text-sm text-muted-foreground">{apartment.apartmentName ?? 'Your apartment complex'} · {TAGLINE[orderType]}</p> : null}

        {!ready || apartment === undefined ? (
          <Skeleton className="mt-6 h-64" />
        ) : apartment === null ? (
          <section className="mt-10 text-center">
            <h2 className="text-xl font-black">Apartment ordering isn’t available here</h2>
            <p className="mt-1 text-muted-foreground">Choose an address inside a supported apartment complex to see its kitchens.</p>
            <Button asChild className="mt-4"><Link href="/addresses">Change address</Link></Button>
          </section>
        ) : (
          <>
            <div className="mt-4"><LottieHero tab={`apartment_${orderType}`} /></div>
            <div role="tablist" aria-label="Order type" className="mt-4 flex gap-2">
              {ORDER_TYPES.map((t) => (
                <button key={t} role="tab" aria-selected={orderType === t} onClick={() => setOrderType(t)} className={cn('rounded-full px-5 py-2 text-sm font-bold transition', orderType === t ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-border')}>
                  {ORDER_TYPE_LABEL[t]}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex min-w-60 flex-1 items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
                <Search className="size-5 text-muted-foreground" aria-hidden />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search dishes" aria-label="Search dishes" className="flex-1 bg-transparent outline-none" />
              </label>
              <button type="button" aria-pressed={veg} onClick={() => setVeg((v) => !v)} className={cn('flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold', veg ? 'border-veg bg-veg/10' : 'border-border')}>
                <DietMark veg /> Veg only
              </button>
            </div>

            {orderType === 'today' ? (
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Meal slot">
                <button type="button" aria-pressed={!mealSlot} onClick={() => setMealSlot(undefined)} className={cn('rounded-full px-4 py-1.5 text-sm font-bold', !mealSlot ? 'bg-foreground text-background' : 'bg-muted')}>All</button>
                {slots.map((m) => (
                  <button key={m} type="button" aria-pressed={mealSlot === m} onClick={() => setMealSlot(m)} className={cn('rounded-full px-4 py-1.5 text-sm font-bold', mealSlot === m ? 'bg-foreground text-background' : 'bg-muted')}>{MEAL_LABEL[m]}</button>
                ))}
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="mt-6 text-destructive">{error} <button className="font-bold underline" onClick={() => void load(1)}>Retry</button></p>
            ) : null}

            {loading && dishes.length === 0 ? (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-52" />)}
              </div>
            ) : dishes.length === 0 && !error ? (
              <p className="mt-8 text-muted-foreground">Nothing on the {ORDER_TYPE_LABEL[orderType]} menu right now.</p>
            ) : (
              <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {dishes.map((d) => {
                  const blocked = isDishBlocked(d);
                  const price = cheapestOfferFor(d.offers).price;
                  return (
                    <li key={d.key}>
                      <button type="button" onClick={() => requireLogin() && setSelected(d)} className={cn('block h-full w-full overflow-hidden rounded-card border border-border bg-card text-left shadow-sm transition hover:shadow-md', blocked && 'opacity-60')}>
                        <Img src={d.imageUrl} alt={d.name} className="h-28 w-full sm:h-36" />
                        <span className="block p-3">
                          <span className="flex items-center gap-2"><DietMark veg={d.isVeg} /><span className="truncate font-bold">{d.name}</span></span>
                          <span className="mt-1 block text-sm">{blocked ? <span className="text-muted-foreground">Unavailable right now</span> : <>From {formatINR(price)}</>}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {hasMore ? (
              <div className="mt-6 text-center">
                <Button variant="outline" disabled={loading} onClick={() => void load(page + 1)}>{loading ? 'Loading…' : 'Load more'}</Button>
              </div>
            ) : null}
          </>
        )}
      </main>
      <CartBar count={cartCount} total={cartTotal} href="/apartment/cart" label="View order" aboveNav />
      <BottomNav />
      {apartment ? <ApartmentAddSheet dish={selected} orderType={orderType} apartment={apartment} onClose={() => setSelected(null)} /> : null}
      <ApartmentConflictDialog />
    </>
  );
}

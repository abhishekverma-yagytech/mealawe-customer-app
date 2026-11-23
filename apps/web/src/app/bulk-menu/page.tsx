'use client';

import { Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

import { loadBulkMenu } from '@mealawe/api';
import { formatINR, isBelowMoq, nextCountFor, slabNoteFor, unitPriceFor, type BulkCategory, type BulkMenuItem, type BulkMenuResponse, type BulkPackaging } from '@mealawe/core';
import { useBulkCartStore } from '@mealawe/state';

import { Page, PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { CartBar } from '@/components/ui/CartBar';
import { Dialog } from '@/components/ui/Dialog';
import { DietMark } from '@/components/ui/DietMark';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { useLoginGate } from '@/lib/useLoginGate';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { ENV } from '@/lib/env';
import { Img } from '@/lib/img';

const TITLES: Record<BulkCategory, string> = { meals: 'Bulk Meals', snacks: 'Bulk Snacks', foodbox: 'Food Box' };
const VALID: BulkCategory[] = ['meals', 'snacks', 'foodbox'];
const imageFor = (p?: string) => (p ? (p.startsWith('http') ? p : `${ENV.apiUrl}/images/${p}`) : undefined);

function Content() {
  const raw = useSearchParams().get('category') as BulkCategory | null;
  const category: BulkCategory = raw && VALID.includes(raw) ? raw : 'meals';
  const cart = useBulkCartStore((s) => s.cart);
  const setCount = useBulkCartStore((s) => s.setCount);
  const requireLogin = useLoginGate();
  const reset = useBulkCartStore((s) => s.reset);

  const [packaging, setPackaging] = useState<BulkPackaging>('individual');
  const [menu, setMenu] = useState<BulkMenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [diet, setDiet] = useState<'Veg' | 'NonVeg' | null>(null);
  const [pending, setPending] = useState<{ item: BulkMenuItem; delta: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadBulkMenu(category, packaging).then((res) => {
      if (!cancelled) {
        setMenu(res);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [category, packaging]);

  const matchesView = cart.category === category && cart.packaging === packaging;
  const countOf = (id: string) => (matchesView ? (cart.lines.find((l) => l.item._id === id)?.count ?? 0) : 0);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (menu?.itemList ?? []).filter((i) => (!q || i.itemName.toLowerCase().includes(q)) && (diet === 'Veg' ? i.isVeg : diet === 'NonVeg' ? !i.isVeg : true));
  }, [menu, search, diet]);

  const apply = (item: BulkMenuItem, delta: number) => {
    if (!menu) return;
    const { itemList: _list, ...orgInfo } = menu;
    void _list;
    setCount(item, category, packaging, orgInfo, nextCountFor(countOf(item._id), delta, orgInfo.moq));
  };
  const change = (item: BulkMenuItem, delta: number) => {
    if (delta > 0 && !requireLogin()) return; // guests browse freely; login is asked when they add to the cart
    if (!matchesView && cart.lines.length > 0 && delta > 0) return setPending({ item, delta });
    apply(item, delta);
  };

  const lines = matchesView ? cart.lines : [];
  const qty = lines.reduce((s, l) => s + l.count, 0);
  const subTotal = lines.reduce((s, l) => s + l.itemPrice * l.count, 0);

  return (
    <>
      <PageHeader title={TITLES[category]} />
      <Page>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(['individual', 'bulk'] as const).map((p) => (
              <button key={p} aria-pressed={packaging === p} onClick={() => setPackaging(p)} className={cn('rounded-full border px-4 py-1.5 text-sm font-bold capitalize', packaging === p ? 'border-plan bg-plan text-white' : 'border-border bg-card')}>{p}</button>
            ))}
            <span className="flex-1" />
            {menu ? <span className="text-xs text-muted-foreground">Min {menu.moq} units</span> : null}
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items" aria-label="Search items" className="flex-1 bg-transparent outline-none" />
          </label>
          <div className="flex gap-2" role="group" aria-label="Diet filter">
            {(['Veg', 'NonVeg'] as const).map((d) => (
              <button key={d} aria-pressed={diet === d} onClick={() => setDiet(diet === d ? null : d)} className={cn('rounded-full border px-4 py-1.5 text-sm font-bold', diet === d ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>{d === 'NonVeg' ? 'Non-veg' : 'Veg'}</button>
            ))}
          </div>

          {loading ? (
            <Skeleton className="h-64" />
          ) : !menu || items.length === 0 ? (
            <p className="text-muted-foreground">No items available right now.</p>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {items.map((item) => {
                const count = countOf(item._id);
                const price = unitPriceFor(item, Math.max(count, 1), menu, category);
                const note = slabNoteFor(item, count, menu, category);
                return (
                  <li key={item._id} className="flex gap-3 rounded-card border border-border bg-card p-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-bold"><DietMark veg={item.isVeg} /><span className="truncate">{item.itemName}</span></p>
                      <p className="mt-0.5 font-bold">{formatINR(price)}{note?.discounted ? <s className="ml-2 text-xs font-normal text-muted-foreground">{formatINR(note.basePrice)}</s> : null}</p>
                      {note && !note.discounted ? <p className="text-xs font-bold text-offer">Buy {note.nextThreshold}+ for {formatINR(note.nextPrice)} each</p> : null}
                      {item.itemDescription ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.itemDescription}</p> : null}
                      {isBelowMoq(count, menu) ? <p className="mt-1 text-xs font-bold text-destructive">Minimum {menu.moq} units</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end justify-between gap-2">
                      <Img src={imageFor(item.itemImage)} alt={item.itemName} className="size-20 rounded-card" />
                      {count > 0 ? <QuantityStepper value={count} onChange={(n) => change(item, n - count)} /> : <Button size="sm" variant="outline" onClick={() => change(item, 1)}>Add</Button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <CartBar count={qty} total={subTotal} href="/bulk-cart" />
        <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)} title="Start a new bulk cart?" description="Your cart has items from a different bulk category or packaging. Adding this will clear it.">
          <div className="flex gap-2">
            <Button variant="outline" block onClick={() => setPending(null)}>Keep current cart</Button>
            <Button block onClick={() => { if (pending) { reset(); apply(pending.item, pending.delta); } setPending(null); }}>Start new cart</Button>
          </div>
        </Dialog>
      </Page>
    </>
  );
}

export default function BulkMenuPage() {
  return <Suspense><Content /></Suspense>;
}

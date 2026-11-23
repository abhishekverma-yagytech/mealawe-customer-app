'use client';

import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { groupMenuByMode, itemStatusFor, loadOrderingWindows, formatINR, trackProductView, type ItemStatus, type OnDemandKitchen, type OnDemandMenuItem, type OnDemandMode, type OrderingWindows } from '@mealawe/core';
import { useOnDemandCartStore, useVegModeStore } from '@mealawe/state';

import { Button } from '@/components/ui/Button';
import { CartBar } from '@/components/ui/CartBar';
import { Dialog } from '@/components/ui/Dialog';
import { DietMark } from '@/components/ui/DietMark';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { useLoginGate } from '@/lib/useLoginGate';
import { cn } from '@/lib/cn';
import { Img } from '@/lib/img';
import { ENV } from '@/lib/env';

const STATUS_COPY: Record<ItemStatus, string | null> = {
  available: null,
  missed: 'Ordering closed for today',
  'coming-next': 'Opens later today',
  'sold-out': 'Sold out',
  'not-available': 'Not available',
};

const imageFor = (p?: string) => (p ? (p.startsWith('http') ? p : `${ENV.apiUrl}/images/${p}`) : undefined);

export function KitchenMenuView({ kitchen, items, initialMode = 'allDay' }: { kitchen: OnDemandKitchen; items: OnDemandMenuItem[]; initialMode?: OnDemandMode }) {
  const cart = useOnDemandCartStore((s) => s.cart);
  const setCount = useOnDemandCartStore((s) => s.setCount);
  const requireLogin = useLoginGate();
  const reset = useOnDemandCartStore((s) => s.reset);
  const vegOnly = useVegModeStore((s) => s.vegOnly);

  const [mode, setMode] = useState<OnDemandMode>(initialMode);
  const [windows, setWindows] = useState<OrderingWindows | null>(null);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<{ item: OnDemandMenuItem; count: number } | null>(null);

  useEffect(() => {
    let active = true;
    loadOrderingWindows().then((w) => active && setWindows(w));
    return () => {
      active = false;
    };
  }, []);

  const sameContext = cart.kitchen?._id === kitchen._id && cart.mode === mode;
  const countOf = (item: OnDemandMenuItem) => (sameContext ? (cart.lines.find((l) => l.item._id === item._id)?.count ?? 0) : 0);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupMenuByMode(items, mode)
      .map((g) => ({ ...g, items: g.items.filter((i) => (!q || i.itemName.toLowerCase().includes(q)) && (!vegOnly || i.isVeg)) }))
      .filter((g) => g.items.length > 0);
  }, [items, mode, search, vegOnly]);

  const change = (item: OnDemandMenuItem, count: number) => {
    if (count > 0 && !requireLogin()) return; // guests browse freely; login is asked when they add to the cart
    const otherCart = cart.lines.length > 0 && !sameContext;
    if (otherCart && count > 0) return setPending({ item, count });
    setCount(item, kitchen, mode, count);
  };

  const inCart = sameContext ? cart.lines : [];
  const total = inCart.reduce((s, l) => s + l.item.itemPrice * l.count, 0);
  const qty = inCart.reduce((s, l) => s + l.count, 0);

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-full bg-muted p-1" role="tablist" aria-label="Ordering mode">
        {([['allDay', 'Order now'], ['advance', 'Schedule in advance']] as const).map(([m, label]) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn('rounded-full px-4 py-1.5 text-sm font-bold', mode === m && 'bg-card shadow')}>{label}</button>
        ))}
      </div>
      <label className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3">
        <Search className="size-5 text-muted-foreground" aria-hidden />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search dishes" aria-label="Search dishes" className="flex-1 bg-transparent outline-none" />
      </label>

      {groups.length === 0 ? <p className="text-muted-foreground">Nothing on the menu for this mode right now.</p> : null}
      {groups.map((g) => (
        <section key={g.groupName} aria-label={g.groupName}>
          <h3 className="mb-2 text-lg font-black">{g.groupName}</h3>
          <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {g.items.map((item) => {
              const count = countOf(item);
              const status = windows ? itemStatusFor(item, mode, windows, count) : 'available';
              const blocked = status !== 'available';
              return (
                <li key={item._id} className="flex gap-3 rounded-card border border-border bg-card p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-bold"><DietMark veg={item.isVeg} /><span className="truncate">{item.itemName}</span></p>
                    <p className="mt-0.5 font-bold">{formatINR(item.itemPrice)}</p>
                    {item.itemDescription ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.itemDescription}</p> : null}
                    {STATUS_COPY[status] ? <p className="mt-1 text-xs font-bold text-destructive">{STATUS_COPY[status]}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end justify-between gap-2">
                    <Img src={imageFor(item.itemImage)} alt={item.itemName} className="size-20 rounded-card" />
                    {count > 0 ? (
                      <QuantityStepper value={count} onChange={(n) => change(item, n)} />
                    ) : (
                      <Button size="sm" variant="outline" disabled={blocked || !kitchen.kitchenOpened} onClick={() => { trackProductView(item.itemName, kitchen.kitchenName, item.itemPrice); change(item, 1); }}>
                        Add
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <CartBar count={qty} total={total} href="/on-demand-cart" />

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)} title="Start a new cart?" description="Your cart has items from a different kitchen or ordering mode. Adding this will clear it.">
        <div className="flex gap-2">
          <Button variant="outline" block onClick={() => setPending(null)}>Keep current cart</Button>
          <Button block onClick={() => { if (pending) { reset(); setCount(pending.item, kitchen, mode, pending.count); } setPending(null); }}>Start new cart</Button>
        </div>
      </Dialog>
    </div>
  );
}

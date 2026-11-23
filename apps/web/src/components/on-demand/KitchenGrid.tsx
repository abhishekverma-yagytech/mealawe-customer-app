'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { isNearby, type OnDemandKitchen, type OnDemandMode } from '@mealawe/core';
import { useVegModeStore } from '@mealawe/state';

import { cn } from '@/lib/cn';

import { KitchenCard } from './KitchenCard';

type Diet = 'Veg' | 'NonVeg' | 'Jain' | null;

/** Search + diet filter + near/other split for a list of kitchens (shared by home tab and /on-demand-kitchens). */
export function KitchenGrid({ kitchens, mode }: { kitchens: OnDemandKitchen[]; mode: OnDemandMode }) {
  const router = useRouter();
  const vegOnly = useVegModeStore((s) => s.vegOnly);
  const [search, setSearch] = useState('');
  const [diet, setDiet] = useState<Diet>(null);

  const { near, other } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = kitchens.filter((k) => (!q || k.kitchenName.toLowerCase().includes(q)) && (!vegOnly || (k.mealType?.includes('Veg') ?? false)) && (!diet || (k.mealType?.includes(diet) ?? false)));
    return { near: filtered.filter(isNearby), other: filtered.filter((k) => !isNearby(k)) };
  }, [kitchens, search, diet, vegOnly]);

  const open = (k: OnDemandKitchen) => router.push(`/on-demand-kitchen?kitchenId=${encodeURIComponent(k._id)}&mode=${mode}`);
  const section = (title: string, list: OnDemandKitchen[]) =>
    list.length === 0 ? null : (
      <section className="space-y-3">
        <h3 className="text-lg font-black">{title}</h3>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {list.map((k) => (
            <li key={k._id}><KitchenCard kitchen={k} onOpen={() => open(k)} /></li>
          ))}
        </ul>
      </section>
    );

  return (
    <div className="space-y-5">
      <label className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
        <Search className="size-5 text-muted-foreground" aria-hidden />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search kitchens" aria-label="Search kitchens" className="flex-1 bg-transparent outline-none" />
      </label>
      <div className="flex gap-2" role="group" aria-label="Diet filter">
        {(['Veg', 'NonVeg', 'Jain'] as const).map((d) => (
          <button key={d} aria-pressed={diet === d} onClick={() => setDiet(diet === d ? null : d)} className={cn('rounded-full border px-4 py-1.5 text-sm font-bold', diet === d ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>
            {d === 'NonVeg' ? 'Non-veg' : d}
          </button>
        ))}
      </div>
      {near.length + other.length === 0 ? <p className="text-muted-foreground">No kitchens match right now.</p> : null}
      {section('Near you', near)}
      {section(near.length ? 'More kitchens' : 'Kitchens', other)}
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { loadDineInPackages } from '@mealawe/api';
import { finalPrice, formatINR, type MealPackage } from '@mealawe/core';
import { useConfigureStore } from '@mealawe/state';

import { Card } from '@/components/ui/Card';
import { DietMark } from '@/components/ui/DietMark';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';

type Diet = 'Veg' | 'NonVeg' | null;

export function DineInHome() {
  const router = useRouter();
  const setConfigure = useConfigureStore((s) => s.set);
  const [packages, setPackages] = useState<MealPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [diet, setDiet] = useState<Diet>(null);

  useEffect(() => {
    let active = true;
    loadDineInPackages().then((r) => {
      if (active) {
        setPackages(r);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const showChips = packages.some((p) => p.packageType === 'Veg') && packages.some((p) => p.packageType === 'NonVeg');
  const list = useMemo(() => (diet ? packages.filter((p) => p.packageType === diet) : packages), [packages, diet]);

  const choose = (pkg: MealPackage) => {
    setConfigure({ package: pkg, category: 'Dine In', isDineIn: true });
    router.push('/subscription-configure');
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black">Dine in</h2>
        <p className="text-muted-foreground">Eat at the kitchen — no delivery charges.</p>
      </div>
      {showChips ? (
        <div className="flex gap-2" role="group" aria-label="Diet filter">
          {([['Veg', 'Veg'], ['NonVeg', 'Non-veg']] as const).map(([v, label]) => (
            <button key={v} aria-pressed={diet === v} onClick={() => setDiet(diet === v ? null : v)} className={cn('rounded-full border px-4 py-1.5 text-sm font-bold', diet === v ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : list.length === 0 ? (
        <p className="text-muted-foreground">No dine-in plans available right now.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((p) => (
            <li key={p._id ?? p.packageName}>
              <button onClick={() => choose(p)} className="w-full text-left">
                <Card className="transition hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-bold"><DietMark veg={p.packageType !== 'NonVeg'} />{p.packageName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{p.days} days</p>
                    </div>
                    <p className="text-lg font-black">{formatINR(finalPrice(p))}</p>
                  </div>
                  {p.vegMealDescription ? <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.vegMealDescription}</p> : null}
                </Card>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

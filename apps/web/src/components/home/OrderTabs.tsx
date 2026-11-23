'use client';

import Link from 'next/link';

import type { OrderModeKey } from '@mealawe/hooks';

import { cn } from '@/lib/cn';

const LABELS: Record<OrderModeKey, string> = { subscription: 'Subscription', bulk: 'Bulk', dinein: 'Dine In', ondemand: 'On Demand' };
const ORDER: OrderModeKey[] = ['subscription', 'bulk', 'dinein', 'ondemand'];

export function OrderTabs({ visible, active, onChange, apartment }: { visible: ReadonlySet<OrderModeKey>; active: OrderModeKey; onChange: (k: OrderModeKey) => void; apartment?: boolean }) {
  const tabs = ORDER.filter((k) => visible.has(k));
  if (tabs.length < 1 && !apartment) return null;
  return (
    <nav aria-label="Order type" className="sticky top-16 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div role="tablist" className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 sm:px-8 lg:px-12">
        {tabs.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={active === k}
            onClick={() => onChange(k)}
            className={cn('shrink-0 rounded-full px-4 py-2 text-sm font-bold transition', active === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-border')}>
            {LABELS[k]}
          </button>
        ))}
        {apartment ? (
          <Link href="/apartment" className="shrink-0 rounded-full bg-secondary px-4 py-2 text-sm font-bold text-secondary-foreground">
            Apartment
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

'use client';

import Link from 'next/link';

import type { BulkCategory } from '@mealawe/core';
import { useBulkCategorySummaries } from '@mealawe/hooks';

import { Card } from '@/components/ui/Card';

const CATEGORIES: { key: BulkCategory; title: string; blurb: string }[] = [
  { key: 'meals', title: 'Meals', blurb: 'Full meals for offices, events and gatherings.' },
  { key: 'snacks', title: 'Snacks', blurb: 'Snack platters and party bites, in bulk.' },
  { key: 'foodbox', title: 'Food Box', blurb: 'Packed boxes, ready-made or build your own.' },
];

export function BulkHome() {
  const summaries = useBulkCategorySummaries(true);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black">Bulk orders</h2>
        <p className="text-muted-foreground">Order for groups with volume pricing.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {CATEGORIES.map((c) => {
          const s = summaries[c.key];
          return (
            <li key={c.key}>
              <Link href={`/bulk-menu?category=${c.key}`} className="block">
                <Card className="h-full transition hover:shadow-md">
                  <h3 className="text-lg font-bold">{c.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{c.blurb}</p>
                  {s ? <p className="mt-3 text-xs font-bold text-primary">{s.itemCount} items · min {s.moq}</p> : null}
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

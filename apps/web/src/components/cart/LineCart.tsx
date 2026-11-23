'use client';

import type { ReactNode } from 'react';

import { formatINR } from '@mealawe/core';

import { Card } from '@/components/ui/Card';
import { QuantityStepper } from '@/components/ui/QuantityStepper';

export interface Line { id: string; name: string; unitPrice: number; count: number; onChange: (n: number) => void }

export function LineList({ lines, header }: { lines: Line[]; header?: ReactNode }) {
  return (
    <Card>
      {header}
      <ul className="divide-y divide-border">
        {lines.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="truncate font-bold">{l.name}</p><p className="text-sm text-muted-foreground">{formatINR(l.unitPrice)} × {l.count} = {formatINR(l.unitPrice * l.count)}</p></div>
            <QuantityStepper value={l.count} onChange={l.onChange} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

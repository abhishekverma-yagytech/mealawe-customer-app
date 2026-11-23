import { formatINR, statusGroup, statusLabel, type OrderSummary } from '@mealawe/core';

import { cn } from '@/lib/cn';
import { Img } from '@/lib/img';

const TONE = { ongoing: 'bg-plan/15 text-plan', completed: 'bg-primary/15 text-primary-dark', cancelled: 'bg-nonveg/15 text-nonveg', other: 'bg-muted text-muted-foreground' } as const;

export function StatusPill({ status }: { status?: string }) {
  return <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', TONE[statusGroup(status)])}>{statusLabel(status)}</span>;
}

export const fmtDate = (d?: string) => {
  if (!d) return '';
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function OrderRow({ order, onOpen }: { order: OrderSummary; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-card border border-border bg-card p-3 text-left shadow-sm transition hover:shadow-md">
      <Img src={order.imageUrl} alt="" className="size-14 shrink-0 rounded-card" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{order.title}</p>
        <p className="truncate text-xs text-muted-foreground">{[order.orderNo ? `#${order.orderNo}` : null, fmtDate(order.date), order.subtitle].filter(Boolean).join(' · ')}</p>
        <div className="mt-1"><StatusPill status={order.status} /></div>
      </div>
      <p className="shrink-0 font-black">{formatINR(order.amount)}</p>
    </button>
  );
}

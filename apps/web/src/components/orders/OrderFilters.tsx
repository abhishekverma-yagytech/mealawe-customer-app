'use client';

import { cn } from '@/lib/cn';

export interface DateRange { from: string; to: string }

/** Status chips + buy-date range (replaces mobile's DateRangeSheet). */
export function OrderFilters<K extends string>({ chips, status, onStatus, range, onRange }: { chips: { key: K; label: string }[]; status: K; onStatus: (k: K) => void; range: DateRange | null; onRange: (r: DateRange | null) => void }) {
  const set = (patch: Partial<DateRange>) => {
    const next = { from: range?.from ?? '', to: range?.to ?? '', ...patch };
    onRange(next.from || next.to ? { from: next.from || '0000-01-01', to: next.to || '9999-12-31' } : null);
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Status filter">
        {chips.map((c) => (
          <button key={c.key} aria-pressed={status === c.key} onClick={() => onStatus(c.key)} className={cn('shrink-0 rounded-full border px-4 py-1.5 text-sm font-bold', status === c.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>{c.label}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">From <input type="date" value={range && range.from !== '0000-01-01' ? range.from : ''} onChange={(e) => set({ from: e.target.value })} className="rounded-card border border-border bg-card px-2 py-1" /></label>
        <label className="flex items-center gap-1">To <input type="date" value={range && range.to !== '9999-12-31' ? range.to : ''} onChange={(e) => set({ to: e.target.value })} className="rounded-card border border-border bg-card px-2 py-1" /></label>
        {range ? <button onClick={() => onRange(null)} className="font-bold text-primary">Clear dates</button> : null}
      </div>
    </div>
  );
}

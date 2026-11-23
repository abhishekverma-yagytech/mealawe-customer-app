'use client';

import { formatShort } from '@mealawe/core';

import { cn } from '@/lib/cn';

export interface Slot {
  start: string; // "HH:mm"
  end: string;
}

/** "13:00" -> "1 PM" */
function hourLabel(hhmm: string): string {
  const h = Number.parseInt(hhmm.split(':')[0] ?? '', 10);
  if (!Number.isFinite(h)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}
export const slotLabel = (s: Slot) => `${hourLabel(s.start)} – ${hourLabel(s.end)}`;

/** Delivery date chips (optional) + time-slot chips, shared by the bulk and on-demand carts. */
export function DateSlotPicker({
  title,
  dates,
  date,
  onDate,
  slots,
  slot,
  onSlot,
  emptyMessage,
  error,
}: {
  title: string;
  dates?: string[];
  date?: string | null;
  onDate?: (d: string) => void;
  slots: Slot[];
  slot: Slot | null;
  onSlot: (s: Slot) => void;
  emptyMessage: string;
  error?: string | null;
}) {
  return (
    <section aria-labelledby="slot-h" className="space-y-3 rounded-card border border-border bg-card p-4">
      <h2 id="slot-h" className="text-lg font-black">{title}</h2>
      {dates ? (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Date</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Delivery date">
            {dates.map((d) => (
              <button key={d} role="radio" aria-checked={date === d} onClick={() => onDate?.(d)} className={cn('rounded-full border px-4 py-1.5 text-sm font-bold', date === d ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background')}>{formatShort(d)}</button>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Time slot</p>
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Time slot">
            {slots.map((s) => {
              const on = slot?.start === s.start && slot.end === s.end;
              return <button key={s.start} role="radio" aria-checked={on} onClick={() => onSlot(s)} className={cn('rounded-full border px-4 py-1.5 text-sm font-bold', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background')}>{slotLabel(s)}</button>;
            })}
          </div>
        )}
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

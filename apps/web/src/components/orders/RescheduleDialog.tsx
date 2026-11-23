'use client';

import { Check } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { checkRescheduleConflict, reschedulePackageChildOrder } from '@mealawe/api';
import { formatShort, nextStartDates } from '@mealawe/core';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/cn';

/** Everything the reschedule calls need for one child order; `packageOrderId` is the parent package order's `_id`. */
export interface RescheduleTarget {
  foodOrderId: string;
  packageOrderId: string;
  orderNo?: number | string;
  orderDate?: string;
  mealType?: string;
}

/**
 * Move one delivery to another date (the backend reschedules a single child order, never the whole package).
 * Same flow as mobile's RescheduleSheet: pick a day in the next 14 (Sundays excluded), re-check for a clash, then confirm.
 */
export function RescheduleDialog({
  target,
  siblingOrders,
  onClose,
  onRescheduled,
}: {
  target: RescheduleTarget | null;
  /** The package's other child orders — used only to hint which dates already have a delivery of the same meal. */
  siblingOrders?: readonly { orderDate?: string; mealType?: string }[];
  onClose: () => void;
  onRescheduled: () => void;
}) {
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chips = useMemo(() => nextStartDates(14, true, false), []);

  useEffect(() => {
    setDate('');
    setError(null);
  }, [target]);

  const booked = useMemo(() => {
    const meal = target?.mealType ?? 'Lunch';
    return new Set((siblingOrders ?? []).filter((o) => (o.mealType ?? 'Lunch') === meal && o.orderDate).map((o) => o.orderDate!.slice(0, 10)));
  }, [siblingOrders, target?.mealType]);

  if (!target) return null;

  const confirm = async () => {
    if (!date || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (await checkRescheduleConflict(target.packageOrderId, date, target.mealType ?? 'Lunch')) {
        setError('You already have a delivery on that day. Pick a different date.');
        return;
      }
      if (!(await reschedulePackageChildOrder(date, target.foodOrderId, target.packageOrderId))) {
        setError('Could not reschedule. Please try again in a moment.');
        return;
      }
      onRescheduled();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Reschedule order"
      description={`Order #${target.orderNo ?? '—'}${target.orderDate ? ` · currently ${formatShort(target.orderDate.slice(0, 10))}` : ''}`}>
      <div className="space-y-4">
        <div role="group" aria-label="New date" className="flex flex-wrap gap-2">
          {chips.map((c) => {
            const active = c.iso === date;
            return (
              <button
                key={c.iso}
                type="button"
                disabled={!c.enabled}
                aria-pressed={active}
                aria-label={`${c.label} ${c.dom} ${c.month}${booked.has(c.iso) ? ', already has a delivery' : ''}`}
                onClick={() => setDate(c.iso)}
                className={cn('relative w-16 rounded-card border py-3 text-center transition disabled:opacity-40', active ? 'border-primary bg-primary/10' : 'border-border bg-card')}>
                {active ? <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" /></span> : null}
                <span className="block text-[10px] font-bold uppercase text-muted-foreground">{c.label}</span>
                <span className="block text-lg font-black">{c.dom}</span>
                {booked.has(c.iso) ? <span className="block text-[10px] font-bold text-offer">Booked</span> : <span className="block text-[10px] text-muted-foreground">{c.month}</span>}
              </button>
            );
          })}
        </div>
        {error ? <p role="alert" className="text-sm font-bold text-destructive">{error}</p> : null}
        <Button block disabled={!date || busy} onClick={confirm}>{busy ? 'Rescheduling…' : 'Confirm new date'}</Button>
      </div>
    </Dialog>
  );
}

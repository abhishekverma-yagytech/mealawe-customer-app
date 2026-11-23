import { Minus, Plus } from 'lucide-react';

import { cn } from '@/lib/cn';

export function QuantityStepper({ value, onChange, min = 0, max = 99, className }: { value: number; onChange: (n: number) => void; min?: number; max?: number; className?: string }) {
  return (
    <div className={cn('inline-flex items-center overflow-hidden rounded-card border border-primary', className)}>
      <button type="button" aria-label="Decrease" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className="flex size-9 items-center justify-center text-primary disabled:opacity-40">
        <Minus className="size-4" />
      </button>
      <span aria-live="polite" className="min-w-8 text-center text-sm font-bold">{value}</span>
      <button type="button" aria-label="Increase" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className="flex size-9 items-center justify-center text-primary disabled:opacity-40">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

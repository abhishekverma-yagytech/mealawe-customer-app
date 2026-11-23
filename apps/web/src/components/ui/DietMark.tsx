import { cn } from '@/lib/cn';

/** Veg / non-veg indicator (green / red dot in a square). */
export function DietMark({ veg, className }: { veg: boolean; className?: string }) {
  return (
    <span aria-label={veg ? 'Vegetarian' : 'Non-vegetarian'} role="img" className={cn('inline-flex size-4 items-center justify-center rounded-[3px] border-2', veg ? 'border-veg' : 'border-nonveg', className)}>
      <span className={cn('size-1.5 rounded-full', veg ? 'bg-veg' : 'bg-nonveg')} />
    </span>
  );
}

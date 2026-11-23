'use client';

import * as RadixSwitch from '@radix-ui/react-switch';

import { cn } from '@/lib/cn';

export function Switch({ checked, onCheckedChange, label, className }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; className?: string }) {
  return (
    <RadixSwitch.Root
      aria-label={label}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={cn('relative h-7 w-12 shrink-0 rounded-full bg-muted transition data-[state=checked]:bg-primary', className)}>
      <RadixSwitch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-white shadow transition data-[state=checked]:translate-x-[22px]" />
    </RadixSwitch.Root>
  );
}

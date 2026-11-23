import { MapPin } from 'lucide-react';

import type { Address } from '@mealawe/api';

import { cn } from '@/lib/cn';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Full address, never truncated: tag, flat/street, formatted area, city/state/pincode, landmark. */
export function AddressBlock({ address, current, className }: { address: Address; current?: boolean; className?: string }) {
  const region = [address.city, address.state].filter(Boolean).join(', ');
  const tail = [region, address.pincode].filter(Boolean).join(' - ');
  return (
    <span className={cn('flex min-w-0 items-start gap-2', className)}>
      <MapPin className="mt-0.5 size-5 shrink-0 text-location" aria-hidden />
      <span className="min-w-0 flex-1 break-words">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-bold">{address.tagLocation ? cap(address.tagLocation) : 'Address'}</span>
          {current ? <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">Current</span> : null}
        </span>
        {address.address ? <span className="block text-sm">{address.address}</span> : null}
        <span className="block text-sm text-muted-foreground">{address.location}</span>
        {tail ? <span className="block text-xs text-muted-foreground">{tail}</span> : null}
        {address.landmark ? <span className="block text-xs text-muted-foreground">Near {address.landmark}</span> : null}
      </span>
    </span>
  );
}

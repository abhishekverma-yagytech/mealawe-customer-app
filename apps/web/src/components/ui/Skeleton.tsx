import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('animate-pulse rounded-card bg-muted', className)} {...props} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-block size-6 animate-spin rounded-full border-2 border-primary border-t-transparent', className)}
    />
  );
}

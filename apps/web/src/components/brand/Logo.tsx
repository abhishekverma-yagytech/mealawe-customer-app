import Link from 'next/link';

import { cn } from '@/lib/cn';

/**
 * Mealawe logo: the icon-only mark on phones (< sm) and the full wordmark logo from sm up. Each comes in a
 * dark-green-"M" version (light theme) and a white-"M" version (dark theme); CSS picks one from data-theme,
 * so there is no flash and no JS. Generated from the app's logo artwork into /public/brand.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/home" aria-label="Mealawe — home" className={cn('flex shrink-0 items-center', className)}>
      <span className="sm:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mealawe-mark-light.png" alt="Mealawe" width={560} height={450} className="logo-for-light h-9 w-auto" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mealawe-mark-dark.png" alt="Mealawe" width={560} height={450} className="logo-for-dark h-9 w-auto" />
      </span>
      <span className="hidden sm:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mealawe-logo-light.png" alt="Mealawe" width={1956} height={450} className="logo-for-light h-9 w-auto lg:h-10" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mealawe-logo-dark.png" alt="Mealawe" width={1956} height={450} className="logo-for-dark h-9 w-auto lg:h-10" />
      </span>
    </Link>
  );
}

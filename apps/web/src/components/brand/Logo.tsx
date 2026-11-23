import Image from 'next/image';
import Link from 'next/link';

import { cn } from '@/lib/cn';

/**
 * Mealawe logo: the icon-only mark on phones (< sm) and the full wordmark logo from sm up. Each comes in a
 * dark-green-"M" version (light theme) and a white-"M" version (dark theme); CSS picks one from data-theme,
 * so there is no flash and no JS. width/height are the largest rendered size (not the artwork size) so
 * next/image serves a small variant; the hidden variants are lazy, so they are never downloaded. Generated from the app's logo artwork into /public/brand.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/home" aria-label="Mealawe — home" className={cn('flex shrink-0 items-center', className)}>
      <span className="sm:hidden">
        <Image src="/brand/mealawe-mark-light.png" alt="Mealawe" width={45} height={36} className="logo-for-light h-9 w-auto" />
        <Image src="/brand/mealawe-mark-dark.png" alt="Mealawe" width={45} height={36} className="logo-for-dark h-9 w-auto" />
      </span>
      <span className="hidden sm:block">
        <Image src="/brand/mealawe-logo-light.png" alt="Mealawe" width={174} height={40} className="logo-for-light h-9 w-auto lg:h-10" />
        <Image src="/brand/mealawe-logo-dark.png" alt="Mealawe" width={174} height={40} className="logo-for-dark h-9 w-auto lg:h-10" />
      </span>
    </Link>
  );
}

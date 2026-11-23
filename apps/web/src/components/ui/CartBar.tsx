import Link from 'next/link';

import { formatINR } from '@mealawe/core';

/** Sticky bottom bar: "N items · ₹total → View cart" (mobile OnDemand/Bulk cart footer). */
export function CartBar({ count, total, href, label = 'View cart', aboveNav }: { count: number; total: number; href: string; label?: string; /** Sit above the floating BottomNav instead of overlapping it. */ aboveNav?: boolean }) {
  if (count <= 0) return null;
  return (
    <div className={`fixed inset-x-3 ${aboveNav ? 'bottom-[5.5rem]' : 'bottom-3'} z-30 mx-auto max-w-2xl rounded-3xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur`}>
      <Link href={href} className="mx-auto flex items-center justify-between rounded-2xl bg-primary px-5 py-3 font-bold text-primary-foreground">
        <span>{count} {count === 1 ? 'item' : 'items'} · {formatINR(total)}</span>
        <span>{label} →</span>
      </Link>
    </div>
  );
}

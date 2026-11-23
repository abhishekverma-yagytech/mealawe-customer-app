'use client';

import { Clock } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { formatINR } from '@mealawe/core';

import { listPending, type PendingPayment } from '@/payment/pending';

/**
 * Shown on the orders pages when the user left mid-payment (closed the tab, lost connection, pressed Back):
 * the pending record is still in this browser, so they can re-run the server confirmation.
 */
export function PendingPaymentBanner() {
  const [items, setItems] = useState<PendingPayment[]>([]);
  useEffect(() => setItems(listPending()), []);
  if (items.length === 0) return null;
  return (
    <section aria-label="Unfinished payments" className="space-y-2">
      {items.map((p) => (
        <div key={p.ref.order_id} className="flex items-center gap-3 rounded-card border border-rating bg-rating/10 p-3">
          <Clock className="size-5 shrink-0 text-rating" aria-hidden />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-bold">A payment of {formatINR(p.recap.amount)} for {p.recap.title} isn&apos;t confirmed yet</p>
            <p className="text-muted-foreground">If you completed it, check the status — don&apos;t pay again.</p>
          </div>
          <Link href={`/payment-check?order_id=${encodeURIComponent(p.ref.order_id ?? '')}`} className="shrink-0 rounded-card bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">Check status</Link>
        </div>
      ))}
    </section>
  );
}

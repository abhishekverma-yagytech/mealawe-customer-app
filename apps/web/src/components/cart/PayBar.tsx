import { ShieldCheck } from 'lucide-react';

import { formatINR } from '@mealawe/core';

import { Button } from '@/components/ui/Button';

/** Sticky pay bar (replaces CompleteInAppBar when payments are enabled). */
export function PayBar({ total, busy, error, disabled, onPay }: { total: number; busy: boolean; error?: string | null; disabled?: boolean; onPay: () => void }) {
  return (
    <div className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-2xl rounded-3xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur">
      <div className="mx-auto max-w-xl space-y-2">
        {error ? <p role="alert" className="rounded-card bg-destructive/10 p-2 text-center text-sm text-destructive">{error}</p> : null}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">To pay</p>
            <p className="text-xl font-black">{formatINR(total)}</p>
          </div>
          <Button size="lg" disabled={busy || disabled} onClick={onPay} className="min-w-40">
            {busy ? 'Starting payment…' : total > 0 ? `Pay ${formatINR(total)}` : 'Place order'}
          </Button>
        </div>
        <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><ShieldCheck className="size-3.5" />Secure payment by Juspay — UPI, cards &amp; netbanking</p>
      </div>
    </div>
  );
}

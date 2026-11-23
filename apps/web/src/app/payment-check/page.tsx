'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import { Page } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Skeleton';
import { pollPayment } from '@/payment/engine';
import { finishPayment } from '@/payment/finish';
import { clearPending, loadPending } from '@/payment/pending';
import { useRequireLogin } from '@/lib/useRequireLogin';

const ATTEMPTS = 10;

/**
 * Juspay return URL. Only `order_id` is used from the query string — everything else Juspay appends is
 * untrusted. The real outcome always comes from our server (confirm + status poll).
 */
function Content() {
  const router = useRouter();
  const authed = useRequireLogin();
  const orderId = useSearchParams().get('order_id');
  const ran = useRef(false);
  const [tick, setTick] = useState(0);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!authed || ran.current) return;
    ran.current = true;
    if (!orderId) return setMissing(true);
    const rec = loadPending(orderId);
    if (!rec) return setMissing(true);

    (async () => {
      const state = await pollPayment(rec.ref, { attempts: ATTEMPTS, onTick: setTick });
      // success/failed are final; pending keeps its record so Your Orders can offer a re-check.
      if (state !== 'pending') clearPending(orderId);
      router.replace(finishPayment({ state, ref: rec.ref, cartKind: rec.cartKind, recap: rec.recap, apartmentGroupKeys: rec.apartmentGroupKeys }));
    })();
  }, [authed, orderId, router]);

  if (!authed) return <Page narrow><div className="py-24 text-center"><Spinner /></div></Page>;
  if (missing) {
    return (
      <Page narrow>
        <div className="py-16 text-center">
          <h1 className="text-xl font-black">We couldn&apos;t find this payment session</h1>
          <p className="mt-2 text-muted-foreground">If you completed a payment, your order will appear in Your Orders shortly. Please check there before trying again.</p>
          <Button asChild className="mt-5"><Link href="/my-orders">Go to Your Orders</Link></Button>
        </div>
      </Page>
    );
  }
  return (
    <Page narrow>
      <div className="flex flex-col items-center gap-4 py-24 text-center" role="status" aria-live="polite">
        <Spinner className="size-10" />
        <h1 className="text-xl font-black">Confirming your payment…</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Please don&apos;t close or refresh this page{tick > 0 ? ` (check ${tick} of ${ATTEMPTS})` : ''}. This usually takes a few seconds.</p>
      </div>
    </Page>
  );
}

export default function PaymentCheckPage() {
  return <Suspense><Content /></Suspense>;
}

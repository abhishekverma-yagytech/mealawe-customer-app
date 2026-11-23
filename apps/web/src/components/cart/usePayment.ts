'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useAuthStore } from '@mealawe/state';

import { makeIdempotencyKey, startPayment } from '@/payment/engine';
import { finishPayment } from '@/payment/finish';
import { savePending } from '@/payment/pending';
import type { CartKind, OrderBody, PaymentRecap } from '@/payment/types';

/**
 * Starts a Juspay payment from a cart. `build` returns the order body, or null after it has already
 * surfaced its own validation message (e.g. "choose a saved address").
 * Flow: login check → create order + session → free (wallet-covered) result, or save a pending record and
 * redirect the whole page to Juspay's hosted Payment Page. The return lands on /payment-check.
 */
export function usePayment(opts: { cartKind: CartKind; recap: PaymentRecap; build: () => OrderBody | null; apartmentGroupKeys?: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false); // survives re-renders; blocks a double click before state updates

  // Coming back with the browser Back button from Juspay restores this page from bfcache with `busy` still set.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        inFlight.current = false;
        setBusy(false);
      }
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  const pay = async () => {
    if (inFlight.current) return;
    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    const body = opts.build();
    if (!body) return;

    inFlight.current = true;
    setBusy(true);
    setError(null);
    let leaving = false;
    try {
      const res = await startPayment(body, { returnUrl: `${window.location.origin}/payment-check`, idempotencyKey: makeIdempotencyKey() });
      if (res.kind === 'error') {
        setError(res.message);
        if (res.reason === 'auth-expired') router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
        return;
      }
      if (res.kind === 'free') {
        router.replace(finishPayment({ state: 'success', ref: res.ref, cartKind: opts.cartKind, recap: opts.recap, apartmentGroupKeys: opts.apartmentGroupKeys }));
        return;
      }
      savePending({ ref: res.ref, cartKind: opts.cartKind, recap: opts.recap, apartmentGroupKeys: opts.apartmentGroupKeys, createdAt: Date.now() });
      leaving = true; // the page is about to unload: keep the button disabled so a second click cannot start another order
      window.location.assign(res.link);
    } finally {
      if (!leaving) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };

  return { pay, busy, error, clearError: () => setError(null) };
}

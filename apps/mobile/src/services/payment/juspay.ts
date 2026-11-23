import { BackHandler, NativeEventEmitter, NativeModules, Platform } from 'react-native';
import HyperSdkReact from 'hyper-sdk-react';

import { env } from '@/config';
import { ENDPOINTS, http, HttpError } from '@/services/http';
import { makeId } from '@/services/crypto';

import type { OrderBody, OrderCreatedBy, JusPayStartResponse } from './orderTypes';

const JUSPAY_SERVICE = 'in.juspay.hyperpay';

/** Mirrors the Ionic reference's `platformCheck()` (`apiMain.service.ts`) —
 * the server's `orderCreatedBy` enum expects these namespaced strings, not
 * bare `Platform.OS`. */
function platformOrderCreatedBy(): OrderCreatedBy {
  return Platform.OS === 'android' ? 'mealawe_app_android' : 'mealawe_app_ios';
}

/**
 * Binary, like the Ionic reference app (`payment-gateway.service.ts`'s
 * `payJusPayGateway`) — it has no third "pending" outcome anywhere: one
 * backend confirmation call, resolved as a plain success/fail boolean, full
 * stop. This app previously had a `'pending'` status that every ambiguous
 * case (SDK timeout, network drop, unconfirmed after retries) fell into —
 * but `order-result.tsx` resolved *every* `'pending'` to the success screen
 * regardless of what actually happened, so it was pure noise: a user whose
 * payment was genuinely declined or cancelled still saw "Order placed!".
 * Collapsing to two outcomes makes that impossible — every unresolved case
 * below now resolves to `'failed'` instead of a state nothing ever acted on.
 */
export type PaymentStatus = 'success' | 'failed';

export interface PaymentResult {
  status: PaymentStatus;
  /** Set once the order has actually been created server-side — i.e. every
   * case except a failure at the create-order call itself, or a blocked
   * (duplicate in-flight) call. Present on BOTH outcomes (not just one),
   * so the result screen can always re-fetch order details (e.g. its "first
   * delivery" card) once the order exists, regardless of which branch
   * resolved the payment. */
  orderType?: string;
  foodOrderId?: string;
  /** Product instruction (2026-09-01 — "message should be clear, exception
   * handled well"): every `'failed'` result used to collapse to the exact
   * same caller-side generic string regardless of WHY it failed — an order-
   * creation validation error (e.g. a kitchen just went out of stock) read
   * identically to a genuinely-unconfirmed JusPay charge, giving the
   * resident zero signal on what actually happened or whether money moved.
   * Populated only where a REAL, specific reason is actually known (never
   * fabricated) — `undefined` means exactly what it always meant before
   * this field existed, and callers should keep their own generic fallback
   * for that case. */
  message?: string;
  /** Set when `status` is 'failed' specifically because the session token
   * had expired (a 401 at the create-order call, before any order existed)
   * — lets the result screen say "your session expired", not the misleading
   * "payment failed" (nothing was ever charged; there's no payment to have
   * failed). Absent for every other failure cause. */
  reason?: 'auth-expired';
}

/**
 * One read-only status check, persisting the result if it's confirmed.
 * Shared by `payWithJusPay`'s own short retry loop and the longer-running
 * `pollPaymentStatus` a result screen can use for an in-flight 'pending'.
 */
async function checkPaymentOnce(orderType: string, foodOrderId: string): Promise<boolean> {
  const payload = { orderType, foodOrderId };
  try {
    const polled = await http.post<{ status: boolean }>(ENDPOINTS.juspay.validateStatus, payload);
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[juspay] validateStatus check —', JSON.stringify(polled));
    }
    if (!polled.status) {
      return false;
    }
    // validateStatus is read-only (confirmed: its response still shows
    // orderstatus:"paymentInprogress" even when jusPayStatus:"success") — it
    // never persists the success. Re-call the mutating endpoint to actually
    // flip the order to `placed`; safe here specifically because the order
    // is still sitting in `paymentInprogress` (just confirmed by this same
    // poll), which is exactly the state it's gated to accept. Best-effort:
    // JusPay itself already confirmed the charge, so a failure to persist
    // here doesn't change what we tell the user — the backend's own cron
    // job reconciles the DB record independently.
    try {
      await http.post<{ status: boolean }>(ENDPOINTS.juspay.validate, payload);
    } catch {
      // ignore — see comment above
    }
    return true;
  } catch {
    return false;
  }
}

/** Distinct from `PaymentStatus` — this is `order-detail.tsx`'s own manual
 * "Check payment status" action for an order already sitting in the
 * backend's `paymentInprogress` state, not part of the checkout flow. A
 * user-triggered re-check honestly CAN come back "still not confirmed yet"
 * without that meaning failure (unlike the checkout flow's `PaymentStatus`,
 * which is a one-shot, immediately-acted-on verdict — see the module doc
 * comment above `PaymentStatus`). No Ionic equivalent needed here; Ionic has
 * no manual re-check flow at all. */
export type PollResult = 'success' | 'pending';

/**
 * Keep confirming an order stuck at `paymentInprogress` — e.g. from
 * `order-detail.tsx`'s manual "Check payment status" button. Resolves
 * 'success' as soon as JusPay confirms the charge, or 'pending' again if it
 * still hasn't resolved after every attempt (never 'failed' — a payment that
 * genuinely failed resolves quickly; something still unresolved after this
 * many attempts needs a human/support look, not a false failure message).
 */
export async function pollPaymentStatus(
  orderType: string,
  foodOrderId: string,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<PollResult> {
  const attempts = options.attempts ?? 10;
  const delayMs = options.delayMs ?? 3000;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (await checkPaymentOnce(orderType, foodOrderId)) {
      return 'success';
    }
  }
  return 'pending';
}

let listenerAttached = false;
let pendingProcessResolve: ((payload: unknown) => void) | null = null;

/**
 * `hyper-sdk-react` emits every SDK event (`show_loader`/`hide_loader`/
 * `initiate_result`/`process_result`) through one `NativeEventEmitter`, not a
 * per-call callback — this listener must be attached exactly once for the
 * app's lifetime (it dispatches `process_result` to whichever `payWithJusPay`
 * call is currently waiting) and, unlike the SDK session itself, is NOT torn
 * down by `terminate()` — it stays valid across a `bootHyperSdk()` re-run.
 */
function attachHyperEventListener(): void {
  if (listenerAttached) {
    return;
  }
  listenerAttached = true;

  const emitter = new NativeEventEmitter(NativeModules.HyperSdkReact);
  emitter.addListener(HyperSdkReact.HyperEvent, (resp: string) => {
    let data: { event?: string; payload?: unknown };
    try {
      data = JSON.parse(resp);
    } catch {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[juspay] HyperEvent (unparsable) —', resp);
      }
      return;
    }
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(`[juspay] HyperEvent "${data.event}" —`, JSON.stringify(data.payload));
    }
    if (data.event === 'process_result' && pendingProcessResolve) {
      const resolve = pendingProcessResolve;
      pendingProcessResolve = null;
      resolve(data.payload);
    }
  });
}

/**
 * Boots the HyperSDK engine — `preFetch` + `createHyperServices` + `initiate`.
 * Called once at app start (see `initJusPay`); safe to call again if ever
 * needed to bring the SDK back to a working state without re-attaching the
 * event listener.
 */
function bootHyperSdk(): void {
  const { clientId, merchantId } = env.juspay;
  const environment = env.production ? 'production' : 'sandbox';

  // Every call into the SDK — preFetch/initiate/process alike — expects the
  // same {requestId, service, payload} envelope. Confirmed two ways: (1)
  // MealaweUserApp's working Capacitor integration
  // (payment-gateway.service.ts's createJusPayHyperServices), and (2)
  // JusPay's own official React Native docs
  // (base-sdk-integration/initiating-sdk). Sending initiate() as a flat
  // object (no envelope) was the bug — isInitialised() still reported true,
  // but the SDK never completed real setup, so process() opened a blank page
  // with no content and no further events.
  const preFetchPayload = {
    requestId: makeId(32),
    service: JUSPAY_SERVICE,
    payload: { clientId, merchantId, environment },
  };
  const initiatePayload = {
    requestId: makeId(32),
    service: JUSPAY_SERVICE,
    payload: {
      action: 'initiate',
      // Not in the official docs' sample payload, but MealaweUserApp's
      // working Capacitor integration sends it — kept for safety since an
      // unrecognized extra field is far lower-risk than dropping one the
      // proven-working client actually relies on.
      integrationType: 'redirection',
      merchantId,
      clientId,
      // Per the official docs' sample payload — a per-session routing/trace
      // id, distinct from the per-call requestId above.
      XRoutingId: makeId(32),
      environment,
    },
  };
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn('[juspay] preFetch() —', JSON.stringify(preFetchPayload));
    // eslint-disable-next-line no-console
    console.warn('[juspay] createHyperServices() + initiate() —', JSON.stringify(initiatePayload));
  }
  HyperSdkReact.preFetch(JSON.stringify(preFetchPayload));
  HyperSdkReact.createHyperServices();
  HyperSdkReact.initiate(JSON.stringify(initiatePayload));
}

/** Call once at app start (see `src/app/_layout.tsx`). */
export function initJusPay(): void {
  attachHyperEventListener();
  bootHyperSdk();
}

/** Delegates a hardware back press to the SDK while its payment page is
 * showing — wired into RN's `BackHandler` by `payWithJusPay` itself for the
 * duration of the call, not by each cart screen individually. Android-only:
 * there's no hardware back button on iOS for the SDK to intercept, and
 * `onBackPressed` isn't exported by the iOS native module at all (confirmed
 * against `hyper-sdk-react`'s iOS source — no such method exists there). */
function onJusPayBackPressed(): boolean {
  if (Platform.OS !== 'android') {
    return false;
  }
  return !HyperSdkReact.isNull() && HyperSdkReact.onBackPressed();
}

// No backend idempotency guard exists for the start* endpoints (confirmed in
// the design spec) — a double-tap on "Pay" would create a duplicate order and
// a duplicate JusPay session. This in-flight guard is the only thing
// preventing that from the client side.
let inFlight = false;

/**
 * Create the order, then (unless it was fully wallet-covered) open the
 * JusPay payment page and confirm with the backend — same shape as the
 * Ionic reference's `payJusPayGateway`: one confirmation call, resolved as a
 * definitive success/fail, no ambiguous third outcome for the caller to sit
 * on. A `'failed'` result here does NOT necessarily mean no money moved —
 * see the comments below on the timeout/network-drop cases — it means this
 * client couldn't confirm a charge, so the honest, safe default is to let
 * the user retry (which creates a new order, never touches a possibly-
 * charged one) rather than falsely report success. The backend's own
 * reconciliation is what actually protects a genuinely-charged-but-
 * unconfirmed order, same as it always has.
 */
export async function payWithJusPay(
  endpoint: string,
  orderBody: OrderBody,
): Promise<PaymentResult> {
  if (inFlight) {
    // Should be unreachable in practice (every "Pay" button disables itself
    // while `paying`) — this guard only exists for the theoretical race of
    // two taps landing before that re-render. No order was created for
    // *this* blocked call, so 'failed' here is safe: retrying just makes the
    // one real in-flight call's own order, never a duplicate.
    return { status: 'failed', message: 'Another payment is already in progress. Please wait a moment and try again.' };
  }
  inFlight = true;
  try {
    let res: JusPayStartResponse;
    try {
      res = await http.post<JusPayStartResponse>(endpoint, {
        ...orderBody,
        orderCreatedBy: platformOrderCreatedBy(),
      });
    } catch (error) {
      // No order was created (the failure is before/at the create call), so
      // this is a definitive failure, not a "pending" — safe to let the user
      // retry immediately without risking a duplicate order.
      if (__DEV__) {
        const detail =
          error instanceof HttpError ? `HTTP ${error.status}: ${String(error.payload)}` : String(error);
        // eslint-disable-next-line no-console
        console.warn('[juspay] order creation failed —', detail);
      }
      // `PaymentResult.reason` was declared and documented ("lets the result
      // screen say 'your session expired'") but never actually set anywhere
      // — `order-result.tsx` already branches on it (`AUTH_EXPIRED_COPY`), it
      // just never had anything to react to. Set only for this one specific,
      // known cause; every other failure keeps the plain `{status:'failed'}`
      // it always returned — no generic message-extraction here (per
      // product instruction, keep Subscription/Bulk/On-Demand's existing
      // generic-copy error flow exactly as it was).
      if (error instanceof HttpError && error.status === 401) {
        return { status: 'failed', reason: 'auth-expired' };
      }
      return { status: 'failed' };
    }
    const walletCovered = Object.keys(res.jusPaySessionObj ?? {}).length === 0;
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        `[juspay] order created — foodOrderId=${res.checkoutDetails._id} walletCovered=${walletCovered} jusPaySessionObj=`,
        JSON.stringify(res.jusPaySessionObj),
      );
    }
    if (walletCovered) {
      return { status: 'success', orderType: orderBody.orderType, foodOrderId: res.checkoutDetails._id };
    }

    if (__DEV__) {
      // `isNull()` IS exported on iOS too (`RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD`
      // in the native source, same as Android) — so this isn't a missing-export
      // issue. It's skipped on iOS anyway: this is a diagnostic-only log with
      // zero effect on the real payment flow, and a synchronous bridge call
      // like this one is worth staying defensive about on a platform this
      // integration has never actually been built/run on yet — the JusPay
      // design spec (`docs/superpowers/specs/2026-08-06-juspay-payment-integration-design.md`)
      // notes `ios/` doesn't exist in this repo, so nothing here has been
      // verified against a real iOS build.
      const isNull = Platform.OS === 'android' ? HyperSdkReact.isNull() : 'n/a (iOS)';
      const isInitialised = await HyperSdkReact.isInitialised();
      // eslint-disable-next-line no-console
      console.warn(
        `[juspay] pre-process() check — isNull=${isNull} isInitialised=${isInitialised} — calling HyperSdkReact.process()...`,
      );
    }
    // While the JusPay payment page is open, hardware back must be delegated
    // to the SDK (README step 5) — otherwise Android's default back handling
    // just kills the page's Activity outright, which is exactly what happened
    // before this was wired up (confirmed via logcat: onKeyDown(KEYCODE_BACK)
    // on ProcessActivity, no SDK involvement, straight back to MainActivity).
    const backSub = BackHandler.addEventListener('hardwareBackPress', onJusPayBackPressed);

    // No client-side timeout on this wait — matches the Ionic reference
    // exactly (`payment-gateway.service.ts#payJusPayGateway` has none
    // either). This used to race a 45s timeout that terminated + rebooted
    // the SDK session if no HyperEvent arrived in time, but OTP entry,
    // UPI app-switch-and-return, and netbanking redirects can all
    // legitimately take longer than that — the timeout was cutting off
    // payments that were still genuinely in progress (surfaced as the
    // payment page "closing by itself" mid-flow). The backend stays
    // authoritative regardless (never trust the client-only event for
    // money, see the `validate`/`checkPaymentOnce` calls below) — this just
    // waits for whichever comes first: the SDK's own `process_result`
    // event, or the user backing out (delegated to the SDK via
    // `onJusPayBackPressed` above).
    await new Promise<unknown>((resolve) => {
      pendingProcessResolve = resolve;
      // The official docs (and MealaweUserApp's working Capacitor
      // integration) both use plain process(), not processWithActivity() —
      // the earlier switch to processWithActivity was a guess at working
      // around zero events firing, but that was very likely a downstream
      // symptom of initiate()'s missing requestId/service envelope (fixed
      // above), not an inherent process()/Fragment problem. Reverting to
      // match the documented + proven-working flow.
      HyperSdkReact.process(JSON.stringify(res.jusPaySessionObj));
    });
    backSub.remove();

    // The SDK's own process_result can report the charge as final (e.g.
    // status: 'charged') slightly before JusPay's server-side Orders API —
    // which our backend queries — reflects the same state. A single
    // immediate check can catch that race and come back false for a payment
    // that actually succeeded. The backend stays authoritative (never trust
    // the client-only event for money), but give it a few chances to catch
    // up before concluding failure.
    const orderType = orderBody.orderType;
    const foodOrderId = res.checkoutDetails._id;

    // The first check uses the mutating `validate` endpoint directly (it's
    // what actually flips the order to `placed`, and resolves immediately
    // for the common case where there's no race at all) — matching the
    // Ionic reference's `validateJusPayPaymentTransaction`, which is also
    // exactly one call, no retry. Any failure to confirm here — the backend
    // saying no, or the call not even reaching it — falls through to one
    // extra quick recheck below (not an open-ended poll) for the documented
    // SDK/backend race, then resolves definitively either way.
    try {
      const validated = await http.post<{ status: boolean }>(ENDPOINTS.juspay.validate, { orderType, foodOrderId });
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[juspay] validate —', JSON.stringify(validated));
      }
      if (validated.status) {
        return { status: 'success', orderType, foodOrderId };
      }
    } catch (error) {
      if (__DEV__) {
        const detail = error instanceof HttpError ? `HTTP ${error.status}: ${String(error.payload)}` : String(error);
        // eslint-disable-next-line no-console
        console.warn('[juspay] validate threw —', detail);
      }
    }

    // One quick recheck (via the read-only endpoint, see `checkPaymentOnce`)
    // for the case where the SDK's event fired a moment before JusPay's own
    // Orders API — which the backend queries — caught up. Whatever this
    // returns is final: no further retry, no ambiguous hand-back.
    const SHORT_RETRY_DELAY_MS = 500;
    await new Promise((resolve) => setTimeout(resolve, SHORT_RETRY_DELAY_MS));
    if (await checkPaymentOnce(orderType, foodOrderId)) {
      return { status: 'success', orderType, foodOrderId };
    }
    // Root-cause fix (product instruction — "message should be clear"):
    // distinct in KIND from the order-creation failure above — an order
    // already exists and money MAY have moved (see this function's own doc
    // comment), so this needs its own honest message rather than reusing
    // the same generic "couldn't complete" string every failure used to
    // share regardless of whether a charge was even attempted.
    return {
      status: 'failed',
      orderType,
      foodOrderId,
      message: "We couldn't confirm this payment. If any amount was deducted, it will be refunded automatically — please check \"Your Orders\" before trying again.",
    };
  } finally {
    inFlight = false;
  }
}

import { ENDPOINTS, HttpError, http } from '@mealawe/core';

import { ORDER_CREATED_BY, type JusPayStartResponse, type OrderBody, type OrderRef, type PaymentState, type StartResult } from './types';

/** Where the start endpoint must be posted for a given body. */
export function startEndpointFor(body: OrderBody): string {
  switch (body.orderType) {
    case 'subscriptionPackage':
    case 'allDay':
    case 'advance':
    case 'apartment':
      return ENDPOINTS.juspay.startSubscription;
    default:
      return ENDPOINTS.juspay.startBulk; // bulk order types
  }
}

/** Idempotency key (backend accepts 8–64 chars of A-Za-z0-9_-). One per checkout attempt. */
export function makeIdempotencyKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(32);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = 'w';
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

function describe(error: unknown): { message: string; reason?: 'auth-expired' } {
  if (error instanceof HttpError) {
    if (error.status === 401) return { message: 'Your session expired. Please log in again — no payment was made.', reason: 'auth-expired' };
    if (error.status === 409) return { message: 'Your payment is already being processed. Please wait a moment.' };
    // Server rejections come back as { msg } and the http client already unwraps it into `message`.
    if (error.message && !/^Request failed/.test(error.message)) return { message: error.message };
    return { message: 'We could not start your payment. Please try again.' };
  }
  return { message: 'Network problem — please check your connection and try again.' };
}

/**
 * Creates the order + Juspay session. Returns:
 *  - `free`     nothing payable (wallet/cashback covered it): the order is already `placed`, no gateway involved;
 *  - `redirect` send the browser to `link` (Juspay hosted Payment Page);
 *  - `error`    could not start (message is user-presentable).
 * Never throws.
 */
export async function startPayment(body: OrderBody, opts: { returnUrl: string; idempotencyKey: string }): Promise<StartResult> {
  let res: JusPayStartResponse;
  try {
    res = await http.post<JusPayStartResponse>(startEndpointFor(body), {
      ...body,
      orderCreatedBy: ORDER_CREATED_BY,
      returnURL: opts.returnUrl,
      idempotencyKey: opts.idempotencyKey,
    });
  } catch (error) {
    return { kind: 'error', ...describe(error) };
  }

  const checkout = res?.checkoutDetails;
  if (!checkout?._id) return { kind: 'error', message: 'We could not start your payment. Please try again.' };

  const ref: OrderRef = { orderType: checkout.orderType ?? body.orderType, foodOrderId: checkout._id, order_id: checkout.order_id };
  const payable = typeof checkout.amount === 'number' ? checkout.amount : body.amount;
  if (payable <= 0) return { kind: 'free', ref };

  const link = res.jusPayPaymentLink;
  if (!link) return { kind: 'error', message: 'The payment page is unavailable right now. Please try again in a moment.' };
  return { kind: 'redirect', ref, link };
}

interface StatusResponse {
  status?: boolean;
  orderstatus?: string;
  paymentStatus?: string;
  statusMessage?: string;
  error?: boolean;
}

const UNPAID_ORDER_STATUSES = new Set(['paymentInitiated', 'paymentInprogress', 'paymentFailed']);

function payload(ref: OrderRef) {
  return { foodOrderId: ref.foodOrderId, orderType: ref.orderType, ...(ref.order_id ? { order_id: ref.order_id } : {}) };
}

/** Read-only status (safe to call repeatedly). Maps Juspay/our order status onto success | failed | pending. */
export async function checkPaymentStatus(ref: OrderRef): Promise<PaymentState> {
  try {
    const r = await http.post<StatusResponse>(ENDPOINTS.juspay.validateStatus, payload(ref));
    if (r?.orderstatus && !UNPAID_ORDER_STATUSES.has(r.orderstatus)) return 'success'; // already placed/accepted/...
    switch ((r?.paymentStatus ?? '').toLowerCase()) {
      case 'success':
        return 'success';
      case 'failed':
        return 'failed';
      default:
        return r?.status === true ? 'success' : 'pending'; // new / pending / unknown: not final yet
    }
  } catch {
    return 'pending'; // a failed status read is not evidence of failure
  }
}

/**
 * Confirms a payment server-side after the redirect back. The mutating validate call flips the order to
 * `placed`; it is single-use, so when it reports `error`/false we fall back to the read-only status
 * instead of treating that as a failed payment.
 */
export async function confirmPayment(ref: OrderRef): Promise<PaymentState> {
  try {
    const v = await http.post<StatusResponse>(ENDPOINTS.juspay.validate, payload(ref));
    if (v?.status === true) return 'success';
  } catch {
    // fall through to the read-only check
  }
  return checkPaymentStatus(ref);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Confirm once, then — while the gateway still says pending/new — poll the read-only status, and persist
 * `placed` with one more validate when it flips to success. Returns `pending` (NOT failed) when it runs out
 * of attempts: the webhook/cron settle it later and the UI says so.
 */
export async function pollPayment(
  ref: OrderRef,
  opts: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void>; onTick?: (attempt: number) => void } = {},
): Promise<PaymentState> {
  const { attempts = 10, delayMs = 3000, sleep: wait = sleep, onTick } = opts;
  let state = await confirmPayment(ref);
  for (let i = 1; state === 'pending' && i <= attempts; i++) {
    onTick?.(i);
    await wait(delayMs);
    state = await checkPaymentStatus(ref);
    if (state === 'success') {
      // Status says paid but the order may still be paymentInprogress: persist it (idempotent server-side).
      await http.post(ENDPOINTS.juspay.validate, payload(ref)).catch(() => undefined);
    }
  }
  return state;
}

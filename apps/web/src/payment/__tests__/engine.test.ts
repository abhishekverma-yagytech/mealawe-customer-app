import { afterEach, describe, expect, it, vi } from 'vitest';

import { ENDPOINTS, HttpError, http } from '@mealawe/core';

import { checkPaymentStatus, confirmPayment, makeIdempotencyKey, pollPayment, startEndpointFor, startPayment } from '../engine';
import type { OrderBody } from '../types';

afterEach(() => vi.restoreAllMocks());

const sub = { orderType: 'subscriptionPackage', amount: 500 } as unknown as OrderBody;
const opts = { returnUrl: 'https://web.test/payment-check', idempotencyKey: 'wKEY1234567890' };
const ref = { orderType: 'subscriptionPackage', foodOrderId: 'f1', order_id: 'juspay123' };
const post = (impl: (path: string, body?: unknown) => unknown) => vi.spyOn(http, 'post').mockImplementation(((p: string, b?: unknown) => Promise.resolve(impl(p, b))) as never);

describe('startEndpointFor', () => {
  it('routes by order type', () => {
    expect(startEndpointFor(sub)).toBe(ENDPOINTS.juspay.startSubscription);
    expect(startEndpointFor({ orderType: 'allDay' } as OrderBody)).toBe(ENDPOINTS.juspay.startSubscription);
    expect(startEndpointFor({ orderType: 'advance' } as OrderBody)).toBe(ENDPOINTS.juspay.startSubscription);
    expect(startEndpointFor({ orderType: 'bulkMeals' } as OrderBody)).toBe(ENDPOINTS.juspay.startBulk);
  });
});

describe('makeIdempotencyKey', () => {
  it('is 8-64 chars of A-Za-z0-9 and unique per call', () => {
    const a = makeIdempotencyKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(makeIdempotencyKey()).not.toBe(a);
  });
});

describe('startPayment', () => {
  it('posts the body with platform, return URL and idempotency key, then redirects', async () => {
    const spy = post(() => ({ checkoutDetails: { _id: 'f1', order_id: 'juspay123', amount: 500, orderType: 'subscriptionPackage' }, jusPayPaymentLink: 'https://pay.test/x' }));
    const r = await startPayment(sub, opts);
    expect(r).toEqual({ kind: 'redirect', ref, link: 'https://pay.test/x' });
    const [path, body] = spy.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe(ENDPOINTS.juspay.startSubscription);
    expect(body).toMatchObject({ orderType: 'subscriptionPackage', orderCreatedBy: 'mealawe_web', returnURL: opts.returnUrl, idempotencyKey: opts.idempotencyKey, amount: 500 });
  });

  it('treats a zero payable amount as free (no gateway) even without a link', async () => {
    post(() => ({ checkoutDetails: { _id: 'f2', amount: 0, orderType: 'subscriptionPackage' }, jusPayPaymentLink: '' }));
    expect(await startPayment({ ...sub, amount: 0 } as OrderBody, opts)).toEqual({ kind: 'free', ref: { orderType: 'subscriptionPackage', foodOrderId: 'f2', order_id: undefined } });
  });

  it('errors when something is payable but no payment link came back', async () => {
    post(() => ({ checkoutDetails: { _id: 'f3', amount: 100 } }));
    expect((await startPayment(sub, opts)).kind).toBe('error');
  });

  it('errors on a response without an order', async () => {
    post(() => ({}));
    expect((await startPayment(sub, opts)).kind).toBe('error');
  });

  it('maps 401 to auth-expired, surfaces server messages, and wraps network failures', async () => {
    vi.spyOn(http, 'post').mockRejectedValueOnce(new HttpError(401, 'x'));
    expect(await startPayment(sub, opts)).toMatchObject({ kind: 'error', reason: 'auth-expired' });
    vi.spyOn(http, 'post').mockRejectedValueOnce(new HttpError(500, 'TODAY_CUTOFF_PASSED: late'));
    expect(await startPayment(sub, opts)).toMatchObject({ kind: 'error', message: 'TODAY_CUTOFF_PASSED: late' });
    vi.spyOn(http, 'post').mockRejectedValueOnce(new HttpError(409, 'dup'));
    expect(((await startPayment(sub, opts)) as { message: string }).message).toMatch(/already being processed/);
    vi.spyOn(http, 'post').mockRejectedValueOnce(new HttpError(0, 'offline'));
    expect(await startPayment(sub, opts)).toMatchObject({ kind: 'error' });
  });
});

describe('checkPaymentStatus (read-only)', () => {
  it.each([
    [{ paymentStatus: 'success' }, 'success'],
    [{ paymentStatus: 'failed' }, 'failed'],
    [{ paymentStatus: 'pending' }, 'pending'],
    [{ paymentStatus: 'new' }, 'pending'],
    [{ paymentStatus: 'unknown' }, 'pending'],
    [{ orderstatus: 'placed', paymentStatus: 'unknown' }, 'success'],
    [{ orderstatus: 'accepted' }, 'success'],
    [{ orderstatus: 'paymentInprogress', paymentStatus: 'pending' }, 'pending'],
    [{ orderstatus: 'paymentFailed', paymentStatus: 'failed' }, 'failed'],
  ])('maps %j to %s', async (resp, expected) => {
    post(() => resp);
    expect(await checkPaymentStatus(ref)).toBe(expected);
  });

  it('treats a failed read as pending, never as failure', async () => {
    vi.spyOn(http, 'post').mockRejectedValue(new Error('boom'));
    expect(await checkPaymentStatus(ref)).toBe('pending');
  });
});

describe('confirmPayment', () => {
  it('succeeds when validate reports status:true (and sends order_id)', async () => {
    const spy = post(() => ({ status: true, error: false }));
    expect(await confirmPayment(ref)).toBe('success');
    expect(spy.mock.calls[0]).toEqual([ENDPOINTS.juspay.validate, { foodOrderId: 'f1', orderType: 'subscriptionPackage', order_id: 'juspay123' }]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('re-reads status when validate says error:true (already resolved) instead of failing', async () => {
    post((p) => (p === ENDPOINTS.juspay.validate ? { status: false, error: true } : { orderstatus: 'placed' }));
    expect(await confirmPayment(ref)).toBe('success');
  });

  it('re-reads status when validate throws', async () => {
    vi.spyOn(http, 'post').mockImplementation(((p: string) => (p === ENDPOINTS.juspay.validate ? Promise.reject(new Error('x')) : Promise.resolve({ paymentStatus: 'failed' }))) as never);
    expect(await confirmPayment(ref)).toBe('failed');
  });

  it('omits order_id when the order has none (zero-amount)', async () => {
    const spy = post(() => ({ status: true }));
    await confirmPayment({ orderType: 'x', foodOrderId: 'f9' });
    expect(spy.mock.calls[0][1]).toEqual({ foodOrderId: 'f9', orderType: 'x' });
  });
});

describe('pollPayment', () => {
  const instant = () => Promise.resolve();

  it('returns immediately on a confirmed payment', async () => {
    const spy = post(() => ({ status: true }));
    expect(await pollPayment(ref, { sleep: instant })).toBe('success');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('polls the read-only status while pending, then persists placed with one more validate', async () => {
    let statusCalls = 0;
    const spy = post((p) => {
      if (p === ENDPOINTS.juspay.validate) return { status: false };
      statusCalls += 1;
      return statusCalls < 3 ? { paymentStatus: 'pending' } : { paymentStatus: 'success' };
    });
    const ticks: number[] = [];
    expect(await pollPayment(ref, { sleep: instant, onTick: (n) => ticks.push(n) })).toBe('success');
    expect(ticks).toEqual([1, 2]);
    const validateCalls = spy.mock.calls.filter(([p]) => p === ENDPOINTS.juspay.validate).length;
    expect(validateCalls).toBe(2); // initial confirm + the persist after the status flipped
  });

  it('stops on a terminal failure', async () => {
    post((p) => (p === ENDPOINTS.juspay.validate ? { status: false } : { paymentStatus: 'failed' }));
    expect(await pollPayment(ref, { sleep: instant })).toBe('failed');
  });

  it('returns pending (not failed) when attempts run out', async () => {
    post(() => ({ status: false, paymentStatus: 'pending' }));
    const sleep = vi.fn(instant);
    expect(await pollPayment(ref, { attempts: 3, delayMs: 10, sleep })).toBe('pending');
    expect(sleep).toHaveBeenCalledTimes(3);
  });
});

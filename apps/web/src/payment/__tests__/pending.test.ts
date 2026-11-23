import { beforeEach, describe, expect, it } from 'vitest';

import { PENDING_TTL_MS, clearPending, listPending, loadPending, savePending, setPendingStore, type KeyStore } from '../pending';

function memStore(): KeyStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k), keys: () => [...data.keys()] };
}

const rec = (id: string, createdAt: number) => ({ ref: { orderType: 'allDay', foodOrderId: 'f-' + id, order_id: id }, cartKind: 'ondemand' as const, recap: { title: 'Kitchen', amount: 250 }, createdAt });

let s: ReturnType<typeof memStore>;
beforeEach(() => {
  s = memStore();
  setPendingStore(s);
});

describe('pending payments', () => {
  it('round-trips a record by Juspay order id', () => {
    savePending(rec('j1', 1000));
    expect(loadPending('j1', 2000)?.ref.foodOrderId).toBe('f-j1');
    clearPending('j1');
    expect(loadPending('j1', 2000)).toBeNull();
  });

  it('does not store zero-amount orders (no Juspay order id)', () => {
    savePending({ ...rec('x', 1), ref: { orderType: 'a', foodOrderId: 'f' } });
    expect(s.data.size).toBe(0);
  });

  it('expires after the TTL and prunes the expired entry', () => {
    savePending(rec('j2', 1000));
    expect(loadPending('j2', 1000 + PENDING_TTL_MS + 1)).toBeNull();
    expect(s.data.size).toBe(0);
  });

  it('ignores corrupt entries', () => {
    s.data.set('mw.payment.pending.bad', '{not json');
    expect(loadPending('bad')).toBeNull();
    expect(s.data.has('mw.payment.pending.bad')).toBe(false);
  });

  it('lists only live records, newest first, and ignores unrelated keys', () => {
    savePending(rec('a', 1000));
    savePending(rec('b', 5000));
    savePending(rec('old', 1));
    s.data.set('mw.other', 'x');
    const list = listPending(5000 + 10);
    expect(list.map((p) => p.ref.order_id)).toEqual(['b', 'a', 'old']);
    expect(s.data.has('mw.other')).toBe(true);
  });

  it('stores ids and recap only (no customer PII fields)', () => {
    savePending(rec('j3', 1));
    const raw = s.data.get('mw.payment.pending.j3') ?? '';
    for (const forbidden of ['customerName', 'customerEmail', 'customerPhoneNo', 'address']) expect(raw).not.toContain(forbidden);
  });
});

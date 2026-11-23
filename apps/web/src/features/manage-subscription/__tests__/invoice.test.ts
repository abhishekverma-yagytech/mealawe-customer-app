import { describe, expect, it } from 'vitest';

import type { DailyOrderEntry, PackageBilling } from '@mealawe/core';

import { buildInvoiceHtml, escapeHtml, invoiceTotal } from '../invoice';
import { canRescheduleStatus } from '../rules';

const items: DailyOrderEntry[] = [
  { foodOrderId: 'a', orderNo: 101, mealType: 'Lunch', orderDate: '2026-12-01T00:00:00.000Z', orderstatus: 'delivered', amount: 120 },
  { foodOrderId: 'b', orderNo: 102, mealType: 'Dinner', orderDate: '2026-12-02T00:00:00.000Z', orderstatus: 'accepted', amount: 130.5 },
];
const billing: PackageBilling = {
  itemAmount: 300, discount: 20, couponCode: 'SAVE', couponDiscount: 10, delivery: 0, deliveryOriginal: 40, packaging: 5, packagingOriginal: 5,
  platform: 3, platformOriginal: 3, taxes: 12, walletUsed: 50, cashbackUsed: 0, total: 240,
};

describe('invoice', () => {
  it('totals the child orders the same way the list does', () => {
    expect(invoiceTotal(items)).toBe(250.5);
    expect(invoiceTotal([])).toBe(0);
  });

  it('renders every delivery, the charges and the totals', () => {
    const html = buildInvoiceHtml({ packageName: 'Special Thali', planSubtitle: '30-day plan', orderNo: 77, items, billing });
    expect(html).toContain('Special Thali');
    expect(html).toContain('Order #77');
    expect(html).toContain('Deliveries (2)');
    expect(html).toContain('Order #101');
    expect(html).toContain('Order #102');
    expect(html).toContain('Coupon (SAVE)');
    expect(html).toContain('FREE'); // delivery waived (original 40, charged 0)
    expect(html).toContain('Total paid');
    expect(html).toContain('₹240');
    expect(html).toContain('₹250.5');
  });

  it('omits the charges table when billing is unavailable', () => {
    expect(buildInvoiceHtml({ packageName: 'Plan', items, billing: null })).not.toContain('class="billing"');
  });

  it('escapes user-controlled text', () => {
    expect(escapeHtml('<b>"x" & y</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;');
    const html = buildInvoiceHtml({ packageName: '<script>alert(1)</script>', items: [], billing: null });
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});

describe('reschedule rule', () => {
  it('is offered only while the kitchen has merely accepted the delivery', () => {
    expect(canRescheduleStatus('accepted')).toBe(true);
    for (const s of ['placed', 'preparing', 'readyToDelivery', 'delivered', 'cancelledByUser', undefined]) expect(canRescheduleStatus(s)).toBe(false);
  });
});

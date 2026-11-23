import { describe, expect, it } from 'vitest';

import { ZERO_GST_CONFIG } from '@mealawe/core';

import { startEndpointFor } from '@/payment/engine';

import { billForBucket, buildApartmentBucketBody, buildApartmentQuoteBody, buildBucketItemList, paymentBucketsOf, servingDateFor } from '../checkout';
import { groupCartLines, isPastAdvanceCutoff, isPastNextDayCutoffHour } from '../pricing';
import type { ApartmentCartLine, ApartmentCartMeta, ApartmentDishOffer, OrderType } from '../types';

function offer(over: Partial<ApartmentDishOffer> = {}): ApartmentDishOffer {
  return { kitchenId: 'k1', kitchenName: 'Kitchen', source: 'daily', itemId: 'i1', price: 100, blocked: false, ...over };
}
function line(orderType: OrderType, over: Partial<ApartmentDishOffer> = {}, count = 1, name = 'Dal'): ApartmentCartLine {
  return { key: `${name}|${over.mealType ?? ''}|${over.itemServingDate ?? ''}`, dishName: name, isVeg: true, orderType, count, offer: offer(over) };
}
const meta: ApartmentCartMeta = { orderType: 'instant', kitchenId: 'k1', kitchenName: 'Kitchen', apartmentId: 'a1', apartmentName: 'Tower' };
const customer = { customerId: 'c1', customerName: 'Asha', customerEmail: 'a@x.com', customerPhoneNo: '9999999999' };
const DEFAULT = { instant: 30, today: 30, advance: 30 };

describe('paymentBucketsOf', () => {
  it('combines Today + Instant into one bucket per fulfilment mode and keeps Advance separate', () => {
    const lines = [line('instant', { itemId: 'a' }, 1, 'A'), line('today', { itemId: 'b', mealType: 'Lunch' }, 1, 'B'), line('today', { itemId: 'c', mealType: 'Dinner' }, 1, 'C')];
    const groups = groupCartLines(lines);
    const pickupDinner = Object.fromEntries(groups.filter((g) => g.mealType === 'Dinner').map((g) => [g.key, true]));
    const buckets = paymentBucketsOf(groups, pickupDinner);
    expect(buckets.map((b) => b.key).sort()).toEqual(['combined|delivery', 'combined|pickup']);
    expect(buckets.find((b) => b.key === 'combined|delivery')!.groups).toHaveLength(2);

    const adv = paymentBucketsOf(groupCartLines([line('advance', { itemServingDate: '2026-12-01' })]), {});
    expect(adv).toHaveLength(1);
    expect(adv[0].groups[0].orderType).toBe('advance');
  });
});

describe('buildBucketItemList', () => {
  it('stamps standingType from the group (never the offer source) and the Advance slot on every Advance line', () => {
    const [instant] = groupCartLines([line('instant', { source: 'daily', itemId: 'x' })]);
    expect(buildBucketItemList([instant])[0]).toMatchObject({ itemId: 'x', standingType: 'instant', isStandardMenu: undefined, mealType: undefined });

    const [today] = groupCartLines([line('today', { mealType: 'Lunch' })]);
    expect(buildBucketItemList([today])[0]).toMatchObject({ standingType: undefined, mealType: 'Lunch' });

    const [adv] = groupCartLines([line('advance', { source: 'standard', itemServingDate: '2026-12-01' })]);
    expect(buildBucketItemList([adv], 'Dinner')[0]).toMatchObject({ standingType: 'advance', isStandardMenu: true, mealType: 'Dinner', itemServingDate: '2026-12-01' });
  });
});

describe('order and quote bodies', () => {
  const groups = groupCartLines([line('instant', { price: 120 }, 2)]);
  const [bucket] = paymentBucketsOf(groups, {});
  const bill = billForBucket(bucket, null, DEFAULT, ZERO_GST_CONFIG);

  it('always sends the literal apartment order type and the charge fields the server trusts', () => {
    const body = buildApartmentBucketBody({ customer, meta, wingName: 'A', roomNumber: '12', bucket, advanceDeliverySlot: null, bill, walletUsed: 50 });
    expect(body.orderType).toBe('apartment');
    expect(body.amount).toBe(240);
    expect(body.fulfillmentMode).toBe('delivery');
    expect(body.moneyWalletPointsUsed).toBe(50);
    expect(body).toMatchObject({ apartmentId: 'a1', kitchenId: 'k1', wingName: 'A', roomNumber: '12', platformCharges: bill.platformCharges, cgst: bill.cgst, sgst: bill.sgst });
    expect(typeof body.itemServingDate).toBe('string'); // the server rejects Instant without a date
  });

  it('omits the wallet field when nothing is applied and never sends wallet in a quote', () => {
    const body = buildApartmentBucketBody({ customer, meta, wingName: 'A', roomNumber: '12', bucket, advanceDeliverySlot: null, bill, walletUsed: 0 });
    expect(body.moneyWalletPointsUsed).toBeUndefined();
    const quote = buildApartmentQuoteBody({ customer, meta, wingName: 'A', roomNumber: '12', bucket, advanceDeliverySlot: null, bill });
    expect(quote).not.toHaveProperty('moneyWalletPointsUsed');
    expect(quote.orderType).toBe('apartment');
    expect(quote.itemList).toEqual(body.itemList);
  });

  it('uses the picked date for Advance and today for everything else', () => {
    const [adv] = paymentBucketsOf(groupCartLines([line('advance', { itemServingDate: '2026-12-03' })]), {});
    expect(servingDateFor(adv)).toBe('2026-12-03');
    expect(servingDateFor(bucket, new Date(2026, 11, 7))).toBe('2026-12-07');
  });

  it('pickup carts carry no delivery charge', () => {
    const [pickupBucket] = paymentBucketsOf(groups, { [groups[0].key]: true });
    const pickupBill = billForBucket(pickupBucket, null, DEFAULT, ZERO_GST_CONFIG);
    expect(pickupBill.estimatedDelivery).toBe(0);
    expect(buildApartmentBucketBody({ customer, meta, wingName: '', roomNumber: '', bucket: pickupBucket, advanceDeliverySlot: null, bill: pickupBill, walletUsed: 0 }).fulfillmentMode).toBe('pickup');
  });
});

describe('payment routing', () => {
  it('posts apartment orders to the subscription start endpoint, not bulk', () => {
    const [bucket] = paymentBucketsOf(groupCartLines([line('instant')]), {});
    const body = buildApartmentBucketBody({ customer, meta, wingName: '', roomNumber: '', bucket, advanceDeliverySlot: null, bill: billForBucket(bucket, null, DEFAULT, ZERO_GST_CONFIG), walletUsed: 0 });
    expect(startEndpointFor(body)).toMatch(/startJusPayPaymentProcess$/);
  });
});

describe('advance cutoffs (UX mirror of the server)', () => {
  it('blocks tomorrow after the cutoff hour but never the day after', () => {
    expect(isPastNextDayCutoffHour(1, 22, new Date(2026, 11, 1, 22, 30))).toBe(true);
    expect(isPastNextDayCutoffHour(1, 22, new Date(2026, 11, 1, 21, 59))).toBe(false);
    expect(isPastNextDayCutoffHour(2, 22, new Date(2026, 11, 1, 23, 0))).toBe(false);
  });

  it('flags a slot inside the lead time and fails open without timing data', () => {
    const timing = [{ mealType: 'Lunch', acceptOrderFrom: new Date(2026, 0, 1, 12, 0).toISOString() }] as never;
    // Lunch slot starts 12:00 on the 2nd; with a 12 h lead time ordering closes at 00:00 on the 2nd.
    expect(isPastAdvanceCutoff(timing, 'Lunch', '2026-12-02', 720, new Date(2026, 11, 1, 23, 0))).toBe(false);
    expect(isPastAdvanceCutoff(timing, 'Lunch', '2026-12-02', 720, new Date(2026, 11, 2, 0, 30))).toBe(true);
    expect(isPastAdvanceCutoff(undefined, 'Lunch', '2026-12-02', 720)).toBe(false);
  });
});

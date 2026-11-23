import { describe, expect, it } from 'vitest';

import type { Address } from '@mealawe/api';
import type { BulkCartLine, MealPackage, OnDemandCartLine, OnDemandKitchen, SubscriptionCartItem } from '@mealawe/core';

import { buildBulkBody, buildOnDemandBody, buildSubscriptionBody, customerFrom, customerLocationFrom, packageForOrder } from '../bodies';

const NOW = new Date('2026-11-22T10:15:00.000Z');
const profile = { _id: 'u1', userName: 'Asha Rao', email: 'asha@example.com', phoneNo: '9876543210' };
const address: Address = { _id: 'a1', tagLocation: 'home', geolocation: { lat: 18.59, lng: 73.73 }, address: 'Flat 4', location: 'Hinjewadi, Pune', landmark: 'Near gate', pincode: '411057', city: 'Pune', state: 'Maharashtra' };
const coupon = { couponCode: 'SAVE50', discount: 50, itemDiscount: 50, deliveryDiscount: 0 };

describe('customer helpers', () => {
  it('maps the profile, defaulting missing name/email to empty strings', () => {
    expect(customerFrom(profile)).toEqual({ customerId: 'u1', customerName: 'Asha Rao', customerEmail: 'asha@example.com', customerPhoneNo: '9876543210' });
    expect(customerFrom({ _id: 'u2', phoneNo: '1' })).toEqual({ customerId: 'u2', customerName: '', customerEmail: '', customerPhoneNo: '1' });
  });
  it('keeps only the whitelisted address fields (drops _id)', () => {
    expect(customerLocationFrom(address)).toEqual({ tagLocation: 'home', geolocation: address.geolocation, address: 'Flat 4', location: 'Hinjewadi, Pune', landmark: 'Near gate', pincode: '411057', city: 'Pune', state: 'Maharashtra' });
  });
  it('sends the whole package but only the selected add-ons', () => {
    const pkg = { _id: 'p1', packageName: 'Thali', packagePrice: 100, days: 5, discount: 0, payToKitchenPerMeal: 60, addonsList: [{ addonName: 'A' }, { addonName: 'B' }] } as unknown as MealPackage;
    const out = packageForOrder(pkg, [{ addonName: 'B' }]);
    expect(out.addonsList).toEqual([{ addonName: 'B' }]);
    expect(out.payToKitchenPerMeal).toBe(60); // fields the backend reads must survive
  });
});

describe('buildSubscriptionBody (parity with mobile cart.tsx)', () => {
  const pkg = { _id: 'p1', packageName: 'Deluxe', packagePrice: 1000, discount: 100, days: 5, multiDateAllowed: true, addonsList: [] } as unknown as MealPackage;
  const item = { package: pkg, category: 'Deluxe Thali', deliveryOnWeekends: false, addOns: [{ addonName: 'Curd' }], selectedDates: ['2026-11-23', '2026-11-24'], lunch: true, dinner: false, count: 1 } as unknown as SubscriptionCartItem;
  const bill = { toPay: 900, discount: 100, taxes: 45, moneyWalletUsed: 10, cashbackUsed: 5 };
  const base = { profile, item, bill, coupon, treePlantation: null, treePlantationAmount: 11, address, now: NOW };

  it('produces the exact field set', () => {
    const body = buildSubscriptionBody(base);
    expect(body).toEqual({
      orderType: 'subscriptionPackage',
      amount: 900,
      orderDate: '2026-11-22T10:15:00.000Z',
      customerId: 'u1',
      customerName: 'Asha Rao',
      customerEmail: 'asha@example.com',
      customerPhoneNo: '9876543210',
      isDineIn: undefined,
      customerLocation: customerLocationFrom(address),
      mealPackage: { ...pkg, addonsList: [{ addonName: 'Curd' }] },
      mealaweTotalAmt: 900,
      subscriptionStartDate: '2026-11-23',
      subscriptionDays: 5,
      userSelectedDates: ['2026-11-23', '2026-11-24'],
      multiDateAllowed: true,
      mealTimeLunch: true,
      mealTimeDinner: false,
      mealTimeBreakfast: undefined,
      discount: 100,
      taxes: 45,
      couponCode: 'SAVE50',
      couponDiscount: 50,
      moneyWalletPointsUsed: 10,
      mealaweWalletPointsUsed: 5,
    });
  });

  it('mealaweTotalAmt always equals amount', () => {
    const b = buildSubscriptionBody({ ...base, bill: { ...bill, toPay: 0 } });
    expect(b.mealaweTotalAmt).toBe(b.amount);
    expect(b.amount).toBe(0);
  });

  it('adds the five tree-plantation fields together only when opted in (name falls back to the customer)', () => {
    const on = buildSubscriptionBody({ ...base, treePlantation: { enabled: true, receiverName: '' } });
    expect(on).toMatchObject({ treePlantationOpted: true, treePlantationDone: false, treePlantationAmount: 11, treePlantationDiscount: 0, treeReceiverName: 'Asha Rao' });
    const off = buildSubscriptionBody({ ...base, treePlantation: { enabled: false, receiverName: 'x' } });
    expect(Object.keys(off).filter((k) => k.startsWith('tree'))).toEqual([]);
    const named = buildSubscriptionBody({ ...base, treePlantation: { enabled: true, receiverName: 'Maya' } });
    expect(named.treeReceiverName).toBe('Maya');
  });

  it('flags dine-in and still sends the location', () => {
    const b = buildSubscriptionBody({ ...base, item: { ...item, isDineIn: true } as SubscriptionCartItem });
    expect(b.isDineIn).toBe(true);
    expect(b.customerLocation).toBeDefined();
  });

  it('omits the location when there is no address', () => {
    expect(buildSubscriptionBody({ ...base, address: null }).customerLocation).toBeUndefined();
  });

  it('breakfast plans send mealTimeBreakfast', () => {
    const b = buildSubscriptionBody({ ...base, item: { ...item, lunch: false, dinner: false, breakfast: true } as SubscriptionCartItem });
    expect(b).toMatchObject({ mealTimeLunch: false, mealTimeDinner: false, mealTimeBreakfast: true });
  });
});

describe('buildOnDemandBody (parity with mobile on-demand-cart.tsx)', () => {
  const kitchen = { _id: 'k1', kitchenName: 'Maa Ki Rasoi' } as OnDemandKitchen;
  const lines = [
    { item: { _id: 'i1', itemName: 'Dal', itemPrice: 120 }, count: 2 },
    { item: { _id: 'i2', itemName: 'Roti', itemPrice: 10 }, count: 4 },
  ] as unknown as OnDemandCartLine[];
  const bill = { toPay: 300, subTotal: 280, discount: 20, kitchenDiscount: 14, taxes: 14, moneyWalletUsed: 0, cashbackUsed: 0 };
  const base = { profile, mode: 'allDay' as const, kitchen, lines, bill, coupon: null, address, slot: { start: '13:00', end: '14:00' }, date: '2026-11-23', now: NOW };

  it('mirrors every field the backend validator needs', () => {
    expect(buildOnDemandBody(base)).toEqual({
      orderType: 'allDay',
      amount: 300,
      orderDate: '2026-11-22T10:15:00.000Z',
      customerId: 'u1',
      customerName: 'Asha Rao',
      customerEmail: 'asha@example.com',
      customerPhoneNo: '9876543210',
      customerLocation: customerLocationFrom(address),
      kitchenId: 'k1',
      kitchenName: 'Maa Ki Rasoi',
      itemList: [
        { itemId: 'i1', itemName: 'Dal', itemPrice: 120, mealawePrice: 120, count: 2 },
        { itemId: 'i2', itemName: 'Roti', itemPrice: 10, mealawePrice: 10, count: 4 },
      ],
      addOns: [],
      itemAmount: 280,
      mealaweTotalAmt: 280,
      slotStartTime: '13:00',
      slotEndTime: '14:00',
      orderComplitionDate: undefined,
      discount: 20,
      kitchenDiscount: 14,
      taxes: 14,
      couponCode: undefined,
      couponDiscount: undefined,
      moneyWalletPointsUsed: 0,
      mealaweWalletPointsUsed: 0,
    });
  });

  it('only advance orders carry the completion date', () => {
    expect(buildOnDemandBody(base).orderComplitionDate).toBeUndefined();
    const adv = buildOnDemandBody({ ...base, mode: 'advance' });
    expect(adv.orderType).toBe('advance');
    expect(adv.orderComplitionDate).toBe('2026-11-23');
    expect(buildOnDemandBody({ ...base, mode: 'advance', date: null }).orderComplitionDate).toBeUndefined();
  });

  it('mealawePrice equals itemPrice and itemAmount equals mealaweTotalAmt (NaN guards)', () => {
    const b = buildOnDemandBody(base);
    for (const i of b.itemList) expect(i.mealawePrice).toBe(i.itemPrice);
    expect(b.itemAmount).toBe(b.mealaweTotalAmt);
  });
});

describe('buildBulkBody (parity with mobile bulk-cart.tsx)', () => {
  const lines = [{ item: { _id: 'b1', itemName: 'Veg Biryani' }, itemPrice: 90, count: 25, deliveryDateCount: 0 }] as unknown as BulkCartLine[];
  const bill = { toPay: 2500, subTotal: 2250, packaging: 100, delivery: 80, platform: 20, discount: 0, taxes: 50, moneyWalletUsed: 0, cashbackUsed: 0 };
  const base = { profile, category: 'meals' as const, packaging: 'bulk' as const, lines, bill, coupon: null, address, slot: { start: '09:00', end: '10:00' }, date: '2026-11-25' };

  it('produces the exact field set, including the three required zero fields', () => {
    expect(buildBulkBody(base)).toEqual({
      orderType: 'bulkMeals',
      amount: 2500,
      customerId: 'u1',
      customerName: 'Asha Rao',
      customerEmail: 'asha@example.com',
      customerPhoneNo: '9876543210',
      customerLocation: customerLocationFrom(address),
      itemList: [{ itemId: 'b1', itemName: 'Veg Biryani', itemPrice: 90, count: 25 }],
      bulkItemAmount: 2250,
      packagingCostByUser: 100,
      finalBulkDelCharges: 80,
      finalBulkPlatformCharges: 20,
      deliveryDate: '2026-11-25',
      slotStartTime: '09:00',
      slotEndTime: '10:00',
      discount: 0,
      taxes: 50,
      couponCode: undefined,
      couponDiscount: undefined,
      moneyWalletPointsUsed: 0,
      mealaweWalletPointsUsed: 0,
      voucherDiscount: 0,
      mealaweKitchenDiscount: 0,
      extraDiscount: 0,
    });
  });

  it('derives the backend order type from category + packaging', () => {
    expect(buildBulkBody({ ...base, category: 'meals', packaging: 'individual' }).orderType).toBe('individualMeals');
    expect(buildBulkBody({ ...base, category: 'snacks', packaging: 'bulk' }).orderType).toBe('bulkSnacks');
    expect(buildBulkBody({ ...base, category: 'snacks', packaging: 'individual' }).orderType).toBe('individualSnacks');
  });

  it('carries the applied coupon', () => {
    expect(buildBulkBody({ ...base, coupon })).toMatchObject({ couponCode: 'SAVE50', couponDiscount: 50 });
  });
});

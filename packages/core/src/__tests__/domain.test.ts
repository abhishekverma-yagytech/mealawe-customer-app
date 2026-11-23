import { describe, expect, it } from 'vitest';

import { buildBill, emptyBill, DEFAULT_CHARGES } from '../domain/cart/bill';
import type { Cart } from '../domain/cart/types';
import { isSameDay } from '../domain/orders/dailyOrder';
import { ORDER_STATUS_LABEL, statusGroup, statusLabel, statusStepIndex, statusTone } from '../domain/orders/orderStatus';
import { extractPackageBilling } from '../domain/orders/packageBilling';
import { imageUri } from '../domain/subscription/media';
import { configureCore } from '../runtime';

describe('orderStatus', () => {
  it('groups raw statuses', () => {
    expect(statusGroup('placed')).toBe('ongoing');
    expect(statusGroup('delivered')).toBe('completed');
    expect(statusGroup('cancelledByUser')).toBe('cancelled');
    expect(statusGroup('weird')).toBe('other');
    expect(statusGroup(undefined)).toBe('other');
  });
  it('labels with fallbacks', () => {
    expect(statusLabel(undefined)).toBe('Order');
    expect(statusLabel('placed')).toBe(ORDER_STATUS_LABEL.placed);
    expect(statusLabel('unknownStatus')).toBe('unknownStatus');
  });
  it('maps tone and step', () => {
    expect(statusTone('cancelledByKitchen')).toBe('nonveg');
    expect(statusTone('weird')).toBe('rating');
    expect(statusStepIndex('delivered')).toBe(5);
    expect(statusStepIndex(undefined)).toBe(0);
  });
});

describe('packageBilling', () => {
  it('returns null for missing input', () => {
    expect(extractPackageBilling(null)).toBeNull();
  });
  it('reconstructs itemAmount so that the total adds up', () => {
    const b = extractPackageBilling({
      amount: 1000,
      subscriptionDeliveryCharges: 50,
      subscriptionDeliveryChargesDiscount: 20,
      ecoFriendlyPackagingCharges: 10,
      platformCharges: 5,
      taxes: 35,
      discount: 100,
      couponDiscount: 0,
      moneyWalletPointsUsed: 0,
      mealaweWalletPointsUsed: 0,
    });
    expect(b).not.toBeNull();
    expect(b!.itemAmount).toBe(1000 - 50 - 10 - 5 - 35 + 100);
    expect(b!.deliveryOriginal).toBe(70);
    const recomposed = b!.itemAmount - b!.discount - b!.couponDiscount + b!.delivery + b!.packaging + b!.platform + b!.taxes - b!.walletUsed - b!.cashbackUsed;
    expect(recomposed).toBe(b!.total);
  });
});

describe('dailyOrder', () => {
  it('compares calendar days only', () => {
    expect(isSameDay(new Date(2026, 0, 5, 1), new Date(2026, 0, 5, 23))).toBe(true);
    expect(isSameDay(new Date(2026, 0, 5), new Date(2026, 0, 6))).toBe(false);
  });
});

describe('cart bill', () => {
  it('is zero for an empty cart', () => {
    const cart = { orderType: 'subscription', item: null, coupon: null, treePlantation: null } as unknown as Cart;
    expect(buildBill(cart)).toEqual(emptyBill());
  });

  it('prices a lunch+dinner plan across days and never goes negative', () => {
    const cart = {
      orderType: 'subscription',
      coupon: null,
      treePlantation: null,
      item: {
        package: { packagePrice: 100, days: 5 },
        category: 'x',
        deliveryOnWeekends: false,
        addOns: [],
        selectedDates: ['2026-01-05'],
        lunch: true,
        dinner: true,
        count: 2,
      },
    } as unknown as Cart;
    const bill = buildBill(cart, DEFAULT_CHARGES);
    expect(bill.meals).toBe(10);
    expect(bill.packageTotal).toBe(100 * 2 * 2);
    expect(bill.toPay).toBeGreaterThanOrEqual(0);
  });
});

describe('media', () => {
  it('builds absolute image urls from the configured server', () => {
    configureCore({ serverUrl: 'https://api.test', apiSecretKey: 'k', isDev: false, registeredPlatform: 'test' });
    expect(imageUri('a/b.png')).toBe('https://api.test/images/a/b.png');
    expect(imageUri('https://cdn/x.png')).toBe('https://cdn/x.png');
    expect(imageUri('undefined')).toBeUndefined();
    expect(imageUri()).toBeUndefined();
  });
});

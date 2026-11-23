import { describe, expect, it } from 'vitest';

import type { OrderSummary } from '@mealawe/core';

import { isTrackable, ribLabel } from '../OpenOrdersRibs';

const base = { id: 'o1', title: 't', amount: 0 } as unknown as OrderSummary;
const order = (over: Partial<OrderSummary> & { raw?: Record<string, unknown> }): OrderSummary => ({ ...base, ...over }) as OrderSummary;

describe('ribLabel', () => {
  it('reads "Order #N · type"', () => {
    expect(ribLabel(order({ orderNo: 12, orderType: 'allDay' }))).toEqual({ title: 'Order #12', subtitle: 'On Demand' });
    expect(ribLabel(order({ orderNo: 7, orderType: 'apartment_today' })).subtitle).toBe('Apartment');
    expect(ribLabel(order({ orderType: 'mystery' })).subtitle).toBe('mystery');
    expect(ribLabel(order({}))).toEqual({ title: 'Order', subtitle: '' });
  });
});

describe('isTrackable', () => {
  const raw = { runner: { location: { lat: 18.5, lng: 73.8 } }, customerLocation: { geolocation: { lat: 18.51, lng: 73.81 } } };
  it('needs a rider position and a destination', () => {
    expect(isTrackable(order({ status: 'onTheWay', raw }))).toBe(true);
    expect(isTrackable(order({ status: 'onTheWay', raw: { customerLocation: raw.customerLocation } }))).toBe(false);
    expect(isTrackable(order({ status: 'onTheWay', raw: { runner: raw.runner } }))).toBe(false);
  });
  it('is never trackable once delivered or cancelled', () => {
    expect(isTrackable(order({ status: 'delivered', raw }))).toBe(false);
    expect(isTrackable(order({ status: 'cancelledByUser', raw }))).toBe(false);
  });
});

import { trackPurchase, trackPurchaseFailed, type NetcoreOrderType, type PurchasePayload } from '@mealawe/core';
import { useBulkCartStore, useCartStore, useConfigureStore, useOnDemandCartStore } from '@mealawe/state';

import { removeApartmentGroups } from '@/features/apartment/checkout';

import type { CartKind, OrderRef, PaymentRecap, PaymentState } from './types';

export interface FinishInput {
  state: PaymentState;
  ref: OrderRef;
  cartKind: CartKind;
  recap: PaymentRecap;
  reason?: 'auth-expired';
  /** Apartment: the cart groups covered by this payment bucket. */
  apartmentGroupKeys?: string[];
}

const MODE: Partial<Record<CartKind, string>> = { dinein: 'dinein', ondemand: 'ondemand', bulk: 'bulk', apartment: 'apartment' };

/** Same `mode` convention as the mobile result screen: absent = Subscription. */
export function resultUrl(p: FinishInput): string {
  const q = new URLSearchParams({ status: p.state, orderType: p.ref.orderType, foodOrderId: p.ref.foodOrderId, recapTitle: p.recap.title, recapAmount: String(p.recap.amount) });
  if (p.recap.days) q.set('recapDays', String(p.recap.days));
  const mode = MODE[p.cartKind];
  if (mode) q.set('mode', mode);
  if (p.reason) q.set('reason', p.reason);
  return `/order-result?${q.toString()}`;
}

function analyticsType(p: FinishInput): NetcoreOrderType {
  if (p.cartKind === 'bulk') return 'bulk';
  if (p.cartKind === 'ondemand') return p.ref.orderType === 'advance' ? 'advance' : 'allDay';
  return 'subscription';
}

/**
 * Runs the side effects of a settled payment and returns the result-screen URL.
 * Cart policy matches mobile: cleared unless the payment failed (a `pending` order already exists
 * server-side, so keeping the cart would invite a duplicate order on retry).
 */
export function finishPayment(p: FinishInput): string {
  if (p.cartKind === 'apartment') {
    // Only the paid bucket leaves the cart; other buckets are paid separately. No purchase analytics yet (no apartment event type).
    if (p.state !== 'failed') removeApartmentGroups(p.apartmentGroupKeys ?? []);
    return resultUrl(p);
  }
  const payload: PurchasePayload = {
    items: [{ prid: p.ref.foodOrderId, product_name: p.recap.title, category_name: p.cartKind, product_price: p.recap.amount, prqt: 1 }],
    total_items: 1,
    total_prqt: 1,
    selling_amount: p.recap.amount,
    amount: p.recap.amount,
  };
  if (p.state === 'failed') {
    trackPurchaseFailed(analyticsType(p), payload);
  } else {
    trackPurchase(analyticsType(p), payload);
    if (p.cartKind === 'subscription' || p.cartKind === 'dinein') {
      useCartStore.getState().reset();
      useConfigureStore.getState().clear();
    } else if (p.cartKind === 'ondemand') {
      useOnDemandCartStore.getState().reset();
    } else {
      useBulkCartStore.getState().reset();
    }
  }
  return resultUrl(p);
}

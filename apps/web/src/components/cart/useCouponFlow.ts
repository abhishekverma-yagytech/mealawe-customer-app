'use client';

import { useState } from 'react';

import { validateCouponForUser, validateVoucherCode } from '@mealawe/api';
import { discountFor, voucherDiscountFor, type AppliedCoupon, type DiscountContext, type SubscriptionCoupon } from '@mealawe/core';
import { useAuthStore, useClusterStore } from '@mealawe/state';

/**
 * Coupon / voucher application shared by the three carts (mirrors the logic duplicated in the mobile
 * cart screens): local eligibility via `discountFor`, then the server-side usage check.
 */
export function useCouponFlow(opts: {
  coupons: SubscriptionCoupon[];
  ctx: DiscountContext;
  /** Amount a voucher percentage applies to. */
  voucherBase: number;
  voucherOrderType: 'subscription' | 'bulk' | 'onDemand';
  apply: (c: AppliedCoupon) => void;
}) {
  const profileId = useAuthStore((s) => s.profile?._id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const evaluate = (c: SubscriptionCoupon) => {
    const { itemDiscount, deliveryDiscount, reason } = discountFor(c, opts.ctx);
    return { itemDiscount, deliveryDiscount, discount: itemDiscount + deliveryDiscount, reason };
  };

  const best = opts.coupons.reduce<{ coupon: SubscriptionCoupon; discount: number } | null>((acc, c) => {
    const e = evaluate(c);
    return !e.reason && e.discount > (acc?.discount ?? 0) ? { coupon: c, discount: e.discount } : acc;
  }, null);

  const applyCoupon = async (c: SubscriptionCoupon): Promise<boolean> => {
    if (busy) return false;
    const e = evaluate(c);
    if (e.reason) {
      setError(e.reason);
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      const { valid, message } = await validateCouponForUser(c.couponCode ?? '', profileId);
      if (!valid) {
        setError(message ?? 'This coupon can no longer be used.');
        return false;
      }
      opts.apply({ couponCode: c.couponCode ?? '', discount: e.discount, itemDiscount: e.itemDiscount, deliveryDiscount: e.deliveryDiscount, couponHeader: c.couponHeader });
      return true;
    } finally {
      setBusy(false);
    }
  };

  const applyCode = async (raw: string): Promise<boolean> => {
    const code = raw.trim();
    if (!code || busy) return false;
    const found = opts.coupons.find((c) => (c.couponCode ?? '').toLowerCase() === code.toLowerCase());
    if (found) return applyCoupon(found);
    // Not a listed coupon: try it as a voucher code.
    setBusy(true);
    setError(null);
    try {
      const { valid, message, voucher } = await validateVoucherCode(code, profileId, opts.voucherOrderType, useClusterStore.getState().clusterIds());
      if (!valid || !voucher) {
        setError(message ?? 'Invalid or expired coupon');
        return false;
      }
      const { discount, reason } = voucherDiscountFor(voucher, opts.voucherBase);
      if (reason) {
        setError(reason);
        return false;
      }
      opts.apply({ couponCode: voucher.voucherCode, discount, itemDiscount: discount, deliveryDiscount: 0, couponHeader: voucher.description });
      return true;
    } finally {
      setBusy(false);
    }
  };

  return { error, setError, busy, best, evaluate, applyCoupon, applyCode };
}

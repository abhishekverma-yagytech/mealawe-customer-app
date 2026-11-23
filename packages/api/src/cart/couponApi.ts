import { type Voucher, ENDPOINTS, http } from '@mealawe/core';

export interface CouponValidation {
  valid: boolean;
  message?: string;
}

export interface VoucherValidation {
  valid: boolean;
  message?: string;
  voucher?: Voucher;
}

/**
 * Server-side coupon usage check — the only place `couponUsage`
 * (oneTimeOneUser/oneTimeOneDay/everytime) limits are enforced. Call this
 * right before actually applying a coupon (after the local minAmount/base
 * check already passed), across all three carts. Ported from the Ionic
 * reference's `payment-gateway.service.ts#validateCouponForUser` — ANY
 * non-'VALID_OFFER' status (including a request failure) is treated as
 * "don't apply" rather than silently letting the coupon through.
 */
export async function validateCouponForUser(
  couponCode: string,
  userId: string | null | undefined,
): Promise<CouponValidation> {
  try {
    const res = await http.get<{ status: string; msg?: string }>(
      `${ENDPOINTS.subscription.validateCouponForUser}/${encodeURIComponent(couponCode)}/${userId ?? 'null'}/${encodeURIComponent(new Date().toISOString())}`,
    );
    if (res?.status === 'VALID_OFFER') {
      return { valid: true };
    }
    return { valid: false, message: res?.msg ?? 'This coupon can no longer be used.' };
  } catch {
    return { valid: false, message: 'Could not verify this coupon right now — try again.' };
  }
}

/**
 * Resolve + validate a voucher code — unlike coupons, there's no pre-fetched
 * list to match a typed code against: the server resolves the voucher
 * document itself and enforces `voucherUsage` (oneTimeOneUser/oneTimeOneDay/
 * oneTimeOnly/everytime) server-side, same "any non-'VALID_OFFER' status
 * means don't apply" convention as `validateCouponForUser`. Ported from the
 * Ionic reference's `offers-coupon.component.ts#validateAndApplyVoucher` +
 * `payment-gateway.service.ts#validateClusterVoucherCode`.
 */
export async function validateVoucherCode(
  voucherCode: string,
  userId: string | null | undefined,
  orderType: string,
  clusters: string[],
): Promise<VoucherValidation> {
  try {
    const res = await http.post<{ status: string; msg?: string; voucher?: Voucher }>(
      `${ENDPOINTS.subscription.validateVoucherCode}/${encodeURIComponent(voucherCode)}/${userId ?? 'null'}/${encodeURIComponent(orderType)}`,
      { clusters },
    );
    if (res?.status === 'VALID_OFFER' && res.voucher) {
      return { valid: true, voucher: res.voucher };
    }
    return { valid: false, message: res?.msg ?? 'Invalid or expired voucher code' };
  } catch {
    return { valid: false, message: 'Could not verify this voucher right now — try again.' };
  }
}

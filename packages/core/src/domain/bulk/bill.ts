import { round2 } from '../../utils/money';

import type { BulkCartLine, BulkCategory, BulkOrgInfo } from './types';

export interface BulkBillCharges {
  deliveryGstPercent: number;
  packagingGstPercent: number;
  platformGstPercent: number;
  itemGstPercent: number;
}

/** Fallback GST rates (overridden by the cluster config in a later phase, same as subscription's DEFAULT_CHARGES). */
export const DEFAULT_BULK_CHARGES: BulkBillCharges = {
  deliveryGstPercent: 18,
  packagingGstPercent: 18,
  platformGstPercent: 18,
  itemGstPercent: 5,
};

/** Map a cluster config variable (searchClusterVariable) onto BulkBillCharges. */
export function chargesFromBulkConfig(cfg: Record<string, unknown> | null | undefined): BulkBillCharges {
  if (!cfg) {
    return DEFAULT_BULK_CHARGES;
  }
  const num = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    deliveryGstPercent: num(cfg['bulkDeliveryGstPercentage'], DEFAULT_BULK_CHARGES.deliveryGstPercent),
    packagingGstPercent: num(
      cfg['bulkEcoFriendlyPackagingGstPercentage'],
      DEFAULT_BULK_CHARGES.packagingGstPercent,
    ),
    platformGstPercent: num(cfg['bulkPlatformChargesGstPercentage'], DEFAULT_BULK_CHARGES.platformGstPercent),
    itemGstPercent: DEFAULT_BULK_CHARGES.itemGstPercent,
  };
}

export interface BulkBill {
  totalQty: number;
  subTotal: number;
  delivery: number;
  packaging: number;
  platform: number;
  taxes: number;
  discount: number;
  cashbackUsed: number;
  moneyWalletUsed: number;
  toPay: number;
  saving: number;
}

/** Total-cart-quantity delivery-charge slab, mirrors calculateDeliveryCharge(). */
function deliveryChargeFor(totalQty: number, orgInfo: BulkOrgInfo, category: BulkCategory): number {
  // Nullish (not `||`) — a legitimately-configured 0 must stay 0, matching the
  // Ionic source's `slabLimit1 ?? moq ?? 0`.
  const s1 = orgInfo.slabLimit1 ?? orgInfo.moq ?? 0;
  const s2 = orgInfo.slabLimit2 ?? s1;
  const s3 = orgInfo.slabLimit3 ?? s2;
  if (totalQty <= s1) return orgInfo.deliverySlab1 || 0;
  if (totalQty <= s2) return orgInfo.deliverySlab2 || orgInfo.deliverySlab1 || 0;
  if (totalQty <= s3) return orgInfo.deliverySlab3 || orgInfo.deliverySlab2 || 0;
  if (category === 'snacks') return orgInfo.deliverySlab3 || orgInfo.deliverySlab2 || 0;
  return orgInfo.deliverySlab4 || orgInfo.deliverySlab3 || 0;
}

export function emptyBulkBill(): BulkBill {
  return {
    totalQty: 0,
    subTotal: 0,
    delivery: 0,
    packaging: 0,
    platform: 0,
    taxes: 0,
    discount: 0,
    cashbackUsed: 0,
    moneyWalletUsed: 0,
    toPay: 0,
    saving: 0,
  };
}

/**
 * Mirrors `getOtherPayAmt()`'s slab delivery charge + layered GST. Cashback
 * redemption has no equivalent in MealaweUserApp's bulk cart (money-wallet
 * only there) — it's included here to match this app's Subscription checkout
 * depth (see the bulk-ordering design spec), following `cart/bill.ts`'s
 * cashback-then-wallet reduction order.
 */
export function buildBulkBill(
  lines: BulkCartLine[],
  orgInfo: BulkOrgInfo | null,
  category: BulkCategory,
  charges: BulkBillCharges = DEFAULT_BULK_CHARGES,
  couponItemDiscount = 0,
  couponDeliveryDiscount = 0,
  cashbackUsed = 0,
  moneyWalletUsed = 0,
  /**
   * Per-box packaging & customization charge (FOOD_BOX_PACKAGING_COST ×
   * number of boxes) — Food Box's Customized mode bills packaging per box
   * instead of the flat `orgInfo.packagingCharges` every other bulk category
   * uses. Ported from MealaweUserApp's `bulk-order-cart.component.ts`
   * `calculateSnackBoxPackagingCost`. Omit/leave undefined for meals/snacks.
   */
  packagingOverride?: number,
): BulkBill {
  const totalQty = lines.reduce((sum, l) => sum + l.count, 0);
  const subTotal = round2(lines.reduce((sum, l) => sum + l.itemPrice * l.count, 0));
  const couponDiscount = couponItemDiscount + couponDeliveryDiscount;

  if (!orgInfo || totalQty === 0) {
    const toPay = Math.max(0, round2(subTotal - couponItemDiscount));
    return { ...emptyBulkBill(), subTotal, discount: couponDiscount, toPay, saving: couponDiscount };
  }

  const delivery = deliveryChargeFor(totalQty, orgInfo, category);
  const packaging = packagingOverride ?? orgInfo.packagingCharges ?? 0;
  const platform = orgInfo.platformCharges || 0;

  const deliveryGst = round2((delivery * charges.deliveryGstPercent) / 100);
  const packagingGst = round2((packaging * charges.packagingGstPercent) / 100);
  const platformGst = round2((platform * charges.platformGstPercent) / 100);
  // A coupon's delivery-side discount is NOT subtracted from `delivery`
  // before this GST calc — see cart/bill.ts's buildBill for the same rule
  // and its rationale (matches the Ionic reference).
  const itemGst = round2(((subTotal - couponItemDiscount) * charges.itemGstPercent) / 100);
  const taxes = round2(deliveryGst + packagingGst + platformGst + itemGst);

  const grossToPay = round2(
    subTotal - couponItemDiscount + delivery + packaging + platform + taxes - couponDeliveryDiscount,
  );
  const cashback = round2(Math.max(0, Math.min(cashbackUsed, grossToPay)));
  const afterCashback = round2(grossToPay - cashback);
  const moneyWallet = round2(Math.max(0, Math.min(moneyWalletUsed, afterCashback)));
  const toPay = round2(afterCashback - moneyWallet);
  const saving = round2(couponDiscount + cashback + moneyWallet);

  return {
    totalQty,
    subTotal,
    delivery,
    packaging,
    platform,
    taxes,
    discount: couponDiscount,
    cashbackUsed: cashback,
    moneyWalletUsed: moneyWallet,
    toPay,
    saving,
  };
}

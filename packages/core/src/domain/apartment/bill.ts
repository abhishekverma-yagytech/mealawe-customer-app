import { round2 } from '../../utils/money';

import type { ApartmentCartLine } from './types';

/** Narrow slice of `ApartmentConfig` this file's GST/charge math needs, so a caller holding the full config can pass it straight through. */
export interface ApartmentGstConfig {
  itemGstPercent: number;
  deliveryGstPercent: number;
  platformCharges: number;
  platformGstPercent: number;
  /** Its own flat charge + GST%, distinct from platform charges. */
  packagingCharges: number;
  packagingGstPercent: number;
}

export const ZERO_GST_CONFIG: ApartmentGstConfig = {
  itemGstPercent: 0,
  deliveryGstPercent: 0,
  platformCharges: 0,
  platformGstPercent: 0,
  packagingCharges: 0,
  packagingGstPercent: 0,
};

/** Single source of the layered-GST math (mirrors Subscription/On-Demand/Bulk's own bill.ts): each charge bucket gets its own GST%, summed into one `taxes` total. */
export function computeApartmentCharges(
  subTotal: number,
  deliveryCharge: number,
  gstConfig: ApartmentGstConfig,
): {
  platformCharges: number;
  packagingCharges: number;
  cgst: number;
  sgst: number;
  deliveryChargesGST: number;
  platformChargesGST: number;
  packagingChargesGST: number;
  taxes: number;
} {
  const platformCharges = round2(gstConfig.platformCharges);
  const packagingCharges = round2(gstConfig.packagingCharges);
  // CGST/SGST split evenly from the full item-GST amount; SGST absorbs any rounding remainder.
  const itemGst = round2((subTotal * gstConfig.itemGstPercent) / 100);
  const cgst = round2(itemGst / 2);
  const sgst = round2(itemGst - cgst);
  const deliveryChargesGST = round2((deliveryCharge * gstConfig.deliveryGstPercent) / 100);
  const platformChargesGST = round2((platformCharges * gstConfig.platformGstPercent) / 100);
  const packagingChargesGST = round2((packagingCharges * gstConfig.packagingGstPercent) / 100);
  const taxes = round2(cgst + sgst + deliveryChargesGST + platformChargesGST + packagingChargesGST);
  return { platformCharges, packagingCharges, cgst, sgst, deliveryChargesGST, platformChargesGST, packagingChargesGST, taxes };
}

export interface ApartmentGroupBill {
  subTotal: number;
  /** Client-side estimate only — the server always recomputes and discards what the client sends; shown so the bill isn't blank pre-checkout. */
  estimatedDelivery: number;
  /** Flat, config-driven (`APARTMENT_PLATFORM_CHARGES`), 0 when unset. */
  platformCharges: number;
  /** Its own separate config value (`APARTMENT_PACKAGING_CHARGES`), not a duplicate of platformCharges. */
  packagingCharges: number;
  /** CGST/SGST halves of item-amount GST (`ORDER_GST`), split evenly. */
  cgst: number;
  sgst: number;
  /** GST on delivery, platform, and packaging charges respectively. */
  deliveryChargesGST: number;
  platformChargesGST: number;
  packagingChargesGST: number;
  /** Collapsed sum of all GST components shown as one "GST & charges" row. */
  taxes: number;
  estimatedTotal: number;
}

const EMPTY_BILL: ApartmentGroupBill = {
  subTotal: 0,
  estimatedDelivery: 0,
  platformCharges: 0,
  packagingCharges: 0,
  cgst: 0,
  sgst: 0,
  deliveryChargesGST: 0,
  platformChargesGST: 0,
  packagingChargesGST: 0,
  taxes: 0,
  estimatedTotal: 0,
};

/** Bill for one meal-slot group (Today's clubbing) or the single implicit group other order types have; each group becomes its own checkout order since one order can only carry one `fulfillmentMode`/`mealType`. */
export function buildApartmentGroupBill(
  lines: ApartmentCartLine[],
  pickup: boolean,
  kitchenDeliveryChargeOverride: number | null | undefined,
  platformDefaultDeliveryCharge: number,
  gstConfig: ApartmentGstConfig,
): ApartmentGroupBill {
  const subTotal = round2(lines.reduce((sum, l) => sum + l.offer.price * l.count, 0));
  if (subTotal <= 0) return EMPTY_BILL;
  const estimatedDelivery = pickup
    ? 0
    : typeof kitchenDeliveryChargeOverride === 'number' && kitchenDeliveryChargeOverride >= 0
      ? kitchenDeliveryChargeOverride
      : platformDefaultDeliveryCharge;
  const charges = computeApartmentCharges(subTotal, estimatedDelivery, gstConfig);
  return {
    subTotal,
    estimatedDelivery,
    ...charges,
    estimatedTotal: round2(subTotal + estimatedDelivery + charges.platformCharges + charges.packagingCharges + charges.taxes),
  };
}

/** Bill for a combined payment bucket (multiple cart groups sharing one pickup/delivery choice, submitted as one checkout call); delivery charge is computed once per distinct order type present, not once per meal-slot group. */
/** Per-order-type delivery charge rows for the Bill Details screen — one row per distinct order type present, instead of one combined figure. Empty for pickup. */
export function buildApartmentBucketDeliveryBreakdown(
  bucketGroups: { orderType: string; lines: ApartmentCartLine[] }[],
  pickup: boolean,
  kitchenDeliveryChargeOverride: number | null | undefined,
  platformDefaultDeliveryChargeByOrderType: Record<string, number>,
): { orderType: string; amount: number }[] {
  if (pickup) return [];
  const hasOverride = typeof kitchenDeliveryChargeOverride === 'number' && kitchenDeliveryChargeOverride >= 0;
  const distinctOrderTypes = [...new Set(bucketGroups.map((g) => g.orderType))];
  return distinctOrderTypes.map((orderType) => ({
    orderType,
    amount: round2(hasOverride ? (kitchenDeliveryChargeOverride as number) : (platformDefaultDeliveryChargeByOrderType[orderType] ?? 30)),
  }));
}

export function buildApartmentBucketBill(
  bucketGroups: { orderType: string; lines: ApartmentCartLine[] }[],
  pickup: boolean,
  kitchenDeliveryChargeOverride: number | null | undefined,
  platformDefaultDeliveryChargeByOrderType: Record<string, number>,
  gstConfig: ApartmentGstConfig,
): ApartmentGroupBill {
  const subTotal = round2(bucketGroups.reduce((sum, g) => sum + g.lines.reduce((s, l) => s + l.offer.price * l.count, 0), 0));
  if (subTotal <= 0) return EMPTY_BILL;
  // One delivery charge per distinct orderType present; reuses the breakdown above.
  const estimatedDelivery = round2(
    buildApartmentBucketDeliveryBreakdown(bucketGroups, pickup, kitchenDeliveryChargeOverride, platformDefaultDeliveryChargeByOrderType).reduce(
      (sum, d) => sum + d.amount,
      0,
    ),
  );
  // Platform/packaging charges are one flat figure per bucket, unlike delivery charge.
  const charges = computeApartmentCharges(subTotal, estimatedDelivery, gstConfig);
  return {
    subTotal,
    estimatedDelivery,
    ...charges,
    estimatedTotal: round2(subTotal + estimatedDelivery + charges.platformCharges + charges.packagingCharges + charges.taxes),
  };
}

export function buildApartmentCartTotal(lines: ApartmentCartLine[]): { itemCount: number; subTotal: number } {
  const itemCount = lines.reduce((sum, l) => sum + l.count, 0);
  const subTotal = round2(lines.reduce((sum, l) => sum + l.offer.price * l.count, 0));
  return { itemCount, subTotal };
}

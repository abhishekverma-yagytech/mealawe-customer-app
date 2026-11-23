import { ENDPOINTS } from '../../http/endpoints';
import { http } from '../../http/httpClient';

import { round2 } from '../../utils/money';

import type { OnDemandCartLine } from './types';

export interface OnDemandBillCharges {
  deliveryCharge: number;
  deliveryChargeDiscount: number;
  deliveryGstPercent: number;
  packagingCharge: number;
  packagingChargeDiscount: number;
  packagingGstPercent: number;
  platformCharge: number;
  platformChargeDiscount: number;
  platformGstPercent: number;
  /** GST % on the (discounted) item amount. */
  itemGstPercent: number;
}

/** Fallback charges (overridden by the cluster config in a later phase). */
export const DEFAULT_ONDEMAND_CHARGES: OnDemandBillCharges = {
  deliveryCharge: 30,
  deliveryChargeDiscount: 0,
  deliveryGstPercent: 18,
  packagingCharge: 10,
  packagingChargeDiscount: 0,
  packagingGstPercent: 18,
  platformCharge: 5,
  platformChargeDiscount: 0,
  platformGstPercent: 18,
  itemGstPercent: 5,
};

/** Map a cluster config variable (searchClusterVariable) onto OnDemandBillCharges.
 * Field names match real, already-existing keys on the server's
 * ClusterConfigVariable model (onDemand* fields) — see design spec's Business
 * logic section. */
export function chargesFromOnDemandConfig(cfg: Record<string, unknown> | null | undefined): OnDemandBillCharges {
  if (!cfg) {
    return DEFAULT_ONDEMAND_CHARGES;
  }
  const num = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    deliveryCharge: num(cfg['onDemandDeliveryCharges'], DEFAULT_ONDEMAND_CHARGES.deliveryCharge),
    deliveryChargeDiscount: num(
      cfg['onDemandDeliveryChargesDiscount'],
      DEFAULT_ONDEMAND_CHARGES.deliveryChargeDiscount,
    ),
    deliveryGstPercent: num(cfg['onDemandDeliveryGstPercentage'], DEFAULT_ONDEMAND_CHARGES.deliveryGstPercent),
    packagingCharge: num(
      cfg['onDemandEcoFriendlyPackagingCharges'],
      DEFAULT_ONDEMAND_CHARGES.packagingCharge,
    ),
    packagingChargeDiscount: num(
      cfg['onDemandEcoFriendlyPackagingChargesDiscount'],
      DEFAULT_ONDEMAND_CHARGES.packagingChargeDiscount,
    ),
    packagingGstPercent: num(
      cfg['onDemandEcoFriendlyPackagingGstPercentage'],
      DEFAULT_ONDEMAND_CHARGES.packagingGstPercent,
    ),
    platformCharge: num(cfg['onDemandPlatformCharges'], DEFAULT_ONDEMAND_CHARGES.platformCharge),
    platformChargeDiscount: num(
      cfg['onDemandPlatformChargesDiscount'],
      DEFAULT_ONDEMAND_CHARGES.platformChargeDiscount,
    ),
    platformGstPercent: num(cfg['onDemandPlatformChargesGstPercentage'], DEFAULT_ONDEMAND_CHARGES.platformGstPercent),
    itemGstPercent: DEFAULT_ONDEMAND_CHARGES.itemGstPercent,
  };
}

export interface OnDemandBill {
  subTotal: number;
  kitchenDiscount: number;
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

export function emptyOnDemandBill(): OnDemandBill {
  return {
    subTotal: 0,
    kitchenDiscount: 0,
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
 * Pure bill computation — mirrors `getOtherPayAmt()`: flat (not per-day)
 * delivery/packaging/platform charges with their own GST%, kitchen discount
 * applied before coupon, then cashback then money-wallet reduce the payable.
 */
export function buildOnDemandBill(
  lines: OnDemandCartLine[],
  kitchenDiscount: number,
  charges: OnDemandBillCharges = DEFAULT_ONDEMAND_CHARGES,
  couponItemDiscount = 0,
  couponDeliveryDiscount = 0,
  cashbackUsed = 0,
  moneyWalletUsed = 0,
): OnDemandBill {
  const subTotal = round2(lines.reduce((sum, l) => sum + l.item.itemPrice * l.count, 0));

  if (lines.length === 0) {
    return emptyOnDemandBill();
  }

  const delivery = round2(charges.deliveryCharge - charges.deliveryChargeDiscount);
  const packaging = round2(charges.packagingCharge - charges.packagingChargeDiscount);
  const platform = round2(charges.platformCharge - charges.platformChargeDiscount);

  const totalDiscount = round2(kitchenDiscount + couponItemDiscount);
  // A coupon's delivery-side discount is NOT subtracted from `delivery`
  // before this GST calc — see cart/bill.ts's buildBill for the same rule
  // and its rationale (matches the Ionic reference).
  const itemGst = round2(((subTotal - totalDiscount) * charges.itemGstPercent) / 100);
  const deliveryGst = round2((delivery * charges.deliveryGstPercent) / 100);
  const packagingGst = round2((packaging * charges.packagingGstPercent) / 100);
  const platformGst = round2((platform * charges.platformGstPercent) / 100);
  const taxes = round2(itemGst + deliveryGst + packagingGst + platformGst);

  const grossToPay = round2(
    subTotal - totalDiscount + delivery + packaging + platform + taxes - couponDeliveryDiscount,
  );
  const cashback = round2(Math.max(0, Math.min(cashbackUsed, grossToPay)));
  const afterCashback = round2(grossToPay - cashback);
  const moneyWallet = round2(Math.max(0, Math.min(moneyWalletUsed, afterCashback)));
  const toPay = round2(afterCashback - moneyWallet);
  const saving = round2(totalDiscount + couponDeliveryDiscount + cashback + moneyWallet);

  return {
    subTotal,
    kitchenDiscount,
    delivery,
    packaging,
    platform,
    taxes,
    discount: couponItemDiscount + couponDeliveryDiscount,
    cashbackUsed: cashback,
    moneyWalletUsed: moneyWallet,
    toPay,
    saving,
  };
}

/** Order value above which the higher cashback-redeem tier applies — mirrors
 * the Ionic reference's hardcoded ₹499 threshold (`tabCart.page.ts`). */
const CASHBACK_TIER_THRESHOLD = 499;
const DEFAULT_CASHBACK_REDEEM_PERCENT = 100;

/**
 * How much of the customer's *available* cashback balance they're allowed to
 * redeem on this order — a percentage of the balance itself (not of the
 * order value), tiered by order size, both admin-configured. Ported from
 * `tabCart.page.ts`'s `mealaweWalletRedeemPointsLimit`/
 * `maxMealaweWalletPointsAllowed`: RN's on-demand cart previously let a
 * customer redeem their *entire* cashback balance regardless of order size —
 * live config confirms this deployment actually sets the small-order tier to
 * 50% (`USER_MEALAWE_WALLET_REDEEM_PERCENTAGE`), so this wasn't a
 * theoretical gap. Money-wallet redemption isn't capped the same way here:
 * `buildOnDemandBill` already limits it to "not more than what's left to
 * pay" via its own `Math.min`, which is equivalent to this deployment's
 * `USER_WALLET_REDEEM_PERCENTAGE` (100%) — nothing to additionally cap while
 * that config stays at 100.
 */
export async function maxRedeemableCashback(cashbackBalance: number, orderAmountBeforeWallet: number): Promise<number> {
  if (cashbackBalance <= 0) return 0;
  let minPercent = DEFAULT_CASHBACK_REDEEM_PERCENT;
  let maxPercent = DEFAULT_CASHBACK_REDEEM_PERCENT;
  try {
    const res = await http.post<{ configName: string; configData: string }[]>(ENDPOINTS.support.variables, {
      variableNames: ['USER_MEALAWE_WALLET_REDEEM_PERCENTAGE', 'USER_MEALAWE_WALLET_REDEEM_MAX_PERCENTAGE'],
    });
    const map: Record<string, string> = {};
    for (const row of Array.isArray(res) ? res : []) {
      if (row?.configName) map[row.configName] = row.configData;
    }
    minPercent = Number(map.USER_MEALAWE_WALLET_REDEEM_PERCENTAGE) || DEFAULT_CASHBACK_REDEEM_PERCENT;
    maxPercent = Number(map.USER_MEALAWE_WALLET_REDEEM_MAX_PERCENTAGE) || DEFAULT_CASHBACK_REDEEM_PERCENT;
  } catch {
    // Config fetch failed — falls through to the 100% defaults, same as
    // "no cap" (today's actual large-order behavior), never blocking checkout.
  }
  const percent = orderAmountBeforeWallet >= CASHBACK_TIER_THRESHOLD ? maxPercent : minPercent;
  const byBalance = Math.floor((cashbackBalance / 100) * percent);
  return Math.max(0, Math.min(byBalance, orderAmountBeforeWallet));
}

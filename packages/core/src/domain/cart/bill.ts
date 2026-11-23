import { extraAddonDays } from '../subscription/pricing';
import type { SubscriptionCoupon, Voucher } from '../subscription/types';
import { formatINR } from '../../utils/currency';

import type { Bill, BillCharges, Cart } from './types';

/** Fallback per-meal charges (overridden by the cluster config variable). */
export const DEFAULT_CHARGES: BillCharges = {
  deliveryPerMeal: 18,
  deliveryPerMealDiscount: 8,
  packagingPerMeal: 9,
  packagingPerMealDiscount: 9, // net 0 → FREE
  platformPerMeal: 5,
  platformPerMealDiscount: 5, // net 0 → FREE
  deliveryGstPercent: 18,
  packagingGstPercent: 18,
  platformGstPercent: 18,
  itemGstPercent: 5,
  treePlantationAmount: 299,
};

/** Map a cluster config variable (searchClusterVariable) onto BillCharges. */
export function chargesFromConfig(cfg: Record<string, unknown> | null | undefined): BillCharges {
  if (!cfg) {
    return DEFAULT_CHARGES;
  }
  const num = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    deliveryPerMeal: num(cfg['subscriptionDeliveryCharges'], DEFAULT_CHARGES.deliveryPerMeal),
    deliveryPerMealDiscount: num(
      cfg['subscriptionDeliveryChargesDiscount'],
      DEFAULT_CHARGES.deliveryPerMealDiscount,
    ),
    packagingPerMeal: num(
      cfg['subscriptionEcoFriendlyPackagingCharges'],
      DEFAULT_CHARGES.packagingPerMeal,
    ),
    packagingPerMealDiscount: num(
      cfg['subscriptionEcoFriendlyPackagingChargesDiscount'],
      DEFAULT_CHARGES.packagingPerMealDiscount,
    ),
    platformPerMeal: num(cfg['subscriptionPlatformCharges'], DEFAULT_CHARGES.platformPerMeal),
    platformPerMealDiscount: num(
      cfg['subscriptionPlatformChargesDiscount'],
      DEFAULT_CHARGES.platformPerMealDiscount,
    ),
    deliveryGstPercent: num(cfg['subscriptionDeliveryGstPercentage'], DEFAULT_CHARGES.deliveryGstPercent),
    packagingGstPercent: num(
      cfg['subscriptionEcoFriendlyPackagingGstPercentage'],
      DEFAULT_CHARGES.packagingGstPercent,
    ),
    platformGstPercent: num(cfg['subscriptionPlatformGstPercentage'], DEFAULT_CHARGES.platformGstPercent),
    itemGstPercent: DEFAULT_CHARGES.itemGstPercent,
    treePlantationAmount: num(cfg['TREE_PLANTATION_PRICE'], DEFAULT_CHARGES.treePlantationAmount),
  };
}

/** The amounts `discountFor` needs to evaluate a coupon: the item/plan
 * subtotal (always the base for `offerAppliedOn: 'itemAmount'`, the default),
 * plus delivery charge and taxes (added to the base for `'billAmount'`, and
 * `deliveryCharge` also caps how much of the discount can land on delivery). */
export interface DiscountContext {
  itemSubTotal: number;
  deliveryCharge: number;
  taxes: number;
  /** Subscription orders behave differently in the Ionic reference's
   * `validateAndApplyCoupon`, confirmed against real production coupon data
   * (e.g. `PAYDAY`: `discountOnDelivery: true, discountOnItems: false` on a
   * subscription-only coupon): the subscription branch never reads
   * `discountOnDelivery`/`discountOnItems` at all — the whole discount stays
   * one undifferentiated item-side number, same as it always has for
   * subscriptions — and a `billAmount` base only adds `taxes`, not delivery
   * charge. Non-subscription carts (on-demand, bulk) use the full
   * delivery/item split and the delivery-inclusive `billAmount` base — the
   * default (`false`/omitted) — matching that same reference's non-
   * subscription branch, which does read both flags. */
  isSubscription?: boolean;
}

/** Coerces a possibly-unclean value (a coupon's numeric fields aren't
 * runtime-validated — `SubscriptionCoupon` carries a `[key: string]: unknown`
 * catch-all, and the backend has been observed sending numeric-looking
 * fields as strings) to a finite number, falling back when it isn't one.
 * Plain `|| 0` doesn't catch this: a truthy-but-non-numeric string sails
 * through unchanged and turns the arithmetic below into `NaN` silently. */
function toFiniteNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Resolve a coupon's discount against a bill context (flat / percentage /
 * full-order, capped), split across item vs. delivery per the coupon's
 * `discountOnDelivery`/`discountOnItems` flags. Ported to match the Ionic
 * reference's `tabCart.page.ts#validateAndApplyCoupon` exactly:
 * - `offerAppliedOn: 'billAmount'` widens the base (and the `minAmount` gate)
 *   to item + delivery + taxes for non-subscription carts, or item + taxes
 *   only (no delivery) for subscriptions — see `DiscountContext.isSubscription`.
 * - percentage discounts floor (not round — a ₹1 mismatch either way was
 *   possible before); `applyFullDiscount` coupons (confirmed live in this
 *   deployment, e.g. `FREEFOOD`) discount the whole eligible amount instead
 *   of computing from `discountType`/`discountValue` at all.
 * - the split takes delivery first (capped at `deliveryCharge`), then any
 *   remainder goes to items — for non-subscription carts only. Subscription
 *   orders always route the whole discount to `itemDiscount`, ignoring
 *   `discountOnDelivery`/`discountOnItems` entirely (see
 *   `DiscountContext.isSubscription`), matching real live data (e.g. the
 *   `PAYDAY` subscription coupon ships `discountOnDelivery: true,
 *   discountOnItems: false`, which the reference app never actually reads
 *   for that order type). A non-subscription coupon with neither flag set
 *   defaults to items-only — today's (pre-this-change) behavior, unchanged
 *   for coupons that don't specify either flag.
 */
export function discountFor(
  coupon: SubscriptionCoupon,
  ctx: DiscountContext,
): { itemDiscount: number; deliveryDiscount: number; reason?: string } {
  const base =
    coupon.offerAppliedOn === 'billAmount'
      ? ctx.itemSubTotal + (ctx.isSubscription ? 0 : ctx.deliveryCharge) + ctx.taxes
      : ctx.itemSubTotal;
  const min = toFiniteNumber(coupon.minAmount);
  if (base < min) {
    return {
      itemDiscount: 0,
      deliveryDiscount: 0,
      reason: `Add ${formatINR(min - base)} more to use this coupon`,
    };
  }
  // `maxLimit` keeps its original "falsy (including 0/unset) means no cap"
  // semantics — only a truthy value is treated as a real cap, and even then
  // only once it's confirmed to actually coerce to a finite number.
  const maxLimit = coupon.maxLimit ? toFiniteNumber(coupon.maxLimit, 0) || undefined : undefined;
  let raw: number;
  if (coupon.applyFullDiscount) {
    const capped = maxLimit ? Math.min(base, maxLimit) : base;
    raw = Math.round(capped);
  } else {
    const value = toFiniteNumber(coupon.discountValue);
    if (coupon.discountType === 'flat') {
      raw = Math.min(value, base);
    } else {
      const pct = Math.floor((base * value) / 100);
      raw = maxLimit ? Math.min(pct, maxLimit) : pct;
    }
  }
  // Subscription orders never split — see DiscountContext.isSubscription's
  // own comment for why this is a hard override, not just another
  // neither-flag-set case: `discountOnDelivery`/`discountOnItems` are
  // genuinely unread by the reference app for this order type, regardless of
  // what value either flag carries on the coupon document.
  if (ctx.isSubscription || (!coupon.discountOnDelivery && !coupon.discountOnItems)) {
    return { itemDiscount: raw, deliveryDiscount: 0 };
  }
  let remaining = raw;
  let deliveryDiscount = 0;
  if (coupon.discountOnDelivery) {
    deliveryDiscount = Math.min(remaining, ctx.deliveryCharge);
    remaining -= deliveryDiscount;
  }
  // Items are always the fallback for any undistributed remainder — see
  // SubscriptionCoupon.discountOnItems's own doc comment for why this
  // doesn't gate on that flag's value: the discount total must never be
  // silently reduced by a flag combination that leaves money unallocated.
  const itemDiscount = remaining;
  return { itemDiscount, deliveryDiscount };
}

/**
 * Resolve a voucher's discount — always item-side only, no `billAmount`/
 * `discountOnDelivery` split concept at all (see `Voucher`'s own doc comment
 * for why). Ported verbatim from the Ionic reference's
 * `tabCart.page.ts#validateAndApplyVoucher`: `base` is the same "item
 * sub-total, plan discount already excluded" value `discountFor` uses, flat
 * discounts aren't capped by `maxLimit` (matching the reference, which only
 * applies the cap to the percentage branch), and percentage discounts floor
 * before capping.
 */
export function voucherDiscountFor(
  voucher: Voucher,
  itemSubTotal: number,
): { discount: number; reason?: string } {
  const min = toFiniteNumber(voucher.minAmount);
  if (itemSubTotal < min) {
    return { discount: 0, reason: `Add ${formatINR(min - itemSubTotal)} more to use this voucher` };
  }
  const maxLimit = voucher.maxLimit ? toFiniteNumber(voucher.maxLimit, 0) || undefined : undefined;
  const value = toFiniteNumber(voucher.discountValue);
  if (voucher.discountType === 'flat') {
    return { discount: Math.min(value, itemSubTotal) };
  }
  const pct = Math.floor((itemSubTotal * value) / 100);
  return { discount: maxLimit ? Math.min(pct, maxLimit) : pct };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function emptyBill(): Bill {
  return {
    meals: 0,
    packageTotal: 0,
    addOnTotal: 0,
    subTotal: 0,
    discount: 0,
    delivery: 0,
    deliveryOriginal: 0,
    packaging: 0,
    packagingOriginal: 0,
    platform: 0,
    platformOriginal: 0,
    taxes: 0,
    itemGst: 0,
    deliveryGst: 0,
    packagingGst: 0,
    platformGst: 0,
    cashbackUsed: 0,
    moneyWalletUsed: 0,
    treePlantationCharge: 0,
    toPay: 0,
    saving: 0,
  };
}

/**
 * Pure bill computation — mirrors MealaweUserApp's getSubscriptionPayAmt:
 * package price, add-ons and all charges scale by days × mealsPerDay (lunch+dinner=2);
 * item GST on the discounted item amount, plus layered GST on the net delivery /
 * packaging / platform charges. Cashback then money-wallet points reduce the payable.
 */
export function buildBill(
  cart: Cart,
  charges: BillCharges = DEFAULT_CHARGES,
  cashbackUsed = 0,
  moneyWalletUsed = 0,
): Bill {
  const item = cart.item;
  if (!item) {
    return emptyBill();
  }
  const pkg = item.package;
  const count = item.count || 1;
  const days = pkg.days || item.selectedDates.length || 1;
  // Dine-in never doubles for a lunch+dinner selection — it's one dine-in
  // visit per day regardless of which meal times are acceptable, not two
  // separate meals. Mirrors the Ionic reference's dine-in
  // `getSubscriptionPayAmt`, which hardcodes `mealPerdayCount = 1` and never
  // multiplies package price/add-ons by it at all for this order type
  // (unlike the regular subscription branch, which does).
  const mealsPerDay = item.isDineIn ? 1 : item.lunch && item.dinner ? 2 : 1;
  const meals = days * mealsPerDay;

  const packageTotal = (pkg.packagePrice || 0) * count * mealsPerDay;
  const addOnTotal = item.addOns.reduce((sum, a) => {
    const price = a.extraPrice ?? a.addonPrice ?? 0;
    const unitDays = a.daily === false && a.dayCount ? a.dayCount : days;
    return sum + price * count * mealsPerDay * unitDays;
  }, 0);
  const itemDiscount = (pkg.discount || 0) * count * mealsPerDay;
  const couponItemDiscount = cart.coupon?.itemDiscount || 0;
  const couponDeliveryDiscount = cart.coupon?.deliveryDiscount || 0;
  const discount = itemDiscount + couponItemDiscount;

  // Delivery/packaging/platform charges scale by every day a delivery
  // actually goes out, which includes selected "Include Saturday"/"Include
  // Sunday" add-on days beyond the plan's own `days` (see
  // `extraAddonDays`'s own doc comment) — mirrors the Ionic reference's
  // `getSubscriptionPayAmt`, which scales `finalSubscriptionDelCharges`/
  // `totalEcoFriendlyPackagingCharges`/`finalSubscriptionPlatformCharges` by
  // `subscriptionDays` (== `days` + those add-on days), not `days` alone.
  // Item/add-on pricing itself is unaffected — `addonLineTotal` already
  // prices each weekend add-on by its own `dayCount` independently.
  const deliveryDays = days + extraAddonDays(item.addOns, item.deliveryOnWeekends);
  // Dine-in is eaten at the kitchen → no delivery/packaging/platform charges.
  const scale = item.isDineIn ? 0 : mealsPerDay * deliveryDays * count;
  const deliveryOriginal = round2(charges.deliveryPerMeal * scale);
  const deliveryDisc = round2(charges.deliveryPerMealDiscount * scale);
  const packagingOriginal = round2(charges.packagingPerMeal * scale);
  const packagingDisc = round2(charges.packagingPerMealDiscount * scale);
  const platformOriginal = round2(charges.platformPerMeal * scale);
  const platformDisc = round2(charges.platformPerMealDiscount * scale);

  const delivery = round2(deliveryOriginal - deliveryDisc);
  const packaging = round2(packagingOriginal - packagingDisc);
  const platform = round2(platformOriginal - platformDisc);

  // A coupon's delivery-side discount is deliberately NOT subtracted from
  // `delivery` before this GST calc — it's a straight deduction against the
  // payable total below instead, matching the Ionic reference exactly (see
  // discountFor's own comment and this file's design spec).
  const itemGst = round2(((packageTotal + addOnTotal - discount) * charges.itemGstPercent) / 100);
  const deliveryGst = round2((delivery * charges.deliveryGstPercent) / 100);
  const packagingGst = round2((packaging * charges.packagingGstPercent) / 100);
  const platformGst = round2((platform * charges.platformGstPercent) / 100);
  const taxes = round2(itemGst + deliveryGst + packagingGst + platformGst);

  // A straight top-up, not part of item/GST calculation and never
  // discounted by a coupon/voucher — mirrors the Ionic reference exactly
  // (`getSubscriptionPayAmt` adds `treePlantationCharge` on top of
  // `payAmtBeforeMoneyWalletPoints` after every other discount is already
  // applied). Always the full configured price when opted in — never free.
  const treePlantationCharge = cart.treePlantation?.enabled ? charges.treePlantationAmount : 0;

  const subTotal = round2(packageTotal + addOnTotal);
  const grossToPay = round2(
    subTotal -
      discount +
      delivery +
      packaging +
      platform +
      taxes -
      couponDeliveryDiscount +
      treePlantationCharge,
  );
  const cashback = round2(Math.max(0, Math.min(cashbackUsed, grossToPay)));
  const afterCashback = round2(grossToPay - cashback);
  const moneyWallet = round2(Math.max(0, Math.min(moneyWalletUsed, afterCashback)));
  const toPay = round2(afterCashback - moneyWallet);
  const saving = round2(
    discount +
      couponDeliveryDiscount +
      deliveryDisc +
      packagingDisc +
      platformDisc +
      cashback +
      moneyWallet,
  );

  return {
    meals,
    packageTotal,
    addOnTotal,
    subTotal,
    discount,
    delivery,
    deliveryOriginal,
    packaging,
    packagingOriginal,
    platform,
    platformOriginal,
    taxes,
    itemGst,
    deliveryGst,
    packagingGst,
    platformGst,
    cashbackUsed: cashback,
    moneyWalletUsed: moneyWallet,
    treePlantationCharge,
    toPay,
    saving,
  };
}

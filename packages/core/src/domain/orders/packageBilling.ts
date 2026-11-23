export interface PackageBilling {
  itemAmount: number;
  discount: number;
  couponCode?: string;
  couponDiscount: number;
  delivery: number;
  deliveryOriginal: number;
  packaging: number;
  packagingOriginal: number;
  platform: number;
  platformOriginal: number;
  taxes: number;
  walletUsed: number;
  cashbackUsed: number;
  total: number;
}

/**
 * Extract the real, already-charged billing breakdown straight off a placed
 * `subscriptionPackage` order's own top-level fields (see
 * `MealaweServerApp/src/model/foodOrderPackage.model.js`) — NOT recomputed
 * from cluster-config rates the way `features/cart/bill.ts`'s `buildBill`
 * does for an in-progress cart, since this order is already final and the
 * server already stored what it actually charged. `*Original` fields
 * reconstruct the pre-discount amount (charged + that line's own discount
 * field) for the same struck-through-price display `BillRow` uses at
 * checkout, so a delivered order's bill reads identically to how it looked
 * in the cart when it was placed.
 *
 * `itemAmount` is a confirmed backend gap, not a display bug: the package
 * checkout DAO (`foodOrderPackage.dao.js`'s `saveOrderPackage`) never
 * assigns `nOrderPackage.itemAmount` at all, so every real package order has
 * it stored as 0/undefined (unlike a plain `FoodOrder` — Meal/On Demand/OYO/
 * Apartment/Bulk orders all go through `foodorder.dao.js`/`bulkFoodOrder.dao.js`,
 * which DO forward `itemAmount` correctly). Every other field this function
 * reads (`amount`, `discount`, delivery/packaging/platform charges, taxes,
 * wallet/cashback) IS reliably populated at checkout, so when the raw field
 * is missing this reconstructs it as the residual that makes the total add
 * up: `total = itemAmount - discount - couponDiscount + delivery + packaging
 * + platform + taxes - walletUsed - cashbackUsed`, solved for `itemAmount`.
 */
export function extractPackageBilling(raw: Record<string, unknown> | undefined | null): PackageBilling | null {
  if (!raw) return null;
  const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
  const delivery = num(raw.subscriptionDeliveryCharges);
  const deliveryDiscount = num(raw.subscriptionDeliveryChargesDiscount);
  const packaging = num(raw.ecoFriendlyPackagingCharges);
  const packagingDiscount = num(raw.ecoFriendlyPackagingChargesDiscount);
  const platform = num(raw.platformCharges);
  const platformDiscount = num(raw.platformChargesDiscount);
  const discount = num(raw.discount);
  const couponDiscount = num(raw.couponDiscount);
  const taxes = num(raw.taxes);
  const walletUsed = num(raw.moneyWalletPointsUsed);
  const cashbackUsed = num(raw.mealaweWalletPointsUsed);
  const total = num(raw.amount) || num(raw.mealaweTotalAmt);

  const rawItemAmount = num(raw.itemAmount);
  const itemAmount =
    rawItemAmount > 0
      ? rawItemAmount
      : Math.max(0, total - delivery - packaging - platform - taxes + discount + couponDiscount + walletUsed + cashbackUsed);

  return {
    itemAmount,
    discount,
    couponCode: typeof raw.couponCode === 'string' && raw.couponCode ? raw.couponCode : undefined,
    couponDiscount,
    delivery,
    deliveryOriginal: delivery + deliveryDiscount,
    packaging,
    packagingOriginal: packaging + packagingDiscount,
    platform,
    platformOriginal: platform + platformDiscount,
    taxes,
    walletUsed,
    cashbackUsed,
    total,
  };
}

import type { AddOn, MealPackage } from '../subscription/types';

/** Output of the subscription Configure step — everything needed for a cart line. */
export interface SubscriptionConfig {
  package: MealPackage;
  category: string;
  deliveryOnWeekends: boolean;
  addOns: AddOn[];
  /** Delivery dates (YYYY-MM-DD); the start date is `selectedDates[0]`. */
  selectedDates: string[];
  lunch: boolean;
  dinner: boolean;
  /** Breakfast-category packages (`MealPackage.isBreakFast`) use this instead
   * of lunch/dinner — there's no lunch/dinner choice for a breakfast plan. */
  breakfast?: boolean;
  /** Dine-in = eat at the kitchen: no delivery/packaging/platform charges, no address. */
  isDineIn?: boolean;
}

/** The single subscription line in the cart. */
export interface SubscriptionCartItem extends SubscriptionConfig {
  count: number;
}

/** A coupon applied to the cart. `discount` is the total (itemDiscount +
 * deliveryDiscount) for display; `itemDiscount`/`deliveryDiscount` are the
 * split each bill builder needs to apply them to the right line (item
 * discounts reduce the item-GST base, delivery discounts are a straight
 * deduction against the delivery charge — see bill.ts's discountFor). */
export interface AppliedCoupon {
  couponCode: string;
  discount: number;
  itemDiscount: number;
  deliveryDiscount: number;
  couponHeader?: string;
}

/** Tree Plantation add-on — UI/cart-state only for now (see the implementation
 * plan's Background for why this isn't sent in the checkout payload yet). */
export interface TreePlantation {
  enabled: boolean;
  receiverName: string;
}

/** The cart (subscription-only for now). */
export interface Cart {
  orderType: 'subscription';
  item: SubscriptionCartItem | null;
  coupon: AppliedCoupon | null;
  treePlantation: TreePlantation | null;
}

/** A computed bill line (original + discounted, so the UI can strike-through). */
export interface BillLine {
  label: string;
  amount: number;
  original?: number;
  free?: boolean;
}

/**
 * Per-meal charge config from the cluster config variable (searchClusterVariable),
 * with sensible fallbacks. Everything is per-meal and scaled by days × meals/day.
 */
export interface BillCharges {
  deliveryPerMeal: number;
  deliveryPerMealDiscount: number;
  packagingPerMeal: number;
  packagingPerMealDiscount: number;
  platformPerMeal: number;
  platformPerMealDiscount: number;
  deliveryGstPercent: number;
  packagingGstPercent: number;
  platformGstPercent: number;
  /** GST % on the (discounted) item amount (cgst+sgst). */
  itemGstPercent: number;
  /** Tree Plantation add-on's full price (₹) — from the `TREE_PLANTATION_PRICE`
   * cluster config variable, falling back to the Ionic reference's own
   * hardcoded default (₹299) when unset. Always the full amount when
   * opted in — never discounted or free. */
  treePlantationAmount: number;
}

/** The full computed bill for the cart. */
export interface Bill {
  meals: number;
  /** Base plan price (package price × count × meals/day) — pre-discount. */
  packageTotal: number;
  /** Sum of all selected add-ons over the whole plan. */
  addOnTotal: number;
  subTotal: number;
  discount: number;
  delivery: number;
  deliveryOriginal: number;
  packaging: number;
  packagingOriginal: number;
  platform: number;
  platformOriginal: number;
  taxes: number;
  /** GST on the discounted item (plan + add-ons) amount — one of the four
   * components summed into `taxes`, broken out for the GST breakdown sheet. */
  itemGst: number;
  /** GST on the net `delivery` charge. */
  deliveryGst: number;
  /** GST on the net `packaging` charge. */
  packagingGst: number;
  /** GST on the net `platform` charge. */
  platformGst: number;
  cashbackUsed: number;
  moneyWalletUsed: number;
  /** What Tree Plantation actually adds to `toPay` — 0 when not opted in, or
   * when opted in but free (this customer's free-plantation eligibility
   * covered the full `BillCharges.treePlantationAmount`). */
  treePlantationCharge: number;
  toPay: number;
  saving: number;
}

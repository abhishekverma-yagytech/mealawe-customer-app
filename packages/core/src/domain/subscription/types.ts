/**
 * Subscription domain models — mirror the live backend (MealPackage /
 * subscriptionWeeklyMenu) via the Ionic apps. Ported from mealaweApp's
 * package.model.ts.
 */
import type { ServerSubCategory } from './subscriptionCategories';

/** An optional add-on attachable to a meal package (extra chapati, non-veg day…). */
export interface AddOn {
  _id?: string;
  addonName?: string;
  /** Display price per meal. Backend cart uses `extraPrice`; accept either. */
  addonPrice?: number;
  extraPrice?: number;
  /** 'Veg' | 'NonVeg' | 'Sweet' | 'NA' — drives veg-only filtering + icon. */
  addOnType?: string;
  addonIconType?: string;
  /** true = charged every delivery day; false = charged for `dayCount` days only. */
  daily?: boolean;
  dayCount?: number;
  day?: string;
  dayText?: string;
  selected?: boolean;
  isDisabled?: boolean;
  [key: string]: unknown;
}

/** A subscription meal package (one plan, e.g. a 5/10/20/60-day plan for a category). */
export interface MealPackage {
  _id?: string;
  packageName?: string;
  packageCategory?: string;
  /** Comma-separated extra categories this package also appears under. */
  searchCategory?: string;
  packageSubCategory?: string;
  packageType?: string; // 'Veg' | 'NonVeg'
  days: number;
  packagePrice: number;
  /** Flat discount amount (rupees, per meal) — NOT a percentage. */
  discount: number;
  vegMealDescription?: string;
  nonVegMealDescription?: string;
  imageUrl?: string;
  packageInfo?: string;
  offerText?: string;
  offerColor?: string;
  /** The "POPULAR" flag. */
  isBestSeller?: boolean;
  isBreakFast?: boolean;
  multiDateAllowed?: boolean;
  deliveryOnWeekends?: boolean;
  priority?: number;
  clusters?: string[];
  addonsList?: AddOn[];
  count?: number;
  /** Populated `SubscriptionCategory` doc (server) — a plain id string until
   * migrated. See SUBSCRIPTION_CATALOG_DYNAMIC_PLAN.md. */
  category?: ServerSubCategory | string;
  kcal?: number;
  /** The ONE server-authoritative flag for which plan is preselected — see
   * `pickDefaultPackage` in `pricing.ts`. */
  isDefaultSelection?: boolean;
  /** Dine In only — admin-set venue location text (`DineInPackage.dineInLocation`,
   * dashboard's dine-in package form), e.g. "2nd Floor, XYZ Building". Shown
   * in cart and carried through to the order (`FoodOrderPackage.dineInLocation`)
   * via `packageForOrder`'s passthrough — see `dine-in/api.ts`'s normalizer. */
  dineInLocation?: string;
  [key: string]: unknown;
}

/** One structured "what's included" row on a `MealPackage`. */
export interface IncludedItem {
  icon?: string;
  label: string;
  order?: number;
}

/** One day's menu within a week (lunch / dinner / breakfast descriptions). */
export interface DayMenu {
  day: string;
  lunch?: { description?: string };
  dinner?: { description?: string };
  breakfast?: { description?: string };
}

/** A week of menus, split by veg / non-veg. */
export interface WeekMenu {
  weekNumber: number;
  isSelected?: boolean;
  selectedMenuType?: 'veg' | 'nonveg';
  vegMenuList?: DayMenu[];
  nonvegMenuList?: DayMenu[];
}

/** A coupon valid for the user's cluster(s). */
export interface SubscriptionCoupon {
  couponCode?: string;
  couponHeader?: string;
  description?: string;
  orderTypes?: string[];
  seqWeightage?: number;
  discountType?: 'percentage' | 'flat';
  discountValue?: number;
  maxLimit?: number;
  minAmount?: number;
  /** "Free item/order" coupons (e.g. `FREEFOOD`) — the discount is the whole
   * eligible amount (capped by `maxLimit` if set), ignoring `discountType`/
   * `discountValue` entirely. Confirmed live: real active coupons in this
   * deployment use this flag. */
  applyFullDiscount?: boolean;
  /** `generic` = usable by anyone; `userSpecific` = only usable by users
   * whose profile lists this code (`customerProfile.couponList`). Already
   * enforced server-side in the coupon-list endpoints — the client doesn't
   * re-filter by it, just carries the field through. */
  couponScope?: 'generic' | 'userSpecific';
  /** Usage-limit policy, enforced server-side by `validateCouponForUser`
   * (see `couponApi.ts`) — `oneTimeOneUser` (once ever), `oneTimeOneDay`
   * (once per day), or `everytime` (no limit). */
  couponUsage?: 'oneTimeOneUser' | 'oneTimeOneDay' | 'everytime';
  /** Whether the `minAmount` gate and the discount base amount is the whole
   * bill (item + delivery + taxes) or just the item/plan amount. Defaults to
   * item-amount behavior (today's behavior) when unset. */
  offerAppliedOn?: 'billAmount' | 'itemAmount';
  /** When true, the computed discount is taken out of the delivery charge
   * first (up to the delivery charge amount), before any remainder goes to
   * items. */
  discountOnDelivery?: boolean;
  /** Documentation only — items are always the fallback destination for any
   * amount not claimed by `discountOnDelivery`'s cap, regardless of this
   * flag's value, so `AppliedCoupon.discount` (itemDiscount + deliveryDiscount)
   * is never silently reduced. A coupon with neither flag set, or with only
   * `discountOnDelivery` set and a discount larger than the delivery charge,
   * both land the remainder on items — this field exists to describe intent
   * (and match the source coupon-admin field), not to gate behavior. */
  discountOnItems?: boolean;
  [key: string]: unknown;
}

/**
 * A promotional voucher — a separate, simpler redemption system from
 * `SubscriptionCoupon`, ported from mealaweApp's `OfferVoucher`: flat/
 * percentage off a `minAmount`-gated base, capped by `maxLimit`, and no
 * `couponScope`/`offerAppliedOn`/delivery-split rules (the discount is
 * always item-side only). No browsable list either — unlike coupons, a
 * voucher is only ever resolved by typing its code into `CouponSheet`'s
 * voucher field, which calls `validateVoucherCode` and gets this object
 * back directly from the server on success (see `couponApi.ts`).
 */
export interface Voucher {
  _id: string;
  voucherCode: string;
  description?: string;
  discountType?: 'percentage' | 'flat';
  discountValue?: number;
  maxLimit?: number;
  minAmount?: number;
  [key: string]: unknown;
}


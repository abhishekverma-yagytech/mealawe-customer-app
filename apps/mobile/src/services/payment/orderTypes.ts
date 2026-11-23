import type { AddOn, MealPackage } from '@/features/subscription';
import type { Address } from '@/features/location';
import type { BulkOrderType } from '@/features/bulk';

export type { BulkOrderType };

/** Matches the server's `orderCreatedBy` enum for genuine customer-app
 * traffic (`foodOrder.model.js` and friends) — injected by `payWithJusPay`,
 * not set by callers. */
export type OrderCreatedBy = 'mealawe_app_android' | 'mealawe_app_ios';

/** Every JusPay order-creation call needs these — sourced from `CustomerProfile`. */
export interface JusPayCustomer {
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhoneNo: string;
}

/** The delivery-address shape the backend's FoodOrder/FoodOrderPackage DAOs
 * whitelist — a subset of `Address`. Sent for Dine In too (matching the
 * Ionic reference's dine-in-cart.page.ts): there's no delivery to route, but
 * the backend/dashboard still record where the customer was when they
 * placed the order. */
export interface CustomerLocation {
  tagLocation?: string;
  geolocation: { lat: number; lng: number };
  address?: string;
  location: string;
  landmark?: string;
  pincode?: string;
  city?: string;
  state?: string;
}

export function customerLocationFrom(addr: Address): CustomerLocation {
  return {
    tagLocation: addr.tagLocation,
    geolocation: addr.geolocation,
    address: addr.address,
    location: addr.location,
    landmark: addr.landmark,
    pincode: addr.pincode,
    city: addr.city,
    state: addr.state,
  };
}

/**
 * The `mealPackage` sub-object `startJusPayPaymentProcess` expects for a
 * `subscriptionPackage` order. Extends `MealPackage` rather than picking a
 * field subset: MealaweUserApp's reference checkout (`tabCart.page.ts`)
 * sends the ENTIRE raw cart-package object as `mealPackage`, and the
 * backend's `foodOrderPackage.service.js` reads fields from it a curated
 * subset was dropping — notably `payToKitchenPerMeal`/`payToKitchenPerMeal2`,
 * which feed `itemAmount = (payToKitchenPerMeal + addonAmount) * count`.
 * Missing either produced a `NaN` Mongoose cast error server-side. The only
 * field actually replaced is `addonsList`: the order needs just the addons
 * selected in the cart, not the package's full catalog `addonsList`.
 */
export interface PackageForOrder extends MealPackage {
  addonsList: AddOn[];
}

export function packageForOrder(pkg: MealPackage, selectedAddOns: AddOn[]): PackageForOrder {
  return {
    ...pkg,
    addonsList: selectedAddOns,
  };
}

/** Subscription (and Dine In, via `isDineIn: true`) — routed to
 * `startJusPayPaymentProcess`, persisted as a `FoodOrderPackage`. */
export interface SubscriptionOrderBody extends JusPayCustomer {
  orderType: 'subscriptionPackage';
  amount: number;
  /** Injected by `payWithJusPay` — omit when building the body. */
  orderCreatedBy?: OrderCreatedBy;
  /** ISO timestamp of "now" at submit time — the backend's
   * `foodOrderTimeValidation` rejects any request whose `orderDate` is more
   * than 2 minutes old or falls on a different calendar day (IST) than the
   * server's clock. Set this immediately before calling `payWithJusPay`, not
   * earlier. */
  orderDate: string;
  isDineIn?: boolean;
  customerLocation?: CustomerLocation;
  mealPackage: PackageForOrder;
  /** Equal to `amount` — mirrors the Ionic reference's `subscriptionPackage`
   * checkout (`tabCart.page.ts` and dine-in-cart.page.ts both send
   * `mealaweTotalAmt: this.payAmt`, identical to `amount`). Read by
   * `foodOrderPackage.dao.js#saveOrderPackage` and feeds the dashboard's
   * revenue calc ("amount paid by user" = `mealaweTotalAmt +
   * moneyWalletPointsUsed`) — omitting it left every RN-placed
   * subscription/Dine-In order with a blank payment-amount record. */
  mealaweTotalAmt: number;
  subscriptionStartDate?: string;
  subscriptionDays: number;
  userSelectedDates: string[];
  /** `pkg.multiDateAllowed` — the backend's `saveOrderPackage` only persists
   * `userSelectedDates` at all when this is truthy (`foodOrderPackage.dao.js`:
   * `if (orderPackage.multiDateAllowed) { ...userSelectedDates... } else {
   * nOrderPackage.userSelectedDates = []; }`). Omitting it meant every
   * RN-placed subscription/Dine-In order saved an empty delivery-date list
   * no matter what was actually picked in Configure. */
  multiDateAllowed?: boolean;
  mealTimeLunch: boolean;
  mealTimeDinner: boolean;
  /** Breakfast-category packages (`MealPackage.isBreakFast`) use this instead
   * of lunch/dinner — mirrors MealaweUserApp's `breakfastSubscription`. */
  mealTimeBreakfast?: boolean;
  discount: number;
  taxes: number;
  couponCode?: string;
  couponDiscount?: number;
  moneyWalletPointsUsed: number;
  mealaweWalletPointsUsed: number;
  /** Tree Plantation add-on — all five sent together only when opted in
   * (mirrors the Ionic reference's `if (treePlantationOpted) {...}` gate in
   * `tabCart.page.ts`, which omits the fields entirely otherwise, rather
   * than sending `treePlantationOpted: false`). `treePlantationDone` is
   * always `false` at order-creation time — flipped server-side once the
   * physical planting actually happens. `treeReceiverName` falls back to
   * the customer's own name when left blank, same as the reference. */
  treePlantationOpted?: boolean;
  treePlantationDone?: boolean;
  treePlantationAmount?: number;
  treePlantationDiscount?: number;
  treeReceiverName?: string;
}

/** On-Demand ("Daily"/`allDay` or "Advance") — routed to
 * `startJusPayPaymentProcess`, persisted as a plain `FoodOrder`. `orderType`
 * is passed straight through from `OnDemandCart.mode`, which already uses
 * the exact backend string values. */
export interface OnDemandItemForOrder {
  itemId: string;
  itemName: string;
  itemPrice: number;
  /** Sent equal to `itemPrice` — this app tracks no separate internal
   * "official"/markup price for on-demand items, unlike the Ionic
   * reference's `mealawePrice > itemPrice` override. Still required: the
   * backend's `order-validation-util.js#foodordervalidation` ('allDay'
   * branch) sums `ele.mealawePrice * ele.count` unconditionally with no
   * fallback — an item with no `mealawePrice` makes that sum `NaN`, which
   * never equals `mealaweTotalAmt` below and silently rejects the order. */
  mealawePrice: number;
  count: number;
}

export interface OnDemandOrderBody extends JusPayCustomer {
  orderType: 'allDay' | 'advance';
  amount: number;
  /** Injected by `payWithJusPay` — omit when building the body. */
  orderCreatedBy?: OrderCreatedBy;
  /** See `SubscriptionOrderBody.orderDate` — same backend validation applies
   * (On-Demand also routes through `startJusPayPaymentProcess`). */
  orderDate: string;
  customerLocation: CustomerLocation;
  kitchenId?: string;
  kitchenName?: string;
  itemList: OnDemandItemForOrder[];
  /** Always `[]` — the on-demand cart has no per-item add-on concept (unlike
   * Subscription). Still required: `foodordervalidation`'s 'allDay' branch
   * unconditionally calls `foodOrder.addOns.forEach(...)` with no
   * `Array.isArray` guard — an order with `addOns` omitted throws a
   * `TypeError` there, caught by the caller and surfaced only as a generic
   * "error while fetching checkout page" rejection. This was the actual
   * cause of on-demand orders (Kota's cluster-menu included, since it's
   * always `orderType: 'allDay'`) failing to place at all. */
  addOns: unknown[];
  /** Sum of `itemPrice * count` across `itemList` (== `bill.subTotal`) — the
   * backend reconciles this against its own recomputation from `itemList`
   * and rejects the order if it doesn't match, mirroring
   * `BulkOrderBody.bulkItemAmount`'s existing fix for the same class of bug
   * in bulk orders. */
  itemAmount: number;
  /** Sum of `mealawePrice * count` across `itemList` — same value as
   * `itemAmount` here since `mealawePrice` is always sent equal to
   * `itemPrice` (see `OnDemandItemForOrder.mealawePrice`), but the backend
   * validates it as its own separate field and rejects (via `NaN !== x`)
   * when it's missing. */
  mealaweTotalAmt: number;
  slotStartTime?: string;
  slotEndTime?: string;
  orderComplitionDate?: string;
  discount: number;
  /** A kitchen's own promotional discount — a separate field from `discount`
   * (coupon) on the backend's `FoodOrder` DAO whitelist. */
  kitchenDiscount?: number;
  taxes: number;
  couponCode?: string;
  couponDiscount?: number;
  moneyWalletPointsUsed: number;
  mealaweWalletPointsUsed: number;
}

/** Bulk (meals/snacks/food-box, individual or bulk packaging) — routed to
 * `startBulkJusPayPaymentProcess`, persisted as a `bulkFoodOrder`. */
export interface BulkItemForOrder {
  itemId: string;
  itemName: string;
  itemPrice: number;
  count: number;
}

export interface BulkOrderBody extends JusPayCustomer {
  orderType: BulkOrderType;
  amount: number;
  /** Injected by `payWithJusPay` — omit when building the body. */
  orderCreatedBy?: OrderCreatedBy;
  customerLocation: CustomerLocation;
  itemList: BulkItemForOrder[];
  /** Sum of `itemPrice * count` across `itemList` — the backend's
   * `bulkFoodordervalidation` reconciles this against its own recomputation
   * and rejects the order if it doesn't match (root cause of bulk checkout
   * silently failing before this field was added — see design/plan notes). */
  bulkItemAmount: number;
  /** Flat per-order packaging charge (or per-box override for Food Box
   * Customized mode) — the backend reads this as `packagingCostByUser`. */
  packagingCostByUser: number;
  /** Delivery charge for this order's quantity slab. */
  finalBulkDelCharges: number;
  /** Platform charge for this order. */
  finalBulkPlatformCharges: number;
  deliveryDate?: string;
  slotStartTime?: string;
  slotEndTime?: string;
  discount: number;
  taxes: number;
  couponCode?: string;
  couponDiscount?: number;
  moneyWalletPointsUsed: number;
  mealaweWalletPointsUsed: number;
  /** Always `0` from this app (bulk cart has no per-kitchen voucher/extra
   * discount concept) — required anyway because `bulkFoodordervalidation`
   * (order-validation-util.js:626-631) *reassigns* its `totalSaving` local
   * from `foodOrder.discount + foodOrder.moneyWalletPointsUsed +
   * foodOrder.voucherDiscount` (or, when `mealaweWalletPointsUsed` is
   * truthy, adds `mealaweKitchenDiscount`/`extraDiscount` too) with no
   * guard on any of the three. `undefined` in that sum makes `totalSaving`
   * (and therefore the `tamt` it feeds into) `NaN`, and `tamt != amt` is
   * always `true` for `NaN` — so omitting these still rejects every bulk
   * order even after `bulkItemAmount` et al. above are correct. */
  voucherDiscount: number;
  /** See `voucherDiscount` — only read when `mealaweWalletPointsUsed > 0`
   * (cashback redeemed), but sent unconditionally so toggling "Redeem
   * Cashback" doesn't reintroduce the same NaN. */
  mealaweKitchenDiscount: number;
  /** See `voucherDiscount`. */
  extraDiscount: number;
}

/**
 * CORRECTION — an earlier pass here concluded Apartment does NOT go through
 * this file at all, based on an audit of `apartmentOrder.service.js` that
 * found `POST /api/apartmentOrder` creates an order directly with no payment
 * step. That audit was correct about that ONE route (it's still there,
 * untouched — see `features/apartment/api.ts`'s `createApartmentOrder`/
 * `CreateApartmentOrderInput`, still used by nothing in the JusPay-gated
 * checkout screen any more), but missed a SEPARATE, newer pipeline that had
 * already been built and fully tested server-side by the time of a later
 * re-audit: the apartment-split-order-checkout-v2 migration wired Apartment
 * Today/Instant/Bulk onto the exact SAME `POST /transaction/startJusPayPaymentProcess`
 * route every body below already uses, branching purely on `orderType` — see
 * `paymentGatewayJusPay.service.js`'s `startApartmentParentJusPayPaymentProcess`
 * (Today/Instant/Advance, via a shared `ApartmentParentOrder` that splits into
 * one real `ApartmentOrder` per (orderType, mealType) group once payment
 * clears) and `startApartmentJusPayPaymentProcess` (Bulk, a plain single
 * `ApartmentOrder`, same function Instant/Bulk already used before Today
 * joined).
 *
 * Root-cause fix (product instruction — "add payment process to Advance,
 * keep flow same as Today/Instant, wallet usable too"): Advance used to be
 * the one apartment type genuinely excluded from this — it stayed on the old
 * no-payment `POST /api/apartmentOrder` path, meaning there was no way to
 * collect any amount left over once wallet was applied. It now joins
 * Today/Instant on this same combined path — `MealaweServerApp`'s
 * `groupCartItems`/`prepareApartmentParentOrder` run Advance's own
 * meal-slot/cutoff checks and book against its own date-scoped capacity
 * ledger, same as the old single-order path always did, just reached through
 * this shared checkout mechanism now.
 */
export interface ApartmentItemForOrder {
  /** The `ApartmentMenu.itemList` subdoc id (daily items) or the
   * `ApartmentStandardMenu` catalog id (standing items) — same field
   * `CreateApartmentOrderInput.itemList[]._id` documents. */
  _id: string;
  itemId: string;
  itemName: string;
  itemPrice: number;
  count: number;
  itemType?: string;
  /** Required on every Today item, omitted on Instant/Bulk — this is what
   * `apartmentOrderGrouping.util.js#groupCartItems` keys a Today checkout's
   * per-meal-slot child groups on. Advance items also carry this now (as of
   * the "add payment process to Advance" change) — but it's a WHOLE-ORDER
   * value there (the resident's one delivery-slot pick, stamped onto every
   * Advance item with the same value client-side — see `apartment-cart.tsx`'s
   * `buildBucketItemList`), not a per-dish choice the way it is for Today. */
  mealType?: string;
  kitchenId?: string;
  isStandardMenu?: boolean;
  /** The field `groupCartItems` branches on: `'instant'` groups as
   * `apartment_instant`; `'advance'` groups as `apartment_advance`; anything
   * else (including omitted) groups as `apartment_today`. Bulk items must
   * never reach this body at all — see `ApartmentBulkOrderBody` below, a
   * separate non-parent path. */
  standingType?: 'instant' | 'advance' | 'bulk';
  itemServingDate?: string;
  /** Product instruction (2026-09-01 — "Resident App Implementation Guide"):
   * the server always overwrites these with its own live menu data at
   * order-creation time (confirmed in the guide's own per-field notes), so
   * sending them has no functional effect on the resulting order — included
   * anyway for payload completeness/parity with the documented contract.
   * Only the two genuinely available on a cart line today (`imageUrl`,
   * `preparationTime`) are populated; the guide's other "ignored" fields
   * (itemDescription/itemFlavour/itemServingType/spicyLevel/servesTo/
   * tasteOfRegion) aren't carried on `ApartmentCartLine`/`ApartmentDishOffer`
   * at all yet — see the client's own flagged question about whether that
   * plumbing is worth adding for fields the server never actually reads. */
  imageUrl?: string;
  preparationTime?: number;
}

/**
 * Today/Instant — routed to `startApartmentParentJusPayPaymentProcess`. Can
 * carry a SINGLE (orderType, mealType) group same as today's per-group
 * `createApartmentOrder` calls (the server explicitly supports N=1 — see its
 * own "Path unification" note), so callers keep the exact same one-call-
 * per-cart-group structure they already use, just swapping which function
 * places that one group. `amount` is accepted for shape-consistency with
 * every sibling body above but is NOT trusted for pricing — same as every
 * other apartment path, the server always recomputes `payableAmount` from
 * `itemList` server-side (see `prepareApartmentParentOrder`).
 */
export interface ApartmentParentOrderBody extends JusPayCustomer {
  // 'apartment_advance' added (product instruction — "add payment process to
  // Advance, keep flow same as Today/Instant"): the wire value itself is
  // always the literal 'apartment' marker regardless of which type(s) the
  // cart actually contains (see api.ts's startApartmentPayment/
  // quoteApartmentOrder — the server infers the real per-item types from
  // each ApartmentItemForOrder's own standingType/mealType instead), so this
  // is a type-safety widening for whichever call site ends up typed against
  // the full union, not a behavior change on its own.
  orderType: 'apartment' | 'apartment_today' | 'apartment_instant' | 'apartment_advance';
  amount: number;
  apartmentId: string;
  apartmentName?: string;
  wingName?: string;
  roomNumber?: string;
  /** Product instruction (2026-09-01 — "Resident App Implementation
   * Guide"): documented as required for a delivery order — every sibling
   * body above (`OnDemandOrderBody`/`BulkOrderBody`) already sends this,
   * Apartment was the one order type that never did. */
  customerLocation?: CustomerLocation;
  kitchenId?: string;
  kitchenName?: string;
  itemServingDate?: string;
  fulfillmentMode: 'delivery' | 'pickup';
  itemList: ApartmentItemForOrder[];
  packagingCharges?: number;
  platformCharges?: number;
  discount?: number;
  cgst?: number;
  sgst?: number;
  deliveryChargesGST?: number;
  packagingChargesGST?: number;
  platformChargesGST?: number;
  couponDiscount?: number;
  voucherDiscount?: number;
  extraDiscount?: number;
  moneyWalletPointsUsed?: number;
}

/** Bulk — routed to `startApartmentJusPayPaymentProcess`, a plain single
 * `ApartmentOrder` (NOT a parent/split checkout — Bulk was never migrated
 * onto the parent-order model, see `apartmentOrderGrouping.util.js`'s own
 * "Bulk is explicitly out of scope" comment). Same request shape
 * `CreateApartmentOrderInput` already documents for the no-payment path,
 * just posted to the payment-gateway route instead. */
export interface ApartmentBulkOrderBody extends JusPayCustomer {
  orderType: 'apartment_bulk';
  amount: number;
  apartmentId: string;
  apartmentName?: string;
  wingName?: string;
  roomNumber?: string;
  kitchenId?: string;
  kitchenName?: string;
  itemServingDate?: string;
  fulfillmentMode: 'delivery' | 'pickup';
  itemList: ApartmentItemForOrder[];
  packagingCharges?: number;
  platformCharges?: number;
  discount?: number;
  moneyWalletPointsUsed?: number;
}

export type OrderBody = SubscriptionOrderBody | OnDemandOrderBody | BulkOrderBody | ApartmentParentOrderBody | ApartmentBulkOrderBody;

/** Identical response envelope from all three `start*JusPayPaymentProcess`
 * endpoints (see the design spec's backend-contract research). */
export interface JusPayStartResponse {
  checkoutDetails: {
    _id: string;
    orderType?: string;
    amount?: number;
    order_id?: string;
  };
  /** JusPay's opaque `sdk_payload` — `{}` when `amount<=0` (wallet-covered,
   * no gateway involved). */
  jusPaySessionObj: Record<string, unknown>;
  jusPayPaymentLink: string;
}

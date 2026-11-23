import type { AddOn, BulkOrderType, MealPackage } from '@mealawe/core';

/**
 * Web-owned payment types. The body shapes mirror what the backend's start*JusPayPaymentProcess routes
 * accept (and what the mobile app sends — apps/mobile/src/services/payment/orderTypes.ts is the read-only
 * reference). Kept separate on purpose: the mobile app is not modified by the web payment work.
 */

/** Backend `orderCreatedBy` enum value for the Mealawe web client. */
export const ORDER_CREATED_BY = 'mealawe_web' as const;

export interface JusPayCustomer {
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhoneNo: string;
}

/** Delivery-address shape the backend DAOs whitelist (a subset of `Address`). */
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

/** `mealPackage` sent for a subscriptionPackage order: the whole package, with only the SELECTED add-ons. */
export interface PackageForOrder extends MealPackage {
  addonsList: AddOn[];
}

interface WithPlatform {
  /** Injected by `startPayment` — omit when building the body. */
  orderCreatedBy?: typeof ORDER_CREATED_BY;
  /** Injected by `startPayment`: where Juspay sends the browser back. */
  returnURL?: string;
  /** Injected by `startPayment`: replays the first result on a retried start (needs backend Redis). */
  idempotencyKey?: string;
}

/** Subscription and Dine In (`isDineIn: true`) — persisted as a FoodOrderPackage. */
export interface SubscriptionOrderBody extends JusPayCustomer, WithPlatform {
  orderType: 'subscriptionPackage';
  amount: number;
  /** ISO "now" at submit time — the backend rejects it if >2 min old or on a different IST day. */
  orderDate: string;
  isDineIn?: boolean;
  customerLocation?: CustomerLocation;
  mealPackage: PackageForOrder;
  /** Equal to `amount` (feeds the dashboard's revenue calc). */
  mealaweTotalAmt: number;
  subscriptionStartDate?: string;
  subscriptionDays: number;
  userSelectedDates: string[];
  /** The backend only persists `userSelectedDates` when this is truthy. */
  multiDateAllowed?: boolean;
  mealTimeLunch: boolean;
  mealTimeDinner: boolean;
  mealTimeBreakfast?: boolean;
  discount: number;
  taxes: number;
  couponCode?: string;
  couponDiscount?: number;
  moneyWalletPointsUsed: number;
  mealaweWalletPointsUsed: number;
  treePlantationOpted?: boolean;
  treePlantationDone?: boolean;
  treePlantationAmount?: number;
  treePlantationDiscount?: number;
  treeReceiverName?: string;
}

export interface OnDemandItemForOrder {
  itemId: string;
  itemName: string;
  itemPrice: number;
  /** Must equal `itemPrice` — the backend sums `mealawePrice * count` with no fallback (undefined ⇒ NaN ⇒ rejected). */
  mealawePrice: number;
  count: number;
}

export interface OnDemandOrderBody extends JusPayCustomer, WithPlatform {
  orderType: 'allDay' | 'advance';
  amount: number;
  orderDate: string;
  customerLocation: CustomerLocation;
  kitchenId?: string;
  kitchenName?: string;
  itemList: OnDemandItemForOrder[];
  /** Always `[]` — the backend calls `addOns.forEach` unguarded. */
  addOns: unknown[];
  itemAmount: number;
  mealaweTotalAmt: number;
  slotStartTime?: string;
  slotEndTime?: string;
  orderComplitionDate?: string;
  discount: number;
  kitchenDiscount?: number;
  taxes: number;
  couponCode?: string;
  couponDiscount?: number;
  moneyWalletPointsUsed: number;
  mealaweWalletPointsUsed: number;
}

export interface BulkItemForOrder {
  itemId: string;
  itemName: string;
  itemPrice: number;
  count: number;
}

export interface BulkOrderBody extends JusPayCustomer, WithPlatform {
  orderType: BulkOrderType;
  amount: number;
  customerLocation: CustomerLocation;
  itemList: BulkItemForOrder[];
  bulkItemAmount: number;
  packagingCostByUser: number;
  finalBulkDelCharges: number;
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
  /** The three fields below are always 0 from the web too — omitting them makes the backend total NaN and rejects the order. */
  voucherDiscount: number;
  mealaweKitchenDiscount: number;
  extraDiscount: number;
}

/** One cart line of an apartment order (mirrors mobile `ApartmentItemForOrder`; the server re-reads live menu data). */
export interface ApartmentItemForOrder {
  /** `ApartmentMenu.itemList` subdoc id (daily) or standard-catalog id (standing). */
  _id: string;
  itemId: string;
  itemName: string;
  itemPrice: number;
  count: number;
  itemType?: string;
  /** Today: the per-line slot the server groups on. Advance: the whole-order delivery slot. Omitted for Instant. */
  mealType?: string;
  kitchenId?: string;
  isStandardMenu?: boolean;
  /** `instant`/`advance` group as such; anything else (incl. omitted) groups as `apartment_today`. */
  standingType?: 'instant' | 'advance';
  itemServingDate?: string;
  imageUrl?: string;
  preparationTime?: number;
}

/**
 * Apartment Today/Instant/Advance checkout — ONE payment bucket. The wire `orderType` is always the literal
 * `'apartment'` (the backend dispatcher routes it to the parent-order flow; a bare `apartment_advance` would fall into the
 * legacy FoodOrder path). `amount` is display-only; the server uses `itemList` + the client-supplied charge/GST fields.
 */
export interface ApartmentParentOrderBody extends JusPayCustomer, WithPlatform {
  orderType: 'apartment';
  amount: number;
  apartmentId: string;
  apartmentName?: string;
  wingName?: string;
  roomNumber?: string;
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
  moneyWalletPointsUsed?: number;
}

export type OrderBody = SubscriptionOrderBody | OnDemandOrderBody | BulkOrderBody | ApartmentParentOrderBody;

/** Same envelope from every start* endpoint. */
export interface JusPayStartResponse {
  checkoutDetails: {
    _id: string;
    orderType?: string;
    amount?: number;
    /** Juspay order id — the only param that is reliable on the return URL. */
    order_id?: string;
  };
  /** Mobile-SDK payload; unused on web. */
  jusPaySessionObj?: Record<string, unknown>;
  /** Hosted Payment Page URL; empty when nothing is payable (amount 0). */
  jusPayPaymentLink?: string;
}

/** Which cart the payment belongs to (drives which store is reset and what the result screen shows). */
export type CartKind = 'subscription' | 'dinein' | 'ondemand' | 'bulk' | 'apartment';

/** What the user was paying for — shown on the result screen after the redirect round-trip. */
export interface PaymentRecap {
  title: string;
  amount: number;
  days?: number;
}

export interface OrderRef {
  orderType: string;
  /** Mongo `_id` of the order document. */
  foodOrderId: string;
  /** Juspay order id (may be absent for zero-amount orders). */
  order_id?: string;
}

export type PaymentState = 'success' | 'failed' | 'pending';

export type StartResult =
  | { kind: 'free'; ref: OrderRef }
  | { kind: 'redirect'; ref: OrderRef; link: string }
  | { kind: 'error'; message: string; reason?: 'auth-expired' };

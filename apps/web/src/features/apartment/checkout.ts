import { buildApartmentBucketBill, type ApartmentGroupBill, type ApartmentGstConfig } from '@mealawe/core';

import type { ApartmentItemForOrder, ApartmentParentOrderBody, CustomerLocation, JusPayCustomer } from '@/payment/types';

import { useApartmentCartStore } from './cartStore';
import { groupCartLines, todayIso } from './pricing';
import type { ApartmentCartLine, ApartmentCartMeta, MealType, OrderType, PickupBySlot } from './types';

/**
 * Pure checkout helpers for the apartment cart. Field-for-field they reproduce what the mobile cart sends
 * (apps/mobile/src/app/apartment-cart.tsx `buildBucketItemList` + `startApartmentPayment`, read-only reference).
 */

export type CartGroup = ReturnType<typeof groupCartLines>[number];

export interface PaymentBucket {
  /** Stable id for a bucket: `combined|delivery`, `combined|pickup`, or a lone group's own key. */
  key: string;
  isPickup: boolean;
  groups: CartGroup[];
}

/**
 * One payment per bucket. Today + Instant combine into one bucket per fulfilment mode (the server resolves exactly one
 * mode per order type per call); every other group (Advance) is its own bucket and never combines.
 */
export function paymentBucketsOf(groups: CartGroup[], pickup: PickupBySlot): PaymentBucket[] {
  const todayInstant = groups.filter((g) => g.orderType === 'today' || g.orderType === 'instant');
  const singles = groups.filter((g) => g.orderType !== 'today' && g.orderType !== 'instant');
  const byMode = new Map<boolean, CartGroup[]>();
  for (const g of todayInstant) {
    const isPickup = !!pickup[g.key];
    byMode.set(isPickup, [...(byMode.get(isPickup) ?? []), g]);
  }
  const combined = Array.from(byMode.entries()).map(([isPickup, list]) => ({ key: `combined|${isPickup ? 'pickup' : 'delivery'}`, isPickup, groups: list }));
  return [...combined, ...singles.map((g) => ({ key: g.key, isPickup: !!pickup[g.key], groups: [g] }))];
}

/**
 * Item list for one bucket. Advance's single whole-order delivery slot is stamped on every Advance line as `mealType`
 * (an Advance offer never carries its own); `standingType` follows the GROUP's order type, never the offer source — the server
 * buckets Instant by `standingType === 'instant'` alone.
 */
export function buildBucketItemList(groups: { orderType: OrderType; lines: ApartmentCartLine[] }[], advanceMealType?: MealType | null): ApartmentItemForOrder[] {
  return groups.flatMap((g) =>
    g.lines.map((l) => ({
      _id: l.offer.itemId,
      itemId: l.offer.itemId,
      itemName: l.dishName,
      itemPrice: l.offer.price,
      count: l.count,
      itemType: l.isVeg ? 'Veg' : 'NonVeg',
      mealType: g.orderType === 'advance' ? (advanceMealType ?? undefined) : l.offer.mealType,
      imageUrl: l.imageUrl,
      preparationTime: l.offer.preparationTime,
      kitchenId: l.offer.kitchenId,
      isStandardMenu: l.offer.source === 'standard' ? true : undefined,
      standingType: g.orderType === 'today' ? undefined : g.orderType,
      itemServingDate: l.offer.itemServingDate,
    })),
  );
}

/** Today's date for Instant/Today (the server rejects a missing date), the picked T+1/T+2 date for Advance. */
export function servingDateFor(bucket: PaymentBucket, now = new Date()): string | undefined {
  const first = bucket.groups[0];
  return first.orderType === 'advance' ? first.lines[0]?.offer.itemServingDate : todayIso(now);
}

export interface BucketInput {
  customer: JusPayCustomer;
  location?: CustomerLocation;
  meta: ApartmentCartMeta;
  wingName: string;
  roomNumber: string;
  bucket: PaymentBucket;
  advanceDeliverySlot: MealType | null;
  bill: ApartmentGroupBill;
  /** Wallet money applied to THIS bucket (0 = none). */
  walletUsed: number;
}

/** Charges + GST fields shared by the quote request and the start-payment body, so the two can never drift apart. */
export function chargeFields(bill: ApartmentGroupBill) {
  return {
    platformCharges: bill.platformCharges,
    packagingCharges: bill.packagingCharges,
    cgst: bill.cgst,
    sgst: bill.sgst,
    deliveryChargesGST: bill.deliveryChargesGST,
    platformChargesGST: bill.platformChargesGST,
    packagingChargesGST: bill.packagingChargesGST,
  };
}

export function billForBucket(
  bucket: PaymentBucket,
  kitchenDeliveryCharge: number | null,
  defaultDelivery: Record<string, number>,
  gst: ApartmentGstConfig,
): ApartmentGroupBill {
  return buildApartmentBucketBill(bucket.groups, bucket.isPickup, kitchenDeliveryCharge, defaultDelivery, gst);
}

/** Start-payment body for one bucket. The wire `orderType` is always the literal 'apartment'. */
export function buildApartmentBucketBody(i: BucketInput): ApartmentParentOrderBody {
  const itemList = buildBucketItemList(i.bucket.groups, i.advanceDeliverySlot);
  return {
    ...i.customer,
    orderType: 'apartment',
    // Display-only echo: the server recomputes the amount from itemList.
    amount: itemList.reduce((sum, l) => sum + l.itemPrice * l.count, 0),
    apartmentId: i.meta.apartmentId,
    apartmentName: i.meta.apartmentName,
    wingName: i.wingName,
    roomNumber: i.roomNumber,
    customerLocation: i.location,
    kitchenId: i.meta.kitchenId,
    kitchenName: i.meta.kitchenName,
    itemServingDate: servingDateFor(i.bucket),
    fulfillmentMode: i.bucket.isPickup ? 'pickup' : 'delivery',
    itemList,
    ...chargeFields(i.bill),
    moneyWalletPointsUsed: i.walletUsed > 0 ? i.walletUsed : undefined,
  };
}

/** Body for `POST /apartmentOrder/quote` (same fields, no wallet): the server's real price for the bucket. */
export function buildApartmentQuoteBody(i: Omit<BucketInput, 'walletUsed'>) {
  return {
    apartmentId: i.meta.apartmentId,
    apartmentName: i.meta.apartmentName,
    wingName: i.wingName,
    roomNumber: i.roomNumber,
    customerLocation: i.location,
    kitchenId: i.meta.kitchenId,
    kitchenName: i.meta.kitchenName,
    customerId: i.customer.customerId,
    itemServingDate: servingDateFor(i.bucket),
    fulfillmentMode: i.bucket.isPickup ? ('pickup' as const) : ('delivery' as const),
    itemList: buildBucketItemList(i.bucket.groups, i.advanceDeliverySlot),
    ...chargeFields(i.bill),
    orderType: 'apartment' as const,
  };
}

/** Removes the cart lines of the given group keys (a settled payment bucket) and leaves the rest for the next payment. */
export function removeApartmentGroups(groupKeys: string[]): void {
  const store = useApartmentCartStore.getState();
  const keys = new Set(groupKeys);
  for (const g of groupCartLines(store.lines)) {
    if (!keys.has(g.key)) continue;
    for (const l of g.lines) useApartmentCartStore.getState().setLineCount(l.key, 0);
  }
}

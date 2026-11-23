import { bulkOrderType, type Address } from '@mealawe/api';
import type {
  AddOn,
  AppliedCoupon,
  Bill,
  BulkBill,
  BulkCartLine,
  BulkCategory,
  BulkPackaging,
  MealPackage,
  OnDemandBill,
  OnDemandCartLine,
  OnDemandKitchen,
  OnDemandMode,
  SubscriptionCartItem,
  TreePlantation,
} from '@mealawe/core';

import type { BulkOrderBody, CustomerLocation, JusPayCustomer, OnDemandOrderBody, PackageForOrder, SubscriptionOrderBody } from './types';

/**
 * Order-body builders. They are pure (no stores, no clock except the injected `now`) so the exact payloads
 * can be unit-tested. Field-for-field they reproduce what the mobile carts send (read-only reference:
 * apps/mobile/src/app/{cart,bulk-cart,on-demand-cart}.tsx) — several fields look redundant but the
 * backend validators reject an order when they are missing (see types.ts comments).
 */

export interface PayerProfile {
  _id: string;
  userName?: string;
  email?: string;
  phoneNo: string;
}

export function customerFrom(profile: PayerProfile): JusPayCustomer {
  return {
    customerId: profile._id,
    customerName: profile.userName ?? '',
    customerEmail: profile.email ?? '',
    customerPhoneNo: profile.phoneNo,
  };
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

/** Whole package, but only the SELECTED add-ons in `addonsList`. */
export function packageForOrder(pkg: MealPackage, selectedAddOns: AddOn[]): PackageForOrder {
  return { ...pkg, addonsList: selectedAddOns };
}

export function buildSubscriptionBody(input: {
  profile: PayerProfile;
  item: SubscriptionCartItem;
  bill: Pick<Bill, 'toPay' | 'discount' | 'taxes' | 'moneyWalletUsed' | 'cashbackUsed'>;
  coupon: AppliedCoupon | null;
  treePlantation: TreePlantation | null;
  treePlantationAmount: number;
  address: Address | null;
  now: Date;
}): SubscriptionOrderBody {
  const { profile, item, bill, coupon, treePlantation, address, now } = input;
  const pkg = item.package;
  return {
    orderType: 'subscriptionPackage',
    amount: bill.toPay,
    orderDate: now.toISOString(),
    ...customerFrom(profile),
    isDineIn: item.isDineIn,
    // Sent for Dine In too: no delivery, but the backend records where the customer was.
    customerLocation: address ? customerLocationFrom(address) : undefined,
    mealPackage: packageForOrder(pkg, item.addOns),
    mealaweTotalAmt: bill.toPay,
    subscriptionStartDate: item.selectedDates[0],
    subscriptionDays: pkg.days,
    userSelectedDates: item.selectedDates,
    multiDateAllowed: pkg.multiDateAllowed,
    mealTimeLunch: item.lunch,
    mealTimeDinner: item.dinner,
    mealTimeBreakfast: item.breakfast,
    discount: bill.discount,
    taxes: bill.taxes,
    couponCode: coupon?.couponCode,
    couponDiscount: coupon?.discount,
    moneyWalletPointsUsed: bill.moneyWalletUsed,
    mealaweWalletPointsUsed: bill.cashbackUsed,
    ...(treePlantation?.enabled
      ? {
          treePlantationOpted: true,
          treePlantationDone: false,
          treePlantationAmount: input.treePlantationAmount,
          treePlantationDiscount: 0,
          treeReceiverName: treePlantation.receiverName || profile.userName || '',
        }
      : null),
  };
}

export function buildOnDemandBody(input: {
  profile: PayerProfile;
  mode: OnDemandMode;
  kitchen: OnDemandKitchen | null;
  lines: OnDemandCartLine[];
  bill: Pick<OnDemandBill, 'toPay' | 'subTotal' | 'discount' | 'kitchenDiscount' | 'taxes' | 'moneyWalletUsed' | 'cashbackUsed'>;
  coupon: AppliedCoupon | null;
  address: Address;
  slot: { start: string; end: string } | null;
  /** Advance orders only (YYYY-MM-DD). */
  date: string | null;
  now: Date;
}): OnDemandOrderBody {
  const { profile, mode, kitchen, lines, bill, coupon, address, slot, date, now } = input;
  return {
    orderType: mode,
    amount: bill.toPay,
    orderDate: now.toISOString(),
    ...customerFrom(profile),
    customerLocation: customerLocationFrom(address),
    kitchenId: kitchen?._id,
    kitchenName: kitchen?.kitchenName,
    itemList: lines.map((l) => ({
      itemId: l.item._id,
      itemName: l.item.itemName,
      itemPrice: l.item.itemPrice,
      mealawePrice: l.item.itemPrice,
      count: l.count,
    })),
    addOns: [],
    itemAmount: bill.subTotal,
    mealaweTotalAmt: bill.subTotal,
    slotStartTime: slot?.start,
    slotEndTime: slot?.end,
    orderComplitionDate: mode === 'advance' ? (date ?? undefined) : undefined,
    discount: bill.discount,
    kitchenDiscount: bill.kitchenDiscount,
    taxes: bill.taxes,
    couponCode: coupon?.couponCode,
    couponDiscount: coupon?.discount,
    moneyWalletPointsUsed: bill.moneyWalletUsed,
    mealaweWalletPointsUsed: bill.cashbackUsed,
  };
}

export function buildBulkBody(input: {
  profile: PayerProfile;
  category: BulkCategory;
  packaging: BulkPackaging;
  lines: BulkCartLine[];
  bill: Pick<BulkBill, 'toPay' | 'subTotal' | 'packaging' | 'delivery' | 'platform' | 'discount' | 'taxes' | 'moneyWalletUsed' | 'cashbackUsed'>;
  coupon: AppliedCoupon | null;
  address: Address;
  slot: { start: string; end: string } | null;
  date: string | null;
}): BulkOrderBody {
  const { profile, category, packaging, lines, bill, coupon, address, slot, date } = input;
  return {
    orderType: bulkOrderType(category, packaging),
    amount: bill.toPay,
    ...customerFrom(profile),
    customerLocation: customerLocationFrom(address),
    itemList: lines.map((l) => ({ itemId: l.item._id, itemName: l.item.itemName, itemPrice: l.itemPrice, count: l.count })),
    bulkItemAmount: bill.subTotal,
    packagingCostByUser: bill.packaging,
    finalBulkDelCharges: bill.delivery,
    finalBulkPlatformCharges: bill.platform,
    deliveryDate: date ?? undefined,
    slotStartTime: slot?.start,
    slotEndTime: slot?.end,
    discount: bill.discount,
    taxes: bill.taxes,
    couponCode: coupon?.couponCode,
    couponDiscount: coupon?.discount,
    moneyWalletPointsUsed: bill.moneyWalletUsed,
    mealaweWalletPointsUsed: bill.cashbackUsed,
    voucherDiscount: 0,
    mealaweKitchenDiscount: 0,
    extraDiscount: 0,
  };
}

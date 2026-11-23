/**
 * A single child FoodOrder belonging to a subscription package — see
 * `loadFoodOrdersByPackage`, which queries these directly off the FoodOrder
 * collection (by `subscriptionMasterId`) rather than off the package doc's
 * own `dailyOrderList` snapshot.
 */
export interface DailyOrderEntry {
  foodOrderId: string;
  orderNo?: number;
  mealType?: string;
  orderDate?: string;
  orderstatus?: string;
  /** Effective amount actually charged for this day (mirrors `mapOrder`'s `amount ?? mealaweTotalAmt` fallback). */
  amount?: number;
}

/** Same calendar day, ignoring time-of-day — shared by `useOpenOrders`'
 * "today only" scoping and by callers resolving today's own child order. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

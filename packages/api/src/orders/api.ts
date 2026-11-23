import { session } from '../session';
import { ENDPOINTS, http, imageUri, statusLabel, type DailyOrderEntry, type OrderSummary } from '@mealawe/core';


/** Midnight-today in epoch ms (the open-orders endpoint scopes to today). */
function todayStartMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Midnight-today as an ISO string. `getCustomerPastOrdersByType`'s DAO does a
 * bare `new Date(clientDate)` server-side — an epoch-ms string parses to
 * `Invalid Date` there, so this endpoint specifically needs ISO, unlike the
 * epoch-ms `todayStartMs()` the open-orders endpoint expects.
 */
function todayStartIso(): string {
  return new Date(todayStartMs()).toISOString();
}

/** Flatten an array-of-arrays (or {data}) response into a flat list. */
function flatten(raw: unknown): Record<string, unknown>[] {
  const groups = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { data?: unknown })?.data)
      ? (raw as { data: unknown[] }).data
      : [];
  const out: Record<string, unknown>[] = [];
  for (const g of groups) {
    if (Array.isArray(g)) out.push(...(g as Record<string, unknown>[]));
    else if (g) out.push(g as Record<string, unknown>);
  }
  return out;
}

/** Map a loosely-shaped API order into the normalised row. Defensive by design. */
export function mapOrder(o: Record<string, unknown>): OrderSummary {
  const a = o as Record<string, any>;
  const status: string = a.orderstatus ?? a.orderStatus ?? a.status ?? '';
  const pkg = a.mealPackage ?? {};
  const first = Array.isArray(a.itemList) && a.itemList.length ? a.itemList[0] : null;
  const img: string | undefined = pkg.imageUrl || first?.imageUrl;
  const meal = [a.mealTimeLunch ? 'Lunch' : null, a.mealTimeDinner ? 'Dinner' : null]
    .filter(Boolean)
    .join(' + ');
  // Dine In packages repurpose `packageCategory` to hold the meal-time string
  // ("Lunch"/"Dinner"/"Lunch, Dinner" — see `dineInMealTime`/subscription-configure.tsx),
  // not a real display name the way a regular Subscription package's
  // `packageCategory` (its thali type, e.g. "Deluxe") is. Using the same
  // `packageCategory`-first priority for both showed "Lunch, Dinner" as a
  // Dine In order's title instead of its actual package name.
  const isDineIn = a.isDineIn === true;
  const primaryTitle = isDineIn ? pkg.packageName || pkg.packageCategory : pkg.packageCategory || pkg.packageName;
  return {
    id: String(a._id ?? a.orderNo ?? ''),
    orderNo: a.orderNo ?? '',
    orderType: a.orderType,
    status,
    // `pkg.*` covers subscription/package PARENT docs (foodOrderPackage.model.js
    // nests a `mealPackage` snapshot); `a.packageCategory`/`a.packageName` cover
    // plain FoodOrder docs (Meal Orders, On Demand, Open Orders, daily entries),
    // which carry those same fields top-level instead (foodOrder.model.js).
    // Kitchen name is the correct final fallback ONLY for orders that never had
    // a package at all (true on-demand kitchen orders).
    title: primaryTitle || a.packageCategory || a.packageName || a.kitchenName || first?.itemName || 'Order',
    subtitle: [pkg.days ? `${pkg.days}-day plan` : null, meal || null].filter(Boolean).join(' · '),
    amount: Number(a.amount ?? a.mealaweTotalAmt ?? 0) || 0,
    date: a.orderDate ?? a.subscriptionStartDate ?? a.deliveryDate,
    orderCreatedBy: a.orderCreatedBy,
    imageUrl: imageUri(typeof img === 'string' ? img : undefined),
    raw: o,
  };
}

/** The customer's subscription day-orders (paginated). Empty for guests / on error. */
export async function loadSubscriptionOrders(page = 1): Promise<OrderSummary[]> {
  try {
    const merged = await loadMergedSubscriptionAndPackageOrders(page);
    return merged.filter((o) => !isDineInOrder(o)).map(mapOrder);
  } catch {
    return [];
  }
}

/** Package/subscription orders booked as dine-in — same source, filtered the other way. */
export async function loadDineInOrders(page = 1): Promise<OrderSummary[]> {
  try {
    const merged = await loadMergedSubscriptionAndPackageOrders(page);
    return merged.filter(isDineInOrder).map(mapOrder);
  } catch {
    return [];
  }
}

/** On-demand FoodOrder history, filtered by `orderType`. 'subscription' = Meal Orders, 'allDay' = On Demand Orders (Ionic's exact enum values). */
async function loadOrdersByType(type: 'subscription' | 'allDay', page: number): Promise<OrderSummary[]> {
  const id = session().getProfileId();
  if (!id) return [];
  try {
    const raw = await http.get<unknown>(
      `${ENDPOINTS.orders.pastOrdersByType}/${id}/${page}/${todayStartIso()}/${type}`,
    );
    return flatten(raw).map(mapOrder);
  } catch {
    return [];
  }
}

export function loadMealOrders(page = 1): Promise<OrderSummary[]> {
  return loadOrdersByType('subscription', page);
}

export function loadOnDemandOrders(page = 1): Promise<OrderSummary[]> {
  return loadOrdersByType('allDay', page);
}

/** Oyo/apartment FoodOrder history — not paginated server-side (Ionic doesn't paginate these either). */
async function loadOrdersByCustomerType(orderType: 'oyo' | 'apartment'): Promise<OrderSummary[]> {
  const id = session().getProfileId();
  if (!id) return [];
  try {
    const raw = await http.get<unknown>(`${ENDPOINTS.orders.byTypeAndCustomer}/${orderType}/${id}`);
    return flatten(raw).map(mapOrder);
  } catch {
    return [];
  }
}

export function loadOyoOrders(): Promise<OrderSummary[]> {
  return loadOrdersByCustomerType('oyo');
}

export function loadApartmentOrders(): Promise<OrderSummary[]> {
  return loadOrdersByCustomerType('apartment');
}

/** Navmool marketplace order history — browsing itself happens in the navmool.com WebView, not natively. */
export async function loadMarketplaceOrders(page = 1): Promise<OrderSummary[]> {
  const id = session().getProfileId();
  if (!id) return [];
  try {
    const raw = await http.get<unknown>(`${ENDPOINTS.marketplace.pastOrders}/${id}/${page}`);
    return flatten(raw).map(mapOrder);
  } catch {
    return [];
  }
}

/** Currently-open (active today) orders for the live tracker. */
export async function loadOpenOrders(): Promise<OrderSummary[]> {
  const id = session().getProfileId();
  if (!id) return [];
  try {
    const raw = await http.get<unknown>(
      `${ENDPOINTS.orders.currentOpen}/${id}/${todayStartMs()}`,
    );
    return flatten(raw).map(mapOrder);
  } catch {
    return [];
  }
}

/**
 * Subscription + package day-orders merged (mirrors the Ionic app's
 * `subscription-order.component.ts`, which hits both endpoints and
 * concatenates) — a package order is a plan booked without the subscription
 * wrapper, same underlying shape. Dine-in orders are a package order with
 * `isDineIn: true` and get their own category, so they're excluded here.
 */
async function loadMergedSubscriptionAndPackageOrders(page: number): Promise<Record<string, unknown>[]> {
  const id = session().getProfileId();
  if (!id) return [];
  const [subscriptionRaw, packageRaw] = await Promise.all([
    http.get<unknown>(`${ENDPOINTS.orders.subscriptionList}/${id}/${page}`).catch(() => null),
    http.get<unknown>(`${ENDPOINTS.orders.packageList}/${id}/${page}`).catch(() => null),
  ]);
  return [...flatten(subscriptionRaw), ...flatten(packageRaw)];
}

function isDineInOrder(o: Record<string, unknown>): boolean {
  return o.orderType === 'subscriptionPackage' && o.isDineIn === true;
}

/** Re-fetch a single subscription order (for the detail screen). */
export async function loadOrderDetail(orderId: string): Promise<OrderSummary | null> {
  if (!orderId) return null;
  try {
    const raw = await http.get<Record<string, unknown>>(
      `${ENDPOINTS.orders.orderSubscription}/${orderId}`,
    );
    const obj = Array.isArray(raw) ? raw[0] : raw;
    return obj ? mapOrder(obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Re-fetch a single package order — `subscriptionPackage` orders specifically
 * (a `subscriptionParent` order needs `loadOrderDetail`/`orderSubscription`
 * instead; the two are different backend docs). This is the one that carries
 * `dailyOrderList` (see `listDailyOrders`), so it's what "Manage subscription"
 * needs for its child-order list and billing summary.
 */
export async function loadPackageOrderDetail(orderId: string): Promise<OrderSummary | null> {
  if (!orderId) return null;
  try {
    const raw = await http.get<Record<string, unknown>>(`${ENDPOINTS.orders.orderPackage}/${orderId}`);
    const obj = Array.isArray(raw) ? raw[0] : raw;
    return obj ? mapOrder(obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Every child FoodOrder for a package — queried directly off the FoodOrder
 * collection by its own `subscriptionMasterId` field (see
 * `getFoodOrdersByPackageId` server-side), never off the package doc's own
 * `dailyOrderList` snapshot. That snapshot's `orderstatus` is a
 * creation-time copy that never updates server-side, and it can't be
 * trusted to even list every child order that exists — this is the live,
 * authoritative source both problems needed.
 */
export async function loadFoodOrdersByPackage(packageId: string): Promise<DailyOrderEntry[]> {
  if (!packageId) return [];
  try {
    const raw = await http.get<unknown>(`${ENDPOINTS.orders.foodOrdersByPackage}/${packageId}`);
    const list = Array.isArray(raw) ? raw : [];
    return list
      .map((r): DailyOrderEntry | null => {
        const o = r as Record<string, unknown>;
        if (!o.foodOrderId) return null;
        return {
          foodOrderId: String(o.foodOrderId),
          orderNo: typeof o.orderNo === 'number' ? o.orderNo : undefined,
          mealType: typeof o.mealType === 'string' ? o.mealType : undefined,
          orderDate: typeof o.orderDate === 'string' ? o.orderDate : undefined,
          orderstatus: typeof o.orderstatus === 'string' ? o.orderstatus : undefined,
          amount: typeof o.amount === 'number' ? o.amount : undefined,
        };
      })
      .filter((e): e is DailyOrderEntry => e !== null)
      .sort((a, b) => new Date(a.orderDate ?? 0).getTime() - new Date(b.orderDate ?? 0).getTime());
  } catch {
    return [];
  }
}

/** Reschedule one child order to a new date (date-only — matches Ionic's
 * Breakfast-category reschedule path; a meal-type change would need the
 * separate `changeMealTypeAndDatePackageOrder` endpoint, not used here). */
export async function reschedulePackageChildOrder(
  orderDate: string,
  foodOrderId: string,
  packageOrderId: string,
): Promise<boolean> {
  try {
    await http.get(
      `${ENDPOINTS.orders.resechedulePackageOrder}/${orderDate}/${foodOrderId}/${packageOrderId}`,
    );
    return true;
  } catch {
    return false;
  }
}

/** Whether another live child order already exists on `orderDate` + `mealType` for this
 * package — call before `reschedulePackageChildOrder` so a conflict can be surfaced instead
 * of silently double-booking a day. */
export async function checkRescheduleConflict(
  packageOrderId: string,
  orderDate: string,
  mealType: string,
): Promise<boolean> {
  try {
    const res = await http.get<{ conflict?: boolean }>(
      `${ENDPOINTS.orders.checkRescheduleConflict}/${packageOrderId}/${orderDate}/${mealType}`,
    );
    return res?.conflict === true;
  } catch {
    // Can't confirm either way — fail open (let the reschedule attempt proceed)
    // rather than block the user on a network hiccup; the reschedule call
    // itself is still the backend's own last word.
    return false;
  }
}

export { statusLabel };

import { tryAdapter } from '../ports';

/** Sends through the app-registered Analytics adapter; silently no-ops if none (analytics is best-effort). */
function track(eventName: string, payload: Record<string, unknown>): void {
  tryAdapter('analytics')?.track(eventName, payload);
}

/** One cart line's e-commerce payload — mirrors the field names the Ionic
 * app's NetCoreService has always sent (`prid`/`product_name`/`category_name`/
 * `product_price`/`prqt`/`image_url`), kept stable across the Ionic→RN
 * transition so historical Netcore dashboard reports stay comparable. */
export interface CartEventItem {
  prid: string;
  product_name: string;
  category_name: string;
  product_price: number;
  prqt: number;
  image_url?: string;
  final_price?: number;
  selling_price?: number;
}

export interface CartTotals {
  total_items: number;
  total_prqt: number;
  selling_amount: number;
  discount_amt?: number;
}

/** The RN app's order-type identifiers — mirrors the Ionic app's `orderType`
 * branch values ('subscription' | 'bulk' | 'allDay' | 'advance'); 'navmool'
 * intentionally omitted — see marketplace.tsx's own comment (Task 18). */
export type NetcoreOrderType = 'subscription' | 'bulk' | 'allDay' | 'advance';

export function trackAddToCart(orderType: NetcoreOrderType, item: CartEventItem): void {
  track('add_to_cart', { orderType, ...item });
}

export function trackRemoveFromCart(orderType: NetcoreOrderType, item: CartEventItem): void {
  track('remove_from_cart', { orderType, ...item });
}

export function trackViewCartItems(orderType: NetcoreOrderType, items: CartEventItem[], totals: CartTotals): void {
  track('view_cart_items', { orderType, items, ...totals });
}

export function trackCartUpdated(orderType: NetcoreOrderType, items: CartEventItem[], totals: CartTotals): void {
  track('cart_updated', { orderType, items, ...totals });
}

export function trackProceedToCheckout(orderType: NetcoreOrderType, totals: CartTotals): void {
  track('proceed_to_checkout', { orderType, ...totals });
}

export interface PurchasePayload extends CartTotals {
  items: CartEventItem[];
  amount: number;
}

export function trackPurchase(orderType: NetcoreOrderType, payload: PurchasePayload): void {
  track('product_purchase', { orderType, ...payload });
}

export function trackPurchaseFailed(orderType: NetcoreOrderType, payload: PurchasePayload): void {
  track('purchase_failed', { orderType, ...payload });
}

export interface AddressEventPayload {
  flat?: string;
  landmark?: string;
  pincode?: string;
  city?: string;
  state?: string;
}

export function trackSelectAddress(address: AddressEventPayload): void {
  track('select_address', { ...address });
}

export function trackAddAddress(address: AddressEventPayload): void {
  track('add_address', { ...address });
}

export function trackLocateMe(address: AddressEventPayload | null): void {
  track('locate_me', { ...address });
}

export function trackCategoryViewed(categoryName: string): void {
  track('category_viewed', { category_name: categoryName });
}

export function trackSubAddonSelected(addonName: string, addonType: string | undefined, selected: boolean): void {
  track('sub_addon_selected', { addon_name: addonName, addon_type: addonType, selected });
}

export function trackProductView(productName: string, categoryName?: string, price?: number): void {
  track('product_view', { product_name: productName, category_name: categoryName, product_price: price });
}

/** Not yet wired anywhere — no cancel-order action exists in the RN app today
 * (see design spec's "Known gaps"). Written ahead of time so wiring it later,
 * once a cancel flow ships, is a one-line call instead of a new function. */
export function trackOrderCancelled(orderId: string, reason?: string): void {
  track('order_cancelled', { order_id: orderId, reason });
}

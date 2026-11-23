/** Normalised order-list row (raw kept for the detail view). */
export interface OrderSummary {
  id: string;
  orderNo?: string | number;
  orderType?: string;
  status?: string;
  title: string;
  subtitle?: string;
  amount: number;
  /** ISO or display date string from the API. */
  date?: string;
  imageUrl?: string;
  /** Which client placed the order, e.g. 'mealawe_app_android' — absent on
   * older orders and on admin/web-created ones. */
  orderCreatedBy?: string;
  /** Original API object — handed to the detail screen. */
  raw: Record<string, unknown>;
}

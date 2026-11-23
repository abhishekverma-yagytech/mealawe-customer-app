import { loadBulkPastOrders, loadDineInOrders, loadMarketplaceOrders, loadOnDemandOrders, loadSubscriptionOrders } from '@mealawe/api';
import type { OrderSummary } from '@mealawe/core';
import type { OrderModeKey } from '@mealawe/hooks';

export type OrderHistoryCategoryKey = 'subscription' | 'dineIn' | 'onDemand' | 'bulk' | 'marketplace';

export interface OrderHistoryCategory {
  key: OrderHistoryCategoryKey;
  title: string;
  emptyMessage: string;
  gate?: OrderModeKey;
  load: (page: number) => Promise<OrderSummary[]>;
}

/** Same categories as mobile's historyCategories.ts (web has no icon components). */
export const ORDER_HISTORY_CATEGORIES: OrderHistoryCategory[] = [
  { key: 'subscription', title: 'Subscription Package Orders', emptyMessage: 'Your subscription deliveries will show up here once you place an order.', gate: 'subscription', load: loadSubscriptionOrders },
  { key: 'dineIn', title: 'Dine In Orders', emptyMessage: 'Your dine-in bookings will show up here.', gate: 'dinein', load: loadDineInOrders },
  { key: 'onDemand', title: 'On Demand Orders', emptyMessage: 'Your on-demand orders will show up here.', gate: 'ondemand', load: loadOnDemandOrders },
  { key: 'bulk', title: 'Bulk Orders', emptyMessage: 'Your bulk orders will show up here.', gate: 'bulk', load: loadBulkPastOrders },
  { key: 'marketplace', title: 'Navmool Orders', emptyMessage: 'Your Navmool marketplace orders will show up here.', load: loadMarketplaceOrders },
];

export const getOrderHistoryCategory = (key: string) => ORDER_HISTORY_CATEGORIES.find((c) => c.key === key);

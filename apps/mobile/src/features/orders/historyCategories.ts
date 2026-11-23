import type { ComponentType } from 'react';

import {
  // IconApartment, IconHotel, IconUtensils — only used by the commented-out
  // categories below (Meal/Oyo/Apartment/Apartment Bulk Orders); re-import
  // alongside them if those are ever re-enabled.
  IconDineIn,
  IconPackage,
  IconReceipt,
  IconShoppingBag,
  IconStore,
  type IconProps,
} from '@/components/ui/icons';
import { loadBulkPastOrders } from '@/features/bulk/api';
// import { loadApartmentBulkPastOrders } from '@/features/bulk/api';
import type { AccentTone } from '@/theme';

import {
  loadDineInOrders,
  loadMarketplaceOrders,
  loadOnDemandOrders,
  loadSubscriptionOrders,
  // loadApartmentOrders, loadMealOrders, loadOyoOrders — only used by the
  // commented-out categories below.
} from './api';
import type { OrderSummary } from './types';

export type OrderHistoryCategoryKey =
  | 'mealOrders'
  | 'subscription'
  | 'dineIn'
  | 'onDemand'
  | 'bulk'
  | 'marketplace'
  | 'oyo'
  | 'apartment'
  | 'apartmentBulk';

export interface OrderHistoryCategory {
  key: OrderHistoryCategoryKey;
  title: string;
  icon: ComponentType<IconProps>;
  tone: AccentTone;
  /** Whether `load` supports incremental paging — Oyo/Apartment don't (Ionic doesn't paginate them either). */
  paginated: boolean;
  load: (page: number) => Promise<OrderSummary[]>;
  emptyMessage: string;
}

/**
 * The "My Orders" hub, mirroring the Ionic app's `my-orders.component.ts`
 * `linkList` — same order, same categories. Meal Orders, Oyo Orders,
 * Apartment Orders, and Apartment Bulk Orders are commented out below: none
 * of those verticals are live for customers yet, so they're not offered in
 * the hub for now — uncomment (and restore their imports above) once the
 * business turns them on.
 */
export const ORDER_HISTORY_CATEGORIES: OrderHistoryCategory[] = [
  // {
  //   key: 'mealOrders',
  //   title: 'Meal Orders',
  //   icon: IconUtensils,
  //   tone: 'food',
  //   paginated: true,
  //   load: loadMealOrders,
  //   emptyMessage: 'Your meal orders will show up here.',
  // },
  {
    key: 'subscription',
    title: 'Subscription Package Orders',
    icon: IconReceipt,
    tone: 'plan',
    paginated: true,
    load: loadSubscriptionOrders,
    emptyMessage: 'Your subscription deliveries will show up here once you place an order.',
  },
  {
    key: 'dineIn',
    title: 'Dine In Orders',
    icon: IconDineIn,
    tone: 'info',
    paginated: true,
    load: loadDineInOrders,
    emptyMessage: 'Your dine-in bookings will show up here.',
  },
  {
    key: 'onDemand',
    title: 'On Demand Orders',
    icon: IconStore,
    tone: 'location',
    paginated: true,
    load: loadOnDemandOrders,
    emptyMessage: 'Your on-demand orders will show up here.',
  },
  {
    key: 'bulk',
    title: 'Bulk Orders',
    icon: IconPackage,
    tone: 'offer',
    paginated: true,
    load: loadBulkPastOrders,
    emptyMessage: 'Your bulk orders will show up here.',
  },
  {
    key: 'marketplace',
    title: 'Navmool Orders',
    icon: IconShoppingBag,
    tone: 'reward',
    paginated: true,
    load: loadMarketplaceOrders,
    emptyMessage: 'Your Navmool marketplace orders will show up here.',
  },
  // {
  //   key: 'oyo',
  //   title: 'Oyo Orders',
  //   icon: IconHotel,
  //   tone: 'rating',
  //   paginated: false,
  //   load: () => loadOyoOrders(),
  //   emptyMessage: 'Your Oyo bookings will show up here.',
  // },
  // {
  //   key: 'apartment',
  //   title: 'Apartment Orders',
  //   icon: IconApartment,
  //   tone: 'plan',
  //   paginated: false,
  //   load: () => loadApartmentOrders(),
  //   emptyMessage: 'Your apartment orders will show up here.',
  // },
  // {
  //   key: 'apartmentBulk',
  //   title: 'Apartment Bulk Orders',
  //   icon: IconApartment,
  //   tone: 'offer',
  //   paginated: true,
  //   load: loadApartmentBulkPastOrders,
  //   emptyMessage: 'Your apartment bulk orders will show up here.',
  // },
];

export function getOrderHistoryCategory(key: string): OrderHistoryCategory | undefined {
  return ORDER_HISTORY_CATEGORIES.find((c) => c.key === key);
}

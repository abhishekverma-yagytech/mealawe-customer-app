export type OnDemandMode = 'allDay' | 'advance';

export interface DiscountOffer {
  discountType: 'percentage' | 'flat';
  discountValue: number;
  minAmount?: number;
  maxLimit?: number;
  startDate: string;
  expiryDate: string;
}

/** A kitchen that accepts on-demand (Daily/Advance) orders. */
export interface OnDemandKitchen {
  _id: string;
  kitchenName: string;
  imageUrl?: string;
  kitchenOpened: boolean;
  distance?: number;
  rating?: number;
  speciality?: string;
  mainSpeciality?: string;
  /** Veg/NonVeg/Jain tags the kitchen serves. */
  mealType?: string[];
  discountOffer?: DiscountOffer;
  /** Minutes the kitchen needs to prepare an order. */
  preparationTime?: number;
  /** True for the synthetic cluster-wide "kitchen" `loadClusterMenu()` builds
   * (Kota's aggregated-menu flow) — never a real kitchen document. Used to
   * skip the kitchen-switch links in `on-demand-cart.tsx`, which don't apply
   * when there's no real kitchen to switch away from. */
  clusterMenu?: boolean;
}

export interface OnDemandMenuItem {
  _id: string;
  itemName: string;
  itemDescription?: string;
  itemImage?: string;
  itemPrice: number;
  isVeg: boolean;
  itemType: 'Veg' | 'NonVeg' | 'Jain';
  mealType?: string;
  groupCategory?: string;
  itemIsCombo?: boolean;
  /** Eligible for Daily (allDay) mode. */
  serveDaily: boolean;
  /** Eligible for Advance mode. */
  itemAvailable: boolean;
  /** Present only for stock-limited items; undefined = uncapped. */
  quantityAvailable?: number;
  quantityBooked?: number;
  /** Minutes this specific item needs to prepare — distinct from (and may
   * differ per-item from) the kitchen-level `OnDemandKitchen.preparationTime`.
   * Admin-set per food item (`kitchenMenu.itemList[].preparationTime` in the
   * backend schema); undefined when not set for that item. */
  preparationTime?: number;
}

export interface OnDemandMenuGroup {
  groupName: string;
  items: OnDemandMenuItem[];
}

export interface OnDemandCartLine {
  item: OnDemandMenuItem;
  count: number;
}

export type ItemStatus = 'available' | 'missed' | 'coming-next' | 'sold-out' | 'not-available';

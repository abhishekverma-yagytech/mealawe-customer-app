import { create } from 'zustand';

import {
  STORAGE_KEYS,
  chargesFromConfig,
  DEFAULT_CHARGES,
  kvStorage,
  trackAddToCart,
  trackCartUpdated,
  trackRemoveFromCart,
  type AppliedCoupon,
  type BillCharges,
  type Cart,
  type CartEventItem,
  type SubscriptionConfig,
  type TreePlantation,
} from '@mealawe/core';
import { clusterApi } from '@mealawe/api';

import { useClusterStore } from './clusterStore';

const EMPTY_CART: Cart = { orderType: 'subscription', item: null, coupon: null, treePlantation: null };

/** Netcore's e-commerce payload for the single subscription cart line — same
 * field mapping the design spec documents (prid/product_name/category_name/
 * product_price/prqt/image_url from the package, count as prqt). */
function subscriptionCartEventItem(item: NonNullable<Cart['item']>): CartEventItem {
  return {
    prid: item.package._id ?? '',
    product_name: item.package.packageName ?? item.category,
    category_name: item.category,
    product_price: item.package.packagePrice,
    prqt: item.count,
    image_url: item.package.imageUrl,
  };
}

interface CartState {
  cart: Cart;
  /** Per-meal charges for the current cluster (fetched via searchClusterVariable). */
  charges: BillCharges;

  hydrate: () => void;
  /** Fetch the cluster's charge config (falls back to DEFAULT_CHARGES). */
  loadCharges: () => Promise<void>;
  /** Replace the subscription line from a Configure result (count preserved if same plan). */
  setSubscription: (config: SubscriptionConfig) => void;
  setCount: (count: number) => void;
  applyCoupon: (coupon: AppliedCoupon) => void;
  clearCoupon: () => void;
  setTreePlantation: (treePlantation: TreePlantation) => void;
  clearTreePlantation: () => void;
  reset: () => void;
}

function readCart(): Cart {
  try {
    return kvStorage.getObject<Cart>(STORAGE_KEYS.cart) ?? EMPTY_CART;
  } catch {
    return EMPTY_CART;
  }
}

function writeCart(cart: Cart): void {
  try {
    kvStorage.setObject(STORAGE_KEYS.cart, cart);
  } catch {
    // storage unavailable (e.g. Expo Go) — in-memory state still works
  }
}

/**
 * Subscription cart state (one subscription line) + the cluster's per-meal
 * charge config. Ports mealaweApp's CartService (subscription path). Bill math
 * is the pure `buildBill(cart, charges, …)` in features/cart/bill.
 */
export const useCartStore = create<CartState>((set, get) => ({
  cart: EMPTY_CART,
  charges: DEFAULT_CHARGES,

  hydrate: () => {
    set({ cart: readCart() });
  },

  loadCharges: async () => {
    const configName = useClusterStore.getState().currentConfigName();
    if (!configName) {
      set({ charges: DEFAULT_CHARGES });
      return;
    }
    try {
      const cfg = await clusterApi.searchClusterVariable(configName);
      set({ charges: chargesFromConfig(cfg) });
    } catch {
      set({ charges: DEFAULT_CHARGES });
    }
  },

  setSubscription: (config) => {
    const prev = get().cart.item;
    const isNewLine = !prev || prev.package._id !== config.package._id;
    const count = isNewLine ? 1 : prev.count;
    const item = { ...config, count };
    const cart: Cart = { ...get().cart, item };
    writeCart(cart);
    set({ cart });
    if (isNewLine) {
      trackAddToCart('subscription', subscriptionCartEventItem(item));
    }
  },

  setCount: (count) => {
    const item = get().cart.item;
    if (!item) {
      return;
    }
    // Dropping to 0 removes the plan entirely — same as any other "count hits
    // 0" quantity stepper in this app (bulk's own `nextCountFor` does this
    // too) — rather than silently refusing the tap, which left the "-"
    // button looking live at count 1 while doing nothing. Clearing the whole
    // cart (not just the item) matches `reset()`: a coupon or tree-plantation
    // selection tied to a plan that's gone is stale, not something to keep
    // around for whenever a new plan gets added.
    if (count < 1) {
      trackRemoveFromCart('subscription', subscriptionCartEventItem(item));
      writeCart(EMPTY_CART);
      set({ cart: EMPTY_CART });
      return;
    }
    const nextItem = { ...item, count };
    const cart: Cart = { ...get().cart, item: nextItem };
    writeCart(cart);
    set({ cart });
    if (count > item.count) {
      trackAddToCart('subscription', subscriptionCartEventItem(nextItem));
    } else if (count < item.count) {
      trackRemoveFromCart('subscription', subscriptionCartEventItem(nextItem));
    }
  },

  applyCoupon: (coupon) => {
    const cart: Cart = { ...get().cart, coupon };
    writeCart(cart);
    set({ cart });
    if (cart.item) {
      trackCartUpdated('subscription', [subscriptionCartEventItem(cart.item)], {
        total_items: 1,
        total_prqt: cart.item.count,
        selling_amount: cart.item.package.packagePrice * cart.item.count,
        discount_amt: coupon.discount,
      });
    }
  },

  clearCoupon: () => {
    const cart: Cart = { ...get().cart, coupon: null };
    writeCart(cart);
    set({ cart });
    if (cart.item) {
      trackCartUpdated('subscription', [subscriptionCartEventItem(cart.item)], {
        total_items: 1,
        total_prqt: cart.item.count,
        selling_amount: cart.item.package.packagePrice * cart.item.count,
      });
    }
  },

  setTreePlantation: (treePlantation) => {
    const cart: Cart = { ...get().cart, treePlantation };
    writeCart(cart);
    set({ cart });
  },

  clearTreePlantation: () => {
    const cart: Cart = { ...get().cart, treePlantation: null };
    writeCart(cart);
    set({ cart });
  },

  reset: () => {
    writeCart(EMPTY_CART);
    set({ cart: EMPTY_CART });
  },
}));

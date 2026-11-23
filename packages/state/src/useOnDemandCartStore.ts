import { create } from 'zustand';

import { STORAGE_KEYS, kvStorage, trackAddToCart, trackCartUpdated, trackRemoveFromCart, type CartEventItem, type AppliedCoupon, type OnDemandCartLine, type OnDemandKitchen, type OnDemandMenuItem, type OnDemandMode } from '@mealawe/core';


function onDemandCartEventItem(line: OnDemandCartLine, kitchen: OnDemandKitchen | null): CartEventItem {
  return {
    prid: line.item._id,
    product_name: line.item.itemName,
    category_name: kitchen?.kitchenName ?? '',
    product_price: line.item.itemPrice,
    prqt: line.count,
    image_url: line.item.itemImage,
  };
}

function onDemandTotals(lines: OnDemandCartLine[]): { total_items: number; total_prqt: number; selling_amount: number } {
  return {
    total_items: lines.length,
    total_prqt: lines.reduce((sum, l) => sum + l.count, 0),
    selling_amount: lines.reduce((sum, l) => sum + l.item.itemPrice * l.count, 0),
  };
}

export interface OnDemandCart {
  kitchen: OnDemandKitchen | null;
  mode: OnDemandMode | null;
  lines: OnDemandCartLine[];
  coupon: AppliedCoupon | null;
}

const EMPTY_CART: OnDemandCart = {
  kitchen: null,
  mode: null,
  lines: [],
  coupon: null,
};

interface OnDemandCartState {
  cart: OnDemandCart;
  hydrate: () => void;
  /**
   * Set an item's quantity (0 removes the line). On-demand carts are
   * single-kitchen + single-mode — passing a `kitchen`/`mode` different from
   * the cart's current one clears every existing line first (mirrors the
   * legacy's `checkIfItemCanBeAdded` same-kitchen-and-orderType conflict rule).
   */
  setCount: (item: OnDemandMenuItem, kitchen: OnDemandKitchen, mode: OnDemandMode, count: number) => void;
  applyCoupon: (coupon: AppliedCoupon) => void;
  clearCoupon: () => void;
  reset: () => void;
}

function readCart(): OnDemandCart {
  try {
    return { ...EMPTY_CART, ...(kvStorage.getObject<OnDemandCart>(STORAGE_KEYS.onDemandCart) ?? {}) };
  } catch {
    return EMPTY_CART;
  }
}

function writeCart(cart: OnDemandCart): void {
  try {
    kvStorage.setObject(STORAGE_KEYS.onDemandCart, cart);
  } catch {
    // storage unavailable (e.g. Expo Go) — in-memory state still works
  }
}

/**
 * On-demand cart state — one kitchen + one mode + an array of quantity lines,
 * kept as its own store (not merged into useBulkCartStore or useCartStore)
 * since the single-kitchen/single-mode scoping constraint doesn't fit
 * either existing store's shape. See design spec's "Why a separate cart
 * store" section.
 */
export const useOnDemandCartStore = create<OnDemandCartState>((set, get) => ({
  cart: EMPTY_CART,

  hydrate: () => set({ cart: readCart() }),

  setCount: (item, kitchen, mode, count) => {
    const current = get().cart;
    const sameContext = current.kitchen?._id === kitchen._id && current.mode === mode;
    const lines = sameContext ? current.lines : [];
    const resolvedCount = Math.max(0, count);

    let nextLines: OnDemandCartLine[];
    if (resolvedCount <= 0) {
      nextLines = lines.filter((l) => l.item._id !== item._id);
    } else {
      const exists = lines.some((l) => l.item._id === item._id);
      nextLines = exists
        ? lines.map((l) => (l.item._id === item._id ? { item, count: resolvedCount } : l))
        : [...lines, { item, count: resolvedCount }];
    }

    // A coupon's discount was computed against the old kitchen/mode's
    // subtotal — carrying it across a context switch would apply a stale,
    // unrevalidated discount to a cart the coupon was never checked against.
    const cart: OnDemandCart = {
      kitchen,
      mode,
      lines: nextLines,
      coupon: sameContext ? current.coupon : null,
    };
    writeCart(cart);
    set({ cart });

    const previousCount = lines.find((l) => l.item._id === item._id)?.count ?? 0;
    const changedLine = nextLines.find((l) => l.item._id === item._id);
    if (changedLine && resolvedCount > previousCount) {
      trackAddToCart(mode, onDemandCartEventItem(changedLine, kitchen));
    } else if (resolvedCount < previousCount) {
      trackRemoveFromCart(mode, {
        ...onDemandCartEventItem(changedLine ?? { item, count: previousCount }, kitchen),
        prqt: previousCount - resolvedCount,
      });
    }
    trackCartUpdated(mode, nextLines.map((l) => onDemandCartEventItem(l, kitchen)), onDemandTotals(nextLines));
  },

  applyCoupon: (coupon) => {
    const cart: OnDemandCart = { ...get().cart, coupon };
    writeCart(cart);
    set({ cart });
    if (cart.mode) {
      trackCartUpdated(cart.mode, cart.lines.map((l) => onDemandCartEventItem(l, cart.kitchen)), {
        ...onDemandTotals(cart.lines),
        discount_amt: coupon.discount,
      });
    }
  },

  clearCoupon: () => {
    const cart: OnDemandCart = { ...get().cart, coupon: null };
    writeCart(cart);
    set({ cart });
    if (cart.mode) {
      trackCartUpdated(cart.mode, cart.lines.map((l) => onDemandCartEventItem(l, cart.kitchen)), onDemandTotals(cart.lines));
    }
  },

  reset: () => {
    writeCart(EMPTY_CART);
    set({ cart: EMPTY_CART });
  },
}));

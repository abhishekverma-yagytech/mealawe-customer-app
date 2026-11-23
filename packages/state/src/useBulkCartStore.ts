import { create } from 'zustand';

import { STORAGE_KEYS, kvStorage, trackAddToCart, trackCartUpdated, trackRemoveFromCart, type CartEventItem, deliveryDateCountFor, isBelowMoq, unitPriceFor, type AppliedCoupon, type BulkCartLine, type BulkCategory, type BulkMenuItem, type BulkOrgInfo, type BulkPackaging } from '@mealawe/core';


function bulkCartEventItem(line: BulkCartLine, category: BulkCategory): CartEventItem {
  return {
    prid: line.item._id,
    product_name: line.item.itemName,
    category_name: category,
    product_price: line.itemPrice,
    prqt: line.count,
    image_url: line.item.itemImage,
  };
}

function bulkTotals(lines: BulkCartLine[]): { total_items: number; total_prqt: number; selling_amount: number } {
  return {
    total_items: lines.length,
    total_prqt: lines.reduce((sum, l) => sum + l.count, 0),
    selling_amount: lines.reduce((sum, l) => sum + l.itemPrice * l.count, 0),
  };
}

/** Bulk collapses to a single `'bulk'` Netcore order type regardless of
 * packaging — matches the design spec's taxonomy, which doesn't split bulk
 * further for analytics purposes even though the backend `orderType` does
 * via `bulkOrderType()`. */
function bulkOrderTypeFor(_category: BulkCategory): 'bulk' {
  return 'bulk';
}

export interface BulkCart {
  category: BulkCategory | null;
  packaging: BulkPackaging | null;
  orgInfo: BulkOrgInfo | null;
  lines: BulkCartLine[];
  coupon: AppliedCoupon | null;
}

const EMPTY_BULK_CART: BulkCart = {
  category: null,
  packaging: null,
  orgInfo: null,
  lines: [],
  coupon: null,
};

interface BulkCartState {
  cart: BulkCart;
  hydrate: () => void;
  /**
   * Set an item's quantity (0 removes the line). Below-MOQ counts reset to 0,
   * matching MealaweUserApp. Bulk carts are single category+packaging —
   * passing a `category` or `packaging` different from the cart's current
   * one clears every existing line first (org config/pricing differs per
   * category and per packaging mode).
   */
  setCount: (
    item: BulkMenuItem,
    category: BulkCategory,
    packaging: BulkPackaging,
    orgInfo: BulkOrgInfo,
    count: number,
  ) => void;
  applyCoupon: (coupon: AppliedCoupon) => void;
  clearCoupon: () => void;
  reset: () => void;
}

function readCart(): BulkCart {
  try {
    // Merge over EMPTY_BULK_CART — a cart persisted before `packaging` was
    // added to this shape would otherwise hydrate with `packaging: undefined`
    // (not `null`), which is falsy the same as `null` but breaks strict
    // `!== null` comparisons and lies about the type. Spreading the parsed
    // object over the empty-cart defaults normalizes any missing field.
    return { ...EMPTY_BULK_CART, ...(kvStorage.getObject<BulkCart>(STORAGE_KEYS.bulkCart) ?? {}) };
  } catch {
    return EMPTY_BULK_CART;
  }
}

function writeCart(cart: BulkCart): void {
  try {
    kvStorage.setObject(STORAGE_KEYS.bulkCart, cart);
  } catch {
    // storage unavailable (e.g. Expo Go) — in-memory state still works
  }
}

/**
 * Bulk cart state — an array of quantity lines (unlike Subscription's
 * single-item `useCartStore`), kept as its own store since bulk pricing/date
 * logic is unrelated to subscription's per-meal model. Bulk carts are
 * single-category+packaging: switching category or packaging clears any
 * existing lines.
 */
export const useBulkCartStore = create<BulkCartState>((set, get) => ({
  cart: EMPTY_BULK_CART,

  hydrate: () => set({ cart: readCart() }),

  setCount: (item, category, packaging, orgInfo, count) => {
    const current = get().cart;
    const sameContext = current.category === category && current.packaging === packaging;
    const lines = sameContext ? current.lines : [];
    const previousCount = lines.find((l) => l.item._id === item._id)?.count ?? 0;
    // Only a DECREASE that lands below MOQ snaps to 0 (removes the line) —
    // matches MealaweUserApp's increaseCount (no MOQ check at all) vs
    // decreaseCount/countBlur (snap to 0 below MOQ) split. Applying the snap
    // on increase too (the previous behavior) meant every "+" tap toward a
    // not-yet-reached MOQ was silently discarded — the line never appeared
    // and the "Minimum order quantity is N" caption never showed, since that
    // caption is itself keyed off the same isBelowMoq(count, ...) check.
    const isDecrease = count < previousCount;
    const resolvedCount = count > 0 && isDecrease && isBelowMoq(count, orgInfo) ? 0 : count;

    let nextLines: BulkCartLine[];
    if (resolvedCount <= 0) {
      nextLines = lines.filter((l) => l.item._id !== item._id);
    } else {
      const newLine: BulkCartLine = {
        item,
        count: resolvedCount,
        itemPrice: unitPriceFor(item, resolvedCount, orgInfo, category),
        deliveryDateCount: deliveryDateCountFor(resolvedCount, orgInfo, category),
      };
      const exists = lines.some((l) => l.item._id === item._id);
      // Preserve list order: update the existing line in place instead of
      // filter-then-append, so a row doesn't jump position on quantity change.
      nextLines = exists
        ? lines.map((l) => (l.item._id === item._id ? newLine : l))
        : [...lines, newLine];
    }

    // A coupon's discount was computed against the old category/packaging's
    // subtotal — carrying it across a context switch would apply a stale,
    // unrevalidated discount to a cart the coupon was never checked against.
    const cart: BulkCart = {
      category,
      packaging,
      orgInfo,
      lines: nextLines,
      coupon: sameContext ? current.coupon : null,
    };
    writeCart(cart);
    set({ cart });

    const changedLine = nextLines.find((l) => l.item._id === item._id);
    if (changedLine && resolvedCount > previousCount) {
      trackAddToCart(bulkOrderTypeFor(category), bulkCartEventItem(changedLine, category));
    } else if (resolvedCount < previousCount) {
      // Line removed or reduced — report the pre-change line/quantity being removed.
      trackRemoveFromCart(bulkOrderTypeFor(category), {
        ...bulkCartEventItem(
          changedLine ?? {
            item,
            count: previousCount,
            itemPrice: unitPriceFor(item, previousCount, orgInfo, category),
            deliveryDateCount: 0,
          },
          category,
        ),
        prqt: previousCount - resolvedCount,
      });
    }
    trackCartUpdated(bulkOrderTypeFor(category), nextLines.map((l) => bulkCartEventItem(l, category)), bulkTotals(nextLines));
  },

  applyCoupon: (coupon) => {
    const cart: BulkCart = { ...get().cart, coupon };
    writeCart(cart);
    set({ cart });
    if (cart.category) {
      trackCartUpdated('bulk', cart.lines.map((l) => bulkCartEventItem(l, cart.category!)), {
        ...bulkTotals(cart.lines),
        discount_amt: coupon.discount,
      });
    }
  },

  clearCoupon: () => {
    const cart: BulkCart = { ...get().cart, coupon: null };
    writeCart(cart);
    set({ cart });
    if (cart.category) {
      trackCartUpdated('bulk', cart.lines.map((l) => bulkCartEventItem(l, cart.category!)), bulkTotals(cart.lines));
    }
  },

  reset: () => {
    writeCart(EMPTY_BULK_CART);
    set({ cart: EMPTY_BULK_CART });
  },
}));

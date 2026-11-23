import type { BulkCategory, BulkMenuItem, BulkOrgInfo } from './types';

/** True once a positive count drops below the category's MOQ (0 itself is fine — that's "not in cart"). */
export function isBelowMoq(count: number, orgInfo: BulkOrgInfo): boolean {
  return count > 0 && count < orgInfo.moq;
}

/**
 * Slab-tier unit price for `count`. Snacks only has 3 real tiers (slab4 falls
 * back to slab3), matching MealaweUserApp's `adjustItemPrice()`.
 */
export function unitPriceFor(
  item: BulkMenuItem,
  count: number,
  orgInfo: BulkOrgInfo,
  category: BulkCategory,
): number {
  if (count <= orgInfo.slabLimit1) return item.slab1Price;
  if (count <= orgInfo.slabLimit2) return item.slab2Price;
  if (count <= orgInfo.slabLimit3) return item.slab3Price;
  return category === 'snacks' ? item.slab3Price : item.slab4Price;
}

/** Extra lead-days this line contributes to the cart's minimum delivery date. */
export function deliveryDateCountFor(count: number, orgInfo: BulkOrgInfo, category: BulkCategory): number {
  if (count <= orgInfo.slabLimit1) return 0;
  if (count <= orgInfo.slabLimit2) return orgInfo.dateLimit1;
  if (count <= orgInfo.slabLimit3) return orgInfo.dateLimit2;
  return category === 'snacks' ? orgInfo.dateLimit2 : orgInfo.dateLimit3;
}

export interface SlabRow {
  /** Quantity at which this tier's price kicks in. */
  fromQty: number;
  price: number;
}

/** The tiers above slab 1 (slab 2/3/[4]) — a bare list, no `fromQty: moq`
 * row, since that first tier isn't a "next" tier from anywhere. Shared by
 * `slabTableFor` (prepends the slab-1 row) and `slabNoteFor` (only ever
 * looks ahead from slab 1). */
function upperTiers(item: BulkMenuItem, orgInfo: BulkOrgInfo, category: BulkCategory): SlabRow[] {
  const rows: SlabRow[] = [
    { fromQty: orgInfo.slabLimit1 + 1, price: item.slab2Price },
    { fromQty: orgInfo.slabLimit2 + 1, price: item.slab3Price },
  ];
  if (category !== 'snacks') {
    rows.push({ fromQty: orgInfo.slabLimit3 + 1, price: item.slab4Price });
  }
  return rows;
}

/**
 * The visible slab-tier ladder for an item ("from N units -> Rs price/unit"),
 * for the info popover — mirrors mealaweApp's `BulkMenuService.slabTable()`.
 * Snacks only has 3 real tiers (no slab 4, same as `unitPriceFor`'s fallback).
 * Rows with a missing/zero price are dropped so partial slab configs render
 * clean.
 */
export function slabTableFor(item: BulkMenuItem, orgInfo: BulkOrgInfo, category: BulkCategory): SlabRow[] {
  const rows: SlabRow[] = [{ fromQty: orgInfo.moq, price: item.slab1Price }, ...upperTiers(item, orgInfo, category)];
  return rows.filter((row) => row.price > 0);
}

export type SlabNote =
  | { discounted: true; basePrice: number }
  | { discounted: false; nextThreshold: number; nextPrice: number };

/**
 * A one-line hint about this item's slab pricing at `count` (falls back to
 * the base/browsing tier when `count` is 0 — the item isn't in the cart
 * yet). Once quantity has crossed into a cheaper slab: `{ discounted: true,
 * basePrice }` ("was ₹basePrice"). Otherwise, the next genuinely cheaper
 * tier ahead: `{ discounted: false, nextThreshold, nextPrice }` ("from
 * ₹nextPrice at nextThreshold+ units"). Returns `null` when there's no
 * cheaper tier configured (e.g. every slab price is equal) — reuses
 * `unitPriceFor` rather than re-deriving the current price.
 */
export function slabNoteFor(
  item: BulkMenuItem,
  count: number,
  orgInfo: BulkOrgInfo,
  category: BulkCategory,
): SlabNote | null {
  const effectiveCount = Math.max(count, 1);
  const currentPrice = unitPriceFor(item, effectiveCount, orgInfo, category);
  if (currentPrice < item.slab1Price) {
    return { discounted: true, basePrice: item.slab1Price };
  }
  const next = upperTiers(item, orgInfo, category).find((row) => row.price > 0 && row.price < item.slab1Price);
  return next ? { discounted: false, nextThreshold: next.fromQty, nextPrice: next.price } : null;
}

/** Quantity-stepper increment once an item is already in the cart (i.e. at
 * or above MOQ) — only the very first "ADD" tap jumps straight to MOQ. */
export const QUANTITY_STEP = 1;

/**
 * Resolves a bulk quantity stepper's next count from its current value and a
 * tap direction (`delta`'s sign — its magnitude is ignored, `QUANTITY_STEP`
 * is what actually governs the jump):
 * - Zero -> tap "+": jump straight to MOQ (matches both reference apps'
 *   "ADD" button semantics — MealaweUserApp's `addB2BItemToCart` sets
 *   `item.count = moq`; mealaweApp's bulk-item-card `add()` emits
 *   `Math.max(moq, 1)` — rather than starting a stepper at 1).
 * - In cart, tap "+": step up by `QUANTITY_STEP` (1) — only the very first
 *   tap from 0 is the big MOQ jump; every tap after that is a normal
 *   one-at-a-time stepper.
 * - In cart, tap "-": step down by `QUANTITY_STEP`; if that would land
 *   below MOQ, drop to 0 (remove the line) instead of leaving an
 *   under-MOQ count — mirrors mealaweApp's `bulk-item-card` `dec()`
 *   ("dropping below MOQ removes the line entirely"). Shared by every
 *   bulk quantity stepper (menu + cart) so both stay in sync.
 */
export function nextCountFor(current: number, delta: number, moq: number): number {
  const increasing = delta > 0;
  if (current === 0) {
    return increasing ? Math.max(moq, 1) : 0;
  }
  if (increasing) {
    return current + QUANTITY_STEP;
  }
  const stepped = current - QUANTITY_STEP;
  return stepped < moq ? 0 : stepped;
}

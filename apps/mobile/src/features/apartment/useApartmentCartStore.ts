import { create } from 'zustand';

import { STORAGE_KEYS } from '@/config';
import { kvStorage } from '@/services/storage/kvStore';

import type { ApartmentCartLine, ApartmentCartMeta, ApartmentDish, ApartmentDishOffer, ApartmentMenuItem, MealType, OrderType, PickupBySlot } from './types';

// Exported so the add-sheet can look up an existing line for the exact offer it's about to commit (stricter than pricing.ts's name-only matching).
export function lineKeyFor(dishName: string, offer: Pick<ApartmentDishOffer, 'mealType' | 'itemServingDate'>): string {
  return `${dishName.trim().toLowerCase()}|${offer.mealType ?? ''}|${offer.itemServingDate ?? ''}`;
}

/** Bug fix (2026-09-01): clamps to `offer.availableQty` here in the store (the one place every caller's write lands) rather than at individual call sites, so no path — including the in-cart stepper and `addLine`'s increment — can land above stock; floors at 0; Advance is exempt since its offer never sets `availableQty`. */
function clampToAvailable(count: number, offer: Pick<ApartmentDishOffer, 'availableQty'>): number {
  if (offer.availableQty === undefined) return count;
  return Math.max(0, Math.min(count, offer.availableQty));
}

/** A pending add that conflicts with the cart's current kitchen ("one order = one kitchen") or its order-type mix (Advance never combines with Instant/Today); `reason` tells `ApartmentConflictModal` which explanation to show, defaulting to `'kitchen'` for backward compatibility. */
export interface ApartmentCartConflict {
  dishName: string;
  imageUrl?: string;
  isVeg: boolean;
  offer: ApartmentDishOffer;
  count: number;
  orderType: OrderType;
  apartmentId: string;
  apartmentName?: string;
  reason?: 'kitchen' | 'orderType';
}

/** Instant + Today may combine into one checkout; Advance may never combine with either — see `ApartmentCartConflict`'s comment for why. */
function conflictsByOrderType(existingTypes: Set<OrderType>, incoming: OrderType): boolean {
  if (existingTypes.size === 0) return false;
  const hasAdvance = existingTypes.has('advance');
  const hasTodayOrInstant = existingTypes.has('today') || existingTypes.has('instant');
  if (incoming === 'advance') return hasTodayOrInstant;
  return hasAdvance;
}

interface ApartmentCartState {
  lines: ApartmentCartLine[];
  meta: ApartmentCartMeta | null;
  pickup: PickupBySlot;
  /** The Advance delivery window the resident picked for the whole order (cart-wide, not per-line); `null` = not yet chosen. */
  advanceDeliverySlot: MealType | null;
  conflict: ApartmentCartConflict | null;

  hydrate: () => void;
  /** Add (or increment) a line; on a conflicting (orderType, kitchen) this raises `conflict` instead, for the caller to show the dialog and either `startNewOrder()` or `dismissConflict()`. */
  addLine: (
    dish: Pick<ApartmentDish, 'name' | 'imageUrl' | 'isVeg'>,
    offer: ApartmentDishOffer,
    orderType: OrderType,
    apartmentId: string,
    apartmentName: string | undefined,
    count: number,
  ) => void;
  /** Shared by `addLine` and the add-sheet's kitchen picker; sets `conflict` and returns `true` when `offer`'s kitchen differs from the cart's current one. */
  checkKitchenConflict: (
    dish: Pick<ApartmentDish, 'name' | 'imageUrl' | 'isVeg'>,
    offer: ApartmentDishOffer,
    orderType: OrderType,
    apartmentId: string,
    apartmentName: string | undefined,
    count: number,
  ) => boolean;
  /** One-tap add for a same-kitchen pairing suggestion (always qty 1); `kitchenId`/`kitchenName`/`source` come from the caller's offer, not `meta` (which can still be empty). */
  addPairing: (
    item: ApartmentMenuItem,
    orderType: OrderType,
    apartmentId: string,
    apartmentName: string | undefined,
    kitchenId: string,
    kitchenName: string,
    source: 'daily' | 'standard',
    itemServingDate: string | undefined,
  ) => void;
  /** Resolves a pending conflict by clearing the cart and starting fresh with the item that triggered it. */
  startNewOrder: () => void;
  dismissConflict: () => void;
  /** Adjust an existing line by key — `count <= 0` (or below its MOQ floor) removes it; clears `meta`/`pickup` once the cart empties. */
  setLineCount: (key: string, count: number) => void;
  togglePickup: (mealTypeKey: string) => void;
  /** Sets a slot's pickup/delivery choice to a known value (unlike `togglePickup`'s flip) — used to force-correct a slot with only one fulfillment mode. */
  setPickup: (mealTypeKey: string, value: boolean) => void;
  /** Sets/clears the Advance delivery-slot choice. Not validated against the cart's actual kitchen/type — same trust level as setPickup/togglePickup. */
  setAdvanceDeliverySlot: (slot: MealType | null) => void;
  reset: () => void;
}

interface PersistedCart {
  lines: ApartmentCartLine[];
  meta: ApartmentCartMeta | null;
  pickup: PickupBySlot;
  advanceDeliverySlot: MealType | null;
}

function readCart(): PersistedCart {
  try {
    // `advanceDeliverySlot` may be absent on an older persisted cart; `?? null` avoids re-coercing an explicit null.
    const persisted = kvStorage.getObject<PersistedCart>(STORAGE_KEYS.apartmentCart);
    return persisted ? { ...persisted, advanceDeliverySlot: persisted.advanceDeliverySlot ?? null } : { lines: [], meta: null, pickup: {}, advanceDeliverySlot: null };
  } catch {
    return { lines: [], meta: null, pickup: {}, advanceDeliverySlot: null };
  }
}

function writeCart(state: PersistedCart): void {
  try {
    kvStorage.setObject(STORAGE_KEYS.apartmentCart, state);
  } catch {
    // storage unavailable (e.g. Expo Go) — in-memory state still works
  }
}

export const useApartmentCartStore = create<ApartmentCartState>((set, get) => ({
  lines: [],
  meta: null,
  pickup: {},
  advanceDeliverySlot: null,
  conflict: null,

  hydrate: () => {
    const persisted = readCart();
    // Migration: backfill `orderType` on lines from an older cart that predates it, using the cart-wide `meta.orderType`.
    const lines = persisted.lines.map((line) => (line.orderType ? line : { ...line, orderType: persisted.meta?.orderType ?? 'instant' }));
    set({ lines, meta: persisted.meta, pickup: persisted.pickup, advanceDeliverySlot: persisted.advanceDeliverySlot });
  },

  checkKitchenConflict: (dish, offer, orderType, apartmentId, apartmentName, count) => {
    const meta = get().meta;
    // A different kitchen raises the "start a new order" prompt; checked first since it's the more fundamental conflict.
    if (meta && meta.kitchenId !== offer.kitchenId) {
      set({
        conflict: {
          dishName: dish.name,
          imageUrl: dish.imageUrl,
          isVeg: dish.isVeg,
          offer,
          count,
          orderType,
          apartmentId,
          apartmentName,
          reason: 'kitchen',
        },
      });
      return true;
    }
    // Instant + Today may combine, but Advance never combines with either — see `conflictsByOrderType`'s comment.
    const existingTypes = new Set(get().lines.map((l) => l.orderType));
    if (conflictsByOrderType(existingTypes, orderType)) {
      set({
        conflict: {
          dishName: dish.name,
          imageUrl: dish.imageUrl,
          isVeg: dish.isVeg,
          offer,
          count,
          orderType,
          apartmentId,
          apartmentName,
          reason: 'orderType',
        },
      });
      return true;
    }
    return false;
  },

  addLine: (dish, offer, orderType, apartmentId, apartmentName, count) => {
    if (get().checkKitchenConflict(dish, offer, orderType, apartmentId, apartmentName, count)) return;
    const key = lineKeyFor(dish.name, offer);
    const lines = get().lines;
    const idx = lines.findIndex((l) => l.key === key);
    const next =
      idx >= 0
        ? lines.map((l) => (l.key === key ? { ...l, count: clampToAvailable(l.count + count, l.offer) } : l))
        : [...lines, { key, dishName: dish.name, imageUrl: dish.imageUrl, isVeg: dish.isVeg, offer, orderType, count: clampToAvailable(count, offer) }];
    // `orderType` here is just "most recently added" — informational only, never read for conflict/grouping.
    const nextMeta: ApartmentCartMeta = { orderType, kitchenId: offer.kitchenId, kitchenName: offer.kitchenName, apartmentId, apartmentName };
    // A brand-new cart starts with no delivery-slot choice; adding to an existing cart leaves an already-made choice alone.
    const advanceDeliverySlot = lines.length === 0 ? null : get().advanceDeliverySlot;
    set({ lines: next, meta: nextMeta, advanceDeliverySlot });
    writeCart({ lines: next, meta: nextMeta, pickup: get().pickup, advanceDeliverySlot });
  },

  addPairing: (item, orderType, apartmentId, apartmentName, kitchenId, kitchenName, source, itemServingDate) => {
    const offer: ApartmentDishOffer = {
      kitchenId,
      kitchenName,
      source,
      itemId: item._id,
      price: item.itemPrice,
      mealType: item.mealType,
      itemServingDate,
      preparationTime: item.preparationTime,
      blocked: false,
    };
    get().addLine({ name: item.itemName, imageUrl: item.imageUrl, isVeg: item.itemType === 'Veg' || item.itemType === 'Jain' }, offer, orderType, apartmentId, apartmentName, 1);
  },

  startNewOrder: () => {
    const c = get().conflict;
    if (!c) return;
    const key = lineKeyFor(c.dishName, c.offer);
    // Same clamp backstop as `addLine`/`setLineCount` — this is the one other place a line gets constructed directly.
    const line: ApartmentCartLine = { key, dishName: c.dishName, imageUrl: c.imageUrl, isVeg: c.isVeg, offer: c.offer, orderType: c.orderType, count: clampToAvailable(c.count, c.offer) };
    const meta: ApartmentCartMeta = { orderType: c.orderType, kitchenId: c.offer.kitchenId, kitchenName: c.offer.kitchenName, apartmentId: c.apartmentId, apartmentName: c.apartmentName };
    set({ lines: [line], meta, pickup: {}, advanceDeliverySlot: null, conflict: null });
    writeCart({ lines: [line], meta, pickup: {}, advanceDeliverySlot: null });
  },

  dismissConflict: () => set({ conflict: null }),

  setLineCount: (key, count) => {
    const lines = get().lines;
    const line = lines.find((l) => l.key === key);
    const clamped = line ? clampToAvailable(count, line.offer) : count;
    const next = clamped < 1 ? lines.filter((l) => l.key !== key) : lines.map((l) => (l.key === key ? { ...l, count: clamped } : l));
    const meta = next.length ? get().meta : null;
    const pickup = next.length ? get().pickup : {};
    // The cart emptying out clears the delivery-slot choice too.
    const advanceDeliverySlot = next.length ? get().advanceDeliverySlot : null;
    set({ lines: next, meta, pickup, advanceDeliverySlot });
    writeCart({ lines: next, meta, pickup, advanceDeliverySlot });
  },

  togglePickup: (mealTypeKey) => {
    const pickup = { ...get().pickup, [mealTypeKey]: !get().pickup[mealTypeKey] };
    set({ pickup });
    writeCart({ lines: get().lines, meta: get().meta, pickup, advanceDeliverySlot: get().advanceDeliverySlot });
  },

  setPickup: (mealTypeKey, value) => {
    if (get().pickup[mealTypeKey] === value) return;
    const pickup = { ...get().pickup, [mealTypeKey]: value };
    set({ pickup });
    writeCart({ lines: get().lines, meta: get().meta, pickup, advanceDeliverySlot: get().advanceDeliverySlot });
  },

  setAdvanceDeliverySlot: (slot) => {
    if (get().advanceDeliverySlot === slot) return;
    set({ advanceDeliverySlot: slot });
    writeCart({ lines: get().lines, meta: get().meta, pickup: get().pickup, advanceDeliverySlot: slot });
  },

  reset: () => {
    set({ lines: [], meta: null, pickup: {}, advanceDeliverySlot: null, conflict: null });
    writeCart({ lines: [], meta: null, pickup: {}, advanceDeliverySlot: null });
  },
}));

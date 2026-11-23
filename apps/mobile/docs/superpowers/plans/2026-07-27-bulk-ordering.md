# Bulk Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship menu-driven Bulk ordering (Meals / Snacks / Food Box) in MealaweUserAppRN — Home tab tiles → per-category menu screen → cart/checkout screen ending at the same "Proceed to Pay" placeholder Subscription already has.

**Architecture:** New `src/features/bulk/` module mirroring `src/features/subscription/`'s shape (types, api, pure pricing/schedule logic, a dedicated Zustand cart store), two new expo-router screens (`bulk-menu.tsx`, `bulk-cart.tsx`), and a small shared `QuantityStepper` UI primitive. The existing `Cart`/`useCartStore` (subscription-only) is left untouched — bulk gets its own store because its cart is an array of quantity lines with slab pricing, not a single item.

**Tech Stack:** React Native (Expo SDK 57, expo-router), Zustand, MMKV (`kvStorage`), NativeWind, existing `AppText`/`Button`/`AccentIcon` design system.

**Spec:** `docs/superpowers/specs/2026-07-27-bulk-ordering-design.md`

**Verification convention (no unit tests in this project):** every task's file(s) are verified with `npx tsc --noEmit` (expect no errors mentioning the new/changed file). UI tasks additionally get a manual on-device check described in the step. Final task runs the full manual QA walkthrough from the spec.

---

### Task 1: Storage key + endpoint registry

**Files:**
- Modify: `src/config/constants.ts`
- Modify: `src/services/http/endpoints.ts`

- [ ] **Step 1: Add the bulk cart storage key**

In `src/config/constants.ts`, add `bulkCart` to `STORAGE_KEYS`:

```ts
export const STORAGE_KEYS = {
  sessionToken: 'mw.session.token',
  user: 'mw.user',
  selectedAddress: 'mw.location.address',
  clusters: 'mw.location.clusters',
  cart: 'mw.cart',
  bulkCart: 'mw.cart.bulk',
  themePreference: 'mw.theme.preference',
} as const;
```

- [ ] **Step 2: Add the bulk endpoint block**

In `src/services/http/endpoints.ts`, add a `bulk` block (replacing the "add domains" comment) right after `orders`. **Correction verified against MealaweUserApp's actual call sites** (`bulk-meals.component.ts`, `bulk-snacks.component.ts`, `foodbox.component.ts`): every bulk menu category — Meals, Snacks, *and* Food Box — calls the same single method, `apiMainService.fetchBulkMenu(category)` → `GET /api/fetchBulkMenu/:category`, just with a different `category` path segment per category/packaging combo. There is only one menu-fetch endpoint, not five:

```ts
  /** Bulk ordering (Meals / Snacks / Food Box) — all menu categories share one parameterized endpoint. */
  bulk: {
    /** GET /api/fetchBulkMenu/:category → BulkMenuResponse. category ∈ 'bulkMeals'|'individualMeals'|'bulkSnacks'|'individualSnacks'|'predefinedSnackbox'|'customSnackbox'. */
    fetchMenu: '/api/fetchBulkMenu',
    /** POST /api/saveBulkFoodOrder — body: bulk order payload → { success }. Not yet called from the UI (payment is a later phase). */
    saveOrder: '/api/saveBulkFoodOrder',
    /** GET /api/getPastBulkFoodOrders/:profileId/:page → past bulk orders. */
    pastOrders: '/api/getPastBulkFoodOrders',
  },
  // ...add domains (home, onDemand, dineIn, marketplace, oyo) as each vertical is migrated.
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/config/constants.ts src/services/http/endpoints.ts
git commit -m "feat(bulk): add storage key + endpoint registry for bulk ordering"
```

---

### Task 2: Bulk domain types

**Files:**
- Create: `src/features/bulk/types.ts`

- [ ] **Step 1: Write the types**

```ts
export type BulkCategory = 'meals' | 'snacks' | 'foodbox';
export type BulkPackaging = 'individual' | 'bulk';

/**
 * Org-level bulk config for a menu (shared by every item in that menu response).
 * Ported from MealaweUserApp's `b2BMenuOrgInfo` / locally-built `bulkMealOrgInfo`.
 */
export interface BulkOrgInfo {
  moq: number;
  slabLimit1: number;
  slabLimit2: number;
  slabLimit3: number;
  dateLimit1: number;
  dateLimit2: number;
  dateLimit3: number;
  deliverySlab1: number;
  deliverySlab2: number;
  deliverySlab3: number;
  deliverySlab4: number;
  packagingCharges: number;
  platformCharges: number;
}

export interface BulkMenuItem {
  _id: string;
  itemName: string;
  itemImage?: string;
  isVeg: boolean;
  /** Base (slab-1) price — kept for display before any quantity is chosen. */
  itemPrice: number;
  slab1Price: number;
  slab2Price: number;
  slab3Price: number;
  slab4Price: number;
}

/** A menu API response: org config + its item list. */
export interface BulkMenuResponse extends BulkOrgInfo {
  itemList: BulkMenuItem[];
}

/** One line in the bulk cart. `itemPrice`/`deliveryDateCount` are the resolved
 * slab-tier values for the line's current `count` (see `pricing.ts`). */
export interface BulkCartLine {
  item: BulkMenuItem;
  count: number;
  itemPrice: number;
  deliveryDateCount: number;
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/bulk/types.ts
git commit -m "feat(bulk): add bulk ordering domain types"
```

---

### Task 3: Bulk API client

**Files:**
- Create: `src/features/bulk/api.ts`

- [ ] **Step 1: Write the API client**

```ts
import { ENDPOINTS, http } from '@/services/http';

import type { BulkCategory, BulkMenuItem, BulkMenuResponse, BulkPackaging } from './types';

function normalizeItem(raw: Record<string, unknown>): BulkMenuItem {
  const slab1 = Number(raw.slab1Price ?? raw.itemPrice ?? 0);
  return {
    _id: String(raw._id ?? raw.id ?? ''),
    itemName: String(raw.itemName ?? raw.name ?? ''),
    itemImage: raw.itemImage ? String(raw.itemImage) : undefined,
    // Backend field is `itemType: 'Veg' | 'NonVeg'` (verified against
    // bulk-order-card.component.html / user-search.service.ts), not a boolean.
    isVeg: String(raw.itemType ?? '').toLowerCase() === 'veg',
    itemPrice: Number(raw.itemPrice ?? slab1),
    slab1Price: slab1,
    slab2Price: Number(raw.slab2Price ?? slab1),
    slab3Price: Number(raw.slab3Price ?? raw.slab2Price ?? slab1),
    slab4Price: Number(raw.slab4Price ?? raw.slab3Price ?? slab1),
  };
}

function normalizeMenu(raw: Record<string, unknown>): BulkMenuResponse {
  const itemList = Array.isArray(raw.itemList)
    ? (raw.itemList as Record<string, unknown>[]).map(normalizeItem)
    : [];
  return {
    moq: Number(raw.moq ?? 1),
    slabLimit1: Number(raw.slabLimit1 ?? 0),
    slabLimit2: Number(raw.slabLimit2 ?? 0),
    slabLimit3: Number(raw.slabLimit3 ?? 0),
    dateLimit1: Number(raw.dateLimit1 ?? 0),
    dateLimit2: Number(raw.dateLimit2 ?? 0),
    dateLimit3: Number(raw.dateLimit3 ?? 0),
    deliverySlab1: Number(raw.deliverySlab1 ?? 0),
    deliverySlab2: Number(raw.deliverySlab2 ?? 0),
    deliverySlab3: Number(raw.deliverySlab3 ?? 0),
    deliverySlab4: Number(raw.deliverySlab4 ?? 0),
    packagingCharges: Number(raw.packagingCharges ?? 0),
    platformCharges: Number(raw.platformCharges ?? 0),
    itemList,
  };
}

/**
 * `/api/fetchBulkMenu/:category` path segment per category + packaging mode.
 * Verified against MealaweUserApp's actual call sites (`bulk-meals`, `bulk-snacks`,
 * `foodbox` components) — every category goes through this one endpoint.
 */
const CATEGORY_SEGMENT: Record<BulkCategory, Record<BulkPackaging, string>> = {
  meals: { individual: 'individualMeals', bulk: 'bulkMeals' },
  snacks: { individual: 'individualSnacks', bulk: 'bulkSnacks' },
  foodbox: { individual: 'predefinedSnackbox', bulk: 'customSnackbox' },
};

/** Fetch a bulk menu for one category + packaging mode. Empty-safe on failure. */
export async function loadBulkMenu(
  category: BulkCategory,
  packaging: BulkPackaging,
): Promise<BulkMenuResponse | null> {
  try {
    const path = `${ENDPOINTS.bulk.fetchMenu}/${CATEGORY_SEGMENT[category][packaging]}`;
    const raw = await http.get<Record<string, unknown>>(path);
    return raw ? normalizeMenu(raw) : null;
  } catch {
    return null;
  }
}

/** POST /api/saveBulkFoodOrder — not yet called from the UI (payment is a later phase). */
export async function saveBulkFoodOrder(
  payload: Record<string, unknown>,
): Promise<{ success: boolean } | null> {
  try {
    return await http.post<{ success: boolean }>(ENDPOINTS.bulk.saveOrder, payload);
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/bulk/api.ts
git commit -m "feat(bulk): add bulk menu API client"
```

---

### Task 4: Pricing + schedule pure logic

**Files:**
- Create: `src/features/bulk/pricing.ts`
- Create: `src/features/bulk/schedule.ts`

- [ ] **Step 1: Write pricing.ts**

Ports `adjustItemPrice()` / MOQ checks from `bulk-order-cart.component.ts`:

```ts
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
```

- [ ] **Step 2: Write schedule.ts**

Ports `adjustDeliveryDate()` and the hourly slot window:

```ts
import type { BulkCartLine } from './types';

/** Tomorrow (local, noon-pinned) + the largest per-line lead time in the cart, as YYYY-MM-DD. */
export function minDeliveryDate(lines: BulkCartLine[]): string {
  const extraDays = lines.reduce((max, l) => Math.max(max, l.deliveryDateCount), 0);
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + 1 + extraDays);
  return date.toISOString().slice(0, 10);
}

export interface DeliverySlot {
  start: string; // "HH:mm"
  end: string;
}

/** Hourly delivery slots, default window mirrors MealaweUserApp's DD_B2B_START_TIME/STOP_TIME (8am–9pm). */
export function slotsFor(startHour = 8, endHour = 21): DeliverySlot[] {
  const slots: DeliverySlot[] = [];
  for (let h = startHour; h < endHour; h++) {
    slots.push({ start: `${String(h).padStart(2, '0')}:00`, end: `${String(h + 1).padStart(2, '0')}:00` });
  }
  return slots;
}
```

> **Addendum (added during Task 11's code review fix):** `schedule.ts` also needs a `formatShort` date formatter for the bulk-cart delivery-date picker (raw ISO strings are not user-friendly). Add this to the same file:
> ```ts
> const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
>
> /** "2026-08-03" -> "3 Aug". */
> export function formatShort(iso: string): string {
>   if (!iso) return '';
>   const d = new Date(`${iso}T00:00:00Z`);
>   return `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
> }
> ```
> And add `formatShort` to the barrel's schedule re-export in `src/features/bulk/index.ts`:
> `export { minDeliveryDate, slotsFor, formatShort, type DeliverySlot } from './schedule';`

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/bulk/pricing.ts src/features/bulk/schedule.ts
git commit -m "feat(bulk): add slab pricing, MOQ, and delivery-date pure logic"
```

---

### Task 5: Bulk bill computation

**Files:**
- Create: `src/features/bulk/bill.ts`

- [ ] **Step 1: Write the bill module**

Ports `calculateDeliveryCharge()` / `getOtherPayAmt()`'s tax layering from `bulk-order-cart.component.ts`, following the same shape as `features/cart/bill.ts`'s `buildBill`:

```ts
import type { BulkCartLine, BulkCategory, BulkOrgInfo } from './types';

export interface BulkBillCharges {
  deliveryGstPercent: number;
  packagingGstPercent: number;
  platformGstPercent: number;
  itemGstPercent: number;
}

/** Fallback GST rates (overridden by the cluster config in a later phase, same as subscription's DEFAULT_CHARGES). */
export const DEFAULT_BULK_CHARGES: BulkBillCharges = {
  deliveryGstPercent: 18,
  packagingGstPercent: 18,
  platformGstPercent: 18,
  itemGstPercent: 5,
};

export interface BulkBill {
  totalQty: number;
  subTotal: number;
  delivery: number;
  packaging: number;
  platform: number;
  taxes: number;
  discount: number;
  cashbackUsed: number;
  moneyWalletUsed: number;
  toPay: number;
  saving: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Total-cart-quantity delivery-charge slab, mirrors calculateDeliveryCharge(). */
function deliveryChargeFor(totalQty: number, orgInfo: BulkOrgInfo, category: BulkCategory): number {
  // Nullish (not `||`) — a legitimately-configured 0 must stay 0, matching the
  // Ionic source's `slabLimit1 ?? moq ?? 0`.
  const s1 = orgInfo.slabLimit1 ?? orgInfo.moq ?? 0;
  const s2 = orgInfo.slabLimit2 ?? s1;
  const s3 = orgInfo.slabLimit3 ?? s2;
  if (totalQty <= s1) return orgInfo.deliverySlab1 || 0;
  if (totalQty <= s2) return orgInfo.deliverySlab2 || orgInfo.deliverySlab1 || 0;
  if (totalQty <= s3) return orgInfo.deliverySlab3 || orgInfo.deliverySlab2 || 0;
  if (category === 'snacks') return orgInfo.deliverySlab3 || orgInfo.deliverySlab2 || 0;
  return orgInfo.deliverySlab4 || orgInfo.deliverySlab3 || 0;
}

export function emptyBulkBill(): BulkBill {
  return {
    totalQty: 0,
    subTotal: 0,
    delivery: 0,
    packaging: 0,
    platform: 0,
    taxes: 0,
    discount: 0,
    cashbackUsed: 0,
    moneyWalletUsed: 0,
    toPay: 0,
    saving: 0,
  };
}

export function buildBulkBill(
  lines: BulkCartLine[],
  orgInfo: BulkOrgInfo | null,
  category: BulkCategory,
  charges: BulkBillCharges = DEFAULT_BULK_CHARGES,
  couponDiscount = 0,
  cashbackUsed = 0,
  moneyWalletUsed = 0,
): BulkBill {
  const totalQty = lines.reduce((sum, l) => sum + l.count, 0);
  const subTotal = round2(lines.reduce((sum, l) => sum + l.itemPrice * l.count, 0));

  if (!orgInfo || totalQty === 0) {
    const toPay = Math.max(0, round2(subTotal - couponDiscount));
    return { ...emptyBulkBill(), subTotal, discount: couponDiscount, toPay, saving: couponDiscount };
  }

  const delivery = deliveryChargeFor(totalQty, orgInfo, category);
  const packaging = orgInfo.packagingCharges || 0;
  const platform = orgInfo.platformCharges || 0;

  const deliveryGst = round2((delivery * charges.deliveryGstPercent) / 100);
  const packagingGst = round2((packaging * charges.packagingGstPercent) / 100);
  const platformGst = round2((platform * charges.platformGstPercent) / 100);
  const itemGst = round2(((subTotal - couponDiscount) * charges.itemGstPercent) / 100);
  const taxes = round2(deliveryGst + packagingGst + platformGst + itemGst);

  const grossToPay = round2(subTotal - couponDiscount + delivery + packaging + platform + taxes);
  const cashback = round2(Math.max(0, Math.min(cashbackUsed, grossToPay)));
  const afterCashback = round2(grossToPay - cashback);
  const moneyWallet = round2(Math.max(0, Math.min(moneyWalletUsed, afterCashback)));
  const toPay = round2(afterCashback - moneyWallet);
  const saving = round2(couponDiscount + cashback + moneyWallet);

  return {
    totalQty,
    subTotal,
    delivery,
    packaging,
    platform,
    taxes,
    discount: couponDiscount,
    cashbackUsed: cashback,
    moneyWalletUsed: moneyWallet,
    toPay,
    saving,
  };
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/bulk/bill.ts
git commit -m "feat(bulk): add bulk bill computation (slab delivery charge + layered GST)"
```

---

### Task 6: Bulk cart store

**Files:**
- Create: `src/features/bulk/useBulkCartStore.ts`
- Modify: `src/store/index.ts`

- [ ] **Step 1: Write the store**

```ts
import { create } from 'zustand';

import { STORAGE_KEYS } from '@/config';
import { kvStorage } from '@/services/storage/kvStore';

import { deliveryDateCountFor, isBelowMoq, unitPriceFor } from './pricing';
import type { AppliedCoupon } from '../cart/types';
import type { BulkCartLine, BulkCategory, BulkMenuItem, BulkOrgInfo } from './types';

export interface BulkCart {
  category: BulkCategory | null;
  orgInfo: BulkOrgInfo | null;
  lines: BulkCartLine[];
  coupon: AppliedCoupon | null;
}

const EMPTY_BULK_CART: BulkCart = { category: null, orgInfo: null, lines: [], coupon: null };

interface BulkCartState {
  cart: BulkCart;
  hydrate: () => void;
  /** Set an item's quantity (0 removes the line). Below-MOQ counts reset to 0, matching MealaweUserApp. */
  setCount: (item: BulkMenuItem, category: BulkCategory, orgInfo: BulkOrgInfo, count: number) => void;
  applyCoupon: (coupon: AppliedCoupon) => void;
  clearCoupon: () => void;
  reset: () => void;
}

function readCart(): BulkCart {
  try {
    return kvStorage.getObject<BulkCart>(STORAGE_KEYS.bulkCart) ?? EMPTY_BULK_CART;
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
 * single-category: switching category clears any existing lines.
 */
export const useBulkCartStore = create<BulkCartState>((set, get) => ({
  cart: EMPTY_BULK_CART,

  hydrate: () => set({ cart: readCart() }),

  setCount: (item, category, orgInfo, count) => {
    const current = get().cart;
    const lines = current.category && current.category !== category ? [] : current.lines;
    const resolvedCount = isBelowMoq(count, orgInfo) ? 0 : count;
    const withoutItem = lines.filter((l) => l.item._id !== item._id);

    const nextLines: BulkCartLine[] =
      resolvedCount <= 0
        ? withoutItem
        : [
            ...withoutItem,
            {
              item,
              count: resolvedCount,
              itemPrice: unitPriceFor(item, resolvedCount, orgInfo, category),
              deliveryDateCount: deliveryDateCountFor(resolvedCount, orgInfo, category),
            },
          ];

    const cart: BulkCart = { category, orgInfo, lines: nextLines, coupon: current.coupon };
    writeCart(cart);
    set({ cart });
  },

  applyCoupon: (coupon) => {
    const cart: BulkCart = { ...get().cart, coupon };
    writeCart(cart);
    set({ cart });
  },

  clearCoupon: () => {
    const cart: BulkCart = { ...get().cart, coupon: null };
    writeCart(cart);
    set({ cart });
  },

  reset: () => {
    writeCart(EMPTY_BULK_CART);
    set({ cart: EMPTY_BULK_CART });
  },
}));
```

- [ ] **Step 2: Hydrate on startup**

In `src/store/index.ts`, add the import and hydrate call, and export the store:

```ts
import { useBulkCartStore } from '@/features/bulk/useBulkCartStore';
```

```ts
  // Restore any in-progress cart.
  useCartStore.getState().hydrate();
  useBulkCartStore.getState().hydrate();
```

```ts
export { useBulkCartStore } from '@/features/bulk/useBulkCartStore';
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/bulk/useBulkCartStore.ts src/store/index.ts
git commit -m "feat(bulk): add bulk cart Zustand store"
```

---

### Task 7: QuantityStepper shared UI primitive

**Files:**
- Create: `src/components/ui/QuantityStepper.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { Pressable, View } from 'react-native';

import { palette } from '@/theme';

import { AppText } from './AppText';
import { IconMinus, IconPlus } from './icons';

interface QuantityStepperProps {
  count: number;
  onIncrease: () => void;
  onDecrease: () => void;
  disabled?: boolean;
  /** Override the default a11y labels — pass an item name so screen-reader
   * users can tell rows apart in a list (e.g. "Decrease Paneer Butter Masala quantity"). */
  decreaseLabel?: string;
  increaseLabel?: string;
}

/** `-`/count/`+` stepper, ≥44×44 touch targets. Used by the Bulk menu/cart item rows. */
export function QuantityStepper({
  count,
  onIncrease,
  onDecrease,
  disabled = false,
  decreaseLabel = 'Decrease quantity',
  increaseLabel = 'Increase quantity',
}: QuantityStepperProps) {
  const canDecrease = !disabled && count > 0;
  return (
    <View
      className="flex-row items-center rounded-full border border-border"
      style={{ opacity: disabled ? 0.5 : 1 }}>
      <Pressable
        onPress={onDecrease}
        disabled={!canDecrease}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 0 }}
        accessibilityRole="button"
        accessibilityLabel={decreaseLabel}
        accessibilityState={{ disabled: !canDecrease }}
        className="h-11 w-11 items-center justify-center active:opacity-60">
        <IconMinus size={16} color={canDecrease ? palette.brand.teal : palette.neutral.gray400} />
      </Pressable>
      <AppText
        variant="label"
        className="text-foreground"
        style={{ minWidth: 24, textAlign: 'center' }}
        accessibilityLabel={`Quantity: ${count}`}>
        {count}
      </AppText>
      <Pressable
        onPress={onIncrease}
        disabled={disabled}
        hitSlop={{ top: 8, bottom: 8, left: 0, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={increaseLabel}
        accessibilityState={{ disabled }}
        className="h-11 w-11 items-center justify-center active:opacity-60">
        <IconPlus size={16} color={disabled ? palette.neutral.gray400 : palette.brand.green} />
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/QuantityStepper.tsx
git commit -m "feat(ui): add QuantityStepper primitive for bulk item quantities"
```

---

### Task 8: Bulk feature components

**Files:**
- Create: `src/features/bulk/components/BulkMenuItemCard.tsx`
- Create: `src/features/bulk/components/BulkCartFooter.tsx`
- Create: `src/features/bulk/components/BulkCategoryTile.tsx`
- Create: `src/features/bulk/index.ts`

- [ ] **Step 1: Write BulkMenuItemCard.tsx**

```tsx
import { Image } from 'expo-image';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { DietMark } from '@/components/ui/DietMark';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { accentTint, palette, shadow } from '@/theme';

import type { BulkMenuItem } from '../types';

interface BulkMenuItemCardProps {
  item: BulkMenuItem;
  count: number;
  unitPrice: number;
  belowMoq: boolean;
  moq: number;
  onIncrease: () => void;
  onDecrease: () => void;
}

export function BulkMenuItemCard({
  item,
  count,
  unitPrice,
  belowMoq,
  moq,
  onIncrease,
  onDecrease,
}: BulkMenuItemCardProps) {
  return (
    <View style={shadow.card} className="flex-row gap-3 rounded-2xl border border-border bg-card p-3">
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: accentTint(palette.accent.food, 0.14),
        }}>
        {item.itemImage ? (
          <Image source={{ uri: item.itemImage }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : null}
      </View>
      <View className="flex-1 justify-between">
        <View className="flex-row items-start gap-2">
          <View className="mt-1">
            <DietMark veg={item.isVeg} size={14} />
          </View>
          <AppText variant="label" className="flex-1 text-foreground">
            {item.itemName}
          </AppText>
        </View>
        <View className="flex-row items-center justify-between">
          <AppText variant="body" className="text-foreground">
            ₹{unitPrice}/unit
          </AppText>
          <QuantityStepper
            count={count}
            onIncrease={onIncrease}
            onDecrease={onDecrease}
            decreaseLabel={`Decrease ${item.itemName} quantity`}
            increaseLabel={`Increase ${item.itemName} quantity`}
          />
        </View>
        {belowMoq ? (
          <AppText variant="caption" className="text-danger">
            Minimum order quantity is {moq}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Write BulkCartFooter.tsx**

```tsx
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { IconCart } from '@/components/ui/icons';
import { palette } from '@/theme';

interface BulkCartFooterProps {
  itemCount: number;
  subTotal: number;
  onPress: () => void;
}

/** Sticky "N items · ₹total · View cart" bar shown once the bulk menu cart is non-empty. */
export function BulkCartFooter({ itemCount, subTotal, onPress }: BulkCartFooterProps) {
  const insets = useSafeAreaInsets();
  if (itemCount === 0) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="absolute inset-x-4 flex-row items-center justify-between rounded-2xl bg-primary px-5 py-4 active:opacity-90"
      style={{
        bottom: 16 + insets.bottom,
        shadowColor: palette.brand.green,
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      }}>
      <View className="flex-row items-center gap-2">
        <IconCart size={18} color="#fff" />
        <AppText variant="label" className="text-white">
          {itemCount} item{itemCount > 1 ? 's' : ''} · ₹{subTotal}
        </AppText>
      </View>
      <AppText variant="label" className="text-white">
        View cart →
      </AppText>
    </Pressable>
  );
}
```

- [ ] **Step 3: Write BulkCategoryTile.tsx**

```tsx
import type { ComponentType } from 'react';
import { Pressable } from 'react-native';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { IconGift, IconOffer, IconUtensils, type IconProps } from '@/components/ui/icons';
import { shadow, type AccentTone } from '@/theme';

import type { BulkCategory } from '../types';

const TILE: Record<BulkCategory, { label: string; icon: ComponentType<IconProps>; tone: AccentTone }> = {
  meals: { label: 'Bulk Meals', icon: IconUtensils, tone: 'food' },
  snacks: { label: 'Bulk Snacks', icon: IconGift, tone: 'reward' },
  foodbox: { label: 'Food Box', icon: IconOffer, tone: 'offer' },
};

interface BulkCategoryTileProps {
  category: BulkCategory;
  onPress: () => void;
}

export function BulkCategoryTile({ category, onPress }: BulkCategoryTileProps) {
  const { label, icon, tone } = TILE[category];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={shadow.card}
      className="flex-1 items-center gap-2 rounded-2xl border border-border bg-card p-4 active:opacity-80">
      <AccentIcon icon={icon} tone={tone} size={22} tileSize={48} />
      <AppText variant="label" className="text-foreground">
        {label}
      </AppText>
    </Pressable>
  );
}
```

- [ ] **Step 4: Write the barrel export**

```ts
export type {
  BulkCategory,
  BulkPackaging,
  BulkOrgInfo,
  BulkMenuItem,
  BulkMenuResponse,
  BulkCartLine,
} from './types';
export { loadBulkMenu, saveBulkFoodOrder } from './api';
export { isBelowMoq, unitPriceFor, deliveryDateCountFor } from './pricing';
export { minDeliveryDate, slotsFor, formatShort, type DeliverySlot } from './schedule';
export { buildBulkBill, emptyBulkBill, DEFAULT_BULK_CHARGES, type BulkBill, type BulkBillCharges } from './bill';
export { useBulkCartStore, type BulkCart } from './useBulkCartStore';
export { BulkMenuItemCard } from './components/BulkMenuItemCard';
export { BulkCartFooter } from './components/BulkCartFooter';
export { BulkCategoryTile } from './components/BulkCategoryTile';
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/bulk/components src/features/bulk/index.ts
git commit -m "feat(bulk): add BulkMenuItemCard, BulkCartFooter, BulkCategoryTile"
```

---

### Task 9: Wire the Home "Bulk" tab

**Files:**
- Modify: `src/app/(tabs)/index.tsx`

- [ ] **Step 1: Replace the generic placeholder for the `bulk` tab**

The current stub (added when `activeTab !== 'subscription'`) renders the same "feed lands here" text for `bulk`/`dinein`/`more`. Branch it so `bulk` gets the category tiles, keeping the existing placeholder for the other two:

```tsx
import { BulkCategoryTile } from '@/features/bulk';
```

Replace:

```tsx
        {activeTab === 'subscription' ? (
          <SubscriptionHome vegOnly={vegOnly} scrollY={scrollY} topInset={collapseDistance} />
        ) : (
          <View className="flex-1 px-5" style={{ paddingTop: collapseDistance + 24 }}>
            <AppText variant="h3" className="text-foreground">
              Hi {profile?.userName ?? 'there'} 👋
            </AppText>
            <AppText variant="body" className="mt-1 text-muted-foreground">
              The {activeTab} feed lands here as the migration continues.
              {vegOnly ? ' Showing veg-only.' : ''}
            </AppText>

            <View className="mt-auto pb-6">
              <Pressable
                onPress={logout}
                className="items-center rounded-2xl border border-border py-3 active:opacity-80">
                <AppText variant="label" className="text-danger">
                  Log out
                </AppText>
              </Pressable>
            </View>
          </View>
        )}
```

with:

```tsx
        {activeTab === 'subscription' ? (
          <SubscriptionHome vegOnly={vegOnly} scrollY={scrollY} topInset={collapseDistance} />
        ) : activeTab === 'bulk' ? (
          <View className="flex-1 px-5" style={{ paddingTop: collapseDistance + 24 }}>
            <AppText variant="h3" className="text-foreground">
              Order in bulk
            </AppText>
            <AppText variant="body" className="mt-1 text-muted-foreground">
              For events, offices, and get-togethers — pick a category to start.
            </AppText>
            <View className="mt-4 flex-row gap-3">
              <BulkCategoryTile
                category="meals"
                onPress={() => router.push({ pathname: '/bulk-menu', params: { category: 'meals' } })}
              />
              <BulkCategoryTile
                category="snacks"
                onPress={() => router.push({ pathname: '/bulk-menu', params: { category: 'snacks' } })}
              />
              <BulkCategoryTile
                category="foodbox"
                onPress={() => router.push({ pathname: '/bulk-menu', params: { category: 'foodbox' } })}
              />
            </View>
          </View>
        ) : (
          <View className="flex-1 px-5" style={{ paddingTop: collapseDistance + 24 }}>
            <AppText variant="h3" className="text-foreground">
              Hi {profile?.userName ?? 'there'} 👋
            </AppText>
            <AppText variant="body" className="mt-1 text-muted-foreground">
              The {activeTab} feed lands here as the migration continues.
              {vegOnly ? ' Showing veg-only.' : ''}
            </AppText>

            <View className="mt-auto pb-6">
              <Pressable
                onPress={logout}
                className="items-center rounded-2xl border border-border py-3 active:opacity-80">
                <AppText variant="label" className="text-danger">
                  Log out
                </AppText>
              </Pressable>
            </View>
          </View>
        )}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(tabs)/index.tsx"
git commit -m "feat(bulk): wire Home Bulk tab to the 3 category tiles"
```

---

### Task 10: Bulk menu screen

**Files:**
- Create: `src/app/bulk-menu.tsx`

- [ ] **Step 1: Write the route**

```tsx
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import {
  BulkCartFooter,
  BulkMenuItemCard,
  isBelowMoq,
  loadBulkMenu,
  unitPriceFor,
  useBulkCartStore,
  type BulkCategory,
  type BulkMenuResponse,
  type BulkPackaging,
} from '@/features/bulk';

const CATEGORY_TITLE: Record<BulkCategory, string> = {
  meals: 'Bulk Meals',
  snacks: 'Bulk Snacks',
  foodbox: 'Food Box',
};

const VALID_CATEGORIES: BulkCategory[] = ['meals', 'snacks', 'foodbox'];

export default function BulkMenuScreen() {
  const router = useRouter();
  const { category: categoryParam } = useLocalSearchParams<{ category?: string }>();
  const category: BulkCategory = VALID_CATEGORIES.includes(categoryParam as BulkCategory)
    ? (categoryParam as BulkCategory)
    : 'meals';

  const cart = useBulkCartStore((s) => s.cart);
  const setCount = useBulkCartStore((s) => s.setCount);

  const [packaging, setPackaging] = useState<BulkPackaging>('individual');
  const [vegOnly, setVegOnly] = useState(false);
  const [menu, setMenu] = useState<BulkMenuResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Reset filters when navigating to a different category so each category
  // starts from the same default view.
  useEffect(() => {
    setPackaging('individual');
    setVegOnly(false);
  }, [category]);

  const fetchMenu = (): (() => void) => {
    let cancelled = false;
    setLoading(true);
    loadBulkMenu(category, packaging).then((res) => {
      if (!cancelled) {
        setMenu(res);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  };

  useEffect(fetchMenu, [category, packaging]);

  const items = useMemo(() => {
    const list = menu?.itemList ?? [];
    return vegOnly ? list.filter((i) => i.isVeg) : list;
  }, [menu, vegOnly]);

  const countFor = (itemId: string): number => cart.lines.find((l) => l.item._id === itemId)?.count ?? 0;

  const change = (itemId: string, delta: number): void => {
    if (!menu) return;
    const item = menu.itemList.find((i) => i._id === itemId);
    if (!item) return;
    setCount(item, category, menu, Math.max(0, countFor(itemId) + delta));
  };

  const itemCount = cart.lines.reduce((sum, l) => sum + l.count, 0);
  const subTotal = cart.lines.reduce((sum, l) => sum + l.itemPrice * l.count, 0);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: CATEGORY_TITLE[category] }} />
      <StatusBar style="auto" />

      <View className="flex-row items-center gap-2 px-4 pt-3">
        <Button
          label="Individual"
          variant={packaging === 'individual' ? 'primary' : 'outline'}
          size="sm"
          onPress={() => setPackaging('individual')}
        />
        <Button
          label="Bulk"
          variant={packaging === 'bulk' ? 'primary' : 'outline'}
          size="sm"
          onPress={() => setPackaging('bulk')}
        />
        <View className="flex-1" />
        <Button
          label={vegOnly ? 'Veg only ✓' : 'Veg only'}
          variant={vegOnly ? 'primary' : 'outline'}
          size="sm"
          onPress={() => setVegOnly((v) => !v)}
        />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <AppText variant="body" className="text-muted-foreground">
            Loading menu…
          </AppText>
        </View>
      ) : !menu ? (
        <View className="flex-1 items-center justify-center px-10">
          <AppText variant="title" className="text-center text-foreground">
            Couldn't load the menu
          </AppText>
          <AppText variant="bodySm" className="mt-1 text-center text-muted-foreground">
            Check your connection and try again.
          </AppText>
          <View style={{ marginTop: 16 }}>
            <Button label="Retry" variant="outline" onPress={fetchMenu} />
          </View>
        </View>
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10">
          <AppText variant="title" className="text-center text-foreground">
            Nothing here yet
          </AppText>
          <AppText variant="bodySm" className="mt-1 text-center text-muted-foreground">
            Try the other packaging option or check back later.
          </AppText>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i._id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 96 }}
          renderItem={({ item }) => {
            const count = countFor(item._id);
            return (
              <BulkMenuItemCard
                item={item}
                count={count}
                unitPrice={menu ? unitPriceFor(item, Math.max(count, 1), menu, category) : item.itemPrice}
                belowMoq={menu ? isBelowMoq(count, menu) : false}
                moq={menu?.moq ?? 1}
                onIncrease={() => change(item._id, 1)}
                onDecrease={() => change(item._id, -1)}
              />
            );
          }}
        />
      )}

      <BulkCartFooter itemCount={itemCount} subTotal={subTotal} onPress={() => router.push('/bulk-cart' as Href)} />
    </View>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual check**

Run: `npm run android:local` (or your usual dev command), navigate Home → Bulk tab → tap each of the 3 tiles.
Expected: each opens `bulk-menu` with the right title; Individual/Bulk toggle and Veg only filter both work; tapping `+` on an item increments its stepper and the sticky footer appears once any item has count > 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/bulk-menu.tsx
git commit -m "feat(bulk): add bulk-menu screen (packaging toggle, veg filter, quantity steppers)"
```

---

### Task 11: Bulk cart / checkout screen

**Files:**
- Create: `src/app/bulk-cart.tsx`

- [ ] **Step 1: Write the route**

```tsx
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import {
  buildBulkBill,
  formatShort,
  isBelowMoq,
  minDeliveryDate,
  slotsFor,
  useBulkCartStore,
  type DeliverySlot,
} from '@/features/bulk';
import { useBalances } from '@/features/wallet';
import { shadow, useColors } from '@/theme';

function nextDates(minDate: string, count = 7): string[] {
  const dates: string[] = [];
  const start = new Date(minDate);
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export default function BulkCartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const cart = useBulkCartStore((s) => s.cart);
  const setCount = useBulkCartStore((s) => s.setCount);
  const { wallet, cashback, refresh } = useBalances();

  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<DeliverySlot | null>(null);
  const [useWallet, setUseWallet] = useState(false);
  const [useCashback, setUseCashback] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const minDate = useMemo(() => minDeliveryDate(cart.lines), [cart.lines]);
  const dateOptions = useMemo(() => nextDates(minDate), [minDate]);
  const slots = useMemo(() => slotsFor(), []);

  // A quantity change can push the minimum delivery date later (crossing a
  // slab boundary) — drop a previously-selected date that's no longer offered.
  useEffect(() => {
    if (date && !dateOptions.includes(date)) {
      setDate(null);
    }
  }, [date, dateOptions]);

  const walletBalance = Number.parseFloat(wallet) || 0;
  const cashbackBalance = cashback || 0;

  const bill = useMemo(
    () =>
      buildBulkBill(
        cart.lines,
        cart.orgInfo,
        cart.category ?? 'meals',
        undefined,
        0,
        useCashback ? cashbackBalance : 0,
        useWallet ? walletBalance : 0,
      ),
    [cart, useCashback, useWallet, cashbackBalance, walletBalance],
  );

  const change = (lineItemId: string, delta: number): void => {
    const line = cart.lines.find((l) => l.item._id === lineItemId);
    if (!line || !cart.orgInfo || !cart.category) return;
    setCount(line.item, cart.category, cart.orgInfo, Math.max(0, line.count + delta));
  };

  if (cart.lines.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ headerShown: true, title: 'Bulk cart' }} />
        <StatusBar style="auto" />
        <View className="flex-1 items-center justify-center px-10">
          <AppText variant="title" className="text-foreground">
            Your bulk cart is empty
          </AppText>
          <View style={{ marginTop: 16 }}>
            <Button label="Browse bulk menu" onPress={() => router.replace('/(tabs)')} />
          </View>
        </View>
      </View>
    );
  }

  const canCheckout = !!date && !!slot;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Bulk cart' }} />
      <StatusBar style="auto" />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24, gap: 14 }}>
        {cart.lines.map((line) => {
          const belowMoq = cart.orgInfo ? isBelowMoq(line.count, cart.orgInfo) : false;
          return (
            <View key={line.item._id} style={shadow.card} className="rounded-2xl border border-border bg-card p-3">
              <View className="flex-row items-center justify-between">
                <AppText variant="label" className="flex-1 text-foreground">
                  {line.item.itemName}
                </AppText>
                <QuantityStepper
                  count={line.count}
                  onIncrease={() => change(line.item._id, 1)}
                  onDecrease={() => change(line.item._id, -1)}
                  decreaseLabel={`Decrease ${line.item.itemName} quantity`}
                  increaseLabel={`Increase ${line.item.itemName} quantity`}
                />
              </View>
              <AppText variant="bodySm" className="mt-1 text-muted-foreground">
                ₹{line.itemPrice}/unit · ₹{line.itemPrice * line.count}
              </AppText>
              {belowMoq ? (
                <AppText variant="caption" className="text-danger">
                  Minimum order quantity is {cart.orgInfo?.moq}
                </AppText>
              ) : null}
            </View>
          );
        })}

        <View className="rounded-2xl border border-border bg-card p-4" style={[shadow.card, { gap: 10 }]}>
          <AppText variant="overline" className="text-muted-foreground">
            DELIVERY DATE
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {dateOptions.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setDate(d)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: date === d }}
                  className={`rounded-xl border px-3 py-2 ${date === d ? 'border-primary bg-primary' : 'border-border'}`}>
                  <AppText variant="bodySm" className={date === d ? 'text-white' : 'text-foreground'}>
                    {formatShort(d)}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <AppText variant="overline" className="text-muted-foreground" style={{ marginTop: 8 }}>
            DELIVERY SLOT
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {slots.map((s) => (
                <Pressable
                  key={s.start}
                  onPress={() => setSlot(s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: slot?.start === s.start }}
                  className={`rounded-xl border px-3 py-2 ${slot?.start === s.start ? 'border-primary bg-primary' : 'border-border'}`}>
                  <AppText variant="bodySm" className={slot?.start === s.start ? 'text-white' : 'text-foreground'}>
                    {s.start}–{s.end}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {walletBalance > 0 || cashbackBalance > 0 ? (
          <View className="rounded-2xl border border-border bg-card" style={[shadow.card, { overflow: 'hidden' }]}>
            {walletBalance > 0 ? (
              <RedeemRow
                title="Use Mealawe Wallet"
                sub={useWallet && bill.moneyWalletUsed > 0 ? `Saving ₹${bill.moneyWalletUsed}` : `₹${wallet} available`}
                on={useWallet}
                onToggle={() => setUseWallet((v) => !v)}
                divider={cashbackBalance > 0}
              />
            ) : null}
            {cashbackBalance > 0 ? (
              <RedeemRow
                title="Redeem Cashback"
                sub={useCashback && bill.cashbackUsed > 0 ? `Saving ₹${bill.cashbackUsed}` : `₹${cashbackBalance} available`}
                on={useCashback}
                onToggle={() => setUseCashback((v) => !v)}
              />
            ) : null}
          </View>
        ) : null}

        <View className="rounded-2xl border border-border bg-card p-4" style={[shadow.card, { gap: 8 }]}>
          <AppText variant="overline" className="text-muted-foreground">
            BILL
          </AppText>
          <BillRow label={`Items (${bill.totalQty})`} amount={bill.subTotal} />
          <BillRow label="Delivery" amount={bill.delivery} />
          <BillRow label="Packaging" amount={bill.packaging} />
          <BillRow label="Platform fee" amount={bill.platform} />
          <BillRow label="Taxes" amount={bill.taxes} />
          {bill.moneyWalletUsed > 0 ? <BillRow label="Mealawe Wallet" amount={-bill.moneyWalletUsed} /> : null}
          {bill.cashbackUsed > 0 ? <BillRow label="Cashback" amount={-bill.cashbackUsed} /> : null}
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />
          <View className="flex-row items-center justify-between">
            <AppText variant="label" className="text-foreground">
              To pay
            </AppText>
            <AppText variant="label" className="text-foreground">
              ₹{bill.toPay}
            </AppText>
          </View>
        </View>
      </ScrollView>

      <View
        className="flex-row items-center justify-between border-t border-border bg-card px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}>
        <View>
          <AppText variant="h3" className="text-foreground">
            ₹{bill.toPay}
          </AppText>
          {!canCheckout ? (
            <AppText variant="caption" className="text-danger">
              Pick a delivery date and slot
            </AppText>
          ) : null}
        </View>
        <Button
          label="Proceed to Pay →"
          size="lg"
          disabled={!canCheckout}
          onPress={() => Alert.alert('Payment', 'Payment (JusPay / Paytm) is the next phase — cart is ready.')}
        />
      </View>
    </View>
  );
}

function RedeemRow({
  title,
  sub,
  on,
  onToggle,
  divider,
}: {
  title: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
  divider?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      className="flex-row items-center justify-between px-4 py-3.5 active:opacity-80"
      style={divider ? { borderBottomWidth: 1, borderBottomColor: colors.border } : undefined}>
      <View className="flex-1">
        <AppText variant="label" className="text-foreground">
          {title}
        </AppText>
        <AppText variant="caption" className="text-muted-foreground">
          {sub}
        </AppText>
      </View>
      <View
        style={{
          height: 26,
          width: 44,
          borderRadius: 13,
          padding: 3,
          justifyContent: 'center',
          alignItems: on ? 'flex-end' : 'flex-start',
          backgroundColor: on ? colors.primary : colors.border,
        }}>
        <View style={{ height: 20, width: 20, borderRadius: 10, backgroundColor: '#fff' }} />
      </View>
    </Pressable>
  );
}

function BillRow({ label, amount }: { label: string; amount: number }) {
  return (
    <View className="flex-row items-center justify-between">
      <AppText variant="body" className="text-muted-foreground">
        {label}
      </AppText>
      <AppText variant="body" className="text-foreground">
        {amount < 0 ? '- ' : ''}₹{Math.abs(amount)}
      </AppText>
    </View>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual check**

Add a few items in `bulk-menu`, open the cart. Confirm: quantity steppers update the bill live; dropping an item below MOQ shows the inline error and (per store logic) resets it out of the cart on the next decrement; picking a bigger quantity that crosses a slab boundary shifts `minDeliveryDate` later (compare the earliest selectable date before/after); "Proceed to Pay" stays disabled until both a date and slot are picked, then shows the placeholder alert.

- [ ] **Step 4: Commit**

```bash
git add src/app/bulk-cart.tsx
git commit -m "feat(bulk): add bulk cart/checkout screen"
```

---

### Task 12: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Bundle check**

Run: `npx expo export --platform android -c`
Expected: exports successfully (this project's substitute for a test suite — see `CLAUDE.md`).

- [ ] **Step 3: Manual walkthrough (from the spec)**

On-device: Home → Bulk tile → menu (switch packaging/veg filter, adjust quantities past a slab boundary and below MOQ) → cart (confirm delivery date shifts with quantity, bill breakdown math, wallet/cashback toggles) → Proceed to Pay placeholder. Repeat for all 3 categories (Meals/Snacks/Food Box) to confirm each hits the right endpoint and displays correctly.

- [ ] **Step 4: Final commit (if anything was fixed during verification)**

```bash
git add -A
git commit -m "fix(bulk): address issues found during verification pass"
```
(Skip this step if verification found nothing to fix.)

---

## Addendum: findings from the Task 12 holistic review

A final cross-file review (after all 11 tasks landed) found integration-level issues that per-task review couldn't see, plus two scope gaps. The user decided: fix the integration bugs (Task 13), build real coupon support now rather than defer it (Task 14), and wire cluster config for bulk GST rates + delivery slot window now rather than defer it (Task 15). Task 16 re-runs the full verification pass after all three land.

### Task 13: Fix cross-file integration bugs

**Files:**
- Modify: `src/features/bulk/useBulkCartStore.ts`
- Modify: `src/app/bulk-menu.tsx`
- Modify: `src/app/bulk-cart.tsx`

Four bugs found by the holistic review:
1. `setCount` re-orders a line to the bottom of the cart on every quantity change (filter-then-append instead of update-in-place) — a line visibly jumps out from under the user's finger.
2. The entire `BulkMenuResponse` (org config **+ full item list**) gets persisted as `cart.orgInfo` on every stepper tap, because `bulk-menu.tsx` passes `menu` (which structurally satisfies `BulkOrgInfo` via `extends`) straight through — bloating MMKV storage with a full menu snapshot on every tap.
3. `bulk-menu.tsx`'s sticky footer (`itemCount`/`subTotal`) reads from the ENTIRE cart regardless of which category is currently being browsed — switching from a cart full of Bulk Meals to the Snacks menu shows a stale "3 items · ₹900" footer for a screen with zero snack items selected.
4. Packaging (individual vs. bulk) isn't part of the cart's identity — only category is. Adding an Individual item, then switching to Bulk packaging and adding a Bulk item, lets both lines coexist in the cart even though they were priced against two different `orgInfo` configs — the bill ends up computed against whichever config was fetched last.

- [ ] **Step 1: Rewrite `useBulkCartStore.ts`** to track `packaging` as part of cart identity and to preserve line order on update

```ts
import { create } from 'zustand';

import { STORAGE_KEYS } from '@/config';
import { kvStorage } from '@/services/storage/kvStore';

import { deliveryDateCountFor, isBelowMoq, unitPriceFor } from './pricing';
import type { AppliedCoupon } from '../cart/types';
import type { BulkCartLine, BulkCategory, BulkMenuItem, BulkOrgInfo, BulkPackaging } from './types';

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

export const useBulkCartStore = create<BulkCartState>((set, get) => ({
  cart: EMPTY_BULK_CART,

  hydrate: () => set({ cart: readCart() }),

  setCount: (item, category, packaging, orgInfo, count) => {
    const current = get().cart;
    const sameContext = current.category === category && current.packaging === packaging;
    const lines = sameContext ? current.lines : [];
    const resolvedCount = isBelowMoq(count, orgInfo) ? 0 : count;

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
  },

  applyCoupon: (coupon) => {
    const cart: BulkCart = { ...get().cart, coupon };
    writeCart(cart);
    set({ cart });
  },

  clearCoupon: () => {
    const cart: BulkCart = { ...get().cart, coupon: null };
    writeCart(cart);
    set({ cart });
  },

  reset: () => {
    writeCart(EMPTY_BULK_CART);
    set({ cart: EMPTY_BULK_CART });
  },
}));
```

- [ ] **Step 2: Update `bulk-menu.tsx`'s `change()` and footer totals**

Replace:
```tsx
  const countFor = (itemId: string): number => cart.lines.find((l) => l.item._id === itemId)?.count ?? 0;

  const change = (itemId: string, delta: number): void => {
    if (!menu) return;
    const item = menu.itemList.find((i) => i._id === itemId);
    if (!item) return;
    setCount(item, category, menu, Math.max(0, countFor(itemId) + delta));
  };

  const itemCount = cart.lines.reduce((sum, l) => sum + l.count, 0);
  const subTotal = cart.lines.reduce((sum, l) => sum + l.itemPrice * l.count, 0);
```
with:
```tsx
  // Only reflect the cart when it actually belongs to the category+packaging
  // currently on screen — otherwise a cart from a different combo would leak
  // into this screen's stepper counts and sticky footer.
  const cartMatchesView = cart.category === category && cart.packaging === packaging;

  const countFor = (itemId: string): number =>
    cartMatchesView ? (cart.lines.find((l) => l.item._id === itemId)?.count ?? 0) : 0;

  const change = (itemId: string, delta: number): void => {
    if (!menu) return;
    const item = menu.itemList.find((i) => i._id === itemId);
    if (!item) return;
    // Strip itemList before persisting — only the org config belongs in the
    // cart, not a full snapshot of the menu's items.
    const { itemList: _itemList, ...orgInfo } = menu;
    setCount(item, category, packaging, orgInfo, Math.max(0, countFor(itemId) + delta));
  };

  const itemCount = cartMatchesView ? cart.lines.reduce((sum, l) => sum + l.count, 0) : 0;
  const subTotal = cartMatchesView ? cart.lines.reduce((sum, l) => sum + l.itemPrice * l.count, 0) : 0;
```

- [ ] **Step 3: Update `bulk-cart.tsx`'s `change()`**

Replace:
```tsx
  const change = (lineItemId: string, delta: number): void => {
    const line = cart.lines.find((l) => l.item._id === lineItemId);
    if (!line || !cart.orgInfo || !cart.category) return;
    setCount(line.item, cart.category, cart.orgInfo, Math.max(0, line.count + delta));
  };
```
with:
```tsx
  const change = (lineItemId: string, delta: number): void => {
    const line = cart.lines.find((l) => l.item._id === lineItemId);
    if (!line || !cart.orgInfo || !cart.category || !cart.packaging) return;
    setCount(line.item, cart.category, cart.packaging, cart.orgInfo, Math.max(0, line.count + delta));
  };
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual check**

Add an item to Bulk Meals, note its position; increase a different item's quantity; confirm the first item stays in place (doesn't jump). Add items in Meals, navigate to the Snacks menu — confirm the sticky footer reads "0 items" (not the Meals count). Add an Individual-packaging item, switch to Bulk packaging on the same category, add a Bulk item — confirm only one line remains (the cart cleared on the packaging switch, matching the category-switch behavior).

- [ ] **Step 6: Commit**

```bash
git add src/features/bulk/useBulkCartStore.ts src/app/bulk-menu.tsx src/app/bulk-cart.tsx
git commit -m "fix(bulk): make packaging part of cart identity, preserve line order, fix cross-context leaks"
```

---

### Task 14: Wire real coupon support into the bulk cart

The design spec called for reusing `CouponSheet`/`SavingsBanner`/`CouponCelebration` (from `src/features/cart/components/`) in the bulk checkout, matching Subscription's `cart.tsx`. This didn't happen during initial implementation — `bulk-cart.tsx` hardcoded `couponDiscount = 0` and the store's already-built `applyCoupon`/`clearCoupon` actions were dead code.

Coupons turn out to be a single customer-wide concept, not order-type-specific data: `getValidClusterUserCouponList` (the same endpoint `loadSubscriptionCoupons` already calls) returns every coupon for the customer's clusters, each tagged with an `orderTypes` array (`['subscription']`, `['bulk']`, etc.) — filtering for `'bulk'` client-side is all that's needed. Because it's the exact same document shape, this task reuses the existing `SubscriptionCoupon` type and the existing `CouponSheet`/`discountFor` (both already generic over that shape) rather than inventing a parallel `BulkCoupon` type.

**Files:**
- Modify: `src/features/bulk/api.ts`
- Modify: `src/features/bulk/index.ts`
- Modify: `src/app/bulk-cart.tsx`

- [ ] **Step 1: Add `loadBulkCoupons` to `src/features/bulk/api.ts`**

Add this import at the top (alongside the existing ones):
```ts
import type { SubscriptionCoupon } from '@/features/subscription';
import { useAuthStore } from '@/store/authStore';
import { useClusterStore } from '@/store/clusterStore';
```

Add this function (mirrors `loadSubscriptionCoupons` in `src/features/subscription/api.ts` exactly, filtering `'bulk'` instead of `'subscription'`):
```ts
/**
 * Valid bulk-order coupons for the current cluster(s). Coupons are a single
 * customer-wide list (same endpoint as Subscription's `loadSubscriptionCoupons`)
 * tagged per order type — filtering for `'bulk'` here is all that differs.
 * Returns [] for guests / on error so callers can fall back.
 */
export async function loadBulkCoupons(): Promise<SubscriptionCoupon[]> {
  const clusters = useClusterStore.getState().clusterIds();
  if (clusters.length === 0) {
    return [];
  }
  const profileId = useAuthStore.getState().profile?._id ?? 'all';
  try {
    const list = await http.post<SubscriptionCoupon[]>(
      `${ENDPOINTS.subscription.validCoupons}/${profileId}`,
      { clusters },
    );
    if (!Array.isArray(list)) {
      return [];
    }
    return list
      .filter((c) => Array.isArray(c?.orderTypes) && c.orderTypes!.indexOf('bulk') > -1)
      .sort((a, b) => (b.seqWeightage || 0) - (a.seqWeightage || 0));
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Export it from the barrel**

In `src/features/bulk/index.ts`, change:
```ts
export { loadBulkMenu, saveBulkFoodOrder } from './api';
```
to:
```ts
export { loadBulkMenu, saveBulkFoodOrder, loadBulkCoupons } from './api';
```

- [ ] **Step 3: Wire coupon UI into `bulk-cart.tsx`**

Add these imports:
```tsx
import { useRef } from 'react'; // add to the existing `react` import line
import { TextInput } from 'react-native'; // add to the existing react-native import line
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { IconTicket } from '@/components/ui/icons';
import { CouponSheet, SavingsBanner, CouponCelebration, discountFor } from '@/features/cart';
import { loadBulkCoupons } from '@/features/bulk'; // add to the existing @/features/bulk import list
import type { SubscriptionCoupon } from '@/features/subscription';
import { palette, accentTint, FONT_FAMILY } from '@/theme'; // extend the existing @/theme import
```

Add coupon state + effects right after the existing `useState`/`useEffect` block (after `useEffect(() => { void refresh(); }, [refresh]);`):
```tsx
  const applyCoupon = useBulkCartStore((s) => s.applyCoupon);
  const clearCoupon = useBulkCartStore((s) => s.clearCoupon);

  const [coupons, setCoupons] = useState<SubscriptionCoupon[]>([]);
  const [code, setCode] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponPulse, setCouponPulse] = useState(0);
  const [celebrated, setCelebrated] = useState({ code: '', saving: 0 });
  const couponSheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    loadBulkCoupons().then(setCoupons).catch(() => setCoupons([]));
  }, []);
```

Change the `buildBulkBill` call's `couponDiscount` argument from the hardcoded `0` to the applied coupon's discount:
```tsx
  const bill = useMemo(
    () =>
      buildBulkBill(
        cart.lines,
        cart.orgInfo,
        cart.category ?? 'meals',
        undefined,
        cart.coupon?.discount ?? 0,
        useCashback ? cashbackBalance : 0,
        useWallet ? walletBalance : 0,
      ),
    [cart, useCashback, useWallet, cashbackBalance, walletBalance],
  );
```

Add the coupon apply/celebrate helpers (place them near `change()`):
```tsx
  const bestCoupon = useMemo(() => {
    let best: { coupon: SubscriptionCoupon; discount: number } | null = null;
    for (const c of coupons) {
      const { discount, reason } = discountFor(c, bill.subTotal);
      if (!reason && discount > (best?.discount ?? 0)) {
        best = { coupon: c, discount };
      }
    }
    return best;
  }, [coupons, bill.subTotal]);

  const celebrate = (couponCode: string, saving: number): void => {
    setCelebrated({ code: couponCode, saving });
    setCouponPulse((n) => n + 1);
  };

  const applyByCode = (): void => {
    const found = coupons.find((c) => (c.couponCode ?? '').toLowerCase() === code.trim().toLowerCase());
    if (!found) {
      setCouponError('Invalid or expired coupon');
      return;
    }
    const { discount, reason } = discountFor(found, bill.subTotal);
    if (reason) {
      setCouponError(reason);
      return;
    }
    setCouponError(null);
    const finalCode = found.couponCode ?? code;
    applyCoupon({ couponCode: finalCode, discount, couponHeader: found.couponHeader });
    celebrate(finalCode, discount);
  };

  const applyResolved = (c: SubscriptionCoupon, discount: number): void => {
    setCouponError(null);
    applyCoupon({ couponCode: c.couponCode ?? '', discount, couponHeader: c.couponHeader });
    couponSheetRef.current?.dismiss();
    celebrate(c.couponCode ?? '', discount);
  };
```

Add the savings banner right after the opening `<ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24, gap: 14 }}>` tag, before the `{cart.lines.map(...)}` block:
```tsx
        {bill.saving > 0 ? (
          <SavingsBanner
            saving={bill.saving}
            percent={
              bill.toPay + bill.saving > 0
                ? Math.round((bill.saving / (bill.toPay + bill.saving)) * 100)
                : 0
            }
          />
        ) : null}
```

Add the coupon card right after the delivery-date/slot card (`</View>` that closes the `DELIVERY DATE`/`DELIVERY SLOT` block) and before the wallet/cashback `View`:
```tsx
        <View style={shadow.card} className="rounded-2xl border border-border bg-card p-4">
          {cart.coupon ? (
            <View className="flex-row items-center gap-3">
              <AccentIcon icon={IconTicket} tone="reward" size={18} tileSize={36} />
              <View className="flex-1">
                <AppText variant="label" className="text-foreground">
                  {cart.coupon.couponCode} applied
                </AppText>
                <AppText variant="caption" style={{ color: palette.accent.veg }}>
                  You saved ₹{cart.coupon.discount}
                </AppText>
              </View>
              <Pressable onPress={clearCoupon} accessibilityRole="button" className="active:opacity-70">
                <AppText variant="label" className="text-danger">
                  Remove
                </AppText>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {bestCoupon ? (
                <View
                  className="flex-row items-center gap-3 rounded-xl px-3 py-2.5"
                  style={{ backgroundColor: accentTint(palette.accent.reward, 0.1) }}>
                  <AccentIcon icon={IconTicket} tone="reward" size={18} tileSize={36} />
                  <View className="flex-1">
                    <AppText variant="label" className="text-foreground">
                      {bestCoupon.coupon.couponCode}
                    </AppText>
                    <AppText variant="caption" style={{ color: palette.accent.reward }}>
                      Save ₹{bestCoupon.discount} on this order
                    </AppText>
                  </View>
                  <Button
                    label="Apply"
                    size="sm"
                    onPress={() => applyResolved(bestCoupon.coupon, bestCoupon.discount)}
                  />
                </View>
              ) : null}
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={code}
                  onChangeText={(t) => {
                    setCode(t.toUpperCase());
                    setCouponError(null);
                  }}
                  placeholder="Have a coupon code?"
                  placeholderTextColor={palette.neutral.gray500}
                  autoCapitalize="characters"
                  className="flex-1 rounded-xl border border-input px-3 py-2 text-foreground"
                  style={{ fontFamily: FONT_FAMILY.regular, fontSize: 14 }}
                />
                <Button label="Apply" variant="outline" size="sm" onPress={applyByCode} disabled={!code.trim()} />
              </View>
              {coupons.length > 0 ? (
                <Pressable
                  onPress={() => couponSheetRef.current?.present()}
                  accessibilityRole="button"
                  className="flex-row items-center gap-2 active:opacity-70">
                  <IconTicket size={15} color={palette.accent.reward} />
                  <AppText variant="label" style={{ color: palette.accent.reward }}>
                    View all coupons
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          )}
          {couponError ? (
            <AppText variant="caption" className="text-danger" style={{ marginTop: 8 }}>
              {couponError}
            </AppText>
          ) : null}
        </View>
```

Add the bill breakdown's discount row — in the `BILL` card, right after `<BillRow label={`Items (${bill.totalQty})`} amount={bill.subTotal} />`, add:
```tsx
          {bill.discount > 0 ? <BillRow label="Discount" amount={-bill.discount} /> : null}
```

Finally, mount `<CouponSheet>` and `<CouponCelebration>` right before the closing `</View>` of the component (after the sticky footer `<View>...</View>` block, still inside the outermost `<View className="flex-1 bg-background">`):
```tsx
      <CouponSheet
        ref={couponSheetRef}
        coupons={coupons}
        subTotal={bill.subTotal}
        onApply={applyResolved}
        onClose={() => {}}
      />
      <CouponCelebration trigger={couponPulse} code={celebrated.code} saving={celebrated.saving} />
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors. Confirm `src/features/cart/index.ts` (or wherever `CouponSheet`/`SavingsBanner`/`CouponCelebration`/`discountFor` are actually exported from — check `@/features/cart`'s barrel) exports all four; if the import path in Step 3 doesn't resolve, adjust to the correct barrel path rather than reaching into `src/features/cart/components/...` directly.

- [ ] **Step 5: Manual check**

Add items to the bulk cart, open a coupon from "View all coupons", apply it, confirm the savings banner + bill discount row + "applied" state all update; remove it; try an invalid manually-typed code and confirm the inline error.

- [ ] **Step 6: Commit**

```bash
git add src/features/bulk/api.ts src/features/bulk/index.ts src/app/bulk-cart.tsx
git commit -m "feat(bulk): wire real coupon support into the bulk cart"
```

---

### Task 15: Wire cluster config for bulk GST rates + delivery slot window

Two things are currently hardcoded that the spec said should come from config: the 3 GST percentages in `DEFAULT_BULK_CHARGES`, and the 8am–9pm delivery slot window passed to `slotsFor()`. Verified against the Ionic reference (`bulk-order-cart.component.ts`):
- GST rates come from the same per-cluster `searchClusterVariable` call Subscription's `cartStore.loadCharges()` already uses, reading keys `bulkDeliveryGstPercentage` / `bulkEcoFriendlyPackagingGstPercentage` / `bulkPlatformChargesGstPercentage` (item GST is NOT cluster-scoped and NOT overridden even in Subscription's own port — it stays hardcoded at 5, so bulk keeps the same convention).
- The slot window comes from a *different* endpoint — the general `getVariables` config-variable fetch (already used by `src/features/support/supportApi.ts`), reading keys `DD_B2B_START_TIME` / `DD_B2B_STOP_TIME`, with the same `'08:00'`/`'21:00'` fallback already baked into `slotsFor()`'s defaults.

**Files:**
- Modify: `src/features/bulk/bill.ts`
- Modify: `src/features/bulk/schedule.ts`
- Modify: `src/features/bulk/index.ts`
- Modify: `src/app/bulk-cart.tsx`

- [ ] **Step 1: Add `chargesFromBulkConfig` to `src/features/bulk/bill.ts`**

Add this function right after `DEFAULT_BULK_CHARGES`:
```ts
/** Map a cluster config variable (searchClusterVariable) onto BulkBillCharges. */
export function chargesFromBulkConfig(cfg: Record<string, unknown> | null | undefined): BulkBillCharges {
  if (!cfg) {
    return DEFAULT_BULK_CHARGES;
  }
  const num = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    deliveryGstPercent: num(cfg['bulkDeliveryGstPercentage'], DEFAULT_BULK_CHARGES.deliveryGstPercent),
    packagingGstPercent: num(
      cfg['bulkEcoFriendlyPackagingGstPercentage'],
      DEFAULT_BULK_CHARGES.packagingGstPercent,
    ),
    platformGstPercent: num(cfg['bulkPlatformChargesGstPercentage'], DEFAULT_BULK_CHARGES.platformGstPercent),
    itemGstPercent: DEFAULT_BULK_CHARGES.itemGstPercent,
  };
}
```

- [ ] **Step 2: Add a slot-window loader to `src/features/bulk/schedule.ts`**

Add this function right after `slotsFor`:
```ts
/** Parses "08:00"/"21:00"-style config strings into an hour number; falls back on any parse failure. */
function hourFrom(value: string | undefined, fallback: number): number {
  const hour = Number.parseInt((value ?? '').split(':')[0] ?? '', 10);
  return Number.isFinite(hour) ? hour : fallback;
}

/**
 * Fetch the bulk delivery slot window (`DD_B2B_START_TIME`/`DD_B2B_STOP_TIME`)
 * from the backend config variables, falling back to `slotsFor()`'s own
 * 8am–9pm defaults on any failure — mirrors `supportApi.getSupportContacts()`'s
 * `getVariables` call shape.
 */
export async function loadBulkSlotWindow(): Promise<DeliverySlot[]> {
  try {
    const res = await http.post<Array<{ configName: string; configData: string }>>(
      ENDPOINTS.support.variables,
      { variableNames: ['DD_B2B_START_TIME', 'DD_B2B_STOP_TIME'] },
    );
    const map: Record<string, string> = {};
    for (const row of Array.isArray(res) ? res : []) {
      if (row?.configName) map[row.configName] = row.configData;
    }
    return slotsFor(hourFrom(map.DD_B2B_START_TIME, 8), hourFrom(map.DD_B2B_STOP_TIME, 21));
  } catch {
    return slotsFor();
  }
}
```
Add the import this needs at the top of `schedule.ts`:
```ts
import { ENDPOINTS, http } from '@/services/http';
```

- [ ] **Step 3: Export both from the barrel**

In `src/features/bulk/index.ts`, change:
```ts
export { buildBulkBill, emptyBulkBill, DEFAULT_BULK_CHARGES, type BulkBill, type BulkBillCharges } from './bill';
export { minDeliveryDate, slotsFor, formatShort, type DeliverySlot } from './schedule';
```
to:
```ts
export {
  buildBulkBill,
  emptyBulkBill,
  chargesFromBulkConfig,
  DEFAULT_BULK_CHARGES,
  type BulkBill,
  type BulkBillCharges,
} from './bill';
export { minDeliveryDate, slotsFor, loadBulkSlotWindow, formatShort, type DeliverySlot } from './schedule';
```
(Adjust the exact old-string to match whatever `index.ts` currently has after Tasks 8/11's edits — the ordering of `formatShort` from Task 11's fix may differ slightly; the important part is both new names get added, nothing existing gets removed.)

- [ ] **Step 4: Wire both into `bulk-cart.tsx`**

Replace:
```tsx
import {
  buildBulkBill,
  formatShort,
  isBelowMoq,
  minDeliveryDate,
  slotsFor,
  useBulkCartStore,
  type DeliverySlot,
} from '@/features/bulk';
```
with:
```tsx
import {
  buildBulkBill,
  chargesFromBulkConfig,
  formatShort,
  isBelowMoq,
  loadBulkSlotWindow,
  minDeliveryDate,
  useBulkCartStore,
  type BulkBillCharges,
  type DeliverySlot,
} from '@/features/bulk';
import { clusterApi } from '@/features/location';
import { useClusterStore } from '@/store';
```
(if `clusterApi` isn't exported from `@/features/location`'s barrel, import it directly from `@/features/location/clusterApi` instead — check which path `src/store/cartStore.ts` actually uses and mirror that.)

Replace the `slots` memo and add charges state, right after the existing `minDate`/`dateOptions` memos:
```tsx
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [charges, setCharges] = useState<BulkBillCharges | undefined>(undefined);

  useEffect(() => {
    loadBulkSlotWindow().then(setSlots);
  }, []);

  useEffect(() => {
    const clusters = useClusterStore.getState().clusters;
    const configName = clusters.length ? String(clusters[clusters.length - 1].clusterConfigName ?? '') : '';
    if (!configName) return;
    clusterApi
      .searchClusterVariable(configName)
      .then((cfg) => setCharges(chargesFromBulkConfig(cfg)))
      .catch(() => {});
  }, []);
```
(remove the old `const slots = useMemo(() => slotsFor(), []);` line entirely — it's replaced by the two effects above.)

Update the `buildBulkBill` call's `charges` argument from `undefined` to the loaded value (still falls back to `DEFAULT_BULK_CHARGES` internally when `charges` is `undefined`, so this is a safe, backward-compatible change):
```tsx
  const bill = useMemo(
    () =>
      buildBulkBill(
        cart.lines,
        cart.orgInfo,
        cart.category ?? 'meals',
        charges,
        cart.coupon?.discount ?? 0,
        useCashback ? cashbackBalance : 0,
        useWallet ? walletBalance : 0,
      ),
    [cart, charges, useCashback, useWallet, cashbackBalance, walletBalance],
  );
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: no errors. If `clusterApi`/`useClusterStore` import paths don't match what's actually exported, fix the import to whatever `src/store/cartStore.ts`'s `loadCharges()` actually uses (it's the reference implementation for this exact pattern).

- [ ] **Step 6: Manual check**

Confirm the delivery slot list still renders (either the fetched or the 8am–9pm fallback window) and the bill still computes a sane total — this is hard to fully verify without a live backend returning real `bulk*GstPercentage`/`DD_B2B_*` config values, so also confirm the fallback path works correctly if the config fetch fails (airplane mode / no serviceable cluster).

- [ ] **Step 7: Commit**

```bash
git add src/features/bulk/bill.ts src/features/bulk/schedule.ts src/features/bulk/index.ts src/app/bulk-cart.tsx
git commit -m "feat(bulk): fetch GST rates and delivery slot window from cluster config"
```

---

### Task 16: Re-run full verification pass

Same as Task 12's steps, re-run now that Tasks 13–15 have landed on top.

- [ ] **Step 1:** `npx tsc --noEmit` — expect no errors.
- [ ] **Step 2:** `npx expo export --platform android -c` — expect success.
- [ ] **Step 3:** Manual walkthrough covering everything in Task 12's Step 3 PLUS: line-order stability on quantity change, correct footer/cart isolation across category and packaging switches, coupon apply/remove, and delivery slots rendering (fallback or fetched).
- [ ] **Step 4:** Final commit for any fixes found, same as Task 12's Step 4.

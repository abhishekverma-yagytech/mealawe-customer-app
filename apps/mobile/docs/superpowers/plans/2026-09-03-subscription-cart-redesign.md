# Subscription Cart Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `cart.tsx` (the subscription checkout screen) per
`docs/superpowers/specs/2026-09-03-subscription-cart-redesign-design.md`: smaller
Schedule text, a new "Other Subscriptions" swap row, a new Tree Plantation add-on,
the Total Bill card replaced by a bottom sheet with a nested GST breakdown sheet,
and a footer where the payable amount lives inside the "Proceed to Pay" button
above a new Happy Customer banner.

**Architecture:** Four new small components under `src/features/cart/components/`
(`GstBreakdownSheet`, `BillSummarySheet`, `TreePlantationCard`,
`OtherSubscriptionsRow`) wired into `cart.tsx`, which keeps owning all state (as it
already does for the coupon/date sheets). `Bill` gains four additive GST fields;
`Cart` gains a `treePlantation` field with two new store actions. "Other
Subscriptions" reuses the existing `PlanCard` component and the existing
`useSubscriptionCatalog()`/`setSubscription()` machinery — no new package-fetching
or cart-replace logic is invented, both already exist and already do what's needed.

**Tech Stack:** React Native, Expo Router, Zustand, NativeWind v5, `@gorhom/bottom-sheet`,
TypeScript. No test framework in this project — verification is `npx tsc --noEmit` +
`npx expo export --platform android -c`, plus Maestro flows (see `CLAUDE.md` and
`docs/TESTING-WORKFLOW.md`).

---

## Background (read before starting)

Full research is in the design spec
(`docs/superpowers/specs/2026-09-03-subscription-cart-redesign-design.md`). Key
facts this plan relies on:

- `cart.tsx`'s Total Bill card (lines ~599-677) is an inline expand/collapse
  (`billOpen` state) — it's being replaced by a compact summary row that opens
  `BillSummarySheet`. The GST line inside that sheet opens a second, smaller sheet
  (`GstBreakdownSheet`) — `@gorhom/bottom-sheet` supports one `BottomSheetModal`
  presenting on top of another natively, no extra plumbing needed.
- `src/features/cart/bill.ts`'s `buildBill()` already computes `itemTax`,
  `deliveryGst`, `packagingGst`, `platformGst` as local variables but only returns
  their sum (`taxes`). This plan exposes the four as new `Bill` fields — additive,
  `taxes` unchanged.
- The app's one bottom-sheet primitive is `AppSheet` (`src/components/ui/AppSheet.tsx`,
  24px top-corner radius — **not** touched by this plan, it's shared infrastructure
  for every sheet in the app). Every card on `cart.tsx` is already `rounded-2xl`
  (16px) — every new element in this plan matches that, via the same
  `className="rounded-2xl"` convention, not a new token.
- `useCartStore.setSubscription(config)` (`src/store/cartStore.ts:87-98`) already
  does exactly what "Other Subscriptions → replace current plan" needs: it always
  fully replaces `cart.item` with a fresh line built from a new `SubscriptionConfig`
  (resetting `count` to 1 when the package id differs). No new cart-mutation logic
  is written — this plan only adds the UI that calls it with a different package.
- `PlanCard` (`src/features/subscription/components/PlanCard.tsx`) already renders
  exactly what "Other Subscriptions" needs (image, name, "Upto X% off" badge,
  discounted price) with a plain `onPress` callback — reused as-is, wrapped in a
  fixed-width `View` inside a horizontal `ScrollView`, the same pattern
  `DineInHome.tsx` already uses for its own plan grid.
- **Correction from the design spec:** the spec said Tree Plantation's receiver
  name "still reaches the order payload." That's not accurate once the actual
  `pay()` code is read — `SubscriptionOrderBody` (`src/services/payment/orderTypes.ts`)
  is a hand-enumerated object whose every field is documented against a specific
  backend DAO behavior it mirrors; it isn't a spread of cart state, so nothing
  reaches it automatically. Adding new fields there would be exactly the
  "backend/API work" the user explicitly chose *not* to do this phase. This plan
  therefore keeps `treePlantation` **UI-and-cart-state only** — visible on screen,
  persisted locally (survives app restart via the cart's existing MMKV
  persistence), but intentionally not sent in the checkout payload. If a future
  phase needs the receiver name to actually reach fulfillment, that's the "full
  plumbing" option the user declined for now.
- `SubscriptionConfig`/`Cart`/`Bill`/`BillCharges` all live in
  `src/features/cart/types.ts`; `useCartStore` in `src/store/cartStore.ts`.

## File Structure

| File | Change |
|---|---|
| `src/features/cart/types.ts` | Modify — add 4 GST fields to `Bill`; add `TreePlantation` type + `treePlantation` field to `Cart` |
| `src/features/cart/bill.ts` | Modify — `buildBill()`/`emptyBill()` populate the new GST fields |
| `src/store/cartStore.ts` | Modify — `EMPTY_CART.treePlantation: null`; add `setTreePlantation`/`clearTreePlantation` actions |
| `src/features/cart/components/GstBreakdownSheet.tsx` | Create — GST-by-component popup (small `AppSheet`) |
| `src/features/cart/components/BillSummarySheet.tsx` | Create — full itemized bill bottom sheet, replaces the inline card |
| `src/features/cart/components/TreePlantationCard.tsx` | Create — inline-expanding checkbox card |
| `src/features/cart/components/OtherSubscriptionsRow.tsx` | Create — horizontal sibling-package row (wraps `PlanCard`) |
| `src/features/cart/index.ts` | Modify — export the 4 new components + `TreePlantation` type |
| `src/app/cart.tsx` | Modify — Schedule text size; insert Other Subscriptions row + Tree Plantation card; replace Total Bill card with sheet trigger; footer (amount-in-button label, drop redundant price row, add Happy Customer banner) |
| `.maestro/flows/cart-coupon-and-wallet.yaml` | Modify — dismiss the new Bill Summary sheet before the coupon steps that follow it |
| `.maestro/flows/cart-bill-summary-tree-and-swap.yaml` | Create — new MANUAL flow: Bill Summary sheet → GST sheet, Tree Plantation, Other Subscriptions swap-confirm |
| `scripts/generate-test-catalogue.mjs` | Modify — update `CART-02`, add `CART-10`..`CART-13` |

`assets/images/cart/happy-customers.svg` already exists (added ahead of this plan) —
Task 8 just wires it up, no asset step needed.

---

### Task 1: Expose per-component GST amounts on `Bill`

**Files:**
- Modify: `src/features/cart/types.ts:66-85`
- Modify: `src/features/cart/bill.ts:90-188`

- [ ] **Step 1: Add the four fields to `Bill`**

In `src/features/cart/types.ts`, change:

```ts
/** The full computed bill for the cart. */
export interface Bill {
  meals: number;
  /** Base plan price (package price × count × meals/day) — pre-discount. */
  packageTotal: number;
  /** Sum of all selected add-ons over the whole plan. */
  addOnTotal: number;
  subTotal: number;
  discount: number;
  delivery: number;
  deliveryOriginal: number;
  packaging: number;
  packagingOriginal: number;
  platform: number;
  platformOriginal: number;
  taxes: number;
  cashbackUsed: number;
  moneyWalletUsed: number;
  toPay: number;
  saving: number;
}
```

to:

```ts
/** The full computed bill for the cart. */
export interface Bill {
  meals: number;
  /** Base plan price (package price × count × meals/day) — pre-discount. */
  packageTotal: number;
  /** Sum of all selected add-ons over the whole plan. */
  addOnTotal: number;
  subTotal: number;
  discount: number;
  delivery: number;
  deliveryOriginal: number;
  packaging: number;
  packagingOriginal: number;
  platform: number;
  platformOriginal: number;
  taxes: number;
  /** GST on the discounted item (plan + add-ons) amount — one of the four
   * components summed into `taxes`, broken out for the GST breakdown sheet. */
  itemGst: number;
  /** GST on the net `delivery` charge. */
  deliveryGst: number;
  /** GST on the net `packaging` charge. */
  packagingGst: number;
  /** GST on the net `platform` charge. */
  platformGst: number;
  cashbackUsed: number;
  moneyWalletUsed: number;
  toPay: number;
  saving: number;
}
```

- [ ] **Step 2: Populate them in `emptyBill()` and `buildBill()`**

In `src/features/cart/bill.ts`, change `emptyBill()`:

```ts
export function emptyBill(): Bill {
  return {
    meals: 0,
    packageTotal: 0,
    addOnTotal: 0,
    subTotal: 0,
    discount: 0,
    delivery: 0,
    deliveryOriginal: 0,
    packaging: 0,
    packagingOriginal: 0,
    platform: 0,
    platformOriginal: 0,
    taxes: 0,
    cashbackUsed: 0,
    moneyWalletUsed: 0,
    toPay: 0,
    saving: 0,
  };
}
```

to:

```ts
export function emptyBill(): Bill {
  return {
    meals: 0,
    packageTotal: 0,
    addOnTotal: 0,
    subTotal: 0,
    discount: 0,
    delivery: 0,
    deliveryOriginal: 0,
    packaging: 0,
    packagingOriginal: 0,
    platform: 0,
    platformOriginal: 0,
    taxes: 0,
    itemGst: 0,
    deliveryGst: 0,
    packagingGst: 0,
    platformGst: 0,
    cashbackUsed: 0,
    moneyWalletUsed: 0,
    toPay: 0,
    saving: 0,
  };
}
```

Then, in `buildBill()`, the four values are already computed as local `const`s
(`itemTax`, `deliveryGst`, `packagingGst`, `platformGst`) right before `taxes` is
summed — only the returned object needs the new fields. Change the return
statement from:

```ts
  return {
    meals,
    packageTotal,
    addOnTotal,
    subTotal,
    discount,
    delivery,
    deliveryOriginal,
    packaging,
    packagingOriginal,
    platform,
    platformOriginal,
    taxes,
    cashbackUsed: cashback,
    moneyWalletUsed: moneyWallet,
    toPay,
    saving,
  };
```

to:

```ts
  return {
    meals,
    packageTotal,
    addOnTotal,
    subTotal,
    discount,
    delivery,
    deliveryOriginal,
    packaging,
    packagingOriginal,
    platform,
    platformOriginal,
    taxes,
    itemGst: itemTax,
    deliveryGst,
    packagingGst,
    platformGst,
    cashbackUsed: cashback,
    moneyWalletUsed: moneyWallet,
    toPay,
    saving,
  };
```

(`itemTax`'s local name differs from the field name `itemGst` — every other local
variable already matches its field name 1:1.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. `bulk-cart.tsx`/`on-demand-cart.tsx` compute their own bills
independently (see the design spec's Background) and are unaffected by this
additive change.

- [ ] **Step 4: Commit**

```bash
git add src/features/cart/types.ts src/features/cart/bill.ts
git commit -m "feat(cart): expose per-component GST amounts on Bill"
```

---

### Task 2: Add Tree Plantation state to the cart store

**Files:**
- Modify: `src/features/cart/types.ts:32-37`
- Modify: `src/store/cartStore.ts`

- [ ] **Step 1: Add the type + field**

In `src/features/cart/types.ts`, add a new exported type right after `AppliedCoupon`
and add the field to `Cart`. Change:

```ts
/** A coupon applied to the cart. */
export interface AppliedCoupon {
  couponCode: string;
  discount: number;
  couponHeader?: string;
}

/** The cart (subscription-only for now). */
export interface Cart {
  orderType: 'subscription';
  item: SubscriptionCartItem | null;
  coupon: AppliedCoupon | null;
}
```

to:

```ts
/** A coupon applied to the cart. */
export interface AppliedCoupon {
  couponCode: string;
  discount: number;
  couponHeader?: string;
}

/** Tree Plantation add-on — UI/cart-state only for now (see the implementation
 * plan's Background for why this isn't sent in the checkout payload yet). */
export interface TreePlantation {
  enabled: boolean;
  receiverName: string;
}

/** The cart (subscription-only for now). */
export interface Cart {
  orderType: 'subscription';
  item: SubscriptionCartItem | null;
  coupon: AppliedCoupon | null;
  treePlantation: TreePlantation | null;
}
```

- [ ] **Step 2: Update the store**

In `src/store/cartStore.ts`, change the empty-cart constant:

```ts
const EMPTY_CART: Cart = { orderType: 'subscription', item: null, coupon: null };
```

to:

```ts
const EMPTY_CART: Cart = { orderType: 'subscription', item: null, coupon: null, treePlantation: null };
```

Update the import line to bring in the new type:

```ts
import type { AppliedCoupon, BillCharges, Cart, SubscriptionConfig } from '@/features/cart/types';
```

to:

```ts
import type { AppliedCoupon, BillCharges, Cart, SubscriptionConfig, TreePlantation } from '@/features/cart/types';
```

Add two new actions to the `CartState` interface — change:

```ts
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
  reset: () => void;
}
```

to:

```ts
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
```

Add the two implementations, right after `clearCoupon` and before `reset`:

```ts
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

```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/cart/types.ts src/store/cartStore.ts
git commit -m "feat(cart): add Tree Plantation cart state"
```

---

### Task 3: Build `GstBreakdownSheet`

**Files:**
- Create: `src/features/cart/components/GstBreakdownSheet.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { forwardRef } from 'react';
import { View } from 'react-native';
import { BottomSheetView, type BottomSheetModal } from '@gorhom/bottom-sheet';

import { AppSheet } from '@/components/ui/AppSheet';
import { AppText } from '@/components/ui/AppText';
import { BillRow } from '@/components/ui/BillRow';
import { useColors } from '@/theme';
import { formatINR } from '@/utils/currency';

import type { Bill } from '../types';

interface GstBreakdownSheetProps {
  bill: Bill;
  /** Dine-in orders have no delivery charge, so no delivery-GST row applies. */
  isDineIn?: boolean;
}

/**
 * GST split by component (item / delivery / packaging / platform) — opened
 * from `BillSummarySheet`'s "GST & charges" row. A small `AppSheet` like every
 * other popup in the app, not a centered dialog (see the design spec).
 */
export const GstBreakdownSheet = forwardRef<BottomSheetModal, GstBreakdownSheetProps>(
  ({ bill, isDineIn }, ref) => {
    const colors = useColors();
    return (
      <AppSheet ref={ref}>
        <BottomSheetView style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 12 }}>
          <AppText variant="h2" className="text-foreground">
            GST breakdown
          </AppText>
          <AppText variant="caption" className="text-muted-foreground">
            Mealawe has no role to play in taxes levied by the govt.
          </AppText>
          <View style={{ gap: 10, marginTop: 4 }}>
            <BillRow label="GST on item total" amount={bill.itemGst} />
            {!isDineIn && bill.deliveryGst > 0 ? (
              <BillRow label="GST on delivery" amount={bill.deliveryGst} />
            ) : null}
            {bill.packagingGst > 0 ? (
              <BillRow label="GST on packaging" amount={bill.packagingGst} />
            ) : null}
            {bill.platformGst > 0 ? (
              <BillRow label="GST on platform fee" amount={bill.platformGst} />
            ) : null}
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />
            <View className="flex-row items-center justify-between">
              <AppText variant="label" className="text-foreground">
                Total GST
              </AppText>
              <AppText variant="label" className="text-foreground">
                {formatINR(bill.taxes)}
              </AppText>
            </View>
          </View>
        </BottomSheetView>
      </AppSheet>
    );
  },
);

GstBreakdownSheet.displayName = 'GstBreakdownSheet';
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/cart/components/GstBreakdownSheet.tsx
git commit -m "feat(cart): add GstBreakdownSheet"
```

---

### Task 4: Build `BillSummarySheet`

**Files:**
- Create: `src/features/cart/components/BillSummarySheet.tsx`

- [ ] **Step 1: Write the component**

This renders exactly the rows `cart.tsx` currently renders inline (lines 646-670 of
the pre-redesign file) as bottom-sheet content, plus a savings banner at the top
(reusing the same `accentTint(palette.brand.green, ...)` treatment `SavingsBanner`
uses) and a tappable GST row that calls `onGstPress`.

```tsx
import { forwardRef } from 'react';
import { Pressable, View } from 'react-native';
import { BottomSheetScrollView, type BottomSheetModal } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSheet } from '@/components/ui/AppSheet';
import { AppText } from '@/components/ui/AppText';
import { BillRow } from '@/components/ui/BillRow';
import { IconChevronRight } from '@/components/ui/icons';
import { accentTint, palette, useColors } from '@/theme';
import { formatINR } from '@/utils/currency';

import type { AppliedCoupon, Bill } from '../types';

interface BillSummarySheetProps {
  bill: Bill;
  /** Package-level discount only (bill.discount minus the coupon's own amount) —
   * same value `cart.tsx` already derives for the inline row it's replacing. */
  planDiscount: number;
  coupon: AppliedCoupon | null;
  onGstPress: () => void;
}

/**
 * Full itemized bill — opened from `cart.tsx`'s compact "Total Bill" row
 * (replaces the old inline expand/collapse card).
 */
export const BillSummarySheet = forwardRef<BottomSheetModal, BillSummarySheetProps>(
  ({ bill, planDiscount, coupon, onGstPress }, ref) => {
    const insets = useSafeAreaInsets();
    const colors = useColors();
    return (
      <AppSheet ref={ref} snapPoints={['70%']}>
        <AppText variant="h2" className="text-foreground px-5 pt-2 pb-3">
          Bill Summary
        </AppText>
        <BottomSheetScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 10 }}>
          <BillRow label={`Plan · ${bill.meals} meals`} amount={bill.packageTotal} />
          {bill.addOnTotal > 0 ? <BillRow label="Extras" amount={bill.addOnTotal} /> : null}
          {planDiscount > 0 ? <BillRow label="Plan discount" amount={-planDiscount} positive /> : null}
          {coupon ? (
            <BillRow label={`Coupon ${coupon.couponCode}`} amount={-coupon.discount} positive />
          ) : null}
          <BillRow label="Delivery" amount={bill.delivery} original={bill.deliveryOriginal} />
          <BillRow label="Packaging" amount={bill.packaging} original={bill.packagingOriginal} />
          <BillRow label="Platform fee" amount={bill.platform} original={bill.platformOriginal} />
          <Pressable
            onPress={onGstPress}
            accessibilityRole="button"
            className="flex-row items-center justify-between active:opacity-70">
            <AppText variant="body" className="text-muted-foreground">
              GST &amp; charges
            </AppText>
            <View className="flex-row items-center gap-1">
              <AppText variant="body" className="text-foreground">
                {formatINR(bill.taxes)}
              </AppText>
              <IconChevronRight size={14} color={colors.mutedForeground} />
            </View>
          </Pressable>
          {bill.moneyWalletUsed > 0 ? (
            <BillRow label="Wallet credit" amount={-bill.moneyWalletUsed} positive />
          ) : null}
          {bill.cashbackUsed > 0 ? (
            <BillRow label="Cashback credit" amount={-bill.cashbackUsed} positive />
          ) : null}
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />
          <View className="flex-row items-center justify-between">
            <AppText variant="label" className="text-foreground">
              To pay
            </AppText>
            <AppText variant="label" className="text-foreground">
              {formatINR(bill.toPay)}
            </AppText>
          </View>
          {bill.saving > 0 ? (
            <View
              className="rounded-2xl px-3.5 py-3"
              style={{ marginTop: 4, backgroundColor: accentTint(palette.brand.green, 0.08) }}>
              <AppText variant="label" style={{ color: palette.brand.greenDark }}>
                You&apos;re saving {formatINR(bill.saving)} on this order
              </AppText>
            </View>
          ) : null}
        </BottomSheetScrollView>
      </AppSheet>
    );
  },
);

BillSummarySheet.displayName = 'BillSummarySheet';
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/cart/components/BillSummarySheet.tsx
git commit -m "feat(cart): add BillSummarySheet"
```

---

### Task 5: Build `TreePlantationCard`

**Files:**
- Create: `src/features/cart/components/TreePlantationCard.tsx`

- [ ] **Step 1: Write the component**

No dedicated checkbox primitive exists in this app — this builds a small square
checkbox inline (border + fill + `IconCheck`), the same weight of custom control
`StartDatePickerSheet`'s date-chip check badge already uses elsewhere in this
screen's own flow.

```tsx
import { Pressable, TextInput, View } from 'react-native';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { IconCheck, IconLeaf } from '@/components/ui/icons';
import { accentTint, palette, useColors } from '@/theme';

interface TreePlantationCardProps {
  enabled: boolean;
  receiverName: string;
  onToggle: () => void;
  onNameChange: (name: string) => void;
}

/**
 * Tree Plantation add-on — an inline-expanding card, not a popup. Checking the
 * box reveals a "Tree Receiver Name" field in the same card (matches the
 * checked-state reference screenshot); unchecking clears the name and
 * collapses it.
 */
export function TreePlantationCard({
  enabled,
  receiverName,
  onToggle,
  onNameChange,
}: TreePlantationCardProps) {
  const colors = useColors();
  return (
    <View
      className="rounded-2xl border p-4"
      style={{
        gap: 12,
        borderColor: enabled ? palette.brand.green : colors.border,
        backgroundColor: enabled ? accentTint(palette.brand.green, 0.05) : colors.card,
      }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: enabled }}
        accessibilityLabel="Tree Plantation"
        className="flex-row items-center gap-3 active:opacity-80">
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: enabled ? palette.brand.green : colors.border,
            backgroundColor: enabled ? palette.brand.green : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {enabled ? <IconCheck size={14} color="#fff" strokeWidth={3} /> : null}
        </View>
        <View className="flex-1">
          <AppText variant="label" className="text-foreground">
            Tree Plantation
          </AppText>
          <AppText variant="caption" className="text-muted-foreground">
            Plant a tree
          </AppText>
        </View>
        <AccentIcon icon={IconLeaf} tone="veg" size={18} tileSize={36} />
      </Pressable>
      {enabled ? (
        <TextInput
          value={receiverName}
          onChangeText={onNameChange}
          placeholder="Tree Receiver Name"
          placeholderTextColor={palette.neutral.gray500}
          accessibilityLabel="Tree Receiver Name"
          className="rounded-xl border border-input px-3 py-2 font-metropolis text-body-lg text-foreground"
        />
      ) : null}
    </View>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/cart/components/TreePlantationCard.tsx
git commit -m "feat(cart): add TreePlantationCard"
```

---

### Task 6: Build `OtherSubscriptionsRow`

**Files:**
- Create: `src/features/cart/components/OtherSubscriptionsRow.tsx`

- [ ] **Step 1: Write the component**

Reuses `PlanCard` exactly as `DineInHome.tsx` does (fixed-width `View` wrapper in a
horizontal scroll), just with `onPress` wired to a swap callback instead of
navigation.

```tsx
import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PlanCard, type MealPackage } from '@/features/subscription';

interface OtherSubscriptionsRowProps {
  packages: MealPackage[];
  /** Total meals over the whole plan (days × meals/day) for a given package —
   * `cart.tsx` computes this per-package from the current item's meal-time
   * selection, since a sibling package carries no meal-time of its own. */
  mealCountFor: (pkg: MealPackage) => number;
  onAdd: (pkg: MealPackage) => void;
}

/**
 * Sibling packages in the same category as the plan already in the cart.
 * Tapping a card requests replacing the current plan — see `cart.tsx`'s
 * `requestPlanSwap`, which confirms before calling `setSubscription`.
 */
export function OtherSubscriptionsRow({ packages, mealCountFor, onAdd }: OtherSubscriptionsRowProps) {
  if (packages.length === 0) {
    return null;
  }
  return (
    <View style={{ gap: 10 }}>
      <AppText variant="overline" className="text-muted-foreground">
        OTHER MONTHLY SUBSCRIPTIONS
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {packages.map((pkg) => (
          <View key={pkg._id} style={{ width: 160 }}>
            <PlanCard pkg={pkg} onPress={() => onAdd(pkg)} mealCount={mealCountFor(pkg)} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/cart/components/OtherSubscriptionsRow.tsx
git commit -m "feat(cart): add OtherSubscriptionsRow"
```

---

### Task 7: Export the new components

**Files:**
- Modify: `src/features/cart/index.ts`

- [ ] **Step 1: Add the exports**

Change:

```ts
export {
  DEFAULT_CHARGES,
  chargesFromConfig,
  discountFor,
  buildBill,
  emptyBill,
} from './bill';
export type {
  SubscriptionConfig,
  SubscriptionCartItem,
  AppliedCoupon,
  Cart,
  BillLine,
  BillCharges,
  Bill,
} from './types';
export { CouponSheet } from './components/CouponSheet';
export { SavingsBanner } from './components/SavingsBanner';
export { CouponCelebration } from './components/CouponCelebration';
```

to:

```ts
export {
  DEFAULT_CHARGES,
  chargesFromConfig,
  discountFor,
  buildBill,
  emptyBill,
} from './bill';
export type {
  SubscriptionConfig,
  SubscriptionCartItem,
  AppliedCoupon,
  Cart,
  BillLine,
  BillCharges,
  Bill,
  TreePlantation,
} from './types';
export { CouponSheet } from './components/CouponSheet';
export { SavingsBanner } from './components/SavingsBanner';
export { CouponCelebration } from './components/CouponCelebration';
export { GstBreakdownSheet } from './components/GstBreakdownSheet';
export { BillSummarySheet } from './components/BillSummarySheet';
export { TreePlantationCard } from './components/TreePlantationCard';
export { OtherSubscriptionsRow } from './components/OtherSubscriptionsRow';
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/cart/index.ts
git commit -m "feat(cart): barrel-export the new cart-redesign components"
```

---

### Task 8: Wire everything into `cart.tsx`

**Files:**
- Modify: `src/app/cart.tsx`

This is the integration task — every prior task's output gets used here. Steps are
ordered top-to-bottom through the file so each is independently reviewable.

- [ ] **Step 1: Update imports**

Change the `react-native` import (line 4) from:

```ts
import { Pressable, ScrollView, TextInput, View } from 'react-native';
```

to:

```ts
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
```

Change the `@/components/ui/icons` import (lines 15-26) — add `IconChevronRight`
(used by the new compact Total Bill row's affordance) — from:

```ts
import {
  IconCalendar,
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconCoins,
  IconMapPin,
  IconTicket,
  IconUtensils,
  IconWallet,
  type IconProps,
} from '@/components/ui/icons';
```

to:

```ts
import {
  IconCalendar,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconClock,
  IconCoins,
  IconMapPin,
  IconTicket,
  IconUtensils,
  IconWallet,
  type IconProps,
} from '@/components/ui/icons';
```

(`IconChevronDown`/`IconChevronUp` are no longer used once Step 4 removes the
inline expand/collapse — Step 4 also removes them from this import; left in place
here to keep this diff additive-only until then.)

Change the `@/features/subscription` import (lines 29-43) to add `useSubscriptionCatalog`,
`nextStartDates`, `generateRun`, and the `MealPackage` type — from:

```ts
import {
  addonLineTotal,
  daysLabel,
  extraAddonDays,
  fromServerCategory,
  loadSubscriptionCategories,
  loadSubscriptionCoupons,
  packageImageUri,
  useConfigureStore,
  formatShort,
  AddonTypeIcon,
  StartDatePickerSheet,
  type SubCategory,
  type SubscriptionCoupon,
} from '@/features/subscription';
```

to:

```ts
import {
  addonLineTotal,
  daysLabel,
  extraAddonDays,
  fromServerCategory,
  generateRun,
  loadSubscriptionCategories,
  loadSubscriptionCoupons,
  nextStartDates,
  packageImageUri,
  useConfigureStore,
  useSubscriptionCatalog,
  formatShort,
  AddonTypeIcon,
  OtherSubscriptionsRow,
  StartDatePickerSheet,
  type MealPackage,
  type SubCategory,
  type SubscriptionCoupon,
} from '@/features/subscription';
```

Wait — `OtherSubscriptionsRow` lives in `@/features/cart`, not `@/features/subscription`
(Task 7 exported it from `src/features/cart/index.ts`). Remove it from the block
above and instead change the `@/features/cart` import (line 44) from:

```ts
import { buildBill, discountFor, CouponSheet, SavingsBanner, CouponCelebration } from '@/features/cart';
```

to:

```ts
import {
  buildBill,
  discountFor,
  BillSummarySheet,
  CouponSheet,
  GstBreakdownSheet,
  OtherSubscriptionsRow,
  SavingsBanner,
  CouponCelebration,
  TreePlantationCard,
} from '@/features/cart';
```

- [ ] **Step 2: Type-check the import changes before continuing**

Run: `npx tsc --noEmit`
Expected: new "unused import" or "cannot find name" errors are fine at this
intermediate point (`IconChevronDown`/`up` still used by the not-yet-removed inline
card; new imports not yet consumed) — just confirm there are no typos (no "module
has no exported member" errors, since Tasks 1-7 already back every new import).

- [ ] **Step 3: Add state, refs, and the swap/tree-plantation handlers**

Add two new sheet refs next to the existing ones. Change:

```ts
  const couponSheetRef = useRef<BottomSheetModal>(null);
  const dateSheetRef = useRef<BottomSheetModal>(null);
  const celebratedCodeRef = useRef<string | null>(null);
```

to:

```ts
  const couponSheetRef = useRef<BottomSheetModal>(null);
  const dateSheetRef = useRef<BottomSheetModal>(null);
  const billSheetRef = useRef<BottomSheetModal>(null);
  const gstSheetRef = useRef<BottomSheetModal>(null);
  const celebratedCodeRef = useRef<string | null>(null);
```

Remove the now-unused `billOpen` state (it's replaced by the sheet's own open/closed
state, which `BottomSheetModal` tracks itself). Change:

```ts
  const [billOpen, setBillOpen] = useState(false);
```

to: (delete the line entirely)

Add the sibling-packages lookup and the two new handlers, right after the existing
`applyResolved` function and before `editAddons` (so they sit near the other
cart-mutating handlers):

```ts
  const catalog = useSubscriptionCatalog();
  const categoryParam = category?.param ?? item.category;
  const otherPackages = useMemo(
    () => catalog.packagesFor(categoryParam).filter((p) => p._id !== pkg._id),
    [catalog, categoryParam, pkg._id],
  );
  const currentMealsPerDay = item.breakfast ? 1 : item.lunch && item.dinner ? 2 : 1;

  const requestPlanSwap = (newPkg: MealPackage): void => {
    Alert.alert(
      'Replace your plan?',
      `Switching to ${newPkg.packageName ?? 'this plan'} will reset your selected dates and add-ons.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: () => setSubscription(buildSwapConfig(newPkg, item)),
        },
      ],
    );
  };

  const toggleTreePlantation = (): void => {
    if (cart.treePlantation?.enabled) {
      clearTreePlantation();
    } else {
      setTreePlantation({ enabled: true, receiverName: cart.treePlantation?.receiverName ?? '' });
    }
  };

  const setTreeReceiverName = (receiverName: string): void => {
    setTreePlantation({ enabled: true, receiverName });
  };
```

`category` here is the same `SubCategory` lookup already computed earlier in the
component (`const category = categories.find((c) => c.name === item.category);`,
existing line 169) — `categoryParam` falls back to `item.category` itself when that
lookup hasn't resolved yet (matches `packagesFor`'s loose case-insensitive matching,
see the design spec's Background).

Add the two new store actions to the existing `useCartStore` selector block. Change:

```ts
  const applyCoupon = useCartStore((s) => s.applyCoupon);
  const clearCoupon = useCartStore((s) => s.clearCoupon);
```

to:

```ts
  const applyCoupon = useCartStore((s) => s.applyCoupon);
  const clearCoupon = useCartStore((s) => s.clearCoupon);
  const setTreePlantation = useCartStore((s) => s.setTreePlantation);
  const clearTreePlantation = useCartStore((s) => s.clearTreePlantation);
```

- [ ] **Step 4: Shrink the Schedule row's date text**

Change (existing line 470-472):

```tsx
          <DetailRow icon={IconCalendar} tone="plan" label="Schedule" onPress={() => dateSheetRef.current?.present()}>
            {start ? `Starts ${formatShort(start)} · ${item.selectedDates.length} days` : 'Dates not set'}
          </DetailRow>
```

`DetailRow`'s content is currently always rendered `variant="body"` internally
(`src/app/cart.tsx`'s `DetailRow` function, existing line 772) — that's shared by
Meal/Address too, so don't change `DetailRow` itself. Instead give `DetailRow` an
optional smaller-text override used only by Schedule. Change `DetailRow`'s own
definition (existing lines 749-791) from:

```tsx
function DetailRow({
  icon,
  tone,
  label,
  children,
  onPress,
}: {
  icon: ComponentType<IconProps>;
  tone: 'plan' | 'info' | 'location';
  label: string;
  children: string;
  /** When provided, the whole row becomes tappable and shows a trailing
   * "Change" affordance — e.g. Schedule opens `StartDatePickerSheet` inline
   * instead of the only option being a full trip to Configure. */
  onPress?: () => void;
}) {
  const content = (
    <View className="flex-row items-center gap-3">
      <AccentIcon icon={icon} tone={tone} size={17} tileSize={36} />
      <View className="flex-1">
        <AppText variant="caption" className="text-muted-foreground">
          {label}
        </AppText>
        <AppText variant="body" className="text-foreground">
          {children}
        </AppText>
      </View>
```

to:

```tsx
function DetailRow({
  icon,
  tone,
  label,
  children,
  onPress,
  compact,
}: {
  icon: ComponentType<IconProps>;
  tone: 'plan' | 'info' | 'location';
  label: string;
  children: string;
  /** When provided, the whole row becomes tappable and shows a trailing
   * "Change" affordance — e.g. Schedule opens `StartDatePickerSheet` inline
   * instead of the only option being a full trip to Configure. */
  onPress?: () => void;
  /** Smaller value text — Schedule uses this so its date/day-count string
   * doesn't compete with Meal/Address's regular-size rows. */
  compact?: boolean;
}) {
  const content = (
    <View className="flex-row items-center gap-3">
      <AccentIcon icon={icon} tone={tone} size={17} tileSize={36} />
      <View className="flex-1">
        <AppText variant="caption" className="text-muted-foreground">
          {label}
        </AppText>
        <AppText variant={compact ? 'bodySm' : 'body'} className="text-foreground">
          {children}
        </AppText>
      </View>
```

Then pass `compact` from the call site — change:

```tsx
          <DetailRow icon={IconCalendar} tone="plan" label="Schedule" onPress={() => dateSheetRef.current?.present()}>
            {start ? `Starts ${formatShort(start)} · ${item.selectedDates.length} days` : 'Dates not set'}
          </DetailRow>
```

to:

```tsx
          <DetailRow
            icon={IconCalendar}
            tone="plan"
            label="Schedule"
            compact
            onPress={() => dateSheetRef.current?.present()}>
            {start ? `Starts ${formatShort(start)} · ${item.selectedDates.length} days` : 'Dates not set'}
          </DetailRow>
```

- [ ] **Step 5: Insert Other Subscriptions between Delivery Details and Coupon**

Right after the Delivery Details card's closing `</View>` (existing line 485) and
before the `{/* coupon */}` comment (existing line 487), insert:

```tsx
        {/* other subscriptions — sibling packages in the same category; tap
            replaces the current plan (see requestPlanSwap). */}
        <OtherSubscriptionsRow
          packages={otherPackages}
          mealCountFor={(p) => (p.isBreakFast ? 1 : currentMealsPerDay) * p.days}
          onAdd={requestPlanSwap}
        />

```

- [ ] **Step 6: Insert Tree Plantation between Redeem and Total Bill**

Right after the Redeem card's closing `) : null}` (existing line 597) and before
the `{/* bill ... */}` comment block (existing line 599), insert:

```tsx
        {/* tree plantation — UI/cart-state only, see the plan's Background for why */}
        <TreePlantationCard
          enabled={!!cart.treePlantation?.enabled}
          receiverName={cart.treePlantation?.receiverName ?? ''}
          onToggle={toggleTreePlantation}
          onNameChange={setTreeReceiverName}
        />

```

- [ ] **Step 7: Replace the inline Total Bill card with the compact sheet-trigger row**

Change the entire bill card block (existing lines 599-677) from:

```tsx
        {/* bill — collapsed to "Total Bill" by default; tap to expand. Given
            an accent border + soft tint (same accentTint(brand.green, ...)
            treatment SavingsBanner above uses) instead of the neutral
            border-border/bg-card every other card here gets, since this is
            the one number the user is about to commit to. No shadow.card
            here — its dark shadowColor showed through as a thin black line
            against the colored border in light mode; the border+tint alone
            already gives this card enough definition. */}
        <View
          className="rounded-2xl border p-4"
          style={{
            borderColor: item.isDineIn ? palette.accent.food : palette.brand.green,
            backgroundColor: accentTint(item.isDineIn ? palette.accent.food : palette.brand.green, 0.05),
          }}
        >
          <Pressable
            onPress={() => setBillOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: billOpen }}
            className="flex-row items-center justify-between active:opacity-70"
          >
            <View className="flex-row items-center gap-2">
              <AppText variant="title" className="text-foreground">
                Total Bill
              </AppText>
              {bill.saving > 0 ? (
                <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: accentTint(palette.accent.veg, 0.14) }}>
                  <AppText variant="caption" style={{ color: palette.accent.veg }}>
                    Saved {formatINR(bill.saving)}
                  </AppText>
                </View>
              ) : null}
            </View>
            <View className="flex-row items-center gap-1.5">
              <AppText variant="title" className="text-foreground">
                {formatINR(bill.toPay)}
              </AppText>
              {billOpen ? (
                <IconChevronUp size={18} color={palette.neutral.gray600} />
              ) : (
                <IconChevronDown size={18} color={palette.neutral.gray600} />
              )}
            </View>
          </Pressable>

          {billOpen ? (
            <View style={{ gap: 10, marginTop: 12 }}>
              <BillRow label={`Plan · ${bill.meals} meals`} amount={bill.packageTotal} />
              {bill.addOnTotal > 0 ? <BillRow label="Extras" amount={bill.addOnTotal} /> : null}
              {planDiscount > 0 ? <BillRow label="Plan discount" amount={-planDiscount} positive /> : null}
              {cart.coupon ? (
                <BillRow label={`Coupon ${cart.coupon.couponCode}`} amount={-cart.coupon.discount} positive />
              ) : null}
              <BillRow label="Delivery" amount={bill.delivery} original={bill.deliveryOriginal} />
              <BillRow label="Packaging" amount={bill.packaging} original={bill.packagingOriginal} />
              <BillRow label="Platform fee" amount={bill.platform} original={bill.platformOriginal} />
              <BillRow label="GST & charges" amount={bill.taxes} />
              {bill.moneyWalletUsed > 0 ? (
                <BillRow label="Wallet credit" amount={-bill.moneyWalletUsed} positive />
              ) : null}
              {bill.cashbackUsed > 0 ? (
                <BillRow label="Cashback credit" amount={-bill.cashbackUsed} positive />
              ) : null}
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />
              <View className="flex-row items-center justify-between">
                <AppText variant="label" className="text-foreground">
                  To pay
                </AppText>
                <AppText variant="label" className="text-foreground">
                  {formatINR(bill.toPay)}
                </AppText>
              </View>
            </View>
          ) : (
            <AppText variant="caption" className="text-muted-foreground" style={{ marginTop: 6 }}>
              Incl. all taxes and charges · tap to view breakdown
            </AppText>
          )}
        </View>
      </ScrollView>
```

to:

```tsx
        {/* total bill — compact summary row, opens BillSummarySheet. Same
            accent border + soft tint (accentTint(brand.green, ...)) the old
            inline card used, since this is still the one number the user is
            about to commit to. */}
        <Pressable
          onPress={() => billSheetRef.current?.present()}
          accessibilityRole="button"
          className="flex-row items-center justify-between rounded-2xl border p-4 active:opacity-80"
          style={{
            borderColor: item.isDineIn ? palette.accent.food : palette.brand.green,
            backgroundColor: accentTint(item.isDineIn ? palette.accent.food : palette.brand.green, 0.05),
          }}
        >
          <View className="flex-row items-center gap-2">
            <AppText variant="title" className="text-foreground">
              Total Bill
            </AppText>
            {bill.saving > 0 ? (
              <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: accentTint(palette.accent.veg, 0.14) }}>
                <AppText variant="caption" style={{ color: palette.accent.veg }}>
                  Saved {formatINR(bill.saving)}
                </AppText>
              </View>
            ) : null}
          </View>
          <View className="flex-row items-center gap-1.5">
            <AppText variant="title" className="text-foreground">
              {formatINR(bill.toPay)}
            </AppText>
            <IconChevronRight size={18} color={palette.neutral.gray600} />
          </View>
        </Pressable>
      </ScrollView>
```

Remove the now-fully-unused `IconChevronDown`/`IconChevronUp` imports (Step 1 left
them in place until this point) — change:

```ts
import {
  IconCalendar,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconClock,
  IconCoins,
  IconMapPin,
  IconTicket,
  IconUtensils,
  IconWallet,
  type IconProps,
} from '@/components/ui/icons';
```

to:

```ts
import {
  IconCalendar,
  IconChevronRight,
  IconClock,
  IconCoins,
  IconMapPin,
  IconTicket,
  IconUtensils,
  IconWallet,
  type IconProps,
} from '@/components/ui/icons';
```

`BillRow` is still used by nothing directly in `cart.tsx` after this change (it's
now only used inside `BillSummarySheet`/`GstBreakdownSheet`) — remove its now-unused
import too. Change:

```ts
import { BillRow } from '@/components/ui/BillRow';
```

to: (delete the line)

- [ ] **Step 8: Render the two new sheets**

Right after the existing `<StartDatePickerSheet ... />` (existing lines 737-744,
just before the closing `</View>` of the component's return), add:

```tsx
      <BillSummarySheet
        ref={billSheetRef}
        bill={bill}
        planDiscount={planDiscount}
        coupon={cart.coupon}
        onGstPress={() => gstSheetRef.current?.present()}
      />

      <GstBreakdownSheet ref={gstSheetRef} bill={bill} isDineIn={item.isDineIn} />
```

- [ ] **Step 9: Footer — amount in the button, drop the redundant price row, add the Happy Customer banner**

Change the footer block (existing lines 688-725) from:

```tsx
      <View
        className="border-t border-border bg-card px-5 pt-3"
        style={[shadow.lifted, { gap: 12, paddingBottom: insets.bottom + 12 }]}>
        <View className="flex-row items-center justify-between">
          <AppText
            variant="bodySm"
            className="text-muted-foreground"
            style={{ flexShrink: 1, paddingRight: 8 }}
            numberOfLines={1}>
            {totalDaysLabel} days · {item.category}
          </AppText>
          <View className="flex-row items-baseline gap-2">
            <AppText variant="h3" className="text-foreground">
              {formatINR(bill.toPay)}
            </AppText>
            {bill.saving > 0 ? (
              <AppText
                variant="caption"
                className="text-muted-foreground"
                style={{ textDecorationLine: 'line-through' }}>
                {formatINR(bill.toPay + bill.saving)}
              </AppText>
            ) : null}
          </View>
        </View>
        <Button
          label="Proceed to Pay →"
          size="lg"
          block
          tone={item.isDineIn ? 'food' : undefined}
          loading={paying}
          disabled={paying}
          onPress={pay}
        />
        <AppText variant="caption" className="text-muted-foreground text-center">
          Secure payment · Cancel anytime
        </AppText>
      </View>
```

to:

```tsx
      <View
        className="border-t border-border bg-card px-5 pt-3"
        style={[shadow.lifted, { gap: 12, paddingBottom: insets.bottom + 12 }]}>
        <Image
          source={require('@/assets/images/cart/happy-customers.svg')}
          style={{ width: '100%', height: 44, borderRadius: 16 }}
          contentFit="cover"
        />
        <Button
          label={`${formatINR(bill.toPay)}   Proceed to Pay →`}
          size="lg"
          block
          tone={item.isDineIn ? 'food' : undefined}
          loading={paying}
          disabled={paying}
          onPress={pay}
        />
        <AppText variant="caption" className="text-muted-foreground text-center">
          Secure payment · Cancel anytime
        </AppText>
      </View>
```

`Image` (from `expo-image`) and `formatINR` are both already imported at the top of
`cart.tsx` (lines 6 and 56) — no new imports needed for this step. `totalDaysLabel`
is still used elsewhere in the file (the item card's subtitle, existing line 398),
so it's not removed as an unused variable.

- [ ] **Step 10: Full type-check**

Run: `npx tsc --noEmit`
Expected: clean, zero errors, across the whole project.

- [ ] **Step 11: Commit**

```bash
git add src/app/cart.tsx
git commit -m "feat(cart): redesign subscription cart screen"
```

---

### Task 9: Write a pure helper for the plan-swap default config

**Files:**
- Modify: `src/app/cart.tsx`

Task 8's `requestPlanSwap` calls `buildSwapConfig(newPkg, item)` — this task adds
that function. It's a pure function with no hook dependencies, so it belongs at
module scope alongside `DetailRow`/`RedeemRow`, not inside the component body.

- [ ] **Step 1: Add the helper**

Add this function after `RedeemRow`'s closing brace (the end of the file, after
existing line 828):

```tsx
/**
 * A fresh `SubscriptionConfig` for swapping the cart's current plan to a
 * different sibling package — used by `requestPlanSwap`. Resets the delivery
 * dates to a new run starting from the next eligible date (the old package's
 * run may not even have `newPkg.days` dates) and drops add-ons (they're
 * package-specific — see the design spec). Preserves the current item's
 * meal-time selection and dine-in status; a breakfast package (`isBreakFast`)
 * forces breakfast-only regardless of what was selected before, matching how
 * `subscription-configure.tsx`'s own Dine In / breakfast branches work.
 */
function buildSwapConfig(newPkg: MealPackage, current: SubscriptionCartItem): SubscriptionConfig {
  const deliveryOnWeekends = newPkg.deliveryOnWeekends ?? false;
  const chips = nextStartDates(14, deliveryOnWeekends, deliveryOnWeekends);
  const startIso = chips.find((c) => c.enabled)?.iso ?? '';
  const selectedDates = startIso
    ? generateRun(startIso, newPkg.days, deliveryOnWeekends, deliveryOnWeekends)
    : [];
  const breakfast = !!newPkg.isBreakFast;
  return {
    package: newPkg,
    category: current.category,
    deliveryOnWeekends,
    addOns: [],
    selectedDates,
    lunch: !breakfast && (current.lunch || !current.dinner),
    dinner: !breakfast && current.dinner,
    breakfast,
    isDineIn: current.isDineIn,
  };
}
```

Add the two new type imports this needs. `MealPackage` is already imported (Task 8
Step 1); `SubscriptionCartItem`/`SubscriptionConfig` are not yet imported in
`cart.tsx` (only used as the inferred type of `cart.item`/passed straight into
`setSubscription` before). Change the `@/features/cart` import block (as left by
Task 8 Step 1) to add them:

```ts
import {
  buildBill,
  discountFor,
  BillSummarySheet,
  CouponSheet,
  GstBreakdownSheet,
  OtherSubscriptionsRow,
  SavingsBanner,
  CouponCelebration,
  TreePlantationCard,
} from '@/features/cart';
```

to:

```ts
import {
  buildBill,
  discountFor,
  BillSummarySheet,
  CouponSheet,
  GstBreakdownSheet,
  OtherSubscriptionsRow,
  SavingsBanner,
  CouponCelebration,
  TreePlantationCard,
  type SubscriptionCartItem,
  type SubscriptionConfig,
} from '@/features/cart';
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean, zero errors, across the whole project. This confirms
`buildSwapConfig`'s return type structurally matches `SubscriptionConfig` (every
field present, correct types) and that `setSubscription(buildSwapConfig(...))` in
Task 8 Step 3 type-checks end to end.

- [ ] **Step 3: Commit**

```bash
git add src/app/cart.tsx
git commit -m "feat(cart): add buildSwapConfig for the plan-swap flow"
```

---

### Task 10: Update Maestro flows + the test catalogue

**Files:**
- Modify: `.maestro/flows/cart-coupon-and-wallet.yaml`
- Create: `.maestro/flows/cart-bill-summary-tree-and-swap.yaml`
- Modify: `scripts/generate-test-catalogue.mjs:136-146`

Per `docs/TESTING-WORKFLOW.md`, every feature change needs its Maestro flow(s) and
catalogue rows kept current — done here for the interactions this plan adds/changes.

- [ ] **Step 1: Fix `cart-coupon-and-wallet.yaml` for the new Bill Summary sheet**

"Total Bill" now opens a bottom sheet instead of expanding inline — the flow's next
step (`tapOn: "Have a coupon code?"`) would be covered by that sheet. Change:

```yaml
- assertVisible: "Your cart"
- assertVisible: "Total Bill"
- tapOn: "Total Bill"
- assertVisible: "To pay"
- tapOn: "Have a coupon code?"
```

to:

```yaml
- assertVisible: "Your cart"
- assertVisible: "Total Bill"
- tapOn: "Total Bill"
- assertVisible: "Bill Summary"
- assertVisible: "To pay"
# Dismiss the Bill Summary sheet (swipe down) before the coupon steps below,
# which live on the screen behind it.
- swipe:
    start: 50%, 30%
    end: 50%, 90%
- assertNotVisible: "Bill Summary"
- tapOn: "Have a coupon code?"
```

- [ ] **Step 2: Write the new flow**

```yaml
appId: com.mealawe.app
---
# MANUAL: requires a cart with a configured subscription item (see
# subscribe-configure-cart.yaml) whose category has at least one sibling
# package (for the Other Subscriptions swap) and at least one plan available
# in that category besides the one already in cart.
- assertVisible: "Your cart"

# Bill Summary sheet -> nested GST breakdown sheet
- tapOn: "Total Bill"
- assertVisible: "Bill Summary"
- tapOn: "GST & charges"
- assertVisible: "GST breakdown"
- assertVisible: "GST on item total"
- assertVisible: "Total GST"
- swipe:
    start: 50%, 30%
    end: 50%, 90%
- swipe:
    start: 50%, 30%
    end: 50%, 90%
- assertNotVisible: "GST breakdown"

# Tree Plantation — inline-expanding card, not a popup
- assertVisible: "Tree Plantation"
- tapOn: "Tree Plantation"
- assertVisible: "Tree Receiver Name"
- tapOn: "Tree Receiver Name"
- inputText: "Test Receiver"
- hideKeyboard

# Other Subscriptions — tap a sibling plan, confirm the replace
- assertVisible: "OTHER MONTHLY SUBSCRIPTIONS"
- scroll
- assertVisible: "Replace your plan?"
- tapOn: "Replace"
- assertVisible: "Your cart"

- assertVisible: "Proceed to Pay"
```

- [ ] **Step 3: Update the test-case catalogue**

In `scripts/generate-test-catalogue.mjs`, update `CART-02` (its old description no
longer matches reality) and add four new rows. Change:

```js
    ['CART-02', 'Cart', 'Bill section collapsed by default, expands on tap', 'Cart has an item', 'Tap "Total Bill" row', 'Row expands to show Delivery/Packaging/Platform/Taxes breakdown', 'P1'],
```

to:

```js
    ['CART-02', 'Cart', 'Total Bill row opens the Bill Summary sheet', 'Cart has an item', 'Tap "Total Bill" row', 'Bill Summary bottom sheet opens showing Delivery/Packaging/Platform/GST/To pay breakdown', 'P1'],
```

Add these four rows right after `CART-09` (before the array's closing `],`):

```js
    ['CART-10', 'Cart', 'GST & charges row opens the GST breakdown sheet', 'Bill Summary sheet is open', 'Tap "GST & charges"', 'A second sheet opens on top showing GST on item/delivery/packaging/platform + Total GST equal to the combined figure', 'P2'],
    ['CART-11', 'Cart', 'Checking Tree Plantation reveals the receiver-name field inline', 'Cart has an item', 'Tap the Tree Plantation checkbox', 'Card border/checkbox turn green, a "Tree Receiver Name" field appears in the same card (no popup)', 'P2'],
    ['CART-12', 'Cart', 'Unchecking Tree Plantation clears the receiver name', 'Tree Plantation is checked with a name entered', 'Tap the checkbox again', 'The name field collapses and the stored receiver name is cleared', 'P2'],
    ['CART-13', 'Cart', 'Adding another plan from Other Subscriptions replaces the cart item after confirming', 'Cart has an item; at least one sibling package exists in its category', 'Tap a card in "Other Monthly Subscriptions", then "Replace" on the confirm alert', 'Cart\'s item switches to the new package with fresh dates and no add-ons; tapping "Cancel" instead leaves the original item untouched', 'P1'],
```

- [ ] **Step 4: Commit**

```bash
git add .maestro/flows/cart-coupon-and-wallet.yaml .maestro/flows/cart-bill-summary-tree-and-swap.yaml scripts/generate-test-catalogue.mjs
git commit -m "test(cart): cover the redesigned cart's new sheets, tree plantation, and plan swap"
```

---

### Task 11: Manual verification

No test framework exists in this project (see `CLAUDE.md`) — verify on-device
(release build, per `docs/TESTING-WORKFLOW.md`'s Maestro note) with a cart that
already has a subscription item.

- [ ] **Step 1: Full type-check + export**

Run: `npx tsc --noEmit`
Expected: clean, zero errors.

Run: `npx expo export --platform android -c`
Expected: exports successfully (catches bundler-level issues `tsc` alone can't,
e.g. the new `require('@/assets/images/cart/happy-customers.svg')` resolving).

- [ ] **Step 2: Visual pass against the reference screenshots**

Open `/cart` with a populated subscription item. Verify, top to bottom:
- Schedule's date text under "Schedule" reads visibly smaller than Meal/Address.
- Tapping "Schedule" still opens the existing horizontal date-chip sheet, unchanged.
- "OTHER MONTHLY SUBSCRIPTIONS" appears between Delivery Details and the coupon
  card, horizontally scrollable, cards show image/name/price/"Upto X% off" (when
  the sibling has a discount).
- Tapping a card shows the "Replace your plan?" confirm; "Cancel" leaves the cart
  untouched; "Replace" swaps the item, resets Schedule to a fresh date, clears any
  add-ons card (since the new plan started with none), and the bill recalculates
  for the new package's price/days.
- "Tree Plantation" card sits between the wallet/cashback card and "Total Bill".
  Checking it reveals "Tree Receiver Name" inline with a green border/checkbox;
  typing a name and leaving the screen and returning (or backgrounding/foregrounding
  the app) shows the name persisted (cart store's existing MMKV persistence).
- "Total Bill" is a single-line summary (title + "Saved ₹X" badge + amount +
  chevron) — tapping it opens the Bill Summary sheet with every line item the old
  inline card showed. Tapping "GST & charges" inside it opens the GST breakdown
  sheet on top, showing 3-4 GST rows that sum to the same total shown behind it.
- The footer shows the Happy Customer banner directly above the button, both at
  the same corner radius; the button itself reads
  "₹<amount>   Proceed to Pay →" and is otherwise visually identical to before
  (same color/shadow/size) — no separate price row above it anymore.

- [ ] **Step 3: Confirm the JusPay flow is unaffected**

Tap "Proceed to Pay". Expected: same as before this plan — loading state, then
JusPay's native payment page opens with the cart's exact total (Task 8/9 only
changed the button's `label` string, not `onPress`/`pay()`).

- [ ] **Step 4: Report results**

Note in the PR/commit description which of Steps 2-3 could actually be verified on
a real device with a real subscription item vs. which couldn't (e.g. if no sibling
package exists in the test account's category to exercise Other Subscriptions),
same caveat pattern this repo's other plans already use (see
`docs/superpowers/plans/2026-09-01-kota-ondemand-cluster-menu.md`'s Task 6).

---

## Self-review notes

**Spec coverage:** Every section of the design spec has a task —
radius consistency (implicit throughout, all new views use `rounded-2xl`/`AppSheet`'s
existing shell, Task 8 explicitly cites this), Schedule text size (Task 8 Step 4),
add-ons card (no task — spec says no changes needed, confirmed still true after
reading the actual card code), Other Subscriptions (Tasks 6, 8 Steps 3/5, 9), Tree
Plantation (Tasks 2, 5, 8 Steps 3/6), Bill Summary sheet (Tasks 4, 8 Steps 3/7/8),
GST breakdown sheet (Tasks 1, 3, 8 Step 8), footer (Task 8 Steps 3/7/9). The one
correction made during planning (Tree Plantation not reaching the checkout payload)
is called out explicitly in the Background section with the reasoning, rather than
silently diverging from the approved spec.

**Placeholder scan:** No TBD/TODO/"handle appropriately" language anywhere — every
step shows the actual before/after code, including the full new-component source.

**Type consistency:** `Bill.itemGst`/`deliveryGst`/`packagingGst`/`platformGst`
(added in Task 1) are read with those exact names in `GstBreakdownSheet` (Task 3)
and populated with those exact names in `buildBill()`'s return (Task 1 Step 2).
`Cart.treePlantation: TreePlantation | null` (Task 2) is read via
`cart.treePlantation?.enabled`/`?.receiverName` in `cart.tsx` (Task 8 Step 3) and
written via `setTreePlantation({ enabled, receiverName })` matching the store
action's exact signature (Task 2 Step 2). `OtherSubscriptionsRow`'s `mealCountFor`/
`onAdd`/`packages` props (Task 6) match the call site's prop names exactly (Task 8
Step 5). `buildSwapConfig`'s return type (Task 9) is a literal object matching every
field of `SubscriptionConfig` (`package`, `category`, `deliveryOnWeekends`, `addOns`,
`selectedDates`, `lunch`, `dinner`, `breakfast`, `isDineIn`) with no extra/missing
fields, verified against `src/features/cart/types.ts`'s actual definition rather
than assumed.

**Ordering dependency:** Task 8 (the big `cart.tsx` integration task) depends on
every component task (3-7) and the store/type tasks (1-2) already existing — its
imports would fail to resolve otherwise. Task 9 depends on Task 8 having already
added the `MealPackage` import and the `@/features/cart` import block it extends.
Tasks 1-7 have no dependencies on each other and could be done in any order (or in
parallel by different workers) before Task 8.

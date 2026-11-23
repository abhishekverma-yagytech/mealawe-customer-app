# Order-Mode Theme Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Bulk and On-Demand touchpoint — checkout CTA, sticky cart bar,
item ADD control, order-confirmation icon, plus the card/flow surfaces underneath
(category tiles, kitchen cards, delivery/slot pickers, diet chips, packaging/mode
toggles) on both the home tab and the menu pages — use their own tab's accent color:
Plan Violet for Bulk, Delivery Teal for On-Demand, instead of falling back to green.
Matches the `Subscription Prototype.dc.html` design-sync reference. Also ship a UI
shell for the "Manage subscription" screen (pause/skip/progress) that the prototype
has but the app doesn't, wired to local mock state since no backend endpoint for it
exists yet.

**Architecture:** `src/features/home/tabTheme.ts` already maps each order-mode tab to
an accent color and the bottom nav already tints its own pill per tab — that part
needs no change. The gap is downstream, and it's bigger than just the checkout
button: every checkout CTA uses the shared `<Button variant="primary">` (hardcoded
green), and a full audit of both verticals' card/flow components (Part D) found the
same hardcoded-green pattern repeated across category tiles, delivery/slot pickers,
diet-filter chips, and packaging/mode toggles. This plan adds an opt-in `tone` prop to
`<Button>` and `<QuantityStepper>`, extracts the duplicated Bulk/On-Demand "ADD" pill
into a shared `<ItemAddButton tone>`, threads a `mode` route param into the shared
`/order-result` screen so its success icon and button re-color per mode, and — for the
handful of components that use static Tailwind classes instead of `<Button>` — applies
the same inline-style-override technique used inside `Button.tsx` itself. Subscription's
own CTAs are untouched — they stay green. Part B adds one new screen + one local
Zustand store under `src/features/subscription/manage/`, with no new route
dependencies beyond what already exists (`/addresses`). Part D also fixes one
unrelated pre-existing bug found along the way (a kitchen card's rating badge was
hardcoded green instead of the app's own Rating Gold) and documents one deliberate
exception left unchanged (`BulkCategoryTile`'s per-category gradient identity).

**Tech Stack:** React Native (Expo SDK 57), NativeWind v5 + Tailwind v4, Zustand, no
new dependencies.

**Context:** This plan comes from reviewing `Subscription Prototype.dc.html` (a
Claude Design prototype the design side synced directly from this repo — see
`github.md` in that project) against the current codebase. Two scope decisions were
confirmed with the product owner before writing this plan:
1. The prototype's whole-flow theming (hero, buttons, cart bar, confirmation, all in
   the mode's accent) requires amending `DESIGN.md`'s "Green-Is-Action" and
   "One-Hue-One-Meaning" rules. **Decision: amend DESIGN.md** with a new, narrowly
   scoped "Order-Mode CTA Rule" (Task 8) rather than leaving every CTA green.
2. The prototype also shows a "Manage subscription" screen and a native Navmool
   order flow that don't exist in the app today. Investigation found **zero backend
   support** for pause/skip/delivery-schedule (nothing in
   `src/features/subscription/api.ts` or `src/features/orders/api.ts`), and Navmool is
   `WebView`-only (`src/app/marketplace.tsx`) with no native screen to theme at all.
   **Decision: build the Manage-subscription screen now as a UI shell against local
   mock state** (Part B), explicitly labeled for later backend wiring. **Navmool
   stays untouched** — there is no native UI to re-theme yet; when it goes native,
   apply this same `tone` pattern.
3. A follow-up request asked to also cover "bulk and on-demand design for card and
   flow, also home and menu pages" — i.e. go beyond the top-level checkout screens
   and audit every card component and flow sub-screen in both verticals. That audit
   is Part D. It found the structure of the home teasers and both menu pages already
   matches the prototype closely (no missing screens or layout gaps worth building);
   the real gap was the same hardcoded-green pattern repeated in five more
   components, plus one unrelated color bug caught along the way. See Task 18 for the
   one deliberate exception (`BulkCategoryTile`) left unchanged, flagged for your
   sign-off rather than silently decided either way.

**Verification convention (no unit tests in this project — see `CLAUDE.md`):** every
task is verified with `npx tsc --noEmit`. The final task in each part runs the full
build (`npx expo export --platform android -c`) and a manual visual pass comparing
against `Subscription Prototype.dc.html`'s Bulk/On-Demand screens. Maestro
(`docs/TESTING-WORKFLOW.md`) only needs updating where a task adds a new screen or
tap target — noted per-task; pure recoloring of an already-covered CTA does not need
a new flow or catalogue row, since flow/text selectors don't change.

---

## Part A — Theme-color parity for Bulk / On-Demand checkout

### Task 1: Add a `tone` override to the shared `<Button>`

**Files:**
- Modify: `src/components/ui/Button.tsx`

- [ ] **Step 1: Import `AccentTone` and add the `tone` prop**

```tsx
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';

import { AppText } from './AppText';
import { palette, type AccentTone } from '@/theme';
```

In `ButtonProps`, add after `disabled?: boolean;`:

```tsx
  /**
   * Override the `primary` variant's green with an order-mode accent — Bulk's
   * "Proceed to Pay" passes `tone="plan"`, On-Demand's passes `tone="info"`.
   * Ignored on every other variant. Omit to keep the default green. See the
   * Order-Mode CTA Rule in DESIGN.md — this is the only sanctioned way to put
   * a non-green fill on a primary CTA.
   */
  tone?: AccentTone;
```

- [ ] **Step 2: Read `tone` in the component and apply it to the lift/background**

Add `tone,` to the destructured props (after `disabled = false,`):

```tsx
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  disabled = false,
  tone,
  leftIcon,
  rightIcon,
  className,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const toneColor = variant === 'primary' && tone ? palette.accent[tone] : undefined;
  // A soft brand-tinted lift on the primary CTA so the eye lands on it (the one
  // action per view). Filled variants only; flat/ghost stay flush. `toneColor`
  // (Order-Mode CTA Rule) overrides both the shadow tint and the fill itself —
  // inline style always wins over the `bg-primary` className below it.
  const lift =
    !isDisabled && variant === 'primary'
      ? {
          shadowColor: toneColor ?? palette.brand.green,
          shadowOpacity: 0.35,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
          ...(toneColor ? { backgroundColor: toneColor } : null),
        }
      : undefined;
```

Nothing else in the file changes — `CONTAINER`/`LABEL_CLASS`/`SPINNER_COLOR` stay as-is,
`style={lift}` is already wired to the `Pressable` below.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors (this is a purely additive, optional prop).

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Button.tsx
git commit -m "feat: add tone override to Button for order-mode CTAs"
```

---

### Task 2: Re-theme `BulkCartFooter` and `OnDemandCartFooter`

**Files:**
- Modify: `src/features/bulk/components/BulkCartFooter.tsx`
- Modify: `src/features/on-demand/components/OnDemandCartFooter.tsx`

- [ ] **Step 1: Recolor `BulkCartFooter.tsx`**

Replace the whole file with:

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

/** Sticky "N items · ₹total · View cart" bar shown once the bulk menu cart is
 * non-empty. Tinted Plan Violet — Bulk's own tab accent — per the Order-Mode
 * CTA Rule, not green (green is Subscription's, not every vertical's). */
export function BulkCartFooter({ itemCount, subTotal, onPress }: BulkCartFooterProps) {
  const insets = useSafeAreaInsets();
  if (itemCount === 0) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="absolute inset-x-4 flex-row items-center justify-between rounded-2xl px-5 py-4 active:opacity-90"
      style={{
        bottom: 16 + insets.bottom,
        backgroundColor: palette.accent.plan,
        shadowColor: palette.accent.plan,
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

- [ ] **Step 2: Recolor `OnDemandCartFooter.tsx`**

Same edit, `palette.accent.info` in place of `palette.accent.plan`, comment updated to
say "Delivery Teal":

```tsx
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { IconCart } from '@/components/ui/icons';
import { palette } from '@/theme';

interface OnDemandCartFooterProps {
  itemCount: number;
  subTotal: number;
  onPress: () => void;
}

/** Sticky "N items · ₹total · View cart" bar — identical shape to
 * BulkCartFooter, own copy so each vertical's footer stays independently
 * editable. Tinted Delivery Teal — On-Demand's own tab accent — per the
 * Order-Mode CTA Rule. */
export function OnDemandCartFooter({ itemCount, subTotal, onPress }: OnDemandCartFooterProps) {
  const insets = useSafeAreaInsets();
  if (itemCount === 0) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="absolute inset-x-4 flex-row items-center justify-between rounded-2xl px-5 py-4 active:opacity-90"
      style={{
        bottom: 16 + insets.bottom,
        backgroundColor: palette.accent.info,
        shadowColor: palette.accent.info,
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

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/bulk/components/BulkCartFooter.tsx src/features/on-demand/components/OnDemandCartFooter.tsx
git commit -m "style: recolor bulk/on-demand cart footers to their tab accent"
```

---

### Task 3: Add a `tone` override to `<QuantityStepper>` and wire every call site

**Files:**
- Modify: `src/components/ui/QuantityStepper.tsx`
- Modify: `src/features/bulk/components/BulkMenuItemCard.tsx`
- Modify: `src/features/bulk/components/BulkCartLineItem.tsx`
- Modify: `src/features/bulk/components/CustomFoodBox.tsx`
- Modify: `src/features/on-demand/components/OnDemandItemCard.tsx`
- Modify: `src/app/on-demand-cart.tsx`

- [ ] **Step 1: Add the `tone` prop to `QuantityStepper.tsx`**

Replace the whole file with:

```tsx
import { Pressable, View } from 'react-native';

import { palette, type AccentTone } from '@/theme';

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
  /** Accent for the enabled "+" glyph — defaults to brand green. Bulk passes
   * `"plan"`, On Demand passes `"info"` so the stepper matches that mode's
   * own tab accent instead of green (Order-Mode CTA Rule). */
  tone?: AccentTone;
}

/** `-`/count/`+` stepper, ≥44×44 touch targets. Used by the Bulk and On Demand menu/cart item rows. */
export function QuantityStepper({
  count,
  onIncrease,
  onDecrease,
  disabled = false,
  decreaseLabel = 'Decrease quantity',
  increaseLabel = 'Increase quantity',
  tone,
}: QuantityStepperProps) {
  const canDecrease = !disabled && count > 0;
  const increaseColor = disabled ? palette.neutral.gray400 : tone ? palette.accent[tone] : palette.brand.green;
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
        <IconPlus size={16} color={increaseColor} />
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 2: Pass `tone="plan"` at every Bulk call site**

In `src/features/bulk/components/BulkMenuItemCard.tsx` (inside the `count > 0` branch):

```tsx
              <QuantityStepper
                count={count}
                onIncrease={onIncrease}
                onDecrease={onDecrease}
                decreaseLabel={`Decrease ${item.itemName} quantity`}
                increaseLabel={`Increase ${item.itemName} quantity`}
                tone="plan"
              />
```

In `src/features/bulk/components/BulkCartLineItem.tsx`:

```tsx
          <QuantityStepper
            count={line.count}
            onIncrease={onIncrease}
            onDecrease={onDecrease}
            decreaseLabel={`Decrease ${line.item.itemName} quantity`}
            increaseLabel={`Increase ${line.item.itemName} quantity`}
            tone="plan"
          />
```

In `src/features/bulk/components/CustomFoodBox.tsx` — this file has **two** steppers, the
box-count one and the per-item one in the picker grid. Add `tone="plan"` to both:

```tsx
              <QuantityStepper
                count={boxCount}
                onIncrease={incBox}
                onDecrease={decBox}
                decreaseLabel="Decrease box count"
                increaseLabel="Increase box count"
                tone="plan"
              />
```

```tsx
                      <QuantityStepper
                        count={count}
                        onIncrease={() => incItem(item)}
                        onDecrease={() => decItem(item)}
                        decreaseLabel={`Decrease ${item.itemName} quantity`}
                        increaseLabel={`Increase ${item.itemName} quantity`}
                        tone="plan"
                      />
```

- [ ] **Step 3: Pass `tone="info"` at every On-Demand call site**

In `src/features/on-demand/components/OnDemandItemCard.tsx` (inside the `count > 0` branch):

```tsx
              <QuantityStepper
                count={count}
                onIncrease={onIncrease}
                onDecrease={onDecrease}
                decreaseLabel={`Decrease ${item.itemName} quantity`}
                increaseLabel={`Increase ${item.itemName} quantity`}
                tone="info"
              />
```

In `src/app/on-demand-cart.tsx`:

```tsx
                <QuantityStepper
                  count={line.count}
                  onIncrease={() => change(line.item._id, 1)}
                  onDecrease={() => change(line.item._id, -1)}
                  decreaseLabel={`Decrease ${line.item.itemName} quantity`}
                  increaseLabel={`Increase ${line.item.itemName} quantity`}
                  tone="info"
                />
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/QuantityStepper.tsx \
  src/features/bulk/components/BulkMenuItemCard.tsx \
  src/features/bulk/components/BulkCartLineItem.tsx \
  src/features/bulk/components/CustomFoodBox.tsx \
  src/features/on-demand/components/OnDemandItemCard.tsx \
  src/app/on-demand-cart.tsx
git commit -m "style: tint bulk/on-demand quantity steppers with their tab accent"
```

---

### Task 4: Extract the shared `<ItemAddButton>` and re-theme it

The bordered "ADD" pill in `BulkMenuItemCard.tsx` and `OnDemandItemCard.tsx` is
byte-for-byte duplicated and both hardcode `palette.brand.green`. Extract one shared
component so the two verticals can't drift, and give it the `tone` it needs.

**Files:**
- Create: `src/components/ui/ItemAddButton.tsx`
- Modify: `src/features/bulk/components/BulkMenuItemCard.tsx`
- Modify: `src/features/on-demand/components/OnDemandItemCard.tsx`

- [ ] **Step 1: Create the shared component**

```tsx
import { Pressable } from 'react-native';

import { palette, shadow, useColors, type AccentTone } from '@/theme';

import { AppText } from './AppText';

interface ItemAddButtonProps {
  /** Accent role — Bulk passes `"plan"`, On Demand passes `"info"` (Order-Mode CTA Rule). */
  tone: AccentTone;
  accessibilityLabel: string;
  onPress: () => void;
}

/**
 * Bordered "ADD" pill shown before an item enters the cart — the first stage
 * of the ADD → `<QuantityStepper>` handoff shared by the Bulk and On-Demand
 * menu item cards. Extracted from the two near-identical inline blocks that
 * used to live in `BulkMenuItemCard`/`OnDemandItemCard` so the two verticals
 * can't drift out of sync.
 */
export function ItemAddButton({ tone, accessibilityLabel, onPress }: ItemAddButtonProps) {
  const colors = useColors();
  const color = palette.accent[tone];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        shadow.card,
        {
          backgroundColor: colors.card,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: color,
          paddingHorizontal: 20,
          paddingVertical: 9,
        },
      ]}
      className="active:opacity-70">
      <AppText variant="label" style={{ color }}>
        ADD
      </AppText>
    </Pressable>
  );
}
```

- [ ] **Step 2: Use it in `BulkMenuItemCard.tsx`**

Change the import line from:

```tsx
import { Pressable, View } from 'react-native';
```

to:

```tsx
import { View } from 'react-native';
```

(`Pressable` is no longer used directly in this file once the ADD block below is
replaced.) Add the new import alongside the other `@/components/ui/*` imports:

```tsx
import { ItemAddButton } from '@/components/ui/ItemAddButton';
```

Replace the whole `<Pressable onPress={onIncrease} ... >ADD</Pressable>` block (the
`noCount`/`count === 0` branch) with:

```tsx
            <ItemAddButton tone="plan" accessibilityLabel={`Add ${item.itemName}`} onPress={onIncrease} />
```

- [ ] **Step 3: Use it in `OnDemandItemCard.tsx`**

Same edit: drop `Pressable` from the `react-native` import (it becomes unused), add
`import { ItemAddButton } from '@/components/ui/ItemAddButton';`, and replace that
file's identical ADD block with:

```tsx
              <ItemAddButton tone="info" accessibilityLabel={`Add ${item.itemName}`} onPress={onIncrease} />
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors — specifically no "unused import `Pressable`" in either edited
card file, and no unresolved `ItemAddButton` import.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/ItemAddButton.tsx \
  src/features/bulk/components/BulkMenuItemCard.tsx \
  src/features/on-demand/components/OnDemandItemCard.tsx
git commit -m "refactor: extract shared ItemAddButton, tint per order-mode accent"
```

---

### Task 5: Re-theme the Bulk and On-Demand "Proceed to Pay" CTAs

**Files:**
- Modify: `src/app/bulk-cart.tsx:428-434`
- Modify: `src/app/on-demand-cart.tsx:438-444`

- [ ] **Step 1: `bulk-cart.tsx`**

```tsx
        <Button
          label="Proceed to Pay →"
          size="lg"
          tone="plan"
          disabled={!canCheckout || paying}
          loading={paying}
          onPress={pay}
        />
```

- [ ] **Step 2: `on-demand-cart.tsx`**

```tsx
        <Button
          label="Proceed to Pay →"
          size="lg"
          tone="info"
          disabled={!canCheckout || paying}
          loading={paying}
          onPress={pay}
        />
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/bulk-cart.tsx src/app/on-demand-cart.tsx
git commit -m "style: tint bulk/on-demand checkout CTAs with their tab accent"
```

---

### Task 6: Thread `mode` into `/order-result` and re-theme the confirmation

**Files:**
- Modify: `src/app/cart.tsx:197-200`
- Modify: `src/app/bulk-cart.tsx:251-254`
- Modify: `src/app/on-demand-cart.tsx:228-231`
- Modify: `src/app/order-result.tsx`

- [ ] **Step 1: Pass `mode` from `bulk-cart.tsx`**

```tsx
      router.push({
        pathname: '/order-result',
        params: { status: result.status, orderType: result.orderType, foodOrderId: result.foodOrderId, mode: 'bulk' },
      });
```

- [ ] **Step 2: Pass `mode` from `on-demand-cart.tsx`**

```tsx
      router.push({
        pathname: '/order-result',
        params: { status: result.status, orderType: result.orderType, foodOrderId: result.foodOrderId, mode: 'ondemand' },
      });
```

- [ ] **Step 3: Leave `cart.tsx` (Subscription) unchanged**

Don't add a `mode` param there — `order-result.tsx`'s default (Step 4 below) already
falls back to the veg-green look, which is exactly Subscription's existing
appearance. Confirm the existing block still reads:

```tsx
      router.push({
        pathname: '/order-result',
        params: { status: result.status, orderType: result.orderType, foodOrderId: result.foodOrderId },
      });
```

- [ ] **Step 4: Read `mode` in `order-result.tsx` and theme the icon + button**

Change the import line:

```tsx
import { palette, type AccentTone } from '@/theme';
```

Add a lookup table right after the `COPY` constant:

```tsx
/** Order-Mode CTA Rule: Bulk/On-Demand success screens use their own tab
 * accent instead of green; Subscription (mode absent) keeps the veg-green
 * check it's always had — `palette.accent.veg` and `palette.brand.green` are
 * the same hex, so omitting `mode` here is visually a no-op for it. */
const ORDER_MODE_TONE: Partial<Record<string, AccentTone>> = {
  bulk: 'plan',
  ondemand: 'info',
  dinein: 'food',
};
```

Update the params destructure:

```tsx
  const { status: rawStatus, orderType, foodOrderId, mode } = useLocalSearchParams<{
    status?: string;
    orderType?: string;
    foodOrderId?: string;
    mode?: string;
  }>();
```

Add, right after `initialStatus`/`resolved` are set up (before the pending-state
early return):

```tsx
  const successTone: AccentTone = (mode && ORDER_MODE_TONE[mode]) || 'veg';
```

Update the pending-state `ActivityIndicator` color (`palette.accent.veg` and
`palette.brand.green` are the same hex, so this is a no-op for Subscription):

```tsx
        <ActivityIndicator size="large" color={palette.accent[successTone]} />
```

Update the success/failed icon block:

```tsx
      {resolved === 'success' ? (
        <AccentIcon icon={IconCheckCircle} tone={successTone} size={40} tileSize={84} />
      ) : (
        <AccentIcon icon={IconComplaint} tone="nonveg" size={40} tileSize={84} />
      )}
```

Update the "View my orders" button:

```tsx
        {resolved === 'failed' ? (
          <Button label="Try again" block onPress={() => router.back()} />
        ) : (
          <Button
            label="View my orders"
            block
            tone={successTone === 'veg' ? undefined : successTone}
            onPress={() => router.replace('/my-orders')}
          />
        )}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/cart.tsx src/app/bulk-cart.tsx src/app/on-demand-cart.tsx src/app/order-result.tsx
git commit -m "feat: theme order-result confirmation per order mode"
```

---

### Task 7: Manual visual verification against the prototype

**Files:** none (verification only)

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: zero errors project-wide.

- [ ] **Step 2: Full export build**

Run: `npx expo export --platform android -c`
Expected: build completes with no bundling errors.

- [ ] **Step 3: Manual walkthrough**

On a device/emulator (or `npx expo start` + dev client): add a Bulk item → confirm the
ADD pill, quantity stepper `+`, sticky cart bar, and "Proceed to Pay" button are all
Plan Violet (`#6C5CE7`) → complete/cancel checkout → confirm the order-result icon and
"View my orders" button are also violet. Repeat for On-Demand, expecting Delivery Teal
(`#159AAB`) throughout. Confirm Subscription's own checkout (cart.tsx → order-result)
is unchanged — still green end to end. Compare side-by-side against
`Subscription Prototype.dc.html`'s Bulk/On-Demand screens for the accent.

- [ ] **Step 4: Grep for any stray hardcoded green left in the two verticals**

```bash
grep -rn "brand.green\|#63[Aa][Bb]45\|#518937" src/features/bulk src/features/on-demand src/app/bulk-cart.tsx src/app/on-demand-cart.tsx
```

Expected: no matches (a match here means a call site was missed in Tasks 2-6).

---

## Part B — Design system amendment (write alongside Part A, before or after Task 7)

### Task 8: Amend `DESIGN.md` and `docs/DESIGN-REFERENCE.md`

**Files:**
- Modify: `DESIGN.md:188-193` (Named Rules), `DESIGN.md:241-242` (Buttons), `DESIGN.md:283-284` (Do's)
- Modify: `docs/DESIGN-REFERENCE.md` (insert after line 60, before "### 2b.")

- [ ] **Step 1: Add the new named rule to `DESIGN.md`**

Find:

```markdown
### Named Rules
**The Green-Is-Action Rule.** Leaf green appears only on the one primary CTA, current
selection, and the veg meaning. Never as a section background, never decorative.
**The One-Hue-One-Meaning Rule.** A location pin is always Location Blue; a coupon is
always Reward Pink. Pick the accent by meaning, not by looks.

## 3. Typography
```

Replace with:

```markdown
### Named Rules
**The Green-Is-Action Rule.** Leaf green appears only on the one primary CTA, current
selection, and the veg meaning. Never as a section background, never decorative.
**The One-Hue-One-Meaning Rule.** A location pin is always Location Blue; a coupon is
always Reward Pink. Pick the accent by meaning, not by looks.
**The Order-Mode CTA Rule.** Inside a specific order-mode flow — Bulk or On-Demand
checkout only — that mode's own tab accent (Plan Violet for Bulk, Delivery Teal for
On-Demand) replaces green on the flow's primary CTA, its sticky cart bar, the item ADD
control, and the order-confirmation check. This is a scoped exception, not a repeal:
Subscription's CTAs, the veg dot, and every icon-tile meaning elsewhere in the app stay
exactly as the Green-Is-Action and One-Hue-One-Meaning rules describe. Use `<Button
tone>` / `<QuantityStepper tone>` / `<ItemAddButton tone>` — never a bare hex.

## 3. Typography
```

- [ ] **Step 2: Note the exception in the Buttons section**

Find:

```markdown
- **Primary:** Solid leaf-green (#63AB45), white bold label, brand-tinted CTA lift,
  `active:opacity-90` press. One per view.
```

Replace with:

```markdown
- **Primary:** Solid leaf-green (#63AB45), white bold label, brand-tinted CTA lift,
  `active:opacity-90` press. One per view. Exception: a Bulk/On-Demand checkout CTA
  passes `tone` to recolor fill + lift in that mode's own accent (Order-Mode CTA Rule).
```

- [ ] **Step 3: Add a Do bullet**

Find:

```markdown
- **Do** reserve leaf-green (#63AB45) for the one primary CTA, current selection, and the
  veg meaning — the Green-Is-Action Rule.
- **Do** pick every non-green icon colour by meaning from the accent set (location = blue,
```

Replace with:

```markdown
- **Do** reserve leaf-green (#63AB45) for the one primary CTA, current selection, and the
  veg meaning — the Green-Is-Action Rule.
- **Do** use `tone` on Bulk/On-Demand checkout CTAs, cart bars, and ADD controls to match
  that mode's tab accent instead of green — the Order-Mode CTA Rule's one scoped exception.
- **Do** pick every non-green icon colour by meaning from the accent set (location = blue,
```

- [ ] **Step 4: Add the practical "how" section to `docs/DESIGN-REFERENCE.md`**

Insert after line 60 (`**Green never appears on a non-actionable surface.** ...
Buttons are solid single colors — never gradients.`) and before `### 2b. Icons — the
"Modern Fresh" accent system`:

```markdown
### 2a-i. Order-mode CTA exception (Bulk / On-Demand only)

Bulk and On-Demand checkout touchpoints — the "Proceed to Pay"/"Pay now" CTA, the sticky
`BulkCartFooter`/`OnDemandCartFooter` bar, the menu item `<ItemAddButton>`, the
`<QuantityStepper>`'s `+`, and the `/order-result` success icon — pass `tone` to swap
green for that mode's own tab accent (`"plan"` for Bulk, `"info"` for On-Demand),
matching the color already used for their tab pill in `HomeBottomNav`. This is the
**only** place a non-green color is allowed on a primary CTA — see the Order-Mode CTA
Rule in `DESIGN.md`. Subscription and Dine In CTAs are unaffected and stay green.

| Component | Prop | Bulk | On-Demand |
| --- | --- | --- | --- |
| `<Button variant="primary">` | `tone` | `"plan"` | `"info"` |
| `<QuantityStepper>` | `tone` | `"plan"` | `"info"` |
| `<ItemAddButton>` | `tone` (required) | `"plan"` | `"info"` |
| `/order-result` success icon | via `mode` route param | `"plan"` | `"info"` |
```

- [ ] **Step 5: Commit**

```bash
git add DESIGN.md docs/DESIGN-REFERENCE.md
git commit -m "docs: add the Order-Mode CTA Rule design-system exception"
```

---

## Part C — Manage-subscription UI shell (mock state, no backend yet)

### Task 9: Add the `IconPause`/`IconPlay` aliases

**Files:**
- Modify: `src/components/ui/icons.tsx`

- [ ] **Step 1: Add two Lucide aliases**

In the `export { ... } from 'lucide-react-native';` block, add (anywhere in the list,
grouped near `IconRepeat`):

```tsx
  Pause as IconPause,
  Play as IconPlay,
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/icons.tsx
git commit -m "feat: add IconPause/IconPlay aliases"
```

---

### Task 10: Mock data + local store for Manage Subscription

**Files:**
- Create: `src/features/subscription/manage/mockManageData.ts`
- Create: `src/features/subscription/manage/useManageSubscriptionStore.ts`

- [ ] **Step 1: Mock data module**

```tsx
/**
 * UI-only mock for the "Manage subscription" screen. There is no pause/skip/
 * delivery-schedule endpoint anywhere in the backend yet (checked
 * `src/features/subscription/api.ts` and `src/features/orders/api.ts` — the
 * concepts don't exist). This module + `useManageSubscriptionStore` let the
 * screen ship now; swap both for a real API-backed hook later without
 * touching `manage-subscription.tsx`'s rendering code.
 */
export interface ManageDay {
  id: string;
  dow: string;
  date: string;
  dish: string;
}

export const MOCK_MANAGE_PLAN = {
  planName: 'Special Thali · Monthly Plan',
  mealsWord: 'Lunch only',
  totalMeals: 30,
  deliveredMeals: 20,
  renewNote: 'Renews in 10 days · cancel anytime',
};

export const MOCK_MANAGE_DAYS: ManageDay[] = [
  { id: '12', dow: 'TUE', date: '12', dish: 'Rajma · Aloo Jeera' },
  { id: '13', dow: 'WED', date: '13', dish: 'Paneer · Jeera Rice' },
  { id: '14', dow: 'THU', date: '14', dish: 'Chole · Phulka' },
  { id: '15', dow: 'FRI', date: '15', dish: 'Kadhi · Bhindi' },
  { id: '16', dow: 'SAT', date: '16', dish: 'Veg Pulao · Raita' },
];
```

- [ ] **Step 2: Local Zustand store**

```tsx
import { create } from 'zustand';

interface ManageSubscriptionState {
  paused: boolean;
  skippedDayIds: Record<string, true>;
  togglePause: () => void;
  toggleSkip: (dayId: string) => void;
}

/**
 * Local-only state for the "Manage subscription" screen. TODO(backend):
 * replace with a real subscription-status + pause/skip API once one exists
 * (see the note in `mockManageData.ts`) — nothing here persists past the app
 * session or reaches the server.
 */
export const useManageSubscriptionStore = create<ManageSubscriptionState>((set) => ({
  paused: false,
  skippedDayIds: {},
  togglePause: () => set((s) => ({ paused: !s.paused })),
  toggleSkip: (dayId) =>
    set((s) => {
      const next = { ...s.skippedDayIds };
      if (next[dayId]) {
        delete next[dayId];
      } else {
        next[dayId] = true;
      }
      return { skippedDayIds: next };
    }),
}));
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/subscription/manage/mockManageData.ts src/features/subscription/manage/useManageSubscriptionStore.ts
git commit -m "feat: add mock data + local store for Manage Subscription"
```

---

### Task 11: Build the `manage-subscription` screen

**Files:**
- Create: `src/app/manage-subscription.tsx`

- [ ] **Step 1: Write the screen**

```tsx
import { Stack, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ComponentType } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { IconMapPin, IconPause, IconPlay, IconRepeat, type IconProps } from '@/components/ui/icons';
import { MOCK_MANAGE_DAYS, MOCK_MANAGE_PLAN } from '@/features/subscription/manage/mockManageData';
import { useManageSubscriptionStore } from '@/features/subscription/manage/useManageSubscriptionStore';
import { palette, shadow, useColors, type AccentTone } from '@/theme';

/**
 * "My subscription" — pause/skip and a next-7-days delivery list. UI-only:
 * no pause/skip/delivery-schedule endpoint exists in the backend yet, so
 * every action here mutates `useManageSubscriptionStore`'s local state, not
 * a server. Swap in real API calls once one exists — this screen's rendering
 * shouldn't need to change, only the store's actions. Stays green throughout
 * — Subscription's own flow is unaffected by the Order-Mode CTA Rule.
 */
export default function ManageSubscriptionScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const paused = useManageSubscriptionStore((s) => s.paused);
  const skippedDayIds = useManageSubscriptionStore((s) => s.skippedDayIds);
  const togglePause = useManageSubscriptionStore((s) => s.togglePause);
  const toggleSkip = useManageSubscriptionStore((s) => s.toggleSkip);

  const plan = MOCK_MANAGE_PLAN;
  const skippedCount = Object.keys(skippedDayIds).length;
  const remaining = plan.totalMeals - plan.deliveredMeals;
  const progressPct = Math.round((plan.deliveredMeals / plan.totalMeals) * 100);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'My subscription' }} />
      <StatusBar style="auto" />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 20, gap: 12 }}>
        <View style={{ backgroundColor: palette.brand.teal, borderRadius: 18, padding: 16 }}>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center" style={{ gap: 7 }}>
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  backgroundColor: paused ? palette.brand.yellow : palette.brand.green,
                }}
              />
              <AppText variant="overline" style={{ color: paused ? palette.brand.yellow : palette.brand.cream }}>
                {paused ? 'PAUSED' : 'ACTIVE'}
              </AppText>
            </View>
            <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {plan.renewNote}
            </AppText>
          </View>
          <AppText variant="h2" className="mt-2" style={{ color: '#fff' }}>
            {plan.planName}
          </AppText>
          <AppText variant="bodySm" style={{ color: 'rgba(255,255,255,0.8)' }}>
            {plan.mealsWord}
          </AppText>
          <View
            style={{
              height: 6,
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.18)',
              marginTop: 16,
              overflow: 'hidden',
            }}>
            <View style={{ width: `${progressPct}%`, height: '100%', backgroundColor: palette.brand.green }} />
          </View>
          <View className="mt-2 flex-row justify-between">
            <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }}>
              {plan.deliveredMeals} of {plan.totalMeals} meals delivered
            </AppText>
            <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }}>
              {remaining} meals left
            </AppText>
          </View>
        </View>

        <View className="flex-row" style={{ gap: 10 }}>
          <QuickActionTile
            icon={paused ? IconPlay : IconPause}
            label={paused ? 'Resume' : 'Pause'}
            tone="plan"
            onPress={togglePause}
          />
          <QuickActionTile icon={IconRepeat} label="Swap" tone="offer" />
          <QuickActionTile
            icon={IconMapPin}
            label="Address"
            tone="location"
            onPress={() => router.push('/addresses')}
          />
        </View>

        <View style={[shadow.card, { backgroundColor: colors.card, borderRadius: 18, padding: 14 }]}>
          <View className="flex-row items-baseline justify-between">
            <AppText variant="title" className="text-foreground">
              Next 7 days
            </AppText>
            <AppText variant="caption" className="text-muted-foreground">
              Tap a day to skip
            </AppText>
          </View>
          <View className="mt-3" style={{ gap: 10 }}>
            {MOCK_MANAGE_DAYS.map((day) => {
              const skipped = !!skippedDayIds[day.id] || paused;
              return (
                <Pressable
                  key={day.id}
                  onPress={() => toggleSkip(day.id)}
                  disabled={paused}
                  accessibilityRole="button"
                  accessibilityLabel={`${skipped ? 'Unskip' : 'Skip'} ${day.dow} ${day.date}, ${day.dish}`}
                  className="flex-row items-center rounded-2xl border border-border p-3 active:opacity-70"
                  style={{ gap: 12, backgroundColor: skipped ? colors.muted : colors.card }}>
                  <View style={{ width: 34, alignItems: 'center' }}>
                    <AppText variant="caption" className="text-muted-foreground">
                      {day.dow}
                    </AppText>
                    <AppText variant="label" style={{ color: skipped ? colors.mutedForeground : colors.foreground }}>
                      {day.date}
                    </AppText>
                  </View>
                  <AppText
                    variant="body"
                    className="flex-1"
                    style={{
                      color: skipped ? colors.mutedForeground : colors.foreground,
                      textDecorationLine: skipped ? 'line-through' : 'none',
                    }}>
                    {day.dish}
                  </AppText>
                  <View
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 9,
                      paddingVertical: 5,
                      backgroundColor: skipped ? colors.card : `${palette.brand.green}1A`,
                    }}>
                    <AppText variant="caption" style={{ color: skipped ? colors.mutedForeground : palette.brand.greenDark }}>
                      {paused ? 'Paused' : skipped ? 'Skipped' : 'On'}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View
        className="flex-row items-center justify-between border-t border-border bg-card px-4 pt-3"
        style={{ paddingBottom: insets.bottom + 12, gap: 12 }}>
        <AppText variant="bodySm" className="flex-1 text-muted-foreground">
          {remaining} meals left{skippedCount > 0 ? ` · ${skippedCount} skipped` : ''}
        </AppText>
        <Button label="Extend plan" onPress={() => router.push('/(tabs)' as Href)} />
      </View>
    </View>
  );
}

function QuickActionTile({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: ComponentType<IconProps>;
  label: string;
  tone: AccentTone;
  onPress?: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[shadow.card, { flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 12, alignItems: 'center' }]}
      className="active:opacity-80">
      <AccentIcon icon={icon} tone={tone} size={16} tileSize={32} />
      <AppText variant="label" className="mt-2 text-foreground">
        {label}
      </AppText>
    </Pressable>
  );
}
```

Note: "Swap" has no `onPress` (renders disabled/inert) — there is no swap-a-meal flow
anywhere in the app yet, and faking one would be worse than an honest inert tile.
"Address" reuses the real, already-shipped `/addresses` route. "Extend plan" returns to
the Subscription tab to browse plans again — there's no dedicated "extend" flow either,
and this is the closest real, working action.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/manage-subscription.tsx
git commit -m "feat: add Manage Subscription screen (UI shell, local mock state)"
```

---

### Task 12: Wire the entry point from `orders.tsx`

**Files:**
- Modify: `src/app/orders.tsx`

- [ ] **Step 1: Add a "Manage subscription" card above the ACTIVE section**

Add the import:

```tsx
import { AccentIcon } from '@/components/ui/AccentIcon';
import { IconRepeat } from '@/components/ui/icons';
```

(`AccentIcon` is already imported in this file for the empty state — don't duplicate
the import, just add `IconRepeat` to the existing `icons` import line.)

Change the `ongoing.length > 0` block to show the manage entry point above the list:

```tsx
          {ongoing.length > 0 ? (
            <View style={{ gap: 12 }}>
              <AppText variant="overline" className="text-muted-foreground">
                ACTIVE
              </AppText>
              <Pressable
                onPress={() => router.push('/manage-subscription' as Href)}
                accessibilityRole="button"
                className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3.5 active:opacity-80">
                <AccentIcon icon={IconRepeat} tone="veg" size={18} tileSize={40} />
                <AppText variant="label" className="flex-1 text-foreground">
                  Manage subscription
                </AppText>
              </Pressable>
              {ongoing.map((o) => (
                <OrderRow key={o.id} order={o} tracked onPress={() => open(o)} />
              ))}
            </View>
          ) : null}
```

Add `Pressable` to the existing `react-native` import (`RefreshControl, ScrollView,
View` → `Pressable, RefreshControl, ScrollView, View`).

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/orders.tsx
git commit -m "feat: link Manage subscription from the active-orders list"
```

---

### Task 13: Maestro flow + test-catalogue rows for the new screen

Unlike Part A (pure recoloring of already-covered flows), this adds a brand-new
screen and new tap targets, so `docs/TESTING-WORKFLOW.md` applies in full.

**Files:**
- Create: `.maestro/flows/manage-subscription.yaml`
- Modify: `.maestro/README.md` (flow index table)
- Modify: `scripts/generate-test-catalogue.mjs`

- [ ] **Step 1: Author the Maestro flow**

```yaml
appId: com.mealawe.app
---
# MANUAL: requires an authenticated session with at least one ongoing
# subscription order. Assumes app is on /orders with an ACTIVE section visible.
- assertVisible: "Manage subscription"
- tapOn: "Manage subscription"
- assertVisible: "My subscription"
- assertVisible: "Next 7 days"
- tapOn: "Pause"
- assertVisible: "Resume"
- tapOn: "Resume"
- assertVisible: "Pause"
```

- [ ] **Step 2: Add it to the flow index table**

In `.maestro/README.md`, add a row to the "Flow index" table:

```markdown
| `manage-subscription.yaml` | Manage subscription: pause/resume toggle | **Manual** |
```

- [ ] **Step 3: Add catalogue rows**

In `scripts/generate-test-catalogue.mjs`, add to the `Subscription:` array (after
`SUB-06`):

```js
    ['SUB-07', 'Subscription', 'Manage subscription entry point shown for active plans', '≥1 ongoing subscription order', 'Open Orders screen', '"Manage subscription" card shown above the ACTIVE section', 'P1'],
    ['SUB-08', 'Subscription', 'Pause toggles status pill and disables day-skip taps', 'On /manage-subscription', 'Tap "Pause"', 'Status pill reads "PAUSED"; every day row shows "Paused" and stops responding to taps', 'P1'],
    ['SUB-09', 'Subscription', 'Skipping a day shows a strikethrough + "Skipped" pill', 'On /manage-subscription, not paused', 'Tap a day row', 'Dish name gets a strikethrough, pill changes to "Skipped"; tapping again undoes it', 'P1'],
```

Add to the `FULL_FLOW` array (after `E2E-42`, renumbering not needed — append at the end):

```js
  ['E2E-43', 'Subscription', 'Manage subscription: pause and skip a day', 'Ongoing subscription order exists', 'Orders → "Manage subscription" → tap Pause → tap Resume → tap a day row', 'Status pill and day rows update immediately; local-only state (no backend call — noted as UI shell in the plan)', 'P1', 'manage-subscription.yaml (manual)'],
```

- [ ] **Step 4: Regenerate the workbook**

```bash
npm install --no-save exceljs
node scripts/generate-test-catalogue.mjs
```

Expected: `docs/TEST-CATALOGUE.xlsx` rewritten with no errors, 3 new Subscription rows
+ 1 new full-flow row.

- [ ] **Step 5: Commit**

```bash
git add .maestro/flows/manage-subscription.yaml .maestro/README.md \
  scripts/generate-test-catalogue.mjs docs/TEST-CATALOGUE.xlsx
git commit -m "test: add Maestro flow + catalogue rows for Manage Subscription"
```

---

### Task 14: Final build verification for Part C

**Files:** none (verification only)

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: zero errors project-wide.

- [ ] **Step 2: Full export build**

Run: `npx expo export --platform android -c`
Expected: build completes with no bundling errors.

- [ ] **Step 3: Manual walkthrough**

Orders → "Manage subscription" → confirm the status card, progress bar, quick-action
tiles, and next-7-days list render; tap Pause (pill flips to PAUSED, day rows gray out
and stop responding), tap Resume, tap a day to skip it (strikethrough + "Skipped"
pill), tap "Address" (opens the real `/addresses` screen), tap "Extend plan" (returns
to the Subscription tab).

---

## Part D — Bulk / On-Demand card & flow color-consistency pass

Going deeper than the top-level checkout screens: this part audits every reusable
Bulk/On-Demand **card component and flow sub-screen** — category tiles, kitchen cards,
delivery/slot pickers, diet chips, packaging/mode toggles, the home-tab teasers, and the
menu pages — for the same "falls back to green instead of its own tab accent" gap Parts
A-C already fixed on the main checkout path. It found five more real spots, one
unrelated correctness bug caught along the way, and confirms the home/menu page
**structure** already matches the prototype (the gap was color, not layout).

### Task 15: Recolor remaining Bulk-vertical spots to Plan Violet

**Files:**
- Modify: `src/app/bulk-menu.tsx:122-134`
- Modify: `src/features/bulk/components/BulkDeliveryPicker.tsx`
- Modify: `src/features/bulk/components/CustomFoodBox.tsx`
- Modify: `src/features/bulk/components/BulkCouponCard.tsx:71`

- [ ] **Step 1: `bulk-menu.tsx`'s Individual/Bulk packaging toggle**

```tsx
        <Button
          label="Individual"
          variant={packaging === 'individual' ? 'primary' : 'outline'}
          tone={packaging === 'individual' ? 'plan' : undefined}
          size="sm"
          onPress={() => setPackaging('individual')}
        />
        <Button
          label="Bulk"
          variant={packaging === 'bulk' ? 'primary' : 'outline'}
          tone={packaging === 'bulk' ? 'plan' : undefined}
          size="sm"
          onPress={() => setPackaging('bulk')}
        />
```

- [ ] **Step 2: `BulkDeliveryPicker.tsx`'s date + slot chips**

These use static Tailwind classes (`border-primary bg-primary`), not the `<Button>`
primitive — `bg-accent-plan`/`border-accent-plan` utility classes are unverified in this
codebase (grepped: zero existing usages anywhere, despite being documented), so use the
same inline-style-override technique as `Button.tsx`'s `tone`, not an unproven class name.

Add `palette` to the theme import:

```tsx
import { palette, shadow } from '@/theme';
```

Replace the date-chip `Pressable`:

```tsx
              <Pressable
                key={d}
                onPress={() => onSelectDate(d)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className={`items-center rounded-xl border px-3 py-2 ${active ? '' : 'border-border'}`}
                style={active ? { borderColor: palette.accent.plan, backgroundColor: palette.accent.plan } : undefined}>
                <AppText variant="caption" className={active ? 'text-white/80' : 'text-muted-foreground'}>
                  {dayOfWeek(d)}
                </AppText>
                <AppText variant="bodySm" className={active ? 'text-white' : 'text-foreground'}>
                  {formatShort(d)}
                </AppText>
              </Pressable>
```

Replace the slot-chip `Pressable`:

```tsx
            <Pressable
              key={s.start}
              onPress={() => onSelectSlot(s)}
              accessibilityRole="button"
              accessibilityState={{ selected: slot?.start === s.start }}
              className={`rounded-xl border px-3 py-2 ${slot?.start === s.start ? '' : 'border-border'}`}
              style={slot?.start === s.start ? { borderColor: palette.accent.plan, backgroundColor: palette.accent.plan } : undefined}>
              <AppText variant="bodySm" className={slot?.start === s.start ? 'text-white' : 'text-foreground'}>
                {s.start}–{s.end}
              </AppText>
            </Pressable>
```

- [ ] **Step 3: `CustomFoodBox.tsx`'s selected-item border**

```tsx
                    borderColor: selected ? palette.accent.plan : colors.border,
```

(replacing `borderColor: selected ? palette.brand.green : colors.border,`)

- [ ] **Step 4: `CustomFoodBox.tsx`'s per-item "Add" pill**

```tsx
                      <Pressable
                        onPress={() => incItem(item)}
                        accessibilityRole="button"
                        className="items-center rounded-full border py-1 active:opacity-70"
                        style={{ borderColor: palette.accent.plan }}>
                        <AppText variant="caption" style={{ color: palette.accent.plan }}>
                          Add
                        </AppText>
                      </Pressable>
```

(replacing the `border-primary`/`text-primary` version)

- [ ] **Step 5: `CustomFoodBox.tsx`'s "Add box" button**

```tsx
              <Button label="Add box" onPress={addBox} disabled={!canAdd} size="sm" tone="plan" />
```

- [ ] **Step 6: `BulkCouponCard.tsx`'s best-coupon "Apply" button**

```tsx
              <Button label="Apply" size="sm" onPress={onApplyBest} tone="plan" />
```

(This screen already has "Proceed to Pay" as its one true primary CTA — leaving this
second `Apply` button green would read as a second, competing CTA once everything else
on the Bulk cart turns violet.)

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/bulk-menu.tsx \
  src/features/bulk/components/BulkDeliveryPicker.tsx \
  src/features/bulk/components/CustomFoodBox.tsx \
  src/features/bulk/components/BulkCouponCard.tsx
git commit -m "style: recolor remaining bulk card/flow surfaces to Plan Violet"
```

---

### Task 16: Recolor remaining On-Demand-vertical spots to Delivery Teal

**Files:**
- Modify: `src/features/on-demand/components/ModeToggle.tsx`
- Modify: `src/features/on-demand/components/VegFilterChips.tsx`
- Modify: `src/features/on-demand/components/OnDemandSlotPicker.tsx`

- [ ] **Step 1: `ModeToggle.tsx`'s Daily/Advance toggle** (used on `on-demand-kitchen.tsx`)

```tsx
      {showDaily ? (
        <Button
          label="Daily"
          variant={mode === 'allDay' ? 'primary' : 'outline'}
          tone={mode === 'allDay' ? 'info' : undefined}
          size="sm"
          onPress={() => onChange('allDay')}
          accessibilityState={{ selected: mode === 'allDay' }}
        />
      ) : null}
      {showAdvance ? (
        <Button
          label="Advance"
          variant={mode === 'advance' ? 'primary' : 'outline'}
          tone={mode === 'advance' ? 'info' : undefined}
          size="sm"
          onPress={() => onChange('advance')}
          accessibilityState={{ selected: mode === 'advance' }}
        />
      ) : null}
```

- [ ] **Step 2: `VegFilterChips.tsx`** (used on both `OnDemandHome.tsx` and `on-demand-kitchen.tsx` — this component is On-Demand-only, so it's unconditionally teal, no `tone` prop needed)

```tsx
import { Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { DietMark } from '@/components/ui/DietMark';
import { palette } from '@/theme';

export type DietFilter = 'Veg' | 'NonVeg' | 'Jain' | null;

interface VegFilterChipsProps {
  value: DietFilter;
  onChange: (value: DietFilter) => void;
}

/** Single-select Veg/Non-veg/Jain filter row — tapping the active chip again
 * clears the filter (mirrors the legacy's `changeItemFilter`'s crossIcon-to-clear).
 * Tinted Delivery Teal (this vertical's own tab accent) when active — this
 * component only ever renders inside On-Demand screens. */
export function VegFilterChips({ value, onChange }: VegFilterChipsProps) {
  const chip = (label: DietFilter, text: string) => {
    const active = value === label;
    return (
      <Pressable
        onPress={() => onChange(active ? null : label)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        className={`flex-row items-center self-start gap-2 rounded-full border px-4 py-2.5 ${active ? '' : 'border-border'}`}
        style={active ? { borderColor: palette.accent.info, backgroundColor: palette.accent.info } : undefined}>
        {label !== 'Jain' ? <DietMark veg={label === 'Veg'} size={12} /> : null}
        <AppText variant="caption" className={active ? 'text-white' : 'text-foreground'}>
          {text}
        </AppText>
      </Pressable>
    );
  };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {chip('Veg', 'Veg')}
      {chip('NonVeg', 'Non-Veg')}
      {chip('Jain', 'Jain')}
    </ScrollView>
  );
}
```

- [ ] **Step 3: `OnDemandSlotPicker.tsx`'s date + slot chips** (used on `on-demand-cart.tsx`)

Add `palette` to the theme import:

```tsx
import { palette, shadow } from '@/theme';
```

Replace the date-chip `Pressable`:

```tsx
                  <Pressable
                    key={d}
                    onPress={() => onSelectDate(d)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`items-center rounded-xl border px-3 py-2 ${active ? '' : 'border-border'}`}
                    style={active ? { borderColor: palette.accent.info, backgroundColor: palette.accent.info } : undefined}>
                    <AppText variant="caption" className={active ? 'text-white/80' : 'text-muted-foreground'}>
                      {dayOfWeek(d)}
                    </AppText>
                    <AppText variant="bodySm" className={active ? 'text-white' : 'text-foreground'}>
                      {formatShort(d)}
                    </AppText>
                  </Pressable>
```

Replace the slot-chip `Pressable`:

```tsx
              <Pressable
                key={s.start}
                onPress={() => onSelectSlot(s)}
                accessibilityRole="button"
                accessibilityState={{ selected: slot?.start === s.start }}
                className={`rounded-xl border px-3 py-2 ${slot?.start === s.start ? '' : 'border-border'}`}
                style={slot?.start === s.start ? { borderColor: palette.accent.info, backgroundColor: palette.accent.info } : undefined}>
                <AppText variant="bodySm" className={slot?.start === s.start ? 'text-white' : 'text-foreground'}>
                  {s.start}–{s.end}
                </AppText>
              </Pressable>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/on-demand/components/ModeToggle.tsx \
  src/features/on-demand/components/VegFilterChips.tsx \
  src/features/on-demand/components/OnDemandSlotPicker.tsx
git commit -m "style: recolor remaining on-demand card/flow surfaces to Delivery Teal"
```

---

### Task 17: Fix `OnDemandKitchenCard`'s rating badge (pre-existing bug) and speed tag

**Files:**
- Modify: `src/features/on-demand/components/OnDemandKitchenCard.tsx`

While auditing this card, found the rating pill is hardcoded green — that's wrong
independent of this plan's Order-Mode CTA work: `DESIGN.md`'s Tertiary accent set
reserves **Rating Gold** (`palette.accent.rating`, `#F5A623`) for stars/ratings
everywhere else in the app (see `statusTone()` in `orderStatus.ts` and the star icon
in `on-demand-kitchen.tsx`'s header, both already gold). This card is the one place
that never got the memo. Fixing it here since it's the same file already being touched.

- [ ] **Step 1: Fix the rating badge color**

```tsx
        {kitchen.rating ? (
          <View
            className="absolute bottom-1.5 left-1.5 flex-row items-center gap-1 rounded-full px-1.5 py-0.5"
            style={{ backgroundColor: palette.accent.rating }}>
            <IconStar size={10} color="#ffffff" fill="#ffffff" />
            <AppText variant="caption" className="text-white">
              {kitchen.rating.toFixed(1)}
            </AppText>
          </View>
        ) : null}
```

(replacing `backgroundColor: palette.brand.green`)

- [ ] **Step 2: Recolor the "Near & Fast" speed tag to Delivery Teal**

```tsx
        {speed ? (
          <View className="flex-row items-center gap-1">
            <IconZap size={12} color={palette.accent.info} fill={palette.accent.info} />
            <AppText variant="caption" style={{ color: palette.accent.info }} numberOfLines={1}>
              {speed}
            </AppText>
          </View>
        ) : null}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/on-demand/components/OnDemandKitchenCard.tsx
git commit -m "fix: correct OnDemandKitchenCard's rating badge to Rating Gold, tint speed tag teal"
```

---

### Task 18: Home & menu page review — no structural changes, one documented exception

**Files:** none (review only — documents a decision, doesn't change code)

Checked the Home tab's Bulk/On-Demand teasers and both menu pages against the
prototype's corresponding screens:

- **Bulk home teaser** (`src/app/(tabs)/index.tsx:260-284`) — title + subtitle + a
  3-across category row. Matches the prototype's structure (title, subtitle, category
  grid). One content gap: the prototype has a "HOW SLABS WORK" info banner below the
  grid explaining slab pricing; the app has none. **Optional, not required** — call it
  out to the user as a nice-to-have, don't build it as part of this plan.
- **On-Demand home** (`OnDemandHome.tsx`) — title + subtitle + search + diet chips +
  a near/other kitchen grid. Already matches the prototype's home odTab structure
  (search, diet chips, "KITCHENS NEAR YOU" grid) almost exactly — the only gap was the
  color inconsistencies fixed in Tasks 16-17, not layout.
- **`bulk-menu.tsx`** — packaging toggle + search + item list + sticky cart bar.
  Matches the prototype's bulkMenu screen structure. The prototype's packaging
  selector is a taller bordered radio-card with a checkbox; the app's is two small
  pill buttons. Functionally equivalent, more compact — **not changing this**, it's a
  legitimate simpler alternative, not a bug.
- **`on-demand-kitchen.tsx`** — header meta (distance/rating) + search + Daily/Advance
  mode toggle + diet chips + sectioned item list + sticky cart bar. Matches the
  prototype's isOdKitchen screen structure (odWhen mode cards + odGroups sections)
  closely. No structural gap — only the color fixes in Task 16.
- **`BulkCategoryTile.tsx`** — **reviewed, intentionally left unchanged.** The
  prototype's bulk category cards are flat photo cards (name/tag/meta text). This
  app's version is a more polished gradient-hero tile with a per-category color
  identity (green=Meals, yellow=Snacks, teal=Food Box) and an oversized watermark
  icon — already a deliberate "Modern Fresh" treatment (see the component's own doc
  comment). Forcing these three tiles to a single violet to match the tab accent
  would erase the one place each bulk category has its own visual identity, and
  matching the prototype's flatter mockup would be a downgrade from what's already
  shipped. If you disagree and want these violet or photo-based instead, say so and
  it becomes its own small task — flagging it here rather than silently changing or
  silently ignoring it.

- [ ] **Step 1: No action required** — read the bullet list above and flag if any
  judgment call should go the other way.

---

### Task 19: Final verification for Part D

**Files:** none (verification only)

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: zero errors project-wide.

- [ ] **Step 2: Full export build**

Run: `npx expo export --platform android -c`
Expected: build completes with no bundling errors.

- [ ] **Step 3: Grep sweep for anything still missed**

```bash
grep -rn "brand.green\|#63[Aa][Bb]45\|#518937\|variant=\"primary\"\|border-primary\|bg-primary" \
  src/features/bulk src/features/on-demand \
  src/app/bulk-menu.tsx src/app/bulk-cart.tsx \
  src/app/on-demand-kitchen.tsx src/app/on-demand-cart.tsx \
  "src/app/(tabs)/index.tsx"
```

Expected: the only remaining match should be `BulkCategoryTile.tsx`'s Meals-category
gradient (`palette.brand.green, palette.brand.greenDark`) — the one documented,
intentional exception from Task 18. Any other match means a spot was missed.

- [ ] **Step 4: Manual walkthrough**

Open Bulk's Food Box → Customized tab (item selection borders + Add pills violet),
Bulk cart's delivery date/slot picker and coupon "Apply" button (violet), On-Demand's
diet chips on both Home and a kitchen menu (teal), a kitchen menu's Daily/Advance
toggle (teal), On-Demand cart's date/slot picker (teal), and a kitchen card's rating
badge (now gold, not green) and speed tag (now teal).

---

## Summary of what's explicitly NOT in this plan

- **Navmool theming.** `src/app/marketplace.tsx` is a `WebView` wrapper with no native
  screens, cart, or checkout — there is nothing to apply `tone="reward"` to yet. When
  Navmool goes native, reuse the exact `<Button tone>` / `<ItemAddButton tone>` /
  `mode` route-param pattern from Parts A and B.
- **A real backend for Manage Subscription.** Part C's pause/skip/progress are
  local-only. Wiring them to a live subscription-status endpoint is backend work
  outside this repo's scope — flagged with `TODO(backend)` comments at the two spots
  (`mockManageData.ts`, `useManageSubscriptionStore.ts`) that need replacing.
- **Redesigning `/order-result` into a full gradient hero** to match the prototype's
  `isPlaced` screen pixel-for-pixel. Task 6 re-colors the existing simple layout's icon
  and button; a full hero-banner redesign of a screen shared by four different order
  types is a larger, separate visual change and wasn't asked for.

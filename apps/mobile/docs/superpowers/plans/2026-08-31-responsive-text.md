# Responsive Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. This project has no unit test runner — every "verify" step uses `npx tsc --noEmit` and `npx expo export --platform android -c` instead (per this repo's CLAUDE.md), not `pytest`/`jest`.

**Goal:** Fix text that reads oversized or inconsistent on ~360dp-wide screens (today's smallest common Android phones), and extract a shared component so the specific pattern that caused it — three independent "current price + struck-through original" implementations drifting to two different sizes — can't recur.

**Architecture:** The app already has a width-based font-scale system (`useResponsiveFontScale`, applied inside `AppText`) and every real screen already routes through `AppText` — this isn't a missing-scaling problem. The issues found are layout/variant-level: (1) `CategoryCard.tsx` and `PlanCard.tsx`'s struck-through original price uses `variant="bodySm"` (13px) while the same pattern in `PlanTierCard.tsx` and the shared `BillRow.tsx` already uses the smaller `variant="caption"` (12px) — an inconsistency, not a new mechanism; (2) `subscription-detail.tsx`'s `DayStrip` uses `variant="label"` (16px bold — the same size used for buttons) for 3-letter day abbreviations packed six-across into 44px circles, oversized for its role; (3) that screen's day-strip header text was recently lengthened and needs a fit check. Fix: shrink `BillRow.tsx`'s own struck-through size (fixes it everywhere BillRow is used — cart checkout, Manage Subscription's Bill popup — in one place), extract a new `PriceWithOriginal` component for the three duplicated "teaser card" price displays (`CategoryCard`, `PlanCard`, `PlanTierCard`) so there's one implementation instead of three, fix `DayStrip`'s pill text size, and close with a bounded, concrete audit of components not yet manually checked.

**Tech Stack:** React Native (Expo SDK 57), NativeWind v5 + Tailwind v4, no new dependencies.

**Context:** Investigated directly (not via a separate written spec — user approved the approach in conversation): confirmed via code reading that `CategoryCard.tsx`, `PlanCard.tsx`, and `BillRow.tsx` use `bodySm` for struck-through original prices while `PlanTierCard.tsx` (already correct, both its instances) and `subscription-detail.tsx`'s own price row use `caption`. Also spot-checked and confirmed **fine, no changes needed**: `HomeHeader.tsx` (address already uses `flex-1` + `numberOfLines={1}`), the date chips in `subscription-configure.tsx` (appropriately differentiated sizing), `OrderRow.tsx` and `BulkCouponCard.tsx` (proper `flex-1`/`numberOfLines` usage throughout).

---

### Task 1: Create the shared `PriceWithOriginal` component

**Files:**
- Create: `src/components/ui/PriceWithOriginal.tsx`

- [x] **Step 1: Write the component**

```tsx
import { View } from 'react-native';

import { AppText } from './AppText';
import type { TextVariant } from '@/theme';

interface PriceWithOriginalProps {
  /** Current (post-discount) price, already formatted (e.g. "₹89/meal"). */
  price: string;
  /** Pre-discount price to show struck through — omit or pass `null`/`undefined` when there's no discount to show. */
  originalPrice?: string | null;
  /** Variant for the current price. The struck-through original always
   * renders at `caption` (the app's smallest established size for this
   * pattern — see docs/superpowers/plans/2026-08-31-responsive-text.md)
   * regardless of this prop, so it never crowds the current price on a
   * narrow card. */
  priceVariant?: TextVariant;
  /** Gap between the current and original price, in px. Matches each
   * call site's existing spacing (`gap-2` = 8, `gap-1.5` = 6). */
  gap?: number;
}

/**
 * "Current price (+ optional struck-through original)" — the teaser-card
 * price pattern shared by CategoryCard, PlanCard, and PlanTierCard. Extracted
 * because three independent copies of this pattern had already drifted to
 * two different sizes for the struck-through original (`bodySm` in two of
 * them, `caption` in the third) — one shared component instead of three
 * copies means that can't happen again.
 */
export function PriceWithOriginal({ price, originalPrice, priceVariant = 'title', gap = 8 }: PriceWithOriginalProps) {
  return (
    <View className="flex-row items-baseline" style={{ gap }}>
      <AppText variant={priceVariant} className="text-foreground">
        {price}
      </AppText>
      {originalPrice ? (
        <AppText
          variant="caption"
          className="text-muted-foreground"
          style={{ textDecorationLine: 'line-through' }}>
          {originalPrice}
        </AppText>
      ) : null}
    </View>
  );
}
```

- [x] **Step 2: Verify**

```bash
npx tsc --noEmit
```
Expected: clean (nothing consumes this file yet, so no other errors should appear).

- [x] **Step 3: Commit**

```bash
git add src/components/ui/PriceWithOriginal.tsx
git commit -m "feat: add shared PriceWithOriginal component"
```

---

### Task 2: Migrate `CategoryCard.tsx` to `PriceWithOriginal`

**Files:**
- Modify: `src/features/subscription/components/CategoryCard.tsx`

This is the card the user directly flagged: a 2-column grid tile (~48% width) on the Subscription Home screen, where the struck-through original price currently reads too large at `bodySm` (13px).

- [x] **Step 1: Replace the price row**

Find this block (current lines 61–78):

```tsx
        <View style={{ marginTop: 2 }}>
          <AppText variant="caption" className="text-muted-foreground">
            Starting at
          </AppText>
          <View className="flex-row items-baseline gap-2">
            <AppText variant="title" className="text-foreground">
              {priceLabel}
            </AppText>
            {originalPriceLabel ? (
              <AppText
                variant="bodySm"
                className="text-muted-foreground"
                style={{ textDecorationLine: 'line-through' }}>
                {originalPriceLabel}
              </AppText>
            ) : null}
          </View>
        </View>
```

Replace with:

```tsx
        <View style={{ marginTop: 2 }}>
          <AppText variant="caption" className="text-muted-foreground">
            Starting at
          </AppText>
          <PriceWithOriginal price={priceLabel} originalPrice={originalPriceLabel} priceVariant="title" />
        </View>
```

- [x] **Step 2: Add the import**

Add to the top import block (after the `Button` import):

```tsx
import { PriceWithOriginal } from '@/components/ui/PriceWithOriginal';
```

- [x] **Step 3: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [x] **Step 4: Commit**

```bash
git add src/features/subscription/components/CategoryCard.tsx
git commit -m "fix: shrink CategoryCard's struck-through price to match the app's established size"
```

---

### Task 3: Migrate `PlanCard.tsx` to `PriceWithOriginal`

**Files:**
- Modify: `src/features/subscription/components/PlanCard.tsx`

Same bug, same fix — `PlanCard` is also a 2-column `48%`-width grid tile (Dine In's plan picker, `DineInHome.tsx`), also stuck at `bodySm` for its struck-through original price.

- [x] **Step 1: Replace the price row**

Find this block (current lines 136–149):

```tsx
        <View className="flex-row items-baseline gap-2" style={{ marginTop: 4 }}>
          <AppText variant="title" className="text-foreground">
            {formatINR(price)}
          </AppText>
          {hasDiscount ? (
            <AppText
              variant="bodySm"
              className="text-muted-foreground"
              style={{ textDecorationLine: 'line-through' }}
            >
              {formatINR(pkg.packagePrice)}
            </AppText>
          ) : null}
        </View>
```

Replace with:

```tsx
        <View style={{ marginTop: 4 }}>
          <PriceWithOriginal
            price={formatINR(price)}
            originalPrice={hasDiscount ? formatINR(pkg.packagePrice) : null}
            priceVariant="title"
          />
        </View>
```

- [x] **Step 2: Add the import**

Add to the top import block:

```tsx
import { PriceWithOriginal } from '@/components/ui/PriceWithOriginal';
```

- [x] **Step 3: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [x] **Step 4: Commit**

```bash
git add src/features/subscription/components/PlanCard.tsx
git commit -m "fix: shrink PlanCard's struck-through price to match the app's established size"
```

---

### Task 4: Migrate `PlanTierCard.tsx` to `PriceWithOriginal`

**Files:**
- Modify: `src/features/subscription/components/PlanTierCard.tsx`

`PlanTierCard` already uses the correct `caption` size for both its struck-through prices — no visible bug here — but it's the third independent copy of the same pattern. Migrating it now (while it's fresh) closes the loop so all three teaser cards share one implementation instead of the two already-fixed ones plus this one holdout.

- [x] **Step 1: Replace the per-meal price row**

Find this block (current lines 98–110):

```tsx
      <View className="flex-row items-baseline gap-1.5" style={{ marginTop: 12 }}>
        <AppText variant="bodySm" className="text-muted-foreground">
          {formatINR(perMeal)} /meal
        </AppText>
        {originalPerMeal > perMeal ? (
          <AppText
            variant="caption"
            className="text-muted-foreground"
            style={{ textDecorationLine: 'line-through' }}>
            {formatINR(originalPerMeal)}
          </AppText>
        ) : null}
      </View>
```

Replace with:

```tsx
      <View style={{ marginTop: 12 }}>
        <PriceWithOriginal
          price={`${formatINR(perMeal)} /meal`}
          originalPrice={originalPerMeal > perMeal ? formatINR(originalPerMeal) : null}
          priceVariant="bodySm"
          gap={6}
        />
      </View>
```

- [x] **Step 2: Replace the total price row**

Find this block (current lines 111–123):

```tsx
      <View className="flex-row items-baseline gap-1.5" style={{ marginTop: 2 }}>
        <AppText variant="h2" className="text-foreground">
          {formatINR(total)}
        </AppText>
        {hasDiscount ? (
          <AppText
            variant="caption"
            className="text-muted-foreground"
            style={{ textDecorationLine: 'line-through' }}>
            {formatINR(originalTotal)}
          </AppText>
        ) : null}
      </View>
```

Replace with:

```tsx
      <View style={{ marginTop: 2 }}>
        <PriceWithOriginal
          price={formatINR(total)}
          originalPrice={hasDiscount ? formatINR(originalTotal) : null}
          priceVariant="h2"
          gap={6}
        />
      </View>
```

- [x] **Step 3: Add the import**

Add to the top import block:

```tsx
import { PriceWithOriginal } from '@/components/ui/PriceWithOriginal';
```

- [x] **Step 4: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [x] **Step 5: Commit**

```bash
git add src/features/subscription/components/PlanTierCard.tsx
git commit -m "refactor: migrate PlanTierCard to the shared PriceWithOriginal component"
```

---

### Task 5: Shrink `BillRow.tsx`'s struck-through original price

**Files:**
- Modify: `src/components/ui/BillRow.tsx`

`BillRow` is already the one shared component for every itemized bill line in the app (cart checkout, Manage Subscription's Bill popup) — fixing its size here fixes every caller in one change, no migration needed (it's not part of the "teaser card" pattern Task 1–4 covers, it's a full-width line-item row, which is why it stays its own component rather than folding into `PriceWithOriginal`).

- [x] **Step 1: Shrink the struck-through variant**

Find this block (current lines 30–38):

```tsx
        {original !== undefined && original > amount ? (
          <AppText
            variant="bodySm"
            className="text-muted-foreground"
            style={{ textDecorationLine: 'line-through' }}
          >
            {formatINR(original)}
          </AppText>
        ) : null}
```

Replace with:

```tsx
        {original !== undefined && original > amount ? (
          <AppText
            variant="caption"
            className="text-muted-foreground"
            style={{ textDecorationLine: 'line-through' }}
          >
            {formatINR(original)}
          </AppText>
        ) : null}
```

- [x] **Step 2: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [x] **Step 3: Commit**

```bash
git add src/components/ui/BillRow.tsx
git commit -m "fix: shrink BillRow's struck-through price to match the app's established size"
```

---

### Task 6: Fix `DayStrip`'s day-pill text size

**Files:**
- Modify: `src/app/subscription-detail.tsx`

The day-abbreviation pills ("Mon", "Tue"...) use `variant="label"` (16px bold — the same size used for buttons), packed six across into 44px circles. Oversized for a 3-letter abbreviation in a small, repeated element; drop one step to `bodySm` with a bold weight override so the active/inactive contrast (currently carried by weight) is preserved.

- [x] **Step 1: Shrink the pill text**

Find this block inside `DayStrip` (current lines 581–586):

```tsx
              <AppText
                variant="label"
                weight={active ? 'bold' : undefined}
                style={{ color: active ? '#ffffff' : colors.mutedForeground }}>
                {d.short}
              </AppText>
```

Replace with:

```tsx
              <AppText
                variant="bodySm"
                weight="bold"
                style={{ color: active ? '#ffffff' : colors.mutedForeground }}>
                {d.short}
              </AppText>
```

(`weight="bold"` unconditionally now, since `bodySm`'s base weight is regular — the active/inactive pill already reads clearly from the fill color change alone; keeping both states bold avoids a layout-shifting width change between the two states, which switching weight on/off at a smaller size makes more noticeable than it was at 16px.)

- [x] **Step 2: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [x] **Step 3: Commit**

```bash
git add src/app/subscription-detail.tsx
git commit -m "fix: shrink DayStrip's day-pill text to fit its role"
```

---

### Task 7: Verify the "CHOOSE A DAY TO VIEW MENU" header fits on a 360dp screen

**Files:**
- Modify (conditionally): `src/app/subscription-detail.tsx`

This label (`variant="overline"`, 11px, uppercase, `letterSpacing: 0.6`) was recently lengthened from "PICK A DAY" (10 characters) to "CHOOSE A DAY TO VIEW MENU" (26 characters). `overline` is already the app's smallest variant, so if it doesn't fit on one line at 360dp, the fix is shortening the copy, not shrinking the font further (there's no smaller step in the scale to drop to).

- [x] **Step 1: Measure it**

The label sits inside `px-4` padding (`DayStrip`'s parent — see the `View className="px-4 pt-5"` wrapper in the main render), so available width at 360dp is `360 - 32 = 328dp`. Metropolis Bold at 11px with 0.6 letter-spacing: estimate ~6.5dp average advance width per uppercase character (a bold, letter-spaced uppercase face runs wider than the sizing implies) × 26 characters ≈ 169dp — comfortably under 328dp on its own, but confirm against the actual rendered width on a real 360dp device/emulator (`npx expo run:android`, resize the emulator to a 360dp-width profile, e.g. "Small Phone" or a Pixel 4a) rather than trusting the estimate — letter-spacing and kerning on a real font can differ meaningfully from an average-advance-width guess.

- [x] **Step 2: If it wraps or crowds the row, shorten it**

If Step 1 shows the label wrapping to two lines or sitting uncomfortably close to the screen edge, replace it with a shorter equivalent that keeps the same meaning:

Find (current line 561–563):

```tsx
      <AppText variant="overline" className="text-muted-foreground" style={{ marginBottom: 10 }}>
        CHOOSE A DAY TO VIEW MENU
      </AppText>
```

Replace with:

```tsx
      <AppText variant="overline" className="text-muted-foreground" style={{ marginBottom: 10 }}>
        CHOOSE A DAY
      </AppText>
```

(Drops "TO VIEW MENU" — the section immediately below the day strip already is the menu, and the card above it is titled "WEEKLY MENU", so the context is unambiguous without spelling it out again in the day-picker's own label.)

- [x] **Step 3: Commit (only if Step 2 was needed)**

```bash
git add src/app/subscription-detail.tsx
git commit -m "fix: shorten CHOOSE A DAY TO VIEW MENU label to fit narrow screens"
```

---

### Task 8: Audit remaining dense-layout components

**Files (read-only investigation, fix inline if an issue is found):**
- `src/features/bulk/components/BulkMenuItemCard.tsx`
- `src/features/bulk/components/BulkCategoryTile.tsx`
- `src/features/bulk/components/CustomFoodBox.tsx`
- `src/features/on-demand/components/OnDemandKitchenCard.tsx`
- `src/features/on-demand/components/OnDemandItemCard.tsx`
- `src/features/dine-in/components/DineInHome.tsx` (everything except the already-fixed `PlanCard` usage from Task 3)
- `src/app/orders.tsx`'s `FilterChip` (inline component, not extracted to its own file)
- `src/app/(tabs)/index.tsx`'s `HomeTabs`/order-mode shortcut row

These weren't manually checked during the brainstorming pass that produced Tasks 1–7 (only `HomeHeader.tsx`, `OrderRow.tsx`, `BulkCouponCard.tsx`, and the `subscription-configure.tsx` date chips were spot-checked and confirmed fine). Check each file against this exact checklist — flag or fix (per Step 2 below) anything that matches:

- [x] **Step 1: Check each file against this checklist**

For each file listed above:
1. Any `variant="label"` (16px bold) or larger used on text that's a short abbreviation/tag/pill inside a small (< 60px) fixed-size container, the same shape of bug fixed in Task 6? (Not a bug if it's a primary name/title with room to breathe.)
2. Any `flex-row` containing two or more `AppText` elements where NEITHER has `flex: 1`, `flexShrink: 1`, nor `numberOfLines` — i.e., nothing stops the row from overflowing if the combined text is long? (This is fine when both pieces of text are always short/bounded, like a 2-digit day number — only flag it when at least one side can plausibly be long, e.g. a name, address, or variable-length price.)
3. Any struck-through/secondary price text NOT using the new `PriceWithOriginal` component (Task 1) that should be migrated to it for consistency, per the same pattern as Tasks 2–4.

- [x] **Step 2: Fix anything found**

For each issue found in Step 1, apply the same class of fix already used in this plan:
- Oversized pill/tag text (checklist item 1) → drop one variant step (e.g. `label` → `bodySm`), matching Task 6's approach.
- Missing overflow protection (checklist item 2) → add `numberOfLines={1}` to the text that's allowed to be long, or wrap it in a `View` with `style={{ flex: 1 }}` / `flexShrink: 1` so it's the one that shrinks, not the other elements in the row.
- Un-migrated struck-through price (checklist item 3) → replace with `<PriceWithOriginal>` per Tasks 2–4's exact pattern.

If no issues are found in a file, no change is needed there — do not modify files that already pass the checklist.

- [x] **Step 3: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [x] **Step 4: Commit (only if Step 2 made any changes)**

```bash
git add -A
git commit -m "fix: address remaining small-screen text issues found in the responsive-text audit"
```

---

### Task 9: Final full verification

**Files:** none (verification only)

- [x] **Step 1: Typecheck**

```bash
npx tsc --noEmit
```
Expected: clean.

- [x] **Step 2: Bundle export**

```bash
npx expo export --platform android -c
```
Expected: succeeds with no "Unable to resolve" errors — confirms `PriceWithOriginal`'s new import resolves cleanly at every one of its four call sites (Tasks 2, 3, 4).

- [x] **Step 3: Manual check on a narrow device/emulator**

Run `npx expo run:android` on a ~360dp-wide emulator profile (or resize an existing AVD) and visually confirm:
- Subscription Home's category cards (Task 2): struck-through price no longer looks oversized/crowded.
- Dine In's plan cards (Task 3): same.
- The horizontally-scrolling plan tier row on `subscription-plan.tsx` (Task 4): unchanged appearance (this was a refactor, not a visual fix — confirm nothing regressed).
- Cart checkout's bill breakdown (Task 5): struck-through discount lines read smaller.
- The category detail screen's day strip (Tasks 6–7): pill text no longer oversized, header fits on one line.
- Any spots fixed in Task 8's audit.

This is the one step in this plan with no automated equivalent — the project has no visual regression tooling, so this is a real device/emulator check, not optional.

# Subscription Cart — Redesign Design Spec

## Goal

Bring `cart.tsx` (the subscription checkout screen) up to a Zomato-style reference:
smaller schedule text, a horizontal "Other Subscriptions" swap row, a Tree
Plantation add-on, the Total Bill and GST breakdown moved into bottom sheets, and
a footer where the payable amount lives inside the "Proceed to Pay" button with a
new "Happy Customer" banner above it. This is **phase 1 of 2** — a companion
follow-up brings `bulk-cart.tsx`/`on-demand-cart.tsx` to parity on the pieces that
transfer (GST popup, button amount-prefix, Happy Customer banner, Tree
Plantation, radius). "Other Subscriptions → replace current plan" is **not**
part of that follow-up: those two carts are already multi-item (`lines: []`) with
a working "Add more items" link, so a swap-to-replace interaction doesn't apply
there and isn't being built for them.

## Current state (traced in full)

- `cart.tsx` renders, top to bottom: `SavingsBanner`, item card (name, days/meal,
  `QuantityStepper`), a display-only add-ons card, a "DELIVERY DETAILS" card
  (`DetailRow`s for Schedule/Meal/Address, Schedule opens `StartDatePickerSheet`),
  a coupon card, a wallet/cashback redeem card, an inline expand/collapse "Total
  Bill" card (`billOpen` state, `BillRow`s), and a sticky footer (days/category +
  price row, then the `Button`, then a caption).
- `StartDatePickerSheet.tsx` already renders its date chips in a horizontal
  `ScrollView` at 16px radius (`RADIUS.md`) — the "dates should be horizontally
  scrollable" requirement is already satisfied; no change needed there beyond the
  Schedule row's own text size.
- No "Other Subscriptions" concept, no Tree Plantation concept, and no
  centered-dialog pattern exist anywhere in this app today. Every popup is a
  `@gorhom/bottom-sheet` `BottomSheetModal` wrapped by the shared `AppSheet`
  primitive (24px top-corner radius, dimmed backdrop, imperative `present()`/
  `dismiss()` via ref) — `CouponSheet`, `StartDatePickerSheet`,
  `CategoriesSheet`, `TermsSheet`, etc. all follow this one shape.
- `src/features/cart/bill.ts`'s `buildBill()` already computes `itemTax`,
  `deliveryGst`, `packagingGst`, and `platformGst` as intermediate values, but
  the `Bill` type only exposes their sum (`taxes`) — the per-component GST
  breakdown popup needs these four surfaced, which is a pure additive change.
- `useSubscriptionCatalog().packagesFor(categoryParam)` (already used by
  `subscription-plan.tsx`/`subscription-detail.tsx`/`SubscriptionHome.tsx`) is
  the existing source of sibling packages within a category — reused as-is for
  "Other Subscriptions," no new API work.
- The `Button` primitive (`src/components/ui/Button.tsx`) and every card on this
  screen (`className="rounded-2xl ..."`) already sit at 16px radius — the target
  radius for every new element in this spec is this same 16px, not `theme/radii.ts`'s
  `RADIUS.lg` (20px), which is unrelated inline-styled infrastructure (date chips,
  icon tiles) already at `RADIUS.md` (16px) anyway.

## Approach

### 1. Radius consistency (scoped)

Standardize every **new or touched** element in this spec — Other Subscriptions
cards, the Tree Plantation card, the Happy Customer banner, and the (unchanged)
button — on 16px / `rounded-2xl`, matching what's already on this screen.
`AppSheet`'s 24px top-corner shell radius is shared infrastructure for every
bottom sheet app-wide and is explicitly **not** touched — changing it would be an
unscoped, app-wide visual change with no relation to this screen.

### 2. Schedule row — smaller text

`DetailRow`'s Schedule child text (`Starts {date} · {N} days`) drops to a smaller
`AppText` variant (e.g. `bodySm`, down from whatever the row currently renders at
— confirm exact current variant when implementing). No other change to this row;
`StartDatePickerSheet` needs no changes (already horizontal, already 16px chips).

### 3. Add-ons card — no changes

Already display-only, already 16px/`rounded-2xl`, already matches the card
language the rest of this redesign uses. Per "leave functionality as-is, design
change only," there is nothing to change here — it already satisfies both halves
of that instruction. Called out explicitly so this isn't silently skipped.

### 4. Other Subscriptions (new)

- New component (e.g. `OtherSubscriptionsRow`), inserted in `cart.tsx` between
  the "DELIVERY DETAILS" card and the coupon card.
- Horizontally-scrollable row of sibling-package cards: `useSubscriptionCatalog()`
  → `packagesFor(item.category)`, filtered to exclude `pkg._id` already in cart,
  each card showing package image/name, price (+ "UPTO X% OFF" using the
  package's existing discount data), and an "Add" button — matching the
  reference screenshot's card shape, at 16px radius.
- Tapping "Add" shows a confirm `Alert.alert`: "Replace your plan? Switching to
  {package name} will reset your selected dates and add-ons." (Cancel / Replace).
- On confirm: build a fresh `SubscriptionConfig` for the newly-picked package
  (default start date via the existing `nextStartDates`/`generateRun` helpers,
  category-default meal times, no add-ons carried over since add-ons are
  package-specific), preserve the existing `count`, and call the cart store's
  existing `setSubscription()` — the same full-replace call `subscription-configure.tsx`
  already makes today. No new cart-mutation logic is introduced; this reuses the
  existing "set replaces the single item" behavior `useCartStore` already has.

### 5. Tree Plantation (new)

- New card, inserted per the reference screenshot's position (near the address /
  badges area, above Total Bill). Contains a checkbox, "Tree Plantation" label +
  info icon, "Plant a tree" subtitle.
- Matches the **checked-state screenshot's actual shape**: an inline-expanding
  card, not a popup. Checking the box reveals a "Tree Receiver Name" `TextInput`
  directly inside the same card (green-tinted border/checkmark treatment,
  consistent with `SavingsBanner`'s existing `accentTint` pattern on this
  screen); unchecking collapses the input and clears the name.
- New cart-state field: `treePlantation: { enabled: boolean; receiverName: string } | null`
  added to `Cart` (`src/features/cart/types.ts`), defaulting to `null`, with a
  store action (e.g. `setTreePlantation`/`clearTreePlantation`) alongside the
  existing `setSubscription`/coupon actions in the cart store. Per your call,
  this is **local cart state only** — no new backend/API field. The receiver
  name still reaches the order payload, since it rides along in whatever object
  `cart.tsx` already sends when placing the order.

### 6. Total Bill → Bill Summary sheet (new)

- The "Total Bill" card's `billOpen` inline expand/collapse is removed. In its
  place: a compact, non-expanding summary row (title, existing "Saved ₹X" badge,
  amount) that's a single `Pressable` opening a new `BillSummarySheet`
  (`AppSheet`, e.g. `snapPoints={['70%']}`).
- `BillSummarySheet` renders the same line items shown inline today — Plan,
  Extras, Plan discount, Coupon, Delivery, Packaging, Platform fee, GST &
  charges, Wallet credit, Cashback credit, divider, To pay — as props (the bill
  values `cart.tsx` already computes), so no new bill logic, just relocated
  rendering.
- Inside that sheet, the "GST & charges" row becomes tappable, opening a second,
  smaller sheet on top of it (bottom-sheet modals stack natively via the shared
  `BottomSheetModalProvider` — no new plumbing needed for the nesting itself).

### 7. GST breakdown sheet (new)

- `Bill` (`src/features/cart/types.ts`) gains four fields — `itemGst`,
  `deliveryGst`, `packagingGst`, `platformGst` — populated in `buildBill()`
  from the values it already computes internally. `taxes` remains their sum,
  unchanged; this is additive only. `bulk-cart.tsx`/`on-demand-cart.tsx` compute
  their own bills independently and are unaffected.
- New `GstBreakdownSheet` (`AppSheet`, dynamic sizing): "GST on item total,"
  "GST on delivery" (omitted when `item.isDineIn` or delivery is 0), "GST on
  packaging," "GST on platform fee," divider, "Total GST" (= `bill.taxes`).
  Built on `AppSheet` like every other popup in the app — a small bottom sheet,
  not a centered dialog, per your call (the app has no centered-dialog pattern
  today and this avoids introducing a second popup paradigm for one screen).

### 8. Footer

- The existing days/category + price(+strikethrough) row directly above the
  button is **removed** — that information now lives in the compact Total Bill
  summary row above (§6), which already carries the "Saved ₹X" badge.
- `Button`'s `label` prop changes from the literal `"Proceed to Pay →"` to
  `` `${formatINR(bill.toPay)}   Proceed to Pay →` `` — every other `Button` prop
  (`size="lg"`, `block`, `tone`, `loading`, `disabled`, `onPress`) is untouched,
  satisfying "don't change the button design, only add the amount."
- New Happy Customer SVG banner inserted directly above the `Button` inside the
  same footer `View`: saved to `assets/images/cart/happy-customers.svg`,
  `require()`'d and rendered via `expo-image`'s `<Image>` (the same pattern
  `welcome.tsx` already uses for static SVG assets — no new SVG tooling), full
  footer width, 16px radius to match the button.

## Explicitly out of scope (this phase)

- `bulk-cart.tsx` / `on-demand-cart.tsx` — a separate follow-up spec brings them
  to parity on GST popup / button amount-prefix / Happy Customer banner / Tree
  Plantation / radius. "Other Subscriptions → replace plan" does **not** apply
  to them at all (see Goal).
- Backend/API changes for Tree Plantation — local cart state only, per your
  answer; a future project can add server-side persistence if the tree-planting
  request needs to be fulfilled from data rather than a screenshot of the order.
- Any change to `AppSheet`'s shared 24px shell radius, or to any other sheet in
  the app that isn't part of this screen.
- Reworking the add-ons card's functionality or data (display-only stays
  display-only; editing still routes through "Edit" → Configure).

## Testing

No unit tests in this project (`docs/TESTING-WORKFLOW.md`). Verify with
`npx tsc --noEmit` and `npx expo export --platform android -c`. Per the
project's standing convention, author/update a Maestro flow under
`.maestro/flows/` covering: opening Other Subscriptions and confirming a plan
swap, checking Tree Plantation and entering a receiver name, opening the Total
Bill sheet and then the nested GST sheet from within it, and confirming the
"Proceed to Pay" button shows the amount — plus corresponding rows in the `Cart`
feature sheet of `scripts/generate-test-catalogue.mjs`.

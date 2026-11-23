# On-Demand Ordering (Daily + Advance) — Design Spec

**Status:** Approved, ready for implementation planning.

## Purpose

Build the "Daily" and "Advance" order verticals in MealaweUserAppRN, currently two
placeholder shortcut screens (`src/app/daily-order.tsx`, `src/app/advance-order.tsx`)
reached from the home shortcuts row. Both are modes of the **same** kitchen-ordering
flow — order from a kitchen's ready-to-cook/cooked-today menu ("Daily" = the legacy
`allDay` order type), or pre-order from a future-dated slot ("Advance") — not two
separate systems, and not the apartment/society vertical (that maps to this app's
`bulk` domain per `src/features/README.md`, and is out of scope here).

Functionality source of truth: `../MealaweUserApp` (Ionic/Angular), specifically:
- `src/app/tab-on-demand/tab-on-demand.component.ts` (kitchen list entry point)
- `src/app/kitchen-card/kitchen-card.component.ts` (list tile + mode-aware nav)
- `src/app/kitchen-inside/kitchen-inside.component.ts` (kitchen detail: mode toggle,
  menu grouping, cutoff/timing logic — 2200+ lines, the bulk of the business logic)
- `src/app/item-card/item-card.component.ts` (item row: add/stepper, missed/coming-next/
  not-available states)
- `src/app/tabCart/tabCart.page.ts` (`generateTimeSlotsArray`, `makePayment`'s
  `advance`/`allDay` branches, `getOtherPayAmt` bill math)
- `src/service/apiService/apiMain.service.ts` + `apiConfig.service.ts` (endpoints)
- `src/service/utility.service.ts` (cutoff/window config loading)
- `src/service/cart-management.service.ts` (single-kitchen/single-mode cart conflict rule)

## Naming clarity (read this before the rest of the doc)

The legacy codebase has **three** overlapping route-param strings for "today's menu":
`allDay` (the live, fully-wired one), `daily` (a near-dead vestige — its UI toggle is
commented out in `kitchen-inside.component.html`, and `KitchenCardComponent.goInsideKitchen()`
maps a `daily` input straight to the `allDay` route anyway), and the marketing word
"Daily" used loosely in this app's own placeholder copy. **This spec treats "Daily
Order" = the `allDay` mode** (today's menu, ordered within a same-day delivery
window) — not the vestigial `daily` string, which this port does not resurrect.
"Advance Order" = the legacy `advance` mode (pre-order a slot 1–2 days out) exactly
as built.

## Explicitly out of scope

- **Apartment/society kitchens** (`tab-apartment`, `apartment-inside`, `apartment_today`/
  `apartment_advance` order types) — a distinct B2B-ish system with its own date-matched
  cart logic; already mapped to this app's `bulk` domain. Not touched here.
- **Real payment integration** (JusPay/Paytm). Checkout ends at the same
  "Proceed to Pay →" placeholder `Alert.alert(...)` that `cart.tsx` and `bulk-cart.tsx`
  already ship with. Unlike bulk (which has a real, defined-but-unused
  `saveBulkFoodOrder` endpoint), on-demand orders in the legacy app are created
  server-side as a *side effect* of `startJusPayPaymentProcess`/`startPaytmPaymentProcess`
  — there is no standalone "create on-demand order" endpoint to port ahead of real
  payment work. No such endpoint is invented here.
- **Live delivery-partner quote** (the legacy's Dunzo-style distance/ETA quote via
  `googleMapService`). No verified/comparable infra exists anywhere in this RN app yet
  (bulk's delivery charge is a flat cluster-config value, not a live quote either).
  Delivery charge here is a flat `onDemandDeliveryCharges` cluster-config value —
  already a real field on the `ClusterConfigVariable` model — matching bulk's pattern,
  not a simulated live quote.
- **Kitchen favouriting** (heart icon, `FavouriteManagementService`) — a decorative,
  independent local-storage feature, not required to place an order. Future spec.
- **Add-on popup** (`addon-popup.component`) and **special/flash-offer items**
  (`isSpecialMenu`, `bookSpecialItem`, `order-booking.service`) — distinct secondary
  interaction surfaces layered on the core menu. Future spec.
- **Kitchen reviews list** (`kitchen-ratings.component`, `getfeedbackToListCount`) — the
  static rating *number* already on the kitchen object is shown; the reviews list
  screen is deferred.
- **Cross-kitchen dish/category search** (`kitchen-search`, `category-search`, the
  commented-out `meal-time` widget) — the kitchen list's own search bar is
  client-side substring filtering over the already-fetched list, not a new backend
  search endpoint. A dedicated cross-kitchen search is a future spec if needed.
- **Global "dim all kitchen cards outside standard hours" cache** (legacy's
  `DIM_KITCHEN_CARD` runtime-storage flag) — replaced by a locally-computed
  `isOrderingWindowOpen(mode)` check (same functional signal: "is ordering currently
  open for this mode"), which is simpler and avoids a global mutable cache. This is
  a mechanism change, not a dropped feature — see Business logic.

## Scope

1. Kitchen list (cluster-scoped, mode-scoped: Daily or Advance), each card showing
   open/closed state, offer badge, veg/non-veg/jain marks, rating, and a client-side
   search bar.
2. Kitchen detail: header (distance, "Order Between" window, rating), a Daily/Advance
   mode toggle (switch modes without leaving the kitchen), a Veg/Non-veg/Jain filter,
   and the grouped item list with per-item Missed/Coming-next/Not-available states.
3. Single-kitchen, single-mode cart (array of item lines), with the same
   "switch kitchen/mode clears your cart" confirm-dialog pattern already built for
   Bulk's category switch.
4. Cart/checkout: date+slot picker (Advance: pick tomorrow or day-after + an hourly
   slot; Daily: today's remaining hourly slots only), bill breakdown (item total,
   per-kitchen discount offer, delivery/packaging/platform + GST from cluster
   config), coupon entry, wallet/cashback redemption — reusing `features/cart`'s
   `CouponSheet`/`SavingsBanner`/`CouponCelebration` exactly as Bulk does.
5. Home shortcuts row wiring: the existing `daily`/`advance` shortcut tabs
   (`showDaily`/`showAdvance` cluster flags, already gating visibility) navigate into
   this vertical's kitchen list pre-scoped to the right mode, replacing the current
   `ComingSoonScreen` placeholders.

## Architecture

New feature module `src/features/on-demand/`, mirroring `src/features/bulk/`'s shape
(closer to bulk than dine-in, since on-demand needs slab-free but still real pricing/
bill logic and a multi-line cart, unlike dine-in's single-draft booking):

| File | Responsibility |
|---|---|
| `types.ts` | `OnDemandMode`, `OnDemandKitchen`, `OnDemandMenuItem`, `OnDemandMenuGroup`, `OnDemandCartLine`, `OnDemandCart` |
| `api.ts` | `loadNearestKitchens(mode)`, `loadKitchenProfile(id)`, `loadKitchenMenu(id)`, `loadOnDemandCoupons()` |
| `schedule.ts` | Pure + one async config loader: `loadOrderingWindows()`, `isOrderingWindowOpen`, `isAllDayUpcoming`, `allDaySlotsFor`, `advanceDates`, `advanceSlotsFor` |
| `pricing.ts` | Pure: `groupMenuByMode(items, mode)`, `itemStatusFor(item, mode, windows, cartCount)`, `kitchenDiscountFor(kitchen, subTotal)` |
| `bill.ts` | `OnDemandBillCharges`, `DEFAULT_ONDEMAND_CHARGES`, `chargesFromOnDemandConfig(cfg)`, `buildOnDemandBill(...)` |
| `useOnDemandCartStore.ts` | Zustand store — single kitchen + mode + array of `OnDemandCartLine`, persisted via `kvStorage` |
| `components/OnDemandKitchenCard.tsx` | List tile: photo, closed overlay, offer badge, veg/non-veg/jain marks, rating, distance |
| `components/ModeToggle.tsx` | Two-capsule Daily/Advance switch (kitchen detail header) |
| `components/VegFilterChips.tsx` | Veg / Non-veg / Jain single-select chip row |
| `components/OnDemandItemCard.tsx` | Item row: image, diet mark, price, stepper, Missed/Coming-next/Not-available badge |
| `components/OnDemandSlotPicker.tsx` | Date (Advance only) + hourly slot chip picker — same visual pattern as `BulkDeliveryPicker` |
| `components/OnDemandCartFooter.tsx` | Sticky "N items · ₹total · View cart" bar (near-identical to `BulkCartFooter`) |
| `index.ts` | Public barrel |

### Why a separate cart store instead of extending `useBulkCartStore`/`useCartStore`

Same rationale the bulk-ordering spec already established for this codebase: each
order-type vertical (`useCartStore` for subscription, `useBulkCartStore` for bulk,
`useDineInBookingStore` for dine-in) gets its own store with its own persisted shape,
rather than a shared generic cart engine. On-demand's cart is structurally close to
bulk's (array of lines, quantity-driven) but is scoped to exactly one kitchen + one
mode at a time (switching either clears the cart, mirroring the legacy's
`checkIfItemCanBeAdded` conflict rule) — this constraint doesn't fit bulk's
category+packaging scoping, so it gets `useOnDemandCartStore`, not a bolt-on to
`useBulkCartStore`. Tradeoff accepted (same as bulk's spec): more stores instead of
one unified cart engine, deferred until there's real product pressure for it (YAGNI).

### Kitchen type is new, not reused from dine-in

`src/features/dine-in/types.ts`'s `Kitchen` (`_id`, `name`, `address`, `imageUrl`,
`rating`, `openTime`, `closeTime`) is too thin for on-demand, which needs
`kitchenOpened`, `distance`, `speciality`/`mainSpeciality`, `mealType` (veg/non-veg/
jain tags), `discountOffer`, and `preparationTime`. Rather than widening dine-in's
type (and coupling two independently-evolving verticals), on-demand defines its own
`OnDemandKitchen` — matching how `bulk` and `dine-in` already each keep separate,
non-shared types for conceptually-adjacent things.

## Data model

```ts
export type OnDemandMode = 'allDay' | 'advance';

export interface DiscountOffer {
  discountType: 'percentage' | 'flat';
  discountValue: number;
  minAmount?: number;
  maxLimit?: number;
  startDate: string;
  expiryDate: string;
}

export interface OnDemandKitchen {
  _id: string;
  kitchenName: string;
  imageUrl?: string;
  kitchenOpened: boolean;
  distance?: number;
  rating?: number;
  speciality?: string;
  mainSpeciality?: string;
  /** Veg/NonVeg/Jain tags the kitchen serves — drives the diet-mark icons on the card. */
  mealType?: string[];
  discountOffer?: DiscountOffer;
  /** Minutes the kitchen needs to prepare an order — feeds the Daily slot filter. */
  preparationTime?: number;
}

export interface OnDemandMenuItem {
  _id: string;
  itemName: string;
  itemDescription?: string;
  itemImage?: string;
  itemPrice: number;
  isVeg: boolean;
  itemType: 'Veg' | 'NonVeg' | 'Jain';
  mealType?: string;
  groupCategory?: string;
  itemIsCombo?: boolean;
  /** Eligible for Daily (allDay) mode. */
  serveDaily: boolean;
  /** Eligible for Advance mode. */
  itemAvailable: boolean;
  /** Present only for stock-limited Daily items; absent = uncapped. */
  quantityAvailable?: number;
  quantityBooked?: number;
}

export interface OnDemandMenuGroup {
  groupName: string;
  items: OnDemandMenuItem[];
}

export interface OnDemandCartLine {
  item: OnDemandMenuItem;
  count: number;
}

export interface OnDemandCart {
  kitchen: OnDemandKitchen | null;
  mode: OnDemandMode | null;
  lines: OnDemandCartLine[];
  coupon: AppliedCoupon | null; // from '@/features/cart'
}
```

## Navigation flow

1. **Home shortcuts row** (`src/app/(tabs)/index.tsx`): the `daily`/`advance` shortcut
   keys' `SHORTCUT_ROUTES` entries change from the `ComingSoonScreen` placeholders to
   `/on-demand-kitchens?mode=allDay` and `/on-demand-kitchens?mode=advance`
   respectively (mirrors how Bulk's home tiles push into `/bulk-menu?category=X` —
   one parametrized screen, not N near-duplicate screens). `daily-order.tsx` and
   `advance-order.tsx` are deleted.
2. **Kitchen list** — new route `src/app/on-demand-kitchens.tsx`, param `mode`
   (`allDay|advance`, default `allDay`):
   - Cluster-scoped kitchen fetch, a text search bar (client-side filter over the
     fetched list — no new backend search endpoint), loading/empty/error states
     matching `DineInHome`'s pattern.
   - Each `OnDemandKitchenCard` navigates to `/on-demand-kitchen?kitchenId=X&mode=<mode>`.
3. **Kitchen detail** — new route `src/app/on-demand-kitchen.tsx`, params `kitchenId`,
   `mode` (initial value; can be switched in-screen):
   - Header: kitchen name, speciality tags, distance, "Order Between" window (from
     `schedule.loadOrderingWindows()`), rating.
   - `ModeToggle` (Daily/Advance) — switching re-filters the **same** already-fetched
     menu response (both eligibility flags come back in one `kitchenMenu` call, per
     the legacy's `fetchKitchenMenu`), no refetch needed.
   - `VegFilterChips` + a menu-local search input (client-side filter).
   - Grouped item list (`OnDemandMenuGroup[]`, fixed group ordering — see Business
     logic), each item an `OnDemandItemCard` with its computed status badge.
   - Sticky `OnDemandCartFooter` → pushes to `/on-demand-cart`.
4. **Cart/checkout** — new route `src/app/on-demand-cart.tsx`:
   - Line items, each with a `QuantityStepper`.
   - `OnDemandSlotPicker`: Advance mode shows a 2-day date chip row (tomorrow, day
     after — exact parity with the legacy's fixed `allowedMinDate`/`allowedMaxDate`)
     + hourly slot chips for the selected date; Daily mode shows only today's
     remaining hourly slot chips (filtered by the kitchen's prep buffer).
   - Bill breakdown reusing the same card/row visual pattern as `bulk-cart.tsx`
     (`BillRow`-style rows): item subtotal, kitchen discount (if any), delivery/
     packaging/platform charges + GST (from cluster config), coupon discount, wallet/
     cashback toggles, total.
   - Coupon entry + "view all" sheet, wallet/cashback toggles — reusing
     `features/cart`'s `CouponSheet`/`SavingsBanner`/`CouponCelebration` verbatim.
   - Footer: total + **"Proceed to Pay →"** → same placeholder `Alert.alert(...)` as
     Subscription/Bulk today. Disabled until a date+slot are chosen (mirrors bulk's
     `canCheckout` pattern, replacing the legacy's toaster-error-201 with a disabled
     button — this app already prefers disabled-button over toast, per the bulk spec).

## Business logic (ported from MealaweUserApp)

- **Kitchen list is mode-scoped by the route param**, but the toggle inside kitchen
  detail lets a user switch mode after landing on a kitchen — exactly like the
  legacy's `KitchenCardComponent.orderType` input (sets initial nav target) plus
  `kitchen-inside`'s own capsule toggle (switches mode in place).
- **One `kitchenMenu` fetch serves both modes**: `loadKitchenMenu(kitchenId)` returns
  every item once; `groupMenuByMode(items, mode)` buckets each item into a mode's
  menu by `item.serveDaily` (Daily) or `item.itemAvailable` (Advance) — mirrors
  `fetchKitchenMenu`'s `allDayItemList`/`advItemList` split. Items are grouped by
  `groupCategory` (falling back to `itemIsCombo ? 'Combo' : itemType`), sorted by a
  fixed order: `['Main course','Thalis','Combo','Breads','Rice','Deserts','Desserts','Breakfast']`,
  unrecognized groups pushed to the end — exact port of `fetchKitchenMenu`'s
  `groupOrder`/`sortByGroup`.
- **Ordering windows**: `schedule.loadOrderingWindows()` fetches
  `ALLDAY_ORDER_START_TIME`/`ALLDAY_ORDER_END_TIME`/`ADV_ORDER_START_TIME`/
  `ADV_ORDER_END_TIME` via the same `support.variables` (`getVariables`) call bulk's
  `loadBulkSlotWindow`/`loadFoodBoxVars` already use, falling back to `'08:00'`–`'22:00'`
  for both modes on any failure (exact legacy fallback). `isOrderingWindowOpen(mode,
  windows, now)` replaces the legacy's global `DIM_KITCHEN_CARD` cache with a plain,
  locally-computed check — same signal, no mutable global state.
- **Item status** (`pricing.itemStatusFor`): for Daily mode — `'missed'` when the
  Daily window is closed; `'coming-next'` when within 2 hours before the window
  opens (`1000*60*60*2` ms threshold, exact port); `'sold-out'` when
  `quantityAvailable` is present and `quantityAvailable - quantityBooked - cartCount
  <= 0` (stock cap only enforced when the field exists — the legacy's stock check was
  specifically written for the near-dead `daily` string but the nav layer routes
  everything through `allDay` in practice, so this port applies the same defensive
  stock cap to `allDay` items that carry the field, rather than silently dropping
  stock-limited items). For Advance mode — items are never stock-capped (per the
  legacy: "Advance items aren't stock-limited the same way"), only gated by
  `itemAvailable`.
- **Advance date range**: fixed to tomorrow + day-after-tomorrow (`schedule.
  advanceDates()`), exact port of `tabCart.page.ts`'s `allowedMinDate`/`allowedMaxDate`
  (noon-pinned). **Advance slots**: hourly chips across the ADV window
  (`advanceSlotsFor`), no "future only" filter needed since the date is already ahead.
  **Daily slots**: hourly chips across the ALLDAY window, filtered to only slots at
  least `kitchen.preparationTime` minutes ahead of now (`allDaySlotsFor`) — exact port
  of `generateTimeSlotsArray`'s `allDay` branch, minus the legacy's delivery-partner
  ETA term (`dunzoETA`), which requires 3rd-party quote infra not present in this app
  (see Explicitly out of scope) — a fixed prep-buffer constant stands in for it.
- **Same-kitchen/same-mode cart constraint**: adding an item from a different kitchen
  or under a different mode than the current cart triggers the same "Switch and clear
  your cart?" `ConfirmDialog` pattern `bulk-menu.tsx` already built for category
  switches (`pendingSwitch` state + confirm/cancel) — not a new UI pattern.
- **Kitchen discount offer** (`pricing.kitchenDiscountFor`): percentage or flat, gated
  by `startDate`/`expiryDate`, percentage capped by `maxLimit`, exact port of
  `checkForOffers()`/`getKitchenDiscount()`. Shown as a badge on the kitchen card and
  applied as a bill line before coupon/wallet/cashback.
- **Bill charges** (`bill.chargesFromOnDemandConfig`): reads `onDemandDeliveryCharges`/
  `onDemandDeliveryChargesDiscount`/`onDemandDeliveryGstPercentage`,
  `onDemandPlatformCharges`/`onDemandPlatformChargesDiscount`/
  `onDemandPlatformChargesGstPercentage`, `onDemandEcoFriendlyPackagingCharges`/
  `onDemandEcoFriendlyPackagingChargesDiscount`/`onDemandEcoFriendlyPackagingGstPercentage`
  — **all real, already-existing fields** on the `ClusterConfigVariable` server model
  (confirmed in `MealaweServerApp/src/model/clusterConfigVariable.model.js`), applied
  once per order (not scaled by day count, unlike subscription) — exact parity with
  `getOtherPayAmt()`'s math, ported the same way `bill.ts#chargesFromConfig` already
  ports subscription's per-meal charges.
- **Coupon filtering**: reuse the same `validCoupons` endpoint bulk/subscription
  already call, filtering `coupon.orderTypes.indexOf(mode) > -1` (the legacy coupon
  model literally lists `orderTypes: ['advance', 'daily', 'allDay']` — confirmed on
  `MealaweServerApp`'s coupon seed data) — so both `allDay` and `advance` are valid
  `orderTypes` values to filter by, matching `cart-management`'s `orderType` string
  exactly (also confirmed against the server's `foodOrder.model.js` enum, which lists
  `'advance'`/`'daily'`/`'allDay'` alongside `'subscription'`/`'oyo'`/`'apartment_today'`/
  `'apartment_advance'`/`'dineIn'`).

## Design/UI

No new visual system — matches Bulk's "100% reuse existing tokens" approach:
- `AppText` variants, `Button` variants, `AccentIcon` tones, `DietMark` for veg/non-veg.
- Cards: `rounded-2xl border border-border bg-card` + `shadow.card`.
- `OnDemandSlotPicker` and the date-chip row directly follow `BulkDeliveryPicker`'s
  established chip pattern (filled pill = selected, outline = not).
- `ModeToggle` is a new small two-capsule segmented control (`Button`-variant style,
  not a new primitive) — same visual language as `bulk-menu.tsx`'s
  Individual/Bulk `Button` pair.
- Item status badges (Missed/Coming next/Not available) render as a small tinted
  label using `AccentIcon`'s tone system (`tone="nonveg"` red for Missed/Not
  available, `tone="info"` for Coming next) rather than the legacy's plain text —
  the one deliberate "improved UI" touch beyond straight parity, consistent with the
  brief to reuse this app's existing tokens rather than inventing new ones.

## Error handling

- Kitchen list fetch failure: empty-state card (matches `DineInHome`'s pattern).
- Kitchen menu fetch failure: empty-state card (matches `bulk-menu.tsx`'s
  "Couldn't load the menu" + Retry pattern).
- Ordering-window config fetch failure: falls back to the hardcoded `'08:00'`–`'22:00'`
  defaults (never blocks the screen).
- Missing date/slot at checkout: disabled "Proceed to Pay" button + inline caption,
  not a blocking alert (matches bulk-cart's `canCheckout` pattern).

## Verification

No unit test suite in this project (see `MealaweUserAppRN/CLAUDE.md`). Verify with:
- `npx tsc --noEmit` after every task.
- `npx expo export --platform android -c` at the end.
- Manual walkthrough: Home → Daily shortcut → kitchen list → kitchen detail (toggle
  to Advance, apply veg filter, watch item status badges) → add items → cart (confirm
  date/slot picker behavior per mode, bill math, coupon apply, kitchen-discount line)
  → Proceed to Pay placeholder. Repeat entry via the Advance shortcut to confirm the
  `mode` param pre-selects correctly.

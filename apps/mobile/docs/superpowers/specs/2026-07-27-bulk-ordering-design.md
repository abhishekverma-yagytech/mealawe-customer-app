# Bulk Ordering — Design Spec

**Status:** Approved, ready for implementation planning.

## Purpose

Add the "Bulk" order mode to MealaweUserAppRN, currently a placeholder tab on the
Home screen. Bulk lets a user order large quantities of food (Meals, Snacks, or a
Food Box) for events/groups, with quantity-tiered pricing and a delivery date that
pushes out as order size grows.

Functionality source of truth: `../MealaweUserApp` (Ionic/Angular), specifically:
- `src/app/tab-bulk/`
- `src/app/bulk-order-section/{bulk-meals,bulk-snacks,foodbox,bulk-order-cart,bulk-order-card,bulk-cart-footer}/`
- `src/service/apiService/apiConfig.service.ts` (bulk endpoints)

## Explicitly out of scope

- **Apartment/community bulk** (`apartment-inside/*`, `apartment-bulk-cart/*` etc.) — a
  separate B2B multi-tenant flow with its own menu/history endpoints. Future spec.
- **Corporate/occasion enquiry form** (`bulk-order/bulk-order-form/*`) — a lead-gen
  form with no menu/cart interaction. Future spec.
- **Real payment integration** (JusPay/Paytm). Bulk checkout ends at the same
  "Proceed to Pay →" placeholder alert that `src/app/cart.tsx` already ships with
  for Subscription. Wiring real payment is a separate, later effort for both flows.
- Order history / order-detail screens for bulk orders (mirrors current state:
  Subscription doesn't have these yet either).

## Scope

All three menu-driven bulk categories, each with an Individual/Bulk packaging
toggle:
- **Bulk Meals**
- **Bulk Snacks**
- **Food Box**

## Architecture

New feature module `src/features/bulk/`, mirroring the shape of the existing
`src/features/subscription/` module:

| File | Responsibility |
|---|---|
| `types.ts` | `BulkCategory`, `BulkMenuItem`, `BulkOrgInfo`, `BulkCartLine` |
| `api.ts` | `loadBulkMenu(category, packaging)`, `loadBulkCategoryImages()` |
| `pricing.ts` | Pure: `unitPriceFor(item, count)` (slab lookup), `isBelowMoq(item, count)` |
| `schedule.ts` | Pure: `minDeliveryDate(cartLines)`, `slotsFor(date)` |
| `useBulkCartStore.ts` | Zustand store — array of `BulkCartLine`, persisted via `kvStorage` |
| `components/BulkCategoryTile.tsx` | Home-tab category tile (image + label) |
| `components/BulkMenuItemCard.tsx` | Item card + quantity stepper |
| `components/BulkCartFooter.tsx` | Sticky "N items · ₹total · View cart" bar |

### Why a separate cart store instead of extending `useCartStore`

The existing `Cart`/`useCartStore` (in `src/features/cart` + `src/store/cartStore.ts`)
is hard-modeled as a single subscription line (`Cart.item: SubscriptionCartItem | null`).
Bulk needs an array of lines, per-line quantity, slab pricing, and its own
delivery-date logic driven by total quantity. Keeping bulk in its own store:

- Avoids any risk to the already-shipped Subscription checkout/storage shape.
- Keeps each store small enough to reason about independently.
- Matches how the old app itself treats these as separate systems (separate
  endpoints: `saveBulkFoodOrder` vs the subscription order endpoint; separate
  payment calls: `startBulkJusPayPaymentProcess` vs the plain version).

Tradeoff accepted: two "cart" concepts exist side by side rather than one unified
cart engine. A fully generic multi-item cart shared across order types would be
the "more correct" long-term architecture, but there's no current product need for
mixed-type carts, so building that now would be speculative (YAGNI).

## Data model

```ts
export type BulkCategory = 'meals' | 'snacks' | 'foodbox';
export type BulkPackaging = 'individual' | 'bulk';

export interface BulkOrgInfo {
  moq: number;
  slabLimit1: number;
  slabLimit2: number;
  slabLimit3: number;
  slabPrice1: number;
  slabPrice2: number;
  slabPrice3: number;
  slabPrice4: number;
  dateLimit1: number;
  dateLimit2: number;
  dateLimit3: number;
  deliverySlab1: number;
  deliverySlab2: number;
  deliverySlab3: number;
  deliverySlab4: number;
  packagingCharges: number;
  platformCharges: number;
  deliveryGstPercent: number;
}

export interface BulkMenuItem {
  _id: string;
  itemName: string;
  itemImage?: string;
  isVeg: boolean;
  category: BulkCategory;
  packaging: BulkPackaging;
  orgInfo: BulkOrgInfo;
  /** For Food Box only — nested selectable sub-items. */
  selectedItems?: BulkMenuItem[];
}

export interface BulkCartLine {
  item: BulkMenuItem;
  count: number;
}
```

## Navigation flow

1. **Home → Bulk tab** (`src/app/(tabs)/index.tsx`): replaces today's generic
   placeholder (currently rendered when `activeTab !== 'subscription'`) with three
   `BulkCategoryTile`s — Meals / Snacks / Food Box — laid out in the existing feed
   area below the hero.
2. **Menu screen** — new route `src/app/bulk-menu.tsx`, param `category`
   (`meals|snacks|foodbox`):
   - Individual/Bulk packaging segmented control (maps to `fetchBulkMenu` vs
     `fetchIndividualBulkMenu` in the old app; Food Box has its own
     predefined/custom equivalent).
   - Veg/non-veg filter chips (reuse the existing veg-filter pattern from
     `SubscriptionHome`).
   - List of `BulkMenuItemCard` (item + quantity stepper).
   - Sticky `BulkCartFooter` showing running item count + subtotal, tapping it
     pushes to `/bulk-cart`.
3. **Cart/checkout screen** — new route `src/app/bulk-cart.tsx`:
   - Line items list, each with a `QuantityStepper` (MOQ-aware).
   - Delivery date picker: minimum date auto-computed from
     `schedule.minDeliveryDate(lines)`, recomputed on every quantity change.
   - Hourly delivery slot picker (`schedule.slotsFor(date)`), windowed by the
     existing cluster config's B2B start/stop time variables.
   - Bill breakdown: item subtotal, delivery/packaging/platform (each with its
     own GST%, per `BulkOrgInfo`), taxes, total — reuses the same card/row
     components as `cart.tsx` (`BillRow`, `DetailRow` patterns).
   - Coupon entry + "view all coupons" sheet, wallet/cashback redemption toggles
     — reuses `features/cart`'s existing `CouponSheet`, `SavingsBanner`,
     `CouponCelebration` components (both cart flows share these, since coupon/
     wallet mechanics are identical regardless of order type).
   - Footer: total + **"Proceed to Pay →"** button → same placeholder
     `Alert.alert(...)` as the Subscription cart today.

## Business logic (ported from MealaweUserApp)

- **MOQ enforcement**: decrementing (or manually editing) a line's count below
  `orgInfo.moq` resets the count to 0 and shows an inline error under that item's
  stepper (`AppText` in the danger color) — this app has no toast system, so this
  replaces the old app's toaster error 206.
- **Slab-tier unit pricing**: `unitPriceFor(item, count)` picks `slabPrice1-4`
  based on where `count` falls relative to `slabLimit1-3` — the displayed unit
  price changes live as the stepper crosses a threshold.
- **Quantity-driven minimum delivery date**: each line's slab determines a
  `dateLimit`; `minDeliveryDate(lines)` = tomorrow + `max(dateLimit across lines)`.
  Recomputed whenever any line's count changes; if the currently-selected date
  falls below the new minimum, it's bumped forward automatically.
- **Slab-based delivery/packaging/platform charges**, each with its own GST%
  pulled from the cluster config (mirrors `chargesFromConfig` in
  `features/cart/bill.ts`, extended with bulk-specific config keys), computed
  from total order quantity — separate from Subscription's per-meal charge
  model.
- **Placing an order requires date + slot selected** — the "Proceed to Pay"
  button is disabled until both are set (replaces the old app's toaster error
  118 with a disabled-button state, consistent with how this app already
  disables buttons rather than using toasts elsewhere, e.g. `login.tsx`'s
  `phoneDisabled`).

## Design/UI

No new visual system — this reuses 100% of the existing token set:
- `AppText` variants, `Button` variants, `AccentIcon` tones.
- Cards: `rounded-2xl border border-border bg-card` + `shadow.card`, matching
  `cart.tsx`'s existing card style exactly.
- New shared primitive: `QuantityStepper` in `src/components/ui/` (`-`/count/`+`,
  ≥44×44 touch targets each, disabled state when at the MOQ floor).
- Category tiles on the Bulk tab follow the same tile/tone visual language as
  other Home-tab tiles (`AccentIcon`-style icon or image + label).

## Error handling

- Menu fetch failures: empty-state card ("Couldn't load the menu — pull to
  retry"), matching the empty-cart pattern already in `cart.tsx`.
- MOQ violations: inline per-item error text (see Business logic above).
- Missing date/slot at checkout: disabled "Proceed to Pay" button, not a blocking
  alert.

## Verification

This project has no unit test suite (see `MealaweUserAppRN/CLAUDE.md`). Verify with:
- `npx tsc --noEmit`
- `npx expo export --platform android -c`
- Manual walkthrough on-device: Home → Bulk tile → menu (switch packaging/veg
  filter, adjust quantities past a slab boundary and below MOQ) → cart (confirm
  delivery date shifts with quantity, bill breakdown math, coupon apply) →
  Proceed to Pay placeholder.

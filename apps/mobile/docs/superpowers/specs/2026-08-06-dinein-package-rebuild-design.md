# Dine In: Rebuild as Package-Based (Matching the Reference App) — Design

## Context

MealaweUserAppRN's "Dine In" feature (`src/features/dine-in/`, `dine-in-booking.tsx`,
`dine-in-confirm.tsx`) currently models a restaurant-table-reservation system: a
kitchen picker with ratings/open-close times, a party-size stepper, a special-requests
field, and a "Reserve Table" flow. This is **entirely fabricated** — confirmed by
cross-repo research:

- The four endpoints it calls (`getDineInKitchensForCluster`, `getDineInAvailability`,
  `saveDineInBooking`, `getPastDineInBookings`) don't exist anywhere in
  `MealaweServerApp`. The RN code itself flags this: `src/services/http/endpoints.ts`'s
  `dineIn` block is the *only* section in that file marked "⚠️ PROPOSED — NOT verified
  against a live backend."
- The reference apps' real Dine In (`MealaweUserApp/src/app/tab-dine-in/`,
  `mealaweApp/src/app/home/dinein/`) has no kitchen/table concept at all. It's
  **exactly the Subscription package-browse flow**, with one boolean flag,
  `isDineIn: true`, threaded through the same package → configure → cart pipeline.
  There is one kitchen entity total (a single "Mealawe Kota" central kitchen), not a
  marketplace of bookable restaurants.
- The real, existing backend endpoint for this — `POST /getDineInPackageListCluster`
  — is never called anywhere in the RN app.
- Kota staging already has this real data cloned from production (confirmed via a
  dry run of `MealaweServerApp/scripts/setup-pune-kota-staging.js`): one
  `KitchenPartner`, its menu, 7 `DineInPackage` documents, 8
  `SubscriptionWeeklyMenu` documents — all "already present."

## Decision

Delete the fabricated kitchen/booking feature. Rebuild Dine In as a thin adapter: fetch
real `DineInPackage` documents, normalize them into the app's existing `MealPackage`
shape, render them with the existing `PlanCard`, and hand off to the **already-correct**
Subscription configure → cart pipeline with `isDineIn: true`.

**This is a much smaller change than it looks.** Research established that
`isDineIn` is *already* threaded through every downstream consumer, correctly, with
zero code changes needed:

- `ConfigureContext.isDineIn?: boolean` already exists
  (`src/features/subscription/configureStore.ts`).
- `subscription-configure.tsx` already forwards `context.isDineIn` into the saved
  `SubscriptionConfig` (line 116) and already supports the full add-on / date /
  Lunch+Dinner-toggle flow the reference's dine-in "configure" step needs — this is
  the same screen, not a variant.
- `SubscriptionConfig.isDineIn?: boolean` / `SubscriptionCartItem` already carry it
  (`src/features/cart/types.ts`).
- `cart.tsx` already branches on it for the address row (`!item.isDineIn ? <Address> :
  <"Dine-in — Eat at the kitchen">`, line 250) and already re-forwards it on the
  "Edit add-ons" round-trip (line 151).
- `src/features/cart/bill.ts` already zeroes delivery/packaging/platform charges for
  dine-in lines (line 129: `const scale = item.isDineIn ? 0 : mealsPerDay * days *
  count;`).
- Checkout/order-creation **is not wired up for any vertical yet** — every existing
  cart screen's "Proceed to Pay →" is a placeholder `Alert`. Dine In's rebuild
  matches this exactly; building the real JusPay/Paytm order payload
  (`userSelectedDates`, `mealTimeLunch`, etc. — the exact field names are documented
  below for whenever that work happens) is explicitly **out of scope** here.

So the only genuinely new code is: one API function, one normalizer, one home
component, and the usual delete-the-dead-code + fix-the-tests cleanup.

## What gets deleted

- `src/app/dine-in-booking.tsx`, `src/app/dine-in-confirm.tsx` — no bespoke
  booking/confirm screens; Dine In now routes through `/subscription-configure` →
  `/cart`, same as Subscription.
- `src/features/dine-in/useDineInBookingStore.ts`, `schedule.ts` (its cutoff/
  meal-window logic is meaningless without table time slots),
  `components/KitchenHeroCard.tsx`, `components/DineInDateSlotPicker.tsx`,
  `components/BookingSummaryCard.tsx`.
- The fabricated `dineIn` block in `src/services/http/endpoints.ts`.
- `.maestro/flows/dine-in-booking.yaml`.
- The `useDineInBookingStore` wiring in `src/store/index.ts` (its `hydrate()` call
  and both re-exports).

## What gets built

- **`src/features/dine-in/types.ts`** — replaced. No more `Kitchen`/`DineInSlot`/
  `DineInBookingDraft`/`DineInBooking`. Nothing new needed here either — the
  normalizer produces a plain `MealPackage` (from `@/features/subscription`), so
  this file can be deleted entirely; `index.ts` no longer needs a `types.ts` import.
- **`src/features/dine-in/api.ts`** — replaced with one function:
  `loadDineInPackages(): Promise<MealPackage[]>`, calling `POST
  /api/getDineInPackageListCluster` with body `{ custerList: clusterIds }` (the
  misspelled key is the server's real contract — both reference apps replicate it
  verbatim) and normalizing each raw document into `MealPackage` shape. The one
  structurally different field is `packageCategory`: `DineInPackage` stores it as
  `{ name: 'Lunch'|'Dinner', selected: boolean }[]`, while `MealPackage.packageCategory`
  is a plain string — the normalizer joins the `selected: true` entries' names with
  `', '` (e.g. `"Lunch, Dinner"`) for display, matching what a human reading a
  `MealPackage.packageCategory` string would expect. Every other field
  (`packageName`, `packagePrice`, `discount`, `days`, `multiDateAllowed`,
  `addonsList`, `imageUrl`, `isBestSeller`, `packageSubCategory`, `packageType`,
  `offerText`, `offerColor`, `priority`, `clusters`, `vegMealDescription`,
  `nonVegMealDescription`, `deliveryOnWeekends`) maps straight across —
  `MealPackage`'s index signature (`[key: string]: unknown`) absorbs anything else
  (`dineInLocation`, `menuList`, `isActive`) without needing new type fields today.
- **`src/features/dine-in/components/DineInHome.tsx`** — replaced. A hero banner +
  flat list of `PlanCard`s (no category tabs — the 7 real Kota packages are
  duration/meal-time named, e.g. "Monthly Package (60 Meals)", "Bi-Weekly
  Package-Lunch (14 Meals)", not thali-category named, and the server already
  sorts by `priority`). Tapping "Select" on a package calls:
  ```ts
  useConfigureStore.getState().set({ package: pkg, category: 'Dine In', isDineIn: true });
  router.push('/subscription-configure');
  ```
  exactly mirroring `mealaweApp`'s `DineInHomeComponent.select()`.
- **`src/features/dine-in/index.ts`** — replaced: exports only `DineInHome`.
- **`src/services/http/endpoints.ts`** — the `dineIn` block is replaced with a
  verified one: `dineInPackage: { listCluster: '/api/getDineInPackageListCluster'
  }`, annotated as verified (matching this file's convention for every other
  section) instead of "⚠️ PROPOSED."

`src/app/(tabs)/index.tsx` needs **no changes** — it already imports `DineInHome`
from `@/features/on-demand`... no, from `@/features/dine-in` and renders `<DineInHome
topInset={collapseDistance + 24} />` for the `'dinein'` tab. The new `DineInHome`
keeps that exact same `{ topInset?: number }` prop contract, so the Home screen is
untouched.

## Out of scope (confirmed with the user's own framing of the task)

- Building the real checkout/order-creation payload (`userSelectedDates`,
  `mealTimeLunch`/`mealTimeDinner`/`mealTimeBreakfast`, `subscriptionLunchSlot`/
  `subscriptionDinnerSlot`, `mealPackage` snapshot, `dineInLocation`) — greenfield
  for every vertical in this app today, not just Dine In. The exact field-name
  contract is documented above for whenever that project happens; getting it right
  matters more than getting it now (mealaweApp's `OrderService` uses the *correct*
  key `userSelectedDates`; MealaweUserApp's older `dine-in-cart.page.ts` uses a
  dead key, `subscriptionSelectedDates`, that the backend silently ignores — don't
  copy that mistake when this work does happen).
- Any change to `subscription-configure.tsx`, `cart.tsx`, `bill.ts`,
  `configureStore.ts`, `PlanCard`, `CouponSheet`, or any other Subscription/cart
  infrastructure — all already correct for this reuse, confirmed by research, zero
  changes needed.
- Deriving default Lunch/Dinner toggle state from `packageCategory`. MealaweUserApp
  does this via a finicky, partially-broken parse (its own template has an
  unwired click handler on the meal-slot capsules — a bug in the reference, not
  something to replicate). `mealaweApp` (the more current reference this project
  otherwise mirrors) doesn't do this at all — its shared Configure page always
  defaults `lunch=true, dinner=false`, same as RN's existing
  `subscription-configure.tsx`. Following `mealaweApp`'s simpler, already-ported
  behavior — no new logic needed.

## Testing

Per this project's convention (no unit tests — verify via `npx tsc --noEmit` +
`npx expo export --platform android -c`):

- Rewrite `DINEIN-01`/`02`/`03` (currently describe kitchen-list empty/error/
  no-photo states) to describe the new package-list states.
- Delete `DINEIN-04` through `DINEIN-09` (booking-flow-specific: date/slot
  selection, party size, reservation confirm/retry) — no longer applicable, no
  replacement needed since those interactions don't exist in the package model.
- Keep `DINEIN-10`/`11` unchanged (Home-level cluster-detection/flag-priority
  behavior, unrelated to the booking-vs-package internals).
- Add new rows covering the package → configure → cart handoff specifically for
  dine-in (the "Dine-in / Eat at the kitchen" address-row substitution, zeroed
  delivery/packaging charges) — the configure/cart mechanics themselves are already
  covered by Subscription's own test rows, so these only need to assert the
  dine-in-specific branch, not re-test the whole flow.
- Replace `.maestro/flows/dine-in-booking.yaml` with a new flow following
  `home-browse-subscription.yaml`'s style: tap a Dine In package → configure
  (verify Lunch/Dinner toggle + at least one date selectable) → cart → assert the
  "Dine-in" row (not "Address").
- Update `E2E-39` (currently "Browse kitchens → book a table → confirm reservation,"
  referencing the deleted flow) to describe the new flow.

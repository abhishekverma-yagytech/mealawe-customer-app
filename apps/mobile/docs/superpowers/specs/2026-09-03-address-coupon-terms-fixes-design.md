# Address Auto-Select, Checkout Address Gate, Coupon Business Rules, Terms & Conditions — Design Spec

## Goal

Four independent fixes/additions, bundled because they were raised together:

1. **Fix** the 500m saved-address auto-select so it actually has a chance to fire in real usage (today it's dead code in practice).
2. **Add** a "must be a saved address, not just current location" gate before checkout on all four checkout screens.
3. **Port** the Ionic reference app's coupon business rules (`couponScope`, `couponUsage`, `offerAppliedOn`, `discountOnDelivery`/`discountOnItems`) into the RN app's coupon system, which today has none of them.
4. **Replace** the WebView-based Terms & Conditions sheet with a native in-app screen — the live marketing page is too heavy for the WebView to reliably signal "loaded."

Each section below is independently shippable; there's no dependency between them.

## Note on concurrent work in this repo

A separate, unrelated "Subscription Cart Redesign" effort (`docs/superpowers/specs/2026-09-03-subscription-cart-redesign-design.md`) is being implemented concurrently in this same working tree — as of this writing there are uncommitted changes in `cart.tsx`, `bill.ts`, `types.ts`, `cartStore.ts` (visual/layout work: Other Subscriptions row, Tree Plantation, Bill Summary/GST sheets). That work is unrelated to the business logic here and the fields/functions below don't overlap with it, but **implementation must re-read the current state of any shared file immediately before editing it** rather than relying on line numbers captured during this design pass — they will have moved.

---

## 1. Location auto-select fix

### Root cause (confirmed by reading the code, not guessed)

The 500m matching logic itself (`src/features/location/geo.ts`'s `matchSavedAddress`) is correct. The bug is entirely about *when* it's invoked:

- `src/app/index.tsx`'s boot gate renders `LocationSplash` with `hasAddress={!!currentAddress}`, where `currentAddress` comes from `useLocationStore`.
- `LocationSplash.tsx` only calls `useCurrentLocation()` (the GPS-fetch-and-match flow) when `hasAddress` is `false`. When `hasAddress` is `true`, it just holds a 1.1s branded beat and moves on — **no GPS fetch, no matching, at all.**
- `locationStore.current` gets set to *something* — even the ad-hoc, unsaved "Current location" pin created by `useCurrentLocation()`'s own fallback branch when no saved address matched — on essentially the first cold launch, typically before the user has any saved addresses (they just installed/registered). From that point on, `current` is never null again.
- Net effect: the match check only ever gets a chance to run once, at the exact moment there is nothing to match against. Once the user later adds a saved address, the app never re-checks GPS against it on subsequent launches, because `hasAddress` is already (and permanently) `true`.

Checked against both Ionic references to ground the fix rather than inventing new UX behavior: the newer `mealaweApp` (`address.service.ts` + `home.page.ts`'s `maybeAutoDetectLocation`) gates identically to the current RN code — bails immediately if `addressService.current()` is already truthy. RN faithfully copied this. The older `MealaweUserApp` (documented source of truth) instead re-checks unconditionally on every screen entry, but does so blindly against the *stored* coordinate (not a fresh GPS fix) and will silently swap the user's current address for a different saved one with no confirmation — a real UX downside we don't want to reintroduce.

### Fix

Add a background reconciliation step that runs on every cold launch, gated so it only ever *acts* when there's something legitimately unresolved:

- If `current` is `null` → unchanged: existing blocking flow (GPS fetch, capped by `TIMEOUT_MS`, on the location splash).
- If `current` is already one of the user's saved addresses (`saved.some(a => isSameAddress(current, a))`, using the existing `isSameAddress` helper from `src/features/location/types.ts`) → unchanged: fast path, branded beat only, no GPS fetch. This preserves the documented perf/UX rationale for returning users.
- If `current` exists but is **not** a saved address (i.e., it's the ad-hoc/GPS-only "Current location" address) → new: kick off a **non-blocking** background GPS fetch + `matchSavedAddress` (same 500m radius, same `getGps()`/timeout machinery already in `geo.ts`). If a match is found, silently call `setCurrent(matched)`. This does not extend `LocationSplash`'s branded-beat duration or block `onDone()` — it's fire-and-forget, so it can't regress launch time.

Implementation lands as a new `locationStore` action (e.g. `reconcileCurrentAddress()`), called from `LocationSplash`'s `hasAddress` branch without `await`, right alongside (not instead of) the existing beat timer.

### Explicitly out of scope

- Not porting the old app's "always re-check even when already on a saved address" behavior — that risks silently overriding a deliberate user choice.
- Not adding a UI affirmation/toast when the background reconciliation switches the address — it's meant to be as unobtrusive as the original one-time auto-select was intended to be. (Revisit if this turns out to be surprising in practice.)

---

## 2. Checkout "must be a saved address" gate

### Current state

- `subscription-configure.tsx`'s "Review & pay" button (`canSave`) and `cart.tsx`'s "Proceed to Pay" button (`pay()`) don't require an address at all today — `customerLocation` is sent as `undefined` if there's none.
- `on-demand-cart.tsx` and `bulk-cart.tsx` already block on `!address`, but "address" there means *any* `locationStore.current`, including the ad-hoc unsaved one — not specifically a saved address.
- Only `subscription-configure.tsx` has a live, inline, editable address section in the same scroll view (`DeliverToSection`). `cart.tsx` shows the address as a **read-only** `DetailRow` (no `onPress`, unlike the Schedule row which already has a "Change" affordance). `on-demand-cart.tsx`/`bulk-cart.tsx` don't render any address UI at all today.

### Fix

Add a shared helper (e.g. `hasSavedAddress(current, saved)` next to `isSameAddress` in `src/features/location/types.ts`) — `current != null && saved.some(a => isSameAddress(current, a))` — and gate each checkout action on it:

- **`subscription-configure.tsx`**: fold into `canSave` (or a separate check right before `save()`'s body runs) — if not satisfied, show an inline message and scroll the existing `ScrollView` to bring `DeliverToSection` into view (measure via `onLayout` + `scrollTo`, no new picker needed — the section is already interactive).
- **`cart.tsx`**: check at the top of `pay()`. On failure, show the message and scroll to the "DELIVERY DETAILS" card's Address row. Since that row is read-only today, give it the same `onPress` treatment `DetailRow` already supports for Schedule (adds a "Change" affordance) — tapping it navigates to `/addresses` (the existing address-manager screen), consistent with how the rest of the app lets users change addresses.
- **`on-demand-cart.tsx`** / **`bulk-cart.tsx`**: check at the top of `pay()`, tightening the existing `!address` check to `!hasSavedAddress(...)`. Since neither screen has an address section to scroll to, show the message and navigate straight to `/addresses` instead.

Message copy (draft, refine during implementation): *"Please select a saved delivery address to continue."* Presented via the app's existing `Alert`/banner pattern already used elsewhere on these screens (not a new component).

### Explicitly out of scope

- Not building a new inline address section for `on-demand-cart.tsx`/`bulk-cart.tsx` — that's a bigger, unrelated screen change; navigating to `/addresses` is consistent with how those screens handle addresses today (they don't show one at all).

---

## 3. Coupon business rules port

### Current state

- `SubscriptionCoupon` (`src/features/subscription/types.ts`) and `AppliedCoupon` (`src/features/cart/types.ts`) carry none of `couponScope`, `couponUsage`, `offerAppliedOn`, `discountOnDelivery`, `discountOnItems`.
- `discountFor(coupon, subTotal)` (`src/features/cart/bill.ts`) is the single shared discount calculator used by all three carts (subscription's `cart.tsx`, `on-demand-cart.tsx`, `bulk-cart.tsx` all import it directly from `@/features/cart`). It only ever discounts the item/plan subtotal — never delivery — and has no concept of a bill-wide base amount.
- Critically, **the RN app never calls the server's per-user usage-check endpoint at all.** It only checks that a typed/selected code exists in the already-fetched "valid coupons for this cluster" list. That means `couponUsage` limits (`oneTimeOneUser`, `oneTimeOneDay`) are silently unenforced client-side today — a user can reapply a single-use coupon indefinitely.
- Backend already has everything needed and requires no changes: `offerCoupon.model.js` already defines all these fields; `GET /api/validateCouponForUser/:couponCode/:userId/:clientDate` already enforces `couponUsage` server-side and returns `{status: 'VALID_OFFER'|'INVALID'|'ERROR', msg?}`.

### Fix

**Types** — add the named fields to `SubscriptionCoupon`:
```ts
couponScope?: 'generic' | 'userSpecific';
couponUsage?: 'oneTimeOneUser' | 'oneTimeOneDay' | 'everytime';
offerAppliedOn?: 'billAmount' | 'itemAmount';
discountOnDelivery?: boolean;
discountOnItems?: boolean;
```
(`couponScope` filtering, like `clusters`, is already enforced server-side in the coupon-list endpoint — the client doesn't need to re-filter by it, just carry the field through if it's ever needed for display.)

**Discount calculation** — extend `discountFor`'s signature to accept the bill context it needs (delivery charge, taxes) rather than just `subTotal`, and change its return shape to `{ itemDiscount, deliveryDiscount, reason? }` (sum = total discount). New logic, mirroring the Ionic `validateAndApplyCoupon` algorithm exactly:
1. Base amount (`amtBeforeDiscount`) = item subtotal by default; if `offerAppliedOn === 'billAmount'`, add delivery charge + taxes.
2. `minAmount` gate against that base (unchanged behavior, just against the new base when applicable).
3. Compute the raw discount (flat/percentage/`applyFullDiscount`, capped at `maxLimit`) — unchanged math.
4. Split the discount: if `discountOnDelivery`, take up to the delivery charge out first; if `discountOnItems` and anything remains, the rest goes to items. (If neither flag is set, default the whole amount to items — today's behavior — for backward compatibility with coupons that don't set either flag.)

Each cart's own bill builder (`buildBill` in `bill.ts` for subscription; the equivalent in on-demand/bulk) applies `itemDiscount` where `couponDiscount` is applied today (reduces the GST-taxable item base) and applies `deliveryDiscount` as a straight deduction against the delivery charge line, *not* through the item-GST calculation — matching the Ionic reference's GST-parity behavior documented in the research.

**Server usage-check call** — add `validateCouponForUser` to `src/services/http/endpoints.ts` (alongside `validCoupons`) and a client wrapper. Call it (as the Ionic app does) right before actually applying a coupon, after the local `minAmount`/base-amount check passes: if the response isn't `VALID_OFFER`, show the returned `msg` (or a fallback) and don't apply. `couponCode === 'WELCOME'`-style bypass from the Ionic app is **not** ported — there's no such hardcoded built-in coupon in the RN app today, so there's nothing to special-case.

**Wiring** — apply this uniformly across `cart.tsx`, `on-demand-cart.tsx`, `bulk-cart.tsx` (all three already share `discountFor`; the usage-check call is new to all three equally).

### Explicitly out of scope (confirmed with you earlier)

- `appliedOnlyOnSpecial` (special-menu-only coupons) and `marketplaceCategoryList` (item-category-restricted coupons) — not ported; you scoped this to the four named fields only.
- No change to how the coupon list itself is fetched/filtered/sorted (server already handles `couponScope`/`clusters`/validity window; client-side `orderTypes` filter + `seqWeightage` sort are unchanged).

---

## 4. Terms & Conditions — native screen

### Current state

`src/features/auth/components/TermsSheet.tsx` loads `https://mealawe.com/terms/` live in a `react-native-webview`. The URL itself is healthy (verified: 200 OK, real ~352KB WordPress/Divi page, no blocking headers) — but it's a heavy page-builder page carrying third-party Cloudflare Turnstile + Google reCAPTCHA scripts (for an unrelated contact form on the same page), and the component's own existing code comments already document that WebView's load-complete signals (`onLoadEnd`/`onLoadProgress`) are unreliable for this kind of content — an earlier attempt to load it via injected static HTML instead of live navigation was already tried and reverted for the same reason. Symptom you confirmed: the sheet opens but the content area stays blank/spinner-stuck.

### Fix

Replace the WebView with a native screen/sheet rendering the terms copy as bundled app content (plain text/markdown shipped with the app) — no network dependency, no WebView, instant and 100% reliable. Reuses the existing `AppSheet` shell and header/close-button chrome from `TermsSheet.tsx` (same look, same imperative `present()` handle used by `login.tsx` and anywhere else it's invoked) — only the body swaps from `<WebView>` to a scrollable `<AppText>`/markdown render of the current legal copy.

Implementation needs the current terms text pulled from the live page (already fetched during this research pass) and transcribed into the app with its section structure preserved.

**Trade-off you accepted:** future legal-copy edits require an app release rather than being editable server-side. If that becomes a problem later, the lightweight-backend-endpoint alternative discussed earlier is the fallback path — not being built now.

### Explicitly out of scope

- No backend endpoint for terms content (that was the alternative you didn't pick).
- Not touching `WebView` usage elsewhere in the app (e.g. `marketplace.tsx`) — this is scoped to `TermsSheet` only.

---

## Testing

No unit tests in this project (`docs/TESTING-WORKFLOW.md`). Verify with `npx tsc --noEmit` and `npx expo export --platform android -c`. Per the project's standing convention, author/update Maestro flows under `.maestro/flows/` covering: cold launch with an unsaved current-location address near a saved one (auto-reconciles), attempting checkout with no saved address selected on each of the four checkout screens (blocked + redirected to the address section/screen), applying a `billAmount`-scoped and a `discountOnDelivery`-scoped coupon and checking the bill math, attempting to reapply a `oneTimeOneUser` coupon a second time (rejected), and opening Terms & Conditions from login (renders instantly, no spinner) — plus corresponding rows in `scripts/generate-test-catalogue.mjs`.

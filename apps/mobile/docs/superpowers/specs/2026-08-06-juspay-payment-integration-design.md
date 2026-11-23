# JusPay Payment Integration — Design Spec

## Goal

Wire real checkout payments into MealaweUserAppRN using **JusPay HyperSDK**, the same
gateway `MealaweUserApp` (Ionic/Capacitor) and `mealaweApp` (Ionic 8 rewrite) already
use in production. **No backend changes** — `MealaweServerApp` already exposes a
complete, working JusPay contract; this is a client-only integration.

Today, every cart screen's "Pay" button is a stub:
```ts
// src/app/on-demand-cart.tsx:388 (same pattern in cart.tsx, bulk-cart.tsx)
onPress={() => Alert.alert('Payment', 'Payment (JusPay / Paytm) is the next phase — cart is ready.')}
```

## Reference architecture (how the Capacitor apps do it)

One native SDK (`hyper-sdk-capacitor`, wrapping JusPay's native Android/iOS **HyperSDK**),
initialized once at app start, then reused for every checkout:

1. **Init** (app start): `HyperServices.createHyperServices(clientId, 'in.juspay.hyperpay')`,
   register a `HyperEvent` listener (`show_loader`/`hide_loader`/`initiate_result`/
   `process_result`) and a hardware-back-button interceptor, then
   `HyperServices.initiate({ action:'initiate', integrationType:'redirection', environment, merchantId, clientId })`.
2. **Create order** (per checkout): POST the full order body to one of three
   endpoints — the backend validates it, persists an order row, and (if `amount > 0`)
   calls JusPay's Session API server-side, returning
   `{ checkoutDetails, jusPaySessionObj, jusPayPaymentLink }`.
3. **Open payment page**: `HyperServices.process(jusPaySessionObj)` — hands the opaque
   session object straight to the native SDK, which renders JusPay's own payment UI
   in-app. No app-side UI for card/UPI entry.
4. **Result**: the `HyperEvent` listener's `process_result` event fires → app calls
   `POST /transaction/validateJusPayPaymentTransaction` to get the definitive
   success/fail, then shows the order-placed screen and resets the cart.

There is **no deep link, no polling loop, no client-side webhook** — steps 3→4 are a
single native SDK call-and-callback. A `/jusPaycallback` webhook exists server-side
but is currently an unused stub; the client never touches it.

## Backend contract (already live, verified against `MealaweServerApp` source — no changes needed)

Four endpoints, all under `/transaction`, all JWT-authed (`Authorization: Bearer <token>`):

| Endpoint | Purpose | Persists to |
|---|---|---|
| `POST /transaction/startJusPayPaymentProcess` | Subscription packages (incl. Dine In) **and** plain ad-hoc food orders (On-Demand, Advance, OYO, apartment) | `FoodOrderPackage` if `orderType==='subscriptionPackage'`, else `FoodOrder` |
| `POST /transaction/startBulkJusPayPaymentProcess` | Bulk meals/snacks/food-box orders | `bulkFoodOrder` |
| `POST /transaction/startMarketPlaceJusPayPaymentProcess` | Navmool marketplace orders | `MarketPlaceMainOrder` (not needed yet — RN has no marketplace cart) |
| `POST /transaction/validateJusPayPaymentTransaction` | Confirm payment result after the SDK callback | routes by `orderType` to the matching service above |

Response envelope (all three "start" endpoints, identical shape):
```json
{ "checkoutDetails": { /* saved order document, raw Mongoose fields */ },
  "jusPaySessionObj": { /* JusPay sdk_payload, or {} if amount<=0 (wallet-covered) */ },
  "jusPayPaymentLink": "https://... (hosted fallback URL) or ''" }
```

If `amount <= 0` (fully covered by wallet), the backend skips JusPay entirely and saves
the order as `orderstatus:'placed'` immediately — the client must detect this
(`jusPaySessionObj` is empty) and treat it as an instant success, no SDK call.

**Client config already correct** — `src/config/environments.ts:41-44,70`:
```ts
const juspay = { clientId: 'mealwe', merchantId: 'mealwe' };
```
This is the exact same `clientId`/`jusPayMerchantId` value used by `MealaweUserApp`
(`android/build.gradle:5-6`, `environment.ts:29-30`) across local/staging/production —
**no new credentials need to be requested from JusPay**; the merchant is already
provisioned for this app bundle.

**Encryption**: the RN app's `http` client (`src/services/http/httpClient.ts`) already
AES-encrypts every request/response body the same way the reference apps do
(`Authorization` header doubles as key material). The payment endpoints ride the same
`http` client — no special-casing needed, **provided** we never send a `session-token`
header (confirmed: the backend's encryption is opt-in per-request via that header;
omitting it — which is what `httpClient.ts` already does today — keeps these routes on
plain JSON, matching the "path of least resistance" the backend supports).

### `orderType` → endpoint → persistence, confirmed per RN feature

| RN cart | `orderType` value(s) | Endpoint | Confidence |
|---|---|---|---|
| Subscription (`cart.tsx`) | `'subscriptionPackage'` | `startJusPayPaymentProcess` | Confirmed (matches `dine-in-cart.page.ts:714`, `tabCart.page.ts:2796`) |
| Dine In (same screen, `isDineIn:true`) | `'subscriptionPackage'` + `isDineIn:true` on the package line | `startJusPayPaymentProcess` | Confirmed |
| On-Demand (`on-demand-cart.tsx`), `mode==='allDay'` | `'allDay'` | `startJusPayPaymentProcess` (plain `FoodOrder` path) | Confirmed — RN's own `OnDemandCart.mode` field already uses this exact string; traced to `kitchen-card.component.ts:78-79`/`kitchen-near.component.ts:16` in the reference app |
| On-Demand, `mode==='advance'` | `'advance'` | `startJusPayPaymentProcess` | Confirmed — `tabCart.page.ts:2689-2699` |
| Bulk (`bulk-cart.tsx`), category × packaging | `individualMeals` / `bulkMeals` / `individualSnacks` / `bulkSnacks` | `startBulkJusPayPaymentProcess` | Derived, not yet verified: RN's `BulkCategory` (`'meals'\|'snacks'\|'foodbox'`) × `BulkPackaging` (`'individual'\|'bulk'`) cross-product covers 4 of the 6 backend enum values cleanly |
| Bulk, `category==='foodbox'` | `predefinedSnackbox` or `customSnackbox` | `startBulkJusPayPaymentProcess` | **Unresolved** — RN's `BulkCategory` has no predefined-vs-custom distinction today; needs a design decision (see Open Questions) |

## Proposed RN architecture

### 1. Native SDK layer

Adopt JusPay's own React Native SDK + Expo plugin rather than a bespoke native module:
- **`hyper-sdk-react`** (npm, actively maintained by JusPay) — the RN bridge.
- **`hyper-sdk-expo-plugin`** (npm, JusPay's official Expo config plugin) — patches
  `android/build.gradle`'s `ext` block (`clientId`, `hyperSDKVersion`, JusPay's private
  Maven repo) and iOS `Podfile`/`MerchantConfig.txt` during `expo prebuild`, mirroring
  what the Capacitor plugin does today.
- Both are applied via `app.json`'s `plugins` array + `expo.extra`, then
  `npx expo prebuild` regenerates `android/` (already exists) and creates `ios/`
  (doesn't exist yet in this repo).

**Known risk (flag before committing engineering time):** `hyper-sdk-react` has open,
unresolved GitHub issues for React Native's **New Architecture** on RN 0.82/0.83
(#132, #144) and an unmerged "support new architecture" PR (#121). This project has
`newArchEnabled=true` (RN 0.86). A short build spike — get a bare `expo prebuild`
Android build compiling and launching `HyperServices.initiate()` — should happen
**before** any per-cart wiring work, so a New-Arch incompatibility is caught early
rather than after 3 features are wired to a payment layer that doesn't build.

### 2. Shared payment module (`src/services/payment/`)

A single module used by every cart, mirroring `PaymentGatewayService`/`payment.service.ts`
from the reference apps:

- `initJusPay()` — called once from app root (`src/app/_layout.tsx`), idempotent.
  Creates the `HyperServices` instance, registers the event listener, calls `initiate`.
- `payWithJusPay(orderBody, endpoint)` — POSTs `orderBody` to the given start-endpoint
  via the existing `http` client, then:
  - if the response's `jusPaySessionObj` is empty → resolve `{status:'success'}`
    immediately (wallet-covered order, no gateway involved)
  - else → `HyperServices.process(jusPaySessionObj)`, await the `process_result` event,
    then POST `validateJusPayPaymentTransaction` with `{orderType, foodOrderId}` and
    resolve with its `status`.
- Returns a discriminated result the caller's cart screen uses to route to an
  order-placed screen or show a retry affordance. **No idempotency protection exists
  server-side** (confirmed: a double-tap creates a duplicate order + duplicate JusPay
  session) — `payWithJusPay` must disable its own re-entry (a simple in-flight guard)
  since the backend won't catch it.

### 3. Order payload types (`src/services/payment/orderTypes.ts`)

A discriminated union keyed on `orderType`, one variant per row in the table above —
this doesn't exist anywhere in the reference codebases (they use untyped object
literals) so it's new, not ported. Each cart screen builds its own variant from data
already in its Zustand store + screen-local state (date/slot, which — per current RN
architecture — live in screen `useState` for Bulk and On-Demand, not in the persisted
cart store; the payload builder must read from both).

### 4. Per-cart wiring

Replace each `Alert.alert(...)` stub with a call into the shared module, using the
`orderType` mapping from the table above. Each cart already computes everything the
payload needs (bill breakdown via its own `bill.ts`, address via `useLocationStore` or
"Dine-in" sentinel, wallet usage via `useBalances()`, coupon via its own cart store).

### 5. Result UX

New (or reused) order-placed / order-failed screens, and a "payment pending" fallback
for the case where `validateJusPayPaymentTransaction`'s definitive status times out —
the reference apps have a background cron job to reconcile stuck orders server-side, so
the RN client can safely leave an order in `paymentInprogress` and let the user retry
validation later without data loss.

## Open questions (need a decision before or during implementation, not blocking the plan itself)

1. **Foodbox `orderType`**: does RN's food-box builder always behave like the
   reference app's "custom" box (user picks items freely) — in which case it's always
   `customSnackbox` — or is there a predefined-box mode planned? Needs a direct look at
   the food-box UI/menu-source before Bulk wiring starts.
2. **iOS**: no `ios/` folder exists in this repo yet. First `expo prebuild --platform ios`
   for this integration is also the first time this repo builds for iOS at all — budget
   time for any unrelated iOS-first-build issues, not just JusPay-specific ones.
3. **New Architecture compatibility** — see risk note above; may require disabling New
   Arch for a JusPay build spike, or waiting on JusPay's unmerged support PR, or asking
   JusPay support directly for a validated version pin.
4. **Marketplace/Navmool**: RN has no marketplace cart yet (only a placeholder tile) —
   `startMarketPlaceJusPayPaymentProcess` wiring is out of scope until that feature exists.
5. **`subscriptionParent` orderType**: the backend's `validateJusPayPaymentTransaction`
   has a pre-existing bug for this value (missing service import → 500). Not reachable
   from any RN flow in this plan (RN only ever sends `subscriptionPackage`), so it's a
   backend issue to flag separately, not something this integration needs to work around.

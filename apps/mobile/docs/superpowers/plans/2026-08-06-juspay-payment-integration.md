# JusPay Payment Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Payment is the next phase" stubs on Subscription, Dine In,
On-Demand, and Bulk carts with real JusPay HyperSDK checkouts, using the backend's
already-live `/transaction/start*JusPayPaymentProcess` + `validateJusPayPaymentTransaction`
contract. **No backend changes.**

**Architecture:** One native SDK (`hyper-sdk-react` + JusPay's own
`hyper-sdk-expo-plugin`), one shared payment module
(`src/services/payment/`) used by all four carts, one discriminated `OrderBody` union
covering every `orderType` the four carts can produce. Per-cart wiring is a thin
"build payload → call shared module → route to result screen" swap for the existing
`Alert.alert` stub.

**Tech Stack:** React Native (Expo SDK 57), `hyper-sdk-react`, `hyper-sdk-expo-plugin`,
existing `http` client (AES already handled), Zustand.

**Spec:** `docs/superpowers/specs/2026-08-06-juspay-payment-integration-design.md`

**Verification convention (no unit tests in this project):** every code task is
verified with `npx tsc --noEmit`. Native-config tasks are additionally verified with a
real Android build/launch (no automated equivalent — call this out explicitly per task).
Final task runs the full build (`npx expo export --platform android -c`) plus a manual
device smoke test.

---

### Task 0: Native SDK build spike — de-risk before any feature code

**Goal:** Prove `hyper-sdk-react` + `hyper-sdk-expo-plugin` actually build and run on
this repo's exact stack (Expo SDK 57, RN 0.86, **New Architecture enabled**) before
writing any payment feature code. This is the single biggest unknown in the whole
integration — `hyper-sdk-react` has open, unresolved GitHub issues for New Architecture
on RN 0.82/0.83 (#132, #144) and an unmerged support PR (#121).

**Do this in a throwaway branch/worktree, not the feature branch** — its only output is
a go/no-go decision plus notes for Task 1.

- [ ] **Step 1: Install and configure the minimum to build**

```bash
npm install hyper-sdk-react hyper-sdk-expo-plugin
```

Add to `app.json`'s `plugins` array and `expo.extra` (exact keys per
`hyper-sdk-expo-plugin`'s README — read it at install time, the shape below is
illustrative):
```json
{
  "plugins": ["hyper-sdk-expo-plugin"],
  "extra": { "hyperSdk": { "clientId": "mealwe", "hyperSDKVersion": "<ask JusPay support for a non-RC pin>" } }
}
```

- [ ] **Step 2: Prebuild and attempt an Android build**

```bash
npx expo prebuild --platform android --clean
npx expo run:android
```

Watch specifically for: Gradle failing to resolve JusPay's private Maven artifact,
codegen/Turbo Module errors related to New Architecture, or a crash on
`HyperServices.createHyperServices(...)` at runtime.

- [ ] **Step 3: If Android build fails on a New-Arch-specific error**

Try `newArchEnabled: false` in `app.json` as a diagnostic (not a proposed permanent
fix) to confirm whether New Arch is actually the blocker. Record the result either way.

- [ ] **Step 4: Report the go/no-go**

Document in the spec's Open Questions section (or a follow-up note) whether:
(a) it builds and runs cleanly — proceed to Task 1 as planned;
(b) it builds only with New Arch disabled — flag as a project-wide tradeoff decision
    for the user, since disabling New Arch affects more than just payments;
(c) it doesn't build at all — stop and escalate to JusPay support for a validated
    version pin before continuing this plan.

Do not proceed past Task 0 on outcome (c).

---

### Task 1: Install and configure the native SDK on the feature branch

**Files:**
- Modify: `app.json`
- Modify: `package.json` / `package-lock.json`
- Regenerate: `android/` (already exists — `expo prebuild` will modify it)
- Create: `ios/` (doesn't exist yet in this repo)

- [ ] **Step 1: Install**

```bash
npm install hyper-sdk-react hyper-sdk-expo-plugin
```

- [ ] **Step 2: Configure `app.json`**

Add the plugin + `extra.hyperSdk` block using the `clientId: 'mealwe'` value already
present in `src/config/environments.ts:70` (same value the Ionic apps use — no new
JusPay credentials needed) and the SDK version confirmed viable in Task 0.

- [ ] **Step 3: Prebuild both platforms**

```bash
npx expo prebuild --clean
```

Expected: `android/` regenerates with the JusPay Maven repo + `ext` block patched in
(diff against the pre-Task-0 state to confirm the plugin actually wrote them — don't
assume silently); `ios/` is created for the first time in this repo.

- [ ] **Step 4: Verify — build only, no payment code yet**

```bash
npx expo run:android
```
Expected: app launches to the home screen with no crash (the SDK isn't initialized by
app code yet, so nothing payment-related should run either way — this step is purely
confirming the native project still builds with the plugin applied).

- [ ] **Step 5: Commit**

```bash
git add app.json package.json package-lock.json android ios
git commit -m "feat: add JusPay HyperSDK native dependency (hyper-sdk-react + expo plugin)"
```

---

### Task 2: Order payload types

**Files:**
- Create: `src/services/payment/orderTypes.ts`

- [ ] **Step 1: Define the discriminated union**

One variant per confirmed `orderType` from the design spec's mapping table. Keep each
variant to the fields that specific endpoint's DAO whitelist actually persists (see the
spec's backend-contract research) plus the common customer/amount fields every start
endpoint reads (`amount`, `customerId`, `customerName`, `customerEmail`,
`customerPhoneNo`). Do not invent fields not confirmed against the backend DAO
whitelists — sending unrecognized fields is silently dropped, not an error, so a typo
here fails silently rather than loudly.

```ts
interface JusPayCustomer {
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhoneNo: string;
}

export interface SubscriptionOrderBody extends JusPayCustomer {
  orderType: 'subscriptionPackage';
  amount: number;
  isDineIn?: boolean;
  mealPackage: Record<string, unknown>; // shape from the reference apps' order.service.ts buildSubscriptionOrder
  subscriptionStartDate?: string;
  userSelectedDates?: string[];
  mealTimeLunch?: boolean;
  mealTimeDinner?: boolean;
  moneyWalletPointsUsed?: number;
  mealaweWalletPointsUsed?: number;
  couponCode?: string;
  // ...remaining fields per the FoodOrderPackage DAO whitelist in the spec
}

export interface OnDemandOrderBody extends JusPayCustomer {
  orderType: 'allDay' | 'advance';
  amount: number;
  itemList: Record<string, unknown>[];
  slotStartTime?: string;
  slotEndTime?: string;
  orderComplitionDate?: string;
  customerLocation: Record<string, unknown>;
  moneyWalletPointsUsed?: number;
  mealaweWalletPointsUsed?: number;
  couponCode?: string;
  // ...remaining fields per the plain FoodOrder DAO whitelist in the spec
}

export interface BulkOrderBody extends JusPayCustomer {
  orderType: 'individualMeals' | 'bulkMeals' | 'individualSnacks' | 'bulkSnacks' | 'predefinedSnackbox' | 'customSnackbox';
  amount: number;
  itemList: Record<string, unknown>[];
  deliveryDate?: string;
  slotStartTime?: string;
  slotEndTime?: string;
  moneyWalletPointsUsed?: number;
  mealaweWalletPointsUsed?: number;
  couponCode?: string;
  // ...remaining fields per the bulkFoodOrder DAO whitelist in the spec
}

export type OrderBody = SubscriptionOrderBody | OnDemandOrderBody | BulkOrderBody;

export interface JusPayStartResponse {
  checkoutDetails: { _id: string; orderType: string; amount: number; order_id?: string };
  jusPaySessionObj: Record<string, unknown>;
  jusPayPaymentLink: string;
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors (nothing imports this module yet).

- [ ] **Step 3: Commit**

```bash
git add src/services/payment/orderTypes.ts
git commit -m "feat: add discriminated OrderBody types for the JusPay integration"
```

---

### Task 3: Endpoints + shared payment module

**Files:**
- Modify: `src/services/http/endpoints.ts`
- Create: `src/services/payment/juspay.ts`
- Create: `src/services/payment/index.ts`

- [ ] **Step 1: Add the four endpoints**

```ts
  juspay: {
    startSubscription: '/transaction/startJusPayPaymentProcess',
    startBulk: '/transaction/startBulkJusPayPaymentProcess',
    validate: '/transaction/validateJusPayPaymentTransaction',
  },
```
(Marketplace's `startMarketPlaceJusPayPaymentProcess` intentionally omitted — no RN
marketplace cart exists yet, per the spec's Open Questions.)

- [ ] **Step 2: Write `juspay.ts`**

Wraps `hyper-sdk-react`'s `HyperServices`:
```ts
import { HyperServices } from 'hyper-sdk-react';
import { environments } from '@/config/environments';
import { env } from '@/config/env';
import { ENDPOINTS, http } from '@/services/http';
import type { OrderBody, JusPayStartResponse } from './orderTypes';

let initialized = false;
let pendingResolve: ((result: PaymentResult) => void) | null = null;

export type PaymentResult = { status: 'success' | 'failed' | 'pending' };

export function initJusPay(): void {
  if (initialized) return;
  initialized = true;
  const { clientId, merchantId } = environments[env].juspay;
  HyperServices.createHyperServices();
  HyperServices.setInitialMerchantParams({ clientId, environment: environments[env].production ? 'production' : 'sandbox' });
  HyperServices.initiate({ action: 'initiate', integrationType: 'redirection', clientId, merchantId });
  HyperServices.getEventSubscriber((event: string, payload: unknown) => {
    if (event === 'process_result' && pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve({ status: 'pending' }); // real status comes from the validate call, not this event's payload
    }
  });
}

let inFlight = false;

export async function payWithJusPay(
  endpoint: string,
  orderBody: OrderBody,
): Promise<PaymentResult> {
  if (inFlight) {
    // No backend idempotency guard exists for start* endpoints (confirmed in the
    // design spec) — double-submission from a double-tap must be blocked here.
    return { status: 'pending' };
  }
  inFlight = true;
  try {
    const res = await http.post<JusPayStartResponse>(endpoint, orderBody);
    const isWalletCovered = !res.jusPaySessionObj || Object.keys(res.jusPaySessionObj).length === 0;
    if (isWalletCovered) {
      return { status: 'success' };
    }
    await new Promise<void>((resolve) => {
      pendingResolve = () => resolve(undefined as unknown as PaymentResult);
      HyperServices.process(JSON.stringify(res.jusPaySessionObj));
    });
    const validated = await http.post<{ status: boolean }>(ENDPOINTS.juspay.validate, {
      orderType: orderBody.orderType,
      foodOrderId: res.checkoutDetails._id,
    });
    return { status: validated.status ? 'success' : 'failed' };
  } finally {
    inFlight = false;
  }
}
```

(This is a first-draft sketch, not final — `hyper-sdk-react`'s actual event-subscriber
and `process()` call signatures must be confirmed against its README/types during
implementation, since the API surface wasn't independently verified against installed
type defs as part of this planning pass. Treat the exact `HyperServices` method names
here as **placeholders to verify in Task 0/1**, not confirmed contract.)

- [ ] **Step 3: Barrel export**

```ts
export { initJusPay, payWithJusPay, type PaymentResult } from './juspay';
export type { OrderBody, SubscriptionOrderBody, OnDemandOrderBody, BulkOrderBody } from './orderTypes';
```

- [ ] **Step 4: Call `initJusPay()` once from `src/app/_layout.tsx`**, alongside the
existing `initStores()` call.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors. (Type-checks only — actual SDK behavior needs a device, per
Task 0/1's manual verification.)

- [ ] **Step 6: Commit**

```bash
git add src/services/http/endpoints.ts src/services/payment/ src/app/_layout.tsx
git commit -m "feat: add shared JusPay payment module (init, pay, validate)"
```

---

### Task 4: Wire the Subscription + Dine In cart

**Files:**
- Modify: `src/app/cart.tsx`

- [ ] **Step 1: Build the `SubscriptionOrderBody` from existing cart/bill/location state**

Replace the `Alert.alert(...)` stub with a payload builder (using `useCartStore`,
`useBill`/`bill.ts`, `useLocationStore`, `useAuthStore` profile, `useBalances()`) +
`payWithJusPay(ENDPOINTS.juspay.startSubscription, body)`, then route to the
order-result screen (Task 7) based on the returned status.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Manual verification (no automated equivalent)**

On a device/emulator with the Task 0/1 native build: add a subscription package to
cart, tap Pay, confirm the JusPay payment page opens. This cannot be verified by `tsc`
or `expo export` — call it out explicitly when reporting this task done.

- [ ] **Step 4: Commit**

```bash
git add src/app/cart.tsx
git commit -m "feat: wire real JusPay checkout into the Subscription/Dine In cart"
```

---

### Task 5: Wire the On-Demand cart

**Files:**
- Modify: `src/app/on-demand-cart.tsx`

- [ ] **Step 1: Build `OnDemandOrderBody`, using `cart.mode` directly as `orderType`**

`OnDemandCart.mode` (`'allDay' | 'advance'`) already matches the backend's expected
string exactly — no translation needed, just pass it through.

- [ ] **Step 2: Verify** — `npx tsc --noEmit`, zero errors.

- [ ] **Step 3: Manual device verification**, same caveat as Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/app/on-demand-cart.tsx
git commit -m "feat: wire real JusPay checkout into the On-Demand cart"
```

---

### Task 6: Wire the Bulk cart

**Files:**
- Modify: `src/app/bulk-cart.tsx`

**Blocking pre-step — resolve the foodbox `orderType` open question (see spec) before
writing this task's code**: confirm whether the RN food-box builder should always send
`customSnackbox`, or needs a predefined-vs-custom distinction added to
`BulkCategory`/`BulkPackaging` first. If it needs a new field, that's a small addition
to `src/features/bulk/types.ts` done as part of this task's Step 1, not a separate task.

- [ ] **Step 1: Derive `orderType` from `category` × `packaging`**

```ts
function bulkOrderType(category: BulkCategory, packaging: BulkPackaging): BulkOrderBody['orderType'] {
  if (category === 'foodbox') return 'customSnackbox'; // pending the open-question resolution above
  const bulk = packaging === 'bulk';
  return category === 'meals' ? (bulk ? 'bulkMeals' : 'individualMeals') : (bulk ? 'bulkSnacks' : 'individualSnacks');
}
```

- [ ] **Step 2: Build `BulkOrderBody`** from `useBulkCartStore` + screen-local
date/slot state (confirmed in the spec: date/slot aren't persisted in this store today
— read them from the screen's own `useState`, same as the existing bill-display code
already does).

- [ ] **Step 3: Verify** — `npx tsc --noEmit`, zero errors.

- [ ] **Step 4: Manual device verification**, same caveat as Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/app/bulk-cart.tsx src/features/bulk/types.ts
git commit -m "feat: wire real JusPay checkout into the Bulk cart"
```

---

### Task 7: Order result screens

**Files:**
- Create: `src/app/order-placed.tsx` (or reuse an existing confirmation screen if one
  already exists under a different name — check before creating a duplicate)
- Create: `src/app/order-failed.tsx`

- [ ] **Step 1: Order-placed screen** — success confirmation, clears the relevant cart
store, offers "View order" / "Back to home".

- [ ] **Step 2: Order-failed screen** — shown on `status:'failed'`; offers retry (calls
`payWithJusPay` again — safe per the spec, since a fresh `startJusPay...` call creates
a fresh order/session, it does not reuse the failed one) or back-to-cart.

- [ ] **Step 3: Pending state** — `status:'pending'` (validate call didn't get a
definitive answer, e.g. timeout) should **not** show the failed screen — show a
"we'll confirm shortly" state instead, since the spec confirms the backend has a cron
job reconciling stuck `paymentInprogress` orders; a false "failed" here would be
misleading to the user for an order that later succeeds.

- [ ] **Step 4: Verify** — `npx tsc --noEmit`, zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/order-placed.tsx src/app/order-failed.tsx
git commit -m "feat: add order-placed/order-failed screens for the JusPay checkout result"
```

---

### Task 8: Maestro flow + test catalogue updates

**Files:**
- Modify: `.maestro/README.md`
- Modify: `scripts/generate-test-catalogue.mjs`
- New Maestro flows are **not** authored for the actual payment step — JusPay's native
  UI can't be reliably scripted/asserted against (per this project's existing Maestro
  convention of avoiding dynamic/gateway-owned UI) — flows should stop at "Pay button
  tapped, JusPay page visible" and go no further.

- [ ] **Step 1: Add catalogue rows** for each cart's new Pay behavior (button
enabled/disabled states, wallet-covered instant-success path, failed/pending result
screens) — follow this project's existing row format (see any `PAY-*` or reuse the
per-feature prefix, e.g. `CART-*`/`BULK-*`/`OD-*`).

- [ ] **Step 2: Regenerate the workbook**

```bash
node scripts/generate-test-catalogue.mjs
```

- [ ] **Step 3: Commit**

```bash
git add .maestro/README.md scripts/generate-test-catalogue.mjs docs/TEST-CATALOGUE.xlsx
git commit -m "test: add catalogue rows for the JusPay checkout integration"
```

---

### Task 9: Final build verification

**Files:** none (verification only)

- [ ] **Step 1: Full type check** — `npx tsc --noEmit`, expect zero errors.
- [ ] **Step 2: Full export build** — `npx expo export --platform android -c`, expect
  a clean bundle.
- [ ] **Step 3: Manual end-to-end smoke test on a device for all four carts**
  (Subscription, Dine In, On-Demand ×2 modes, Bulk ×however many category/packaging
  combinations exist) — this is the one place in this plan that cannot be reduced to
  an automated check; budget real device time for it, ideally against staging with a
  real (non-production) JusPay test card/UPI flow.
- [ ] **Step 4: Grep for any remaining stub** —
  ```bash
  grep -rn "Payment (JusPay / Paytm) is the next phase" src/
  ```
  Expected: no matches.

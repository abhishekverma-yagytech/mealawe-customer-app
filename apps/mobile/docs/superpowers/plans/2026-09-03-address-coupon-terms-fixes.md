# Address Auto-Select, Checkout Gate, Coupon Rules, Terms & Conditions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **No commits.** The user explicitly asked that nothing be committed during this work. Every task below ends with a verification step instead of a commit step — leave all changes uncommitted in the working tree when the plan is done.
>
> **Shared working tree.** A separate, unrelated "Subscription Cart Redesign" effort may still be mid-edit on `cart.tsx`, `bill.ts`, `types.ts`, `cartStore.ts` in this same working tree (see the design spec's note). Before editing any shared file in a task below, re-read its current content first — line numbers here were captured at planning time and may have moved. Anchor edits on the surrounding code shown in each step, not on line numbers.

**Goal:** Fix the dead 500m saved-address auto-select trigger, require a saved (not ad-hoc current-location) address before checkout on all four checkout screens, port the Ionic app's coupon business rules (scope/usage/offerAppliedOn/discountOn) into the shared discount calculator plus a new server usage-check call, and replace the WebView Terms & Conditions sheet with a native screen.

**Architecture:** Four independent slices, each touching its own files with only two shared touch points: `src/features/location/types.ts` (new `hasSavedAddress` helper, used by all four checkout screens) and `src/features/cart/bill.ts` (`discountFor`'s new signature, used by all three carts). No slice depends on another finishing first.

**Tech Stack:** React Native + Expo Router, Zustand stores, no unit-test framework in this project — verify every task with `npx tsc --noEmit` (per `docs/TESTING-WORKFLOW.md` / CLAUDE.md convention), not Jest.

---

## Part 1 — Location auto-select fix

### Task 1: Add `reconcileCurrentAddress` to `locationStore`

**Files:**
- Modify: `src/store/locationStore.ts`

- [ ] **Step 1: Add the action to the `LocationState` interface**

In `src/store/locationStore.ts`, find this block (currently around line 18-40):
```ts
interface LocationState {
  /** Active delivery address (null until one is chosen). */
  current: Address | null;
  /** Saved addresses (kept in sync with profile.addressList). */
  saved: Address[];
  /** Whether the current address falls in a serviceable area. */
  isServiceable: boolean;
  /** True while a GPS fix is in flight (drives the location gate UI). */
  gettingLocation: boolean;

  /** Seed from local storage + the logged-in profile. Call once at boot. */
  hydrate: () => void;
  /** Make `addr` the active address: persist locally + sync to backend. */
  setCurrent: (addr: Address) => Promise<void>;
  /** Capture GPS → reverse-geocode → match a saved address → set current. */
  useCurrentLocation: () => Promise<Address | null>;
```
Add a new method right after `useCurrentLocation`'s declaration:
```ts
  /** Capture GPS → reverse-geocode → match a saved address → set current. */
  useCurrentLocation: () => Promise<Address | null>;
  /** Background reconciliation: if `current` isn't already a saved address,
   * re-check GPS against `saved` and silently switch to a match. No-op when
   * `current` is null or already saved — see the design spec's Part 1. */
  reconcileCurrentAddress: () => Promise<void>;
```

- [ ] **Step 2: Implement the action**

Find the `useCurrentLocation` implementation inside `create<LocationState>((set, get) => ({ ... }))` (currently around line 140-167):
```ts
  useCurrentLocation: async () => {
    set({ gettingLocation: true });
    try {
      const point = await getGps();
      if (!point) {
        trackLocateMe(null);
        return null;
      }
      const matched = matchSavedAddress(point, get().saved, 500);
      let addr: Address;
      if (matched) {
        addr = matched;
      } else {
        const geo = await reverseGeocode(point);
        addr = {
          geolocation: point,
          tagLocation: 'other',
          ...geo,
          location: geo.location ?? 'Current location',
        };
      }
      trackLocateMe(addressEventPayload(addr));
      await get().setCurrent(addr);
      return addr;
    } finally {
      set({ gettingLocation: false });
    }
  },
```
Add the new action directly after it, still inside the same `create<LocationState>((set, get) => ({ ... }))` object:
```ts

  reconcileCurrentAddress: async () => {
    const { current, saved } = get();
    if (!current || saved.some((a) => isSameAddress(current, a))) {
      return;
    }
    const point = await getGps();
    if (!point) {
      return;
    }
    const matched = matchSavedAddress(point, get().saved, 500);
    if (matched && !isSameAddress(matched, get().current)) {
      await get().setCurrent(matched);
    }
  },
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no new errors. (`isSameAddress`, `matchSavedAddress`, `getGps` are already imported at the top of this file.)

---

### Task 2: Wire `reconcileCurrentAddress` into `LocationSplash`

**Files:**
- Modify: `src/components/LocationSplash.tsx`

- [ ] **Step 1: Fire the reconciliation in the `hasAddress` branch**

Find this block (currently around line 103-119):
```ts
  useEffect(() => {
    let cancelled = false;

    if (hasAddress) {
      // Nothing to fetch — hold the branded beat for its own fixed minimum
      // duration so this screen actually gets a visible frame, instead of
      // racing an async fetch that has no `await` to yield on (which used to
      // resolve on the same tick as mount and clear this timeout before it
      // could ever fire, so returning users never actually saw this screen).
      const timeoutId = setTimeout(() => {
        if (!cancelled) onDone();
      }, MIN_DISPLAY_MS_WITH_ADDRESS);
      return () => {
        cancelled = true;
        clearTimeout(timeoutId);
      };
    }
```
Replace it with:
```ts
  useEffect(() => {
    let cancelled = false;

    if (hasAddress) {
      // Fire-and-forget: if `current` isn't already a saved address, check
      // GPS against the saved list in the background and silently switch if
      // a match turns up within 500m. Never awaited here — it must not delay
      // this branch's fixed branded-beat timer below (see
      // locationStore.reconcileCurrentAddress's own comment for why it only
      // acts on an unsaved current address).
      void useLocationStore.getState().reconcileCurrentAddress();
      // Nothing to fetch — hold the branded beat for its own fixed minimum
      // duration so this screen actually gets a visible frame, instead of
      // racing an async fetch that has no `await` to yield on (which used to
      // resolve on the same tick as mount and clear this timeout before it
      // could ever fire, so returning users never actually saw this screen).
      const timeoutId = setTimeout(() => {
        if (!cancelled) onDone();
      }, MIN_DISPLAY_MS_WITH_ADDRESS);
      return () => {
        cancelled = true;
        clearTimeout(timeoutId);
      };
    }
```
(`useLocationStore` is already imported at the top of this file: `import { useLocationStore } from '@/store';`.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run: `npx expo export --platform android -c`
Expected: export succeeds (bundling sanity check — this project has no unit tests, see CLAUDE.md).

---

## Part 2 — Checkout "must be a saved address" gate

### Task 3: Add the `hasSavedAddress` helper

**Files:**
- Modify: `src/features/location/types.ts`
- Modify: `src/features/location/index.ts`

- [ ] **Step 1: Add the helper next to `isSameAddress`**

In `src/features/location/types.ts`, find:
```ts
export function isSameAddress(a: Address | null, b: Address | null): boolean {
  if (!a || !b) return false;
  if (a._id && b._id) return a._id === b._id;
  return a.geolocation?.lat === b.geolocation?.lat && a.geolocation?.lng === b.geolocation?.lng;
}
```
Add directly after it:
```ts

/** Is `current` one of the user's saved addresses — not an ad-hoc, unsaved
 * GPS-only "current location"? The gate every checkout screen uses before
 * allowing an order to proceed (see the design spec's Part 2). */
export function hasSavedAddress(current: Address | null, saved: Address[]): boolean {
  return current != null && saved.some((a) => isSameAddress(current, a));
}
```

- [ ] **Step 2: Export it from the barrel**

In `src/features/location/index.ts`, find:
```ts
export { addressLabel, isSameAddress } from './types';
```
Replace with:
```ts
export { addressLabel, isSameAddress, hasSavedAddress } from './types';
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no new errors.

---

### Task 4: Checkout gate on `subscription-configure.tsx`

**Files:**
- Modify: `src/app/subscription-configure.tsx`

- [ ] **Step 1: Import `useRef`, `hasSavedAddress`, and pull `saved` addresses**

Find the React import (currently line 3):
```ts
import { useEffect, useMemo, useState } from 'react';
```
Replace with:
```ts
import { useEffect, useMemo, useRef, useState } from 'react';
```

Find the location import (currently line 11):
```ts
import { DeliverToSection, type Address } from '@/features/location';
```
Replace with:
```ts
import { DeliverToSection, hasSavedAddress, type Address } from '@/features/location';
```

Find (currently line 43-44):
```ts
  const currentAddress = useLocationStore((s) => s.current);
  const savedAddresses = useLocationStore((s) => s.saved);
```
This already pulls both `current` and `saved` — no change needed here.

- [ ] **Step 2: Add scroll ref, layout-Y ref, and error state**

Find (currently line 34-38):
```ts
export default function SubscriptionConfigureScreen() {
  useScreenTracking('subscription_configure');

  const router = useRouter();
  const insets = useSafeAreaInsets();
```
Replace with:
```ts
export default function SubscriptionConfigureScreen() {
  useScreenTracking('subscription_configure');

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const deliverToY = useRef(0);
  const [addressError, setAddressError] = useState<string | null>(null);
```

- [ ] **Step 3: Gate `save()` on a saved address**

Find (currently line 201-223):
```ts
  const save = (): void => {
    if (!canSave) return;
    const config: SubscriptionConfig = {
```
Replace with:
```ts
  const save = (): void => {
    if (!canSave) return;
    if (!hasSavedAddress(currentAddress, savedAddresses)) {
      setAddressError('Please choose a saved delivery address to continue.');
      scrollRef.current?.scrollTo({ y: Math.max(0, deliverToY.current - 20), animated: true });
      return;
    }
    setAddressError(null);
    const config: SubscriptionConfig = {
```

- [ ] **Step 4: Wire the scroll ref and error message onto the DELIVER TO section**

Find (currently line 230):
```ts
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
```
Replace with:
```ts
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
```

Find (currently line 462-474):
```tsx
        <View style={{ marginTop: 30 }}>
          <AppText variant="overline" className="text-muted-foreground" style={{ marginBottom: 10 }}>
            DELIVER TO
          </AppText>
          <DeliverToSection
            saved={savedAddresses}
            current={currentAddress}
            onSelect={selectDeliveryAddress}
            onEdit={(index) => router.push({ pathname: '/address-form', params: { index: String(index) } })}
            onDelete={deleteAddress}
            onAddNew={() => router.push('/address-form')}
          />
        </View>
```
Replace with:
```tsx
        <View
          onLayout={(e) => {
            deliverToY.current = e.nativeEvent.layout.y;
          }}
          style={{ marginTop: 30 }}>
          <AppText variant="overline" className="text-muted-foreground" style={{ marginBottom: 10 }}>
            DELIVER TO
          </AppText>
          {addressError ? (
            <AppText variant="bodySm" className="text-danger" style={{ marginBottom: 10 }}>
              {addressError}
            </AppText>
          ) : null}
          <DeliverToSection
            saved={savedAddresses}
            current={currentAddress}
            onSelect={selectDeliveryAddress}
            onEdit={(index) => router.push({ pathname: '/address-form', params: { index: String(index) } })}
            onDelete={deleteAddress}
            onAddNew={() => router.push('/address-form')}
          />
        </View>
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: no new errors.

---

### Task 5: Checkout gate on `cart.tsx`

**Files:**
- Modify: `src/app/cart.tsx`

- [ ] **Step 1: Import `hasSavedAddress` and pull `saved` addresses**

Find:
```ts
import { addressLabel } from '@/features/location';
```
Replace with:
```ts
import { addressLabel, hasSavedAddress } from '@/features/location';
```

Find:
```ts
  const address = useLocationStore((s) => s.current);
```
Replace with:
```ts
  const address = useLocationStore((s) => s.current);
  const savedAddresses = useLocationStore((s) => s.saved);
```

- [ ] **Step 2: Add scroll ref, layout-Y ref, and error state**

Find (near the other `useRef` declarations, currently around line 103-107):
```ts
  const couponSheetRef = useRef<BottomSheetModal>(null);
  const dateSheetRef = useRef<BottomSheetModal>(null);
  const billSheetRef = useRef<BottomSheetModal>(null);
  const gstSheetRef = useRef<BottomSheetModal>(null);
  const celebratedCodeRef = useRef<string | null>(null);
```
Add directly after:
```ts
  const scrollRef = useRef<ScrollView>(null);
  const addressCardY = useRef(0);
  const [addressError, setAddressError] = useState<string | null>(null);
```

- [ ] **Step 3: Gate `pay()` on a saved address (skip for Dine In, per the existing "no delivery" behavior)**

Find (currently around line 309-311):
```ts
  const pay = async (): Promise<void> => {
    if (!requireLogin(router) || !profile) return;
    setPaying(true);
```
Replace with:
```ts
  const pay = async (): Promise<void> => {
    if (!requireLogin(router) || !profile) return;
    // Dine In still has no delivery — `customerLocation` is sent for the
    // order record (see this function's own comment on that field below),
    // but there's no on-screen address section here for Dine In to fix if
    // it's missing (the DELIVERY DETAILS card shows "Eat at the kitchen"
    // instead, see the render below), so this gate only applies to real
    // delivery orders.
    if (!item.isDineIn && !hasSavedAddress(address, savedAddresses)) {
      setAddressError('Please choose a saved delivery address to continue.');
      scrollRef.current?.scrollTo({ y: Math.max(0, addressCardY.current - 20), animated: true });
      return;
    }
    setAddressError(null);
    setPaying(true);
```

- [ ] **Step 4: Wire the scroll ref and error message onto the DELIVERY DETAILS card**

Find:
```ts
      <ScrollView
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.lg }}>
```
Replace with:
```ts
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.lg }}>
```

Find:
```tsx
        {/* delivery details */}
        <View className="rounded-2xl border border-border bg-card p-4" style={[shadow.card, { gap: 12 }]}>
          <AppText variant="overline" className="text-muted-foreground">
            DELIVERY DETAILS
          </AppText>
          <DetailRow
            icon={IconCalendar}
            tone="plan"
            label="Schedule"
            compact
            onPress={() => dateSheetRef.current?.present()}>
            {start ? `Starts ${formatShort(start)} · ${item.selectedDates.length} days` : 'Dates not set'}
          </DetailRow>
          <DetailRow icon={IconClock} tone="info" label="Meal">
            {meal || 'Not selected'}
          </DetailRow>
          {!item.isDineIn ? (
            <DetailRow icon={IconMapPin} tone="location" label="Address">
              {addressLabel(address)}
            </DetailRow>
          ) : (
            <DetailRow icon={IconMapPin} tone="location" label="Dine-in">
              Eat at the kitchen
            </DetailRow>
          )}
        </View>
```
Replace with:
```tsx
        {/* delivery details */}
        <View
          onLayout={(e) => {
            addressCardY.current = e.nativeEvent.layout.y;
          }}
          className="rounded-2xl border border-border bg-card p-4"
          style={[shadow.card, { gap: 12 }]}>
          <AppText variant="overline" className="text-muted-foreground">
            DELIVERY DETAILS
          </AppText>
          <DetailRow
            icon={IconCalendar}
            tone="plan"
            label="Schedule"
            compact
            onPress={() => dateSheetRef.current?.present()}>
            {start ? `Starts ${formatShort(start)} · ${item.selectedDates.length} days` : 'Dates not set'}
          </DetailRow>
          <DetailRow icon={IconClock} tone="info" label="Meal">
            {meal || 'Not selected'}
          </DetailRow>
          {!item.isDineIn ? (
            <DetailRow icon={IconMapPin} tone="location" label="Address" onPress={() => router.push('/addresses')}>
              {addressLabel(address)}
            </DetailRow>
          ) : (
            <DetailRow icon={IconMapPin} tone="location" label="Dine-in">
              Eat at the kitchen
            </DetailRow>
          )}
          {addressError ? (
            <AppText variant="bodySm" className="text-danger">
              {addressError}
            </AppText>
          ) : null}
        </View>
```
(This also gives the Address row the same tappable "Change" affordance Schedule already has — per the design spec's Part 2, it was read-only before. `router` is already in scope in this component.)

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: no new errors.

---

### Task 6: Checkout gate on `on-demand-cart.tsx`

**Files:**
- Modify: `src/app/on-demand-cart.tsx`

- [ ] **Step 1: Import `Alert` and `hasSavedAddress`, pull `saved` addresses**

Find:
```ts
import { Pressable, ScrollView, TextInput, View } from 'react-native';
```
Replace with:
```ts
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
```

Find:
```ts
import { CouponSheet, SavingsBanner, CouponCelebration, discountFor } from '@/features/cart';
import { clusterApi } from '@/features/location/clusterApi';
```
Replace with:
```ts
import { CouponSheet, SavingsBanner, CouponCelebration, discountFor } from '@/features/cart';
import { clusterApi } from '@/features/location/clusterApi';
import { hasSavedAddress } from '@/features/location';
```

Find:
```ts
  const address = useLocationStore((s) => s.current);
```
Replace with:
```ts
  const address = useLocationStore((s) => s.current);
  const savedAddresses = useLocationStore((s) => s.saved);
```

- [ ] **Step 2: Gate `pay()` and route to `/addresses` on failure**

There is no address section on this screen to scroll to (confirmed by reading the file — no `DetailRow`/`AddressCard`/address JSX anywhere in its render), so the recovery action is a direct navigation instead of a scroll.

Find (currently line 248-249):
```ts
  const pay = async (): Promise<void> => {
    if (!requireLogin(router) || !profile || !address || !cart.mode) return;
    setPaying(true);
```
Replace with:
```ts
  const pay = async (): Promise<void> => {
    if (!requireLogin(router) || !profile || !cart.mode) return;
    if (!hasSavedAddress(address, savedAddresses)) {
      Alert.alert(
        'Select a saved address',
        "Please choose one of your saved addresses to continue — we can't deliver to an unsaved current location.",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Choose address', onPress: () => router.push('/addresses') },
        ],
      );
      return;
    }
    setPaying(true);
```
(`!address` no longer needs its own check — `hasSavedAddress` already returns `false` when `address` is `null`.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no new errors.

---

### Task 7: Checkout gate on `bulk-cart.tsx`

**Files:**
- Modify: `src/app/bulk-cart.tsx`

- [ ] **Step 1: Import `Alert` and `hasSavedAddress`, pull `saved` addresses**

Find:
```ts
import { Pressable, ScrollView, View } from 'react-native';
```
Replace with:
```ts
import { Alert, Pressable, ScrollView, View } from 'react-native';
```

Find:
```ts
import { CouponSheet, SavingsBanner, CouponCelebration, discountFor } from '@/features/cart';
import { clusterApi } from '@/features/location/clusterApi';
```
Replace with:
```ts
import { CouponSheet, SavingsBanner, CouponCelebration, discountFor } from '@/features/cart';
import { clusterApi } from '@/features/location/clusterApi';
import { hasSavedAddress } from '@/features/location';
```

Find:
```ts
  const address = useLocationStore((s) => s.current);
```
Replace with:
```ts
  const address = useLocationStore((s) => s.current);
  const savedAddresses = useLocationStore((s) => s.saved);
```

- [ ] **Step 2: Gate `pay()` and route to `/addresses` on failure**

Same reasoning as Task 6 — no address section rendered on this screen either.

Find (currently line 221-222):
```ts
  const pay = async (): Promise<void> => {
    if (!requireLogin(router) || !profile || !address || !cart.category || !cart.packaging) return;
    setPaying(true);
```
Replace with:
```ts
  const pay = async (): Promise<void> => {
    if (!requireLogin(router) || !profile || !cart.category || !cart.packaging) return;
    if (!hasSavedAddress(address, savedAddresses)) {
      Alert.alert(
        'Select a saved address',
        "Please choose one of your saved addresses to continue — we can't deliver to an unsaved current location.",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Choose address', onPress: () => router.push('/addresses') },
        ],
      );
      return;
    }
    setPaying(true);
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no new errors.

---

## Part 3 — Coupon business rules

### Task 8: Extend `SubscriptionCoupon` and `AppliedCoupon` types

**Files:**
- Modify: `src/features/subscription/types.ts`
- Modify: `src/features/cart/types.ts`

- [ ] **Step 1: Add the new coupon fields**

In `src/features/subscription/types.ts`, find:
```ts
/** A coupon valid for the user's cluster(s). */
export interface SubscriptionCoupon {
  couponCode?: string;
  couponHeader?: string;
  description?: string;
  orderTypes?: string[];
  seqWeightage?: number;
  discountType?: 'percentage' | 'flat';
  discountValue?: number;
  maxLimit?: number;
  minAmount?: number;
  /** "Free item/order" coupons (e.g. `FREEFOOD`) — the discount is the whole
   * eligible amount (capped by `maxLimit` if set), ignoring `discountType`/
   * `discountValue` entirely. Confirmed live: real active coupons in this
   * deployment use this flag. */
  applyFullDiscount?: boolean;
  [key: string]: unknown;
}
```
Replace with:
```ts
/** A coupon valid for the user's cluster(s). */
export interface SubscriptionCoupon {
  couponCode?: string;
  couponHeader?: string;
  description?: string;
  orderTypes?: string[];
  seqWeightage?: number;
  discountType?: 'percentage' | 'flat';
  discountValue?: number;
  maxLimit?: number;
  minAmount?: number;
  /** "Free item/order" coupons (e.g. `FREEFOOD`) — the discount is the whole
   * eligible amount (capped by `maxLimit` if set), ignoring `discountType`/
   * `discountValue` entirely. Confirmed live: real active coupons in this
   * deployment use this flag. */
  applyFullDiscount?: boolean;
  /** `generic` = usable by anyone; `userSpecific` = only usable by users
   * whose profile lists this code (`customerProfile.couponList`). Already
   * enforced server-side in the coupon-list endpoints — the client doesn't
   * re-filter by it, just carries the field through. */
  couponScope?: 'generic' | 'userSpecific';
  /** Usage-limit policy, enforced server-side by `validateCouponForUser`
   * (see `couponApi.ts`) — `oneTimeOneUser` (once ever), `oneTimeOneDay`
   * (once per day), or `everytime` (no limit). */
  couponUsage?: 'oneTimeOneUser' | 'oneTimeOneDay' | 'everytime';
  /** Whether the `minAmount` gate and the discount base amount is the whole
   * bill (item + delivery + taxes) or just the item/plan amount. Defaults to
   * item-amount behavior (today's behavior) when unset. */
  offerAppliedOn?: 'billAmount' | 'itemAmount';
  /** When true, the computed discount is taken out of the delivery charge
   * first (up to the delivery charge amount), before any remainder goes to
   * items. */
  discountOnDelivery?: boolean;
  /** When true (and `discountOnDelivery` didn't consume the whole discount),
   * the remainder is applied to the item/plan amount. A coupon with neither
   * flag set defaults to items-only (today's behavior), for coupons that
   * don't specify either. */
  discountOnItems?: boolean;
  [key: string]: unknown;
}
```

- [ ] **Step 2: Split `AppliedCoupon.discount` into item/delivery components**

In `src/features/cart/types.ts`, find:
```ts
/** A coupon applied to the cart. */
export interface AppliedCoupon {
  couponCode: string;
  discount: number;
  couponHeader?: string;
}
```
Replace with:
```ts
/** A coupon applied to the cart. `discount` is the total (itemDiscount +
 * deliveryDiscount) for display; `itemDiscount`/`deliveryDiscount` are the
 * split each bill builder needs to apply them to the right line (item
 * discounts reduce the item-GST base, delivery discounts are a straight
 * deduction against the delivery charge — see bill.ts's discountFor). */
export interface AppliedCoupon {
  couponCode: string;
  discount: number;
  itemDiscount: number;
  deliveryDiscount: number;
  couponHeader?: string;
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: new errors at every place that constructs an `AppliedCoupon` without `itemDiscount`/`deliveryDiscount` — these are fixed in Tasks 14-16 below. Confirm the errors are exactly those call sites (in `cart.tsx`, `on-demand-cart.tsx`, `bulk-cart.tsx`) and nowhere else.

---

### Task 9: Add the `validateCouponForUser` endpoint + client wrapper

**Files:**
- Modify: `src/services/http/endpoints.ts`
- Create: `src/features/cart/couponApi.ts`
- Modify: `src/features/cart/index.ts`

- [ ] **Step 1: Add the endpoint constant**

In `src/services/http/endpoints.ts`, find:
```ts
    /** POST /api/getValidClusterUserCouponList/:customerId — body { clusters: string[] } → coupons. */
    validCoupons: '/api/getValidClusterUserCouponList',
```
Replace with:
```ts
    /** POST /api/getValidClusterUserCouponList/:customerId — body { clusters: string[] } → coupons. */
    validCoupons: '/api/getValidClusterUserCouponList',
    /** GET /api/validateCouponForUser/:couponCode/:userId/:clientDate →
     * { status: 'VALID_OFFER' | 'INVALID' | 'ERROR', msg?: string } — the
     * only place couponUsage (oneTimeOneUser/oneTimeOneDay) limits are
     * actually enforced. `clientDate` only needs to be present/truthy (an
     * ISO string works); the server computes its own "today" boundary. */
    validateCouponForUser: '/api/validateCouponForUser',
```

- [ ] **Step 2: Create the shared client wrapper**

Create `src/features/cart/couponApi.ts`:
```ts
import { ENDPOINTS, http } from '@/services/http';

export interface CouponValidation {
  valid: boolean;
  message?: string;
}

/**
 * Server-side coupon usage check — the only place `couponUsage`
 * (oneTimeOneUser/oneTimeOneDay/everytime) limits are enforced. Call this
 * right before actually applying a coupon (after the local minAmount/base
 * check already passed), across all three carts. Ported from the Ionic
 * reference's `payment-gateway.service.ts#validateCouponForUser` — ANY
 * non-'VALID_OFFER' status (including a request failure) is treated as
 * "don't apply" rather than silently letting the coupon through.
 */
export async function validateCouponForUser(
  couponCode: string,
  userId: string | null | undefined,
): Promise<CouponValidation> {
  try {
    const res = await http.get<{ status: string; msg?: string }>(
      `${ENDPOINTS.subscription.validateCouponForUser}/${encodeURIComponent(couponCode)}/${userId ?? 'null'}/${encodeURIComponent(new Date().toISOString())}`,
    );
    if (res?.status === 'VALID_OFFER') {
      return { valid: true };
    }
    return { valid: false, message: res?.msg ?? 'This coupon can no longer be used.' };
  } catch {
    return { valid: false, message: 'Could not verify this coupon right now — try again.' };
  }
}
```

- [ ] **Step 3: Export it from the barrel**

In `src/features/cart/index.ts`, find:
```ts
export {
  DEFAULT_CHARGES,
  chargesFromConfig,
  discountFor,
  buildBill,
  emptyBill,
} from './bill';
```
Replace with:
```ts
export {
  DEFAULT_CHARGES,
  chargesFromConfig,
  discountFor,
  buildBill,
  emptyBill,
} from './bill';
export { validateCouponForUser, type CouponValidation } from './couponApi';
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no new errors from this task's own files.

---

### Task 10: Extend `discountFor` with `offerAppliedOn` + delivery/item split, update `buildBill`

**Files:**
- Modify: `src/features/cart/bill.ts`

- [ ] **Step 1: Change `discountFor`'s signature and logic**

Find:
```ts
/**
 * Resolve a coupon's discount against a subtotal (flat / percentage /
 * full-order, capped). Ported to match the Ionic reference's
 * `tabCart.page.ts` exactly: percentage discounts floor (not round —
 * a ₹1 mismatch either way was possible before), and `applyFullDiscount`
 * coupons (confirmed live in this deployment, e.g. `FREEFOOD`) discount the
 * whole eligible amount rather than computing from `discountType`/
 * `discountValue` at all.
 */
export function discountFor(
  coupon: SubscriptionCoupon,
  subTotal: number,
): { discount: number; reason?: string } {
  const min = coupon.minAmount || 0;
  if (subTotal < min) {
    return { discount: 0, reason: `Add ${formatINR(min - subTotal)} more to use this coupon` };
  }
  if (coupon.applyFullDiscount) {
    const capped = coupon.maxLimit ? Math.min(subTotal, coupon.maxLimit) : subTotal;
    return { discount: Math.round(capped) };
  }
  const value = coupon.discountValue || 0;
  if (coupon.discountType === 'flat') {
    return { discount: Math.min(value, subTotal) };
  }
  const raw = Math.floor((subTotal * value) / 100);
  const capped = coupon.maxLimit ? Math.min(raw, coupon.maxLimit) : raw;
  return { discount: capped };
}
```
Replace with:
```ts
/** The amounts `discountFor` needs to evaluate a coupon: the item/plan
 * subtotal (always the base for `offerAppliedOn: 'itemAmount'`, the default),
 * plus delivery charge and taxes (added to the base for `'billAmount'`, and
 * `deliveryCharge` also caps how much of the discount can land on delivery). */
export interface DiscountContext {
  itemSubTotal: number;
  deliveryCharge: number;
  taxes: number;
}

/**
 * Resolve a coupon's discount against a bill context (flat / percentage /
 * full-order, capped), split across item vs. delivery per the coupon's
 * `discountOnDelivery`/`discountOnItems` flags. Ported to match the Ionic
 * reference's `tabCart.page.ts#validateAndApplyCoupon` exactly:
 * - `offerAppliedOn: 'billAmount'` widens the base (and the `minAmount` gate)
 *   to item + delivery + taxes instead of just the item amount.
 * - percentage discounts floor (not round — a ₹1 mismatch either way was
 *   possible before); `applyFullDiscount` coupons (confirmed live in this
 *   deployment, e.g. `FREEFOOD`) discount the whole eligible amount instead
 *   of computing from `discountType`/`discountValue` at all.
 * - the split takes delivery first (capped at `deliveryCharge`), then any
 *   remainder goes to items. A coupon with neither flag set defaults to
 *   items-only — today's (pre-this-change) behavior, unchanged for coupons
 *   that don't specify either flag.
 */
export function discountFor(
  coupon: SubscriptionCoupon,
  ctx: DiscountContext,
): { itemDiscount: number; deliveryDiscount: number; reason?: string } {
  const base =
    coupon.offerAppliedOn === 'billAmount'
      ? ctx.itemSubTotal + ctx.deliveryCharge + ctx.taxes
      : ctx.itemSubTotal;
  const min = coupon.minAmount || 0;
  if (base < min) {
    return {
      itemDiscount: 0,
      deliveryDiscount: 0,
      reason: `Add ${formatINR(min - base)} more to use this coupon`,
    };
  }
  let raw: number;
  if (coupon.applyFullDiscount) {
    const capped = coupon.maxLimit ? Math.min(base, coupon.maxLimit) : base;
    raw = Math.round(capped);
  } else {
    const value = coupon.discountValue || 0;
    if (coupon.discountType === 'flat') {
      raw = Math.min(value, base);
    } else {
      const pct = Math.floor((base * value) / 100);
      raw = coupon.maxLimit ? Math.min(pct, coupon.maxLimit) : pct;
    }
  }
  if (!coupon.discountOnDelivery && !coupon.discountOnItems) {
    return { itemDiscount: raw, deliveryDiscount: 0 };
  }
  let remaining = raw;
  let deliveryDiscount = 0;
  if (coupon.discountOnDelivery) {
    deliveryDiscount = Math.min(remaining, ctx.deliveryCharge);
    remaining -= deliveryDiscount;
  }
  const itemDiscount = coupon.discountOnItems ? remaining : 0;
  return { itemDiscount, deliveryDiscount };
}
```

- [ ] **Step 2: Update `buildBill` to apply the item/delivery split**

Find:
```ts
export function buildBill(
  cart: Cart,
  charges: BillCharges = DEFAULT_CHARGES,
  cashbackUsed = 0,
  moneyWalletUsed = 0,
): Bill {
  const item = cart.item;
  if (!item) {
    return emptyBill();
  }
  const pkg = item.package;
  const count = item.count || 1;
  const days = pkg.days || item.selectedDates.length || 1;
  const mealsPerDay = item.lunch && item.dinner ? 2 : 1;
  const meals = days * mealsPerDay;

  const packageTotal = (pkg.packagePrice || 0) * count * mealsPerDay;
  const addOnTotal = item.addOns.reduce((sum, a) => {
    const price = a.extraPrice ?? a.addonPrice ?? 0;
    const unitDays = a.daily === false && a.dayCount ? a.dayCount : days;
    return sum + price * count * mealsPerDay * unitDays;
  }, 0);
  const itemDiscount = (pkg.discount || 0) * count * mealsPerDay;
  const couponDiscount = cart.coupon?.discount || 0;
  const discount = itemDiscount + couponDiscount;

  // Dine-in is eaten at the kitchen → no delivery/packaging/platform charges.
  const scale = item.isDineIn ? 0 : mealsPerDay * days * count;
  const deliveryOriginal = round2(charges.deliveryPerMeal * scale);
  const deliveryDisc = round2(charges.deliveryPerMealDiscount * scale);
  const packagingOriginal = round2(charges.packagingPerMeal * scale);
  const packagingDisc = round2(charges.packagingPerMealDiscount * scale);
  const platformOriginal = round2(charges.platformPerMeal * scale);
  const platformDisc = round2(charges.platformPerMealDiscount * scale);

  const delivery = round2(deliveryOriginal - deliveryDisc);
  const packaging = round2(packagingOriginal - packagingDisc);
  const platform = round2(platformOriginal - platformDisc);

  const itemGst = round2(((packageTotal + addOnTotal - discount) * charges.itemGstPercent) / 100);
  const deliveryGst = round2((delivery * charges.deliveryGstPercent) / 100);
  const packagingGst = round2((packaging * charges.packagingGstPercent) / 100);
  const platformGst = round2((platform * charges.platformGstPercent) / 100);
  const taxes = round2(itemGst + deliveryGst + packagingGst + platformGst);

  const subTotal = round2(packageTotal + addOnTotal);
  const grossToPay = round2(subTotal - discount + delivery + packaging + platform + taxes);
  const cashback = round2(Math.max(0, Math.min(cashbackUsed, grossToPay)));
  const afterCashback = round2(grossToPay - cashback);
  const moneyWallet = round2(Math.max(0, Math.min(moneyWalletUsed, afterCashback)));
  const toPay = round2(afterCashback - moneyWallet);
  const saving = round2(discount + deliveryDisc + packagingDisc + platformDisc + cashback + moneyWallet);
```
Replace with:
```ts
export function buildBill(
  cart: Cart,
  charges: BillCharges = DEFAULT_CHARGES,
  cashbackUsed = 0,
  moneyWalletUsed = 0,
): Bill {
  const item = cart.item;
  if (!item) {
    return emptyBill();
  }
  const pkg = item.package;
  const count = item.count || 1;
  const days = pkg.days || item.selectedDates.length || 1;
  const mealsPerDay = item.lunch && item.dinner ? 2 : 1;
  const meals = days * mealsPerDay;

  const packageTotal = (pkg.packagePrice || 0) * count * mealsPerDay;
  const addOnTotal = item.addOns.reduce((sum, a) => {
    const price = a.extraPrice ?? a.addonPrice ?? 0;
    const unitDays = a.daily === false && a.dayCount ? a.dayCount : days;
    return sum + price * count * mealsPerDay * unitDays;
  }, 0);
  const itemDiscount = (pkg.discount || 0) * count * mealsPerDay;
  const couponItemDiscount = cart.coupon?.itemDiscount || 0;
  const couponDeliveryDiscount = cart.coupon?.deliveryDiscount || 0;
  const discount = itemDiscount + couponItemDiscount;

  // Dine-in is eaten at the kitchen → no delivery/packaging/platform charges.
  const scale = item.isDineIn ? 0 : mealsPerDay * days * count;
  const deliveryOriginal = round2(charges.deliveryPerMeal * scale);
  const deliveryDisc = round2(charges.deliveryPerMealDiscount * scale);
  const packagingOriginal = round2(charges.packagingPerMeal * scale);
  const packagingDisc = round2(charges.packagingPerMealDiscount * scale);
  const platformOriginal = round2(charges.platformPerMeal * scale);
  const platformDisc = round2(charges.platformPerMealDiscount * scale);

  const delivery = round2(deliveryOriginal - deliveryDisc);
  const packaging = round2(packagingOriginal - packagingDisc);
  const platform = round2(platformOriginal - platformDisc);

  // A coupon's delivery-side discount is deliberately NOT subtracted from
  // `delivery` before this GST calc — it's a straight deduction against the
  // payable total below instead, matching the Ionic reference exactly (see
  // discountFor's own comment and this file's design spec).
  const itemGst = round2(((packageTotal + addOnTotal - discount) * charges.itemGstPercent) / 100);
  const deliveryGst = round2((delivery * charges.deliveryGstPercent) / 100);
  const packagingGst = round2((packaging * charges.packagingGstPercent) / 100);
  const platformGst = round2((platform * charges.platformGstPercent) / 100);
  const taxes = round2(itemGst + deliveryGst + packagingGst + platformGst);

  const subTotal = round2(packageTotal + addOnTotal);
  const grossToPay = round2(
    subTotal - discount + delivery + packaging + platform + taxes - couponDeliveryDiscount,
  );
  const cashback = round2(Math.max(0, Math.min(cashbackUsed, grossToPay)));
  const afterCashback = round2(grossToPay - cashback);
  const moneyWallet = round2(Math.max(0, Math.min(moneyWalletUsed, afterCashback)));
  const toPay = round2(afterCashback - moneyWallet);
  const saving = round2(
    discount + couponDeliveryDiscount + deliveryDisc + packagingDisc + platformDisc + cashback + moneyWallet,
  );
```
(The `return { meals, packageTotal, ... }` object below this block is unchanged — it already reads `discount`, `taxes`, `toPay`, `saving` by name, which are still defined the same way.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: errors now surface at `discountFor`'s call sites in `CouponSheet.tsx`, `cart.tsx`, `on-demand-cart.tsx`, `bulk-cart.tsx` (old `subTotal: number` argument, old `{discount}` destructuring) — fixed in Tasks 13-16. Confirm no other unrelated errors appear.

---

### Task 11: Update the on-demand bill builder for the item/delivery split

**Files:**
- Modify: `src/features/on-demand/bill.ts`

- [ ] **Step 1: Change `buildOnDemandBill`'s coupon parameter and math**

Find:
```ts
export function buildOnDemandBill(
  lines: OnDemandCartLine[],
  kitchenDiscount: number,
  charges: OnDemandBillCharges = DEFAULT_ONDEMAND_CHARGES,
  couponDiscount = 0,
  cashbackUsed = 0,
  moneyWalletUsed = 0,
): OnDemandBill {
  const subTotal = round2(lines.reduce((sum, l) => sum + l.item.itemPrice * l.count, 0));

  if (lines.length === 0) {
    return emptyOnDemandBill();
  }

  const delivery = round2(charges.deliveryCharge - charges.deliveryChargeDiscount);
  const packaging = round2(charges.packagingCharge - charges.packagingChargeDiscount);
  const platform = round2(charges.platformCharge - charges.platformChargeDiscount);

  const totalDiscount = round2(kitchenDiscount + couponDiscount);
  const itemGst = round2(((subTotal - totalDiscount) * charges.itemGstPercent) / 100);
  const deliveryGst = round2((delivery * charges.deliveryGstPercent) / 100);
  const packagingGst = round2((packaging * charges.packagingGstPercent) / 100);
  const platformGst = round2((platform * charges.platformGstPercent) / 100);
  const taxes = round2(itemGst + deliveryGst + packagingGst + platformGst);

  const grossToPay = round2(subTotal - totalDiscount + delivery + packaging + platform + taxes);
  const cashback = round2(Math.max(0, Math.min(cashbackUsed, grossToPay)));
  const afterCashback = round2(grossToPay - cashback);
  const moneyWallet = round2(Math.max(0, Math.min(moneyWalletUsed, afterCashback)));
  const toPay = round2(afterCashback - moneyWallet);
  const saving = round2(totalDiscount + cashback + moneyWallet);

  return {
    subTotal,
    kitchenDiscount,
    delivery,
    packaging,
    platform,
    taxes,
    discount: couponDiscount,
    cashbackUsed: cashback,
    moneyWalletUsed: moneyWallet,
    toPay,
    saving,
  };
}
```
Replace with:
```ts
export function buildOnDemandBill(
  lines: OnDemandCartLine[],
  kitchenDiscount: number,
  charges: OnDemandBillCharges = DEFAULT_ONDEMAND_CHARGES,
  couponItemDiscount = 0,
  couponDeliveryDiscount = 0,
  cashbackUsed = 0,
  moneyWalletUsed = 0,
): OnDemandBill {
  const subTotal = round2(lines.reduce((sum, l) => sum + l.item.itemPrice * l.count, 0));

  if (lines.length === 0) {
    return emptyOnDemandBill();
  }

  const delivery = round2(charges.deliveryCharge - charges.deliveryChargeDiscount);
  const packaging = round2(charges.packagingCharge - charges.packagingChargeDiscount);
  const platform = round2(charges.platformCharge - charges.platformChargeDiscount);

  const totalDiscount = round2(kitchenDiscount + couponItemDiscount);
  // A coupon's delivery-side discount is NOT subtracted from `delivery`
  // before this GST calc — see cart/bill.ts's buildBill for the same rule
  // and its rationale (matches the Ionic reference).
  const itemGst = round2(((subTotal - totalDiscount) * charges.itemGstPercent) / 100);
  const deliveryGst = round2((delivery * charges.deliveryGstPercent) / 100);
  const packagingGst = round2((packaging * charges.packagingGstPercent) / 100);
  const platformGst = round2((platform * charges.platformGstPercent) / 100);
  const taxes = round2(itemGst + deliveryGst + packagingGst + platformGst);

  const grossToPay = round2(
    subTotal - totalDiscount + delivery + packaging + platform + taxes - couponDeliveryDiscount,
  );
  const cashback = round2(Math.max(0, Math.min(cashbackUsed, grossToPay)));
  const afterCashback = round2(grossToPay - cashback);
  const moneyWallet = round2(Math.max(0, Math.min(moneyWalletUsed, afterCashback)));
  const toPay = round2(afterCashback - moneyWallet);
  const saving = round2(totalDiscount + couponDeliveryDiscount + cashback + moneyWallet);

  return {
    subTotal,
    kitchenDiscount,
    delivery,
    packaging,
    platform,
    taxes,
    discount: couponItemDiscount + couponDeliveryDiscount,
    cashbackUsed: cashback,
    moneyWalletUsed: moneyWallet,
    toPay,
    saving,
  };
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: errors at `buildOnDemandBill`'s call sites in `on-demand-cart.tsx` (still passing the old 6-argument shape) — fixed in Task 15.

---

### Task 12: Update the bulk bill builder for the item/delivery split

**Files:**
- Modify: `src/features/bulk/bill.ts`

- [ ] **Step 1: Change `buildBulkBill`'s coupon parameter and math**

Find:
```ts
export function buildBulkBill(
  lines: BulkCartLine[],
  orgInfo: BulkOrgInfo | null,
  category: BulkCategory,
  charges: BulkBillCharges = DEFAULT_BULK_CHARGES,
  couponDiscount = 0,
  cashbackUsed = 0,
  moneyWalletUsed = 0,
  /**
   * Per-box packaging & customization charge (FOOD_BOX_PACKAGING_COST ×
   * number of boxes) — Food Box's Customized mode bills packaging per box
   * instead of the flat `orgInfo.packagingCharges` every other bulk category
   * uses. Ported from MealaweUserApp's `bulk-order-cart.component.ts`
   * `calculateSnackBoxPackagingCost`. Omit/leave undefined for meals/snacks.
   */
  packagingOverride?: number,
): BulkBill {
  const totalQty = lines.reduce((sum, l) => sum + l.count, 0);
  const subTotal = round2(lines.reduce((sum, l) => sum + l.itemPrice * l.count, 0));

  if (!orgInfo || totalQty === 0) {
    const toPay = Math.max(0, round2(subTotal - couponDiscount));
    return { ...emptyBulkBill(), subTotal, discount: couponDiscount, toPay, saving: couponDiscount };
  }

  const delivery = deliveryChargeFor(totalQty, orgInfo, category);
  const packaging = packagingOverride ?? orgInfo.packagingCharges ?? 0;
  const platform = orgInfo.platformCharges || 0;

  const deliveryGst = round2((delivery * charges.deliveryGstPercent) / 100);
  const packagingGst = round2((packaging * charges.packagingGstPercent) / 100);
  const platformGst = round2((platform * charges.platformGstPercent) / 100);
  const itemGst = round2(((subTotal - couponDiscount) * charges.itemGstPercent) / 100);
  const taxes = round2(deliveryGst + packagingGst + platformGst + itemGst);

  const grossToPay = round2(subTotal - couponDiscount + delivery + packaging + platform + taxes);
  const cashback = round2(Math.max(0, Math.min(cashbackUsed, grossToPay)));
  const afterCashback = round2(grossToPay - cashback);
  const moneyWallet = round2(Math.max(0, Math.min(moneyWalletUsed, afterCashback)));
  const toPay = round2(afterCashback - moneyWallet);
  const saving = round2(couponDiscount + cashback + moneyWallet);

  return {
    totalQty,
    subTotal,
    delivery,
    packaging,
    platform,
    taxes,
    discount: couponDiscount,
    cashbackUsed: cashback,
    moneyWalletUsed: moneyWallet,
    toPay,
    saving,
  };
}
```
Replace with:
```ts
export function buildBulkBill(
  lines: BulkCartLine[],
  orgInfo: BulkOrgInfo | null,
  category: BulkCategory,
  charges: BulkBillCharges = DEFAULT_BULK_CHARGES,
  couponItemDiscount = 0,
  couponDeliveryDiscount = 0,
  cashbackUsed = 0,
  moneyWalletUsed = 0,
  /**
   * Per-box packaging & customization charge (FOOD_BOX_PACKAGING_COST ×
   * number of boxes) — Food Box's Customized mode bills packaging per box
   * instead of the flat `orgInfo.packagingCharges` every other bulk category
   * uses. Ported from MealaweUserApp's `bulk-order-cart.component.ts`
   * `calculateSnackBoxPackagingCost`. Omit/leave undefined for meals/snacks.
   */
  packagingOverride?: number,
): BulkBill {
  const totalQty = lines.reduce((sum, l) => sum + l.count, 0);
  const subTotal = round2(lines.reduce((sum, l) => sum + l.itemPrice * l.count, 0));
  const couponDiscount = couponItemDiscount + couponDeliveryDiscount;

  if (!orgInfo || totalQty === 0) {
    const toPay = Math.max(0, round2(subTotal - couponItemDiscount));
    return { ...emptyBulkBill(), subTotal, discount: couponDiscount, toPay, saving: couponDiscount };
  }

  const delivery = deliveryChargeFor(totalQty, orgInfo, category);
  const packaging = packagingOverride ?? orgInfo.packagingCharges ?? 0;
  const platform = orgInfo.platformCharges || 0;

  const deliveryGst = round2((delivery * charges.deliveryGstPercent) / 100);
  const packagingGst = round2((packaging * charges.packagingGstPercent) / 100);
  const platformGst = round2((platform * charges.platformGstPercent) / 100);
  // A coupon's delivery-side discount is NOT subtracted from `delivery`
  // before this GST calc — see cart/bill.ts's buildBill for the same rule
  // and its rationale (matches the Ionic reference).
  const itemGst = round2(((subTotal - couponItemDiscount) * charges.itemGstPercent) / 100);
  const taxes = round2(deliveryGst + packagingGst + platformGst + itemGst);

  const grossToPay = round2(
    subTotal - couponItemDiscount + delivery + packaging + platform + taxes - couponDeliveryDiscount,
  );
  const cashback = round2(Math.max(0, Math.min(cashbackUsed, grossToPay)));
  const afterCashback = round2(grossToPay - cashback);
  const moneyWallet = round2(Math.max(0, Math.min(moneyWalletUsed, afterCashback)));
  const toPay = round2(afterCashback - moneyWallet);
  const saving = round2(couponDiscount + cashback + moneyWallet);

  return {
    totalQty,
    subTotal,
    delivery,
    packaging,
    platform,
    taxes,
    discount: couponDiscount,
    cashbackUsed: cashback,
    moneyWalletUsed: moneyWallet,
    toPay,
    saving,
  };
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: errors at `buildBulkBill`'s call site in `bulk-cart.tsx` — fixed in Task 16.

---

### Task 13: Update the shared `CouponSheet` for the item/delivery split

`CouponSheet.tsx` is imported by all three carts — fix it once, before any cart's own wiring (Tasks 14-16), since each cart's `<CouponSheet onApply={applyResolved} .../>` won't type-check against the new 3-argument `applyResolved` until this is done.

**Files:**
- Modify: `src/features/cart/components/CouponSheet.tsx`

- [ ] **Step 1: Update the props and the discount calculation**

Find:
```tsx
interface CouponSheetProps {
  coupons: SubscriptionCoupon[];
  subTotal: number;
  onApply: (coupon: SubscriptionCoupon, discount: number) => void;
  onClose: () => void;
}

/** All available subscription coupons, each with its computed saving + Apply. */
export const CouponSheet = forwardRef<BottomSheetModal, CouponSheetProps>(
  ({ coupons, subTotal, onApply, onClose }, ref) => {
    const insets = useSafeAreaInsets();
    const colors = useColors();
    return (
      <AppSheet ref={ref} snapPoints={['70%']} onDismiss={onClose}>
        <AppText variant="h2" className="text-foreground px-5 pt-2 pb-3">
          Coupons &amp; offers
        </AppText>
        <BottomSheetScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 12 }}
        >
          {coupons.length === 0 ? (
            <AppText variant="body" className="text-muted-foreground" style={{ paddingVertical: 16 }}>
              No coupons available right now.
            </AppText>
          ) : (
            coupons.map((c) => {
              const { discount, reason } = discountFor(c, subTotal);
              return (
                <View
                  key={c.couponCode}
                  className="rounded-2xl border border-border p-4"
                  style={{ gap: 8 }}
                >
                  <View className="flex-row items-center gap-3">
                    <AccentIcon icon={IconTicket} tone="reward" size={18} tileSize={38} />
                    <View className="flex-1">
                      <AppText variant="label" className="text-foreground">
                        {c.couponCode}
                      </AppText>
                      {c.couponHeader ? (
                        <AppText variant="caption" className="text-muted-foreground">
                          {c.couponHeader}
                        </AppText>
                      ) : null}
                    </View>
                    <Button
                      label="Apply"
                      size="sm"
                      disabled={!!reason}
                      onPress={() => onApply(c, discount)}
                    />
                  </View>
                  {c.description ? (
                    <AppText variant="bodySm" className="text-muted-foreground">
                      {c.description}
                    </AppText>
                  ) : null}
                  <AppText
                    variant="caption"
                    style={{ color: reason ? colors.mutedForeground : palette.accent.veg }}
                  >
                    {reason ?? `You save ${formatINR(discount)} on this order`}
                  </AppText>
                </View>
              );
            })
          )}
        </BottomSheetScrollView>
      </AppSheet>
    );
  },
);
```
Replace with:
```tsx
interface CouponSheetProps {
  coupons: SubscriptionCoupon[];
  itemSubTotal: number;
  deliveryCharge: number;
  taxes: number;
  onApply: (coupon: SubscriptionCoupon, itemDiscount: number, deliveryDiscount: number) => void;
  onClose: () => void;
}

/** All available subscription coupons, each with its computed saving + Apply. */
export const CouponSheet = forwardRef<BottomSheetModal, CouponSheetProps>(
  ({ coupons, itemSubTotal, deliveryCharge, taxes, onApply, onClose }, ref) => {
    const insets = useSafeAreaInsets();
    const colors = useColors();
    const ctx = { itemSubTotal, deliveryCharge, taxes };
    return (
      <AppSheet ref={ref} snapPoints={['70%']} onDismiss={onClose}>
        <AppText variant="h2" className="text-foreground px-5 pt-2 pb-3">
          Coupons &amp; offers
        </AppText>
        <BottomSheetScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 12 }}
        >
          {coupons.length === 0 ? (
            <AppText variant="body" className="text-muted-foreground" style={{ paddingVertical: 16 }}>
              No coupons available right now.
            </AppText>
          ) : (
            coupons.map((c) => {
              const { itemDiscount, deliveryDiscount, reason } = discountFor(c, ctx);
              const discount = itemDiscount + deliveryDiscount;
              return (
                <View
                  key={c.couponCode}
                  className="rounded-2xl border border-border p-4"
                  style={{ gap: 8 }}
                >
                  <View className="flex-row items-center gap-3">
                    <AccentIcon icon={IconTicket} tone="reward" size={18} tileSize={38} />
                    <View className="flex-1">
                      <AppText variant="label" className="text-foreground">
                        {c.couponCode}
                      </AppText>
                      {c.couponHeader ? (
                        <AppText variant="caption" className="text-muted-foreground">
                          {c.couponHeader}
                        </AppText>
                      ) : null}
                    </View>
                    <Button
                      label="Apply"
                      size="sm"
                      disabled={!!reason}
                      onPress={() => onApply(c, itemDiscount, deliveryDiscount)}
                    />
                  </View>
                  {c.description ? (
                    <AppText variant="bodySm" className="text-muted-foreground">
                      {c.description}
                    </AppText>
                  ) : null}
                  <AppText
                    variant="caption"
                    style={{ color: reason ? colors.mutedForeground : palette.accent.veg }}
                  >
                    {reason ?? `You save ${formatINR(discount)} on this order`}
                  </AppText>
                </View>
              );
            })
          )}
        </BottomSheetScrollView>
      </AppSheet>
    );
  },
);
```
(`subTotal` is renamed to `itemSubTotal` and gains `deliveryCharge`/`taxes` siblings — every `<CouponSheet .../>` call site is updated to match in Tasks 14-16 below.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: new errors at every `<CouponSheet .../>` call site (still passing the old `subTotal` prop) — fixed in Tasks 14-16. Confirm no other unrelated errors appear.

---

### Task 14: Wire the new `discountFor`/`AppliedCoupon` shape + server usage-check into `cart.tsx`

**Files:**
- Modify: `src/app/cart.tsx`

- [ ] **Step 1: Import `validateCouponForUser`**

Find:
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
Replace with:
```ts
import {
  buildBill,
  discountFor,
  validateCouponForUser,
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

- [ ] **Step 2: Update the `bestCoupon` preview loop**

Find:
```ts
  const bestCoupon = useMemo(() => {
    let best: { coupon: SubscriptionCoupon; discount: number } | null = null;
    for (const c of coupons) {
      const { discount, reason } = discountFor(c, bill.subTotal);
      if (!reason && discount > (best?.discount ?? 0)) {
        best = { coupon: c, discount };
      }
    }
    return best;
  }, [coupons, bill.subTotal]);
```
Replace with:
```ts
  const bestCoupon = useMemo(() => {
    const ctx = { itemSubTotal: bill.subTotal, deliveryCharge: bill.delivery, taxes: bill.taxes };
    let best: { coupon: SubscriptionCoupon; itemDiscount: number; deliveryDiscount: number; discount: number } | null =
      null;
    for (const c of coupons) {
      const { itemDiscount, deliveryDiscount, reason } = discountFor(c, ctx);
      const discount = itemDiscount + deliveryDiscount;
      if (!reason && discount > (best?.discount ?? 0)) {
        best = { coupon: c, itemDiscount, deliveryDiscount, discount };
      }
    }
    return best;
  }, [coupons, bill.subTotal, bill.delivery, bill.taxes]);
```

- [ ] **Step 3: Make `applyByCode` async and add the server usage-check**

Find:
```ts
  const applyByCode = (): void => {
    const found = coupons.find((c) => (c.couponCode ?? '').toLowerCase() === code.trim().toLowerCase());
    if (!found) {
      setCouponError('Invalid or expired coupon');
      return;
    }
    const { discount, reason } = discountFor(found, bill.subTotal);
    if (reason) {
      setCouponError(reason);
      return;
    }
    setCouponError(null);
    const finalCode = found.couponCode ?? code;
    applyCoupon({ couponCode: finalCode, discount, couponHeader: found.couponHeader });
  };

  const applyResolved = (c: SubscriptionCoupon, discount: number): void => {
    setCouponError(null);
    applyCoupon({ couponCode: c.couponCode ?? '', discount, couponHeader: c.couponHeader });
    couponSheetRef.current?.dismiss();
  };
```
Replace with:
```ts
  const applyByCode = async (): Promise<void> => {
    const found = coupons.find((c) => (c.couponCode ?? '').toLowerCase() === code.trim().toLowerCase());
    if (!found) {
      setCouponError('Invalid or expired coupon');
      return;
    }
    const { itemDiscount, deliveryDiscount, reason } = discountFor(found, {
      itemSubTotal: bill.subTotal,
      deliveryCharge: bill.delivery,
      taxes: bill.taxes,
    });
    if (reason) {
      setCouponError(reason);
      return;
    }
    const finalCode = found.couponCode ?? code;
    const { valid, message } = await validateCouponForUser(finalCode, profile?._id);
    if (!valid) {
      setCouponError(message ?? 'This coupon can no longer be used.');
      return;
    }
    setCouponError(null);
    applyCoupon({
      couponCode: finalCode,
      discount: itemDiscount + deliveryDiscount,
      itemDiscount,
      deliveryDiscount,
      couponHeader: found.couponHeader,
    });
  };

  const applyResolved = async (
    c: SubscriptionCoupon,
    itemDiscount: number,
    deliveryDiscount: number,
  ): Promise<void> => {
    const { valid, message } = await validateCouponForUser(c.couponCode ?? '', profile?._id);
    if (!valid) {
      setCouponError(message ?? 'This coupon can no longer be used.');
      return;
    }
    setCouponError(null);
    applyCoupon({
      couponCode: c.couponCode ?? '',
      discount: itemDiscount + deliveryDiscount,
      itemDiscount,
      deliveryDiscount,
      couponHeader: c.couponHeader,
    });
    couponSheetRef.current?.dismiss();
  };
```

- [ ] **Step 4: Update the "best coupon" banner and the `CouponSheet` call site**

Find:
```tsx
                    <AppText variant="body" className="flex-1 text-foreground">
                      Save {formatINR(bestCoupon.discount)} with{' '}
                      <AppText variant="body" weight="bold" className="text-foreground">
                        &quot;{bestCoupon.coupon.couponCode}&quot;
                      </AppText>
                    </AppText>
```
This line is unchanged (`bestCoupon.discount` is still the total, from Step 2's `useMemo`) — no edit needed here, just confirming it still compiles.

Find:
```tsx
                      onPress={() => applyResolved(bestCoupon.coupon, bestCoupon.discount)}
```
Replace with:
```tsx
                      onPress={() => applyResolved(bestCoupon.coupon, bestCoupon.itemDiscount, bestCoupon.deliveryDiscount)}
```

Find:
```tsx
      <CouponSheet
        ref={couponSheetRef}
        coupons={coupons}
        subTotal={bill.subTotal}
        onApply={applyResolved}
        onClose={() => { }}
      />
```
Replace with:
```tsx
      <CouponSheet
        ref={couponSheetRef}
        coupons={coupons}
        itemSubTotal={bill.subTotal}
        deliveryCharge={bill.delivery}
        taxes={bill.taxes}
        onApply={applyResolved}
        onClose={() => { }}
      />
```
(`applyResolved` is now `(c, itemDiscount, deliveryDiscount) => Promise<void>`, matching `CouponSheet`'s new `onApply` type from Task 13 exactly — no wrapper needed. `onPress={applyByCode}` at this file's "Apply" button for the typed-code entry needs no change either: `applyByCode` returning `Promise<void>` is still assignable to an `onPress: () => void` prop, same as the existing `async function detect()` pattern already used unwrapped in `addresses.tsx`.)

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: no errors remaining in `cart.tsx`.

---

### Task 15: Wire the new shape into `on-demand-cart.tsx`

**Files:**
- Modify: `src/app/on-demand-cart.tsx`

- [ ] **Step 1: Import `validateCouponForUser`**

Find:
```ts
import { CouponSheet, SavingsBanner, CouponCelebration, discountFor } from '@/features/cart';
```
Replace with:
```ts
import { CouponSheet, SavingsBanner, CouponCelebration, discountFor, validateCouponForUser } from '@/features/cart';
```

- [ ] **Step 2: Update `grossBeforeWallet` and `bill`'s `buildOnDemandBill` calls**

Find:
```ts
  const grossBeforeWallet = useMemo(
    () => buildOnDemandBill(cart.lines, kitchenDiscount, charges, cart.coupon?.discount ?? 0, 0, 0).toPay,
    [cart.lines, kitchenDiscount, charges, cart.coupon],
  );
```
Replace with:
```ts
  const grossBeforeWallet = useMemo(
    () =>
      buildOnDemandBill(
        cart.lines,
        kitchenDiscount,
        charges,
        cart.coupon?.itemDiscount ?? 0,
        cart.coupon?.deliveryDiscount ?? 0,
        0,
        0,
      ).toPay,
    [cart.lines, kitchenDiscount, charges, cart.coupon],
  );
```

Find:
```ts
  const bill = useMemo(
    () =>
      buildOnDemandBill(
        cart.lines,
        kitchenDiscount,
        charges,
        cart.coupon?.discount ?? 0,
        useCashback ? Math.min(cashbackBalance, maxCashback) : 0,
        useWallet ? walletBalance : 0,
      ),
    [cart.lines, kitchenDiscount, charges, cart.coupon, useCashback, useWallet, cashbackBalance, walletBalance, maxCashback],
  );
```
Replace with:
```ts
  const bill = useMemo(
    () =>
      buildOnDemandBill(
        cart.lines,
        kitchenDiscount,
        charges,
        cart.coupon?.itemDiscount ?? 0,
        cart.coupon?.deliveryDiscount ?? 0,
        useCashback ? Math.min(cashbackBalance, maxCashback) : 0,
        useWallet ? walletBalance : 0,
      ),
    [cart.lines, kitchenDiscount, charges, cart.coupon, useCashback, useWallet, cashbackBalance, walletBalance, maxCashback],
  );
```

- [ ] **Step 3: Update `bestCoupon`, `applyByCode`, `applyResolved`**

Find:
```ts
  const bestCoupon = useMemo(() => {
    let best: { coupon: SubscriptionCoupon; discount: number } | null = null;
    for (const c of coupons) {
      const { discount, reason } = discountFor(c, couponEligibleSubTotal);
      if (!reason && discount > (best?.discount ?? 0)) {
        best = { coupon: c, discount };
      }
    }
    return best;
  }, [coupons, couponEligibleSubTotal]);
```
Replace with:
```ts
  const bestCoupon = useMemo(() => {
    const ctx = { itemSubTotal: couponEligibleSubTotal, deliveryCharge: bill.delivery, taxes: bill.taxes };
    let best: { coupon: SubscriptionCoupon; itemDiscount: number; deliveryDiscount: number; discount: number } | null =
      null;
    for (const c of coupons) {
      const { itemDiscount, deliveryDiscount, reason } = discountFor(c, ctx);
      const discount = itemDiscount + deliveryDiscount;
      if (!reason && discount > (best?.discount ?? 0)) {
        best = { coupon: c, itemDiscount, deliveryDiscount, discount };
      }
    }
    return best;
  }, [coupons, couponEligibleSubTotal, bill.delivery, bill.taxes]);
```

Find:
```ts
  const applyByCode = (): void => {
    const found = coupons.find((c) => (c.couponCode ?? '').toLowerCase() === code.trim().toLowerCase());
    if (!found) {
      setCouponError('Invalid or expired coupon');
      return;
    }
    const { discount, reason } = discountFor(found, couponEligibleSubTotal);
    if (reason) {
      setCouponError(reason);
      return;
    }
    setCouponError(null);
    setUseCashback(false);
    const finalCode = found.couponCode ?? code;
    applyCoupon({ couponCode: finalCode, discount, couponHeader: found.couponHeader });
    celebrate(finalCode, discount);
  };

  const applyResolved = (c: SubscriptionCoupon, discount: number): void => {
    setCouponError(null);
    setUseCashback(false);
    applyCoupon({ couponCode: c.couponCode ?? '', discount, couponHeader: c.couponHeader });
    couponSheetRef.current?.dismiss();
    celebrate(c.couponCode ?? '', discount);
  };
```
Replace with:
```ts
  const applyByCode = async (): Promise<void> => {
    const found = coupons.find((c) => (c.couponCode ?? '').toLowerCase() === code.trim().toLowerCase());
    if (!found) {
      setCouponError('Invalid or expired coupon');
      return;
    }
    const { itemDiscount, deliveryDiscount, reason } = discountFor(found, {
      itemSubTotal: couponEligibleSubTotal,
      deliveryCharge: bill.delivery,
      taxes: bill.taxes,
    });
    if (reason) {
      setCouponError(reason);
      return;
    }
    const finalCode = found.couponCode ?? code;
    const { valid, message } = await validateCouponForUser(finalCode, profile?._id);
    if (!valid) {
      setCouponError(message ?? 'This coupon can no longer be used.');
      return;
    }
    setCouponError(null);
    setUseCashback(false);
    applyCoupon({
      couponCode: finalCode,
      discount: itemDiscount + deliveryDiscount,
      itemDiscount,
      deliveryDiscount,
      couponHeader: found.couponHeader,
    });
    celebrate(finalCode, itemDiscount + deliveryDiscount);
  };

  const applyResolved = async (
    c: SubscriptionCoupon,
    itemDiscount: number,
    deliveryDiscount: number,
  ): Promise<void> => {
    const { valid, message } = await validateCouponForUser(c.couponCode ?? '', profile?._id);
    if (!valid) {
      setCouponError(message ?? 'This coupon can no longer be used.');
      return;
    }
    setCouponError(null);
    setUseCashback(false);
    applyCoupon({
      couponCode: c.couponCode ?? '',
      discount: itemDiscount + deliveryDiscount,
      itemDiscount,
      deliveryDiscount,
      couponHeader: c.couponHeader,
    });
    couponSheetRef.current?.dismiss();
    celebrate(c.couponCode ?? '', itemDiscount + deliveryDiscount);
  };
```

- [ ] **Step 4: Update the `CouponRow` call site and the `CouponSheet` call site**

Find:
```tsx
              couponError={couponError}
              onApplyByCode={applyByCode}
              onApplyBest={() => bestCoupon && applyResolved(bestCoupon.coupon, bestCoupon.discount)}
              onClear={clearCoupon}
              onOpenSheet={() => couponSheetRef.current?.present()}
```
Replace with:
```tsx
              couponError={couponError}
              onApplyByCode={applyByCode}
              onApplyBest={() =>
                bestCoupon && applyResolved(bestCoupon.coupon, bestCoupon.itemDiscount, bestCoupon.deliveryDiscount)
              }
              onClear={clearCoupon}
              onOpenSheet={() => couponSheetRef.current?.present()}
```
(`CouponRow`'s own `bestCoupon` prop type, `{ coupon: SubscriptionCoupon; discount: number } | null` at this file's `CouponRow` component definition, needs no change — `bestCoupon`'s new shape from Step 3 above still carries a `discount` field alongside the new `itemDiscount`/`deliveryDiscount`, so it still structurally satisfies that prop type unchanged. Same reasoning for `onApplyByCode`/`onApplyBest`'s `() => void` prop types accepting `applyByCode`/`applyResolved`'s new `Promise<void>`-returning signatures with no wrapper needed — see Task 14 Step 4's note on the `addresses.tsx` `detect()` precedent.)

Find:
```tsx
      <CouponSheet ref={couponSheetRef} coupons={coupons} subTotal={couponEligibleSubTotal} onApply={applyResolved} onClose={() => {}} />
```
Replace with:
```tsx
      <CouponSheet
        ref={couponSheetRef}
        coupons={coupons}
        itemSubTotal={couponEligibleSubTotal}
        deliveryCharge={bill.delivery}
        taxes={bill.taxes}
        onApply={applyResolved}
        onClose={() => {}}
      />
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: no errors remaining in `on-demand-cart.tsx`.

---

### Task 16: Wire the new shape into `bulk-cart.tsx`

**Files:**
- Modify: `src/app/bulk-cart.tsx`

- [ ] **Step 1: Import `validateCouponForUser`**

Find:
```ts
import { CouponSheet, SavingsBanner, CouponCelebration, discountFor } from '@/features/cart';
```
Replace with:
```ts
import { CouponSheet, SavingsBanner, CouponCelebration, discountFor, validateCouponForUser } from '@/features/cart';
```

- [ ] **Step 2: Update the `bill`'s `buildBulkBill` call**

Find:
```ts
  const bill = useMemo(() => {
    const packagingOverride =
      cart.category === 'foodbox' && cart.packaging === 'bulk'
        ? foodBoxPackagingCost * cart.lines.reduce((sum, l) => sum + l.count, 0)
        : undefined;
    return buildBulkBill(
      cart.lines,
      cart.orgInfo,
      cart.category ?? 'meals',
      charges,
      cart.coupon?.discount ?? 0,
      useCashback ? cashbackBalance : 0,
      useWallet ? walletBalance : 0,
      packagingOverride,
    );
  }, [cart, charges, useCashback, useWallet, cashbackBalance, walletBalance, foodBoxPackagingCost]);
```
Replace with:
```ts
  const bill = useMemo(() => {
    const packagingOverride =
      cart.category === 'foodbox' && cart.packaging === 'bulk'
        ? foodBoxPackagingCost * cart.lines.reduce((sum, l) => sum + l.count, 0)
        : undefined;
    return buildBulkBill(
      cart.lines,
      cart.orgInfo,
      cart.category ?? 'meals',
      charges,
      cart.coupon?.itemDiscount ?? 0,
      cart.coupon?.deliveryDiscount ?? 0,
      useCashback ? cashbackBalance : 0,
      useWallet ? walletBalance : 0,
      packagingOverride,
    );
  }, [cart, charges, useCashback, useWallet, cashbackBalance, walletBalance, foodBoxPackagingCost]);
```

- [ ] **Step 3: Update `bestCoupon`, `applyByCode`, `applyResolved`**

Find:
```ts
  const bestCoupon = useMemo(() => {
    let best: { coupon: SubscriptionCoupon; discount: number } | null = null;
    for (const c of coupons) {
      const { discount, reason } = discountFor(c, bill.subTotal);
      if (!reason && discount > (best?.discount ?? 0)) {
        best = { coupon: c, discount };
      }
    }
    return best;
  }, [coupons, bill.subTotal]);
```
Replace with:
```ts
  const bestCoupon = useMemo(() => {
    const ctx = { itemSubTotal: bill.subTotal, deliveryCharge: bill.delivery, taxes: bill.taxes };
    let best: { coupon: SubscriptionCoupon; itemDiscount: number; deliveryDiscount: number; discount: number } | null =
      null;
    for (const c of coupons) {
      const { itemDiscount, deliveryDiscount, reason } = discountFor(c, ctx);
      const discount = itemDiscount + deliveryDiscount;
      if (!reason && discount > (best?.discount ?? 0)) {
        best = { coupon: c, itemDiscount, deliveryDiscount, discount };
      }
    }
    return best;
  }, [coupons, bill.subTotal, bill.delivery, bill.taxes]);
```

Find:
```ts
  const applyByCode = (): void => {
    const found = coupons.find((c) => (c.couponCode ?? '').toLowerCase() === code.trim().toLowerCase());
    if (!found) {
      setCouponError('Invalid or expired coupon');
      return;
    }
    const { discount, reason } = discountFor(found, bill.subTotal);
    if (reason) {
      setCouponError(reason);
      return;
    }
    setCouponError(null);
    const finalCode = found.couponCode ?? code;
    applyCoupon({ couponCode: finalCode, discount, couponHeader: found.couponHeader });
    celebrate(finalCode, discount);
  };

  const applyResolved = (c: SubscriptionCoupon, discount: number): void => {
    setCouponError(null);
    applyCoupon({ couponCode: c.couponCode ?? '', discount, couponHeader: c.couponHeader });
    couponSheetRef.current?.dismiss();
    celebrate(c.couponCode ?? '', discount);
  };
```
Replace with:
```ts
  const applyByCode = async (): Promise<void> => {
    const found = coupons.find((c) => (c.couponCode ?? '').toLowerCase() === code.trim().toLowerCase());
    if (!found) {
      setCouponError('Invalid or expired coupon');
      return;
    }
    const { itemDiscount, deliveryDiscount, reason } = discountFor(found, {
      itemSubTotal: bill.subTotal,
      deliveryCharge: bill.delivery,
      taxes: bill.taxes,
    });
    if (reason) {
      setCouponError(reason);
      return;
    }
    const finalCode = found.couponCode ?? code;
    const { valid, message } = await validateCouponForUser(finalCode, profile?._id);
    if (!valid) {
      setCouponError(message ?? 'This coupon can no longer be used.');
      return;
    }
    setCouponError(null);
    applyCoupon({
      couponCode: finalCode,
      discount: itemDiscount + deliveryDiscount,
      itemDiscount,
      deliveryDiscount,
      couponHeader: found.couponHeader,
    });
    celebrate(finalCode, itemDiscount + deliveryDiscount);
  };

  const applyResolved = async (
    c: SubscriptionCoupon,
    itemDiscount: number,
    deliveryDiscount: number,
  ): Promise<void> => {
    const { valid, message } = await validateCouponForUser(c.couponCode ?? '', profile?._id);
    if (!valid) {
      setCouponError(message ?? 'This coupon can no longer be used.');
      return;
    }
    setCouponError(null);
    applyCoupon({
      couponCode: c.couponCode ?? '',
      discount: itemDiscount + deliveryDiscount,
      itemDiscount,
      deliveryDiscount,
      couponHeader: c.couponHeader,
    });
    couponSheetRef.current?.dismiss();
    celebrate(c.couponCode ?? '', itemDiscount + deliveryDiscount);
  };
```

- [ ] **Step 4: Update the `BulkCouponCard` call site and the `CouponSheet` call site**

`BulkCouponCard.tsx`'s own prop type (`bestCoupon: { coupon: SubscriptionCoupon; discount: number } | null`, and `onApplyBest: () => void`) needs no change — same structural-typing and `Promise<void>`-into-`void`-prop reasoning as Task 15 Step 4's note. Only this file's own call site needs updating:

Find:
```tsx
          couponError={couponError}
          onApplyByCode={applyByCode}
          onApplyBest={() => bestCoupon && applyResolved(bestCoupon.coupon, bestCoupon.discount)}
          onClear={clearCoupon}
          onOpenSheet={() => couponSheetRef.current?.present()}
```
Replace with:
```tsx
          couponError={couponError}
          onApplyByCode={applyByCode}
          onApplyBest={() =>
            bestCoupon && applyResolved(bestCoupon.coupon, bestCoupon.itemDiscount, bestCoupon.deliveryDiscount)
          }
          onClear={clearCoupon}
          onOpenSheet={() => couponSheetRef.current?.present()}
```

Find:
```tsx
      <CouponSheet
        ref={couponSheetRef}
        coupons={coupons}
        subTotal={bill.subTotal}
        onApply={applyResolved}
        onClose={() => {}}
      />
```
Replace with:
```tsx
      <CouponSheet
        ref={couponSheetRef}
        coupons={coupons}
        itemSubTotal={bill.subTotal}
        deliveryCharge={bill.delivery}
        taxes={bill.taxes}
        onApply={applyResolved}
        onClose={() => {}}
      />
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: no errors remaining anywhere in the repo from this coupon-logic change. This is the last task touching `discountFor`'s signature — a clean `tsc` run here confirms every call site was updated.

Run: `npx expo export --platform android -c`
Expected: export succeeds.

---

## Part 4 — Terms & Conditions native screen

### Task 17: Create the bundled terms content

**Files:**
- Create: `src/features/auth/components/termsContent.ts`

- [ ] **Step 1: Create the content file**

Create `src/features/auth/components/termsContent.ts`:
```ts
/** Terms & Conditions copy, transcribed verbatim from https://mealawe.com/terms/
 * (fetched and extracted 2026-09-03) so it can render natively instead of in a
 * WebView — see TermsSheet.tsx and the design spec's Part 4 for why. Update
 * this file (and re-verify against the live page) whenever legal copy
 * changes; there is currently no server-driven alternative. */
export interface TermsSection {
  heading: string;
  paragraphs: string[];
}

export const TERMS_SECTIONS: TermsSection[] = [
  {
    heading: 'Home Chef/Vendor/Merchant Terms of Use',
    paragraphs: [
      '"Mealawe Home Chef" is a mobile application that provides an online marketplace that connects Home Chefs who want to sell meals to users looking for meals. Mealawe Home Chef mobile application is designed, developed & conceptualized by YAGY TECH PRIVATE LIMITED.',
      'YAGY TECH PRIVATE LIMITED is a company, located at 705/706, 66 High Street Square, Pan Card Club Road, Baner, Pune, Maharashtra-411045. All rights, benefits, liabilities & obligations under the following terms & conditions shall accrue to the benefit of YAGY TECH PRIVATE LIMITED (together with its subsidiaries and other affiliates hereinafter referred to as "Us", "We" or "Company").',
      'Mealawe may revise these terms of use at any time by amending this page. You are expected to check this page from time to time to take notice of any changes we make, as they are binding on you.',
      'These Terms of Service (the "Terms") are intended to make you aware of your legal rights and responsibilities with respect to your access to and use of Mealawe Home Chef mobile application and any related software applications including but not limited to delivery of information via the website whether existing now or in the future that link to the Terms (collectively, the "Services").',
      'Please read these Terms of Use carefully before you use the services. If you do not agree to these Terms of Use, you may not use the services on the Platform, and we request you to uninstall the Application. By installing, downloading, or even merely using the Platform, you shall be contracting with Mealawe and signify your acceptance to the Terms of Use and other policies (including but not limited to the Cancellation & Refund Policy, Privacy Policy, and Take Down Policy) as posted on the Platform from time to time, which takes effect on the date on which you download, install or use the Services, and create a legally binding arrangement to abide by the same. You may not use the Services if you do not accept the Terms or are unable to be bound by the Terms. Your use of the Platform is at your own risk, including the risk of data theft, virus attack, or that you might be exposed to content that is objectionable, or otherwise inappropriate.',
      '"Users/Buyers" means a person who has signed up and is registered with Mealawe for the use or potential use/purchase of the Goods/Services.',
      '"Vendor/Home Chef/Merchants" means a food and beverage supplier or business or establishment having sole responsibility for providing food and beverage services registered with Mealawe.',
      '"Meals" means home food and beverages i.e. Indian Cuisine, Bakery Items, Pickles, Juices, etc. prepared by Home Chef who are registered on Mealawe Home Chef application.',
      "References to Home Chef shall include such party's successors, employees, permitted assignees, and any persons deriving title under it.",
      'Mealawe enables delivery of Meal/Food Orders or completion of Tasks at select localities serviceable across Pune ("Delivery Services") by connecting third-party service providers i.e. pick-up and delivery partners who will be responsible for providing the pick-up and delivery services and completing Tasks initiated by the users of the Platform (Buyers or Merchants). The Platform Services and Delivery Services are collectively referred to as "Services". For both Platform Services and Delivery Services, Mealawe is merely acting as an intermediary between the Merchants and Buyers and/or pick-up & delivery partners and Buyers/Merchants.',
      'Pick-up & delivery partners are individual entrepreneurs engaged with Mealawe on a voluntary, non-exclusive, and principal to principal basis to provide the aforementioned services for a service fee. Pick-up & delivery partners are independent contractors and are free to determine their timings of work. Mealawe does not exercise control over the pick-up & delivery partners and the relationship between the Pick-up & delivery partners and Mealawe is not that of an agent and principal or employee and employer.',
      'For the pickup and delivery services and completing the Tasks, pick-up & delivery partners may charge the users of the Platform (Buyers or Merchants), a service fee (inclusive of applicable taxes whenever not expressly mentioned) determined on the basis of various factors including but not limited to distance covered, time taken, demand for delivery services/Tasks, real time analysis of traffic and weather conditions, seasonal peaks or such other parameters as may be determined from time to time.',
      'The Terms and Conditions, hereinafter referred to as "The Agreement" may be amended from time to time and is a legal contract between Home Chef and Mealawe.',
    ],
  },
  {
    heading: 'Terms & Conditions (Home Chef)',
    paragraphs: [
      'By using the Mealawe Home Chef mobile application, Home Chefs are accepting the below-specified Terms of Use-',
      'Home Chef is responsible for informing Mealawe if they are unable to take orders due to prior commitments, sickness, holidays, etc. Home Chef is required to update their leave dates on the website through their personal admin system.',
      'All commercial/contractual terms are offered by Home Chef and agreed to, is between Users and Home Chef alone. The commercial/contractual terms include without limitation price, taxes, shipping costs, payment methods, payment terms, date, period, and mode of delivery, warranties related to products and services, and after-sales services related to products and services. Mealawe does not have any control or does not determine or advise or in any way involve itself in the offering or acceptance of such commercial/contractual terms between the Users and Home Chefs. Payment will be received by Mealawe and Mealawe will transfer the payment to Home Chef after deducting commission.',
      'In case of any copyright infringement due to photographs uploaded by Home Chefs on their profile, liability will lie on Home Chefs and not on Mealawe. Any information provided by the Home Chef including photos, menu items, profile descriptions, etc. can be used by Mealawe for various purposes, including business development, promotions, etc.',
      'The Home Chefs are solely responsible for honoring any confirmed bookings and making available any dishes/service reserved through the platform. If you, as a Mealawe buyer, choose to enter into a transaction with a Home Chefs for the booking of a Meal, you agree and understand that you will be required to enter into an agreement with the Home Chefs and you agree to accept any terms, conditions, rules, and restrictions associated with such Meal imposed by the Home Chefs. You acknowledge and agree that you, and not Mealawe, will be responsible for performing the obligations of any such agreements, and we are not a party to such agreements and disclaim all liability arising from or related to any such agreements. The Home Chefs are solely responsible for the preparation and timely delivery of food (as per terms specified on their profile) as well as for maintaining quality and hygiene. Mealawe will not be responsible or liable for the quantity or quality of meals delivered.',
      'The Home Chef by being on the platform acknowledges and agrees that a substantial portion of the compensation will be paid to Mealawe for making the mobile application available to the Home Chef is collected as a commission on the money you receive for orders to the clients. Therefore, once you identify or are identified by any party through the mobile application, you must inform Mealawe of such an order and pay the commission for work arising directly or indirectly with that party or arising out of your relationship with that party.',
      'If delivery is being done by Home Chefs or if the Customer is picking up the food from the Home Chef, then Home Chef will not be responsible for collecting payments from Customers and will not be liable therefore for loss that may occur due to non-payment on behalf of customers, if any.',
      "Mealawe will not be responsible for any health damages or sickness caused due to the food delivered by the Home Chefs. In addition, although these Terms require Home Chefs/Users to provide accurate information, we do not attempt to confirm and do not confirm any Member's/user purported identity. You are responsible for determining the identity and suitability of others who you contact via the Application and Services. By using the Application or Services, you agree that any legal remedy or liability that you seek to obtain for actions or omissions of other Members/users or other third parties will be limited to a claim against the particular Members or other third parties who caused you harm and you agree not to attempt to impose liability on, or seek any legal remedy from Mealawe with respect to such actions or omissions.",
      'The Home Chef will follow the basic hygiene and safety requirements as laid down by the FSSAI. If they fail to do so, the Home Chef may be asked for a refund of the full order value to the client.',
      'Mealawe will send regular reminders to Home Chefs for the said commission and will be liable to cancel their registrations upon non-payment to Mealawe.',
      'Mealawe will monitor Home Chefs closely, using Customer feedback provided in any form to Mealawe, and will remove and block Home Chefs if they are unable to comply with Mealawe standards and/or tarnish our reputation. (A Home Chefs will be blocked from the application if the average user rating falls below 2.5 out of 5.0. The rating will be calculated on the basis of customer feedback and reviews and a minimum of 50 customer reviews are required)',
      'Mealawe is not responsible for any liability, if any, that may arise from the misuse of the shared information, if any, or from the consumption of any food and beverages prepared by a Home Chef.',
      'The Home Chefs cannot, under any circumstances, place orders on their own profiles.',
      'Neither party, be it the Customer, Mealawe or the Home Chef shall be responsible to the others for any delay or non-performance of its obligations under this agreement arising from any cause beyond its control including, without limitation, any of the following: an act of God, governmental act, war, fire, flood, explosion or civil commotion.',
      'Home Chefs are legally obliged to add Mealawe branding to all orders that have been forwarded to them by Mealawe.',
      "For corporate orders, the payments will be made as per the corporate's payment cycle.",
      'All Home Chefs must complete the KYC formalities with Mealawe. No payments will be made to Home Chefs who have not completed their KYC formalities.',
      "If a Home Chef does not accept/reject online placed food order within 5 minutes, Mealawe will send an automated call to Home Chef's registered mobile number through third party calling services.",
    ],
  },
  {
    heading: 'Disclosure',
    paragraphs: [
      'We may disclose to third party services certain personally identifiable information listed below -',
      'Information you provide us such as name, email, mobile phone number. Information we collect as you access and use our service, including device information, location, and network carrier.',
      'This information is shared with third-party service providers so that we can personalize the mobile application for you and perform behavioral analytics.',
    ],
  },
  {
    heading: 'User Registration',
    paragraphs: [
      'Mealawe may collect your personal information when you register an account, when you purchase services on the Application, when you participate in contests, competitions, questionnaires, and surveys, when you contact us, when you provide certain content to Mealawe (for example, testimonials and customer reviews), and from third-party sources (for example, credit checking agencies).',
      'Mealawe may use your personal information for registering your account with Mealawe, for fulfilling orders, for responding to your queries, and for improving your experience and providing you with information about our services, special offers, and promotions.',
      'Mealawe will only share your information with its carefully selected third-party Partners for necessary business administration, customer delivery, marketing, operational and analytical purposes. Mealawe may also share your information with third parties for the purpose of data analysis, quality assurance including fraud prevention.',
      'Mealawe uses leading technology and security measures (electronic, physical and procedural) to ensure the safety and confidentiality of your information through collection, storage, and disclosure. Such measures include maintaining a secure encryption-based transmission system, intrusion detection, and prevention software and virus software in respect of your information.',
    ],
  },
  {
    heading: 'Privacy Policy (Home Chef)',
    paragraphs: [
      'You represent that you have read understood and agreed to Mealawe Privacy Policy. Please note that Mealawe may disclose information about you to third parties or government authorities if Mealawe believes that such disclosure is reasonably necessary to: take action regarding suspected illegal activities; enforce or apply our Terms and Privacy Policy; comply with legal process or other government inquiry, such as a search warrant, subpoena, statute, judicial proceeding, or other legal processes/notice served on us; or protect our rights, reputation, and property, or that of our users, affiliates, or the general public.',
    ],
  },
  {
    heading: 'Cancellation Policy (Home Chef)',
    paragraphs: ['Refer "refunds & cancelation" policy section.'],
  },
  {
    heading: 'User/Buyer Terms & Conditions',
    paragraphs: [
      '"Mealawe" is a mobile application that provides an online marketplace that connects users who want to order meals. Mealawe mobile application is designed, developed & conceptualized by YAGY TECH PRIVATE LIMITED.',
      'YAGY TECH PRIVATE LIMITED is a company, located at 705/706, 66 High Street Square, Pan Card Club Road, Baner, Pune, Maharashtra-411045. All rights, benefits, liabilities & obligations under the following terms & conditions shall accrue to the benefit of YAGY TECH PRIVATE LIMITED (together with its subsidiaries and other affiliates hereinafter referred to as "Us", "We" or "Company").',
      'Mealawe may revise these terms of use at any time by amending this page. You are expected to check this page from time to time to take notice of any changes we make, as they are binding on you.',
      'These Terms of Service (the "Terms") are intended to make you aware of your legal rights and responsibilities with respect to your access to and use of Mealawe mobile application and any related mobile or software applications including but not limited to delivery of information via the website whether existing now or in the future that link to the Terms (collectively, the "Services").',
      'Please read these Terms of Use carefully before you use the services. If you do not agree to these Terms of Use, you may not use the services on the Platform, and we request you to uninstall the App. By installing, downloading, or even merely using the Platform, you shall be contracting with Mealawe and signify your acceptance to the Terms of Use and other policies (including but not limited to the Cancellation & Refund Policy, Privacy Policy, and Take Down Policy) as posted on the Platform from time to time, which takes effect on the date on which you download, install or use the Services, and create a legally binding arrangement to abide by the same. You may not use the Services if you do not accept the Terms or are unable to be bound by the Terms. Your use of the Platform is at your own risk, including the risk of data theft, virus attack, or that you might be exposed to content that is objectionable, or otherwise inappropriate.',
      '"Users/Buyers" means a person who has signed up and is registered with Mealawe for the use or potential use/purchase of the Goods/Services.',
      '"Vendor/Home Chef/Merchants" means a food and beverage supplier or business or establishment having sole responsibility for providing food and beverage services registered with Mealawe.',
      '"Meals" means home food and beverages i.e. Indian Cuisine, Bakery Items, Pickles, Juices, etc. prepared by the Home chef who is registered on the application.',
      'Mealawe enables delivery of Meal/Food Orders or completion of Tasks at select localities serviceable across Pune ("Delivery Services") by connecting third-party service providers i.e. pick-up and delivery partners who will be responsible for providing the pick-up and delivery services and completing Tasks initiated by the users of the Platform (Buyers or Merchants). The Platform Services and Delivery Services are collectively referred to as "Services". For both Platform Services and Delivery Services, Mealawe is merely acting as an intermediary between the Merchants and Users/Buyers and/or pick-up & delivery partners and Buyers/Merchants.',
      'Pick-up & delivery partners are individual entrepreneurs engaged with Mealawe on a voluntary, non-exclusive, and principal to principal basis to provide the aforementioned services for a service fee. Pick-up & delivery partners are independent contractors and are free to determine their timings of work. Mealawe does not exercise control over the pick-up & delivery partners and the relationship between the Pick-up & delivery partners and Mealawe is not that of an agent and principal or employee and employer.',
      'For the pickup and delivery services and completing the Tasks, pick-up & delivery partners may charge the users of the Platform (Buyers or Merchants), a service fee (inclusive of applicable taxes whenever not expressly mentioned) determined on the basis of various factors including but not limited to distance covered, time taken, demand for delivery services/Tasks, real time analysis of traffic and weather conditions, seasonal peaks or such other parameters as may be determined from time to time.',
    ],
  },
  {
    heading: 'Eligibility to Use the Services',
    paragraphs: [
      'You hereby represent and warrant that you are at least eighteen (18) years of age or above and are fully able and competent to understand and agree to the terms, conditions, obligations, affirmations, representations, and warranties set forth in these Terms. You further declare that you are in compliance with all laws and regulations in the locality/state/country in which you live when you access and use the Services. You agree to use the Services only in compliance with these Terms and applicable law, and in a manner that does not violate our legal rights or those of any third party(ies).',
    ],
  },
  {
    heading: 'Registration',
    paragraphs: [
      'You may have to create an account in order to use some of the features offered by the platform, including without limitation to specific pages for Home Chefs on the Platform. Use/storage of any personal information you provide to us during the account creation process is governed by our Privacy Policy. You are always and solely responsible for all activities that occur in your account. You agree to notify us immediately of any unauthorized use of your account in order to enable us to take necessary corrective action. In creating an account, you represent to us that all information provided to us in such a process is true, accurate, and correct and that you will update your information as and when necessary in order to keep it accurate. You may not impersonate someone else, create or use an account for anyone other than yourself, provide an email address other than your own, create multiple accounts or Home Chef listings except as otherwise authorized by us, or provide or use false information to obtain access to the platform that you are not legally entitled to claim. You acknowledge that any false claim may result in substantial losses or damage to Mealawe or third parties, for which you may be held liable and accountable.',
      'There are 2 types of orders that can be given by users: Daily Order — food order is placed on a daily basis which is instant during breakfast, lunch, high tea, or dinner time. Advance Order — food orders can be placed a maximum of 2 days in advance.',
    ],
  },
  {
    heading: 'Terms of Use',
    paragraphs: [
      'By using Mealawe mobile application, Users are accepting the below-specified Terms of Use-',
      'All commercial/contractual terms are offered by Home Chef and agreed to, is between Buyers and Home Chefs alone. The commercial/contractual terms include without limitation price, taxes, shipping costs, payment methods, payment terms, date, period, and mode of delivery, warranties related to products and services, and after-sales services related to products and services. Mealawe does not have any control or does not determine or advise or in any way involve itself in the offering or acceptance of such commercial/contractual terms between the Buyers and Home chefs.',
      'Once a Customer places an order on Mealawe mobile application, the Home Chef must confirm the order, whereby he/she commits to the details of said placed order. Mealawe will not be liable for any discrepancies that may arise thereafter.',
      'Mealawe will not be responsible for any loss incurred by Customers due to any actions of the Home Chefs including the non-performance of the orders.',
      "We disclaim any and all liability to the Customer for the supply of the Food Delivery, Goods, and Services to the fullest extent permissible under applicable law. This does not affect the Customer's statutory rights as a consumer.",
      "The User/Buyer agrees and acknowledges that Mealawe shall not be responsible for: the services or goods provided by the Vendors including but not limited to serving of food Orders suiting your requirements and taste; the Vendor's services or goods, or services provided by pick-up & delivery partners not being up to Buyer expectations or leading to any loss, harm or damage to him/her; the availability or unavailability of certain items on the menu; the Vendor serving the incorrect Orders; or product liability of goods provided by Vendors.",
      'The images and descriptions that are available against menu items on the platform do not represent the actual dish preparation. Actual delivered food item might differ in visual representation, description, etc. The user must keep it in mind while ordering any food item on Mealawe platform.',
      'The details of the menu and price list available on the Platform with respect to home kitchen services, goods or any other services are based on the information provided by the Vendors/Merchants and Mealawe shall not be responsible for any change or cancellation or unavailability.',
      'Buyers and Merchants agree and acknowledge that Mealawe is not responsible for any liability arising out of delivery services provided by pick-up & delivery partners to them.',
      "Buyers may not be able to avail Services if their delivery location is outside Mealawe's current scope of Service. Mealawe will keep the Buyer informed of the same at the time of confirming his/her Order booking.",
      "Buyer understands that delivery time quoted at the time of confirming the Order is an approximate estimate and may vary based on the information obtained from pick-up & delivery partners and Merchants. Mealawe will not be responsible for any delay in the delivery of an Order.",
      "Buyer's Order will be only delivered to the address designated by him/her at the time of placing the Order on the Platform. Buyer's Order will be canceled in the event of any change of the address as informed by the pick-up & delivery partners and Buyer shall not be entitled to any refund for the same. Delivery of goods and services in the event of change of the delivery location shall be subject to acceptance by the pick-up & delivery partners or sole discretion of Mealawe.",
      'The Buyer shall undertake to provide adequate directions, information and authorizations to accept delivery. In the event of no delivery due to any act or omission attributable to Buyer, the goods or services shall be deemed to have been delivered to the Buyer and all risk and responsibility in relation thereto shall pass to the Buyer without being entitled to any refund.',
      "The Buyer understands that Mealawe's (including Merchant's and pick-up & delivery partner's) liability ends once Order has been delivered to him/her, except where the product liability of the Merchant subsists.",
      'If you use the Platform, you do the same at your own risk.',
      'Buyer agrees that the Services shall be provided through the Platform only during the working hours of the relevant Merchants and pick-up & delivery partners.',
    ],
  },
  {
    heading: 'Cancellation Policy',
    paragraphs: ['Refer "refunds & cancelation" policy section.'],
  },
  {
    heading: 'Privacy Policy',
    paragraphs: [
      'Mealawe collects personal information from you when you order goods or services from Mealawe website. Mealawe also collects information when you complete any customer survey.',
      'Information that Mealawe collects from you is used to process your order and to manage your account. Mealawe may also use your information to email you about other products or services that Mealawe thinks may be of interest to you.',
      'You represent that you have read understood and agreed to Mealawe Privacy Policy. Please note that Mealawe may disclose information about you to third parties or government authorities if Mealawe believe that such disclosure is reasonably necessary to: take action regarding suspected illegal activities; enforce or apply our Terms and Privacy Policy; comply with legal process or other government inquiry, such as a search warrant, subpoena, statute, judicial proceeding, or other legal processes/notice served on us; or protect our rights, reputation, and property, or that of our users, affiliates, or the general public.',
    ],
  },
  {
    heading: 'Jurisdiction of Law',
    paragraphs: [
      'In case of any dispute regarding the privacy policy of Mealawe, an arbitrator shall be appointed to ascertain the rights and liabilities of the parties.',
      'You further accept that all disputes are subject to laws applicable in the State of Maharashtra, India, and subject to jurisdictions of courts in the State of Maharashtra, India only.',
    ],
  },
];
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no new errors (this file isn't imported by anything yet — that's Task 18).

---

### Task 18: Replace the WebView in `TermsSheet` with the native content

**Files:**
- Modify: `src/features/auth/components/TermsSheet.tsx`

- [ ] **Step 1: Replace the whole file**

Read the current `src/features/auth/components/TermsSheet.tsx` first (its `TermsSheetHandle` interface and `present()` imperative-handle pattern must stay byte-identical, since `login.tsx` depends on that exact shape — `const termsSheetRef = useRef<TermsSheetHandle>(null); ... termsSheetRef.current?.present();`). Replace its content with:
```tsx
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheetView, type BottomSheetModal } from '@gorhom/bottom-sheet';

import { AppSheet } from '@/components/ui/AppSheet';
import { AppText } from '@/components/ui/AppText';
import { IconClose } from '@/components/ui/icons';
import { useColors } from '@/theme';

import { TERMS_SECTIONS } from './termsContent';

const SNAP_POINTS = ['92%'];

export interface TermsSheetHandle {
  present: () => void;
}

/**
 * Terms & Conditions as an in-app sheet, rendering copy bundled with the app
 * (see `termsContent.ts`) instead of loading `mealawe.com/terms` in a
 * WebView. The live page is a heavy WordPress/Divi page carrying third-party
 * Cloudflare Turnstile + reCAPTCHA scripts for an unrelated contact form on
 * the same page — WebView's load-complete signals never reliably fired for
 * it (confirmed: sheet opened but the content area stayed blank/spinner-stuck),
 * and an earlier attempt to load it via injected static HTML instead of live
 * `uri` navigation was already tried and reverted for the same reason. A
 * native render sidesteps the problem entirely: instant, no network
 * dependency, 100% reliable. Trade-off: legal-copy edits now need an app
 * release instead of being editable server-side — see the design spec's
 * Part 4 for the alternative if that becomes a real problem.
 */
export const TermsSheet = forwardRef<TermsSheetHandle, object>(function TermsSheet(_props, ref) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const sheetRef = useRef<BottomSheetModal>(null);

  useImperativeHandle(ref, () => ({
    present: () => {
      sheetRef.current?.present();
    },
  }));

  return (
    <AppSheet ref={sheetRef} snapPoints={SNAP_POINTS}>
      <BottomSheetView style={{ flex: 1, paddingBottom: insets.bottom }}>
        <View className="flex-row items-center justify-between px-5 pb-3 pt-1">
          <AppText variant="h3" className="text-foreground">
            Terms &amp; Conditions
          </AppText>
          <Pressable
            onPress={() => sheetRef.current?.dismiss()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={10}
            className="h-8 w-8 items-center justify-center rounded-full active:opacity-70"
            style={{ backgroundColor: colors.muted }}>
            <IconClose size={16} color={colors.foreground} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 32 }}>
          {TERMS_SECTIONS.map((section) => (
            <View key={section.heading} style={{ gap: 8 }}>
              <AppText variant="label" weight="bold" className="text-foreground">
                {section.heading}
              </AppText>
              {section.paragraphs.map((p, i) => (
                <AppText key={i} variant="bodySm" className="text-muted-foreground">
                  {p}
                </AppText>
              ))}
            </View>
          ))}
        </ScrollView>
      </BottomSheetView>
    </AppSheet>
  );
});
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no new errors. `login.tsx` needs no changes — it only calls `termsSheetRef.current?.present()`, which is unchanged.

Run: `npx expo export --platform android -c`
Expected: export succeeds (the `react-native-webview` import is gone from this file — confirm no other file still needs it removed as a dependency; leave the package installed since `marketplace.tsx` still uses it elsewhere, per the design spec's explicit "not touching WebView usage elsewhere" scope note).

---

## Final verification

- [ ] **Full typecheck**

Run: `npx tsc --noEmit`
Expected: clean, zero errors, across the whole repo.

- [ ] **Full export sanity check**

Run: `npx expo export --platform android -c`
Expected: succeeds.

- [ ] **Manual smoke test (device/emulator required — flag to the user if unavailable in this environment)**

1. Fresh app state (clear storage or fresh install): confirm cold launch still routes through `LocationSplash` normally.
2. With a saved address near the device's current GPS position and `current` pointing at an unsaved location: relaunch the app, confirm `current` silently switches to the saved address (Part 1).
3. On `subscription-configure.tsx`, `cart.tsx`, `on-demand-cart.tsx`, and `bulk-cart.tsx`: attempt checkout with only an unsaved current-location address active — confirm each is blocked with a message, and confirm the scroll (subscription-configure/cart) or navigation-to-`/addresses` (on-demand/bulk) recovery action (Part 2).
4. Apply a coupon with `offerAppliedOn: 'billAmount'` and one with `discountOnDelivery: true` (create test coupons via the dashboard/backend if none exist) — confirm the bill math matches the design spec's rules (Part 3).
5. Attempt to reapply a `oneTimeOneUser` coupon on an account that has already used it — confirm it's rejected with the server's message (Part 3).
6. Open Terms & Conditions from the login screen — confirm it renders instantly with no spinner (Part 4).

Per the project's standing convention (`docs/TESTING-WORKFLOW.md`), author/update Maestro flows under `.maestro/flows/` and `scripts/generate-test-catalogue.mjs` covering the six scenarios above — not detailed step-by-step here since Maestro flow authoring depends on reading the current selector conventions in `.maestro/flows/cart-coupon-and-wallet.yaml` and similar existing flows at execution time (they may have changed further under the concurrent redesign work noted at the top of this plan).

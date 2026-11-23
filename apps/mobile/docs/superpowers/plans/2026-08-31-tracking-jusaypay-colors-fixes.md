# Tracking Redesign, JusPay Bulk Fix, and Color Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four independent fixes/improvements to MealaweUserAppRN: (1) fix the live
order-tracking map's rendering jank and redesign its status card + push
notification to match the reference (Swiggy-style progress bar + deep link), (2)
fix bulk checkout so JusPay actually opens (root-caused: the request body is
missing fields the backend's validator requires), (3) fix the dine-in bottom CTA
strip rendering brand green instead of dine-in's own accent color, (4) change the
splash screen and location-detecting background to `#30B34A` and drop the splash
logo.

**Architecture:** Tasks 1-3 are one cohesive change (tracking screen); Tasks 4-6
are independent, unrelated fixes that can be done in any order. Each task is
separately verifiable and committable.

**Tech Stack:** React Native (Expo SDK 57), `react-native-maps`, `@notifee/react-native`,
Zustand, existing `payWithJusPay`/backend JusPay contract.

**Specs:** `docs/superpowers/specs/2026-08-31-tracking-screen-redesign-design.md`
(Tasks 1-3). Tasks 4-6 are direct bug fixes / fully-specified changes with no
separate design doc, per the debugging skill's process (root cause already
confirmed by investigation, documented per-task below) and the user's literal,
unambiguous specification (exact hex color, exact behavior).

**Verification convention (no unit tests in this project):** every code task is
verified with `npx tsc --noEmit`. UI changes need on-device or Maestro visual
confirmation where noted. **Commit step:** each task below includes a `git commit`
step per this repo's normal convention — **for this specific execution, skip
that step and leave the changes uncommitted instead.** The user asked to review
diffs before anything is committed. Report the diff instead of running `git commit`.

---

### Task 1: Map performance — stop re-rendering the map every 7 seconds

**Root cause (confirmed by code inspection, no fix without this):** `trackingStore.ts:80`
calls `set({riderPhone, riderName})` unconditionally on every 7s poll tick even
when nothing changed, forcing every unguarded subscriber to re-render;
`order-tracking.tsx`/`order-detail.tsx` consume the whole store with no selector,
so this cascades into a full-screen (and full-map) re-render every ~7s; none of
`TrackingMap`'s three `Marker`s set `tracksViewChanges={false}`, so — combined with
the above — react-native-maps continuously re-snapshots each custom marker's React
subtree to a native bitmap every ~7s, a well-documented major Android jank source.

**Files:**
- Modify: `src/features/tracking/trackingStore.ts`
- Modify: `src/features/tracking/components/TrackingMap.tsx`
- Modify: `src/app/order-tracking.tsx`
- Modify: `src/app/order-detail.tsx`

- [ ] **Step 1: Guard the `riderPhone`/`riderName` update in `trackingStore.ts`**

In `pollLocation` (around line 72-85), replace the unconditional `set` with a
shallow-compare guard:

```ts
    const pollLocation = async () => {
      const result = await fetchRunnerLocation(
        params.orderId,
        params.shiftId,
        params.deliveryTaskId,
        params.deliveryVendor,
      );
      if (activeOrderId !== params.orderId) return;
      const current = get();
      if (current.riderPhone !== result.riderPhone || current.riderName !== result.riderName) {
        set({ riderPhone: result.riderPhone, riderName: result.riderName });
      }
      if (!result.location) return;
      const { routePath } = get();
      const snapped = routePath.length >= 2 ? snapToRoute(result.location, routePath) : result.location;
      set({ runnerLocation: snapped, status: 'active' });
    };
```

Note: `runnerLocation`/`status` still update on every tick — that's correct and
intentional (the marker needs the fresh position every poll to glide via
`animateMarkerToCoordinate`; `TrackingMap`'s own logic in Step 3 already avoids
re-rendering on this specific field via the `initialRunnerLocation` latch pattern
it already has).

- [ ] **Step 2: Switch to per-field selectors in `order-tracking.tsx`**

Replace the whole-store destructure (line 23):
```ts
  const { start, stop, runnerLocation, routePath, etaText, status } = useTrackingStore();
```
with individual selectors:
```ts
  const start = useTrackingStore((s) => s.start);
  const stop = useTrackingStore((s) => s.stop);
  const runnerLocation = useTrackingStore((s) => s.runnerLocation);
  const routePath = useTrackingStore((s) => s.routePath);
  const etaText = useTrackingStore((s) => s.etaText);
  const status = useTrackingStore((s) => s.status);
```

- [ ] **Step 3: Switch to per-field selectors in `order-detail.tsx`**

Same pattern at the `useTrackingStore()` call around line 254 — read the current
destructured field list at that call site and convert each to
`useTrackingStore((s) => s.<field>)`. Do not change any other logic in this
function.

- [ ] **Step 4: Memoize `TrackingMap.tsx` and stop marker re-snapshotting**

Wrap the component export in `React.memo` (add `import { memo, useMemo } from 'react';`
alongside the existing React import, or extend the existing `useEffect, useRef, useState`
import from `'react'` to also pull `memo`/`useMemo`):

```ts
export const TrackingMap = memo(function TrackingMap({ destination, pickup, runnerLocation, routePath, height = 320 }: TrackingMapProps) {
```
(closing the component with `});` instead of the current closing `}` — check the
existing named-export style elsewhere in this file/repo for `memo`-wrapped
components and match it; if none exists, `export const TrackingMap = memo(function TrackingMap(...) {...});`
is the standard pattern.)

Memoize the polyline coordinates (replace the inline `.map` at lines 106-112):
```ts
  const polylineCoords = useMemo(() => routePath.map(toMapLatLng), [routePath]);
  // ...
  {routePath.length >= 2 && (
    <Polyline
      coordinates={polylineCoords}
      strokeColor="#4986E7"
      strokeWidth={4}
    />
  )}
```

Memoize the destination/pickup `LatLng` conversions and the bearing:
```ts
  const destinationLatLng = useMemo(() => toMapLatLng(destination), [destination]);
  const pickupLatLng = useMemo(() => (pickup ? toMapLatLng(pickup) : null), [pickup]);
  const rotation = useMemo(
    () => (runnerLocation ? bearingDegrees(runnerLocation, destination) : 0),
    [runnerLocation, destination],
  );
```
Use `destinationLatLng`/`pickupLatLng` in place of the inline `toMapLatLng(destination)`/
`toMapLatLng(pickup)` calls in the three `<Marker coordinate={...}>` props.

Add `tracksViewChanges={false}` to all three `<Marker>` elements (destination,
pickup, runner) — this is safe because the destination/pickup markers are static
once mounted and the runner marker updates imperatively via
`animateMarkerToCoordinate`, never via a `coordinate` prop change after mount:
```tsx
        <Marker coordinate={destinationLatLng} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <MapMarkerBadge icon={IconMapPin} color={palette.accent.location} size={40} />
        </Marker>

        {pickup && !initialRunnerLocation && pickupLatLng && (
          <Marker coordinate={pickupLatLng} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <MapMarkerBadge icon={IconUtensils} color={palette.accent.food} size={36} />
          </Marker>
        )}

        {initialRunnerLocation && (
          <Marker
            ref={markerRef}
            coordinate={toMapLatLng(initialRunnerLocation)}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}>
            <RunnerMarkerIcon rotation={rotation} />
          </Marker>
        )}
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit
```
Expected: clean. On-device (or via Maestro if a tracking flow exists — check
`.maestro/flows/` for an order-tracking flow): open `/order-tracking` during an
active delivery, watch the map for ~30s. Expected: no visible stutter when the 7s
poll fires (compare subjectively against pre-change behavior, or add a temporary
`console.log` render counter in `TrackingMap` to confirm the render count drops
from ~1 per 7s to ~1 per 30s once `routePath` is the only thing actually changing).

- [ ] **Step 6: Commit** (skipped for this execution — leave uncommitted, report the diff for review)

```bash
git add src/features/tracking/trackingStore.ts src/features/tracking/components/TrackingMap.tsx src/app/order-tracking.tsx src/app/order-detail.tsx
git commit -m "fix: stop unnecessary re-renders causing tracking map jank"
```

---

### Task 2: Status card redesign

**Files:**
- Modify: `src/app/order-tracking.tsx`

- [ ] **Step 1: Restructure the ETA/status card**

Replace the status card block (lines 54-94) to promote the ETA into a colored pill
and move "Address & instructions" into the card as its own row, using only
existing tokens/components (`AppText`, `AccentIcon`, `palette`, `accentTint` — the
same pattern `cart.tsx`'s bill card and savings banner already use for a colored
pill treatment):

```tsx
import { accentTint } from '@/theme';
// (add to the existing '@/theme' import if not already there)

// ...

        <View className="rounded-2xl border border-border bg-card p-4" style={{ gap: 12 }}>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3" style={{ flex: 1 }}>
              <AccentIcon icon={IconClock} tone="info" size={17} tileSize={36} />
              <View className="flex-1">
                <AppText variant="h3" className="text-foreground">
                  {status === 'loading' ? 'Locating your order…' : etaText ? 'On the way' : 'Preparing your order'}
                </AppText>
                <AppText variant="caption" className="text-muted-foreground">
                  {status === 'loading' ? 'Hang tight…' : 'We’ll notify you at every step'}
                </AppText>
              </View>
            </View>
            {etaText ? (
              <View
                className="rounded-xl px-3 py-2"
                style={{ backgroundColor: accentTint(palette.accent.veg, 0.14) }}>
                <AppText variant="label" style={{ color: palette.accent.veg }}>
                  {etaText}
                </AppText>
              </View>
            ) : null}
          </View>

          {target.runnerName ? (
            <View className="flex-row items-center gap-3" style={{ borderTopWidth: 1, borderTopColor: palette.neutral.gray200, paddingTop: 12 }}>
              <AccentIcon icon={IconUser} tone="reward" size={19} tileSize={40} />
              <View className="flex-1">
                <AppText variant="caption" className="text-muted-foreground">
                  Delivery partner
                </AppText>
                <AppText variant="body" className="text-foreground">
                  {target.runnerName}
                </AppText>
              </View>
              {target.runnerPhone ? (
                <Button
                  label="Call"
                  variant="outline"
                  size="sm"
                  leftIcon={<IconPhone size={16} color={palette.brand.green} />}
                  onPress={() => Linking.openURL(`tel:${target.runnerPhone}`).catch(() => {})}
                />
              ) : null}
            </View>
          ) : null}

          <Button
            label="Address & instructions"
            variant="outline"
            block
            onPress={() => router.push('/help' as Href)}
          />
        </View>
```

Note: "Address & instructions" reuses the existing `/help` destination the old
"Need help with this order?" button used — there's no dedicated address/instructions
screen or data in `target` to show something more specific; this keeps the label
matching the reference's affordance without inventing a screen that doesn't exist.
Remove the now-redundant separate "Need help with this order?" button below the
card (lines 96-102) since its function is now folded into this row — or keep both
if a genuinely separate "help" destination distinct from "address & instructions"
is wanted; **default to removing the duplicate** unless it's clearly still useful
on inspection of the rendered screen.

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```
Expected: clean. On-device: confirm the card renders correctly in both `loading`
and `active` states, with and without a `runnerName`/`runnerPhone`.

- [ ] **Step 3: Commit** (skipped for this execution — leave uncommitted, report the diff for review)

```bash
git add src/app/order-tracking.tsx
git commit -m "feat: redesign order-tracking status card with ETA pill"
```

---

### Task 3: Rich tracking notification — progress bar + Track Order deep link

**Files:**
- Modify: `src/features/tracking/riderTrackingNotification.ts`
- Modify: `src/app/order-tracking.tsx`
- Modify: `src/services/push/notifications.ts`

- [ ] **Step 1: Add a `TRACK_ORDER_ACTION_ID` and include `orderId` in notification data**

In `riderTrackingNotification.ts`, add the new action id constant next to the
existing one (line 20):
```ts
export const CALL_RIDER_ACTION_ID = 'call-rider';
/** Action ID for the notification's "Track Order" button — always present
 * (unlike "Call rider", which needs a known `riderPhone`). Read back in the
 * foreground/background event handlers in `services/push/notifications.ts`. */
export const TRACK_ORDER_ACTION_ID = 'track-order';
```

Update `displayRiderTrackingNotification` to always include `orderId` in `data`
(currently only `riderPhone` is included, and only when present — line 58) and add
the new action:
```ts
  await notifee.displayNotification({
    id: notificationIdFor(orderId),
    title: etaText ? `Arriving in ${etaText}` : 'Tracking your order',
    body: status ?? 'Tracking your delivery…',
    data: { orderId, ...(riderPhone ? { riderPhone } : {}) },
    android: {
      channelId: TRACKING_CHANNEL_ID,
      ongoing: true,
      autoCancel: false,
      onlyAlertOnce: true,
      visibility: AndroidVisibility.PUBLIC,
      pressAction: { id: 'default' },
      style: subText
        ? { type: AndroidStyle.BIGTEXT, text: status ?? 'Tracking your delivery…', summary: subText }
        : undefined,
      progress: progress != null ? { max: 100, current: Math.max(0, Math.min(100, progress)) } : undefined,
      actions: [
        { title: 'Track Order', pressAction: { id: TRACK_ORDER_ACTION_ID } },
        ...(riderPhone ? [{ title: 'Call rider', pressAction: { id: CALL_RIDER_ACTION_ID } }] : []),
      ],
    },
  });
```

- [ ] **Step 2: Populate `progress` from `order-tracking.tsx`'s notification call**

This screen has no per-order lifecycle status (only GPS tracking `status`:
`idle`/`loading`/`active`/`error` — it's reached only during the out-for-delivery
stage, matching `order-detail.tsx`'s own `isOutForDeliveryStage` gate at
`statusStepIndex(...) === 4`). Reuse the same fixed step position rather than
inventing a new progress model — import `ORDER_STEPS` from `@/features/orders`
(add to the existing `useOngoingTrackingNotification`/`TrackingMap` import block's
sibling import, or add a new import line) and compute a fixed value:

```ts
import { ORDER_STEPS } from '@/features/orders';

// ... inside the component, before the hook call:
  const OUT_FOR_DELIVERY_STEP = 4;
  const trackingProgress = ((OUT_FOR_DELIVERY_STEP / (ORDER_STEPS.length - 1)) * 100);

  useOngoingTrackingNotification(target?.params.orderId, etaText, status, target?.runnerPhone, {
    statusText: status === 'loading' ? 'Locating your order…' : 'On the way',
    progress: trackingProgress,
  });
```

- [ ] **Step 3: Handle the "Track Order" action and notification-body tap in `notifications.ts`**

Add the import (alongside the existing `CALL_RIDER_ACTION_ID` import at line 21-23):
```ts
import {
  CALL_RIDER_ACTION_ID,
  TRACK_ORDER_ACTION_ID,
  displayRiderTrackingNotification,
  scheduleStalenessCancel,
} from '@/features/tracking/riderTrackingNotification';
```

Add a helper next to `callRiderFromNotificationData` (after line 78):
```ts
/** Navigates to the live tracking screen for the order this notification is
 * for. Works whenever the app process is still alive (backgrounded, not
 * killed) — `useTrackingTargetStore`'s target is populated by the home
 * screen's own open-order tracking bar and persists in memory across a
 * background/foreground transition. A cold start from a killed app falls
 * back to `order-tracking.tsx`'s own existing redirect to `/orders` (no
 * `target` set yet) — the same best-effort limitation `openRelevantScreen`
 * already accepts for order-status pushes, not a new gap. */
function trackOrderFromNotificationData(data: Record<string, unknown> | undefined): void {
  const orderId = data?.orderId;
  if (typeof orderId === 'string' && orderId) {
    router.push('/order-tracking');
  }
}
```

Update `initPush`'s `notifee.onForegroundEvent` (lines 188-202) to handle the new
action and a body-press on the tracking notification:
```ts
  notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === CALL_RIDER_ACTION_ID) {
      callRiderFromNotificationData(detail.notification?.data as Record<string, unknown> | undefined);
      return;
    }
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === TRACK_ORDER_ACTION_ID) {
      trackOrderFromNotificationData(detail.notification?.data as Record<string, unknown> | undefined);
      return;
    }
    if (type === EventType.PRESS && detail.notification) {
      if (detail.notification.title === ORDER_STATUS_TITLE) {
        useRefreshBumpStore.getState().bumpOrders();
        router.push('/my-orders');
        return;
      }
      if (typeof detail.notification.id === 'string' && detail.notification.id.startsWith('order-tracking-')) {
        trackOrderFromNotificationData(detail.notification.data as Record<string, unknown> | undefined);
      }
    }
  });
```

Update `registerBackgroundHandler`'s `notifee.onBackgroundEvent` (lines 236-244)
the same way:
```ts
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === CALL_RIDER_ACTION_ID) {
      callRiderFromNotificationData(detail.notification?.data as Record<string, unknown> | undefined);
      return;
    }
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === TRACK_ORDER_ACTION_ID) {
      trackOrderFromNotificationData(detail.notification?.data as Record<string, unknown> | undefined);
      return;
    }
    if (type === EventType.PRESS && detail.notification?.title === ORDER_STATUS_TITLE) {
      useRefreshBumpStore.getState().bumpOrders();
      return;
    }
    if (
      type === EventType.PRESS &&
      typeof detail.notification?.id === 'string' &&
      detail.notification.id.startsWith('order-tracking-')
    ) {
      trackOrderFromNotificationData(detail.notification?.data as Record<string, unknown> | undefined);
    }
  });
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```
Expected: clean. On-device: start a live-tracking session, background the app,
confirm the notification shows a progress bar and a "Track Order" button; tap it
(and separately, tap the notification body) and confirm the app opens directly to
`/order-tracking` for that order, from both a backgrounded (not killed) app state.
Note in the report if a killed-app cold-start test was or wasn't performed (known,
accepted limitation either way — see Step 3's comment).

- [ ] **Step 5: Commit** (skipped for this execution — leave uncommitted, report the diff for review)

```bash
git add src/features/tracking/riderTrackingNotification.ts src/app/order-tracking.tsx src/services/push/notifications.ts
git commit -m "feat: add progress bar and Track Order deep link to tracking notification"
```

---

### Task 4: Fix bulk JusPay checkout (root cause: incomplete request body)

**Root cause (HIGH confidence, confirmed by static code reading across client +
backend, see full investigation for the complete evidence chain):**
`bulk-cart.tsx`'s `pay()` builds a `BulkOrderBody` that never includes
`bulkItemAmount` (or other charge-breakdown fields). The backend's
`bulkFoodordervalidation()` (`MealaweServerApp/src/util/order-validation-util.js:605-610`)
computes `itemAmount` from the item list and compares it to
`foodOrder.bulkItemAmount` — which is `undefined` on every bulk request today, so
`itemAmount !== undefined` is always `true` and the order is rejected as invalid,
every single time, before a JusPay session is ever created. `payWithJusPay` catches
this as an HTTP 500 and returns `{status:'failed'}` **before** `HyperSdkReact.process()`
is ever called — this is the literal mechanism of "JusPay is not opening": the SDK
is never invoked because order creation fails first.

**Files:**
- Modify: `src/services/payment/orderTypes.ts`
- Modify: `src/app/bulk-cart.tsx`

- [ ] **Step 1: Add the missing fields to `BulkOrderBody`**

In `orderTypes.ts`, extend the `BulkOrderBody` interface (lines 148-164):
```ts
export interface BulkOrderBody extends JusPayCustomer {
  orderType: BulkOrderType;
  amount: number;
  /** Injected by `payWithJusPay` — omit when building the body. */
  orderCreatedBy?: OrderCreatedBy;
  customerLocation: CustomerLocation;
  itemList: BulkItemForOrder[];
  /** Sum of `itemPrice * count` across `itemList` — the backend's
   * `bulkFoodordervalidation` reconciles this against its own recomputation
   * and rejects the order if it doesn't match (root cause of bulk checkout
   * silently failing before this field was added — see design/plan notes). */
  bulkItemAmount: number;
  /** Flat per-order packaging charge (or per-box override for Food Box
   * Customized mode) — the backend reads this as `packagingCostByUser`. */
  packagingCostByUser: number;
  /** Delivery charge for this order's quantity slab. */
  finalBulkDelCharges: number;
  /** Platform charge for this order. */
  finalBulkPlatformCharges: number;
  deliveryDate?: string;
  slotStartTime?: string;
  slotEndTime?: string;
  discount: number;
  taxes: number;
  couponCode?: string;
  couponDiscount?: number;
  moneyWalletPointsUsed: number;
  mealaweWalletPointsUsed: number;
}
```

- [ ] **Step 2: Populate the new fields in `bulk-cart.tsx`'s `pay()`**

The values map 1:1 onto `BulkBill` (`src/features/bulk/bill.ts`)'s already-computed
fields, which `bill` (already in scope in `pay()`) already provides. Update the
`body` construction (lines 222-245):

```ts
      const body: BulkOrderBody = {
        orderType: bulkOrderType(cart.category, cart.packaging),
        amount: bill.toPay,
        customerId: profile._id,
        customerName: profile.userName ?? '',
        customerEmail: profile.email ?? '',
        customerPhoneNo: profile.phoneNo,
        customerLocation: customerLocationFrom(address),
        itemList: cart.lines.map((l) => ({
          itemId: l.item._id,
          itemName: l.item.itemName,
          itemPrice: l.itemPrice,
          count: l.count,
        })),
        bulkItemAmount: bill.subTotal,
        packagingCostByUser: bill.packaging,
        finalBulkDelCharges: bill.delivery,
        finalBulkPlatformCharges: bill.platform,
        deliveryDate: date ?? undefined,
        slotStartTime: slot?.start,
        slotEndTime: slot?.end,
        discount: bill.discount,
        taxes: bill.taxes,
        couponCode: cart.coupon?.couponCode,
        couponDiscount: cart.coupon?.discount,
        moneyWalletPointsUsed: bill.moneyWalletUsed,
        mealaweWalletPointsUsed: bill.cashbackUsed,
      };
```

- [ ] **Step 3: Verify against the backend's actual validator once more before considering this done**

Read `MealaweServerApp/src/util/order-validation-util.js` lines 588-644
(`bulkFoodordervalidation`) again against this new payload — confirm
`bulkItemAmount` now matches what the backend recomputes (`itemAmount` from
`itemList`), and that the `totalOrderAmt`/`tamt` check later in that function
(line 625-641) also reconciles with these new fields (it reads
`foodOrder.bulkItemAmount`/`packagingCostByUser`/delivery/platform charges in its
own sum — confirm the field names match exactly, character for character, since a
mismatched name is silently `undefined` server-side, not a type error).

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```
Expected: clean. This is a regression-test-shaped fix with no unit test framework
in this project — the closest available verification is an actual on-device bulk
checkout attempt hitting the real (or staging) backend, confirming JusPay's payment
screen actually opens and, ideally, a full order completes. If on-device testing
isn't available in this pass, report this explicitly as unverified beyond static
analysis (per the investigation's own noted uncertainty) rather than claiming it's
fixed without having seen it work.

- [ ] **Step 5: Commit** (skipped for this execution — leave uncommitted, report the diff for review)

```bash
git add src/services/payment/orderTypes.ts src/app/bulk-cart.tsx
git commit -m "fix: send bulkItemAmount and charge fields so bulk JusPay checkout validates"
```

---

### Task 5: Dine-in bottom CTA strip — use dine-in's own accent color

**Root cause (confirmed):** `BottomOverlayStack.tsx`'s `CtaSlideCard` hardcodes
`bg-primary` (brand green, `#63ab45`) with no override mechanism —
`BottomCtaSlide` (the data shape `DineInHome.tsx` populates) has no `tone` field at
all, unlike every other dine-in-aware component in this app (`cart.tsx`,
`PlanCard.tsx`, `order-result.tsx`, `subscription-configure.tsx`'s own "Review &
pay" button), which all correctly use `tone="food"` (`palette.accent.food`,
`#f97316`) for dine-in. A second instance of the same bug class exists in
`subscription-configure.tsx`'s date-picker chips, which aren't gated on
`context.isDineIn` at all.

**Files:**
- Modify: `src/features/orders/bottomCtaStore.ts`
- Modify: `src/features/orders/components/BottomOverlayStack.tsx`
- Modify: `src/features/dine-in/components/DineInHome.tsx`
- Modify: `src/app/subscription-configure.tsx`

- [ ] **Step 1: Add a `tone` field to `BottomCtaSlide`**

In `bottomCtaStore.ts`, extend the interface (lines 5-10):
```ts
import type { AccentTone } from '@/theme';

/** A feed's sticky CTA (Subscribe / Continue), pre-formatted so the store
 * carries no currency/label logic of its own. */
export interface BottomCtaSlide {
  priceLabel: string;
  subtitle: string;
  buttonLabel: string;
  onPress: () => void;
  /** Overrides the card's default brand-green background/accent — e.g.
   * `'food'` for Dine In, matching every other dine-in-aware CTA in the app. */
  tone?: AccentTone;
}
```

- [ ] **Step 2: Use `cta.tone` in `CtaSlideCard`**

In `BottomOverlayStack.tsx` (lines 214-236), replace the hardcoded `bg-primary`
class and `palette.brand.green` icon color with a tone-aware resolution, mirroring
`Button.tsx`'s existing `variant === 'primary' && tone ? palette.accent[tone] : undefined`
pattern:

```tsx
function CtaSlideCard({ cta }: { cta: BottomCtaSlide }) {
  const bgColor = cta.tone ? palette.accent[cta.tone] : palette.brand.green;
  return (
    <View style={[shadow.card, { backgroundColor: bgColor }]} className="flex-row items-center justify-between rounded-2xl px-4 py-3">
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="h3" className="text-white" numberOfLines={1}>
          {cta.priceLabel}
        </AppText>
        <AppText variant="caption" className="text-white" style={{ opacity: 0.9 }} numberOfLines={1}>
          {cta.subtitle}
        </AppText>
      </View>
      <Pressable
        onPress={cta.onPress}
        accessibilityRole="button"
        className="flex-row items-center gap-2 rounded-2xl bg-white px-6 py-3 active:opacity-90">
        <AppText variant="label" style={{ color: bgColor }}>
          {cta.buttonLabel}
        </AppText>
        <IconArrowRight size={18} color={bgColor} />
      </Pressable>
    </View>
  );
}
```
(Removed the `bg-primary` NativeWind class in favor of an inline `backgroundColor`
since the color is now dynamic — NativeWind classes can't take a runtime value.)

- [ ] **Step 3: Pass `tone: 'food'` from `DineInHome.tsx`**

In the `setCta` call (lines 105-110):
```ts
      setCta(CTA_OWNER_KEY, {
        priceLabel: `₹${finalPrice(selectedPkg)}`,
        subtitle: `Dine In · ${selectedPkg.days} days`,
        buttonLabel: 'Continue',
        onPress: () => continueToConfigure(selectedPkg),
        tone: 'food',
      });
```

- [ ] **Step 4: Fix the second instance — `subscription-configure.tsx`'s date chips**

Gate the hardcoded `palette.brand.green` references at lines 243-244 and 257 on
`context.isDineIn`, matching the pattern already used elsewhere in this same file
(e.g. the "Review & pay" button's `tone={context.isDineIn ? 'food' : undefined}`):

```tsx
                style={{
                  width: 64,
                  borderRadius: RADIUS.md,
                  paddingVertical: 12,
                  alignItems: 'center',
                  borderWidth: active ? BORDER_WIDTH.emphasis : BORDER_WIDTH.hairline,
                  borderColor: active ? (context.isDineIn ? palette.accent.food : palette.brand.green) : colors.border,
                  backgroundColor: active
                    ? accentTint(context.isDineIn ? palette.accent.food : palette.brand.green, 0.08)
                    : colors.card,
                  opacity: c.enabled ? 1 : 0.4,
                }}
```
and the selected-badge dot at line 257:
```tsx
                      backgroundColor: context.isDineIn ? palette.accent.food : palette.brand.green,
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit
```
Expected: clean. On-device: open the Dine In tab, confirm the sticky bottom CTA
strip renders in orange (`palette.accent.food`) instead of green; open
`subscription-configure` for a Dine In package, confirm the date chips also use
orange for their active state; open `subscription-configure` for a **regular**
subscription package, confirm the date chips still render green (regression check
— the fix must not accidentally recolor the non-dine-in case).

- [ ] **Step 6: Commit** (skipped for this execution — leave uncommitted, report the diff for review)

```bash
git add src/features/orders/bottomCtaStore.ts src/features/orders/components/BottomOverlayStack.tsx src/features/dine-in/components/DineInHome.tsx src/app/subscription-configure.tsx
git commit -m "fix: use dine-in's own accent color instead of brand green for its bottom CTA and date chips"
```

---

### Task 6: Splash screen color + logo removal, location-fetch background color

**Files:**
- Modify: `app.json`
- Modify: `src/features/location/components/LocationGate.tsx`

- [ ] **Step 1: Change the splash background color**

In `app.json`'s `expo-splash-screen` plugin config, change `backgroundColor` from
`#016937` to `#30B34A` in both the top-level and `dark` blocks:
```json
      [
        "expo-splash-screen",
        {
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 180,
          "resizeMode": "contain",
          "backgroundColor": "#30B34A",
          "dark": {
            "image": "./assets/images/splash-icon.png",
            "backgroundColor": "#30B34A"
          }
        }
      ],
```

- [ ] **Step 2: Remove the splash logo**

`splash-icon.png` is the dedicated logo asset shown on the splash screen (distinct
from `icon.png`/`android-icon.png`). "Remove the logo" means the splash screen
shows only the background color, no mark. The cleanest way within `expo-splash-screen`'s
plugin API (which always needs an `image`, even a 1x1 transparent one, to avoid
falling back to the app icon) is to replace `assets/images/splash-icon.png` with a
fully transparent 1x1 PNG:

```bash
node -e "
const fs = require('fs');
// A minimal valid 1x1 transparent PNG, base64-encoded.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
fs.writeFileSync('assets/images/splash-icon.png', png);
"
```
Verify the file was overwritten (`git diff --stat assets/images/splash-icon.png`
should show a binary diff, not "no changes"). If the team prefers keeping the
original file for reference and using a different empty asset instead, flag this
as an open question rather than deleting/losing the original — but replacing it is
the direct interpretation of "remove logo from splash screen."

- [ ] **Step 3: Scope the `#30B34A` background to the location-detecting state only**

Per the user's explicit choice, do NOT touch the shared `bg-background` token
(would repaint the whole app). Wrap `LocationGate`'s root `View` (line 30-31) with
the new color instead — applies to the whole gate (both the pre-detect "Set your
delivery location" prompt and the active "Detecting your location…" spinner state,
since they're the same component/screen with no separate route or state boundary
between them):

```tsx
    <View className="items-center gap-3 px-6 py-10" style={{ backgroundColor: '#30B34A' }}>
```

Note: the existing icon/spinner color (`palette.brand.green`, `#63ab45`) and text
colors inside this component were not designed against a green background — check
the rendered result on-device/in a preview for contrast (white spinner circle
background `bg-muted` may need a lighter/white override, and `text-foreground`/
`text-muted-foreground` body text may not have enough contrast against
`#30B34A`). If contrast looks poor, adjust the inner elements' colors (e.g. force
white text/icons within this specific screen) rather than shipping an
unreadable state — this is a visual judgment call to make while looking at the
actual rendered screen, not something to guess blindly from code.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```
Expected: clean. On-device: cold-launch the app, confirm the splash screen shows
the `#30B34A` background with no logo mark visible. Open `/addresses` with no
saved address yet, confirm `LocationGate` renders on the new green background with
legible text/icons, both before and during an active GPS detect.

- [ ] **Step 5: Commit** (skipped for this execution — leave uncommitted, report the diff for review)

```bash
git add app.json src/features/location/components/LocationGate.tsx assets/images/splash-icon.png
git commit -m "feat: update splash and location-detecting background to #30B34A, remove splash logo"
```

---

## Self-review notes

**Spec coverage:** every requested item has a task — tracking screen redesign
(Tasks 1-3, backed by its own design spec), bulk JusPay fix (Task 4, backed by the
completed root-cause investigation), dine-in color fix (Task 5, includes the bonus
`subscription-configure.tsx` instance the user didn't explicitly mention but which
is the same confirmed bug class), splash/location colors + logo removal (Task 6).
Rating screen explicitly excluded per the user's own scoping decision.

**Placeholder scan:** no TBD/TODO. Task 6 Step 2's "flag as an open question" and
Step 3's "adjust ... rather than shipping an unreadable state" are intentional
judgment-call callouts for a visual outcome that can only be assessed by looking at
the rendered screen — not vague fix-it-later language for something knowable in
advance.

**Type consistency:** `BulkOrderBody`'s three new fields (Task 4) are read
consistently in Task 4 Step 2's `body` construction, matching the interface added
in Step 1 field-for-field. `BottomCtaSlide.tone` (Task 5) uses the existing
`AccentTone` type already defined in `@/theme` (used throughout the app for this
exact purpose — `Button.tsx`, `AccentIcon.tsx`) rather than inventing a new type.

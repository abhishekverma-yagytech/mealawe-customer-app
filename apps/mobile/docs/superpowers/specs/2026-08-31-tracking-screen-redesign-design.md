# Live Order Tracking — Redesign, Performance, and Notification Design Spec

## Goal

Bring `order-tracking.tsx` up to the reference bar (Swiggy's order-tracking map
screen): a fluid, non-janky map and a clear bottom status card, plus a rich push
notification with a progress bar and a "Track Order" action that deep-links back
into this exact screen. Scope is the live-tracking experience only — **the
post-delivery rating screen from the reference is explicitly out of scope** (this
app has no rating feature anywhere today; building one is a separate, later
project, not a tracking-screen tweak).

## Current state (traced in full, see research findings)

`order-tracking.tsx` already has a map + ETA card + "Need help" link. The map
(`TrackingMap.tsx` on `react-native-maps` + `PROVIDER_GOOGLE`) already animates the
rider marker natively via `animateMarkerToCoordinate` rather than React re-renders —
that part is sound. The actual jank comes from six compounding issues, all upstream
of the map component itself:

1. `trackingStore.ts:80` calls `set({riderPhone, riderName})` unconditionally on
   every 7s poll tick, even when nothing changed — a fresh object every time forces
   every subscriber to re-render.
2. `order-tracking.tsx:23` (and `order-detail.tsx:246`) consume
   `useTrackingStore()` with no selector — the whole screen re-renders on every tick.
3. `TrackingMap.tsx` isn't wrapped in `React.memo` — its full JSX tree (MapView + 3
   Markers + Polyline) re-executes every ~7s regardless of whether props changed.
4. `routePath.map(toMapLatLng)` (line 106-112) allocates a new array every render,
   unmemoized — expensive when `routePath` can be hundreds of decoded points.
5. **None of the three `Marker`s set `tracksViewChanges={false}`** — this is the
   single biggest concrete suspect. Custom-view markers default to continuously
   re-snapshotting their React subtree to a native bitmap on every re-render, a
   well-documented major Android jank source, and combined with (1)-(3) this fires
   every ~7s indefinitely.
6. Destination/pickup marker coordinates and the bearing calculation are
   recomputed inline every render instead of memoized.

The tracking notification already has progress-bar and rich-text infrastructure
(`riderTrackingNotification.ts`'s `android.progress`/`AndroidStyle.BIGTEXT`) — it's
just never fed a `title`/`progress` from `order-tracking.tsx`'s call site (only
`order-detail.tsx` populates it today). No tap-to-deep-link handling exists for it
at all (`notifications.ts`'s press handlers only recognize "Call rider" and the
`'Order Status'` title).

## Approach

### 1. Map performance — fix the re-render source, not just the symptom

Per the Iron Law (no fixes without root cause): the fix is not "throttle the map,"
it's "stop re-rendering things that didn't change."

- `trackingStore.ts`: guard the `riderPhone`/`riderName` update with a shallow
  comparison before calling `set()` — skip the state update entirely when neither
  value changed.
- `order-tracking.tsx` and `order-detail.tsx`: switch from whole-store
  `useTrackingStore()` to per-field selectors (`useTrackingStore((s) => s.status)`,
  etc.) — a change to one field no longer re-renders consumers that only read
  others.
- `TrackingMap.tsx`: wrap the component in `React.memo`; memoize the mapped
  polyline coordinates, the destination/pickup `LatLng` objects, and the bearing
  calculation with `useMemo`.
- All three `Marker`s: add `tracksViewChanges={false}`. This is safe because the
  rider marker already updates via imperative `animateMarkerToCoordinate` (not a
  prop change), and the destination/pickup markers are static once mounted — none
  of them need continuous re-snapshotting.

Net effect: the map only actually re-renders when `routePath` changes (every 30s,
not 7s) or the rider marker's *initial* position is set — matching the smooth,
native-driven motion the reference app has.

### 2. Status card — restructure within existing design tokens

Reshape `order-tracking.tsx`'s status section to read closer to the reference:
a colored ETA pill (top-right, using the existing `accentTint`/`palette` pattern
this app already uses elsewhere — e.g. `cart.tsx`'s savings banner), a bold status
headline ("Preparing your order" / "On the way", sourced from the existing
`status`/`etaText` state — no new data needed), and the existing "Address &
instructions" affordance promoted into the card rather than a separate link below
it. This is a layout/typography pass using `AppText`, `AccentIcon`, and this app's
own palette — not an import of Swiggy's visual branding (colors, fonts, iconography
stay this app's own, per `DESIGN.md`).

### 3. Rich tracking notification + deep link

- `order-tracking.tsx`'s `useOngoingTrackingNotification` call: pass `title` (order
  title/kitchen name, already available via `target`) and `progress` (derive from
  `status`, mirroring `order-detail.tsx`'s existing `statusStepIndex(...)`-based
  calculation — reuse that helper rather than inventing a second progress model).
- `riderTrackingNotification.ts`: add a `TRACK_ORDER_ACTION_ID` action (same
  pattern as the existing `CALL_RIDER_ACTION_ID`), always present (unlike "Call
  rider" which is gated on `riderPhone` being known).
- `notifications.ts`: add a case to both `notifee.onForegroundEvent` and
  `notifee.onBackgroundEvent` for `TRACK_ORDER_ACTION_ID` (and for a bare press on
  the notification body, which currently falls through to nothing for this
  notification type) that navigates to `/order-tracking` with the order's params —
  matching the existing `callRiderFromNotificationData` pattern's shape, not a new
  architecture.

## Explicitly out of scope

- Post-delivery rating screen (no backend support exists; separate future project).
- iOS Live Activity layout changes (`liveActivity.tsx`) — the reference is
  Android-first (Swiggy's Android notification); iOS Live Activity's own polish is
  a separate concern with its own constraints (ActivityKit template limits).
- Reworking the polling architecture itself (7s/30s intervals, REST polling vs. a
  push-driven model) — the six fixes above solve the actual jank without touching
  that; a bigger architecture change isn't warranted by this request.

## Testing

No unit tests in this project. Verify with `npx tsc --noEmit`, then on-device: watch
the map during an active delivery for smooth marker motion with no visible
stutter/frame drops when the 7s poll fires (compare before/after by temporarily
logging render counts if the difference isn't obvious by eye), confirm the
notification shows a progress bar with the order title, and confirm tapping
"Track Order" (and the notification body) opens `/order-tracking` for the correct
order from both foreground and backgrounded app states.

# Live Order Tracking — Map, Lock Screen & Dynamic Island

**Project:** MealaweUserAppRN (Expo SDK 57 · RN 0.86 · React 19.2 · Expo Router)
**Reference implementation:** `MealaweUserApp` (Ionic/Angular) — `track-open-order` +
`map-route-display` components
**Status:** Planning — no code written yet

---

## 1. What exists today

### MealaweUserApp (Ionic/Angular) — the behavioural reference

- **Map SDK:** Google Maps JS SDK via `google-maps` npm loader
  (`src/service/google-map.service.ts`).
- **Data flow:** pure HTTP **polling**, no sockets/Firebase for rider position.
  - `src/app/track-open-order/track-open-order.component.ts` polls open orders every
    10 min, computes ETA with `google.maps.DistanceMatrixService`, gates the "Track
    Order" CTA on ETA < 1 hour.
  - `src/app/map-route-display/map-route-display.component.ts` (modal) refreshes rider
    position every **60s** via `apiMainService.trackDeliveryTask(deliveryTaskId, partner)`.
- **Rendering:** `DirectionsService` draws the route polyline once; each new rider
  fix is **snapped onto that polyline** (`snapToRoute()`, 75 m tolerance), then the
  marker is moved with `setPosition()` + `panTo()` — an instant jump every 60s, not
  eased — and rotated via CSS `transform: rotate()` from
  `google.maps.geometry.spherical.computeHeading`.
- **No** background location, no persistent/ongoing notification, no Live Activity
  equivalent. Tracking only runs while the map modal is open in the foreground.

### MealaweUserAppRN — current state

- `react-native-maps 1.27.2` is installed but only used in the address picker
  (`src/features/location/components/LocationPicker.tsx`), not for tracking.
- `expo-location ~57.0.5` is installed for the user's own GPS; `app.json` already has
  a Google Maps API key configured for both platforms.
- `src/app/order-detail.tsx` + `src/features/orders/orderStatus.ts` have a **static**
  status-stepper timeline already ported from the Ionic app's status vocabulary
  (`deliveryBoyAssigned`, `onTheWay`, `outForDelivery`, …) — no map, no live position.
- **Nothing exists yet** for notifications, background tasks, or sockets
  (`expo-notifications`, `notifee`, `expo-task-manager`, `socket.io-client` — none
  installed).
- Native project is **managed/CNG**: `android/` and `ios/` are git-ignored, regenerated
  by `expo prebuild`. No custom native code is committed today.

This is a from-scratch feature on the RN side, with a working reference to port the
map/UX logic from.

---

## 2. Target experience (Zomato/Swiggy-style)

1. **In-app map screen** — rider marker moves smoothly along the route, ETA updates,
   ability to call rider / support.
2. **Persistent Android notification** — ongoing, non-dismissible-while-active
   notification showing status + ETA + a small map/progress visual, updated in place
   (not a stack of new notifications) as the order progresses.
3. **iOS Lock Screen + Dynamic Island** — a Live Activity showing the same status/ETA,
   live-updating on the Lock Screen, in the Dynamic Island (compact + expanded), and
   pinned in the StandBy view, without the user opening the app.

These three are **increasingly expensive** to build — see phased plan below.

---

## 3. Phased plan

### Phase 1 — In-app live map tracking (RN, no native work beyond what's installed)

Port the Ionic logic to `react-native-maps`, upgrading the visuals along the way:

- **Screen:** `src/app/order-tracking/[id].tsx` (or a modal route), fed by a new
  `src/features/tracking/trackingStore.ts` (Zustand) + `trackingService.ts`.
- **Route + ETA:** call Google **Directions API** server-side or client-side, decode
  the polyline with `@mapbox/polyline`, render as `<Polyline>`; use Directions'
  `duration_in_traffic` for ETA instead of `DistanceMatrixService` (same account,
  better accuracy).
- **Position updates:** start with the same REST polling endpoint
  (`trackDeliveryTask`) the Ionic app already uses, but poll every **5–10s** while
  the tracking screen is focused (foreground-only, cheap, no backend change required
  to ship Phase 1).
- **Smooth marker motion (the biggest visible upgrade vs. the Ionic app):** the Ionic
  app snaps instantly every 60s. Replace with client-side interpolation:
  - `AnimatedRegion` (built into `react-native-maps`) or a custom `Animated.ValueXY`
    tween between the last two known fixes over the polling interval, so the marker
    glides continuously instead of jumping.
  - Compute bearing for icon rotation with `geolib` (`getRheumbLineBearing` /
    `getGreatCircleBearing`) instead of the Maps JS geometry library.
  - Snap-to-route logic ports almost directly (pure math, no Google-specific API).
- **Rider/customer/restaurant markers:** reuse existing SVG assets
  (`runnerIcon.svg`, `location_red_map.svg`) as `react-native-svg` components.

**Libraries (Phase 1):**

| Package | Purpose | Notes |
|---|---|---|
| `react-native-maps` | already installed (1.27.2) | map + markers + polyline |
| `@mapbox/polyline` | decode Google Directions polyline | tiny, no native code |
| `geolib` | bearing/distance helpers | pure JS |
| `react-native-svg` | already installed (via icons.tsx) | rider/marker icons |

No Expo config plugin changes needed — this phase runs in the existing dev client.

### Phase 2 — Android ongoing/rich tracking notification

Zomato/Swiggy keep a single notification alive and update it in place, driven by the
**backend**, not client polling (Android kills background JS timers aggressively).

- **Backend change (required):** the order service needs to push a **data-only FCM
  message** on each meaningful rider update (or every ~15–20s while `onTheWay`),
  containing status, ETA, and rider lat/lng. This is server work, not RN — flag it to
  backend early since it's on the critical path.
- **Client:**
  - `@notifee/react-native` to build/update the notification: single fixed
    notification ID per order so re-posting **updates** it instead of stacking; ongoing
    (non-swipeable) while `onTheWay`; Android big-picture/custom layout for a small
    static map snapshot (Google Static Maps API) or a progress-style bar; action
    buttons ("Call rider", "Track").
  - Firebase Cloud Messaging as the push transport. Since this project has no push
    stack yet, use `@react-native-firebase/app` + `@react-native-firebase/messaging`
    (matches what the Ionic app already uses server-side —
    `MyFirebaseMessagingService.java` — so the backend integration is unchanged) rather
    than `expo-notifications`, because notifee's background data-message → notification
    update path is documented/maintained against RNFB, and `expo-notifications` doesn't
    give the same control over ongoing/updatable Android notifications.
  - A background/headless JS handler
    (`messaging().setBackgroundMessageHandler`) receives the data message and calls
    `notifee.displayNotification()` with the same notification ID to update it.

**Libraries (Phase 2):**

| Package | Purpose |
|---|---|
| `@notifee/react-native` | rich/ongoing Android notification, update-in-place |
| `@react-native-firebase/app`, `@react-native-firebase/messaging` | FCM transport (data messages), background handler |

Requires an Expo config plugin (`@react-native-firebase/app`'s plugin +
`@notifee/react-native` needs no plugin) and a dev-client rebuild
(`expo prebuild` → `npm run android`) — cannot be tested in Expo Go.

### Phase 3 — iOS Lock Screen + Dynamic Island (Live Activities)

This is the hard, genuinely native part — plan the schedule accordingly.

**Why it's different from Phase 2:** Dynamic Island / Lock Screen live content on iOS
is **ActivityKit** (iOS 16.1+), not a notification. It requires:

1. A **Widget Extension target** in the iOS project with a SwiftUI view
   (`ActivityConfiguration`) defining the Lock Screen, compact/expanded/minimal
   Dynamic Island layouts, and (iOS 17+) StandBy layout.
2. Starting the Activity from the device (`Activity.request(...)`) when the order
   enters `onTheWay`, and updating it either locally or via **push updates** —
   Zomato/Swiggy-style live ETA ticking down without the app running requires
   **ActivityKit push updates**, which means APNs with the special
   `apns-push-type: liveactivity` header, a **push-to-start token** and per-activity
   **update token**, both of which the device must register with the backend.
3. Ending the Activity when the order is delivered/cancelled.

**Expo compatibility:** managed/CNG workflow is *not* broken by this — a widget
extension target is added through an **Expo config plugin** (`withXcodeProject`,
target creation, entitlements, `Info.plist` mods) so it's regenerated on every
`expo prebuild` rather than hand-edited in Xcode. But it does mean:
- The SwiftUI widget UI is still hand-written native Swift/SwiftUI code, checked into
  the repo (e.g. `plugins/live-activity/ios/` + a config plugin that copies/links it
  into the generated Xcode project during prebuild).
- **Cannot run in Expo Go** or a generic dev client — needs a custom **EAS
  development build** including the widget extension, and Live Activities can only be
  tested on a physical device or the iOS 16.1+ Simulator (Simulator can't do real APNs
  push updates, only local `Activity.update()`).
- Apple Developer Program enrollment + explicit capability
  (`com.apple.developer.usernotifications.live-activities` / ActivityKit entitlement)
  on the App ID, plus an APNs auth key capable of `liveactivity` push type.

**Library: `expo-widgets`** (implemented — see `src/features/tracking/liveActivity.tsx` +
`useDeliveryLiveActivity.ts`). This is Expo's own first-party module (part of the
`expo/expo` monorepo, `repository.url: expo/expo`), not a community package —
`expo-live-activity` (the package originally considered here) is now **fully
deprecated** as of every published version including its alphas; its own README
points directly at `expo-widgets` as the replacement. `react-native-live-activities`
is abandoned (last published 2022). Neither should be used.

Unlike a hand-rolled bridge, `expo-widgets` lets the **Live Activity layout be
written in JSX** (`createLiveActivity(name, layoutFn)`, where `layoutFn` returns a
`LiveActivityLayout` — `banner`/`compactLeading`/`compactTrailing`/`minimal`/
`expandedCenter` etc., each a `ReactNode` built from `@expo/ui/swift-ui` primitives
like `VStack`/`HStack`/`Text` — already a dependency in this project). The function
body needs a `'widget'` directive as its first statement (like `'use strict'`) so the
config plugin's build-time transform can extract it during prebuild — no hand-written
Swift file needed. The same package also covers home-screen widgets
(`createWidget`/`Widget.updateSnapshot`), including an **experimental** `enableAndroid`
config flag that unifies both platforms behind one API — see
`docs/PLATFORM-NATIVE-FEATURES-PLAN.md` Phase A.

Config plugin (`app.json`): `groupIdentifier` (App Group for widget data sharing),
`enablePushNotifications` (needed for the APNs update-token path below),
`widgets: [{ name, displayName, description }]` — the `name` must match the string
passed to `createLiveActivity`/`createWidget` exactly. Verified end-to-end via
`npx expo config --type public`: the plugin correctly auto-generates the EAS Build
`experimental.ios.appExtensions` entry (extension target + App Group entitlement) —
confirms the config wiring is correct, though the actual native rendering still needs
a real device/EAS build to verify (unavailable from this environment).

**Backend change (required, larger than Phase 2):**
- Store push-to-start token (registered once per device, doesn't need an active
  Activity) and, once an Activity starts, its per-activity update token.
- On each rider update, send an APNs push (`liveactivity` type) with the new
  content state (status, ETA, rider progress) — separate code path from the existing
  FCM/Android push, since this is Apple-only and uses APNs directly (or via Firebase's
  `NotificationsIOS`/APNs passthrough, but Live Activity pushes have stricter payload
  requirements FCM doesn't model well — a direct APNs HTTP/2 client, e.g. `node-apn`
  or `@parse/node-apn`, is the safer path if the backend is Node).
- End-of-life handling: send a final push with `dismissal-date` so the Activity clears
  itself when the order completes, matching how Zomato/Swiggy's tracking activity
  disappears right after delivery.

**No Android equivalent exists** — Android's Dynamic-Island-like features are just
the Phase 2 rich notification (and, optionally, a **Live Update** notification style
on Android 16+ / a **foreground service** notification for stronger persistence
guarantees); there's no separate "island" API to target on Android.

---

## 4. Cross-cutting backend work (flag early — not RN-side)

| Need | Used by |
|---|---|
| Faster/pushed rider position (FCM data message on each update) | Phase 2 & 3 |
| Device token registration endpoint (FCM token + APNs push-to-start token) | Phase 2 & 3 |
| APNs Live Activity push sender (update + end) | Phase 3 |
| ETA calculation already exists server-side or reuse Directions API | Phase 1 |

Phase 1 ships with **zero backend changes** (reuses the existing `trackDeliveryTask`
REST endpoint at higher poll frequency). Phases 2–3 cannot ship without backend work,
so scope/estimate those with backend involved from day one.

---

## 5. Testing & rollout notes

- No unit-test suite in this project (per `CLAUDE.md`) — verify via
  `npx expo export --platform android -c` / `npx tsc --noEmit`, then manual + Maestro
  E2E for the tracking screen flow (`.maestro/`).
- Any native dependency (Phase 2's Firebase/notifee, Phase 3's widget extension)
  requires `expo prebuild` + a fresh dev-client install — plan for rebuild time in
  each phase, not just Phase 3.
- Phase 3 needs a **paid Apple Developer account**, a **physical iOS 16.1+ device**
  for real push-update testing, and EAS Build (managed builds won't include a custom
  widget extension unless the config plugin is wired into `eas.json`'s build profile).
- Suggested sequencing: ship Phase 1 alone first (visible, low-risk improvement over
  the Ionic app's jumpy marker), then Phase 2 (Android parity with Zomato/Swiggy),
  then Phase 3 (iOS parity) once backend APNs support is ready — these are
  independently shippable, not a single big-bang release.

---

## 6. Full package list

| Package | Phase | Platform | Notes |
|---|---|---|---|
| `react-native-maps` | 1 | both | already installed |
| `@mapbox/polyline` | 1 | both | new |
| `geolib` | 1 | both | new |
| `@notifee/react-native` | 2 | Android (iOS local notifs too, but not Live Activities) | new |
| `@react-native-firebase/app` | 2 | both | new |
| `@react-native-firebase/messaging` | 2 | both | new |
| `expo-widgets` | 3 | iOS (Android widget support experimental, opt-in) | new — first-party, installed |
| *(server)* `node-apn` / `@parse/node-apn` or equivalent | 3 | backend | for Live Activity APNs pushes |

---

## 7. Open decisions for you

1. **Phase 2 push transport:** confirm it's fine to add the RNFB (`@react-native-firebase/*`)
   stack alongside/instead of `expo-notifications`, since it's the better-supported
   path for updatable Android notifications — this is the one place the RN app's push
   stack will diverge from a "pure Expo" approach.
2. **Phase 3 library choice:** resolved — `expo-widgets` (first-party, installed).
   Remaining open item: whether to enable its experimental `enableAndroid` widget
   flag project-wide (currently on in `app.json`) or fall back to
   `react-native-android-widget` if that experimental path proves unstable —
   see `docs/PLATFORM-NATIVE-FEATURES-PLAN.md` Phase A.
3. **Rollout order:** confirm shipping Phase 1 → 2 → 3 independently (recommended)
   rather than waiting to ship all three together.
4. **Backend APNs work still pending:** the JS-side start/update/end lifecycle is
   implemented (`useDeliveryLiveActivity.ts`), but it only covers foreground/local
   updates. Push-based updates while the app is backgrounded/killed still need the
   backend work described above (push-to-start + update token storage, APNs sender) —
   not something this repo can implement alone.

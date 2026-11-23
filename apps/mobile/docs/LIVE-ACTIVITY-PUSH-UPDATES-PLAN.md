# Live Activity Push Updates — Implementation Plan

**Date:** 2026-08-25
**Scope:** Two repos — `MealaweUserAppRN` (client) and `MealaweServerApp` (backend).
Closes the one real gap in the existing Live Activity implementation
(`docs/LIVE-ORDER-TRACKING-PLAN.md` Phase 3): today the Dynamic Island/Lock
Screen content only updates while the app is open in the foreground. This
plan makes it keep ticking while the app is backgrounded or killed — the
actual Zomato/Swiggy-style behavior.
**Status:** Proposal for review — no changes made yet.

This plan is grounded in the real code in both repos, not generic ActivityKit
tutorial content — every claim below cites the actual file/line it comes from.

---

## 1. Executive summary

The client-side Live Activity is real and working (`src/features/tracking/liveActivity.tsx`
+ `useDeliveryLiveActivity.ts`), but it's foreground-only — it calls
`.update()` from a React effect, which only runs while the JS engine is
alive. The missing piece is **ActivityKit push updates**: Apple's mechanism
for updating a Live Activity's content from a server via APNs, independent
of whether the app is running.

Two things make this easier than it might sound:

1. **`expo-widgets` already exposes the two tokens needed** —
   `addPushToStartTokenListener()` and `addPushTokenListener()`
   (confirmed by reading `node_modules/expo-widgets/src/Widgets.ts:132,223`).
   This was the biggest open technical risk before this investigation; it's
   resolved. Nothing needs a native Swift patch on the client side.
2. **The backend already has an equivalent throttled push pipeline for the
   exact same trigger** — rider location updates. `updateRunnerLocation` in
   `MealaweServerApp/src/service/foodorder.service.js:970-1013` already
   pushes an FCM data message on every rider location ping, throttled to
   once per 15 seconds per order (`RIDER_LOCATION_PUSH_MIN_INTERVAL_MS`,
   line 968). This plan adds a second push (APNs, not FCM) alongside it —
   it does not invent a new trigger mechanism.

The real net-new work is: two small token-registration endpoints, one new
APNs sender (the backend has no APNs library today — it sends FCM via a raw
HTTP v1 + OAuth2 client, `src/util/fcm-message-handler.js`, not the
`firebase-admin` SDK), and a dedicated Apple credential that doesn't exist
yet.

---

## 2. Current state (evidence-based)

### Client (`MealaweUserAppRN`)

| Piece | State | Evidence |
|---|---|---|
| Live Activity layout | Done | `src/features/tracking/liveActivity.tsx` — full Dynamic Island states (banner/compact/minimal/expanded) |
| Start/update/end hook | Done, foreground-only | `src/features/tracking/useDeliveryLiveActivity.ts` — starts on `onTheWay`, updates via effect, ends on unmount |
| Wired into the tracking screen | Done | `src/app/order-detail.tsx:302-308` |
| Push-to-start token API | **Available, unused** | `addPushToStartTokenListener()`, fires `{ activityPushToStartToken }` — `node_modules/expo-widgets/src/Widgets.ts:223`, `Widgets.types.ts:239-244` |
| Per-activity update token API | **Available, unused** | `addPushTokenListener()`, fires `{ activityId, pushToken }` — `Widgets.ts:132`, `Widgets.types.ts:225-234` |
| Existing FCM device-token registration (pattern to follow) | Done | `src/services/push` (`registerDeviceToken`, called from `_layout.tsx`) |

### Backend (`MealaweServerApp`)

| Piece | State | Evidence |
|---|---|---|
| Stack | Node/Express, MongoDB (DocumentDB) | `package.json` |
| Push transport today | Raw FCM HTTP v1 + OAuth2 (`googleapis`), **not** `firebase-admin` | `src/util/fcm-message-handler.js`, `src/util/http-api-handler.js` |
| APNs library | **None installed** | `package.json` has no `node-apn`/`apn`/`firebase-admin` |
| Device token storage | Separate collection, keyed `profileId` + `type` | `src/model/fcmCloudMessage.model.js`, `src/dao/fcmCloudMessage.dao.js`, `src/service/fcmCloudMessage.service.js` |
| Rider-location push trigger (the pattern to extend) | Done, throttled | `foodorder.service.js:970-1013` — `updateRunnerLocation()`, 15s throttle via `src/util/notification-throttle.util.js`'s in-memory `canSend()`, sends `sendRiderLocationFcmMessage(orderId, orderNo, customerId, lat, lng, riderPhone, stage, distanceMeters)` |
| Order-status push trigger | Done | `updateOrderStatus` route (`src/route/foodorder.route.js:151`) → service → `orderStatusMapper` in `fcm-message-handler.js:12-29` (per-status copy, includes `onTheWay`/`delivered`/`cancelled*`) |
| Existing Apple credential | ASC **API key**, for App Store Connect submissions only | `docs/CI-CD-RELEASE-GUIDE.md` §8.3/§4.3 — **not** usable for APNs push; a Live Activity push needs a separate APNs **Auth Key** with the Live Activities capability |

**Multi-worker caveat — verified, not hypothetical.** `server.js:1-77`: this
app already runs Node's native `cluster` module in both staging and
production, forking one worker **per CPU core**
(`clusterWorkerSize = os.cpus().length`) whenever
`PRODUCTION === 'true' || STAGING === 'true'` and more than one CPU is
available. `notification-throttle.util.js`'s `canSend()` is an in-memory
`Map` — each of those worker *processes* has its own independent copy, with
no shared state between them.

This is worse than "the throttle is N× too permissive." Because a load
balancer round-robins incoming `updateRunnerLocation` requests across
workers, **consecutive pings for the same order don't reliably land on the
same worker** — so a given worker's own `lastSentAt` entry for
`rider-loc:${orderId}` can be stale (or simply absent) even when a sibling
worker sent a push for that same order half a second ago. The real-world
throttle guarantee is weaker than "at most every 15s per order"; in the
worst case it degrades toward "at most every 15s *per worker that happens to
handle this order's pings*." This already affects today's FCM rider-location
push, not something this plan introduces — but this plan's APNs addition
would inherit the same gap, and Apple's APNs infrastructure does its own
rate-limiting/coalescing per topic+token, so needlessly duplicate pushes
have a real (if small) cost there too.

**Fix, and it's cheap:** `MealaweServerApp` already has a live, connected
Redis client — `redis@3.1.2`, `src/config/redis.config.js`'s `getClient()`,
already used elsewhere (session store via `connect-redis`, per
`routeConfig.js`). Swap `canSend()`'s in-memory `Map` for a Redis
`SET key value EX <seconds> NX` (atomic set-if-not-exists-with-expiry — the
standard distributed-throttle primitive): the call succeeds (returns `OK`)
only for the first caller within the window, across *every* worker. No new
infrastructure, no new dependency — just changing what backs one utility
function. Worth doing as part of this plan rather than after, since the new
APNs hook (§3.5) is the second consumer of the same throttle key and doubles
the value of fixing it now instead of inheriting it twice.

---

## 3. Proposed design

### 3.1 New Apple credential (blocking, do this first) — **Key created**

A dedicated **APNs Auth Key** (`.p8`), generated at
developer.apple.com/account/resources/authkeys, with the **Apple Push
Notifications service (APNs)** capability enabled — separate from the App
Store Connect API key already documented in `docs/CI-CD-RELEASE-GUIDE.md`
§8.3. Needs: Key ID, Team ID, and the bundle ID must have the **Live
Activities** capability enabled on its App ID
(developer.apple.com/account/resources/identifiers).

| Field | Value |
|---|---|
| Key ID | `RU2UFBX7SX` |
| Team ID | `9UG32G8N3S` (same team as the existing ASC credentials) |
| Bundle ID | `com.mealawe.app` |

**Remaining before this is usable:**
- Confirm the **Live Activities** capability is actually checked on the
  `com.mealawe.app` App ID (a Key having the APNs capability and an App ID
  having the Live Activities capability are two separate toggles — both are
  required).
- The `.p8` file itself is only downloadable **once** from Apple — if it
  hasn't been saved yet, do that now. It's private key material, not an
  identifier like the Key ID above — treat it exactly like the Play Store
  service account key (`docs/CI-CD-RELEASE-GUIDE.md` §4.2 step 4): never
  commit it, base64-encode it, store it as a secret.
- This credential is consumed by **`MealaweServerApp`** (§3.4's APNs
  sender), not by this repo's CI — it doesn't belong in
  `MealaweUserAppRN`'s `eas-release.yml` or `eas.json`. It needs a home in
  `MealaweServerApp`'s own secret/env storage (whatever that project already
  uses for `serviceAccountKey-mealawe.json`-style credentials).

### 3.2 Backend: new token model

New collection, `liveActivityToken` — deliberately **not** reusing
`fcmCloudMessage` (different lifecycle: a push-to-start token is stable
per-device like an FCM token, but an update token is per-*activity-instance*
and gets replaced every time a new Live Activity starts, occasionally
rotates mid-activity per Apple's docs).

```js
{
  profileId: ObjectId,          // matches fcmCloudMessage's keying
  pushToStartToken: String,     // stable per device; upsert on each app boot
  activeActivityId: String,     // expo-widgets' activityId for the current activity
  activityUpdateToken: String,  // replaced whenever activityId changes
  updatedAt: Date,
}
```

### 3.3 New backend endpoints

Two, following the existing `fcmCloudMessage` route/service/dao pattern
exactly:

- `POST /api/liveactivity/registerPushToStart` — `{ profileId, pushToStartToken }`. Called once per app boot on iOS (mirrors where `registerDeviceToken` already fires for FCM).
- `POST /api/liveactivity/registerUpdateToken` — `{ profileId, activityId, pushToken }`. Called whenever the client's `addPushTokenListener` fires.
- Both are plain upserts — no new DAO patterns needed beyond what `fcmCloudMessage.dao.js` already demonstrates.

### 3.4 New backend service: APNs Live Activity sender

Given the backend's existing preference for a raw HTTP client over an SDK
wrapper (that's exactly how FCM is done — `http-api-handler.js`, not
`firebase-admin`), the natural fit is Node's built-in `http2` module against
`api.push.apple.com:443` (`api.sandbox.push.apple.com` for
development-signed builds), JWT-signed per Apple's token-based APNs auth
(`jsonwebtoken`, already likely available transitively — confirm during
implementation) using the new `.p8` key. This avoids adding `node-apn` as a
dependency for what's a fairly small amount of protocol logic, and keeps the
codebase's existing "thin HTTP wrapper, no SDK" style for push. (If that
JWT-signing code turns out fiddly, `node-apn` is the documented fallback —
noted as a decision point in §4.)

Required headers per Apple's spec: `apns-topic: com.mealawe.app.push-type.liveactivity`,
`apns-push-type: liveactivity`, `apns-priority: 10`. Payload shape must match
the RN-side `DeliveryActivityProps` exactly (`restaurantName`, `statusLabel`,
`etaText`) inside `aps.content-state`, plus `aps.event: "update"` (or
`"end"` with `aps.dismissal-date` for the end case).

### 3.5 Hook points — extend, don't replace, the existing triggers

- **`updateRunnerLocation`** (`foodorder.service.js:970`): right next to the
  existing `sendRiderLocationFcmMessage(...)` call, add
  `sendLiveActivityUpdate(orderId, ...)` — same `canSend()` throttle key
  (`rider-loc:${orderId}`), so it's a no-op cost addition, not a new timer.
  Only fires if a `liveActivityToken` row with a live `activityUpdateToken`
  exists for that customer — most orders (Android users, or iOS users who
  haven't opened the tracking screen) will simply have no row, so this is
  cheap to no-op.
- **`updateOrderStatus`** (`foodorder.service.js:186`, statuses `delivered`/
  `cancelled*`/`autoCancelled`): send an APNs **end** push
  (`aps.event: "end"`, `aps.dismissal-date`) so the Live Activity clears
  itself even if the app is backgrounded/killed when the order completes —
  today it would just sit on the Lock Screen forever in that case, since
  nothing calls `.end()` for a backgrounded app.
  **Starting** the activity stays client-initiated exactly as it is today
  (`useDeliveryLiveActivity`'s effect on `onTheWay`) — no server-side start
  push needed for the common case; the push-to-start token exists for the
  edge case where the order transitions to `onTheWay` while the app is fully
  killed (§4, decision 3).

### 3.6 Client changes

- New small hook, e.g. `useLiveActivityPushTokens()`, iOS-only: registers
  `addPushToStartTokenListener` once at app boot (alongside the existing FCM
  `registerDeviceToken` call in `src/services/push`) and
  `addPushTokenListener` for the active-activity token, POSTing both to the
  two new endpoints above.
- `useDeliveryLiveActivity.ts` itself needs no changes — it doesn't need to
  know push exists; the token-forwarding hook is independent.

---

## 4. Decisions needed from you

1. **APNs client: raw `http2` + JWT, or `node-apn`?** Raw keeps the
   backend's existing "no SDK wrapper" style for push; `node-apn` is more
   code but battle-tested and handles connection pooling/retries for you.
   Recommend starting raw, falling back to `node-apn` if the JWT/HTTP2
   plumbing proves more fiddly than expected during implementation.
2. **Server-computed ETA text, or distance-only?** The existing rider-location
   push already deliberately avoids calling the Directions API server-side
   (`foodorder.service.js:991-995`'s comment: doubles billed requests for no
   benefit while nobody's looking). Recommend the Live Activity push payload
   mirror that — send `distanceMeters`/`stage`, not a computed ETA string,
   and let `etaText` read something like "On the way" between the client's
   own foreground Directions-based updates. Alternative: a cheap
   distance→time heuristic (avg. delivery speed) server-side if a rough
   ticking ETA matters more than exact accuracy.
3. **Push-to-start scope.** Implement it (per §3.5, for the killed-app edge
   case), or skip it for v1 and only implement the update/end pushes (the
   activity already starts reliably client-side in the overwhelmingly common
   case — app open when the order goes `onTheWay`)? Skipping trims real
   scope (no push-to-start endpoint, no APNs push-to-start payload variant)
   for a genuinely rare edge case.
4. **Rollout.** Ship to all iOS users once built, or gate behind something
   (e.g. only for orders above a size/value threshold, or an internal
   test group first)?

---

## 5. Suggested sequencing

1. Apple credential (§3.1) — unblocks everything else, has its own lead time
   (Apple-side approval isn't always instant). **Key created**
   (`RU2UFBX7SX`); confirm the Live Activities capability on the App ID and
   securely store the `.p8` before moving on.
2. Backend: Redis-backed `canSend()` fix (§2's multi-worker caveat) — small,
   independent, and §4's hook reuses this same throttle, so fixing it first
   means building on correct behavior instead of inheriting the gap twice.
3. Backend: token model + two registration endpoints (§3.2-3.3) — no APNs
   code yet, just storage. Testable in isolation.
4. Backend: APNs sender (§3.4) — testable against the **sandbox** endpoint
   with a manually-obtained token before wiring into real order flow.
5. Backend: hook into `updateRunnerLocation` + `updateOrderStatus` (§3.5).
6. Client: token-forwarding hook (§3.6).
7. End-to-end test on a real device with the app backgrounded — this is the
   one thing that cannot be verified any other way (Simulator can't receive
   real APNs pushes; needs a physical iOS 16.1+ device on an EAS dev build
   with the widget extension, matching the existing constraint already
   documented in `docs/LIVE-ORDER-TRACKING-PLAN.md` §3).

## 6. How we'll verify it

- Backend: a manual test script that sends one APNs update to a token
  captured from a real device's `addPushTokenListener` event, confirmed by
  watching the Live Activity content change with the app killed.
- Full loop: place a real order, background the app once status hits
  `onTheWay`, confirm the Lock Screen/Dynamic Island ETA keeps changing as
  rider location pings arrive, confirm it clears itself within the
  `dismissal-date` window after `delivered`.

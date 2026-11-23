# Live Activity Resilience — Improvement Plan

**Date:** 2026-08-25
**Source:** Daniel Vinojčić (Calda), ["How to Build a Resilient Activity
Tracker with Expo"](https://expo.dev/blog/how-to-build-a-resilient-activity-tracker-with-expo)
— pasted in full by the user; read directly, not fetched.
**Scope:** Both repos — `MealaweUserAppRN` (client) and `MealaweServerApp`
(backend). Extends the existing Live Activity work
(`docs/LIVE-ACTIVITY-PUSH-UPDATES-PLAN.md`), doesn't replace it.
**Status:** Proposal for review — no changes made yet.

Every finding below is checked against the actual current code, cited by
file:line — not inferred from the article in the abstract.

---

## 1. What the article is actually about, and what isn't ours

The article documents a GPS/step-tracking system: a customer's phone tracks
*its own* movement (background location, Kalman-filtered GPS, on-device step
counting) for up to an hour, and has to survive that phone's app process
dying mid-session. That's a different problem than ours — we don't track
the *customer's* location at all; the *rider's* location is tracked
server-side (their own device pings `updateRunnerLocation`), and the
customer's Live Activity is a read-only display of state that already lives
on our backend.

**Not applicable, and why:**
- Background GPS tracking (`TaskManager`, `expo-location` background tasks) — nothing on the customer's device needs to keep running when backgrounded; the backend already knows where the rider is.
- Kalman filtering / GPS noise gating — no GPS filtering happens on the customer side at all.
- On-device step counting — not part of this feature.
- Three-layer session persistence (Zustand → AsyncStorage → remote) for *tracking state* — our tracking state's source of truth is already MongoDB, server-side, from day one. There's no equivalent "session that only lives in the customer's JS memory" to protect.

**One important validation, not a gap:** the article's author originally
built their Live Activity with `@bacons/apple-targets` (a manual native
target via Continuous Native Generation) and notes *"that path is shorter
today than when we walked it, with iOS widgets and Live Activities stable
in `expo-widgets` since SDK 56."* We're already on the current recommended
path — `expo-widgets`, SDK 57 — not the older approach. Nothing to change
here.

**What *is* applicable:** the article's actual load-bearing principle —
*"don't trust the process… every layer works independently, so if any one
fails, the others still protect [state]"* — maps directly onto our push
pipeline's weakest points: the token lifecycle and error handling around
it. Every finding below comes from that mapping, verified against our code.

---

## 2. Findings (evidence-based)

### 2.1 No duplicate-instance guard before starting a new activity

**Article's lesson:** check what's already running before starting new
state (their `initRecovery()` — verify against the backend before assuming
a fresh session).

**Our gap:** `useDeliveryLiveActivity.ts:40` calls
`mealaweDeliveryActivity.start(...)` unconditionally whenever the effect
re-runs (`shouldRun`/`orderId` change) — including on a fresh component
mount. `expo-widgets`' `LiveActivityFactory` has a `getInstances()` method
(confirmed in `node_modules/expo-widgets/src/Widgets.ts:163-167`) that
returns every currently-active instance of this activity type — never
called here.

**Concrete failure case:** customer opens `order-detail`, a Live Activity
starts. They background the app (activity keeps running — it's OS-managed,
survives this by design) or fully kill and relaunch it, then reopen
`order-detail` for the same order. `useDeliveryLiveActivity` mounts fresh,
`activityRef` is a new `useRef(null)`, and the effect calls `.start()`
again — creating a **second** Dynamic Island/Lock Screen entry for the same
delivery, while the first one is still alive and still receiving server
pushes (it was never told to end).

### 2.2 Non-monotonic token clear — the article's "two writers, one key" bug, verified present

**Article's exact words:** *"Write the whole snapshot from either side and
you revert whatever the other just did… never overwrite — merge, keeping
the higher value for anything that must not move backwards."*

**Our gap:** `liveActivityToken.dao.js:26-32`'s `clearActivityUpdateToken(profileId)`
unsets `activityId`/`activityUpdateToken` keyed **only by `profileId`** —
no check that the `activityId` being cleared is the one currently stored.

**Concrete failure case:** order A ends → `postOrderUpdate` calls
`pushLiveActivityEnd` → `clearActivityUpdateToken(customerId)`. If order B
(a new delivery, or a re-order) already started and registered its own
`activityUpdateToken` for the *same customer* before order A's end-push
lands (a real possibility — pushes aren't strictly ordered, and a customer
placing a second order while the first is still `onTheWay` isn't exotic),
this unconditionally wipes order B's valid, in-use token. Order B's Live
Activity silently stops receiving updates, no error anywhere.

### 2.3 APNs sender has no retry, and treats every failure identically

**Article's exact words on speed data (the same principle generalizes):**
*"a negative sentinel is worse than a missing one"* — i.e., know the
difference between "definitely broken" and "try again," and act on it.
Apple's own APNs docs draw exactly this line: `BadDeviceToken` /
`Unregistered` mean the token is permanently dead (stop sending, ever);
`InternalServerError` / `ServiceUnavailable` / a timeout mean try again.

**Our gap:** `apns-live-activity-client.js:83-96`'s `postToApns` rejects
with a generic `Error` for every non-2xx response — no distinction, no
retry, and (more importantly) **no eviction of a dead token.** Combined
with 2.2's bug, this compounds: a token invalidated by Apple stays in
Mongo forever, and every subsequent `updateRunnerLocation` tick pays for a
doomed APNs round-trip (small, but real, cost) that will never succeed.

### 2.4 Client-side token registration has no retry either

`authApi.ts`'s `registerLiveActivityPushToStartToken`/
`registerLiveActivityUpdateToken` both catch-and-silently-drop on failure
(by design, per the original plan — "best-effort, never blocks anything").
That's the right call for *not blocking the UI*, but the article's point
stands: a transient network blip at the exact moment
`addPushToStartTokenListener`/`addPushTokenListener` fires means that
token is lost until the OS decides to reissue one — which, for
push-to-start specifically, may not happen again for a long time. One
retry (not infinite, not blocking) closes most of this gap cheaply.

### 2.5 `mealaweDeliveryActivity.start()` isn't wrapped in error handling at all

Not from the article directly, but the same "don't trust the process"
lens applied to a real edge in our code: `useDeliveryLiveActivity.ts:40`
calls `.start()` with no try/catch. iOS lets a user disable Live Activities
per-app (Settings → [App] → Live Activities, iOS 17.2+) independent of
notification permission — if `expo-widgets` throws or rejects when that's
off (unconfirmed from docs alone; needs a real-device check), that's an
unhandled exception inside a `useEffect`, not a graceful no-op.

---

## 3. Recommendations, prioritized

### Tier 1 — Same-day, contained, no new infra

| # | Action | Fixes |
|---|---|---|
| 1 | Before calling `.start()`, check `mealaweDeliveryActivity.getInstances()`; if one already exists for context reasons (same factory, i.e. any active `MealaweDeliveryActivity`), reuse it via `.update()` instead of starting a duplicate | 2.1 |
| 2 | Scope `clearActivityUpdateToken` to the specific `activityId` being ended — add an `activityId` param, `$unset` only if it matches what's stored (`findOneAndUpdate({ profileId, activityId }, ...)`, no-op if it doesn't match) | 2.2 |
| 3 | Wrap `mealaweDeliveryActivity.start(...)` in try/catch; on failure, log (Crashlytics, matching this project's existing pattern) and skip the push-token listener setup rather than throwing into the effect | 2.5 |

### Tier 2 — Backend resilience (needs the token-scoping fix from Tier 1 #2 first)

| # | Action | Fixes |
|---|---|---|
| 4 | In `apns-live-activity-client.js`, parse the APNs failure `reason`: on `BadDeviceToken`/`Unregistered`/`ExpiredToken`, call `clearActivityUpdateToken` (now `activityId`-scoped, safe) so a dead token stops being retried forever; on `InternalServerError`/`ServiceUnavailable`/`Timeout`, retry once with a short backoff before giving up | 2.3 |
| 5 | Add one retry (not infinite — matching this codebase's existing "best-effort" philosophy, just less brittle) to `registerLiveActivityPushToStartToken`/`registerLiveActivityUpdateToken` in `authApi.ts` — e.g. one retry after 2s on network failure only, still silent/non-blocking on final failure | 2.4 |

### Tier 3 — Verification (needs a real device — same constraint as the original plan)

| # | Action |
|---|---|
| 6 | Test the duplicate-instance fix (2.1) by backgrounding mid-delivery, then reopening `order-detail` — confirm only one Dynamic Island entry exists |
| 7 | Test with the app **force-quit from the app switcher**, not just backgrounded — the article calls this out explicitly as the case most implementations skip, and it's exactly the case this whole push-update feature exists for |
| 8 | Confirm what actually happens when a user has Live Activities disabled at the OS level (Settings → Mealawe → Live Activities → off) — does `.start()` throw, reject, or silently no-op? Determines whether 2.5's catch block needs to do anything beyond logging |

---

## 4. Decisions needed from you

1. **Tier 1 items 1-3** — contained, no new infra, no backend dependency. Proceed?
2. **Tier 2 item 4's retry count/backoff** — one retry after a fixed short delay (e.g. 2s), or worth a proper exponential backoff? Given push volume is already throttled to ~1/15s per order (`notification-throttle.util.js`), a fixed single retry is probably enough — flagging in case you disagree.
3. **Tier 3** — real-device testing, same "can't do this from here" constraint as the original plan. Proceed with 1-5 now and hold 6-8 for whenever device testing happens?

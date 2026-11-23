# Netcore Smartech Integration — Design Spec

## Goal

Port Netcore Smartech — the customer-engagement / push-notification / event-tracking
platform `MealaweUserApp` (Ionic) already uses in production — into
`MealaweUserAppRN`, reusing the **exact same Netcore App IDs** already live for
`com.mealawe.app`, so the RN rewrite continues the same user profile and event
history in Netcore's dashboard instead of opening a blind spot the moment RN starts
taking traffic. Full parity with the Ionic app's event taxonomy (identity, push,
screen views, cart/checkout/purchase across every order type, address, category) —
not a partial cut.

**Explicitly out of scope**: AppTrove/Trackier (install attribution), Branch (deep
links), Firebase Dynamic Links, legacy Google Analytics. These stay on the separate
`AppTrove Attribution - Audit and React Native Migration Plan.pdf` (workspace root,
13 Aug 2026) track, which has its own unresolved business decisions (Branch
ownership of deep links, AppTrove contract status) that Product/Growth need to
answer first. That PDF explicitly recommends **keeping** Netcore as-is, independent
of those decisions.

## Reference architecture (how the Ionic app does it)

`MealaweUserApp/src/service/netcore.service.ts` (`NetCoreService`) wraps the Cordova
plugin (`window.plugins.SmartechBaseCordova`), gated behind
`this.isMobile && environment.production` on every call. Key methods and their RN
equivalents (see Native SDK layer below):

| Ionic method | Fires |
|---|---|
| `login(identity)` / `setUserIdentity` | `SmartechBaseCordova.login('91'+phone)`, then `setEvent('user_login', {user_id})` + `updateUserProfile()` |
| `signup(identity)` | same `login` call + `setEvent('user_signup', {mobile})` |
| `logout(identity)` | `setEvent('user_logout', ...)` then `logoutAndClearUserIdentity('true')` |
| `updateUserProfile({NAME, EMAIL})` | `SmartechBaseCordova.updateUserProfile(...)` |
| `setEvent(name, data)` | generic: `trackEvent(name, {...data, source:'App'})` — every event below funnels through this |
| `setScreenName(name)` | `setEvent('screen_view', {screenname})` |
| `setAddress(event, address)` | builds `{flat,landmark,pincode,city,state}` → `setEvent` |
| `viewCart(cart, orderType?, updateCart?)` | `cart_updated` / `view_cart_items`, e-commerce payload (`total_items`,`total_prqt`,`selling_amount`,`items[]`) |
| `cartUpdate(item, orderType, addtocart)` | `add_to_cart` / `remove_from_cart`, branched per `orderType` |
| `purchase(order, beginCheckout, orderType?, isSuccess)` | `proceed_to_checkout` / `product_purchase` / `purchase_failed` |

Native install-tracking: `CustomApplicationClass.java` /
`AppDelegate.swift` call `trackAppInstallUpdateBySmartech()` once at app boot,
alongside setting `SMT_APP_ID` (Android manifest meta-data) /
`SmartechAppId`+`SmartechAppGroup` (iOS `Info.plist`). Push token/message forwarding
happens in `MyFirebaseMessagingService.java` (`SmartPush.setDevicePushToken` /
`.handleRemotePushNotification`) — Netcore rides on top of the existing FCM pipeline,
it does not own its own push channel.

Server-side (`MealaweServerApp/src/util/netcore-util.js`) separately pushes
subscription-lifecycle retention data to Netcore's Activity Upload API using the
**same** `asset_id` (= the App ID below) — confirming these IDs are the correct,
live, production-linked identity to reuse, not a stale one.

## Native SDK layer

Official Netcore-maintained packages (verified via npm + their published source —
not community/unofficial):

- `smartech-base-react-native` (3.7.x) — identity/event/deeplink JS API
- `smartech-push-react-native` (3.7.x) — push token/message bridging JS API
- `smartech-base-expo-plugin` (3.7.x) — Expo config plugin: Android manifest
  meta-data + Gradle, iOS `Info.plist` `SmartechKeys` dict + App Group entitlement
- `smartech-push-expo-plugin` (3.7.x) — Expo config plugin: Android FCM service
  wiring, iOS notification-extension (SmartechNSE/SmartechNCE) Xcode targets +
  entitlements — this is the automated equivalent of the two manual Podfile targets
  the Ionic app maintains by hand today
- **Not** using `smartech-appinbox-react-native`/`-expo-plugin` — the Ionic app
  doesn't use Netcore's App Inbox feature, no reason to add it (YAGNI)

**Risk flagged, not blocking**: the Expo plugins declare `peerDependencies: { expo:
"^53.0.0" }` while this project is on Expo 57. Config plugins only manipulate native
project files via `@expo/config-plugins` at prebuild time — they don't touch the JS
runtime — so this is very likely forward-compatible, but the **first implementation
checkpoint** is running `npx expo prebuild --clean` with the plugins added and
confirming it completes cleanly, before any deeper wiring work. Same spirit as the
JusPay integration's New-Architecture build-spike risk note.

**Config values reused as-is from the Ionic app** (not new provisioning):

| Value | Source (Ionic) |
|---|---|
| Android `SMT_APP_ID` | `2699cd5e4ada21e96e3f481c8400a433` (`AndroidManifest.xml`) |
| iOS `SmartechAppId` | `a6fe8c8cae98111daae5600714b4c50c` (`Info.plist`) |
| iOS `SmartechAppGroup` | `group.com.mealawe.app` |
| `autoFetchLocation` | `true` |
| `useAdvID` (iOS) | `true` |

The iOS App Group is a genuine reuse win: RN's `expo-widgets` plugin already
configures `group.com.mealawe.app` as its group identifier (`app.json`), so
Smartech's NSE/NCE extensions can share it — no new entitlement to request.

**No `ios/` folder exists in this repo yet** (confirmed — CNG-only, native dirs are
gitignored). This integration's first `expo prebuild --platform ios` is also the
first time this repo builds for iOS at all, same situation the JusPay integration
spec already flagged — budget for unrelated first-iOS-build friction, not just
Smartech-specific issues.

## Env config (`src/config/environments.ts` + `env.ts`)

Follows the exact existing `googleMapsApiKey` pattern — a base value declared once,
included in each of `local`/`staging`/`production` (Netcore's config doesn't vary by
environment, same as the Ionic app), with an `EXPO_PUBLIC_*` override escape hatch:

```ts
// environments.ts — add to AppEnvironment interface + each env object
netcore: {
  androidAppId: string;
  iosAppId: string;
  iosGroupIdentifier: string;
};

// env.ts — add override line alongside googleMapsApiKey
netcore: {
  ...active.netcore,
  androidAppId: process.env.EXPO_PUBLIC_NETCORE_ANDROID_APP_ID ?? active.netcore.androidAppId,
  iosAppId: process.env.EXPO_PUBLIC_NETCORE_IOS_APP_ID ?? active.netcore.iosAppId,
},
```

`app.json`'s plugin entries read these via `app.config.js`-style dynamic config, OR
(simpler, matching how `expo-widgets`' `groupIdentifier` is already a static string
literal in `app.json` today) the App IDs are hardcoded directly in the plugin config
block in `app.json` and only the **JS-side** `netcore.androidAppId` copy in
`environments.ts` is used at runtime (e.g. `getAppId()` sanity checks, logging).
Native config plugin values in Expo's static `app.json` can't read `process.env` at
all without switching to `app.config.js` — **decision for implementation**: keep
`app.json` as-is (static) and hardcode the App IDs directly in the plugin config
(matching how `expo-widgets`' `groupIdentifier` and Google Maps native keys are
already handled in this file today), while still adding the env.ts/environments.ts
copies for any JS-side reads. This avoids a repo-wide `app.json`→`app.config.js`
migration for one feature.

## Shared service module (`src/services/netcore/`)

Matches this codebase's existing per-concern module shape (`src/services/push/`,
`src/services/crashlytics/`) rather than porting Angular's single God-service:

- **`netcoreClient.ts`**
  - `initNetcore()` — called once at app boot (`_layout.tsx` module scope, alongside
    `initPush()`/`registerBackgroundHandler()`): registers the `SmartechDeeplink`
    listener, calls `trackAppInstallUpdateBySmartech()`.
  - `identify(phone: string)` → `SmartechBaseReact.login('91' + phone)`
  - `logout()` → `SmartechBaseReact.logoutAndClearUserIdentity(true)`
  - `updateProfile({ name, email })` → `SmartechBaseReact.updateUserProfile({ NAME, EMAIL })`
  - `track(eventName: string, payload: object)` → `SmartechBaseReact.trackEvent(eventName, { ...payload, source: 'App' })` — every event below is a thin named wrapper over this
  - `setScreenName(name: string)` → `track('screen_view', { screenname: name })`
- **`netcorePush.ts`**
  - `bridgeDeviceToken(token: string)` → `SmartechPushReact.setDevicePushToken(token)`
  - `bridgeRemoteMessage(message: FirebaseMessagingTypes.RemoteMessage)` → `SmartechPushReact.handlePushNotification(message.data)`
- **`events.ts`** — one small named function per Ionic event (`trackAddToCart`,
  `trackRemoveFromCart`, `trackViewCart`, `trackProceedToCheckout`,
  `trackPurchase`, `trackPurchaseFailed`, `trackSelectAddress`, `trackAddAddress`,
  `trackLocateMe`, `trackCategoryViewed`, `trackSubAddonSelected`,
  `trackProductView`), each building the exact payload shape the Ionic service used
  (`prid`/`product_name`/`category_name`/`product_price`/`prqt`/`image_url`/
  `final_price`/`selling_price` per item, `total_items`/`total_prqt`/
  `selling_amount`/`discount_amt` for totals) — keeps event-name/field-name
  parity with the Ionic app's existing Netcore dashboard reports.
- **`index.ts`** barrel.

Guard clause: every call goes through a single `isTrackingEnabled()` check
(production build only — matches Ionic's `isMobile && environment.production`
gate) so dev/staging builds don't pollute production Netcore data, mirroring the
Ionic app's exact behavior rather than introducing a new policy.

## Push integration — coexistence with the existing FCM/notifee pipeline

Push is **already fully implemented** in this app via `@react-native-firebase/messaging`
+ `@notifee/react-native` (`src/services/push/notifications.ts` — foreground display,
tap-routing, background handler, token registration to the backend). Netcore must
**ride alongside** this pipeline, not replace it — exactly how the Ionic app's
`MyFirebaseMessagingService` forwards to `SmartPush` rather than letting Smartech own
FCM directly.

Concretely:
- `smartech-push-expo-plugin`'s `android.useSmartechFCM` config is set to **`false`**
  — this stops the plugin from registering its own competing
  `SmartechFCMService`/`FirebaseMessagingService`. FCM stays fully owned by
  `@react-native-firebase/messaging` as it is today.
- `netcorePush.bridgeDeviceToken(token)` is called from inside the existing
  `registerDeviceToken()` and `onTokenRefresh` handlers in `notifications.ts` —
  additively, not replacing the existing `authApi.saveFcmToken` call.
- `netcorePush.bridgeRemoteMessage(message)` is called from inside the existing
  `onMessage`/`setBackgroundMessageHandler`/`onNotificationOpenedApp` handlers,
  **before** notifee's own display logic — this lets Netcore record/attribute a push
  that originated from a Netcore campaign (payload carries Netcore's own marker keys)
  without taking over rendering, which notifee continues to own.

**Open question flagged for implementation**: confirm `handlePushNotification`'s
return value/behavior when the payload is *not* a Netcore-originated push (e.g. a
transactional order-update push from the app's own backend) — the Ionic native code
has a comment noting this exact ambiguity (`MyFirebaseMessagingService.onMessageReceived`
returns a boolean and the app currently no-ops on `false`). Verify Smartech's RN
`handlePushNotification` doesn't attempt to render a duplicate notification for
non-Netcore pushes; test both push origins on a real device before considering this
done.

## Deeplink handling (Netcore's own, distinct from Expo Router's scheme routing)

Netcore's `SmartechDeeplink` event fires when a user taps a push notification,
in-app message, or app-inbox item that has a deeplink configured **on Netcore's
dashboard side** for that campaign — this is unrelated to (and doesn't conflict
with) the app's existing `scheme`/`associatedDomains`/`intentFilters` Expo Router
linking config, which handles marketing/share links opened from outside the app.

`initNetcore()` registers:
```ts
SmartechBaseReact.addListener('SmartechDeeplink', (payload) => {
  const path = payload?.smtDeeplink?.split('?')[0];
  if (path) router.push(path);
});
```
mirroring the Ionic app's `handleDeeplinkWithPayload` (strip query string, navigate).
This is new code — no existing listener in this app taps into incoming link events
at all today (confirmed: `_layout.tsx` has no `Linking.addEventListener` anywhere).

## Identity & lifecycle events — exact hook points

| Event | File · function | Notes |
|---|---|---|
| SDK init + deeplink listener + `trackAppInstallUpdateBySmartech` | `src/app/_layout.tsx` module scope | alongside `initPush()`/`registerBackgroundHandler()` |
| `login` (`identify`) | `src/app/login.tsx` `verify()`, after `setProfile(profile)` | alongside `registerDeviceToken`/`setCrashlyticsUser` |
| `user_signup` + `updateProfile` | `src/app/register.tsx` submit handler, after `setProfile(updated)` | first-time name/email capture |
| `updateProfile` | `src/app/profile-edit.tsx` `onSubmit()` **and** `src/features/profile/profileApi.ts` save path | two separate save code paths hit the same backend endpoint — both need the call |
| `user_logout` + Smartech logout | `src/app/profile.tsx` sign-out flow, alongside `setCrashlyticsUser(null)` | before `clearSession()` |
| re-identify on cold start | `src/app/_layout.tsx` boot effect | alongside existing `registerDeviceToken`/`setCrashlyticsUser` re-registration for an already-authenticated session |

Identity value: `'91' + profile.phoneNo` — RN's `phoneNo` is a bare 10-digit string
(no country code), matching the Ionic app's own `91${phoneNo}` construction exactly.

## Screen-view tracking

New reusable hook `useScreenTracking(screenName: string)` (doesn't exist in the
Ionic app, which called `setScreenName` imperatively per component — a
`useFocusEffect`-based hook is the more idiomatic and less error-prone RN
equivalent), called at the top of all 34 current route files under `src/app/`
(`(tabs)/index.tsx`, `welcome`, `login`, `register`, `addresses`, `address-form`,
`marketplace`, `on-demand-*`, `bulk-*`, `cart`, `subscription-*`,
`manage-subscription`, `orders`, `my-orders`, `order-detail`,
`order-history/[category]`, `order-result`, `profile`, `profile-edit`, `wallet`,
`cashback`, `refer-earn`, `feedback`, `help`, `support-chat`).

## Commerce event wiring (full taxonomy — every reachable trigger)

| Event | Hook point |
|---|---|
| `add_to_cart` / `remove_from_cart` (subscription) | `src/store/cartStore.ts` `setSubscription()`/`setCount()` — called from `subscription-configure.tsx` `save()`, `cart.tsx` stepper |
| `add_to_cart` / `remove_from_cart` (on-demand: allDay/advance) | `src/features/on-demand/useOnDemandCartStore.ts` `setCount()` — `on-demand-kitchen.tsx`, `on-demand-cart.tsx` |
| `add_to_cart` / `remove_from_cart` (bulk) | `src/features/bulk/useBulkCartStore.ts` `setCount()` — `bulk-menu.tsx`, `bulk-cart.tsx` |
| `dine_in_package_added` | folded into subscription add-to-cart, branch on `isDineIn === true` (`DineInHome.tsx` → `cartStore.setSubscription`) — Ionic treats it as a distinct event name but the RN data shape is identical to the subscription case, no separate flow exists |
| `view_cart_items` / `cart_updated` | mount effect + `setCount`/`applyCoupon`/`clearCoupon` in `cart.tsx` / `bulk-cart.tsx` / `on-demand-cart.tsx`, reading each screen's own `bill` memo for totals |
| `proceed_to_checkout` | `pay()` entry (before `setPaying(true)`) in each of the three cart screens |
| `product_purchase` / `purchase_failed` | primary payload captured at each `pay()` call site (order body already has `amount`/`discount`/`itemList` in scope); confirming trigger + simple status read at `order-result.tsx` (`status` param) |
| `select_address` / `add_address` | `addresses.tsx` `onSelect()` → `useLocationStore.setCurrent()` / `address-form.tsx` `onSubmit()` → `useLocationStore.addAddress()` |
| `locate_me` | `addresses.tsx` `detect()` → `useLocationStore.useCurrentLocation()` |
| `category_viewed` | `SubscriptionHome.tsx` `selectCategory()`, `BulkHome.tsx` category-tile press, `on-demand-kitchens.tsx` `openKitchen()` |
| `sub_addon_selected` | `subscription-configure.tsx` `toggleAddon()` — fires on both select and deselect, distinguished by checking `selectedAddonIds` membership before vs. after |
| `product_view` (best-effort) | `subscription-plan.tsx` package selection (`setSelectedPkgId`) — the only RN screen with anything resembling a detail view; bulk/on-demand items are inline list cards with no drill-down route to hook |

### Known gaps — no RN code exists to hook (not a scoping choice)

- **Navmool/marketplace cart & purchase events** — `marketplace.tsx` is a bare
  WebView of `navmool.com`; all cart/checkout happens inside that site's own JS,
  outside RN's reach. No injected-JS bridge exists today. A code comment at the
  WebView's config will note this is why marketplace has zero Netcore events, so
  it's a visible, intentional gap rather than a silent miss if that WebView is ever
  replaced with a native flow.
- **`order_cancelled`** — no cancel-order action exists anywhere in the RN app
  (confirmed by exhaustive grep across `src/features/orders`) — only reschedule.
  Skip until a cancel flow ships; the event wrapper function
  (`trackOrderCancelled`) can still be written in `events.ts` ahead of time so it's
  a one-line call to add later, but nothing calls it yet.
- **`product_search`** — the Explore/Search tab is a `ComingSoonScreen` stub; the
  five existing "search boxes" are local substring filters over already-loaded
  lists, not a real search feature. No server round-trip or result-count exists to
  attach a meaningful `product_search` event to. Skip until real search ships.

## Testing

This project has no unit tests (`CLAUDE.md`); E2E coverage is Maestro-only per
`docs/TESTING-WORKFLOW.md`. This integration adds **no new user-visible UI, copy, or
interaction** — it's instrumentation wired into existing screens/actions — so it
does not get its own new Maestro flow or test-catalogue rows (there's nothing for
Maestro to `tapOn`/`assertVisible` that isn't already covered by each touched
screen's existing flow). Verification instead:

1. `npx expo prebuild --clean` succeeds with the new plugins (Android first, then
   iOS) — first checkpoint, per the risk note above.
2. `npx tsc --noEmit` clean.
3. Re-run the **existing** Maestro flows for every touched screen (login, register,
   profile, addresses, cart, bulk-cart, on-demand-cart, subscription-configure) as a
   regression check — if Netcore's native SDK breaks a build or crashes a screen,
   these already catch it.
4. Manual device validation against Netcore's dashboard / test-device workflow:
   install tracked, login/logout/signup events visible, a test push (with a
   dashboard-configured deeplink) delivers and routes correctly, screen_view fires
   on navigation, a cart/purchase event round-trip matches an actual test order.

## Open questions (flagged for implementation, not blocking the plan)

1. **Expo peer-dependency mismatch** (`expo: ^53.0.0` declared, project on 57) —
   resolve at the first `expo prebuild` checkpoint; patch the plugin's `package.json`
   peer range locally if npm/Metro refuses to install rather than waiting on
   upstream.
2. **First-ever iOS build for this repo** — no `ios/` folder exists yet; budget for
   unrelated first-iOS-build friction alongside Smartech-specific setup (same
   situation the JusPay spec already flagged for this repo).
3. **`handlePushNotification` behavior for non-Netcore-originated pushes** — verify
   on-device it doesn't double-render alongside notifee for the app's own
   transactional pushes.
4. **`app.json` static config vs. `app.config.js`** — decision to keep `app.json`
   static and hardcode Netcore App IDs directly in the plugin block (matching
   existing precedent for `expo-widgets`/Google Maps keys in this file), rather than
   migrating the whole repo to dynamic config for this one feature.

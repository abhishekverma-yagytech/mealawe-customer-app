# Netcore Smartech Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Netcore Smartech (event tracking, push notifications, deeplinks) from
`MealaweUserApp` (Ionic) into `MealaweUserAppRN`, using Netcore's official React
Native + Expo SDK packages and reusing the exact Netcore App IDs already live for
`com.mealawe.app`, with full parity across identity, screen views, and the commerce
event taxonomy (cart/checkout/purchase/address/category across every order type the
RN app currently supports).

**Architecture:** Two new service modules (`src/services/netcore/`) wrap the Netcore
SDK — one for identity/events/deeplinks, one for push-token/message bridging into the
app's *existing* `@react-native-firebase/messaging` + `notifee` pipeline (Netcore
rides alongside it, never replaces it). Commerce cart events (add/remove/cart-update)
are wired **inside the Zustand cart/location store actions** (`cartStore.setCount`,
`useBulkCartStore.setCount`, `useLocationStore.setCurrent`, etc.) rather than at each
screen call site — this is a deliberate refinement over the design spec: every store
already has exactly one action per mutation, so firing the event there guarantees no
call site is ever missed, instead of relying on N screens all remembering to call a
tracker. Checkout/purchase events (which need payment-flow context, not just cart
state) stay at the screen level, in each cart's `pay()`.

**Tech Stack:** React Native (Expo SDK 57), `smartech-base-react-native` +
`smartech-push-react-native` (JS SDKs), `smartech-base-expo-plugin` +
`smartech-push-expo-plugin` (Expo config plugins), existing Zustand stores,
`@react-native-firebase/messaging` (existing push pipeline).

**Spec:** `docs/superpowers/specs/2026-08-31-netcore-smartech-integration-design.md`

**Verification convention (no unit tests in this project):** every code task is
verified with `npx tsc --noEmit`. Native-config tasks are additionally verified with a
real Android build/launch — **unless** the machine's native-build environment is
still blocked by the pre-existing Windows Defender/ninja issue documented in "Task 0
findings" below, in which case fall back to `npx expo prebuild` (+
`./gradlew :app:processDebugResources` for resource-linking checks specifically)
until that's resolved, and note the deferred on-device check explicitly rather than
silently skipping it. Final task runs the full build plus a manual device smoke
test and a regression pass of the existing Maestro flows for every touched screen.

---

### Task 0 findings (build spike, run 2026-08-31 — informs Task 1 below)

The build spike ran in a disposable worktree/branch before Task 1 started. Result:
**go**. The peer-dependency risk this task worried about did not materialize —
`expo: "^53.0.0"` turned out to be a regular `dependencies` entry in both Expo
plugins (not `peerDependencies`), so npm nests a private `expo@53.0.27` copy under
each plugin's own `node_modules` with zero conflict; `npm install` needed no
`--legacy-peer-deps`. Netcore's Maven repo resolved cleanly too.

**A real, different blocker was found and is now folded into Task 1 below**:
`smartech-push-react-native`'s native Android module autolinks unconditionally (once
the JS package is installed, regardless of whether `smartech-push-expo-plugin` is
even configured) and its AAR references Android resources — styles
`TransparentCompat`/`TransparentCompatTheme`/`NotificationTheme`, dimens
`dp_3`/`dp_5`/`dp_7`/`dp_10`, drawable `ic_smt_close` — that neither the AAR, its
README, nor either Expo plugin actually supplies. Without them, the build fails at
`app:processDebugResources` with `AAPT: error: resource ... not found`. This
wasn't visible from reading the plugins' JS/TS source (already done, see Task
1's design-spec references) — it only surfaced from an actual native build attempt.
Task 1 Step 4a below adds a local config plugin to supply them durably (survives
`expo prebuild --clean`, matching this repo's existing `./plugins/with*.js` pattern).

Full on-device launch was **not verified** by the spike — blocked by an unrelated,
pre-existing Windows Defender/ninja interaction on the build machine
(`react-native-reanimated`'s native build loops with `ninja: error: manifest
'build.ninja' still dirty after 100 tries`, reproduced 3/3 retries). Confirmed
unrelated to Netcore (Defender real-time protection was already active,
independent of these packages). Until that's resolved locally, Task 1 Step 6 and
every later task's on-device verification step falls back to `npx tsc --noEmit` +
`npx expo prebuild` (config/resource-linking checks, no native compile) — swap back
to full `npx expo run:android` once the Defender exclusion is in place.

---

### Task 0: Native SDK build spike — de-risk before any feature code

**Goal:** Prove `smartech-base-react-native` + `smartech-base-expo-plugin` actually
install and build on this repo's exact stack (Expo SDK 57) before writing any feature
code. The single unknown: both Expo plugins declare `peerDependencies: { expo:
"^53.0.0" }` while this project is on Expo 57 — config plugins only touch native
project files via `@expo/config-plugins` at prebuild time (not the JS runtime), so
this is very likely fine, but unverified until proven. Same spirit as the JusPay
integration's New-Architecture build-spike (`docs/superpowers/plans/2026-08-06-juspay-payment-integration.md`
Task 0).

**Do this in a throwaway branch, not the feature branch** — its only output is a
go/no-go decision plus notes for Task 1.

- [ ] **Step 1: Install the base packages**

```bash
npm install smartech-base-react-native smartech-push-react-native
npm install --save-dev smartech-base-expo-plugin smartech-push-expo-plugin
```

- [ ] **Step 2: Add a minimal plugin config to `app.json` and prebuild Android**

Add to `app.json`'s `plugins` array (illustrative minimal shape — Task 1 fills in the
real values):
```json
[
  "smartech-base-expo-plugin",
  { "ios": { "appId": "a6fe8c8cae98111daae5600714b4c50c", "groupIdentifier": "group.com.mealawe.app", "autoFetchLocation": true, "useAdvID": true },
    "android": { "smartechMetaData": [{ "name": "SMT_APP_ID", "value": "2699cd5e4ada21e96e3f481c8400a433" }] },
    "isNewArchEnabled": true, "deepLinkDelay": 0 }
]
```

```bash
npx expo prebuild --platform android --clean
npx expo run:android
```

Watch specifically for: `npm install` peer-dependency conflicts (`expo@^53.0.0` vs
the installed `~57.0.15` — if npm refuses, retry with `--legacy-peer-deps` and note
it), Gradle failing to resolve Netcore's Maven artifacts, or a crash on app launch.

- [ ] **Step 3: If Android install/build fails on the peer-dependency mismatch**

Patch the plugin's own `package.json` peerDependencies range locally (e.g. via a
`patch-package` patch, or by editing `node_modules/smartech-base-expo-plugin/package.json`
and re-running install with `--no-save`) to confirm whether the mismatch is the actual
blocker or just an npm warning. Record the result either way — this determines
whether Task 1 needs a `patch-package` step.

- [ ] **Step 4: Report the go/no-go**

Add a note to this plan's Task 1 (or a follow-up comment) confirming: (a) it installs
and builds cleanly — proceed to Task 1 as planned; (b) it needs a peer-dep patch —
carry that patch into Task 1's install step; (c) it doesn't build at all — stop and
escalate before continuing this plan (check Netcore's GitHub issues for the exact
error, or contact Netcore support).

Do not proceed past Task 0 on outcome (c).

---

### Task 1: Install and configure both Netcore packages on the feature branch

**Files:**
- Modify: `app.json`
- Modify: `package.json` / `package-lock.json`
- Modify: `src/config/environments.ts`
- Modify: `src/config/env.ts`
- Regenerate: `android/` (already exists)
- Create: `ios/` (doesn't exist yet in this repo — first-ever iOS build for this
  repo, same situation the JusPay plan already flagged)

- [ ] **Step 1: Install (carrying forward whatever Task 0 determined)**

```bash
npm install smartech-base-react-native smartech-push-react-native
npm install --save-dev smartech-base-expo-plugin smartech-push-expo-plugin
```

- [ ] **Step 2: Add the Netcore config block to `src/config/environments.ts`**

Add a `netcore` field to the `AppEnvironment` interface (after `googleMapsApiKey`):

```ts
  /** Google Maps / Places / Geocoding key (client-side; restrict by app id in console). */
  googleMapsApiKey: string;
  /** Netcore Smartech — reused as-is from the live Ionic app (MealaweUserApp) so
   * the RN rewrite continues the same user/event history in Netcore's dashboard. */
  netcore: {
    androidAppId: string;
    iosAppId: string;
    iosGroupIdentifier: string;
  };
}
```

Add the shared const (next to `googleMapsApiKey`'s const, same file, after line 79):

```ts
// Netcore Smartech identity — reused as-is from MealaweUserApp (Ionic). Same
// value across every environment: Netcore's Ionic config doesn't vary by
// build environment either (values are hardcoded in AndroidManifest.xml /
// Info.plist there, not environment-specific).
const netcore = {
  androidAppId: '2699cd5e4ada21e96e3f481c8400a433',
  iosAppId: 'a6fe8c8cae98111daae5600714b4c50c',
  iosGroupIdentifier: 'group.com.mealawe.app',
};
```

Add `netcore,` to each of the three `withDerived({...})` calls (`local`, `staging`,
`production`), right after `googleMapsApiKey,` in each.

- [ ] **Step 3: Add the override line to `src/config/env.ts`**

```ts
export const env: AppEnvironment = {
  ...active,
  serverUrl,
  imageUrl: `${serverUrl}/images/`,
  videoUrl: `${serverUrl}/videos/`,
  apiSecretKey: process.env.EXPO_PUBLIC_API_SECRET_KEY ?? active.apiSecretKey,
  googleMapsApiKey:
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? active.googleMapsApiKey,
  netcore: {
    androidAppId: process.env.EXPO_PUBLIC_NETCORE_ANDROID_APP_ID ?? active.netcore.androidAppId,
    iosAppId: process.env.EXPO_PUBLIC_NETCORE_IOS_APP_ID ?? active.netcore.iosAppId,
    iosGroupIdentifier: active.netcore.iosGroupIdentifier,
  },
};
```

- [ ] **Step 4: Configure `app.json`'s `plugins` array**

Add these two entries right after `"@react-native-firebase/crashlytics",` (line 114)
and before `"./plugins/withNotifeeMavenRepo.js",` — Netcore push depends on FCM
already being configured, same ordering reasoning as the existing Firebase plugins:

```json
      [
        "smartech-base-expo-plugin",
        {
          "ios": {
            "appId": "a6fe8c8cae98111daae5600714b4c50c",
            "groupIdentifier": "group.com.mealawe.app",
            "autoFetchLocation": true,
            "useAdvID": true,
            "isLogEnabled": true,
            "addTestDevice": false,
            "smartechNudges": { "smartechNudgesEnabled": false, "appId": "", "appKey": "", "addTestDevice": false, "isLogEnabled": false }
          },
          "android": {
            "smartechMetaData": [
              { "name": "SMT_APP_ID", "value": "2699cd5e4ada21e96e3f481c8400a433" },
              { "name": "SMT_IS_AUTO_FETCHED_LOCATION", "value": "1" }
            ],
            "smartechNudges": { "smartechNudgesEnabled": false, "addTestDevice": false, "useEncryption": false, "SMARTECH_NUDGE_SDK_VERSION": "", "isLogEnabled": false, "smartechNudgesMetaData": [] },
            "SMARTECH_BASE_SDK_VERSION": "",
            "isKotlinProject": true,
            "isLogEnabled": true,
            "autoFetchLocation": true,
            "backupXMLFiles": "",
            "addTestDevice": false
          },
          "isNewArchEnabled": true,
          "deepLinkDelay": 0
        }
      ],
      [
        "smartech-push-expo-plugin",
        {
          "autoAskNotificationPermission": false,
          "android": {
            "isKotlinProject": true,
            "useSmartechFCM": false,
            "SMARTECH_PUSH_SDK_VERSION": ""
          },
          "ios": {
            "groupIdentifier": "group.com.mealawe.app",
            "mode": "development"
          }
        }
      ],
```

Notes on the values above:
- `isKotlinProject: true` — this repo's native Android code is Kotlin (per the
  Expo/RN 0.86 CNG default; confirm against `android/app/src/main/java` after Task
  0's prebuild if this needs correcting).
- `android.useSmartechFCM: false` — **the key decision from the design spec**: FCM
  stays fully owned by `@react-native-firebase/messaging`; Netcore only receives
  tokens/messages via the bridging code in Task 4, it never registers its own
  competing FCM service.
- `SMARTECH_BASE_SDK_VERSION` / `SMARTECH_PUSH_SDK_VERSION` left as empty strings —
  the plugin's own `androidConstants.ts` defaults to a pinned version when this is
  empty; only fill in an explicit version if Task 0 or a later build surfaces a
  version conflict.
- `ios.mode: "development"` — matches this app's current build stage (no other
  Netcore extension has iOS-release wiring yet); **flip to `"appstore"` for
  production EAS builds** once this repo has a real release pipeline for iOS (it
  doesn't yet — see the design spec's "first-ever iOS build" open question).

- [ ] **Step 4a: Add a local config plugin for the missing Android push resources**

Confirmed necessary by the Task 0 build spike (see "Task 0 findings" above) —
`smartech-push-react-native`'s native module needs Android resources that nothing
else provides. Create `plugins/withSmartechPushAndroidResources.js`:

```js
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Smartech's push SDK (smartech-push-react-native) autolinks a native Android
 * module whose AAR references styles/dimens/a drawable that neither the SDK
 * nor smartech-push-expo-plugin actually provides — confirmed via a real
 * `expo prebuild` + `expo run:android` build spike (AAPT "resource not found"
 * at app:processDebugResources without these). Needed regardless of whether
 * Netcore's push features are actively exercised, since the native module
 * autolinks unconditionally once the JS package is installed.
 *
 * Values: the four `dp_N` dimens are self-describing Android convention
 * (name matches value — `dp_3` = 3dp) and are very likely exactly what the
 * SDK's internal notification layouts expect. The transparent-activity theme
 * trio and close icon are a standard Android pattern for an SDK's trampoline/
 * overlay activity (common across push SDKs) — reasonable, functional
 * defaults. If push notification visuals look wrong on a real device, check
 * Netcore's official Android integration guide for their exact recommended
 * values and update this plugin (not android/, which gets wiped on every
 * `expo prebuild --clean`).
 */
const STYLES_XML = `
    <style name="TransparentCompat" parent="Theme.AppCompat.Light.NoActionBar">
        <item name="android:windowIsTranslucent">true</item>
        <item name="android:windowBackground">@android:color/transparent</item>
        <item name="android:windowContentOverlay">@null</item>
        <item name="android:windowNoTitle">true</item>
        <item name="android:windowIsFloating">true</item>
        <item name="android:backgroundDimEnabled">false</item>
    </style>
    <style name="TransparentCompatTheme" parent="TransparentCompat" />
    <style name="NotificationTheme" parent="Theme.AppCompat.Light.NoActionBar" />
`.trim();

const DIMENS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <dimen name="dp_3">3dp</dimen>
    <dimen name="dp_5">5dp</dimen>
    <dimen name="dp_7">7dp</dimen>
    <dimen name="dp_10">10dp</dimen>
</resources>
`;

const IC_SMT_CLOSE_XML = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M19,6.41L17.59,5 12,10.59 6.41,5 5,6.41 10.59,12 5,17.59 6.41,19 12,13.41 17.59,19 19,17.59 13.41,12z"/>
</vector>
`;

function withSmartechPushAndroidResources(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const resDir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res');
      const valuesStylesPath = path.join(resDir, 'values/styles.xml');
      const dimensPath = path.join(resDir, 'values/smt_push_dimens.xml');
      const drawableDir = path.join(resDir, 'drawable');
      const iconPath = path.join(drawableDir, 'ic_smt_close.xml');

      let styles = fs.readFileSync(valuesStylesPath, 'utf8');
      if (!styles.includes('name="NotificationTheme"')) {
        styles = styles.replace('</resources>', `${STYLES_XML}\n</resources>`);
        fs.writeFileSync(valuesStylesPath, styles);
      }

      fs.writeFileSync(dimensPath, DIMENS_XML);

      fs.mkdirSync(drawableDir, { recursive: true });
      fs.writeFileSync(iconPath, IC_SMT_CLOSE_XML);

      return config;
    },
  ]);
}

module.exports = withSmartechPushAndroidResources;
```

Register it in `app.json`'s `plugins` array, right after the `smartech-push-expo-plugin`
entry added in Step 4:
```json
      "./plugins/withSmartechPushAndroidResources.js",
```

- [ ] **Step 5: Prebuild both platforms**

```bash
npx expo prebuild --clean
```

Expected: `android/` regenerates with the Smartech manifest meta-data + Gradle
dependencies patched in, **plus** the styles/dimens/drawable resources from Step 4a
(diff against the pre-Task-1 state to confirm all three plugins actually wrote their
changes); `ios/` is created for the first time in this repo, with the `SmartechKeys`
dict in `Info.plist` and (from the push plugin) `SmartechNSE`/`SmartechNCE`
notification-extension targets scaffolded.

- [ ] **Step 6: Verify — build only, no Netcore JS code runs yet**

If the machine's native-build environment is confirmed working (Windows Defender
exclusions in place — see "Task 0 findings" above):
```bash
npx expo run:android
```
Expected: app launches to the home/login screen with no crash (no app code calls
into the SDK yet — this step only confirms the native project still builds and links
with all three plugins applied, including the resources from Step 4a).

If the native-build environment is still blocked, fall back to a resource-linking-only
check (catches the exact AAPT failure the spike hit, without requiring a full launch):
```bash
cd android && ./gradlew :app:processDebugResources && cd ..
```

Either way, also run `npx tsc --noEmit` — expected clean (no JS changes yet besides
the env config, which is additive and typed).

- [ ] **Step 7: Commit**

```bash
git add app.json package.json package-lock.json plugins/withSmartechPushAndroidResources.js src/config/environments.ts src/config/env.ts
git commit -m "feat: add Netcore Smartech native dependency (base + push SDK and Expo plugins)"
```

Note: `android/` and `ios/` are gitignored in this repo (standard Expo CNG — native
projects are regenerated from `app.json`/plugins, not tracked). Don't force-add them.

---

### Task 2: Core identity/event service — `src/services/netcore/netcoreClient.ts`

**Files:**
- Create: `src/services/netcore/netcoreClient.ts`
- Create: `src/services/netcore/index.ts`

- [ ] **Step 1: Write `netcoreClient.ts`**

```ts
import SmartechBaseReact from 'smartech-base-react-native';
import { router } from 'expo-router';

import { env } from '@/config';

/**
 * Netcore only fires in production builds — mirrors the Ionic app's own
 * `isMobile && environment.production` gate on every NetCoreService call, so
 * dev/staging builds never pollute production Netcore data.
 */
function isTrackingEnabled(): boolean {
  return env.production;
}

/** Call once at app boot (`_layout.tsx` module scope). Registers Netcore's own
 * deeplink listener (fires when a user taps a push/in-app-message/app-inbox
 * item carrying a deeplink configured on Netcore's dashboard — unrelated to
 * this app's Expo Router `scheme`/`associatedDomains` linking, which handles
 * links opened from outside the app) and records the install/update event. */
export function initNetcore(): void {
  if (!isTrackingEnabled()) return;
  SmartechBaseReact.addListener('SmartechDeeplink', (payload: { smtDeeplink?: string }) => {
    const path = payload?.smtDeeplink?.split('?')[0];
    if (path) {
      router.push(path as never);
    }
  });
  SmartechBaseReact.trackAppInstallUpdateBySmartech();
}

/** Identify the user to Netcore. `phone` is the bare 10-digit number (this
 * app's `CustomerProfile.phoneNo` shape) — the '91' country-code prefix is
 * added here, matching the Ionic app's own `91${phoneNo}` construction. */
export function identify(phone: string): void {
  if (!isTrackingEnabled()) return;
  SmartechBaseReact.login(`91${phone}`);
}

export function logout(): void {
  if (!isTrackingEnabled()) return;
  SmartechBaseReact.logoutAndClearUserIdentity(true);
}

export function updateProfile(fields: { name?: string; email?: string }): void {
  if (!isTrackingEnabled()) return;
  SmartechBaseReact.updateUserProfile({ NAME: fields.name, EMAIL: fields.email });
}

/** Generic event wrapper — every named tracker in `events.ts` funnels through
 * this, matching the Ionic app's `NetCoreService.setEvent`. */
export function track(eventName: string, payload: Record<string, unknown>): void {
  if (!isTrackingEnabled()) return;
  SmartechBaseReact.trackEvent(eventName, { ...payload, source: 'App' });
}

export function setScreenName(screenName: string): void {
  track('screen_view', { screenname: screenName });
}
```

- [ ] **Step 2: Write the barrel `index.ts`**

```ts
export { initNetcore, identify, logout, updateProfile, track, setScreenName } from './netcoreClient';
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```
Expected: clean. Nothing calls this module yet.

- [ ] **Step 4: Commit**

```bash
git add src/services/netcore/netcoreClient.ts src/services/netcore/index.ts
git commit -m "feat: add Netcore identity/event service module"
```

---

### Task 3: Wire SDK init into `_layout.tsx`

**Files:**
- Modify: `src/app/_layout.tsx`

- [ ] **Step 1: Add the import and module-scope init call**

In the import block (after the existing `import { initPush, registerBackgroundHandler, registerDeviceToken } from '@/services/push';` at line 22):

```ts
import { initNetcore, identify as identifyNetcore } from '@/services/netcore';
```

At module scope, right after `initPush();` (line 43):

```ts
initPush();
initNetcore();
```

- [ ] **Step 2: Wire cold-start re-identify**

In the boot effect's already-authenticated branch (lines 70-74), alongside the
existing `registerDeviceToken`/`setCrashlyticsUser` calls:

```ts
      const { isAuthenticated, profile } = useAuthStore.getState();
      if (isAuthenticated && profile) {
        void registerDeviceToken(profile._id);
        setCrashlyticsUser(profile._id);
        identifyNetcore(profile.phoneNo);
      }
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npx expo run:android
```
Expected: `tsc` clean; app launches with no crash (Netcore's `trackAppInstallUpdateBySmartech()`
and deeplink listener now register on every boot, in production builds only — this
dev build has `env.production` following `EXPO_PUBLIC_ENV`, so confirm which profile
you're running against if you want to see it actually fire; either way it must not
crash regardless of the gate's outcome).

- [ ] **Step 4: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "feat: initialize Netcore SDK and wire cold-start re-identify"
```

---

### Task 4: Push bridging — `src/services/netcore/netcorePush.ts`

**Files:**
- Create: `src/services/netcore/netcorePush.ts`
- Modify: `src/services/netcore/index.ts`
- Modify: `src/services/push/notifications.ts`

- [ ] **Step 1: Write `netcorePush.ts`**

```ts
import SmartechPushReact from 'smartech-push-react-native';
import type { RemoteMessage } from '@react-native-firebase/messaging';

import { env } from '@/config';

function isTrackingEnabled(): boolean {
  return env.production;
}

/** Forward this device's FCM token to Netcore — Netcore never registers its
 * own FCM listener (`useSmartechFCM: false` in app.json's plugin config); the
 * app's existing RNFB pipeline owns the token, this just also tells Netcore
 * about it, exactly like the Ionic app's `MyFirebaseMessagingService`
 * forwards to `SmartPush.setDevicePushToken`. */
export function bridgeDeviceToken(token: string): void {
  if (!isTrackingEnabled()) return;
  SmartechPushReact.setDevicePushToken(token);
}

/** Forward a received remote message's data payload to Netcore so it can
 * record/attribute pushes that originated from a Netcore campaign. Does not
 * take over rendering — notifee continues to own that (see
 * `notifications.ts`'s `displayForegroundNotification`). */
export function bridgeRemoteMessage(message: RemoteMessage): void {
  if (!isTrackingEnabled()) return;
  SmartechPushReact.handlePushNotification(message.data ?? {}, null);
}
```

- [ ] **Step 2: Update the barrel**

```ts
export { initNetcore, identify, logout, updateProfile, track, setScreenName } from './netcoreClient';
export { bridgeDeviceToken, bridgeRemoteMessage } from './netcorePush';
```

- [ ] **Step 3: Wire into `notifications.ts`**

Add the import (after the `channels`/`refreshBumpStore` imports, line 26):
```ts
import { bridgeDeviceToken, bridgeRemoteMessage } from '@/services/netcore';
```

In `registerDeviceToken` (lines 255-268), bridge both the initial token and every
refreshed token — additively, alongside the existing `authApi.saveFcmToken` calls:

```ts
export async function registerDeviceToken(profileId: string): Promise<void> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;
    await ensureNotificationChannels();
    const token = await getToken(messagingInstance);
    await authApi.saveFcmToken(profileId, token);
    bridgeDeviceToken(token);
    onTokenRefresh(messagingInstance, (nextToken) => {
      void authApi.saveFcmToken(profileId, nextToken);
      bridgeDeviceToken(nextToken);
    });
  } catch {
    // No push this session — not worth surfacing to the user.
  }
}
```

In `initPush`'s `onMessage` handler (lines 163-171), bridge before the existing
foreground-display logic runs:

```ts
  onMessage(messagingInstance, async (message) => {
    bridgeRemoteMessage(message);
    if (await handleRiderLocationUpdate(message)) return;
    if (!isSilentOrderStatusPush(message)) {
      await displayForegroundNotification(message);
    }
    if (isOrderStatusPush(message)) {
      useRefreshBumpStore.getState().bumpOrders();
    }
  });
```

In `registerBackgroundHandler`'s background message handler (lines 226-235), bridge
there too:

```ts
export function registerBackgroundHandler(): void {
  setBackgroundMessageHandler(messagingInstance, async (message) => {
    bridgeRemoteMessage(message);
    if (await handleRiderLocationUpdate(message)) return;
    // ... existing comment/no-op unchanged
  });
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 5: Manual device verification (no automated equivalent)**

Install the app, log in (triggers `registerDeviceToken`), send yourself both (a) a
normal order-status push from the backend and (b) — once Task 0/1's setup is
confirmed live in Netcore's dashboard — a test push from Netcore's own campaign tool.
Confirm: (a) still displays via notifee exactly as before (no duplicate banner), (b)
delivers without the app crashing. This directly addresses the design spec's flagged
open question about `handlePushNotification`'s behavior for non-Netcore-originated
pushes — note the result in this task's checklist before moving on.

- [ ] **Step 6: Commit**

```bash
git add src/services/netcore/netcorePush.ts src/services/netcore/index.ts src/services/push/notifications.ts
git commit -m "feat: bridge FCM device token and messages into Netcore push"
```

---

### Task 5: Identity events — login and signup

**Files:**
- Modify: `src/app/login.tsx`
- Modify: `src/app/register.tsx`

- [ ] **Step 1: Wire `login.tsx`**

Add the import (after `import { registerDeviceToken } from '@/services/push';` at
line 20):
```ts
import { identify } from '@/services/netcore';
```

In `verify()` (lines 108-117), alongside the existing `registerDeviceToken`/
`setCrashlyticsUser` calls, after `setProfile(profile)`:

```ts
      const res = await authApi.verifyOtp(phone, otp);
      if (!res?.token) throw new Error('Invalid OTP');
      await setToken(res.token);
      const profile = await fetchProfileWithRetry(res.loginInfo);
      await setProfile(profile);
      void registerDeviceToken(profile._id);
      setCrashlyticsUser(profile._id);
      identify(profile.phoneNo);
      router.replace(profile.userName && profile.email ? '/(tabs)' : '/register');
```

Note: Netcore's `login` event fires here unconditionally (matches the Ionic app,
which also calls `login`/`setUserIdentity` on every successful OTP verify regardless
of whether this is a new or returning user) — the `user_signup` distinction is a
separate event fired in `register.tsx` below, once name/email are actually captured.

- [ ] **Step 2: Wire `register.tsx`**

Add the import (after `import { profileSchema, type ProfileForm } from '@/features/auth/schemas';`
at line 17):
```ts
import { track, updateProfile } from '@/services/netcore';
```

In `confirm()` (lines 71-90), after `setProfile(...)`:

```ts
  const confirm = handleSubmit(async ({ name, email, referral }) => {
    if (!profile?._id) {
      setApiError('Session expired — please log in again.');
      return;
    }
    setApiError(null);
    try {
      const updated = await authApi.updateProfile(profile._id, {
        userName: name,
        email,
        installReferrer: referral && referralStatus === 'valid' ? referral : undefined,
      });
      await setProfile(
        updated && updated._id ? updated : { ...profile, userName: name, email },
      );
      updateProfile({ name, email });
      track('user_signup', { mobile: profile.phoneNo });
      router.replace('/(tabs)');
    } catch {
      setApiError('Could not save your details. Please try again.');
    }
  });
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/login.tsx src/app/register.tsx
git commit -m "feat: track Netcore login and signup identity events"
```

---

### Task 6: Identity events — profile update and logout

**Files:**
- Modify: `src/app/profile-edit.tsx`
- Modify: `src/features/profile/profileApi.ts`
- Modify: `src/app/profile.tsx`

- [ ] **Step 1: Wire `profile-edit.tsx`**

Add the import (after `import { EditProfileForm, profileApi, type EditProfileValues } from '@/features/profile';`
at line 10):
```ts
import { updateProfile as updateNetcoreProfile } from '@/services/netcore';
```

In `onSubmit()` (lines 37-58), after `setProfile(res ?? merged)`:

```ts
    try {
      const res = await profileApi.saveProfile(profile._id, merged);
      await setProfile(res ?? merged);
      updateNetcoreProfile({ name: values.userName, email: values.email });
      if (router.canGoBack()) router.back();
      else router.replace('/profile');
    } catch {
```

(This is the returning-user profile-edit path — distinct from `register.tsx`'s
first-time-signup path in Task 5, which already tracks its own `updateProfile` call.)

- [ ] **Step 2: Wire `profile.tsx`**

Add the import (after `import { unregisterDeviceToken } from '@/services/push';` at
line 33):
```ts
import { logout as logoutNetcore, track } from '@/services/netcore';
```

In `doSignOut()` (lines 75-93), alongside the existing `setCrashlyticsUser(null)`:

```ts
  async function doSignOut() {
    setSignOutVisible(false);
    if (profile) {
      await unregisterDeviceToken(profile._id);
      track('user_logout', { user_id: profile._id });
    }
    try {
      await authApi.logout();
    } catch {
      // clear the local session regardless of network errors
    }
    resetCartStores();
    await clearSession();
    setCrashlyticsUser(null);
    logoutNetcore();
    // Clear the whole nav stack so Back can't return to authenticated screens.
    if (router.canDismiss()) {
      router.dismissAll();
    }
    router.replace('/welcome');
  }
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/profile-edit.tsx src/app/profile.tsx
git commit -m "feat: track Netcore profile-update and logout identity events"
```

---

### Task 7: `useScreenTracking` hook + wire into onboarding/tab screens

**Files:**
- Create: `src/services/netcore/useScreenTracking.ts`
- Modify: `src/services/netcore/index.ts`
- Modify: `src/app/welcome.tsx`
- Modify: `src/app/login.tsx`
- Modify: `src/app/register.tsx`
- Modify: `src/app/(tabs)/index.tsx`
- Modify: `src/app/(tabs)/explore.tsx`

- [ ] **Step 1: Write the hook**

```ts
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { setScreenName } from './netcoreClient';

/** Fires Netcore's `screen_view` event every time this screen gains focus —
 * the RN equivalent of the Ionic app's imperative `setScreenName()` call in
 * each page component, but automatic (no call site can forget it) via
 * `useFocusEffect`, which re-fires on every focus (initial mount AND
 * returning via back-navigation), matching how a user actually re-views a
 * screen in a stack-based nav. */
export function useScreenTracking(screenName: string): void {
  useFocusEffect(
    useCallback(() => {
      setScreenName(screenName);
    }, [screenName]),
  );
}
```

- [ ] **Step 2: Update the barrel**

```ts
export { initNetcore, identify, logout, updateProfile, track, setScreenName } from './netcoreClient';
export { bridgeDeviceToken, bridgeRemoteMessage } from './netcorePush';
export { useScreenTracking } from './useScreenTracking';
```

- [ ] **Step 3: Wire into `welcome.tsx`, `login.tsx`, `register.tsx`, tabs**

In each screen's default-export component, add the import and a call at the top of
the component body (before any early returns). Example for `login.tsx` (add to the
existing import block, then call inside `LoginScreen()` right after the existing
`useState`/`useForm` hooks, before `useEffect(...)` at line 82):

```ts
import { useScreenTracking } from '@/services/netcore';
// ...
export default function LoginScreen() {
  useScreenTracking('login');
  const router = useRouter();
  // ... rest unchanged
```

Repeat the same pattern for:
- `src/app/welcome.tsx` → `useScreenTracking('welcome')`
- `src/app/register.tsx` → `useScreenTracking('register')`
- `src/app/(tabs)/index.tsx` → `useScreenTracking('home')`
- `src/app/(tabs)/explore.tsx` → `useScreenTracking('explore')`

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/services/netcore/useScreenTracking.ts src/services/netcore/index.ts src/app/welcome.tsx src/app/login.tsx src/app/register.tsx "src/app/(tabs)/index.tsx" "src/app/(tabs)/explore.tsx"
git commit -m "feat: add Netcore screen-view tracking hook, wire into onboarding and tabs"
```

---

### Task 8: Screen tracking — profile, wallet, support screens

**Files:**
- Modify: `src/app/profile.tsx`
- Modify: `src/app/profile-edit.tsx`
- Modify: `src/app/wallet.tsx`
- Modify: `src/app/cashback.tsx`
- Modify: `src/app/refer-earn.tsx`
- Modify: `src/app/feedback.tsx`
- Modify: `src/app/help.tsx`
- Modify: `src/app/support-chat.tsx`

- [ ] **Step 1: Add `useScreenTracking(...)` to each screen's default component**

Same pattern as Task 7 — import `useScreenTracking` from `@/services/netcore` (merge
into `profile.tsx`'s and `profile-edit.tsx`'s existing Netcore imports from Task 6
rather than a duplicate import line), call it as the first line inside the component
body:

| File | Screen name |
|---|---|
| `profile.tsx` | `'profile'` |
| `profile-edit.tsx` | `'profile_edit'` |
| `wallet.tsx` | `'wallet'` |
| `cashback.tsx` | `'cashback'` |
| `refer-earn.tsx` | `'refer_earn'` |
| `feedback.tsx` | `'feedback'` |
| `help.tsx` | `'help'` |
| `support-chat.tsx` | `'support_chat'` |

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/profile.tsx src/app/profile-edit.tsx src/app/wallet.tsx src/app/cashback.tsx src/app/refer-earn.tsx src/app/feedback.tsx src/app/help.tsx src/app/support-chat.tsx
git commit -m "feat: wire Netcore screen-view tracking into profile and support screens"
```

---

### Task 9: Screen tracking — address and subscription/dine-in screens

**Files:**
- Modify: `src/app/addresses.tsx`
- Modify: `src/app/address-form.tsx`
- Modify: `src/app/subscription-plan.tsx`
- Modify: `src/app/subscription-configure.tsx`
- Modify: `src/app/subscription-detail.tsx`
- Modify: `src/app/manage-subscription.tsx`

- [ ] **Step 1: Add `useScreenTracking(...)` to each screen**

| File | Screen name |
|---|---|
| `addresses.tsx` | `'addresses'` |
| `address-form.tsx` | `'address_form'` |
| `subscription-plan.tsx` | `'subscription_plan'` |
| `subscription-configure.tsx` | `'subscription_configure'` |
| `subscription-detail.tsx` | `'subscription_detail'` |
| `manage-subscription.tsx` | `'manage_subscription'` |

Same import + first-line-of-component pattern as Task 7. For `address-form.tsx`,
since the same screen serves both add and edit, use a dynamic name:
```ts
useScreenTracking(isEdit ? 'address_edit' : 'address_add');
```
(place this call after `isEdit` is computed, i.e. after line 22, not before).

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/addresses.tsx src/app/address-form.tsx src/app/subscription-plan.tsx src/app/subscription-configure.tsx src/app/subscription-detail.tsx src/app/manage-subscription.tsx
git commit -m "feat: wire Netcore screen-view tracking into address and subscription screens"
```

---

### Task 10: Screen tracking — bulk, on-demand, marketplace, orders, cart screens

**Files:**
- Modify: `src/app/bulk-menu.tsx`
- Modify: `src/app/bulk-cart.tsx`
- Modify: `src/app/on-demand-kitchens.tsx`
- Modify: `src/app/on-demand-kitchen.tsx`
- Modify: `src/app/on-demand-cart.tsx`
- Modify: `src/app/marketplace.tsx`
- Modify: `src/app/cart.tsx`
- Modify: `src/app/orders.tsx`
- Modify: `src/app/my-orders.tsx`
- Modify: `src/app/order-detail.tsx`
- Modify: `src/app/order-history/[category].tsx`
- Modify: `src/app/order-result.tsx`

- [ ] **Step 1: Add `useScreenTracking(...)` to each screen**

| File | Screen name |
|---|---|
| `bulk-menu.tsx` | `'bulk_menu'` |
| `bulk-cart.tsx` | `'bulk_cart'` |
| `on-demand-kitchens.tsx` | `` `ondemand_kitchens_${mode}` `` (use the already-destructured `mode` local) |
| `on-demand-kitchen.tsx` | `'ondemand_kitchen'` |
| `on-demand-cart.tsx` | `'ondemand_cart'` |
| `marketplace.tsx` | `'marketplace'` |
| `cart.tsx` | `'subscription_cart'` |
| `orders.tsx` | `'orders'` |
| `my-orders.tsx` | `'my_orders'` |
| `order-detail.tsx` | `'order_detail'` |
| `order-history/[category].tsx` | `` `order_history_${category}` `` (use the route's own `category` param) |
| `order-result.tsx` | `` `order_result_${status}` `` (use the already-destructured `status` local — after it's normalized, i.e. after line 103) |

For `on-demand-kitchens.tsx`, place the call after `mode` is computed (after line 28):
```ts
  const mode: OnDemandMode = modeParam === 'advance' ? 'advance' : 'allDay';
  useScreenTracking(`ondemand_kitchens_${mode}`);
```

For `order-result.tsx`, place the call after `status` is computed (after line 103):
```ts
  const status: PaymentStatus = rawStatus === 'success' ? 'success' : 'failed';
  useScreenTracking(`order_result_${status}`);
```

For `cart.tsx`, note the import merges into cart.tsx's Task-12 changes if that task
runs first (order-independent either way — same import line, no conflict).

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/bulk-menu.tsx src/app/bulk-cart.tsx src/app/on-demand-kitchens.tsx src/app/on-demand-kitchen.tsx src/app/on-demand-cart.tsx src/app/marketplace.tsx src/app/cart.tsx src/app/orders.tsx src/app/my-orders.tsx src/app/order-detail.tsx "src/app/order-history/[category].tsx" src/app/order-result.tsx
git commit -m "feat: wire Netcore screen-view tracking into commerce and order screens"
```

---

### Task 11: Commerce event payload builders — `src/services/netcore/events.ts`

**Files:**
- Create: `src/services/netcore/events.ts`
- Modify: `src/services/netcore/index.ts`

- [ ] **Step 1: Write `events.ts`**

```ts
import { track } from './netcoreClient';

/** One cart line's e-commerce payload — mirrors the field names the Ionic
 * app's NetCoreService has always sent (`prid`/`product_name`/`category_name`/
 * `product_price`/`prqt`/`image_url`), kept stable across the Ionic→RN
 * transition so historical Netcore dashboard reports stay comparable. */
export interface CartEventItem {
  prid: string;
  product_name: string;
  category_name: string;
  product_price: number;
  prqt: number;
  image_url?: string;
  final_price?: number;
  selling_price?: number;
}

export interface CartTotals {
  total_items: number;
  total_prqt: number;
  selling_amount: number;
  discount_amt?: number;
}

/** The RN app's order-type identifiers — mirrors the Ionic app's `orderType`
 * branch values ('subscription' | 'bulk' | 'allDay' | 'advance'); 'navmool'
 * intentionally omitted — see marketplace.tsx's own comment (Task 18). */
export type NetcoreOrderType = 'subscription' | 'bulk' | 'allDay' | 'advance';

export function trackAddToCart(orderType: NetcoreOrderType, item: CartEventItem): void {
  track('add_to_cart', { orderType, ...item });
}

export function trackRemoveFromCart(orderType: NetcoreOrderType, item: CartEventItem): void {
  track('remove_from_cart', { orderType, ...item });
}

export function trackViewCartItems(orderType: NetcoreOrderType, items: CartEventItem[], totals: CartTotals): void {
  track('view_cart_items', { orderType, items, ...totals });
}

export function trackCartUpdated(orderType: NetcoreOrderType, items: CartEventItem[], totals: CartTotals): void {
  track('cart_updated', { orderType, items, ...totals });
}

export function trackProceedToCheckout(orderType: NetcoreOrderType, totals: CartTotals): void {
  track('proceed_to_checkout', { orderType, ...totals });
}

export interface PurchasePayload extends CartTotals {
  items: CartEventItem[];
  amount: number;
}

export function trackPurchase(orderType: NetcoreOrderType, payload: PurchasePayload): void {
  track('product_purchase', { orderType, ...payload });
}

export function trackPurchaseFailed(orderType: NetcoreOrderType, payload: PurchasePayload): void {
  track('purchase_failed', { orderType, ...payload });
}

export interface AddressEventPayload {
  flat?: string;
  landmark?: string;
  pincode?: string;
  city?: string;
  state?: string;
}

export function trackSelectAddress(address: AddressEventPayload): void {
  track('select_address', address);
}

export function trackAddAddress(address: AddressEventPayload): void {
  track('add_address', address);
}

export function trackLocateMe(address: AddressEventPayload | null): void {
  track('locate_me', address ?? {});
}

export function trackCategoryViewed(categoryName: string): void {
  track('category_viewed', { category_name: categoryName });
}

export function trackSubAddonSelected(addonName: string, addonType: string | undefined, selected: boolean): void {
  track('sub_addon_selected', { addon_name: addonName, addon_type: addonType, selected });
}

export function trackProductView(productName: string, categoryName?: string, price?: number): void {
  track('product_view', { product_name: productName, category_name: categoryName, product_price: price });
}

/** Not yet wired anywhere — no cancel-order action exists in the RN app today
 * (see design spec's "Known gaps"). Written ahead of time so wiring it later,
 * once a cancel flow ships, is a one-line call instead of a new function. */
export function trackOrderCancelled(orderId: string, reason?: string): void {
  track('order_cancelled', { order_id: orderId, reason });
}
```

- [ ] **Step 2: Update the barrel**

```ts
export { initNetcore, identify, logout, updateProfile, track, setScreenName } from './netcoreClient';
export { bridgeDeviceToken, bridgeRemoteMessage } from './netcorePush';
export { useScreenTracking } from './useScreenTracking';
export {
  trackAddToCart,
  trackRemoveFromCart,
  trackViewCartItems,
  trackCartUpdated,
  trackProceedToCheckout,
  trackPurchase,
  trackPurchaseFailed,
  trackSelectAddress,
  trackAddAddress,
  trackLocateMe,
  trackCategoryViewed,
  trackSubAddonSelected,
  trackProductView,
  trackOrderCancelled,
  type CartEventItem,
  type CartTotals,
  type NetcoreOrderType,
  type PurchasePayload,
  type AddressEventPayload,
} from './events';
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```
Expected: clean. Nothing calls these yet.

- [ ] **Step 4: Commit**

```bash
git add src/services/netcore/events.ts src/services/netcore/index.ts
git commit -m "feat: add Netcore commerce event payload builders"
```

---

### Task 12: Wire subscription cart events into `cartStore.ts`

**Files:**
- Modify: `src/store/cartStore.ts`

- [ ] **Step 1: Add the import and a payload-builder helper**

```ts
import { create } from 'zustand';

import { STORAGE_KEYS } from '@/config';
import { clusterApi } from '@/features/location/clusterApi';
import { chargesFromConfig, DEFAULT_CHARGES } from '@/features/cart/bill';
import type { AppliedCoupon, BillCharges, Cart, SubscriptionConfig } from '@/features/cart/types';
import { kvStorage } from '@/services/storage/kvStore';
import { trackAddToCart, trackCartUpdated, trackRemoveFromCart, type CartEventItem } from '@/services/netcore';

import { useClusterStore } from './clusterStore';

const EMPTY_CART: Cart = { orderType: 'subscription', item: null, coupon: null };

/** Netcore's e-commerce payload for the single subscription cart line — same
 * field mapping the design spec documents (prid/product_name/category_name/
 * product_price/prqt/image_url from the package, count as prqt). */
function subscriptionCartEventItem(item: NonNullable<Cart['item']>): CartEventItem {
  return {
    prid: item.package._id ?? '',
    product_name: item.package.packageName ?? item.category,
    category_name: item.category,
    product_price: item.package.packagePrice,
    prqt: item.count,
    image_url: item.package.imageUrl,
  };
}
```

- [ ] **Step 2: Fire events from `setSubscription` and `setCount`**

```ts
  setSubscription: (config) => {
    const prev = get().cart.item;
    const isNewLine = !prev || prev.package._id !== config.package._id;
    const count = isNewLine ? 1 : prev.count;
    const item = { ...config, count };
    const cart: Cart = { ...get().cart, item };
    writeCart(cart);
    set({ cart });
    if (isNewLine) {
      trackAddToCart('subscription', subscriptionCartEventItem(item));
    }
  },

  setCount: (count) => {
    const item = get().cart.item;
    if (!item || count < 1) {
      return;
    }
    const nextItem = { ...item, count };
    const cart: Cart = { ...get().cart, item: nextItem };
    writeCart(cart);
    set({ cart });
    if (count > item.count) {
      trackAddToCart('subscription', subscriptionCartEventItem(nextItem));
    } else if (count < item.count) {
      trackRemoveFromCart('subscription', subscriptionCartEventItem(nextItem));
    }
  },
```

- [ ] **Step 3: Fire `cart_updated` from `applyCoupon`/`clearCoupon`**

```ts
  applyCoupon: (coupon) => {
    const cart: Cart = { ...get().cart, coupon };
    writeCart(cart);
    set({ cart });
    if (cart.item) {
      trackCartUpdated('subscription', [subscriptionCartEventItem(cart.item)], {
        total_items: 1,
        total_prqt: cart.item.count,
        selling_amount: cart.item.package.packagePrice * cart.item.count,
        discount_amt: coupon.discount,
      });
    }
  },

  clearCoupon: () => {
    const cart: Cart = { ...get().cart, coupon: null };
    writeCart(cart);
    set({ cart });
    if (cart.item) {
      trackCartUpdated('subscription', [subscriptionCartEventItem(cart.item)], {
        total_items: 1,
        total_prqt: cart.item.count,
        selling_amount: cart.item.package.packagePrice * cart.item.count,
      });
    }
  },
```

Note on Dine In: `DineInHome.tsx`'s `continueToConfigure()` sets
`config.isDineIn: true` before this same `setSubscription` action runs (via
`subscription-configure.tsx`'s `save()`) — no separate wiring needed here, the
`isDineIn` flag already rides along inside `config`/`item` if a consumer wants to
branch on it later (the Ionic `dine_in_package_added` event is intentionally *not*
a separate call here, per the design spec — it's the same `add_to_cart` call with
`isDineIn: true` on the item, matching that there's no distinct RN flow for it).

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/store/cartStore.ts
git commit -m "feat: track Netcore add/remove/cart-update events for the subscription cart"
```

---

### Task 13: Wire bulk cart events into `useBulkCartStore.ts`

**Files:**
- Modify: `src/features/bulk/useBulkCartStore.ts`

- [ ] **Step 1: Add the import and payload-builder helper**

```ts
import { create } from 'zustand';

import { STORAGE_KEYS } from '@/config';
import { kvStorage } from '@/services/storage/kvStore';
import { trackAddToCart, trackCartUpdated, trackRemoveFromCart, type CartEventItem } from '@/services/netcore';

import { deliveryDateCountFor, isBelowMoq, unitPriceFor } from './pricing';
import type { AppliedCoupon } from '../cart/types';
import type { BulkCartLine, BulkCategory, BulkMenuItem, BulkOrgInfo, BulkPackaging } from './types';

// ... EMPTY_BULK_CART / interfaces unchanged ...

function bulkCartEventItem(line: BulkCartLine, category: BulkCategory): CartEventItem {
  return {
    prid: line.item._id,
    product_name: line.item.itemName,
    category_name: category,
    product_price: line.itemPrice,
    prqt: line.count,
    image_url: line.item.itemImage,
  };
}

function bulkTotals(lines: BulkCartLine[]): { total_items: number; total_prqt: number; selling_amount: number } {
  return {
    total_items: lines.length,
    total_prqt: lines.reduce((sum, l) => sum + l.count, 0),
    selling_amount: lines.reduce((sum, l) => sum + l.itemPrice * l.count, 0),
  };
}
```

- [ ] **Step 2: Fire events from `setCount`**

Insert right before the final `writeCart(cart); set({ cart });` in `setCount` (after
the `nextLines` computation, before the `cart` object is built at line 117):

```ts
    const cart: BulkCart = {
      category,
      packaging,
      orgInfo,
      lines: nextLines,
      coupon: sameContext ? current.coupon : null,
    };
    writeCart(cart);
    set({ cart });

    const changedLine = nextLines.find((l) => l.item._id === item._id);
    if (changedLine && resolvedCount > previousCount) {
      trackAddToCart(bulkOrderTypeFor(category), bulkCartEventItem(changedLine, category));
    } else if (resolvedCount < previousCount) {
      // Line removed or reduced — report the pre-change line/quantity being removed.
      trackRemoveFromCart(bulkOrderTypeFor(category), {
        ...bulkCartEventItem(changedLine ?? { item, count: previousCount, itemPrice: unitPriceFor(item, previousCount, orgInfo, category), deliveryDateCount: 0 }, category),
        prqt: previousCount - resolvedCount,
      });
    }
    trackCartUpdated(bulkOrderTypeFor(category), nextLines.map((l) => bulkCartEventItem(l, category)), bulkTotals(nextLines));
  },
```

Add the small mapping helper Netcore's `NetcoreOrderType` needs (bulk collapses to a
single `'bulk'` value regardless of packaging — matches the design spec's taxonomy,
which doesn't split bulk further for analytics purposes even though the *backend*
`orderType` does via `bulkOrderType()`):

```ts
function bulkOrderTypeFor(_category: BulkCategory): 'bulk' {
  return 'bulk';
}
```

(Place this helper next to `bulkCartEventItem`/`bulkTotals` above.)

- [ ] **Step 3: Fire `cart_updated` from `applyCoupon`/`clearCoupon`**

```ts
  applyCoupon: (coupon) => {
    const cart: BulkCart = { ...get().cart, coupon };
    writeCart(cart);
    set({ cart });
    if (cart.category) {
      trackCartUpdated('bulk', cart.lines.map((l) => bulkCartEventItem(l, cart.category!)), {
        ...bulkTotals(cart.lines),
        discount_amt: coupon.discount,
      });
    }
  },

  clearCoupon: () => {
    const cart: BulkCart = { ...get().cart, coupon: null };
    writeCart(cart);
    set({ cart });
    if (cart.category) {
      trackCartUpdated('bulk', cart.lines.map((l) => bulkCartEventItem(l, cart.category!)), bulkTotals(cart.lines));
    }
  },
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/bulk/useBulkCartStore.ts
git commit -m "feat: track Netcore add/remove/cart-update events for the bulk cart"
```

---

### Task 14: Wire on-demand cart events into `useOnDemandCartStore.ts`

**Files:**
- Modify: `src/features/on-demand/useOnDemandCartStore.ts`

- [ ] **Step 1: Add the import and payload-builder helper**

```ts
import { create } from 'zustand';

import { STORAGE_KEYS } from '@/config';
import { kvStorage } from '@/services/storage/kvStore';
import { trackAddToCart, trackCartUpdated, trackRemoveFromCart, type CartEventItem } from '@/services/netcore';

import type { AppliedCoupon } from '../cart/types';
import type { OnDemandCartLine, OnDemandKitchen, OnDemandMenuItem, OnDemandMode } from './types';

// ... EMPTY_CART / interfaces unchanged ...

function onDemandCartEventItem(line: OnDemandCartLine, kitchen: OnDemandKitchen | null): CartEventItem {
  return {
    prid: line.item._id,
    product_name: line.item.itemName,
    category_name: kitchen?.kitchenName ?? '',
    product_price: line.item.itemPrice,
    prqt: line.count,
    image_url: line.item.itemImage,
  };
}

function onDemandTotals(lines: OnDemandCartLine[]): { total_items: number; total_prqt: number; selling_amount: number } {
  return {
    total_items: lines.length,
    total_prqt: lines.reduce((sum, l) => sum + l.count, 0),
    selling_amount: lines.reduce((sum, l) => sum + l.item.itemPrice * l.count, 0),
  };
}
```

- [ ] **Step 2: Fire events from `setCount`**

Insert right before the final `writeCart(cart); set({ cart });` in `setCount` (after
`nextLines` is computed, before the `cart` object at line 85):

```ts
    const cart: OnDemandCart = {
      kitchen,
      mode,
      lines: nextLines,
      coupon: sameContext ? current.coupon : null,
    };
    writeCart(cart);
    set({ cart });

    const previousCount = lines.find((l) => l.item._id === item._id)?.count ?? 0;
    const changedLine = nextLines.find((l) => l.item._id === item._id);
    if (changedLine && resolvedCount > previousCount) {
      trackAddToCart(mode, onDemandCartEventItem(changedLine, kitchen));
    } else if (resolvedCount < previousCount) {
      trackRemoveFromCart(mode, {
        ...onDemandCartEventItem(changedLine ?? { item, count: previousCount }, kitchen),
        prqt: previousCount - resolvedCount,
      });
    }
    trackCartUpdated(mode, nextLines.map((l) => onDemandCartEventItem(l, kitchen)), onDemandTotals(nextLines));
  },
```

Note: `previousCount` must be computed from `lines` (the pre-context-switch snapshot
already in scope at that point in the function, per the existing code at line 69),
not re-derived from `current.lines` — the existing function already binds `lines`
that way (`const lines = sameContext ? current.lines : [];`), so this reads the same
variable already in scope.

- [ ] **Step 3: Fire `cart_updated` from `applyCoupon`/`clearCoupon`**

```ts
  applyCoupon: (coupon) => {
    const cart: OnDemandCart = { ...get().cart, coupon };
    writeCart(cart);
    set({ cart });
    if (cart.mode) {
      trackCartUpdated(cart.mode, cart.lines.map((l) => onDemandCartEventItem(l, cart.kitchen)), {
        ...onDemandTotals(cart.lines),
        discount_amt: coupon.discount,
      });
    }
  },

  clearCoupon: () => {
    const cart: OnDemandCart = { ...get().cart, coupon: null };
    writeCart(cart);
    set({ cart });
    if (cart.mode) {
      trackCartUpdated(cart.mode, cart.lines.map((l) => onDemandCartEventItem(l, cart.kitchen)), onDemandTotals(cart.lines));
    }
  },
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/on-demand/useOnDemandCartStore.ts
git commit -m "feat: track Netcore add/remove/cart-update events for the on-demand cart"
```

---

### Task 15: Checkout and purchase events — all three `pay()` flows + `order-result.tsx`

**Files:**
- Modify: `src/app/cart.tsx`
- Modify: `src/app/bulk-cart.tsx`
- Modify: `src/app/on-demand-cart.tsx`

- [ ] **Step 1: Wire `cart.tsx`'s `pay()`**

Add the import (merge with the Task 10 screen-tracking import if that task ran
first — both come from `@/services/netcore`):
```ts
import { trackProceedToCheckout, trackPurchase, trackPurchaseFailed } from '@/services/netcore';
```

In `pay()` (lines 202-264), fire `proceed_to_checkout` at entry and the purchase
result right after `payWithJusPay` resolves:

```ts
  const pay = async (): Promise<void> => {
    if (!requireLogin(router) || !profile) return;
    setPaying(true);
    trackProceedToCheckout('subscription', {
      total_items: 1,
      total_prqt: item.count,
      selling_amount: bill.toPay,
      discount_amt: bill.discount,
    });
    try {
      const body: SubscriptionOrderBody = {
        // ... unchanged
      };
      const result = await payWithJusPay(ENDPOINTS.juspay.startSubscription, body);
      const purchasePayload = {
        items: [
          {
            prid: pkg._id ?? '',
            product_name: pkg.packageName ?? item.category,
            category_name: item.category,
            product_price: pkg.packagePrice,
            prqt: item.count,
            image_url: pkg.imageUrl,
          },
        ],
        total_items: 1,
        total_prqt: item.count,
        selling_amount: bill.toPay,
        amount: bill.toPay,
        discount_amt: bill.discount,
      };
      if (result.status !== 'failed') {
        trackPurchase('subscription', purchasePayload);
        useCartStore.getState().reset();
        useConfigureStore.getState().clear();
      } else {
        trackPurchaseFailed('subscription', purchasePayload);
      }
      router.push({
        // ... unchanged
      });
    } finally {
      setPaying(false);
    }
  };
```

- [ ] **Step 2: Wire `bulk-cart.tsx`'s `pay()`**

Add the import:
```ts
import { trackProceedToCheckout, trackPurchase, trackPurchaseFailed } from '@/services/netcore';
```

In `pay()` (lines 218-264):

```ts
  const pay = async (): Promise<void> => {
    if (!requireLogin(router) || !profile || !address || !cart.category || !cart.packaging) return;
    setPaying(true);
    const totals = {
      total_items: cart.lines.length,
      total_prqt: cart.lines.reduce((sum, l) => sum + l.count, 0),
      selling_amount: bill.toPay,
      discount_amt: bill.discount,
    };
    trackProceedToCheckout('bulk', totals);
    try {
      const body: BulkOrderBody = {
        // ... unchanged
      };
      const result = await payWithJusPay(ENDPOINTS.juspay.startBulk, body);
      const purchasePayload = {
        items: cart.lines.map((l) => ({
          prid: l.item._id,
          product_name: l.item.itemName,
          category_name: cart.category!,
          product_price: l.itemPrice,
          prqt: l.count,
          image_url: l.item.itemImage,
        })),
        ...totals,
        amount: bill.toPay,
      };
      if (result.status !== 'failed') {
        trackPurchase('bulk', purchasePayload);
        useBulkCartStore.getState().reset();
      } else {
        trackPurchaseFailed('bulk', purchasePayload);
      }
      router.push({
        // ... unchanged
      });
    } finally {
      setPaying(false);
    }
  };
```

- [ ] **Step 3: Wire `on-demand-cart.tsx`'s `pay()`**

Add the import:
```ts
import { trackProceedToCheckout, trackPurchase, trackPurchaseFailed } from '@/services/netcore';
```

In `pay()` (lines 202-252):

```ts
  const pay = async (): Promise<void> => {
    if (!requireLogin(router) || !profile || !address || !cart.mode) return;
    setPaying(true);
    const totals = {
      total_items: cart.lines.length,
      total_prqt: cart.lines.reduce((sum, l) => sum + l.count, 0),
      selling_amount: bill.toPay,
      discount_amt: bill.discount,
    };
    trackProceedToCheckout(cart.mode, totals);
    try {
      const body: OnDemandOrderBody = {
        // ... unchanged
      };
      const result = await payWithJusPay(ENDPOINTS.juspay.startSubscription, body);
      const purchasePayload = {
        items: cart.lines.map((l) => ({
          prid: l.item._id,
          product_name: l.item.itemName,
          category_name: cart.kitchen?.kitchenName ?? '',
          product_price: l.item.itemPrice,
          prqt: l.count,
          image_url: l.item.itemImage,
        })),
        ...totals,
        amount: bill.toPay,
      };
      if (result.status !== 'failed') {
        trackPurchase(cart.mode, purchasePayload);
        useOnDemandCartStore.getState().reset();
      } else {
        trackPurchaseFailed(cart.mode, purchasePayload);
      }
      router.push({
        // ... unchanged
      });
    } finally {
      setPaying(false);
    }
  };
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/cart.tsx src/app/bulk-cart.tsx src/app/on-demand-cart.tsx
git commit -m "feat: track Netcore checkout and purchase events for all three carts"
```

---

### Task 16: Address events at the store level — `locationStore.ts`

**Files:**
- Modify: `src/store/locationStore.ts`

- [ ] **Step 1: Add the import and a payload-mapping helper**

```ts
import { create } from 'zustand';

import { STORAGE_KEYS } from '@/config';
import type { CustomerProfile } from '@/features/auth/types';
import { getGps, matchSavedAddress, reverseGeocode } from '@/features/location/geo';
import { locationApi } from '@/features/location/locationApi';
import { isSameAddress } from '@/features/location/types';
import type { Address } from '@/features/location/types';
import { kvStorage } from '@/services/storage/kvStore';
import { trackAddAddress, trackLocateMe, trackSelectAddress, type AddressEventPayload } from '@/services/netcore';

import { useAuthStore } from './authStore';
import { useClusterStore } from './clusterStore';

// ... existing exports/helpers unchanged ...

function addressEventPayload(addr: Address): AddressEventPayload {
  return { flat: addr.address, landmark: addr.landmark, pincode: addr.pincode, city: addr.city, state: addr.state };
}
```

- [ ] **Step 2: Fire `select_address` from `setCurrent`**

```ts
  setCurrent: async (addr) => {
    writeCurrentToStorage(addr);
    set({ current: addr });
    trackSelectAddress(addressEventPayload(addr));
    // Re-detect the serviceable cluster(s) for the new address (shared combo).
    if (addr.geolocation) {
```
(only the new `trackSelectAddress(...)` line is added; everything else in the
function body is unchanged.)

- [ ] **Step 3: Fire `add_address` from `addAddress`**

```ts
  addAddress: async (addr) => {
    const saved = [...get().saved, addr];
    set({ saved });
    trackAddAddress(addressEventPayload(addr));
    await persistAddressList(saved);
    await get().setCurrent(addr);
  },
```

Note: `setCurrent` (called at the end of `addAddress`) also fires its own
`select_address` — so adding a new address emits **both** `add_address` and
`select_address`, which is intentional (the newly-added address does become the
active selection) and documented here so it isn't mistaken for a duplicate-event bug
later.

- [ ] **Step 4: Fire `locate_me` from `useCurrentLocation`**

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

(`useCurrentLocation` calling `setCurrent` internally means `locate_me` and
`select_address` both fire on a successful GPS detect — same intentional-overlap
reasoning as Step 3.)

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/store/locationStore.ts
git commit -m "feat: track Netcore address selection, addition, and locate-me events"
```

---

### Task 17: Category, product-view, and add-on events

**Files:**
- Modify: `src/features/subscription/components/SubscriptionHome.tsx`
- Modify: `src/features/bulk/components/BulkHome.tsx`
- Modify: `src/app/on-demand-kitchens.tsx`
- Modify: `src/app/subscription-plan.tsx`
- Modify: `src/app/subscription-configure.tsx`

- [ ] **Step 1: Wire `SubscriptionHome.tsx`'s `selectCategory`**

Add the import (after the existing feature imports, e.g. after
`import { TESTIMONIALS } from '../testimonials';`):
```ts
import { trackCategoryViewed } from '@/services/netcore';
```

In `selectCategory` (lines 131-134):

```ts
  function selectCategory(category: SubCategory): void {
    trackCategoryViewed(category.name);
    setCategory(category);
    router.push({ pathname: '/subscription-detail', params: { categoryParam: category.param } });
  }
```

- [ ] **Step 2: Wire `BulkHome.tsx`'s category tile press**

Add the import:
```ts
import { trackCategoryViewed } from '@/services/netcore';
```

In the `categories.map(...)` render (lines 97-105), wrap the existing `onPress`:

```ts
          {categories.map((category) => (
            <BulkCategoryTile
              key={category}
              category={category}
              itemCount={summaries[category]?.itemCount}
              moq={summaries[category]?.moq}
              onPress={() => {
                trackCategoryViewed(CATEGORY_NAMES[category]);
                router.push({ pathname: '/bulk-menu', params: { category } });
              }}
            />
          ))}
```

- [ ] **Step 3: Wire `on-demand-kitchens.tsx`'s `openKitchen`**

Add the import:
```ts
import { trackCategoryViewed } from '@/services/netcore';
```

In `openKitchen` (lines 59-64):

```ts
  function openKitchen(kitchen: OnDemandKitchen) {
    trackCategoryViewed(kitchen.kitchenName);
    router.push({
      pathname: '/on-demand-kitchen',
      params: { kitchenId: kitchen._id, mode },
    } as Href);
  }
```

- [ ] **Step 4: Wire `subscription-plan.tsx`'s package selection (best-effort `product_view`)**

Add the import:
```ts
import { trackProductView } from '@/services/netcore';
```

In the effect that syncs the selected package to the browse store (lines 117-119):

```ts
  useEffect(() => {
    setSelectedPackage(selectedPackage);
    if (selectedPackage) {
      trackProductView(selectedPackage.packageName ?? category?.name ?? '', category?.name, finalPrice(selectedPackage));
    }
  }, [selectedPackage, setSelectedPackage, category]);
```

(This fires once for the auto-selected default package on mount, and again every
time the user taps a different `PlanTierCard` — both are genuine "viewed this
package" moments, matching `product_view`'s intent.)

- [ ] **Step 5: Wire `subscription-configure.tsx`'s `toggleAddon`**

Add the import (after the existing `@/features/subscription` import block):
```ts
import { trackSubAddonSelected } from '@/services/netcore';
```

In `toggleAddon` (lines 105-113):

```ts
  const toggleAddon = (a: AddOn): void => {
    const key = addonKey(a);
    const willSelect = !selectedAddonIds.has(key);
    trackSubAddonSelected(a.addonName ?? '', a.addOnType, willSelect);
    setSelectedAddonIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
```

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/subscription/components/SubscriptionHome.tsx src/features/bulk/components/BulkHome.tsx src/app/on-demand-kitchens.tsx src/app/subscription-plan.tsx src/app/subscription-configure.tsx
git commit -m "feat: track Netcore category-viewed, product-view, and add-on-selected events"
```

---

### Task 18: Document known gaps + final full verification

**Files:**
- Modify: `src/app/marketplace.tsx`

- [ ] **Step 1: Add the gap comment to `marketplace.tsx`**

At the top of the file, extend the existing file-level comment (line 17):

```ts
/** Navmool (grocery marketplace) — embedded as a WebView until the native port lands.
 * No Netcore commerce events (add_to_cart/purchase/etc.) fire for marketplace
 * orders: all cart/checkout happens inside navmool.com's own JS, invisible to
 * this WebView. If a `postMessage`/`injectedJavaScript` bridge is ever added
 * here, wire it to `src/services/netcore/events.ts`'s trackers at that point —
 * see the design spec's "Known gaps" section for the full reasoning. */
```

- [ ] **Step 2: Full clean build, both platforms**

```bash
npx expo prebuild --clean
npx tsc --noEmit
npx expo export --platform android -c
```
Expected: all three clean/succeed.

- [ ] **Step 3: Real device/emulator smoke test (no automated equivalent)**

Run through, on a real build (`npx expo run:android`, then repeat for iOS once that
platform's build is validated per Task 1's open item):
1. Fresh install → confirm the app doesn't crash on boot (Netcore SDK init).
2. Log in via OTP → check Netcore's dashboard (or device logs, if dashboard access
   isn't set up yet) for a `login` identity event.
3. Complete registration (name/email) → confirm `user_signup` + profile update.
4. Navigate through a handful of screens (home, wallet, addresses, a subscription
   category) → confirm `screen_view` events with the right screen names.
5. Add an item to a subscription/bulk/on-demand cart, remove it, apply a coupon →
   confirm `add_to_cart`/`remove_from_cart`/`cart_updated` fire with sane payloads.
6. Add a delivery address and use "current location" → confirm `add_address`,
   `select_address`, `locate_me`.
7. Place a real (or sandbox) test order end-to-end → confirm `proceed_to_checkout`
   and `product_purchase` fire with the correct amount, and that it matches the
   actual order placed (cross-check against the backend order record, per the
   design spec's success metrics).
8. Sign out → confirm `user_logout`.
9. Send a test push from Netcore's own campaign tool with a deeplink attached →
   confirm it delivers, taps route correctly via the `SmartechDeeplink` listener,
   and no duplicate/garbled notification appears alongside the app's normal
   order-status pushes.

- [ ] **Step 4: Re-run the existing Maestro flows for every touched screen**

Per `docs/TESTING-WORKFLOW.md`, this integration adds no new user-visible UI, so no
new flows are authored — but every touched screen already has flow coverage; run
those as a regression check that nothing about the native SDK addition broke normal
app behavior:

```bash
# Prefer a release build for Maestro runs — see .maestro/README.md
npx expo run:android --variant release
maestro test .maestro/flows/
```
(Or run the individual flows covering login, register, profile, addresses, cart,
bulk-cart, on-demand-cart, subscription-configure — see `.maestro/README.md` for the
current flow list and which ones are `# MANUAL`-gated on a test account.)

- [ ] **Step 5: Commit**

```bash
git add src/app/marketplace.tsx
git commit -m "docs: note the Netcore marketplace/Navmool coverage gap"
```

---

## Self-review notes

**Spec coverage:** every section of the design spec has a corresponding task —
native SDK layer (Task 0-1), env config (Task 1), service module (Task 2-4, 11),
identity events (Task 5-6), deeplink handling (Task 3), push bridging (Task 4),
screen-view tracking (Task 7-10), full commerce taxonomy (Task 12-17), known gaps
documented (Task 18), testing convention followed throughout (tsc + device
verification + Maestro regression, no new unit/E2E tests per this repo's
established no-tests convention).

**Architecture refinement over the spec:** commerce cart events moved from
screen-level call sites (as the spec sketched) to store-action-level (Tasks 12-14,
16) — a stronger implementation of the same requirement, not a scope change,
justified in each task's own notes (single choke point per mutation vs. N screens
each needing to remember to call a tracker).

**Type consistency:** `NetcoreOrderType` (Task 11) is used consistently as `'subscription' | 'bulk' | 'allDay' | 'advance'`
across Tasks 12-15 — bulk always collapses to the literal `'bulk'` via the
`bulkOrderTypeFor` helper (Task 13), on-demand passes through `cart.mode` directly
(already typed `OnDemandMode = 'allDay' | 'advance'`, Task 14-15), subscription is
always the literal `'subscription'` (Task 12, 15). `CartEventItem`/`CartTotals`/
`PurchasePayload`/`AddressEventPayload` (Task 11) are the only shapes referenced by
every later task — no task invents a parallel ad-hoc payload shape.

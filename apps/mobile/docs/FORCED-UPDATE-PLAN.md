# Forced Update & Auto Update — MealaweUserAppRN

**Date:** 2026-08-28
**Scope:** Block usage of the app when the installed native binary falls
below a minimum required version ("forced update"), and confirm the status
of background OTA delivery ("auto update").
**Status:** Proposal for review — no changes made yet.

This plan is grounded in the current repo state and the two sibling apps
already live under the same store listing — not a generic "how to build
force update" writeup.

---

## 1. Executive summary

**Auto update is already done — nothing to plan here.** `docs/OTA-UPDATES-PLAN.md`
and `docs/OTA-UPDATES-CHANGES.md` cover this in full: `expo-updates` is
installed and correctly wired (`app.json` → `runtimeVersion`/`updates.url`,
EAS `staging`/`production` channels, `npm run update:staging` /
`update:production` scripts, documented in `CI-CD-RELEASE-GUIDE.md` §2.7).
The decision already made was **silent, native-default behavior**: check on
launch, download in the background, apply on next cold launch, no in-app UI.
That decision stands; §6 below just notes how to revisit it if you ever want
the optional "restart now" banner instead.

**Forced update is the actual gap.** `MealaweUserAppRN` has zero
version-gate logic today — confirmed by grepping `src/` for every relevant
term (`force`, `minVersion`, `nativeApplicationVersion`, etc.); the only hit
is a stale, unused `appVersion: '1.7.8'` constant in `src/config/environments.ts`
(ported verbatim from the Ionic app's `environment.ts`, never wired to
anything, and already out of date against the real `app.json` version `2.0.1`).

The good news: **the legacy Ionic app (`MealaweUserApp`) already has this
feature, live, and the backend + dashboard admin screen it depends on already
work for the RN app too — no backend changes needed.** This plan is mostly
"port `MealaweUserApp`'s boot-time blocking gate into RN's boot flow,"
plus fixing one real bug found in the process.

---

## 2. What already exists (reused as-is, zero backend changes)

`MealaweUserApp` and `mealaweApp` both implement the same pattern, and it's
already fully backed by a live backend + admin screen:

| Layer | What exists | Where |
|---|---|---|
| DB model | `AppVersionControl { appName, appVersion }` | `MealaweServerApp/src/model/appVersionControl.model.js` |
| DAO/service/route | Full CRUD + one public read | `MealaweServerApp/src/dao\|service\|route/appVersionControl.*` |
| Public endpoint | `GET /api/getAppVersionByName/:appName` — no auth, fails open | mounted in `routeConfig.js` |
| Admin UI | List/add/edit `appName` + `appVersion` | `mealaweDashboard/src/app/app-version-control/` |
| Client call (Ionic) | `apiMain.getAppVersionByName()` in both `MealaweUserApp` and `mealaweApp` | `app.component.ts` → `checkAppUpdate()`, runs **before** routing/`routeConditions()` |
| Blocking UI (Ionic) | Full-screen, non-dismissible "update available" card/component | `app-update.component.html` (legacy) / inline `@else if (showUpdate())` block (`mealaweApp`) |

Critically: **`MealaweUserAppRN` ships under the same `com.mealawe.app`
package id as `MealaweUserApp`** (same store listing — RN replaces the Ionic
app as an update, not a new install). `environments.ts` already carries
`appName: 'mealawe'`, matching both Ionic apps exactly. So the RN app should
call the **same endpoint, same `appName`, same document** — there is
correctly only one "minimum version" number for one store listing,
regardless of which codebase produced the currently-installed build. No new
backend document, no schema change, no dashboard change.

---

## 3. The one thing NOT to port verbatim: the version-compare bug

Both Ionic apps compare versions like this (`apiMain.service.ts`):

```js
const appDBVersionArr = res.appVersion.split('.');   // e.g. "1.10.0" -> ['1','10','0']
const appVersionArr = environment.appVersion.split('.');
const appDBVersionInt = parseInt(appDBVersionArr.join(''));   // '1100' -> 1100
const appVersionArrInt = parseInt(appVersionArr.join(''));
resolve(appDBVersionInt > appVersionArrInt ? 'UPDATE' : 'NO_NEED');
```

This concatenates version parts as strings before parsing, which silently
breaks once digit widths stop lining up. Concrete broken case: `1.9.10` vs
`1.10.1` — correct ordering is `1.9.10 < 1.10.1` (minor `9 < 10`), but the
naive method concatenates to `"1910"` vs `"1101"` and says `1910 > 1101`,
i.e. it thinks `1.9.10` is the *newer* version. It's a latent bug that
hasn't bitten yet only because version numbers have stayed small enough to
avoid this alignment. RN gets its own client, so this is a clean opportunity
to do it correctly with a proper tuple compare instead of inheriting the bug:

```ts
function isVersionBelow(installed: string, required: string): boolean {
  const a = installed.split('.').map(Number);
  const b = required.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai !== bi) return ai < bi;
  }
  return false;
}
```

This only changes the RN client's own comparison — it doesn't touch the
shared backend or the two live Ionic apps, so there's no risk to them.

---

## 4. RN implementation plan

### 4.1 New dependency

Add **`expo-application`** — not currently installed. Needed to read the
*actually installed* native version at runtime (`Application.nativeApplicationVersion`)
rather than trusting a hardcoded constant that can drift (exactly as
`environments.ts`'s `appVersion: '1.7.8'` already has, vs. the real `2.0.1`).

### 4.2 Where the check runs — boot gate, before location

`app/index.tsx` (`Index`, the existing boot gate) already sequences one
blocking step (`LocationSplash`) before routing. This adds a step **before**
that one, mirroring the Ionic apps' ordering (`checkAppUpdate()` runs before
`routeConditions()`) — no point running GPS/location detection for a user
who's about to be blocked anyway:

```
RootLayout mounts → fonts load → authStore.hydrate() + locationStore.hydrate()
  → Index boot gate:
      1. [NEW] ForceUpdateCheck — cheap GET, capped by a timeout, fails open
         → if blocked: render ForceUpdateScreen (terminal, no dismiss path)
      2. LocationSplash (existing, unchanged)
      3. Redirect → /welcome | /register | /(tabs)
```

### 4.3 New files

| File | Purpose |
|---|---|
| `src/features/app-update/appUpdateApi.ts` | `getAppVersionByName('mealawe')` — thin fetch, mirrors `clusterApi.ts`'s shape |
| `src/features/app-update/versionCompare.ts` | The tuple-compare helper from §3 |
| `src/features/app-update/useForceUpdateCheck.ts` | Hook: calls the API once, applies the timeout/fail-open rule, returns `'checking' \| 'ok' \| 'blocked'` |
| `src/components/ForceUpdateScreen.tsx` | Full-screen blocking UI — same visual family as `LocationSplash.tsx` (brand background, `AppText`, centered icon), message + "Update Now" button |

### 4.4 Behavior rules (carried forward from the Ionic precedent, on purpose)

- **Fails open.** Any network error, timeout, or malformed response → treat
  as "no update needed," never block. Matches the existing Ionic behavior
  exactly (`resolve('NO_NEED')` on any falsy/mismatched response) — a
  version-gate that can lock everyone out on a backend hiccup is a worse bug
  than the one it's meant to prevent.
- **Timeout-capped.** Mirror `LocationSplash`'s `TIMEOUT_MS` pattern (a
  `setTimeout` racing the fetch) so a hung request can never soft-lock boot.
- **Non-dismissible when blocked.** No skip/close button — matches both
  Ionic apps' current UX exactly (this is a deliberate hard gate, not a
  nudge).
- **"Update Now" action.** `Linking.openURL(env.storeUrls.playStore |
  appStore)` based on `Platform.OS` — the same URLs already in
  `environments.ts`, already used by `shareReferral.ts`. (`mealaweApp`'s
  simpler `openStore()` pattern, not the legacy app's
  `@capawesome/capacitor-app-update` native flow — that's a Capacitor plugin
  with no RN/Expo equivalent pre-installed; a native "immediate update" flow
  for Android is a possible future enhancement, not needed for parity.)

### 4.5 Cleanup

Remove (or repurpose) the stale, unused `appVersion: '1.7.8'` field in
`src/config/environments.ts` once the real check reads the live version via
`expo-application` instead — leaving both around invites exactly the kind of
drift that already happened to this constant.

---

## 5. Rollout / risk

This touches the app's boot path — the highest-blast-radius area in the
codebase (a bug here can hard-lock every user out, not just degrade one
feature). Mitigations:

1. **Seed the shared `appVersion` document at the current live version**
   (whatever's actually on the store today) before this ships, so the gate
   is provably inert on day one — it only ever triggers when someone
   deliberately raises the number later via the existing dashboard screen.
2. Ship to the `staging` channel/track first; manually verify both the
   pass-through case (installed ≥ required) and the blocked case (temporarily
   bump the dashboard's `appVersion` value up, confirm the screen appears and
   `Linking.openURL` fires, then set it back).
3. Fail-open is a hard requirement, not a nice-to-have — see §4.4.

---

## 6. Auto update — current status, and how to revisit it if wanted

No action needed; this section exists so this doc is a complete answer to
"forced update and auto update" without re-deriving what's already decided.

- **Current behavior:** silent. `expo-updates` checks on every launch,
  downloads in the background, applies on the next cold launch. No in-app UI.
- **Already decided, in `docs/OTA-UPDATES-CHANGES.md`:** publishing stays
  manual (`npm run update:staging` / `update:production`), no CI
  auto-publish, no "restart now" banner.
- **If you want the more visible option later:** `docs/OTA-UPDATES-PLAN.md`
  §3 Tier 2 already scopes it — an `Updates.checkForUpdateAsync()` +
  `Updates.fetchUpdateAsync()` + `Updates.reloadAsync()` flow behind a small
  dismissible "Update ready — Restart" banner. Independent of everything in
  this doc; can be picked up separately without touching the forced-update
  work above.

---

## 7. Verification

No unit tests in this project (per `CLAUDE.md`) — verify with:

- `npx tsc --noEmit` and `npx expo export --platform android -c` after
  implementation.
- Manual QA: confirm pass-through on a normal launch; temporarily raise the
  dashboard's `appVersion` for `appName: 'mealawe'` and confirm the blocking
  screen appears, the store link opens, and there is no way to dismiss it
  back into the app.
- A Maestro flow for the boot-gate happy path (already up to date,
  serviceable) is worth adding given this plan touches the same boot-critical
  file (`app/index.tsx`) the location gate already relies on — see
  `docs/TESTING-WORKFLOW.md` for the convention.

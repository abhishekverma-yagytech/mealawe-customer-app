# OTA Updates Plan — MealaweUserAppRN

**Date:** 2026-08-24
**Scope:** Wiring up EAS Update (Expo's OTA update system) so JS/asset-only
changes can reach installed apps in seconds instead of waiting for a new
native build + store review.
**Status:** Proposal for review — no changes made yet.

This plan is grounded in the current repo and EAS project state (`app.json`,
`eas.json`, the live `apps224`/`yagy-team` EAS account, `docs/CI-CD-RELEASE-GUIDE.md`)
— not generic Expo Update docs.

---

## 1. Executive summary

The good news: **OTA is already half-wired and nobody touched it.** `expo-updates`
is installed, `app.json` has a valid `runtimeVersion`/`updates.url`, and EAS
already auto-created a `staging` and a `production` channel (each pointed at
a same-name branch) the first time this project ran an EAS build. Confirmed
by reading the actual generated `AndroidManifest.xml`: the native side is
correctly wired with the update URL, checks on every launch, doesn't block
launch waiting for the check (`EXPO_UPDATES_LAUNCH_WAIT_MS=0`).

The bad news, also confirmed directly against the EAS API: **zero updates
have ever been published** — `eas update:list --branch staging` returns an
empty history, both channels show `Group ID: N/A`. The plumbing exists; it's
never been used. "Adding OTA" here means: give it a way to actually publish
(scripts + optionally CI), publish a first real update to prove the pipe
works end to end, and decide how the app should react when one is ready.

---

## 2. Current state (evidence-based)

| Piece | State | Evidence |
|---|---|---|
| `expo-updates` package | Installed, `~57.0.16` | `package.json` |
| `app.json` → `runtimeVersion` | `{ "policy": "appVersion" }` | An OTA update built against app version `2.0.0` only reaches installed `2.0.0` binaries — see `docs/CI-CD-RELEASE-GUIDE.md` §2.3 |
| `app.json` → `updates.url` | `https://u.expo.dev/d2a18b84-3719-437e-8c3d-d8f0a94036cd` | Matches the EAS project ID |
| Native wiring (Android) | **Already correct** | `android/app/src/main/AndroidManifest.xml` has `EXPO_UPDATE_URL`, `EXPO_UPDATES_CHECK_ON_LAUNCH=ALWAYS`, `EXPO_UPDATES_LAUNCH_WAIT_MS=0` — generated automatically by `expo-updates`'s own config plugin, no `plugins[]` entry needed |
| EAS channels | **Exist, unused** | `eas-cli channel:list`: `staging` (id `019f8eec-...`) and `production` (id `019fa1fa-...`), both `Active`, both `Group ID: N/A` |
| `eas.json` build profiles → channel | Already mapped | `development`/`staging` → `channel: "staging"`; `production`/`production-preview` → `channel: "production"` |
| Publish history | **Empty** | `eas update:list --branch staging` → no update groups, ever |
| JS-side `expo-updates` usage | **None** | No file under `src/` imports `expo-updates` — the app currently relies entirely on the native default (silent check-on-launch, apply-on-next-launch) |
| CI (`eas-release.yml`) | Publishes builds only | No `eas update` step exists anywhere in the workflow |
| Policy doc | Already written | `docs/CI-CD-RELEASE-GUIDE.md` §2.6 states the OTA-vs-binary rule of thumb, but has no runnable command for actually publishing one |

---

## 3. What "adding OTA" means, concretely

### Tier 1 — make it publishable today (low risk, reversible)

| # | Action | Why |
|---|---|---|
| 1 | Add `update:staging` / `update:production` npm scripts wrapping `eas update --branch <channel> --message "<msg>"`, matching the existing `build:*`/`submit:*` naming convention | Right now the *only* way to publish is to remember the raw `eas update` CLI syntax — a script makes it a documented, discoverable action like every other release command |
| 2 | Publish one real **test update to the `staging` channel** (a trivial, safe change) and confirm it shows up via `eas update:list` | Proves the entire pipe works — channel routing, runtime version match, native manifest wiring — before anyone depends on it for a real release. Staging only; **never test-publish to `production`** |
| 3 | Document the exact publish command + when to use it in `docs/CI-CD-RELEASE-GUIDE.md` (extends the existing §2.6, doesn't replace it) | Keeps one source of truth for the release process instead of scattering it |

### Tier 2 — decide how the app behaves when an update is ready

Right now, with zero JS-side code, the app already does something sensible by
default: check silently on every launch, download in the background, apply
on the *next* cold launch. Whether that's enough depends on how fast you
want users to actually receive a fix — see §4, decision 2.

If a faster/more visible experience is wanted, this project already has a
toast/banner pattern in `src/components/ui/` — an `Updates.checkForUpdateAsync()`
+ `Updates.fetchUpdateAsync()` + `Updates.reloadAsync()` flow behind a small
"Update ready — restart" banner is a contained, well-isolated addition (one
new hook + one small component), not a structural change.

### Tier 3 — decide whether CI should auto-publish

`docs/CI-CD-RELEASE-GUIDE.md` §2.6 already says JS-only changes *should* ship
via `eas update` instead of a new binary — but nothing today actually does
that automatically. Two honest options, not a false choice: keep it manual
(a developer runs `npm run update:staging` deliberately, same trust level as
`npm run build:*` today) or wire a CI trigger. See §4, decision 3 — this is
the one item here with real blast-radius, because it changes what happens on
every push, not just what's available to run by hand.

---

## 4. Decisions needed from you

1. **Approve the first test publish to `staging`.** Reversible (channels/branches
   are cheap; a bad test update just gets superseded by the next one), but it's
   a real write to the live EAS project, so confirming before running it.
2. **How visible should a ready update be to the user?**
   - **Silent (default, zero new code)** — update applies on next cold launch, no
     UI. Standard, unobtrusive, what most apps do.
   - **Banner prompt** — small "Update ready, tap to restart" UI once a fetch
     completes, so the user gets the fix without waiting for their next natural
     app close/reopen. Requires the Tier 2 addition above.
3. **Should CI auto-publish OTA updates, or stay manual?**
   - **Manual (default)** — a developer runs `npm run update:staging` /
     `update:production` deliberately, same as every other release action today.
   - **Automatic** — e.g., every push to `master` that doesn't touch native
     config/dependencies auto-publishes to `production`. Faster, but means a
     push starts *shipping to users* without a human explicitly choosing to —
     worth thinking through rollback story (`eas update:republish`) before
     turning this on.

---

## 5. How we'll verify it

- `eas update:list --branch staging` shows the test publish with a real group ID,
  correct `runtimeVersion`, and both platforms.
- `eas channel:list` still shows both channels `Active` afterward.
- No changes to `android/app/src/main/AndroidManifest.xml`'s already-correct
  update config — Tier 1 doesn't touch native code at all, purely
  publish-side.

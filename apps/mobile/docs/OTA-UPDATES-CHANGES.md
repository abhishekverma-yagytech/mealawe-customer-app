# OTA Updates — How It Works

**Date:** 2026-08-24
**Branch:** `build-optimization-and-structure`
**Source plan:** `docs/OTA-UPDATES-PLAN.md`
**Status:** Configured and documented below. Nothing in this report is
committed yet — changes are sitting in the working tree for manual review.

This explains what OTA updates are in this project, what was actually
configured, the three decisions made, and the exact steps to publish one.

---

## What OTA updates are, in this app specifically

Every Mealawe install checks EAS on launch for a newer JS bundle matching its
own **runtime version**. Runtime version here is tied 1:1 to `app.json`'s
`version` field (`policy: "appVersion"`) — so an OTA update built while the
app is on version `2.0.0` only ever reaches devices that already have a
`2.0.0` binary installed. It cannot add native code, change permissions, or
touch anything under `android/`/`ios/` — those still require a full
`eas build` + store review (see `docs/CI-CD-RELEASE-GUIDE.md` §2.6 for the
exact line between the two).

What it's for: bug fixes, copy changes, styling, most JS/TS logic changes —
shipped in seconds instead of the ~10-20 minute native compile + store
rollout a binary needs.

---

## What was already there (nobody had to build this)

Investigated before touching anything — `expo-updates` was already
installed, and EAS had already auto-created the update infrastructure the
first time this project ran a real build:

| Piece | State found |
|---|---|
| `app.json` → `runtimeVersion`, `updates.url` | Already correctly configured |
| `android/app/src/main/AndroidManifest.xml` | Already wired: update URL, checks on every launch, doesn't block launch waiting for the check — generated automatically by `expo-updates`'s own config plugin |
| EAS channels | `staging` and `production` already existed, both `Active`, each mapped from the matching `eas.json` build profile's `channel` field |
| Publish history | **Empty** — confirmed via `eas update:list`, zero updates ever published on either channel |
| JS-side `expo-updates` usage | **None** — the app relies entirely on the native default behavior |

So "adding OTA" here wasn't building new infrastructure — it was making the
existing, unused infrastructure actually publishable, and deciding how it
should behave.

---

## The three decisions

Asked before configuring anything, since each one has a real tradeoff:

1. **First test publish to `staging`** — **deferred.** The scripts and
   documentation are ready; the first real publish is left for you to
   trigger deliberately rather than done automatically here.
2. **Update visibility** — **silent, native default.** No new code. The app
   checks on launch, downloads in the background, applies on the next cold
   launch. No "restart to update" banner.
3. **CI automation** — **manual only.** Nothing auto-publishes on push.
   Publishing is a deliberate action, same trust level as every other
   release command in this project (`build:*`, `submit:*`).

Because of decisions 2 and 3, there was no application code to write — this
was entirely a publishing-and-documentation task.

---

## What was actually configured

### `package.json` — two new scripts

```json
"update:staging": "npx eas-cli update --branch staging --environment preview",
"update:production": "npx eas-cli update --branch production --environment production"
```

Matches the existing `build:*`/`submit:*` naming and `npx eas-cli` prefix
convention already used everywhere else in this file. `--environment` is
required for this project's Expo SDK (57 — EAS requires it from SDK 55
onward); confirmed the valid values (`production`/`preview`/`development`)
directly against the installed `eas-cli` before writing the scripts, rather
than guessing.

### `docs/CI-CD-RELEASE-GUIDE.md` — new §2.7

Documents the exact publish commands, what `--environment` actually does
here (selects an EAS server-side env-var set this project doesn't currently
define, so it's forward-compatible rather than functional today), the
runtime-version reach caveat, and the "silent by default" behavior decision
— so a future reader finds one runnable answer instead of re-deriving it.

---

## How to actually publish one (when you're ready)

```bash
npm run update:staging      # test on internal/dev-client builds first
# ...verify on a staging build...
npm run update:production   # ship to the store build's users
```

Leave off a `-m` message flag and the CLI prompts for one interactively.
Verify it landed:

```bash
npx eas-cli update:list --branch staging
```

Should show a real group ID, the correct `runtimeVersion`, and both
platforms — right now that list is empty, which is expected until the first
publish happens.

---

## What's intentionally not done here

- **No test publish** — deferred to you, per decision 1.
- **No in-app update UI** — the native default was chosen deliberately
  (decision 2), not skipped for lack of time. Revisit only if a specific
  fix needs to reach users faster than their next natural app relaunch.
- **No CI trigger for `eas update`** — manual-only was chosen deliberately
  (decision 3). Automating it later means answering the rollback question
  first (`eas update:republish` exists for this, but a policy for *when* to
  use it doesn't yet).

---

## Files changed (none committed — for manual review)

```
modified:   package.json
modified:   docs/CI-CD-RELEASE-GUIDE.md

new file:   docs/OTA-UPDATES-PLAN.md
new file:   docs/OTA-UPDATES-PLAN.pdf
new file:   docs/OTA-UPDATES-CHANGES.md
new file:   docs/OTA-UPDATES-CHANGES.pdf
```

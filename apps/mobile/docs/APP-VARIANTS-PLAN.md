# App Variants — Implementation Plan

**Date:** 2026-08-25
**Source:** ["App variants: how to install dev, preview, and production
side by side"](Expo blog, pasted in full by the user) — read directly, not
fetched.
**Scope:** `MealaweUserAppRN` only — this is a client-config change, no
backend work.
**Status:** Proposal for review — no changes made yet.

This plan applies the article's pattern to *our* actual project, not the
generic `com.myapp.app` example — and our situation has real complexity the
article doesn't: a live, already-published app, deep Firebase integration,
a shared Google Maps key, an App Group for the Live Activity work from
today, and universal links. Every claim below is checked against the
current repo.

---

## 1. Do we actually have this problem? Yes, confirmed.

| Check | Finding |
|---|---|
| `app.json` → `ios.bundleIdentifier` | `com.mealawe.app` |
| `app.json` → `android.package` | `com.mealawe.app` |
| Used by profiles | **All five** — `development`, `staging`, `staging-preview`, `production-preview`, `production` (`eas.json`) share this one identity |
| Config file type | Static `app.json` only — no `app.config.ts`/`.js` exists yet |

Installing any dev/staging/preview build today replaces whatever's
currently installed under `com.mealawe.app` — including a real production
install, if one's ever on the same device. Exactly the article's problem,
not a hypothetical.

**One critical constraint the article's generic example doesn't have:**
`com.mealawe.app` is **already the live Play Store / App Store identity**
(`docs/CI-CD-RELEASE-GUIDE.md`: *"com.mealawe.app is not a new app... ships
as an update to that same listing"*). It's tied to the original upload
keystore, the existing Firebase project, a shared Google Maps key, and
`applinks:mealawe.com` universal links. **Production's identity cannot
change** — this plan only adds *new* identities for the non-production
variants, exactly like the article does, but the stakes of getting this
wrong are real (a changed production identity would orphan the live app).

---

## 2. Identity mapping for *our* five profiles, not the article's three

The article assumes three profiles (development/preview/production) map
1:1 to three identities. We have five profiles but they group into three
purposes, and identity should follow purpose, not profile count:

| Profiles | Purpose | New identity |
|---|---|---|
| `development` | Dev-client, staging backend | `com.mealawe.app.dev` |
| `staging`, `staging-preview` | Same backend/channel, two packaging styles of the same thing (established today when `staging-preview` was added specifically as a clone of `staging`) | `com.mealawe.app.staging` |
| `production-preview`, `production` | `production-preview` exists specifically to smoke-test **the exact build** that will ship — giving it a different identity would test the wrong thing | `com.mealawe.app` (**unchanged**) |

This also means `production-preview` still can't be installed next to a
real `production` build — but that's correct, not a gap: they were never
meant to coexist, only `production-preview` vs. `production` before a
submission decision, one at a time on a test device.

---

## 3. Tier 1 — the core pattern (same-day, contained)

1. **Add `app.config.ts`**, keeping `app.json` as the static base (the
   article's recommended two-file setup — `app.config.ts` receives
   `{ config }` from `app.json` and returns overrides; tooling like `eas
   build:configure` still writes into `app.json`). Every current static
   value in `app.json` stays exactly where it is; `app.config.ts` only adds
   the `APP_VARIANT`-driven overrides (identity, name, icon).
2. **`APP_VARIANT` switch** — three cases (`development` / `staging` /
   default `production`), per §2's mapping. Default falls through to
   `production`'s identity being *unchanged from `app.json`* (not a new
   suffix) — the article defaults to dev; we invert that specific default
   because our "no APP_VARIANT set" case is a raw `expo prebuild`/local
   command, which should keep behaving exactly as it does today unless a
   variant is deliberately requested, not silently start building an
   unpublishable `.dev`-suffixed artifact when someone forgets to set it.
3. **Wire `APP_VARIANT` into `eas.json`** — into the **existing** `env`
   blocks each profile already has (they already set
   `EXPO_PUBLIC_ENV`), not the article's separate EAS-stored-environment
   mechanism. Matches this project's current pattern; the EAS environment
   variables system is a genuine nicety but a separate migration, not
   required for variants to work (see §6).
4. **App name per variant** — `"Mealawe (Dev)"` / `"Mealawe (Staging)"` /
   unchanged for production, so the app switcher and home screen make it
   obvious which is which alongside the icon change below.
5. **`expo-dev-client`'s `addGeneratedScheme`** — set `true` only for the
   `development` variant, exactly as the article describes, so the Expo
   CLI's QR code reliably opens the dev build instead of whichever variant
   happens to answer first.
6. **Icon per variant** — dev/staging get a visibly different icon (a
   flat-color badge over the existing icon is enough, per the article's own
   suggestion); production keeps the real icon untouched. `sharp` is
   already a devDependency (added during the build-optimization work) —
   usable to generate these programmatically rather than needing new
   hand-designed assets.

**Nothing in Tier 1 touches Firebase, Maps, widgets, or universal links.**
It solves "install dev and production side by side" — the actual headline
problem — on its own.

---

## 4. Tier 2 — making the new identities fully functional

Two *new* app identities (`com.mealawe.app.dev`, `com.mealawe.app.staging`)
exist after Tier 1, but nothing external has been told about them yet.
Concretely, for each:

| Needs re-registration for the new identity | Why | Effort |
|---|---|---|
| **Firebase** (`google-services.json` / `GoogleService-Info.plist`) | Both files are keyed 1:1 to a bundle ID/package name (verified: both currently declare `com.mealawe.app` explicitly) — Crashlytics and Messaging will fail to initialize correctly under a different identity without a matching config file | New Firebase **app** entries inside the existing `mymealawe` project (not a new project) — two per platform (dev, staging) — then select the right file per variant in `app.config.ts`'s `googleServicesFile` |
| **Google Maps API key** | Currently one key (`AIzaSyCtIAU1RAa32Y9at1VnmL-fa79AP0NPreQ`), likely restricted by package name + SHA-1 in Google Cloud Console | Add the two new package names (+ their debug/EAS-managed SHA-1s) to the existing key's Android restrictions, or leave dev/staging unrestricted if that's already the case — needs checking the actual Cloud Console restriction, not assuming |
| **App Group** (`group.com.mealawe.app`, from today's `expo-widgets` work) | App Groups are also identity-scoped — the Live Activity / widgets feature built earlier today **will not share data correctly** under a different bundle ID without its own group | Register `group.com.mealawe.app.dev` / `.staging`, referenced conditionally in `app.config.ts`'s `expo-widgets` plugin config |
| Juspay / `hyper-sdk-expo-plugin` client+merchant IDs | Unconfirmed whether Juspay's sandbox credentials are identity-scoped the same way — worth a quick check with whoever owns that integration before assuming either way | Unknown until checked |

This is real, non-trivial setup work — each row is a console visit + a new
config value, not app code. **Recommendation: do Tier 1 now** (immediate,
large payoff — the actual "stop reinstalling" problem), **decide Tier 2
per-row** rather than all-or-nothing (§6) — e.g. Firebase re-registration
is probably worth it (crash reports from a dev build currently either fail
silently or pollute production Crashlytics, which is the same class of
problem this whole plan exists to fix elsewhere), while Maps/Juspay may be
fine left pointed at the same shared credentials for non-prod use if
they're not identity-restricted today.

---

## 5. Explicitly out of scope: universal links

`docs/PLATFORM-NATIVE-FEATURES-PLAN.md` already documents this precisely:
`apple-app-site-association`/`assetlinks.json` are hosted on
`mealawe.com` by **web/infra, not this repo** — *"this is the real
dependency, not app code."* Universal links only need to work for the
**production** identity anyway (real users tap real links from
email/SMS/marketing; nobody links to a dev build) — since production's
identity is unchanged by this whole plan, nothing about universal links
needs to move. Not a gap, just noting it's genuinely out of scope rather
than silently skipped.

---

## 6. Decisions needed from you

1. **Confirm the three-identity mapping in §2** (dev / staging+staging-preview / production+production-preview unchanged) — or did you want five distinct identities, one per profile?
2. **Tier 2 scope** — do all four rows, some, or defer entirely and ship Tier 1 alone first? Recommend at minimum Firebase (crash/push data hygiene), deciding Maps/Juspay after checking whether they're actually identity-restricted today.
3. **EAS environment variables migration** (the article's optional nicety — variables live on EAS instead of inline `env` blocks in `eas.json`) — worth doing at the same time, or keep the current inline pattern? Recommend keeping current pattern for now; it already works and this plan doesn't need it.
4. **Icon assets** — generate dev/staging badge variants via `sharp` from the existing icon, or do you want distinct hand-designed icons?

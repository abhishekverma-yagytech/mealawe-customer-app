# Build & Project Optimization Plan — MealaweUserAppRN

**Date:** 2026-08-21
**Scope:** Local Android/iOS dev builds, EAS cloud builds, CI/CD (GitHub Actions), Metro/JS bundling, and general dependency hygiene for the Expo SDK 57 / RN 0.86 app.
**Status:** Proposal for review — no changes made yet. Each item below is independently adoptable.

This plan is grounded in the current repo state (`package.json`, `eas.json`, `android/gradle.properties`, `android/app/build.gradle`, `metro.config.js`, `babel.config.js`, `.github/workflows/eas-release.yml`, and a full disk scan of `node_modules`) — not generic React Native advice.

---

## 1. Executive Summary

The single biggest finding: **`node_modules` is 16.5 GB, and ~15.7 GB (95%) of that is stale Gradle/CMake build output**, not package source. It has been silently accumulating on this machine and is almost certainly slowing down every filesystem-heavy step of the workflow (installs, prebuilds, IDE indexing, AV scanning).

Beyond that, four independent levers can meaningfully speed up builds:

| Area | Current state | Cost |
|---|---|---|
| Local Android native compile | Builds all 4 ABIs (armeabi-v7a, arm64-v8a, x86, x86_64) on every `npm run android`, even though one dev device needs one | ~4x more native compile work than necessary, every local run |
| Native module build artifacts | `build/` + `.cxx/` output for autolinked modules lands inside `node_modules/<pkg>/android/`, never cleaned | 15.7 GB disk, growing forever |
| EAS cloud builds | No `resourceClass`, no `.easignore` | Slower cloud compile tier; full repo (incl. PDFs, xlsx, keystore backups) uploaded as build context every time |
| CI/CD | Every push to `master` triggers a full native `eas build --wait`, JS-only or not | Pays full binary-build cost for changes that could ship as an OTA update |

None of the fixes below require touching business logic. Tier 1 items are same-day, reversible, and address the biggest cost first.

---

## 2. Findings (evidence-based)

### 2.1 `node_modules` disk usage — the dominant issue

Total size: **16.48 GB**. Breakdown of the worst offenders, each split into legitimate package weight vs. `android/build` + `android/.cxx` (Gradle output + CMake intermediates left behind by local native builds):

| Package | Total | `android/build` | `android/.cxx` |
|---|---|---|---|
| `react-native-reanimated` | 4655 MB | 3345 MB | 1306 MB |
| `react-native-worklets` | 3263 MB | 2949 MB | 313 MB |
| `expo-modules-core` | 2390 MB | 1694 MB | 665 MB |
| `react-native-nitro-modules` | 2253 MB | 2100 MB | 152 MB |
| `react-native-mmkv` | 1210 MB | 1143 MB | 67 MB |
| `react-native-screens` | 1051 MB | 1021 MB | 27 MB |
| `react-native-gesture-handler` | 987 MB | 978 MB | 6 MB |

**Root cause:** every native module with C++/JSI code (Reanimated, Worklets, Nitro Modules, MMKV, plus Expo's own core) builds via Gradle + CMake. Neither Gradle's `buildDir` nor CMake's `.cxx` output directory is redirected away from the module's own folder in this project's generated `android/build.gradle` (unlike older bare-RN templates, which relocated all subproject build dirs to a shared location outside `node_modules` specifically to avoid this). Multiply that by:

- 4 ABI targets (`armeabi-v7a, arm64-v8a, x86, x86_64` — `android/gradle.properties:31`)
- debug + release variants
- every local `npm run android` / prebuild cycle since the project started, with no cleanup step anywhere in the repo

…and it compounds indefinitely. `expo prebuild --clean` (the `prebuild` script) wipes the generated `android/` folder itself, but **not** `node_modules/**/android/{build,.cxx}` — so this bloat survives every "clean" prebuild.

This isn't just a disk-space nuisance: 16 GB of small files inside a project directory slows `npm install`, IDE indexing, antivirus scanning, and any full-tree operation on a lot of dev machines.

### 2.2 Local Android builds always compile 4 ABIs

`android/gradle.properties:31`:
```
reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64
```
This is correct for the **production** artifact (needs to run on every device out there) but wasteful for `npm run android` / `android:local` / `android:staging` / `android:prod` — a single physical device or emulator only ever needs one ABI. Building four means ~4x the native compile work (and 4x the `.cxx`/`build` bloat from §2.1) on every local iteration.

### 2.3 EAS cloud build config has no speed tuning

`eas.json` build profiles (`development`, `staging`, `production`, `production-preview`) specify no `resourceClass`. EAS defaults to its standard tier; a `large` resource class directly reduces cloud compile wall-clock for both Android and iOS at a modest extra cost per build minute.

There is also no `.easignore` in the repo. EAS uploads the whole project as build context (`node_modules` and `.gitignore`-listed paths are excluded automatically, but nothing beyond that). This repo's root currently has, unfiltered: 8 PDF docs, an `.xlsx` test catalogue, an `.html` export, two `.jks` keystore backup files, and `Hero-Animation-Options.pdf` — none of which the cloud build needs.

### 2.4 CI always pays for a full native build

`.github/workflows/eas-release.yml`: every push to `master` runs `eas build --platform android --profile production --wait` unconditionally — there's no distinction between a JS-only change (which `runtimeVersion: { policy: "appVersion" }` + EAS Update could ship as an OTA push in seconds) and a change that actually touches native code and needs a new binary. Every merge pays the full cloud build+wait cost regardless.

### 2.5 Two probably-dead build-time costs

- **`sharp`** is listed in `dependencies` (`package.json:76`), not `devDependencies`. It's a native image-processing library (libvips bindings) normally only needed by Expo's own tooling at prebuild time (icon/splash generation), not by app runtime code. A repo-wide search found **no `import`/`require` of `sharp` anywhere in `src/`, `scripts/`, or `plugins/`** — it appears to be build-tooling-only weight sitting in the wrong dependency list, which means it gets installed/compiled for every environment that installs runtime dependencies, not just build environments.
- **`babel-plugin-module-resolver`** is a `devDependency` and appears in `package-lock.json`, but `babel.config.js` doesn't reference it — the file's own comment says path aliases already come from tsconfig via Expo Metro and explicitly states *"no babel module-resolver needed."* It looks like a leftover from before that migration. If confirmed dead, it's one less Babel visitor pass over every file, on every bundle.

### 2.6 Things that are already correctly configured (no action needed)

- `org.gradle.parallel=true` is already set.
- Hermes and the New Architecture are already enabled.
- `hermesEnabled` / `newArchEnabled` / `edgeToEdgeEnabled` are all sensible for a modern SDK 57 app.
- `minifyEnabled` / `shrinkResources` are correctly gated behind `findProperty(...)` flags rather than hardcoded — EAS's own build profiles are the right place to turn these on for release, not something broken today.
- Metro config only adds `.lottie` to `assetExts` and wires NativeWind — no unnecessary custom transforms.

---

## 3. Recommendations, prioritized

### Tier 1 — Same-day, high impact, fully reversible

| # | Action | Why |
|---|---|---|
| 1 | Add a `clean:native-cache` script that deletes `node_modules/**/android/{build,.cxx}` (a `rimraf`/glob one-liner) and run it now | Reclaims ~15.7 GB immediately; safe because Gradle/CMake regenerate these on the next build |
| 2 | Restrict local dev builds to one ABI — pass `-PreactNativeArchitectures=arm64-v8a` (or whichever matches your device/emulator) to `android`, `android:local`, `android:staging`, `android:prod` scripts, or set it via an env-driven gradle property | Cuts native compile work ~4x per local run; production/EAS profile stays untouched (still all 4 ABIs for the store artifact) |
| 3 | Add a `.easignore` excluding `docs/*.pdf`, `docs/*.xlsx`, `docs/*.html`, `*.jks`, `*.bak.jks`, `Hero-Animation-Options.pdf`, `dist/` | Smaller/faster upload to EAS on every cloud build |
| 4 | Set `"resourceClass": "large"` on the `production` (and optionally `staging`) Android + iOS build profiles in `eas.json` | Directly reduces EAS cloud compile wall-clock |
| 5 | Confirm `sharp`'s actual role (prebuild-time only) and move it to `devDependencies` if confirmed | Removes a heavy native lib from the runtime dependency install path |
| 6 | Confirm `babel-plugin-module-resolver` is unused and remove it | One fewer Babel plugin running on every file/bundle |

### Tier 2 — Next 1–3 days

| # | Action | Why |
|---|---|---|
| 7 | Add a config plugin (same pattern as `plugins/withNotifeeMavenRepo.js`) that relocates every native module's Gradle `buildDir` outside `node_modules` | Stops the §2.1 bloat from recurring at all, instead of just cleaning up after it — survives `expo prebuild --clean` since it's plugin-injected |
| 8 | Enable `org.gradle.caching=true` (and evaluate `org.gradle.configuration-cache=true`) in `android/gradle.properties`, delivered via the same config-plugin approach so it survives prebuild regeneration | Faster incremental local Gradle builds |
| 9 | Gate the "push to `master`" CI build behind a path filter (skip the full native build for docs-only changes) and document when a change should ship via `eas update` (OTA) instead of a new binary | Avoids paying full EAS build+wait cost for changes that don't need a new native binary |
| 10 | Track before/after wall-clock for `npm run android:local` and `eas build` in a short `docs/BUILD-METRICS.md` | Makes the impact of each change measurable instead of assumed |

### Tier 3 — Ongoing / strategic

| # | Action | Why |
|---|---|---|
| 11 | Run `npx expo-doctor` periodically | Catches version drift across 75 runtime + 13 dev dependencies before it causes autolinking/build breakage |
| 12 | Re-check this same node_modules build-artifact bloat after every Expo SDK bump | Reanimated/Worklets/Nitro Modules/expo-modules-core are the heaviest native/C++ compiling modules in the project (confirmed in §2.1) — they'll dominate any future build-time regression |
| 13 | Write down a team policy for "new binary vs. OTA update" so item 9's distinction doesn't erode over time | Keeps the CI cost-saving durable |

---

## 4. Suggested sequencing

- **Today:** Tier 1, items 1–2 (immediate ~15.7 GB disk reclaim + 4x fewer local ABIs to compile) — zero risk, fully reversible.
- **This week:** Tier 1, items 3–6.
- **Next sprint:** Tier 2.
- **Ongoing:** Tier 3.

## 5. How we'll measure it

- `node_modules` size before/after item 1 (16.48 GB baseline recorded above).
- Wall-clock of a cold and warm `npm run android:local` before/after item 2.
- EAS dashboard build duration before/after items 3–4.
- CI minutes/month before/after item 9.

## 6. Decisions needed from you

- Approve reclaiming the ~15.7 GB now (item 1) — purely additive disk cleanup, but confirm before any bulk delete inside `node_modules`.
- Pick the default local ABI for item 2 (recommend `arm64-v8a` — matches virtually all physical Android devices since 2019 and most current emulators).
- Approve the `resourceClass: "large"` cost increase for EAS builds (item 4).
- Confirm `sharp` and `babel-plugin-module-resolver` usage assumptions (items 5–6) before removal.
- Decide how strict the OTA-vs-full-build policy (item 9) should be.

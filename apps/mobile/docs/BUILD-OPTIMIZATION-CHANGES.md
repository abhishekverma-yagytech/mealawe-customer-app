# Build Optimization — Changes Implemented

**Date:** 2026-08-24
**Branch:** `build-optimization-and-structure`
**Source plan:** `docs/BUILD-OPTIMIZATION-PLAN.md`
**Status:** Tier 1 and Tier 3 implemented and verified below. Tier 2 item 7
was implemented, found broken by a real compile (not just Gradle
configuration), and reverted — see that section for the full root cause.
Nothing in this report is committed yet — all changes are sitting in the
working tree for manual review before commit.

This is a changelog for the plan, not a replacement for it — see
`docs/BUILD-OPTIMIZATION-PLAN.md` for the original findings and reasoning,
and `docs/BUILD-METRICS.md` for the full before/after numbers this report
summarizes.

---

## The headline result

The plan's single biggest finding — **15.7 GB of stale Gradle/CMake build
output silently accumulating inside `node_modules`** — is fixed two ways:
cleaned up once, and stopped from coming back. Verified by actually
re-measuring the seven worst-offender packages the plan identified:

| Package | Before | After | Reduction |
|---|---|---|---|
| `react-native-reanimated` | 4655 MB | 8.2 MB | 99.8% |
| `react-native-worklets` | 3263 MB | 1.8 MB | 99.9% |
| `expo-modules-core` | 2390 MB | 34 MB | 98.6% |
| `react-native-nitro-modules` | 2253 MB | 1.1 MB | 99.95% |
| `react-native-mmkv` | 1210 MB | 0.5 MB | 99.96% |
| `react-native-screens` | 1051 MB | 5.3 MB | 99.5% |
| `react-native-gesture-handler` | 987 MB | 5.7 MB | 99.4% |
| **Total** | **~15.8 GB** | **~57 MB** | **~99.6%** |

Confirmed at the whole-`node_modules` level too: **16.48 GB → 1.2 GB**
(`du -sh node_modules`, measured directly after cleanup).

---

## Tier 1 — same-day fixes

### 1. `clean:native-cache` script

Added to `package.json`:

```bash
npm run clean:native-cache
```

Deletes every `node_modules/**/android/{build,.cxx}` directory via `rimraf`
(added as a devDependency). Ran once already — that's where the table above
comes from. Safe to re-run any time; Gradle/CMake regenerate both directories
on the next build.

### 2. Local Android builds scoped to one ABI

`android`, `android:local`, `android:staging`, and `android:prod` now set
`ORG_GRADLE_PROJECT_reactNativeArchitectures=arm64-v8a` (via `cross-env`)
before invoking `expo run:android` — Gradle picks this up as a project
property automatically. Cuts local native compile work roughly 4x (one ABI
instead of four). The `production`/`production-preview` EAS profiles are
untouched — the store artifact still ships all four ABIs.

### 3. `.easignore`

New file excluding `docs/*.pdf`, `docs/*.xlsx`, `docs/*.html`, `*.jks`,
`Hero-Animation-Options.pdf`, and `dist/` from the EAS cloud build upload —
none of that is needed to compile the app, so it no longer gets shipped as
build context on every `eas build`.

### 4. `resourceClass: "large"` — **reverted 2026-08-25, see below**

Added to both `android` and `ios` blocks of the `production` and `staging`
build profiles in `eas.json` — directly reduces EAS's cloud compile
wall-clock at a modest per-build-minute cost increase.

**Reverted.** The first real `eas build --profile staging` run after this
landed failed outright:

```
Large resource classes are only available for subscribers to Production,
Enterprise, or On-Demand plans. Your account (yagy-team) is not currently
subscribed to a plan.
```

This isn't a cost increase on the free tier — it's a hard block; builds
can't start at all with `resourceClass: "large"` set on an unpaid account.
Removed from both profiles. Revisit if/when the account moves to a paid
plan.

### 5. `sharp` moved to `devDependencies`

Confirmed first: no `import`/`require` of `sharp` anywhere in `src/`,
`scripts/`, or `plugins/` (it's an Expo prebuild-time tool for icon/splash
generation, not runtime code). Moving it out of `dependencies` keeps it off
the runtime install path.

### 6. `babel-plugin-module-resolver` removed

Confirmed unused — `babel.config.js` never references it (path aliases come
from `tsconfig.json` via Expo Metro instead) — and removing it dropped **17
packages** from the dependency tree via `npm uninstall`. One fewer Babel
visitor pass over every file, every bundle.

---

## Tier 2 — this week

### 7. `plugins/withRelocatedNativeBuildDirs.js` — **reverted 2026-08-24, see below**

The original fix attempted to make the Tier 1 #1 cleanup *permanent*: a
config plugin injecting `subprojects { subproject.buildDir = ... }` into
`android/build.gradle`, redirecting every native module's Gradle output from
`node_modules/<pkg>/android/build` to `android/build/<module>`. It passed
its verification at the time — `npx expo prebuild --clean` + a real
`./gradlew :app:projects` — **BUILD SUCCESSFUL**, build output confirmed
landing in the relocated path.

**That verification was insufficient.** `:app:projects` only exercises
Gradle's *configuration* phase — it never invokes CMake or compiles a single
line of C++. The first real `assembleDebug` after this plugin landed failed:

```
fatal error: 'react/renderer/components/rnreanimated/Props.h' file not found
```

Root cause, confirmed by reading the actual source:
`node_modules/react-native-reanimated/android/CMakeLists.txt:33-38`

```cmake
set(BUILD_DIR "${CMAKE_SOURCE_DIR}/build")
set(CODEGEN_OUTPUT_DIR "${BUILD_DIR}/generated/source/codegen/jni")
```

`CMAKE_SOURCE_DIR` is the module's own `android/` folder — this path is
computed via CMake's relative navigation, entirely independent of Gradle's
`buildDir` property. The plugin correctly relocated Gradle's own build
output, but every CMake-based native module (Reanimated, Worklets, Nitro
Modules, MMKV — exactly the modules this plugin existed to help, since
they're the biggest C++/CMake bloat sources) hardcodes this same assumption.
Relocating `buildDir` broke all of them identically.

**Fix: removed the plugin** (`app.json`'s `plugins[]` entry too). Patching
six-plus third-party `CMakeLists.txt` files individually, re-applied on every
version bump, isn't a sane tradeoff for a disk-space optimization.
`clean:native-cache` (#1) is the sole remaining mitigation — periodic manual
cleanup instead of automatic prevention. Confirmed the revert actually fixes
it: re-ran the exact `assembleDebug` command that failed — **BUILD
SUCCESSFUL**, real APK produced (`android/app/build/outputs/apk/debug/app-debug.apk`).

**Lesson for future plugin verification:** a Gradle configuration-phase check
proves the build *configures*, not that it *compiles*. Native-module changes
need a real `assembleDebug` (or full `eas build`) before calling them
verified.

### 8. `plugins/withGradleBuildCache.js`

A second config plugin, setting `org.gradle.caching=true` in the generated
`android/gradle.properties` — Gradle reuses unchanged task outputs across
incremental local builds instead of recompiling them. Verified present in the
regenerated `gradle.properties` after prebuild.

`org.gradle.configuration-cache` was **deliberately left off** — several
third-party Gradle plugins pulled in by autolinked RN modules aren't verified
configuration-cache-compatible, and an incompatible plugin fails the build
outright rather than just running slower. That's a dedicated compatibility
pass (`./gradlew build --configuration-cache`, then fixing whatever it
flags), not something to flip blindly alongside the build cache.

### 9. CI path filter + OTA-vs-binary policy

`.github/workflows/eas-release.yml` now ignores docs-only pushes
(`docs/**`, `**.md`, `.vscode/**`, `.maestro/**`) via `paths-ignore` — a
commit that only touches those paths no longer triggers a full native
build+submit, since nothing in them can affect the compiled binary.

Paired with a new §2.6 in `docs/CI-CD-RELEASE-GUIDE.md`: a concrete
rule-of-thumb table for when a change should ship as an `eas update` (OTA —
seconds, no store review) versus a new `eas build` (native code, config
plugins, permissions, native SDK bumps).

### 10. `docs/BUILD-METRICS.md`

New tracking doc, per the plan's own "how we'll measure it" section. Holds
the verified disk-reclaim table above, plus templated tables for local build
and EAS build wall-clock — those two need a real device/EAS run to populate,
which this environment can't produce, so they're left as clearly-marked
placeholders with the exact commands to run.

---

## Tier 3 — ongoing / strategic

### 11. `npm run doctor` (expo-doctor, wired up + run for real)

Added as a devDependency + npm script rather than left as a one-off `npx`
call. The first real run didn't just find routine drift — it caught:

- **A known Hermes V1 memory regression** (`expo@57.0.8`, fixed in `57.0.9+`).
- **A duplicate `react-native-screens` install** (`4.25.2` pinned at the top
  level vs. `4.26.2` required by `expo-router` — both were landing in
  `node_modules` instead of deduping).
- **22 packages behind** the SDK 57 compatibility matrix, including
  `react-native` itself (`0.86.0` → `0.86.2`) and `reanimated`/`worklets`.

Fixed via `npx expo install --fix` — Expo's own recommended remediation,
aligning to the SDK this project has already adopted rather than jumping to
a new one.

**Side effect, also fixed:** the bump shifted line context in two Swift/JS
patches (`patch-package`), breaking them:

- `patches/expo-modules-jsi+57.0.4.patch` — failed outright on the new
  `57.0.5`. Confirmed the underlying issue (Swift 6 concurrency checking
  rejects `weak let`; needs `nonisolated(unsafe) weak var`) was still present
  in the new source, reapplied the same fix to all 14 affected files, and
  regenerated the patch as `expo-modules-jsi+57.0.5.patch`.
- `@expo+config-plugins+57.0.6.patch` — still applied (just a version-mismatch
  warning), refreshed to `@expo+config-plugins+57.0.8.patch` for cleanliness.

**Re-verified after the bump**, same rigor as the Tier 2 plugins:
`tsc --noEmit` clean, `expo prebuild --clean --platform android` +
`./gradlew :app:projects` still **BUILD SUCCESSFUL**.

The one remaining `expo-doctor` finding — three third-party packages
(`@notifee/react-native`, `@eabdullazyanov/react-native-sms-user-consent`,
`hyper-sdk-react`) flagged by React Native Directory as unmaintained /
untested-on-New-Architecture / unknown — is silenced via
`expo.doctor.reactNativeDirectoryCheck.exclude` in `package.json`, not fixed.
These are deliberately-chosen dependencies (push notifications, SMS OTP
autofill, the Juspay payment SDK); swapping any of them is a product decision
needing its own testing pass, not a build-optimization task. `npm run doctor`
now reports a clean **21/21** — so a *new* regression won't get lost in
permanent noise.

### 12. Re-check bloat after every SDK bump

Folded into the same habit as #11 — `docs/BUILD-METRICS.md` now documents
`npm run doctor` immediately followed by the disk re-measurement as one
checklist, since an SDK bump is exactly when both regress together.

### 13. OTA-vs-binary team policy

Already covered by Tier 2 #9 (§2.6 in `docs/CI-CD-RELEASE-GUIDE.md`) — no
separate work needed here.

---

## What's intentionally not done here

- **Local/EAS build wall-clock numbers** (`docs/BUILD-METRICS.md`) — needs a
  real device or a paid EAS build run to measure honestly; left as
  placeholders rather than invented numbers.
- **`org.gradle.configuration-cache`** — needs its own compatibility pass
  across every autolinked Gradle plugin first (see #8).
- **Swapping the three React Native Directory-flagged packages** (#11) — a
  product decision with its own testing pass, not a build-optimization task.

---

## Files changed (none committed — for manual review)

```
modified:   .github/workflows/eas-release.yml
modified:   app.json
modified:   docs/CI-CD-RELEASE-GUIDE.md
modified:   eas.json
modified:   package-lock.json
modified:   package.json
deleted:    patches/@expo+config-plugins+57.0.6.patch
deleted:    patches/expo-modules-jsi+57.0.4.patch

new file:   .easignore
new file:   docs/BUILD-METRICS.md
new file:   docs/BUILD-OPTIMIZATION-CHANGES.md
new file:   docs/BUILD-OPTIMIZATION-CHANGES.pdf
new file:   patches/@expo+config-plugins+57.0.8.patch
new file:   patches/expo-modules-jsi+57.0.5.patch
new file:   plugins/withGradleBuildCache.js
```

(`plugins/withRelocatedNativeBuildDirs.js` was added then removed in the same
pass — see #7 — so it doesn't appear in the final diff.)

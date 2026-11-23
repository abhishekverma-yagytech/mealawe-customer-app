# Build Metrics — MealaweUserAppRN

Tracks the measurable impact of `docs/BUILD-OPTIMIZATION-PLAN.md`, per its own
§5 ("How we'll measure it"). Update this file whenever a build-optimization
change lands — a claim without a before/after number here is just a guess.

---

## Disk: `node_modules` native build-artifact bloat (Tier 1 #1; Tier 2 #7 reverted)

The plan's worst-offender table (§2.1), re-measured after adding
`clean:native-cache` (Tier 1 #1):

| Package | Before (§2.1 baseline) | After a clean | Reduction |
|---|---|---|---|
| `react-native-reanimated` | 4655 MB | 8.2 MB | 99.8% |
| `react-native-worklets` | 3263 MB | 1.8 MB | 99.9% |
| `expo-modules-core` | 2390 MB | 34 MB | 98.6% |
| `react-native-nitro-modules` | 2253 MB | 1.1 MB | 99.95% |
| `react-native-mmkv` | 1210 MB | 0.5 MB | 99.96% |
| `react-native-screens` | 1051 MB | 5.3 MB | 99.5% |
| `react-native-gesture-handler` | 987 MB | 5.7 MB | 99.4% |
| **Total (these 7)** | **~15.8 GB** | **~56.6 MB** | **~99.6%** |

**Whole `node_modules`, measured directly:** 16.48 GB (§2.1 baseline) →
**1.2 GB** (`du -sh node_modules`, post-cleanup). The 7-package table above
accounts for nearly all of the reduction, as the plan's own breakdown
predicted.

**Update 2026-08-24 — Tier 2 #7 (`plugins/withRelocatedNativeBuildDirs.js`)
reverted.** It made the cleanup above *temporary* by relocating Gradle's
`buildDir`, but a real `assembleDebug` (not just the `:app:projects`
config-phase check used to "verify" it) failed with a C++ codegen header not
found. Root cause, confirmed by reading the actual CMakeLists.txt:
`node_modules/react-native-reanimated/android/CMakeLists.txt:33-38` computes
its codegen include path as `${CMAKE_SOURCE_DIR}/build/generated/...` —
hardcoded relative to the module's own `android/` folder, entirely
independent of Gradle's `buildDir` property. Every CMake-based native module
(reanimated, worklets, nitro-modules, mmkv — exactly the modules this plugin
existed to help) has the same assumption, so relocating `buildDir` broke all
of them identically. No safe per-module workaround exists without patching
six+ third-party `CMakeLists.txt` files by hand, re-applied on every version
bump — not worth it for a disk-space optimization. Reverted; `clean:native-cache`
(Tier 1 #1) remains the mitigation — manual/periodic instead of automatic.
**Lesson: a Gradle *configuration*-phase check (`:app:projects`) does not
prove a real compile works** — CMake/codegen errors only surface during an
actual `assembleDebug`.

Re-run this measurement after any Expo/RN SDK bump (plan §3 Tier 3 item 12 —
new native modules or major version jumps are exactly when this regresses),
alongside the dependency-drift check below:

```bash
npm run doctor                # Tier 3 #11 — catch version drift first
npm run clean:native-cache    # or just: rm -rf android && npx expo prebuild --clean
du -sh node_modules/react-native-reanimated node_modules/react-native-worklets \
      node_modules/expo-modules-core node_modules/react-native-nitro-modules \
      node_modules/react-native-mmkv node_modules/react-native-screens \
      node_modules/react-native-gesture-handler
```

---

## Dependency drift — `npm run doctor` (Tier 3 #11)

Wired up as `npm run doctor` (`expo-doctor`, added as a devDependency so it
doesn't refetch via `npx` every run). First real run on 2026-08-24 caught more
than routine drift:

- **A known Hermes V1 memory regression** — `expo@57.0.8` was affected;
  fixed in `57.0.9+`.
- **A duplicate `react-native-screens` install** — `4.25.2` pinned at the
  top level vs. `4.26.2` required by `expo-router`, both landing in
  `node_modules` instead of deduping.
- **22 packages behind** the SDK 57 compatibility matrix, including
  `react-native` itself (`0.86.0` → `0.86.2`) and `reanimated`/`worklets`.

Fixed via `npx expo install --fix` (Expo's own recommended remediation —
aligns to the already-adopted SDK 57's matrix, not a jump to a new SDK).
That bump broke two Swift patches whose line context shifted
(`patches/expo-modules-jsi+57.0.4.patch`, `@expo+config-plugins+57.0.6.patch`)
— both regenerated against the new versions (`57.0.5` / `57.0.8`) after
confirming the underlying fix (`weak let` → `nonisolated(unsafe) weak var`
for Swift 6 concurrency checking) was still needed in the updated source.
Re-verified after the bump: `tsc --noEmit` clean, `expo prebuild --clean` +
`./gradlew :app:projects` still **BUILD SUCCESSFUL**.

The one remaining `expo-doctor` finding — three third-party packages
(`@notifee/react-native`, `@eabdullazyanov/react-native-sms-user-consent`,
`hyper-sdk-react`) flagged by React Native Directory as unmaintained/
untested-on-New-Architecture/unknown — is **silenced, not fixed**, via
`expo.doctor.reactNativeDirectoryCheck.exclude` in `package.json`. These are
known, deliberately-chosen dependencies (push notifications, SMS OTP
autofill, the Juspay payment SDK) — swapping any of them is a product
decision requiring its own testing pass, not a build-optimization task. The
exclude just keeps `npm run doctor` at a clean 21/21 so a *new* regression
doesn't get lost in permanent noise.

---

## Wall-clock: local Android builds (Tier 1 #2)

**Not yet recorded** — needs a real device/emulator run, which this
environment doesn't have. Record it on the next local build:

```bash
# Cold (after a clean/prebuild):
time npm run android:local

# Warm (incremental, no native changes):
time npm run android:local
```

| Run | Before (4 ABIs) | After (arm64-v8a only) |
|---|---|---|
| Cold | _(record on next clean build)_ | _(record on next clean build)_ |
| Warm | _(record on next incremental build)_ | _(record on next incremental build)_ |

Expected: ~4x less native compile work per the plan's estimate (§2.2) — this
row exists to confirm that against a real stopwatch, not assume it.

---

## Wall-clock: EAS cloud builds (Tier 1 #4 — reverted)

**`resourceClass: "large"` never got a before/after number — it never got a
successful build at all.** The first real `eas build --profile staging` run
after adding it failed immediately: `yagy-team` is on EAS's free tier, and
large resource classes require a paid (Production/Enterprise/On-Demand)
plan. Reverted from both `staging` and `production` profiles in `eas.json`
— see `docs/BUILD-OPTIMIZATION-CHANGES.md` #4. Nothing to measure until the
account is on a paid plan.

---

## CI minutes (Tier 2 #9)

`paths-ignore` on `.github/workflows/eas-release.yml` skips the workflow
entirely for docs-only pushes (`docs/**`, `**.md`, `.vscode/**`,
`.maestro/**`) — see `docs/CI-CD-RELEASE-GUIDE.md` §2.6. Track this
qualitatively for now: count how many `master` pushes in a given month would
have been docs-only (GitHub → Insights → Actions usage, or `git log --stat`
on `master` filtered to those paths) vs. how many now correctly skip.

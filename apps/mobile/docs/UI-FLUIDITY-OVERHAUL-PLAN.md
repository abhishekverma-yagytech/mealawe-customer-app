# Mealawe App — Typography, Fluidity & Motion Overhaul Plan

**App:** MealaweUserAppRN (Expo SDK 57 · NativeWind v5 · Gluestack v5 · React Native Reanimated 4.5)
**Prepared:** 2026-08-13
**Status:** For review — no code has been changed yet

---

## 1. Why this plan exists

Feedback from testing against Zomato and Swiggy: the app currently reads as visually "bigger" and less polished than those references. Five concrete asks came out of that comparison:

1. Text feels oversized on smaller phones — reduce sizes, consider a new font family, make sizing responsive to screen size.
2. When a screen scrolls, the header/status bar area doesn't behave like other apps — it should settle into a **solid** bar instead of staying transparent/floating.
3. Every animation in the app should feel **fluid**, not abrupt — the user asked specifically about GSAP.
4. The "it's raining" banner exists conceptually but doesn't show up in the new app at all.
5. On launch, there should be one consistent screen — like Swiggy's — that detects the user's location with an animation, before landing on Home.

This document is the plan for all five. Nothing below has been implemented yet; it's written to be approved (as‑is or with edits) before implementation starts.

---

## 2. Current state (verified in the codebase)

### 2.1 Typography
- Single font family app-wide: **Lato** (400/700/900), loaded via `@expo-google-fonts/lato` in `src/app/_layout.tsx`.
- Fixed-pixel size scale in `src/theme/typography.ts` (mirrored in `src/global.css`):

  | Token | Current px |
  |---|---|
  | overline | 11 |
  | caption | 12 |
  | bodySm | 13 |
  | body / label | 14 |
  | bodyLg | 16 |
  | title | 17 |
  | h3 | 20 |
  | h2 | 24 |
  | h1 | 28 |
  | display | 34 |

- **No responsive scaling exists anywhere** — no `PixelRatio`, no width-based scale helper, no `useWindowDimensions`-driven sizing. Every value renders identically on a small phone and a large one, which is exactly why text feels oversized on smaller screens: the same 28px h1 takes up proportionally more of a 5.4" screen than a 6.7" one.
- `AppText` is the sanctioned text primitive that enforces these tokens, but several screens bypass it with raw Tailwind size classes or literal `fontSize` values (`welcome.tsx`, `AppSplash.tsx`, `login.tsx`, `register.tsx`, `feedback.tsx`, `explore.tsx`, `OtpInput.tsx`, `TextField.tsx`, `LocationPicker.tsx`, `cart.tsx`, `on-demand-cart.tsx`, `BulkCouponCard.tsx`, `ChatComposer.tsx`). These leaks need closing or the new scale won't hold everywhere.

### 2.2 Header / status bar on scroll
- The Home tab already animates the **hero image height** on scroll (via Reanimated, in `src/app/(tabs)/index.tsx`) — it shrinks from 260px down to a collapsed strip. That's a different thing from what's being asked for.
- The header itself never changes background or opacity — it's just permanently layered on top of the (shrinking) hero.
- `StatusBar` style is **hardcoded to `"light"`** on Home, and `"auto"` elsewhere — it never reacts to scroll position at all.
- This is actually a latent bug, not just a missing feature: once the hero fully collapses and a white/light background is left underneath, light (white) status-bar icons on a light background become close to invisible.
- Detail screens use React Navigation's native header (`headerShown: true`), which has no scroll listener today.

### 2.3 Animation
- `react-native-reanimated` (v4.5, worklet/UI-thread based) is already installed and already powers the hero-collapse.
- `lottie-react-native` is installed and used for the home hero carousel.
- `@legendapp/motion` (a Moti-style declarative motion library) is **installed but never imported anywhere** — dead weight currently, but directly useful here.
- **GSAP is not installed, and can't be** — see §3.3 for why.

### 2.4 Rain notification
- This is not a net-new feature — it already exists end-to-end:
  - `ClusterConfigVariable.showRainyNotification` (server schema + DAO) — an admin-facing per-cluster boolean toggle.
  - Dashboard checkbox: "Show Rainy Notification" in cluster config.
  - The **current production Ionic app** consumes it (`tab-home.component.ts`/`.html`) and shows a persistent Lottie banner (`RAINYNOTI.json`) on Home whenever the flag is on.
- **The gap is entirely in the new RN app.** `src/store/clusterStore.ts` re-declares the same set of cluster flags for RN (`showSubscription`, `showBulk`, `showDineIn`, `showOndemand`, `showNavmool`) but the code comment says "every key mirrors `ClusterConfigVariable`" — and `showRainyNotification` was simply left out. No rain asset, no rain UI, anywhere in `MealaweUserAppRN/src`.
- Per your screenshot (Blinkit reference): the desired behavior is different from the Ionic app's *persistent* banner — you want it to **animate in from the top, hold for 5–10 seconds, then disappear**, not sit there indefinitely. That's the spec this plan follows.

### 2.5 Launch flow
- Today: native splash (`expo-splash-screen`, solid green) → in-app `AppSplash` (static logo + spinner, ~1.8s minimum) → `welcome` carousel (**first run only**) → tabs.
- Location is fetched silently in the background once the Home tab mounts — there's no dedicated "detecting your location" screen, and nothing plays a Swiggy-style animation for it.

### 2.6 Bottom floating bars overlapping on smaller devices — found and fixed

A sixth issue surfaced after this plan's first pass: on smaller screens, two of Home's bottom-pinned bars — the pill nav bar (`HomeBottomNav`) and the "open orders / sticky CTA" card above it (`BottomOverlayStack`) — could visually collide ("intermingled"). Root cause, confirmed in the code:

- `BottomOverlayStack` positioned itself using `HOME_NAV_BAR_CLEARANCE`, a **hardcoded arithmetic constant** (`62 + 16 + 4 = 82px`) that assumed `HomeBottomNav`'s rendered height was always exactly 62px.
- `HomeBottomNav`'s real height was never measured — it renders text labels (via `AppText`), so its true height shifts with the OS accessibility text-size setting, label wrapping, and (now) this plan's own responsive font scale. On a short screen, a device with larger system text, or a device with a taller safe-area inset, the real bar can grow past the assumed 62px.
- Neither bar set a `zIndex`, so if they collided, which one visually won depended on render order (`HomeBottomNav` happened to paint second, silently clipping the card above it) rather than anything deliberate.

**Status: fixed, not just planned.** `HomeBottomNav` now reports its actual rendered height via `onLayout` into a small store (`useHomeNavBarStore`); `BottomOverlayStack` and every feed's scroll-padding calculation (`useBottomStackClearance`) read that live measurement instead of the hardcoded guess. Both bars also now set explicit `zIndex` (nav bar above the overlay stack) so navigation stays reachable even in a residual edge case. `BulkCartFooter`/`OnDemandCartFooter` (the other bottom-pinned bars, on the Bulk/On-Demand menu screens) were checked too — each is the only floating bar on its screen, so they weren't at risk of this specific collision.

---

## 3. Proposed changes

### 3.1 Typography: size, family, and responsiveness

**a) Compact the scale.** Proposed new values (open to fine-tuning once seen on-device, but this is the target direction — the biggest cut is at the top end, which is where "everything looks big" is most visible):

| Token | Current | Proposed |
|---|---|---|
| overline | 11 | 10 |
| caption | 12 | 11 |
| bodySm | 13 | 12 |
| body / label | 14 | 13 |
| bodyLg | 16 | 14 |
| title | 17 | 15 |
| h3 | 20 | 17 |
| h2 | 24 | 19 |
| h1 | 28 | 22 |
| display | 34 | 26 |

Line-height and letter-spacing will be tightened alongside the size cut (currently generous; Zomato/Swiggy run noticeably tighter line-height on headings), audited token-by-token during implementation.

**b) Make sizing responsive to screen width.** A small hook (no new dependency — this is ~30 lines, doesn't need `react-native-size-matters`) that scales the base token by device width:

- Reference width: 375 (iPhone/typical Android baseline)
- `< 360dp` (small phones — iPhone SE, budget Android): × 0.94
- `360–414dp` (standard): × 1.0
- `> 414dp` (phablets/tablets): × 1.06
- Result clamped to [0.9×, 1.1×] so nothing gets absurd on a tablet.
- `AppText`'s underlying `Text` also gets `maxFontSizeMultiplier` (~1.3) so a user's OS-level "huge font" accessibility setting can't blow up the layout, while still allowing moderate accessibility scaling through.

**c) Font family — default is to keep Lato.** This project's own `CLAUDE.md` documents Lato as the brand font and explicitly says not to adopt generic font suggestions from design-lookup tooling. That's a real, deliberate decision already on record, so this plan **defaults to keeping Lato** and gets the "less big / more modern" feel from the size cut in (a), tighter line-height/letter-spacing, and leaning on Lato's Regular/Bold weights rather than Black (which reads heavier than the rest of the scale). If you'd want to revisit the brand font itself, that's a separate call — not something this plan makes for you:

| Option | Character | Verdict |
|---|---|---|
| **Lato (keep)** | Current, documented brand font | Default — no change |
| Outfit | Geometric, modern, confident numerals — closest match to the Zomato/Swiggy "grotesk" feel | Only if you want to reopen the brand-font decision |
| Manrope | Slightly narrower, very clean, makes text feel smaller at the same px | Only if you want to reopen the brand-font decision |
| Plus Jakarta Sans | Rounded terminals, friendly | Only if you want to reopen the brand-font decision |

If a family change is wanted later, the swap is low-risk mechanically — same `@expo-google-fonts/*` infrastructure already in place — but that's a deliberate brand call for you to make, not a default of this plan.

**d) Enforcement.** Close the `AppText` leaks listed in §2.1 so the new scale actually holds everywhere, not just in screens that already use the primitive correctly.

**e) Guardrail — touch targets don't shrink.** "Everything looks big" is about visual/typographic density, not tap-target size. The project's existing 44×44 minimum touch-target rule stays untouched — padding around interactive elements can be trimmed for visual density, but the tappable area itself does not shrink below 44×44.

### 3.2 Scroll-reactive solid header + status bar

New `useScrollSolidHeader(scrollY)` hook (Reanimated, reusing the `scrollY` shared value that already exists for the hero-collapse):
- Interpolates header background opacity from `0 → 1` over the last ~50px before the hero finishes collapsing.
- Flips `StatusBar` style (`light` → `dark`) in sync with that same range, fixing the invisible-icons bug from §2.2 as a side effect.
- Applied to all four Home feeds (On-Demand, Dine-In, Subscription, Navmool) that share the collapsing-hero pattern.
- **Stretch scope (flagged, not default):** native-header detail screens (kitchen detail, etc.) don't have scroll-driven headers today either. Bringing those in line means converting them from React Navigation's native header to a custom header component — bigger, separate effort. Default plan treats this as Phase 2 stretch, not required for v1.

### 3.3 Fluid animation — GSAP correction

**GSAP will not be used — it physically can't run here.** GSAP animates DOM/CSS properties in a browser; `ScrollTrigger`, `SplitText`, etc. all require a DOM. React Native has no DOM, so GSAP has no React Native binding at all.

The direct native equivalent — and the actual reason GSAP *feels* fluid on web — is that it runs animations off the main thread. **React Native Reanimated does the same thing on RN** (worklets execute on the UI thread), and it's already in this app powering the hero-collapse. Plan:

- Standardize a small `motion.ts` constants file (durations/easings), translating the same values a GSAP setup would use:
  - Micro-interactions (press feedback): 100–150ms
  - Standard transitions (banner, header): 300–450ms, ease-out
  - Entrance stagger: 250–350ms, ~30–40ms delay per item, capped at ~8 concurrently animating items (same cap GSAP guidance uses, for the same reason — beyond that it reads as laggy, not fluid)
- Activate `@legendapp/motion` (already installed, currently unused) for declarative multi-step sequences — this is the closest RN equivalent to a GSAP timeline, used where raw Reanimated code would get verbose (e.g. the location-splash radar animation in §3.5).
- All of the above respects the app's existing reduced-motion accessibility principle (already documented in `PRODUCT.md`/`CLAUDE.md`) — every new animation needs a static/instant fallback when the OS reduce-motion setting is on, same as existing motion in the app.
- Concrete touchpoints to make fluid:
  - Rain banner slide-in/out (§3.4)
  - Header solid transition (§3.2)
  - Home feed card/list entrance (staggered fade + 15–20px translate)
  - Button press feedback: scale to 0.97 on press-in, spring back on release (also recommend adding `expo-haptics` — not currently installed — for a light tap on primary actions; small addition, big perceived-quality gain)
  - Location-splash entrance (§3.5)

### 3.4 Rain notification — port + banner behavior

1. Add `'showRainyNotification'` to `ClusterFlagKey` / `CLUSTER_FLAG_KEYS` in `src/store/clusterStore.ts` — one-line fix that reconnects the already-working backend/dashboard toggle. No server or dashboard changes needed.
2. Build a `RainBanner` component matching your reference screenshot:
   - Full-width, sits above the Home header/greeting.
   - Soft blue-tint background (distinct from the app's green, which stays reserved for CTAs per the existing Modern Fresh color plan), bold navy heading ("It's raining near this location"), gray subtext ("Our delivery partners may take longer to reach you").
   - Wavy/scalloped bottom edge via `react-native-svg` (already installed).
   - Animates in from above the safe area (slide + fade, ~400ms), holds for **7 seconds** (configurable constant; your ask was 5–10s), then slides back out (~300ms).
   - Shows **once per app-foreground session** when the flag is on — not replayed every time the user revisits the Home tab in the same session, so it doesn't nag.

### 3.5 Swiggy-style launch/location screen

New full-screen step inserted into the boot flow, **after** the existing `AppSplash` and **before** `welcome`/tabs, shown on *every* cold launch (not just first run):
- Animated location pin with pulsing radar rings (Reanimated/Legend Motion loop) + "Finding your location…" text.
- Triggers the location permission/fetch flow that today happens silently on the Home tab — moved earlier so it's the same request, just surfaced with intent instead of hidden.
- If the user already granted permission, this still shows briefly (mirrors Swiggy — it's a consistency/branding beat, not just a permission gate) then resolves fast.
- Timeout fallback (~4s default) surfaces "having trouble finding you" with a manual address-entry option, reusing the existing `LocationPicker`/`LocationGate` rather than duplicating that logic.
- Transitions into Home with a cross-fade rather than a hard cut.

---

## 4. What's explicitly out of scope

- No color/brand palette changes — the existing Modern Fresh plan (green reserved for CTAs) stays as-is.
- No navigation/IA restructuring.
- No server or dashboard changes (the rain toggle infrastructure already works correctly).
- No introduction of GSAP or any web-only library.

---

## 5. Phased implementation order

| Phase | Scope | Relative size | Risk | Status |
|---|---|---|---|---|
| 0 | Compact type scale + responsive hook + close `AppText` leaks (kept Lato per brand policy) | S | Low — additive, token-driven | **Done** — `tsc --noEmit` + `expo export` clean |
| 0b | Bottom floating bar overlap fix (measured nav-bar height + zIndex) | S | Low — self-contained | **Done** |
| 1 | Rain notification port (flag + banner) | S | Low — self-contained, one new component | **Done** |
| 2 | Scroll-reactive solid header + status-bar fix (4 Home feeds); native-header detail screens as stretch | M | Medium — touches shared scroll logic | **Done** (v1 scope — native-header detail screens still deferred, as planned) |
| 3 | Fluid animation pass (motion constants, list stagger, press feedback, haptics) | M | Low-medium | **Partial** — `motion.ts` constants shipped; press-feedback on the shared `Button` and list-entrance stagger deferred (see note below) |
| 4 | Swiggy-style launch/location screen | M-L | Medium — touches boot flow + permission handling | **Done** |

Recommended order matches the table top to bottom — everything through Phase 4 has landed except the flagged Phase 3 remainder. Verified after every phase with `npx tsc --noEmit` (clean throughout) and a final `npx expo export --platform android -c` (bundled 4684 modules with no errors) — this project has no automated test suite (see `docs/TESTING-WORKFLOW.md`), so on-device/Maestro visual QA is still the required next step before shipping.

**Why Phase 3 stopped short:** rolling scale-based press feedback onto the shared `Button` component (used on every screen) would need wrapping its `Pressable` in `Animated.createAnimatedComponent`, and this codebase has no existing precedent for combining that with NativeWind's `className` styling. Without a device/simulator to visually verify the interop, changing the single most-reused component in the app on an untested assumption was the wrong risk to take. `motion.ts` (the shared duration/easing tokens) is in place so this — and the list-entrance stagger — can land quickly once verified on a real device.

---

## 6. Decisions recorded as defaults (flag any you'd want changed)

1. **Font family:** keep Lato (your documented brand font) — the "less big" feel comes from the compact scale + tighter line-height, not a family swap. Only reconsider Outfit/Manrope/Plus Jakarta Sans if you want to explicitly reopen that brand decision.
2. **Rain banner:** 7-second hold, once per app-foreground session. Change the duration or re-trigger policy if you want it to reappear more/less often.
3. **Scroll-header fix scope:** the 4 Home feeds only for v1; native-header detail screens deferred to a stretch phase.
4. **Location splash:** shows every cold launch (even for returning users with permission already granted), 4-second timeout before offering manual entry.

## 7. Testing plan

- Manual pass on a small-screen device/simulator (iPhone SE-class width, ~360dp Android) and a large one, to confirm the responsive type scale actually reads as more consistent than today's fixed scale.
- `prefers-reduced-motion`-equivalent check (RN accessibility reduce-motion setting) — animations should degrade gracefully, not break layout.
- Rain banner: toggle `showRainyNotification` on/off in cluster config and confirm animate-in/hold/animate-out timing and the once-per-session guard.
- Status bar contrast check at every point along the scroll range, specifically the transition zone that's buggy today.
- Cold-launch timing check for the new location screen — confirm it doesn't add a jarring delay for users who already granted permission.

---

*This plan covers design direction and technical approach only — no source files have been modified. Implementation starts once this is approved (as-is, or with the defaults in §6 adjusted).*

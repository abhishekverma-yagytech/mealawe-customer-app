# Native Navigation, Widgets Validation, MCP & Observability — Implementation Plan

**Project:** MealaweUserAppRN (Expo SDK 57 · `expo-router` 57.0.8 · RN 0.86 · React 19.2)
**Companion docs:** [`LIVE-ORDER-TRACKING-PLAN.md`](LIVE-ORDER-TRACKING-PLAN.md),
[`PLATFORM-NATIVE-FEATURES-PLAN.md`](PLATFORM-NATIVE-FEATURES-PLAN.md) — this doc doesn't
repeat Live Activities/widgets planning, it validates that work against Expo's own
announcement posts and covers four new, separate items.
**Status:** Items 2–4 below are **implemented and verified** (`npx tsc --noEmit`,
`npx expo export` for both platforms). Item 1 (native navigation) has one real usage
shipped (a Toolbar on `orders.tsx`) plus a full inventory of what else is available —
adopting the rest is a deliberate per-screen decision, not a blanket migration.

Researched directly from Expo's own sources (not secondhand): the docs page at
`docs.expo.dev/versions/latest/sdk/widgets/`, and the blog posts "Home screen widgets
and Live Activities in Expo" (alpha announcement, Mar 2026), "iOS widgets and Live
Activities are stable in Expo SDK 56" (stable announcement, Jun 2026), "Expo Router
v55: more native navigation, more powerful web" (Mar 2026), "Become an AI-native
developer with the Expo MCP server" (Oct 2025) plus its current docs page at
`docs.expo.dev/eas/ai/mcp/`, and "Introducing Observe: Performance monitoring for Expo
apps" (Jun 2026). Every API used below was cross-checked against this project's
**actually installed** package versions, not just the blog examples — package APIs
moved between the versions discussed in these posts and what SDK 57 ships.

---

## 1. Native navigation — Expo Router's new Stack API

The "Expo Router v55" post shipped alongside **Expo SDK 55**; this project is on
**SDK 57**, two versions ahead. Everything from that post is present in the installed
`expo-router` (57.0.8) — verified directly against its shipped `.d.ts` files, which
expose an even larger API surface than the blog's examples (e.g. `Stack.Toolbar.Menu`,
`.MenuAction`, `.Badge`, `.Icon`, `.Label`, `.View` weren't mentioned in the post but
exist in this project's installed version).

### 1.1 Toolbar API — implemented

`Stack.Toolbar` brings a native toolbar to any screen, three placements:

| Placement | Behavior |
|---|---|
| `"left"` / `"right"` | Renders inside the native header. Using either automatically forces `headerShown: true`. |
| `"bottom"` (default) | A bottom toolbar anchored above the safe area — page components only, not layouts. |

Implemented on `src/app/orders.tsx` — a right-placement "Help" button that deep-links to
`/help`:

```tsx
<Stack.Toolbar placement="right">
  <Stack.Toolbar.Button onPress={() => router.push('/help')}>Help</Stack.Toolbar.Button>
</Stack.Toolbar>
```

**Deliberately text-only, no `icon` prop.** The installed types are explicit: *"On
Android, only image source is supported [for `icon`]"* and *"When icon is used, the
label will not be shown."* Passing an SF Symbol string (the blog's `icon="folder.badge.plus"`
style examples are iOS-only strings) would render a blank button with a hidden label on
Android. Cross-platform-safe options, in order of effort:
1. **Text label** (what's shipped) — works identically on both platforms today.
2. **`<Stack.Toolbar.Icon>` + `<Stack.Toolbar.Label>` sub-components** with a real image
   asset (not an SF Symbol string) supplied for Android.
3. Platform-branch the `icon` prop (`Platform.select`) once real icon assets exist for
   both platforms.

Confirmed **both-platform** support directly from the type definitions (`@platform
android` and `@platform ios` on every prop), with Android-specific props
(`tintColor`, `backgroundColor`) confirming it isn't an iOS-only "liquid glass" feature
as the marketing framing might suggest — Android gets a Material-styled toolbar.
Marked `@experimental` in the shipped types, same as it was at the v55 announcement —
worth re-checking before leaning on it for anything business-critical.

**Where to extend next (not done — deliberately scoped out this round):**
- A `placement="bottom"` example fits naturally on a list/browse screen, but every
  candidate screen already has a considered, hand-built footer or action row (cart's
  checkout footer, help's chat/call/email row) — replacing those without live device
  testing is exactly the kind of change that shouldn't be made speculatively. Pick a
  screen deliberately, not to check a box.
- Real icon assets (SF Symbol equivalents + Android xcasset/image) so the toolbar
  buttons can carry icons instead of text, matching the rest of the app's icon-first
  design language.

### 1.2 Native Tabs — available, not adopted (correction: there's no native tab bar to migrate)

**Correction to this doc's first draft:** `src/app/(tabs)/_layout.tsx` isn't a tab bar
at all — it's just a bare `<Stack screenOptions={{ headerShown: false }} />` (the
comment right above it explains why: Home owns full-height layout so the subscription
Subscribe bar can pin to the screen bottom). The actual "tab bar" is
`src/features/home/components/HomeBottomNav.tsx` — a custom floating pill nav for the
order-mode shortcuts, positioned absolutely over scrolling content.

`expo-router/unstable-native-tabs` renders true native `UITabBarController`/Material
tab bars, with Material Dynamic Colors on Android by default and an iOS 26+
`BottomAccessory`. Still `unstable_`-prefixed — **not adopted**, and migrating
`HomeBottomNav` to it would mean replacing a bespoke component (per-tab accent tinting,
custom sizing, `DESIGN.md` styling) with a full navigator-level primitive — a real
architecture change, not addressed here.

**What *was* added instead (see §1.1b below):** the floating pill nav is exactly the
surface Apple's Liquid Glass material is designed for, and that didn't require the
Native Tabs migration to add — `expo-glass-effect` (already a dependency, previously
unused) applies directly to the existing custom component.

### 1.1b Liquid Glass on the floating nav — implemented

`expo-glass-effect` exports `GlassView` (a native host `View` with a real Liquid Glass
material — `glassEffectStyle: 'clear' | 'regular' | 'none'`, `tintColor`,
`isInteractive`) and `isLiquidGlassAvailable()` (a capability check that returns
`false` gracefully on anything that doesn't support it — older iOS, Android, web —
verified against the package's own fallback `.js` files, not just the `.ios` ones, so
the plain `import` is safe on every platform even though the effect itself is
iOS-26+-only).

`HomeBottomNav.tsx` now branches on `isLiquidGlassAvailable()`:
- **Available:** the pill renders as a `GlassView` (`glassEffectStyle="regular"`,
  `isInteractive` since it hosts pressable tab buttons) — no more solid
  `colors.card` background, an actual translucent/refractive material instead.
- **Unavailable:** falls back to the exact same solid `View` + `colors.card` +
  `shadow.card` it already rendered — **zero behavior change** on Android or
  pre-26 iOS.

`GlassView` is a native host component, not a composed `View` — its branch passes
every layout value (`position`, `left`/`right`, `bottom`, `borderRadius`, `padding`,
`flexDirection`, `gap`) through the `style` prop rather than `className`, since
NativeWind's utility-class transform reaching an unfamiliar native component (as
opposed to the plain RN primitives it's proven against everywhere else in this app)
isn't something to assume without a device to verify on. The per-tab active-state tint
animation (`NavTabButton`'s `interpolateColor` from transparent → accent tint) is
untouched — it layers on top of whichever background (glass or solid) the outer
container provides, so none of that logic needed to change.

**Not verified:** the actual glass rendering on a device — `npx tsc --noEmit` and
`npx expo export` (both platforms) are clean, confirming the code compiles and bundles,
but the visual result (blur quality, tint legibility over the Lottie hero, interactive
highlight behavior) needs a real iOS 26 device or simulator to judge.

Native Tabs itself remains a follow-up candidate only once the API drops `unstable_`
and only if `HomeBottomNav` is ever reconsidered as a navigator-level primitive instead
of a page-level component — not blocking on anything in this section.

### 1.3 Dynamic platform colors — available, not adopted

`Color.ios.*` / `Color.android.*` / `Color.android.dynamic.*` from `expo-router` give
direct access to system/wallpaper-derived colors. This app has its own brand palette
(`src/theme/palette.ts`, `global.css`) that intentionally does **not** follow system
dynamic colors (green/teal/cream brand identity per `DESIGN.md`) — adopting this would
work against the established design system, not with it. Not adopted; noted for
narrow, deliberate use only (e.g. a genuinely "native-feeling" surface like a widget,
where `expo-widgets`' own environment/color-scheme props already cover the same need).

### 1.4 Zoom transitions — available, not adopted

`<Link.Trigger withAppleZoom>` gives gesture-driven shared-element transitions from a
list item to its detail screen (Apple platforms; graceful fallback elsewhere). A good
fit for something like a kitchen/menu image → detail transition, but it's a genuine
visual-design decision (which screens get it, what the "shared element" is) rather
than infrastructure — left for a dedicated design pass, not bundled into this one.

### 1.5 Web/server features — not applicable

`expo-server` (renamed from `@expo/server`), configurable response headers,
experimental SSR, experimental data loaders, and experimental split view (iPad) all
target `web.output`/SSR configurations and/or iPad multi-column layouts. This project
has no web target (`app.json` platforms are `["ios", "android"]` only, per
`SETUP.md`) and no iPad-specific layout today — none of this applies. Documented here
only so it's not "rediscovered" as missing later.

---

## 2. `expo-widgets` — validated against Expo's own announcements

Cross-checked the implementation from `PLATFORM-NATIVE-FEATURES-PLAN.md` /
`LIVE-ORDER-TRACKING-PLAN.md` against both Expo blog posts on this library:

- **"Home screen widgets and Live Activities in Expo" (alpha, shipped with SDK 55):**
  confirms the `'widget'` directive convention, the `@expo/ui` primitive mapping, and
  that `expo-live-activity` (the package both companion docs originally pointed at,
  before this session's correction) predates this library and is now superseded.
- **"iOS widgets and Live Activities are stable in Expo SDK 56":** confirms
  `expo-widgets` **graduated from alpha to stable at SDK 56** — this project is on
  SDK 57, one version past stabilization, so the installed `expo-widgets@57.0.10` is
  the **stable**, not alpha, API. The stable-announcement code example
  (`createWidget(name, (props, environment) => {...})`) matches this project's
  `src/features/tracking/liveActivity.tsx` and `src/features/orders/orderWidget.tsx`
  exactly — same function shape, same `WidgetEnvironment` second parameter.
- Confirms the product framing already used in this project's planning: *"widgets are
  for check-ins, Live Activities are for in-progress"* — matches the existing
  recommendation to ship "reorder your usual" as the widget (a check-in) rather than a
  live order-status widget (already covered by the Live Activity).
- **New in stable (SDK 56), not yet used here:** configurable widgets (user picks what
  a widget shows from the widget gallery) and interactive widget buttons (a `Button`
  from `@expo/ui/swift-ui` with `target`/`onPress` returning a partial state update,
  handled without launching the app). The current `MealaweOrderWidget` is
  display-only; adding a real "Reorder" button using this pattern is a natural,
  low-risk enhancement once the widget itself has been validated on a device.

No code changes made in this section — it's a validation pass confirming the existing
implementation is current and correct, not a gap.

---

## 3. Expo MCP Server — implemented

A **development-workflow tool**, not an app feature: connects AI coding assistants
(Claude Code, Cursor, VS Code, Codex) to Expo's own documentation and, optionally, to
a running local dev server for screenshot/UI-automation capabilities. Set up for this
project:

| Piece | What was done |
|---|---|
| Remote MCP server | Registered at **project scope** (`claude mcp add --transport http expo https://mcp.expo.dev/mcp --scope project`) — writes to `.mcp.json` at the repo root, so it's committed and every teammate using Claude Code gets it automatically, not just this session. |
| Local capabilities | `expo-mcp` added as a **dev dependency** (`npx expo install expo-mcp --dev`) — enables screenshot/tap/DevTools automation when the dev server runs with MCP enabled. |
| Convenience script | `npm run start:mcp` added to `package.json` — `EXPO_UNSTABLE_MCP_SERVER=1 expo start`, per the docs' required env var. |

**What's not done, and can't be done from here:** authentication. `.mcp.json` declares
*which* server to connect to; each developer still needs to run `/mcp` inside their own
Claude Code session once and sign in with their Expo account via OAuth in a browser —
this is inherently a per-person, interactive step. Also requires **any paid EAS plan**
per the docs' prerequisites (Starter/Production/Enterprise) — confirm the `yagy-team`
Expo org has one; the server-side capabilities (docs search, dependency install
guidance, EAS build/workflow tools) won't work without it, though local capabilities
(screenshots, DevTools) work once `expo-mcp` + SDK 54+ conditions are met regardless.

Prompts worth trying once authenticated: `"add AGENTS.md / CLAUDE.md to this project"`,
`"learn how to use expo-router"`, `"add a button and tap it to verify the interaction
works"` — the last one specifically exercises the local-capability screenshot/tap loop.

---

## 4. EAS Observe — implemented

Production performance monitoring — startup speed (cold/warm launch, time-to-first-render,
time-to-interactive, bundle load), per-screen navigation timing, and OTA update download
time. Free during open beta (up to 10,000 MAU; a permanent free tier up to 1,000 MAU is
planned post-beta, with 60 days' notice before any pricing change). Deliberately
**not** a replacement for the crash/error tracking already planned in the Performance/UX
proposal (Sentry) — Observe's own crash collection is explicitly called out as
still-in-progress in Expo's post, not its focus.

Requires SDK 56+ (this project: SDK 57 ✓) and an EAS-linked project (already linked,
`projectId` present in `app.json` ✓) — both prerequisites already satisfied, no extra
setup needed beyond the package itself.

**What was wired up** (`src/app/_layout.tsx`):

```tsx
import { Observe, ObserveRoot, useObserve } from 'expo-observe';

Observe.configure({ integrations: { 'expo-router': true } }); // module scope, before React mounts

function RootLayout() {
  const { markInteractive } = useObserve();
  // ...existing hydrate/splash-hide effect, with markInteractive() called
  // at the exact moment the splash screen comes down — the same "app is
  // ready" signal this file already computed, reused rather than duplicated.
}

export default ObserveRoot.wrap(RootLayout);
```

- `integrations: { 'expo-router': true }` turns on per-screen navigation metrics
  (`cold_ttr`, `warm_ttr`, `tti`) — opt-in per Observe's own docs, off by default.
- `markInteractive()` is called from the *same* place `SplashScreen.hideAsync()`
  already was — this app already had a well-defined "ready" moment (post-hydration,
  post-cluster-detection, post-token-registration), so this is a one-line addition to
  existing logic, not new lifecycle plumbing.
- No config plugin needed — verified no `plugin/` directory ships with the installed
  package, confirmed by a clean `npx expo export` for both platforms with no plugin
  resolution step for it (unlike `expo-widgets`/`expo-background-task`, which do add one).

**Not done:** nothing beyond installation is needed to start collecting metrics, but
**data only starts flowing from production builds** — a dev-client/Expo Go session
won't populate the dashboard. First real numbers require an EAS production build
shipped to at least one real user. The `eas observe:metrics-summary --days 7` CLI
command (and `observe:routes`, `observe:events`, `observe:versions`) become useful
once that's shipped.

---

## 5. Full package list (this doc's scope only)

| Package | Purpose | Type |
|---|---|---|
| `expo-observe` | Startup + navigation performance monitoring | dependency |
| `expo-mcp` | Local MCP capabilities (screenshots, DevTools, automation) for the dev server | devDependency |
| — (`.mcp.json`, project-scoped) | Registers `mcp.expo.dev` as a remote MCP server for any Claude Code session on this repo | config, not a package |

(`expo-widgets` and its dependencies are already covered in
`PLATFORM-NATIVE-FEATURES-PLAN.md` — not repeated here.)

---

## 6. Open decisions for you

1. **EAS plan check:** confirm the `yagy-team` Expo org has a paid EAS plan (Starter or
   above) — required for the Expo MCP Server's *server*-side capabilities
   (documentation search, dependency guidance, build/workflow tools). Local
   capabilities (screenshots, DevTools) don't need it.
2. **Toolbar rollout:** confirm whether to extend `Stack.Toolbar` to more screens now,
   or treat the `orders.tsx` usage as a reference implementation and adopt it
   screen-by-screen as real product needs come up (recommended — avoids forcing
   toolbar placements into screens that already have a considered footer/action row).
3. **Native Tabs / Dynamic Colors / Zoom transitions:** all available today but
   deliberately not adopted — each is a real design decision (tab bar redesign, color
   system change, shared-element transition target), not infrastructure. Confirm
   these should wait for a dedicated design pass rather than riding along here.
4. **First production build for Observe:** metrics won't appear until a production EAS
   build reaches real users — confirm target timing so "why is the dashboard empty"
   doesn't become a support question later.

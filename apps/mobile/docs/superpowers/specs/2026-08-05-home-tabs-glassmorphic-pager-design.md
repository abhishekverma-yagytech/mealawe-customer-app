# Home Tabs: Zomato-style Glassmorphic Sliding Pager — Design

## Context

`HomeTabs` ([src/features/home/components/HomeTabs.tsx](../../../src/features/home/components/HomeTabs.tsx))
is the order-mode selector row rendered inside the collapsing hero on the Home screen
([src/app/(tabs)/index.tsx](../../../src/app/(tabs)/index.tsx)). Today it's a light frosted
band (`BlurView` already present) where the active tab snaps to a solid white pill —
no motion, tap-only, no icons.

The ask: give it an iOS/Zomato-style deep glassmorphic look with a capsule indicator that
**slides** between tabs, and make the underlying feed **swipeable** so dragging the feed
left/right also changes tabs, not just tapping.

## Scope

In scope:
- Visual redesign of the glass band + active-tab capsule (Style B: dark saturated glass).
- Icon + label on every pill (new lucide-react-native aliases where missing).
- Horizontal paging between the three **feed** tabs (Subscription / Bulk / Dine In),
  with the capsule continuously following swipe progress.

Out of scope (explicitly deferred, confirmed with user):
- Shortcut tabs (Daily / Advance / Navmool) stay tap-only; the pager never reaches them.
- The band's scroll-fade-with-hero behavior is unchanged (still fades opacity 1→0 as the
  hero collapses — it does not become sticky/pinned).
- Bulk's and Dine In's lack of hero-collapse scroll wiring (only Subscription drives
  `scrollY` today) is a pre-existing limitation, not addressed here.

## Architecture

### Feed area becomes a horizontal pager

The feed `View` in `index.tsx` (currently a ternary that conditionally renders one of
Subscription/Bulk/DineIn/`null`) becomes an `Animated.ScrollView` with `pagingEnabled`,
holding one page per **feed tab currently enabled** by cluster config
(`showSubscription` / `showBulk` / `showDineIn`), in `orderTabs` order. Shortcut tabs
(Daily/Advance/Navmool) are excluded from the pager entirely — they keep their existing
`SHORTCUT_ROUTES` tap-to-navigate behavior in the glass band.

A shared reanimated value (`pagerProgress`, driven by `useAnimatedScrollHandler` on the
pager) is the single source of truth for "where between feed tabs are we, continuously."
It drives:

1. The pager's own paging physics (native scroll, `pagingEnabled`).
2. The capsule indicator's `left`/`width` inside `HomeTabs`.

### Capsule indicator: measured layout, not fixed width

Because pills now carry icon + label (variable width per tab name), the capsule cannot
use a fixed width. Each pill reports its `x`/`width` via `onLayout`; `HomeTabs` keeps an
array of these measurements and derives the capsule's `left`/`width` for any given
`pagerProgress` value via interpolation across cumulative offsets — this is what makes
the capsule visibly resize as it slides from e.g. "Subscription" to the narrower "Bulk".

### Sync between pager and `activeTab` state

- **Tap a feed pill** → animate the pager to that page index (`scrollTo` with
  `animated: true`); `activeTab` updates immediately (matches today's tap-to-switch
  feel, no waiting for scroll settle).
- **Swipe the pager** → `activeTab` state updates `onMomentumScrollEnd` (or equivalent
  settle callback), keeping cluster-gated UI (veg toggle scoping, `SHORTCUT_ROUTES`
  logic) consistent with which feed tab is actually showing.
- **Tap a shortcut pill** → unchanged: `router.push`, pager untouched.

### No new native dependency

Built from `react-native-reanimated` (4.5.0, already installed) +
`react-native-gesture-handler` (2.32, already installed) — a plain `Animated.ScrollView`
with `pagingEnabled` and `useAnimatedScrollHandler`, not `react-native-pager-view` (not
installed; would force an Expo prebuild). This keeps the feature buildable without a
native rebuild cycle.

## Visual / motion spec

**Glass band ("Style B" — Zomato-deep dark glass):**
- Background: `rgba(10,20,15,0.38)`
- `BlurView` intensity ~35–40, `tint="dark"`
- Border: 1px `rgba(255,255,255,0.18)`
- `boxShadow`-equivalent: inner top highlight (`rgba(255,255,255,0.25)`) + outer drop
  shadow (soft, ~6–16px blur, `rgba(0,0,0,0.3)`)
- Corner radius: ~22px (up from today's `rounded-3xl` band, kept visually consistent)

**Capsule indicator:**
- Near-white fill (`rgba(255,255,255,0.95)`), rounded (~16px radius)
- Subtle shadow (`0 3px 8px rgba(0,0,0,0.25)`)
- Position/width driven by `pagerProgress` + measured pill layouts (continuous
  drag-follow — the capsule visibly tracks the finger mid-swipe, not just on settle)

**Icons (lucide-react-native, added to
[src/components/ui/icons.tsx](../../../src/components/ui/icons.tsx)):**

| Tab | Icon | Status |
| --- | --- | --- |
| Subscription | `Repeat` → `IconRepeat` | new alias |
| Bulk | `ShoppingBag` → `IconShoppingBag` | already aliased |
| Dine In | `Utensils` → `IconUtensils` | already aliased |
| Daily | `CalendarDays` → `IconDaily` | already aliased |
| Advance | `CalendarClock` → `IconAdvance` | already aliased |
| Navmool | `Store` → `IconStore` | new alias |

Icon sits above the label inside each pill (~14–16px), color follows the existing
active/inactive text color logic (`text-brand-teal` active / white inactive).

**Scroll fade:** unchanged — the band still fades opacity 1→0 via the existing
`tabsStyle` interpolation as the hero collapses. No pinning/sticky behavior.

**Reduced motion:** capsule drag-follow and page-swipe settle animation collapse to
instant positioning / opacity-only, following the same `useReducedMotion()` pattern
already used in `HomeTabs`' `VegToggle`.

## Edge cases

- **Cluster flags change at runtime** — `orderTabs` already recomputes via `useMemo`;
  the pager's page list must follow reactively. If the currently-active page disappears
  (flag flips off mid-session), clamp to the first remaining feed tab rather than
  stranding the pager on a removed page.
- **Only one feed tab enabled** — pager degrades to a single non-swipeable page (disable
  the paging gesture; showing a phantom swipe with nothing on either side would feel
  broken).
- **Zero feed tabs** — preserves today's `null` fallback in the feed area.
- **Gesture conflict** — `DineInHome` and `SubscriptionHome` each own a vertical
  `ScrollView`. The horizontal pager needs `simultaneousHandlers`/`waitFor` tuning
  (gesture-handler) so a vertical scroll inside a page is never mistaken for a
  horizontal page-swipe, and vice versa.
- **Accessibility** — keep existing `accessibilityRole="tab"` /
  `accessibilityState={{ selected }}`; the icon is decorative only — the text label
  remains the `accessibilityLabel`/accessible name, never replaced by the icon.

## Testing

Per this project's convention (no unit tests — see root `CLAUDE.md`):
- `npx expo export --platform android -c` and `npx tsc --noEmit` for build/type
  verification.
- Update/add a Maestro flow (see `docs/TESTING-WORKFLOW.md`) covering: tap-to-switch
  between feed tabs, swipe-to-switch between feed tabs, tapping a shortcut tab
  (Daily/Advance/Navmool) still navigates correctly, and the veg toggle keeps working
  alongside the new pager.

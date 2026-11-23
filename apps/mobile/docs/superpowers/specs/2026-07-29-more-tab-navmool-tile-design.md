# More Tab + Navmool Tile — Design Spec

**Status:** Approved, ready for implementation planning.

## Purpose

Replace the current placeholder content behind the Home screen's "More" tab with a
real, cluster-gated feature hub, and add the first entry to it: a **Navmool**
(grocery marketplace) tile. This is sub-project 1 of 4 in the broader Navmool port
(browse/catalog, cart+coupon+bill, and checkout-up-to-payment are separate, later
specs).

Functionality source of truth for the hub pattern: `../mealaweApp` (modern Ionic),
specifically:
- `src/service/feature-flags.service.ts` (`MORE_FEATURES`, `moreFeatures` computed,
  `applyClusterConfig()` / `showNavmool` flag)
- `src/app/home/more/more-home/more-home.component.ts`

Cluster-flag fetch mechanism source of truth: this repo's existing
`src/store/clusterStore.ts` (`showDineIn` / `refreshDineInFlag` — extended, not
replaced).

## Explicitly out of scope

- **The actual Navmool browse/catalog/cart/checkout screens.** `/marketplace` is a
  placeholder route in this sub-project ("coming soon"), replaced by the next spec.
- **Any other More-hub feature** (OYO, on-demand, apartment). Only Navmool is
  `ready: true` today; the list structure allows adding more later but no other
  entries are built now (YAGNI).
- **Verifying both branches of cluster gating.** The Maestro flow added here assumes
  a test account whose address resolves to a Navmool-enabled cluster. Testing the
  "tile hidden" branch would need a second test account in a disabled cluster and is
  out of scope for this sub-project.
- Moving "Log out" elsewhere (e.g. to `/profile`) — it stays in the More hub,
  matching its current position and both reference apps' convention of parking
  account actions under More/Account.

## Scope

1. `showNavmool` cluster-config flag on `clusterStore`.
2. `MoreHome` component: greeting + filtered feature-tile list + Log out.
3. Wiring `MoreHome` into `(tabs)/index.tsx`'s `activeTab === 'more'` branch.
4. Placeholder `/marketplace` route so the tile has somewhere to go.
5. Maestro flow + test-catalogue row for the tab + tile.

## Architecture

Three pieces, each mirroring an existing pattern exactly rather than introducing a
new one:

| Piece | Mirrors |
|---|---|
| `clusterStore.showNavmool` | `clusterStore.showDineIn` (field-for-field) |
| `MoreHome` component | `SubscriptionHome` / `DineInHome` (inline tab content, presentational, callbacks in) |
| `src/app/marketplace.tsx` placeholder | `bulk-cart.tsx`'s "payment is a later phase" stub pattern |

### Why extend `clusterStore` instead of a new `featureFlagsStore`

mealaweApp centralizes cluster-derived UI flags in a dedicated
`FeatureFlagsService`. This repo already has exactly one such flag (`showDineIn`)
living directly on `clusterStore`, fetched via the same `searchClusterVariable`
call `detectClusters()` already makes. Adding `showNavmool` as a second field on
the same store, populated by the same response object, avoids introducing a second
store that would need its own hydrate/boot wiring and would just re-read
`clusterStore.currentConfigName()` anyway. If a third or fourth cluster flag
appears later, that's the point to extract a dedicated flags layer — not now
(YAGNI).

### Why MoreHome is a flat filtered list, not a generic flag-resolver abstraction

mealaweApp's `MORE_FEATURES` is a flat array of `{key, route, ready}` with cluster
filtering done in the `moreFeatures` computed, not inside each entry. With exactly
one real entry (Navmool) today, `MoreHome` inlines the `showNavmool === true` check
when filtering rather than designing a generic `isEnabled(flags) => boolean` callback
per entry. When a second cluster-gated feature is added, generalizing the filter
predicate is a small, localized change — building that abstraction now would be
speculative.

## Data model

```ts
// clusterStore.ts additions
interface ClusterState {
  // ...existing fields
  /** Mirrors showDineIn: the current cluster's showNavmool config flag.
   *  null = not yet fetched or fetch failed; treat as "not enabled" for
   *  visibility purposes (never surface the tile optimistically). */
  showNavmool: boolean | null;
}

// MoreHome.tsx
interface MoreFeature {
  key: string;
  label: string;
  icon: IconComponent;
  route: string;
  ready: boolean;
}

const MORE_FEATURES: MoreFeature[] = [
  { key: 'navmool', label: 'Navmool', icon: IconShoppingBag, route: '/marketplace', ready: true },
];
```

`IconShoppingBag` does not exist yet in `src/components/ui/icons.tsx` (checked: only
`IconCart`/`ShoppingCart` is aliased there). Add `ShoppingBag as IconShoppingBag` to
that file's existing Lucide re-export list — a one-line addition, matching how every
other icon in the app is aliased centrally rather than imported ad hoc per file.

## Data flow

1. `detectClusters(point)` (existing) resolves the matched clusters, derives
   `configName` from the last matched cluster (existing convention), and currently
   fires `void refreshDineInFlag(configName, set)` — add a parallel
   `void refreshNavmoolFlag(configName, set)` right after it. Both read from the
   same cached `searchClusterVariable` response shape; no extra network call.
2. `refreshNavmoolFlag` is a byte-for-byte structural copy of `refreshDineInFlag`:
   own `navmoolFlagCache: Map<string, boolean>`, reads `cfg?.['showNavmool']`,
   sets `null` on any failure (never `false` on failure — same "unknown vs.
   known-disabled" distinction `showDineIn` already preserves).
3. `(tabs)/index.tsx` reads `showNavmool` from `useClusterStore` and passes it into
   `MoreHome` as a prop (`(tabs)/index.tsx` keeps owning store access, matching how
   it already owns `profile`/`clusters`/`showDineIn` and passes derived values down
   to `HomeHeader`/`HomeTabs`).
4. `MoreHome` filters `MORE_FEATURES` to `f.ready && (f.key !== 'navmool' ||
   showNavmool === true)` — i.e. every non-Navmool future entry defaults to visible
   when `ready`, and the Navmool entry specifically requires an explicit `true`
   flag. (This inline special-case is intentional per the "flat list, not a generic
   resolver" decision above; a second cluster-gated entry is the trigger to
   generalize this into a per-entry predicate.)
5. Tapping a tile calls `router.push(feature.route)` — for Navmool,
   `router.push('/marketplace')`, which resolves to the new placeholder screen.
6. `(tabs)/index.tsx` removes its old inline placeholder JSX (lines 178–197,
   including the duplicated greeting and Log out button) and renders
   `<MoreHome profile={profile} showNavmool={showNavmool} onLogout={logout} />`
   instead. `logout()` itself is unchanged — `MoreHome` stays presentational and
   receives it as a callback, matching how `HomeHeader` receives
   `onPressAddress`/`onPressCashback`/`onPressProfile` rather than reaching into
   `useAuthStore` itself.

## Components

- **`src/features/home/components/MoreHome.tsx`** (new)
  - Props: `{ profile: CustomerProfile | null; showNavmool: boolean | null; onLogout: () => void }`
    (`CustomerProfile` from `@/features/auth/types`, matching `authStore.profile`'s type)
  - Renders: greeting (`Hi {profile?.userName ?? 'there'} 👋`, moved verbatim from
    the old placeholder), a tile grid from the filtered `MORE_FEATURES`, and the
    Log out button at the bottom (same relative position as today).
  - No store access, no API calls — pure presentational component with local
    `router.push` for navigation (consistent with `BulkCategoryTile`'s `onPress`
    prop pattern, but since there's only one caller site, MoreHome owns the
    `useRouter()` call directly rather than taking an `onSelectFeature` callback).
- **`src/app/marketplace.tsx`** (new placeholder route)
  - Minimal screen: back button + centered "Navmool — coming soon" `AppText`. No
    store/API wiring. Entirely replaced by the browse/catalog sub-project.

## Error handling

- `refreshNavmoolFlag` follows `refreshDineInFlag`'s existing contract exactly: any
  thrown error (network failure, malformed response) results in `set({ showNavmool:
  null })` and never throws further up. No new error surface is introduced.
- No loading spinner while the flag resolves — the tile simply appears once
  `showNavmool` flips to `true`, consistent with how the Bulk/Dine In tab swap
  already behaves with `showDineIn`.

## Testing

Per this project's convention (no unit tests; Maestro E2E + test catalogue):

- New flow: `.maestro/flows/more-tab-navmool-tile.yaml` — login → tap the "More" tab
  → assert the Navmool tile is visible (by text) → tap it → assert "coming soon"
  placeholder text is visible. Select elements by visible text only (no
  `testID`/`accessibilityLabel` selectors used elsewhere in this repo's flows).
- Add a `Home / More` row to `scripts/generate-test-catalogue.mjs`'s
  `FEATURE_SHEETS`, ID prefix `MORE-01`, and regenerate
  `docs/TEST-CATALOGUE.xlsx` (`npm install --no-save exceljs && node
  scripts/generate-test-catalogue.mjs`).
- Verify with `npx tsc --noEmit` and `npx expo export --platform android -c`
  (no unit test suite in this project).

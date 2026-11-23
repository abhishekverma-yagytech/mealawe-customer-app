# On-Demand: Consolidate Daily/Advance into a Single `showOndemand` Flag — Design

## Context

`MealaweUserAppRN`'s Home screen currently gates on-demand ordering behind two
separate cluster-config flags, `showDaily` and `showAdvance`
([src/store/clusterStore.ts](../../../src/store/clusterStore.ts)). "Daily" is a
fully-wired feed tab (`DailyHome`); "Advance" was scaffolded (a `showAdvance` flag
read, an `IconAdvance` import) but its Home-tab wiring has been commented out from
day one — it was never actually shippable.

Cross-repo research (Ionic reference app, this repo, the admin dashboard, and the
backend server) established:

- **The reference Ionic app** (`MealaweUserApp`, source of truth) gates the entire
  on-demand feature behind exactly one flag, `showOndemand`
  (`tabs.page.ts:50`, `tab-home.component.ts:128`). "All Day" vs "Advance" is never
  a separate flag or a separate home entry point — it's a mode *inside* the kitchen
  page (`kitchenInside/:orderType/:kitchenId`), and it's derived from per-item data
  (`item.serveDaily` / `item.itemAvailable`) rather than gated by any flag at all.
- **The backend server** (`MealaweServerApp`) has only ever declared `showOndemand`
  on the real `ClusterConfigVariable` Mongoose schema
  (`src/model/clusterConfigVariable.model.js:108-111`). The live
  `searchClusterVariable`/`getClusterVariable` API has never returned `showDaily` or
  `showAdvance` — those two names appear only in an **untracked** staging script
  (`scripts/setup-pune-kota-staging.js`) that pokes them directly into raw Mongo
  documents via a schema-less write path, bypassing the real model. Because Mongoose
  strips undeclared fields on read, the production API never surfaces them even on
  staging.
- **The admin dashboard** (`mealaweDashboard`) has matching **uncommitted** local
  edits adding `showDaily`/`showAdvance` checkboxes to the cluster-config form,
  alongside the already-committed `showOndemand` field — the other half of the same
  unfinished, abandoned split.
- **This repo's** on-demand feature (`src/features/on-demand/`) already has the
  correct internal shape for the reference app's model: `OnDemandMode = 'allDay' |
  'advance'` ([types.ts](../../../src/features/on-demand/types.ts):1) is threaded
  through `api.ts`, `pricing.ts`, `schedule.ts`, `useOnDemandCartStore.ts`, and
  `ModeToggle`. Only the **top-level Home-tab gating** is wrong — it reads two
  never-served flags instead of the one flag the server actually returns.

## Decision

Revert the Home-tab gating to match the reference app and the real server: one
`showOndemand` flag, one Home tab ("On Demand"), with `allDay`/`advance` staying
exactly as they already are — an in-app `OnDemandMode`, never a flag.

**Scope: `MealaweUserAppRN` only.** The dashboard's uncommitted edits and the
server's untracked staging script are left untouched (confirmed with the user) —
they're already uncommitted/untracked, so nothing is lost by ignoring them; this
repo simply stops assuming they'll ever ship.

## Changes

1. **`src/store/clusterStore.ts`** — `ClusterFlagKey`/`CLUSTER_FLAG_KEYS` drop
   `showDaily`/`showAdvance`, add `showOndemand`. The rest of the store (the flag
   fetch/cache loop, `refreshFlag`) is fully generic over `ClusterFlagKey` — no
   other logic in this file changes.
2. **`src/features/on-demand/components/DailyHome.tsx` → `OnDemandHome.tsx`** —
   renamed file, component, and props interface (`DailyHomeProps` →
   `OnDemandHomeProps`). Body unchanged — it already only ever fetches `'allDay'`
   kitchens; the rename is purely about the tab-level name, not new behavior.
3. **`src/features/on-demand/index.ts`** — export `OnDemandHome` instead of
   `DailyHome`.
4. **`src/app/(tabs)/index.tsx`**:
   - Drop the `showAdvance` store read entirely (dead — the flag is being removed,
     and the reference app never had a separate Advance tab to hide behind it).
   - Delete the commented-out `if (showAdvance === true) { tabs.push(...) }` block
     — it was scaffolding for a feature that, per the reference app, was never
     supposed to exist as a separate Home tab.
   - Rename the `'daily'` tab to `'ondemand'`: key, label ("On Demand"), the
     `FEED_TAB_KEYS` entry, the `showDaily === true` condition (→ `showOndemand
     === true`), and the pager's body branch (`<DailyHome .../>` →
     `<OnDemandHome .../>`).
   - Update the surrounding doc comments that name `showDaily`/`showAdvance`.
5. **`scripts/generate-test-catalogue.mjs`** — `HOME-08` currently reads "Daily/
   Advance shortcuts appear only when their cluster flags are true ... each opens
   the on-demand kitchen list for its mode" — already stale (Daily has been a feed
   tab, not a shortcut, since the glassmorphic-pager work) and now doubly wrong
   (there's one flag, one tab). Rewritten to describe the actual current behavior;
   regenerate `docs/TEST-CATALOGUE.xlsx`.

## Out of scope

- `ModeToggle`'s own `showDaily`/`showAdvance` **props** (`ModeToggle.tsx:12-13`)
  and `on-demand-kitchen.tsx`'s `hasDailyMenu`/`hasAdvanceMenu` locals — these gate
  whether the *in-kitchen* All Day/Advance capsules are shown, driven by per-item
  data eligibility (mirroring the reference's `noAlldayMenu` derivation), not by
  any cluster flag. They share a word with the flags being removed but are a
  different, already-correct concept — left untouched to avoid unrelated churn.
- `order-detail.tsx`'s `dailyOrderList`/`todayDailyOrder` and
  `subscription-configure.tsx`'s `a.daily` — the Subscription feature's own
  unrelated "today's scheduled delivery" concept. Not on-demand, not touched.
- `mealaweDashboard` and `MealaweServerApp` — explicitly left alone per the user.

## Testing

No unit tests in this project (see root `CLAUDE.md`). Verify with `npx tsc --noEmit`
and `npx expo export --platform android -c`. No new Maestro flow is needed — this
is a rename plus a flag swap, not new interaction; the existing swipeable-pager
Maestro coverage (`home-tabs-swipe.yaml`) already exercises this tab generically via
whichever feed tabs are enabled for the test cluster.

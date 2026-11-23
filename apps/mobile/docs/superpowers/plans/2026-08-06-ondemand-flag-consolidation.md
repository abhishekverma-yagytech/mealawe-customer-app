# On-Demand Flag Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the never-actually-served `showDaily`/`showAdvance` cluster flags
with the single `showOndemand` flag the server has always returned, rename the
Home "Daily" tab to "On Demand", and delete the dead commented-out "Advance" tab
scaffolding — matching the reference Ionic app's model exactly.

**Architecture:** `clusterStore.ts`'s flag list is fully generic (`ClusterFlagKey[]`
drives both the fetch loop and the state shape), so this is a pure find-and-replace
of the key list plus every call site that reads `showDaily`/`showAdvance`. The
on-demand feature's internal `OnDemandMode` type/API/pricing/schedule code already
matches the target model and needs zero changes — only the top-level Home-tab
gating and one component name change.

**Tech Stack:** React Native (Expo SDK 57), Zustand (`clusterStore`), no new
dependencies.

**Spec:** `docs/superpowers/specs/2026-08-06-ondemand-flag-consolidation-design.md`

**Verification convention (no unit tests in this project):** every task is verified
with `npx tsc --noEmit`. Final task runs the full build
(`npx expo export --platform android -c`).

---

### Task 1: Consolidate the cluster-config flag

**Files:**
- Modify: `src/store/clusterStore.ts`

- [ ] **Step 1: Replace `showDaily`/`showAdvance` with `showOndemand`**

```ts
type ClusterFlagKey =
  | 'showSubscription'
  | 'showBulk'
  | 'showDineIn'
  | 'showOndemand'
  | 'showNavmool';

const CLUSTER_FLAG_KEYS: readonly ClusterFlagKey[] = [
  'showSubscription',
  'showBulk',
  'showDineIn',
  'showOndemand',
  'showNavmool',
];
```

Nothing else in this file changes — `ClusterFlagState`, `refreshFlag`,
`INITIAL_FLAGS`, and `detectClusters`'s fetch loop are all generic over
`ClusterFlagKey`/`CLUSTER_FLAG_KEYS`.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: errors in `src/app/(tabs)/index.tsx` (it still reads `s.showDaily`/
`s.showAdvance`, which no longer exist on `ClusterState`) — expected, fixed in
Task 3. No errors should originate from `clusterStore.ts` itself.

---

### Task 2: Rename `DailyHome` to `OnDemandHome`

**Files:**
- Rename: `src/features/on-demand/components/DailyHome.tsx` → `src/features/on-demand/components/OnDemandHome.tsx`
- Modify: `src/features/on-demand/index.ts`

- [ ] **Step 1: Rename the file and update its contents**

Move `DailyHome.tsx` to `OnDemandHome.tsx` (same directory), then apply these
changes to the moved file — only the interface/component name and the doc comment
change; every other line (imports, body, JSX) stays exactly as-is:

```tsx
interface OnDemandHomeProps {
  /** Top padding so content starts below the home hero band — same contract as SubscriptionHome/DineInHome. */
  topInset?: number;
  vegOnly?: boolean;
}

/** The On Demand tab body: a hero banner + the two-row kitchen grid, same shape
 * as Bulk's/Dine In's in-home teaser instead of navigating straight to a
 * pushed screen. "See all kitchens" drills into the full list/search screen. */
export function OnDemandHome({ topInset = 0, vegOnly = false }: OnDemandHomeProps) {
```

(The function body below this signature — the `router`/`serviceable`/`kitchens`/
`loading` state, the `useEffect` calling `loadNearestKitchens('allDay')`, `filtered`,
`openKitchen`, and the full JSX return — is unchanged. It already only ever deals
in `'allDay'` kitchens; this rename doesn't touch behavior.)

- [ ] **Step 2: Update the barrel export**

In `src/features/on-demand/index.ts`:

```ts
export { OnDemandHome } from './components/OnDemandHome';
```

(replacing `export { DailyHome } from './components/DailyHome';`)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: errors in `src/app/(tabs)/index.tsx` (still imports `DailyHome`, which no
longer exists) — expected, fixed in Task 3. No errors from the on-demand feature
files themselves.

---

### Task 3: Rewire the Home tab

**Files:**
- Modify: `src/app/(tabs)/index.tsx`

- [ ] **Step 1: Update the icon import**

```tsx
import { IconRepeat, IconShoppingBag, IconStore, IconUtensils } from '@/components/ui/icons';
```

(`IconDaily` is dropped — see Step 4 for which icon the renamed tab uses instead.)

- [ ] **Step 2: Update the `OnDemandHome` import**

```tsx
import { OnDemandHome } from '@/features/on-demand';
```

(replacing `import { DailyHome } from '@/features/on-demand';`)

- [ ] **Step 3: Update `SHORTCUT_ROUTES`'s doc comment and `FEED_TAB_KEYS`**

```tsx
/** Shortcut tabs that have no in-home feed of their own — selecting one
 * navigates straight to its (placeholder or real) screen instead of
 * swapping the feed body, mirroring how the old More hub's tiles behaved. */
const SHORTCUT_ROUTES: Partial<Record<string, string>> = {
  navmool: '/marketplace',
};

/** Tabs that own an in-home feed body and live in the swipeable pager. Every
 * other tab in `orderTabs` is a tap-only shortcut (see `SHORTCUT_ROUTES`). */
const FEED_TAB_KEYS = new Set(['subscription', 'bulk', 'dinein', 'ondemand']);
```

(The `// advance: ...` commented-out line inside `SHORTCUT_ROUTES` is deleted along
with the rest of the Advance scaffolding — see Step 5.)

- [ ] **Step 4: Update the store reads**

```tsx
const showSubscription = useClusterStore((s) => s.showSubscription);
const showBulk = useClusterStore((s) => s.showBulk);
const showDineIn = useClusterStore((s) => s.showDineIn);
const showOndemand = useClusterStore((s) => s.showOndemand);
const showNavmool = useClusterStore((s) => s.showNavmool);
```

(`showDaily`/`showAdvance` reads are removed, replaced by one `showOndemand` read.)

- [ ] **Step 5: Update `orderTabs` — rename the tab, delete the dead Advance block**

```tsx
  // Cluster-aware order modes: every entry is gated by its own server-side
  // cluster-config flag (mirrors mealaweApp's FeatureFlagsService — a flat
  // filtered list, one boolean per vertical, not a generic per-entry
  // resolver). `showDineIn` keeps its documented `clusterName` substring
  // fallback for when that flag hasn't resolved yet or the fetch failed
  // (showDineIn === null); the newer flags (`showOndemand`/`showNavmool`) have
  // no naming heuristic, so `null` reads as "not enabled" and stays hidden
  // until the config resolves to `true`. This replaces the old "More" tab —
  // every secondary vertical now lives as its own shortcut in this same
  // horizontally scrollable row instead of being buried a tap deeper. Feed
  // tabs (Subscription/Bulk/Dine In/On Demand) always come first so their
  // pill indices line up with the swipeable pager's page indices — see
  // `FEED_TAB_KEYS`.
  const orderTabs = useMemo<HomeTab[]>(() => {
    const isKota = clusters.some((c) => (c.clusterName ?? '').toLowerCase().includes('kota'));
    const dineIn = showDineIn ?? isKota;
    const tabs: HomeTab[] = [];
    if (showSubscription ?? true) {
      tabs.push({ key: 'subscription', label: 'Subscription', icon: IconRepeat });
    }
    if (showBulk ?? true) {
      tabs.push({ key: 'bulk', label: 'Bulk', icon: IconShoppingBag });
    }
    if (dineIn) {
      tabs.push({ key: 'dinein', label: 'Dine In', icon: IconUtensils });
    }
    if (showOndemand === true) {
      tabs.push({ key: 'ondemand', label: 'On Demand', icon: IconUtensils });
    }
    if (showNavmool === true) {
      tabs.push({ key: 'navmool', label: 'Navmool', icon: IconStore });
    }
    return tabs;
  }, [clusters, showSubscription, showBulk, showDineIn, showOndemand, showNavmool]);
```

Note: the "On Demand" tab reuses `IconUtensils` (already imported, already used by
Dine In) rather than adding a new icon alias — both tabs are food-ordering
destinations and this keeps the icon set change-free. If you'd rather each tab have
a visually distinct icon, `Store` (`IconStore`, already imported/used by Navmool) or
any other unused `lucide-react-native` icon would work equally well; this is a
cosmetic choice, not a functional one.

- [ ] **Step 6: Update the pager's page-body branch**

```tsx
                  ) : tab.key === 'dinein' ? (
                    <DineInHome topInset={collapseDistance + 24} />
                  ) : tab.key === 'ondemand' ? (
                    <OnDemandHome topInset={collapseDistance + 24} vegOnly={vegOnly} />
                  ) : null}
```

(replacing the `tab.key === 'daily'` branch that rendered `<DailyHome ... />`)

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors project-wide.

- [ ] **Step 8: Commit**

```bash
git add src/store/clusterStore.ts src/features/on-demand/index.ts \
  "src/features/on-demand/components/OnDemandHome.tsx" \
  "src/app/(tabs)/index.tsx"
git status --short
```

Confirm `src/features/on-demand/components/DailyHome.tsx` no longer appears (it was
renamed, not left behind as a duplicate), then:

```bash
git commit -m "refactor: consolidate showDaily/showAdvance into showOndemand, rename Daily tab to On Demand"
```

---

### Task 4: Fix the stale HOME-08 catalogue row

**Files:**
- Modify: `scripts/generate-test-catalogue.mjs`

- [ ] **Step 1: Rewrite HOME-08**

Find the row starting `['HOME-08', 'Home', 'Daily/Advance shortcuts appear only
when their cluster flags are true'...]` and replace it with:

```js
    ['HOME-08', 'Home', 'On Demand tab appears only when showOndemand is true', 'Cluster config has showOndemand=true', 'Scroll the shortcuts row', '"On Demand" feed tab visible alongside Subscription/Bulk/Dine In; tapping or swiping to it shows nearby kitchens', 'P2'],
```

(This replaces the old "Daily/Advance shortcuts... each opens the on-demand kitchen
list for its mode" text, which was already stale before this change — Daily became
a feed tab, not a shortcut, during the earlier glassmorphic-pager work — and is now
also wrong about there being two separate flags.)

- [ ] **Step 2: Regenerate the workbook**

```bash
npm install --no-save exceljs
node scripts/generate-test-catalogue.mjs
```

Expected: `docs/TEST-CATALOGUE.xlsx` rewritten with no errors, same total row count
(one row edited in place, not added).

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-test-catalogue.mjs docs/TEST-CATALOGUE.xlsx
git commit -m "test: fix stale HOME-08 catalogue row for the OnDemand tab rename"
```

---

### Task 5: Final build verification

**Files:** none (verification only)

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Full export build**

Run: `npx expo export --platform android -c`
Expected: build completes with no bundling errors.

- [ ] **Step 3: Grep for any missed reference**

```bash
grep -rn "showDaily\|showAdvance\|DailyHome" src/ scripts/generate-test-catalogue.mjs
```

Expected: no matches (a match here means a call site was missed in Tasks 1-4).

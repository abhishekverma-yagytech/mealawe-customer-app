# Kota On-Demand Cluster-Menu Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port MealaweUserApp's Kota-only on-demand ordering flow — one aggregated
cluster-wide menu with no kitchen-picking step — into MealaweUserAppRN's On Demand
home tab, gated by the same `showClusterMenu` cluster-config flag the backend already
drives Ionic with.

**Architecture:** Add `showClusterMenu` to the existing generic cluster-flag machinery
in `clusterStore.ts`. Add one new API call (`loadClusterMenu`) that fetches a
cluster's single merged menu in one shot. Branch the On Demand home tab: when
`showClusterMenu` is true, render a new `ClusterMenuList` feed component (search +
veg filter + a flat item list, no kitchen selection) instead of the existing
kitchen-browse UI; everything downstream (cart store, bill calc, checkout) is
**unchanged** — this app's on-demand checkout already uses flat cluster-config
charges with no per-kitchen distance/geofence logic, so the Ionic-side checkout
differences (flat delivery fee, no geofence check, etc.) don't apply here; RN is
already built that way for every cluster.

**Tech Stack:** React Native, Expo Router, Zustand, TypeScript. No test framework in
this project — verification is `npx tsc --noEmit` plus manual on-device checks (see
`CLAUDE.md`).

---

## Background (read before starting)

MealaweUserApp (Ionic) shows Kota users a different "On Demand" experience than every
other cluster (Pune/Bangalore/Mumbai). This was confirmed by reading the actual
source, not inferred:

- **Non-Kota "On Demand"** (`tab-on-demand.component.ts`): a paginated,
  geolocation-sorted list of nearby kitchens. Tap a kitchen → see *that kitchen's*
  menu (`kitchen-inside.component.ts`, fetched per-kitchen). This is exactly what
  `MealaweUserAppRN`'s current `OnDemandHome.tsx` → `on-demand-kitchen.tsx` flow
  already does, for every cluster.
- **Kota "On Demand"** (`tabClusterMenu.component.ts`): **no kitchen list at all.**
  One API call — `getKitchMenuByClusterAndKitchenType(clusterId, 'Tier2')` — returns
  one pre-merged menu for the whole cluster, reshaped into a synthetic "kitchen"
  object (`{kitchenName, kitchenId, kitchenType, clusters, clusterMenu: true}`,
  `tabClusterMenu.component.ts:114-120`). The user lands straight on a searchable,
  veg/non-veg-filterable item grid. Items are `allDay`-only (no Advance mode —
  `[orderType]="'allDay'"` is hardcoded, `tabClusterMenu.component.html:86`).
- Which tile a cluster's Home screen shows (`ondemand` vs `clustermenu`) is decided
  by the backend's per-cluster `searchClusterVariable` config
  (`showOndemand`/`showClusterMenu` booleans, `tab-home.component.ts:580-596`) — it
  is **not** a hardcoded `if (cluster === 'kota')` check on the frontend. Kota's
  cluster config is inferred (not directly observable from this repo) to set
  `showClusterMenu: true`; every other cluster's config sets `showOndemand: true`.
- Cart/checkout differences on the Ionic side (flat `OYO_DELIVERY_CHARGE` instead of
  a distance quote, no per-kitchen geofence check, 15 vs 45 min prep buffer, no
  auto-coupon, no eco-packaging option — all gated on `cartObj.kitchen.clusterMenu`,
  see `tabCart.page.ts`) **do not need to be ported**: `MealaweUserAppRN`'s
  `on-demand-cart.tsx`/`bill.ts` already compute delivery/packaging/platform charges
  from flat cluster-config values for every cluster (see `chargesFromOnDemandConfig`,
  `bill.ts:35-70`) and have no per-kitchen geofence logic at all. The only Ionic
  cart behavior that doesn't already exist and needs a small guard is the
  "switch kitchen" links, which don't make sense for a cluster-menu cart (Task 4).

**What this plan does NOT do:** change checkout charge calculation, add an Advance
mode to the cluster-menu view (Ionic doesn't have one either), or touch the
Subscription/Bulk/Dine-In flows.

## File Structure

| File | Change |
|---|---|
| `src/store/clusterStore.ts` | Modify — add `showClusterMenu` to the existing generic cluster-flag list |
| `src/services/http/endpoints.ts` | Modify — add the cluster-menu endpoint |
| `src/features/on-demand/types.ts` | Modify — add `clusterMenu?: boolean` to `OnDemandKitchen` |
| `src/features/on-demand/api.ts` | Modify — add `loadClusterMenu()` |
| `src/features/on-demand/index.ts` | Modify — export `loadClusterMenu` and the new component |
| `src/features/on-demand/components/ClusterMenuList.tsx` | Create — the Kota cluster-menu feed (search, veg filter, item list, cart wiring) |
| `src/features/on-demand/components/OnDemandHome.tsx` | Modify — branch to `ClusterMenuList` when `showClusterMenu` is true |
| `src/app/on-demand-cart.tsx` | Modify — hide "Change kitchen" and redirect "Add something else" for a cluster-menu cart |

---

### Task 1: Add the `showClusterMenu` cluster-config flag

**Files:**
- Modify: `src/store/clusterStore.ts:12-27`

- [ ] **Step 1: Add the flag key**

In `src/store/clusterStore.ts`, the `ClusterFlagKey` union and `CLUSTER_FLAG_KEYS`
array already drive a generic fetch-and-cache mechanism (`refreshFlag`) for every
cluster-config boolean — adding a new flag here is the only wiring needed; the
`detectClusters()` loop that calls `refreshFlag` for every key already picks it up
automatically. Change:

```ts
type ClusterFlagKey =
  | 'showSubscription'
  | 'showBulk'
  | 'showDineIn'
  | 'showOndemand'
  | 'showNavmool'
  | 'showRainyNotification';

const CLUSTER_FLAG_KEYS: readonly ClusterFlagKey[] = [
  'showSubscription',
  'showBulk',
  'showDineIn',
  'showOndemand',
  'showNavmool',
  'showRainyNotification',
];
```

to:

```ts
type ClusterFlagKey =
  | 'showSubscription'
  | 'showBulk'
  | 'showDineIn'
  | 'showOndemand'
  | 'showClusterMenu'
  | 'showNavmool'
  | 'showRainyNotification';

const CLUSTER_FLAG_KEYS: readonly ClusterFlagKey[] = [
  'showSubscription',
  'showBulk',
  'showDineIn',
  'showOndemand',
  'showClusterMenu',
  'showNavmool',
  'showRainyNotification',
];
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (no errors). `useClusterStore((s) => s.showClusterMenu)` is now a
valid, typed selector (`boolean | null`, same as every other flag) anywhere in the
app.

- [ ] **Step 3: Commit**

```bash
git add src/store/clusterStore.ts
git commit -m "feat(on-demand): add showClusterMenu cluster-config flag"
```

---

### Task 2: Add the cluster-menu API call

**Files:**
- Modify: `src/services/http/endpoints.ts:168-175`
- Modify: `src/features/on-demand/types.ts:12-27`
- Modify: `src/features/on-demand/api.ts`
- Modify: `src/features/on-demand/index.ts:10`

- [ ] **Step 1: Add the endpoint**

In `src/services/http/endpoints.ts`, inside the `onDemand` block, add a new entry
right after `kitchenMenu`:

```ts
  onDemand: {
    /** POST /api/getNearestKitchen/:pageNumber/:lng/:lat — body { clusterList } → OnDemandKitchen[]. */
    nearestKitchens: '/api/getNearestKitchen',
    /** GET /api/getKitchenPartner/:id → OnDemandKitchen. */
    kitchenProfile: '/api/getKitchenPartner',
    /** GET /api/kitchenMenu/:kitchenId → { itemList: OnDemandMenuItem[] } (both modes' eligibility flags included). */
    kitchenMenu: '/api/kitchenMenu',
    /**
     * GET /api/getKitchMenuByClusterAndKitchenType/:clusterId/:kitchenType →
     * one pre-merged menu for the whole cluster (Kota-only flow, gated by the
     * `showClusterMenu` cluster-config flag — see `clusterStore.ts`). Verified
     * against MealaweUserApp's `tabClusterMenu.component.ts`.
     */
    clusterMenu: '/api/getKitchMenuByClusterAndKitchenType',
  },
```

- [ ] **Step 2: Add the `clusterMenu` flag to `OnDemandKitchen`**

In `src/features/on-demand/types.ts`, add one field to the existing interface:

```ts
/** A kitchen that accepts on-demand (Daily/Advance) orders. */
export interface OnDemandKitchen {
  _id: string;
  kitchenName: string;
  imageUrl?: string;
  kitchenOpened: boolean;
  distance?: number;
  rating?: number;
  speciality?: string;
  mainSpeciality?: string;
  /** Veg/NonVeg/Jain tags the kitchen serves. */
  mealType?: string[];
  discountOffer?: DiscountOffer;
  /** Minutes the kitchen needs to prepare an order. */
  preparationTime?: number;
  /** True for the synthetic cluster-wide "kitchen" `loadClusterMenu()` builds
   * (Kota's aggregated-menu flow) — never a real kitchen document. Used to
   * skip the kitchen-switch links in `on-demand-cart.tsx`, which don't apply
   * when there's no real kitchen to switch away from. */
  clusterMenu?: boolean;
}
```

- [ ] **Step 3: Add `loadClusterMenu()` to `api.ts`**

In `src/features/on-demand/api.ts`, add this function after `loadKitchenMenu` (reuses
the existing private `normalizeMenuItem` already defined in this file):

```ts
/**
 * The Kota-only aggregated cluster menu — one pre-merged menu for the whole
 * cluster instead of picking a kitchen first. Mirrors MealaweUserApp's
 * `tabClusterMenu.component.ts`: takes the user's first serviceable cluster
 * (`userClusters[0]`, not every cluster they're in) and a hardcoded
 * `kitchenType` of `'Tier2'`. Returns `null` when there's no serviceable
 * cluster or the request fails — same empty-safe contract as the other loaders.
 */
export async function loadClusterMenu(): Promise<{ kitchen: OnDemandKitchen; items: OnDemandMenuItem[] } | null> {
  const clusterId = useClusterStore.getState().clusters[0]?.clusterId;
  if (!clusterId) {
    return null;
  }
  try {
    const raw = await http.get<Record<string, unknown>>(
      `${ENDPOINTS.onDemand.clusterMenu}/${clusterId}/Tier2`,
    );
    if (!raw || !raw.kitchenId) {
      return null;
    }
    const itemList = raw.itemList;
    const kitchen: OnDemandKitchen = {
      _id: String(raw.kitchenId),
      kitchenName: String(raw.kitchenName ?? 'On Demand'),
      kitchenOpened: true,
      clusterMenu: true,
    };
    const items = Array.isArray(itemList) ? (itemList as Record<string, unknown>[]).map(normalizeMenuItem) : [];
    return { kitchen, items };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Export it**

In `src/features/on-demand/index.ts`, change:

```ts
export { loadNearestKitchens, loadKitchenProfile, loadKitchenMenu, loadOnDemandCoupons } from './api';
```

to:

```ts
export { loadNearestKitchens, loadKitchenProfile, loadKitchenMenu, loadClusterMenu, loadOnDemandCoupons } from './api';
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/services/http/endpoints.ts src/features/on-demand/types.ts src/features/on-demand/api.ts src/features/on-demand/index.ts
git commit -m "feat(on-demand): add loadClusterMenu for Kota's aggregated-menu flow"
```

---

### Task 3: Build the `ClusterMenuList` feed component

This is the Kota-only replacement for the kitchen-browse grid: search + veg filter +
a flat, grouped item list, sourced from one `loadClusterMenu()` call. No kitchen
hero, no mode toggle (Daily/`allDay` only, matching Ionic's hardcoded
`orderType: 'allDay'`).

**Files:**
- Create: `src/features/on-demand/components/ClusterMenuList.tsx`
- Modify: `src/features/on-demand/index.ts`

- [ ] **Step 1: Create the component**

```tsx
// src/features/on-demand/components/ClusterMenuList.tsx
import { useEffect, useMemo, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { TextInput, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, type SharedValue } from 'react-native-reanimated';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { IconSearch, IconUtensils } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { useBottomStackClearance } from '@/features/orders';
import { palette, shadow } from '@/theme';

import { loadClusterMenu } from '../api';
import { groupMenuByMode, itemStatusFor } from '../pricing';
import { loadOrderingWindows, type OrderingWindows } from '../schedule';
import { useOnDemandCartStore } from '../useOnDemandCartStore';
import type { OnDemandKitchen, OnDemandMenuItem } from '../types';
import { OnDemandCartFooter } from './OnDemandCartFooter';
import { OnDemandItemCard } from './OnDemandItemCard';
import { VegFilterChips, type DietFilter } from './VegFilterChips';

interface ClusterMenuListProps {
  /** Top padding so content starts below the home hero band — same contract as OnDemandHome/SubscriptionHome. */
  topInset?: number;
  /** Shared scroll offset — lets the home hero collapse as this feed scrolls, same contract as OnDemandHome. */
  scrollY?: SharedValue<number>;
}

/**
 * Kota's on-demand flow: one aggregated cluster-wide menu, no kitchen
 * selection — mirrors MealaweUserApp's `tabClusterMenu.component.ts`. Always
 * Daily/`allDay` mode (the source app hardcodes this too — there is no
 * Advance mode for a cluster menu).
 */
export function ClusterMenuList({ topInset = 0, scrollY }: ClusterMenuListProps) {
  const router = useRouter();
  const bottomStackClearance = useBottomStackClearance();
  const cart = useOnDemandCartStore((s) => s.cart);
  const setCount = useOnDemandCartStore((s) => s.setCount);

  const [kitchen, setKitchen] = useState<OnDemandKitchen | null>(null);
  const [items, setItems] = useState<OnDemandMenuItem[]>([]);
  const [windows, setWindows] = useState<OrderingWindows | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [diet, setDiet] = useState<DietFilter>(null);

  const onScroll = useAnimatedScrollHandler((e) => {
    if (scrollY) {
      scrollY.value = e.contentOffset.y;
    }
  });

  useEffect(() => {
    let active = true;
    Promise.all([loadClusterMenu(), loadOrderingWindows()]).then(([res, w]) => {
      if (!active) return;
      setKitchen(res?.kitchen ?? null);
      setItems(res?.items ?? []);
      setWindows(w);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const groups = useMemo(() => groupMenuByMode(items, 'allDay'), [items]);

  const q = search.trim().toLowerCase();
  const filteredGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          items: g.items.filter((item) => {
            if (diet && item.itemType !== diet) return false;
            if (q && !item.itemName.toLowerCase().includes(q)) return false;
            return true;
          }),
        }))
        .filter((g) => g.items.length > 0),
    [groups, diet, q],
  );

  const cartMatchesView = cart.kitchen?.clusterMenu === true;
  const countFor = (itemId: string): number =>
    cartMatchesView ? (cart.lines.find((l) => l.item._id === itemId)?.count ?? 0) : 0;

  function change(itemId: string, delta: number): void {
    if (!kitchen) return;
    const item = items.find((i) => i._id === itemId);
    if (!item) return;
    setCount(item, kitchen, 'allDay', Math.max(0, countFor(itemId) + delta));
  }

  const itemCount = cartMatchesView ? cart.lines.reduce((sum, l) => sum + l.count, 0) : 0;
  const subTotal = cartMatchesView ? cart.lines.reduce((sum, l) => sum + l.item.itemPrice * l.count, 0) : 0;

  return (
    <View style={{ flex: 1 }}>
      <Animated.ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: topInset, paddingBottom: 24 + bottomStackClearance }}>
        <View className="px-4 pt-4">
          <AppText variant="h2" className="text-foreground">
            Order on demand
          </AppText>
          <AppText variant="body" className="mt-1 text-muted-foreground">
            Today's menu, cooked fresh and delivered same-day.
          </AppText>
        </View>

        <View className="gap-3 px-4 pt-4">
          <View
            className="flex-row items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3.5"
            style={shadow.card}>
            <IconSearch size={20} color={palette.neutral.gray500} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search menu"
              placeholderTextColor={palette.neutral.gray500}
              className="flex-1 font-metropolis text-title text-foreground"
              style={{ paddingVertical: 0 }}
            />
          </View>
          <VegFilterChips value={diet} onChange={setDiet} />
        </View>

        <View className="pt-5" style={{ gap: 16, paddingHorizontal: 16 }}>
          {loading ? (
            [0, 1, 2].map((i) => (
              <View key={i} className="flex-row gap-3 rounded-2xl border border-border bg-card p-3">
                <View style={{ flex: 1, gap: 8 }}>
                  <Skeleton width="60%" height={15} />
                  <Skeleton width="35%" height={13} />
                </View>
                <Skeleton width={118} height={118} radius={14} />
              </View>
            ))
          ) : filteredGroups.length === 0 ? (
            <View className="items-center px-4 py-14">
              <AccentIcon icon={IconUtensils} tone="food" size={26} tileSize={56} />
              <AppText variant="title" className="text-center text-foreground" style={{ marginTop: 12 }}>
                {search || diet ? 'No matching items' : 'No items on the menu right now'}
              </AppText>
              <AppText variant="bodySm" className="mt-1 text-center text-muted-foreground">
                {search || diet ? 'Try a different search term or filter.' : 'Check back again soon.'}
              </AppText>
            </View>
          ) : (
            filteredGroups.map((group) => (
              <View key={group.groupName} style={{ gap: 10 }}>
                <AppText variant="label" className="text-foreground">
                  {group.groupName}
                </AppText>
                {group.items.map((item) => (
                  <OnDemandItemCard
                    key={item._id}
                    item={item}
                    count={countFor(item._id)}
                    status={windows ? itemStatusFor(item, 'allDay', windows, countFor(item._id)) : 'available'}
                    onIncrease={() => change(item._id, 1)}
                    onDecrease={() => change(item._id, -1)}
                  />
                ))}
              </View>
            ))
          )}
        </View>
      </Animated.ScrollView>

      <OnDemandCartFooter itemCount={itemCount} subTotal={subTotal} onPress={() => router.push('/on-demand-cart' as Href)} />
    </View>
  );
}
```

- [ ] **Step 2: Export it**

In `src/features/on-demand/index.ts`, add next to the other component exports:

```ts
export { ClusterMenuList } from './components/ClusterMenuList';
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/on-demand/components/ClusterMenuList.tsx src/features/on-demand/index.ts
git commit -m "feat(on-demand): add ClusterMenuList, Kota's aggregated-menu feed"
```

---

### Task 4: Branch the On Demand home tab on `showClusterMenu`

**Files:**
- Modify: `src/features/on-demand/components/OnDemandHome.tsx`

- [ ] **Step 1: Read the flag and branch**

In `src/features/on-demand/components/OnDemandHome.tsx`, add one new import line
right after the existing `import { VegFilterChips, type DietFilter } from './VegFilterChips';`
line (`useClusterStore` itself is already imported from `@/store` — no change needed
to that line):

```tsx
import { ClusterMenuList } from './ClusterMenuList';
```

Add this line near the other `useClusterStore` reads (right after `const serviceable = useClusterStore((s) => s.clusters.length > 0);`):

```tsx
  const showClusterMenu = useClusterStore((s) => s.showClusterMenu);
```

Then wrap the existing return statement — change:

```tsx
  return (
    <Animated.ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={{ paddingTop: topInset, paddingBottom: 24 + insets.bottom + bottomStackClearance }}>
```

to:

```tsx
  if (showClusterMenu) {
    return <ClusterMenuList topInset={topInset} scrollY={scrollY} />;
  }

  return (
    <Animated.ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={{ paddingTop: topInset, paddingBottom: 24 + insets.bottom + bottomStackClearance }}>
```

(Everything else in the file — the kitchen-list fetch/search/veg-filter/near-vs-other
sections — is untouched; it now only renders for the `showClusterMenu === false` /
`null` case, i.e. every non-Kota cluster and before the flag has resolved.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/on-demand/components/OnDemandHome.tsx
git commit -m "feat(on-demand): route Kota clusters to the aggregated cluster menu"
```

---

### Task 5: Guard the cart's kitchen-switch links for a cluster-menu cart

A cluster-menu cart's `cart.kitchen` is the synthetic cluster "kitchen"
(`clusterMenu: true`, no real kitchen document behind it). `on-demand-cart.tsx`'s
"Change" link currently routes to `/on-demand-kitchens` (a real kitchen picker,
meaningless here) and "Add something else" routes to
`/on-demand-kitchen?kitchenId=...` (would try to fetch a kitchen profile/menu that
doesn't exist for this synthetic id). Both need to respect the flag.

**Files:**
- Modify: `src/app/on-demand-cart.tsx:311-330` (the "Change" row) and `:376-392` (the "Add something else" link)

- [ ] **Step 1: Hide "Change" for a cluster-menu cart**

Change:

```tsx
        {cart.kitchen ? (
          <View className="flex-row items-center justify-between">
            <AppText variant="label" className="text-foreground">
              {cart.kitchen.kitchenName}
            </AppText>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/on-demand-kitchens',
                  params: { mode: cart.mode ?? 'allDay' },
                } as Href)
              }
              accessibilityRole="button"
              className="active:opacity-70">
              <AppText variant="label" style={{ color: palette.accent.info }}>
                Change
              </AppText>
            </Pressable>
          </View>
        ) : null}
```

to:

```tsx
        {cart.kitchen ? (
          <View className="flex-row items-center justify-between">
            <AppText variant="label" className="text-foreground">
              {cart.kitchen.kitchenName}
            </AppText>
            {!cart.kitchen.clusterMenu ? (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/on-demand-kitchens',
                    params: { mode: cart.mode ?? 'allDay' },
                  } as Href)
                }
                accessibilityRole="button"
                className="active:opacity-70">
                <AppText variant="label" style={{ color: palette.accent.info }}>
                  Change
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : null}
```

- [ ] **Step 2: Redirect "Add something else" home for a cluster-menu cart**

Change:

```tsx
          {cart.kitchen ? (
            <Pressable
              onPress={() => {
                if (!cart.kitchen) return;
                router.push({
                  pathname: '/on-demand-kitchen',
                  params: { kitchenId: cart.kitchen._id, mode: cart.mode ?? 'allDay' },
                } as Href);
              }}
              accessibilityRole="button"
              className="flex-row items-center gap-1.5 self-start active:opacity-70">
              <IconPlus size={16} color={palette.accent.info} />
              <AppText variant="label" style={{ color: palette.accent.info }}>
                Add something else
              </AppText>
            </Pressable>
          ) : null}
```

to:

```tsx
          {cart.kitchen ? (
            <Pressable
              onPress={() => {
                if (!cart.kitchen) return;
                if (cart.kitchen.clusterMenu) {
                  router.push('/(tabs)' as Href);
                  return;
                }
                router.push({
                  pathname: '/on-demand-kitchen',
                  params: { kitchenId: cart.kitchen._id, mode: cart.mode ?? 'allDay' },
                } as Href);
              }}
              accessibilityRole="button"
              className="flex-row items-center gap-1.5 self-start active:opacity-70">
              <IconPlus size={16} color={palette.accent.info} />
              <AppText variant="label" style={{ color: palette.accent.info }}>
                Add something else
              </AppText>
            </Pressable>
          ) : null}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/on-demand-cart.tsx
git commit -m "fix(on-demand): don't offer kitchen-switching on a cluster-menu cart"
```

---

### Task 6: Manual verification

No test framework exists in this project (see `CLAUDE.md`) — verify on-device.

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: clean, zero errors, across the whole project.

- [ ] **Step 2: Non-Kota regression check**

On a build pointed at a non-Kota serviceable location (e.g. Pune), open the Home tab's
On Demand section. Expected: unchanged — the existing kitchen grid (search, veg
filter, "KITCHENS NEAR YOU"/"OTHER KITCHENS") still renders exactly as before, since
`showClusterMenu` resolves to `false`/`null` there.

- [ ] **Step 3: Kota cluster-menu check**

This requires either a real account whose current cluster resolves to Kota with its
backend config's `showClusterMenu` flag set true, or a temporary local override for
testing (e.g. hardcode `showClusterMenu: true` in `useClusterStore`'s initial state
to preview the UI, then revert before committing). Verify:
- The On Demand home tab shows the search bar + veg filter + a grouped item list
  directly — no kitchen grid, no kitchen-picking step.
- Adding an item increments the cart footer count/subtotal; tapping the footer opens
  `/on-demand-cart` with the same line items.
- In the cart, the kitchen row shows a name but **no "Change" link**.
- "Add something else" returns to the Home tab (not a kitchen list or a broken
  kitchen-profile fetch).
- Checkout (Pay now) behaves like any other on-demand order — same slot picker,
  same bill breakdown, same JusPay flow — since this plan makes no changes to
  `bill.ts`/checkout logic.

- [ ] **Step 4: Report results**

Note in the PR/commit description which of Steps 2–3 could actually be verified on a
real device vs. which had to rely on the temporary flag override, so reviewers know
what's genuinely confirmed vs. still needs a real Kota account to fully verify —
same caveat pattern already used in this repo's other unverified-on-device plans
(see `docs/superpowers/plans/2026-08-31-tracking-jusaypay-colors-fixes.md`'s Task 4).

---

## Self-review notes

**Spec coverage:** Every concrete difference identified in the Background section is
addressed: the flag (Task 1), the data fetch (Task 2), the no-kitchen-picking item
list UI (Task 3), the Home-tab routing (Task 4), and the cart's now-meaningless
kitchen-switch links (Task 5). Checkout-side Ionic differences (flat delivery charge,
no geofence check, prep buffer, auto-coupon, eco-packaging) are explicitly scoped out
in the Background section with the reasoning why (RN's checkout is already
cluster-config-flat for every cluster).

**Placeholder scan:** No TBD/TODO/"handle appropriately" language — every step has
complete, runnable code.

**Type consistency:** `loadClusterMenu()` returns `{ kitchen: OnDemandKitchen; items: OnDemandMenuItem[] } | null` in Task 2 and is consumed with that exact shape in Task 3's `ClusterMenuList`. `OnDemandKitchen.clusterMenu` (added in Task 2) is read in Task 3 (`cart.kitchen?.clusterMenu === true`) and Task 5 (`cart.kitchen.clusterMenu`) with the same field name throughout. `showClusterMenu` (added to `ClusterFlagKey` in Task 1) is read via `useClusterStore((s) => s.showClusterMenu)` in Task 4, matching the store's existing per-flag selector pattern used for `showOndemand` etc. elsewhere in the codebase.

**Uncertainty carried forward from investigation:** which cluster-config values Kota
vs. other clusters actually have set for `showClusterMenu`/`showOndemand` cannot be
confirmed from this frontend repo — that lives in the backend's `ClusterConfigVariable`
data (see `mealaweDashboard`'s cluster-config-variables form). If Kota's config
doesn't yet have `showClusterMenu` set at all, this flow will simply never trigger
until that config is set — same as it presumably already is for Ionic today.

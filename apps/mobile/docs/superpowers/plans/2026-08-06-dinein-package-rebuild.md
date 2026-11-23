# Dine In Package Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the fabricated kitchen/table-booking "Dine In" feature and rebuild it
as a thin adapter over the real backend (`POST /api/getDineInPackageListCluster`),
reusing the Subscription feature's already-correct `isDineIn`-aware configure → cart
pipeline unchanged.

**Architecture:** One new API function normalizes raw `DineInPackage` server documents
into the app's existing `MealPackage` shape; one new `DineInHome` component renders
them with the existing `PlanCard` and hands off to `useConfigureStore` +
`/subscription-configure` exactly like `SubscriptionHome` does. Everything downstream
(`subscription-configure.tsx`, `cart.tsx`, `bill.ts`, `PlanCard`) is untouched — research
confirmed `isDineIn` is already correctly threaded through all of it.

**Tech Stack:** React Native (Expo SDK 57), Zustand (`useConfigureStore`), no new
dependencies.

**Spec:** `docs/superpowers/specs/2026-08-06-dinein-package-rebuild-design.md`

**Verification convention (no unit tests in this project):** every code task is
verified with `npx tsc --noEmit`. Final task runs the full build
(`npx expo export --platform android -c`).

---

### Task 1: Replace the fabricated `dineIn` endpoint block with a verified one

**Files:**
- Modify: `src/services/http/endpoints.ts`

- [ ] **Step 1: Replace the block**

Find the `dineIn: { ... }` block (the one with the `⚠️ PROPOSED` comment) and replace
it entirely with:

```ts
  /** Dine-in packages — reuses the subscription package model. The real
   * backend has no kitchen/table-booking concept; "Dine In" is a Subscription
   * package flagged `isDineIn: true` on the cart line (see
   * `src/features/dine-in/api.ts` and `useConfigureStore`). */
  dineInPackage: {
    /** POST /api/getDineInPackageListCluster — body { custerList: string[] }
     * (backend spelling, matches subscription's mealPackageList) → raw
     * DineInPackage[] documents. */
    listCluster: '/api/getDineInPackageListCluster',
  },
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: errors in `src/features/dine-in/api.ts` (still references the old
`ENDPOINTS.dineIn.*` paths) — expected, fixed in Task 2. No errors from
`endpoints.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/services/http/endpoints.ts
git commit -m "refactor: replace fabricated dineIn endpoints with the real getDineInPackageListCluster"
```

---

### Task 2: Rewrite the Dine In API layer, delete dead files

**Files:**
- Modify: `src/features/dine-in/api.ts`
- Delete: `src/features/dine-in/types.ts`
- Delete: `src/features/dine-in/schedule.ts`

- [ ] **Step 1: Replace `api.ts` in full**

```ts
import { ENDPOINTS, http } from '@/services/http';
import { useClusterStore } from '@/store/clusterStore';
import type { AddOn, MealPackage } from '@/features/subscription';

/** Raw shape of a `DineInPackage` document as returned by
 * `getDineInPackageListCluster` — see `MealaweServerApp/src/model/dineInPackage.model.js`.
 * Only the fields this normalizer reads are declared; anything else on the
 * real document is ignored (not needed client-side today). */
interface RawDineInPackage {
  _id?: string;
  packageName?: string;
  packagePrice?: number;
  packageCategory?: { name?: string; selected?: boolean }[];
  packageSubCategory?: string;
  packageType?: string;
  days?: number;
  vegMealDescription?: string;
  nonVegMealDescription?: string;
  deliveryOnWeekends?: boolean;
  discount?: number;
  packageInfo?: string;
  priority?: number;
  clusters?: string[];
  offerText?: string;
  offerColor?: string;
  multiDateAllowed?: boolean;
  isBestSeller?: boolean;
  searchCategory?: string;
  imageUrl?: string;
  addonsList?: AddOn[];
}

/** `DineInPackage.packageCategory` is a `{name:'Lunch'|'Dinner', selected}[]`
 * subdocument array server-side — collapse the selected entries into the
 * plain display string `MealPackage.packageCategory` expects, e.g. "Lunch,
 * Dinner". Falls back to `''` if nothing is selected (matches how an empty
 * category renders elsewhere — no category chip shown). */
function packageCategoryLabel(raw: RawDineInPackage['packageCategory']): string {
  if (!Array.isArray(raw)) return '';
  return raw
    .filter((c) => c?.selected && c.name)
    .map((c) => c.name as string)
    .join(', ');
}

function normalizeDineInPackage(raw: RawDineInPackage): MealPackage {
  return {
    _id: raw._id,
    packageName: raw.packageName,
    packagePrice: raw.packagePrice ?? 0,
    packageCategory: packageCategoryLabel(raw.packageCategory),
    packageSubCategory: raw.packageSubCategory,
    packageType: raw.packageType as MealPackage['packageType'],
    days: raw.days ?? 0,
    vegMealDescription: raw.vegMealDescription,
    nonVegMealDescription: raw.nonVegMealDescription,
    deliveryOnWeekends: raw.deliveryOnWeekends,
    discount: raw.discount ?? 0,
    packageInfo: raw.packageInfo,
    priority: raw.priority,
    clusters: raw.clusters,
    offerText: raw.offerText,
    offerColor: raw.offerColor,
    multiDateAllowed: raw.multiDateAllowed,
    isBestSeller: raw.isBestSeller,
    searchCategory: raw.searchCategory,
    imageUrl: raw.imageUrl,
    addonsList: raw.addonsList,
  };
}

/** Dine-in packages for the current cluster(s) — the real backend models
 * "Dine In" as a Subscription package flagged `isDineIn: true`, not a kitchen/
 * table-booking system (see the design spec). Empty (not thrown) when
 * unserviceable or on any request failure — callers render an empty state. */
export async function loadDineInPackages(): Promise<MealPackage[]> {
  const clusterList = useClusterStore.getState().clusterIds();
  if (clusterList.length === 0) {
    return [];
  }
  try {
    const list = await http.post<RawDineInPackage[]>(ENDPOINTS.dineInPackage.listCluster, {
      custerList: clusterList,
    });
    return Array.isArray(list) ? list.map(normalizeDineInPackage) : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Delete `types.ts` and `schedule.ts`**

```bash
git rm src/features/dine-in/types.ts src/features/dine-in/schedule.ts
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: errors in `src/features/dine-in/index.ts` and
`src/features/dine-in/components/*.tsx` (still reference the deleted types/
`loadKitchens`/`schedule.ts` exports) — expected, fixed in Task 3. No errors
from `api.ts` itself.

- [ ] **Step 4: Commit**

```bash
git add src/features/dine-in/api.ts
git commit -m "refactor: rewrite dine-in api.ts to fetch real DineInPackage docs, delete fake booking types/schedule"
```

---

### Task 3: Rewrite `DineInHome`, delete the fake booking components, rewrite the barrel

**Files:**
- Modify: `src/features/dine-in/components/DineInHome.tsx`
- Delete: `src/features/dine-in/components/KitchenHeroCard.tsx`
- Delete: `src/features/dine-in/components/DineInDateSlotPicker.tsx`
- Delete: `src/features/dine-in/components/BookingSummaryCard.tsx`
- Delete: `src/features/dine-in/useDineInBookingStore.ts`
- Modify: `src/features/dine-in/index.ts`

- [ ] **Step 1: Replace `DineInHome.tsx` in full**

```tsx
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { IconMapPin, IconUtensils } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { PlanCard, useConfigureStore, type MealPackage } from '@/features/subscription';
import { useClusterStore } from '@/store';
import { palette } from '@/theme';

import { loadDineInPackages } from '../api';

interface DineInHomeProps {
  /** Top padding so content starts below the home hero band, same contract
   * as SubscriptionHome's `topInset`. */
  topInset?: number;
}

/** The Dine In tab body: a gradient hero banner + a flat list of dine-in
 * packages. There's no kitchen/table-booking concept server-side — Dine In is
 * a Subscription package flagged `isDineIn: true`; selecting one hands off to
 * the same `/subscription-configure` → `/cart` flow Subscription uses (see
 * the design spec for why). No category tabs: the real packages are
 * duration/meal-time named (e.g. "Bi-Weekly Package-Lunch"), not thali
 * categories, and the server already sorts them by priority. */
export function DineInHome({ topInset = 0 }: DineInHomeProps) {
  const router = useRouter();
  const setConfigureContext = useConfigureStore((s) => s.set);
  const serviceable = useClusterStore((s) => s.clusters.length > 0);

  const [packages, setPackages] = useState<MealPackage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadDineInPackages().then((res) => {
      if (active) {
        setPackages(res);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  function selectPackage(pkg: MealPackage) {
    setConfigureContext({ package: pkg, category: 'Dine In', isDineIn: true });
    router.push('/subscription-configure' as Href);
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: topInset, paddingBottom: 24 }}>
      <View className="px-4 pt-4">
        <LinearGradient
          colors={[palette.accent.info, palette.brand.teal]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              backgroundColor: 'rgba(255,255,255,0.18)',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <IconUtensils size={26} color="#ffffff" />
          </View>
          <View className="flex-1">
            <AppText variant="bodySm" className="text-white/80">
              Eat fresh at the
            </AppText>
            <AppText variant="h2" className="text-white">
              Kitchen
            </AppText>
          </View>
        </LinearGradient>
      </View>

      <View className="px-4 pt-4" style={{ gap: 14 }}>
        {loading ? (
          [0, 1].map((i) => (
            <View key={i} style={{ borderRadius: 18, overflow: 'hidden' }}>
              <Skeleton height={140} radius={0} />
              <View style={{ padding: 16, gap: 8, backgroundColor: 'transparent' }}>
                <Skeleton width="55%" height={18} />
                <Skeleton width="75%" height={14} />
              </View>
            </View>
          ))
        ) : !serviceable ? (
          <EmptyState
            title="Set a delivery location"
            message="Choose your location to see dine-in packages near you."
          />
        ) : packages.length === 0 ? (
          <EmptyState
            title="No dine-in packages here yet"
            message="Dine-in isn't available in your area right now."
          />
        ) : (
          <View style={{ gap: 14 }}>
            {packages.map((pkg) => (
              <PlanCard
                key={pkg._id}
                pkg={pkg}
                selected={false}
                onSelect={() => selectPackage(pkg)}
              />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View className="items-center px-4 py-14">
      <AccentIcon icon={IconMapPin} tone="location" size={26} tileSize={56} />
      <AppText variant="title" className="text-foreground" style={{ marginTop: 12, textAlign: 'center' }}>
        {title}
      </AppText>
      <AppText
        variant="bodySm"
        className="text-muted-foreground"
        style={{ marginTop: 4, textAlign: 'center' }}>
        {message}
      </AppText>
    </View>
  );
}
```

- [ ] **Step 2: Delete the fake-booking components and store**

```bash
git rm src/features/dine-in/components/KitchenHeroCard.tsx \
  src/features/dine-in/components/DineInDateSlotPicker.tsx \
  src/features/dine-in/components/BookingSummaryCard.tsx \
  src/features/dine-in/useDineInBookingStore.ts
```

- [ ] **Step 3: Replace `index.ts` in full**

```ts
export { loadDineInPackages } from './api';
export { DineInHome } from './components/DineInHome';
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: errors in `src/store/index.ts` (still imports/re-exports
`useDineInBookingStore`) and `src/app/dine-in-booking.tsx` /
`src/app/dine-in-confirm.tsx` (still import the deleted exports) — expected,
fixed in Tasks 4 and 5. No errors from anything inside
`src/features/dine-in/` itself.

- [ ] **Step 5: Commit**

```bash
git add src/features/dine-in/components/DineInHome.tsx src/features/dine-in/index.ts
git commit -m "refactor: rebuild DineInHome as a package list, delete fake booking components"
```

---

### Task 4: Remove `useDineInBookingStore` wiring from the store barrel

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: Remove the import, hydrate call, and re-export**

```ts
import { useBulkCartStore } from '@/features/bulk/useBulkCartStore';
import { useOnDemandCartStore } from '@/features/on-demand/useOnDemandCartStore';
import { setAuthTokenProvider } from '@/services/http';

import { useAuthStore } from './authStore';
import { useCartStore } from './cartStore';
import { useClusterStore } from './clusterStore';
import { useLocationStore } from './locationStore';
import { useThemeStore } from './themeStore';

/** Call once at startup to connect stores to cross-cutting services. */
export function initStores(): void {
  // HTTP client reads the token straight from the auth store on each request.
  setAuthTokenProvider(() => useAuthStore.getState().token);
  // Apply the persisted theme preference before first render (no flash).
  useThemeStore.getState().hydrate();
  // Seed cached clusters, then refresh detection from the current address.
  useClusterStore.getState().hydrate();
  const current = useLocationStore.getState().current;
  if (current?.geolocation) {
    void useClusterStore.getState().detectClusters(current.geolocation);
  }
  // Restore any in-progress cart.
  useCartStore.getState().hydrate();
  useBulkCartStore.getState().hydrate();
  useOnDemandCartStore.getState().hydrate();

  // Keep saved addresses in sync when the profile loads/changes after boot
  // (login fetches the profile async — its addressList must reflow into the store).
  useAuthStore.subscribe((state, prev) => {
    if (state.profile !== prev.profile) {
      useLocationStore.getState().hydrate();
    }
  });
}

export { useAuthStore } from './authStore';
export { useThemeStore, type ThemePreference } from './themeStore';
export { useClusterStore } from './clusterStore';
export { useCartStore } from './cartStore';
export { useBulkCartStore } from '@/features/bulk/useBulkCartStore';
export { useOnDemandCartStore } from '@/features/on-demand/useOnDemandCartStore';
export {
  useLocationStore,
  type Address,
  type GeoPoint,
  type TagLocation,
} from './locationStore';
export type { Cluster } from '@/features/location/types';
```

(Only the `useDineInBookingStore` import line, its `hydrate()` call, and its
re-export line are removed — every other line is unchanged from the current file.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: errors only in `src/app/dine-in-booking.tsx` / `src/app/dine-in-confirm.tsx`
(deleted in Task 5). No errors from `store/index.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/store/index.ts
git commit -m "refactor: remove useDineInBookingStore wiring from the store barrel"
```

---

### Task 5: Delete the fake booking/confirm screens

**Files:**
- Delete: `src/app/dine-in-booking.tsx`
- Delete: `src/app/dine-in-confirm.tsx`

- [ ] **Step 1: Delete both screens**

```bash
git rm src/app/dine-in-booking.tsx src/app/dine-in-confirm.tsx
```

Expo Router is file-based — deleting these files removes the routes entirely; no
navigator config elsewhere references them (confirmed during planning: the only
other references were the now-already-updated `index.ts`/`store/index.ts`, and the
Maestro flow/test-catalogue rows handled in Task 6).

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors project-wide.

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor: delete the fake dine-in booking/confirm screens"
```

(Nothing to `git add` — `git rm` already staged the deletions.)

---

### Task 6: Fix the Maestro flow and test-catalogue rows

**Files:**
- Delete: `.maestro/flows/dine-in-booking.yaml`
- Create: `.maestro/flows/dine-in-package-cart.yaml`
- Modify: `.maestro/README.md`
- Modify: `scripts/generate-test-catalogue.mjs`

- [ ] **Step 1: Delete the old flow, create the new one**

```bash
git rm .maestro/flows/dine-in-booking.yaml
```

Create `.maestro/flows/dine-in-package-cart.yaml`:

```yaml
appId: com.mealawe.app
---
# MANUAL: requires an authenticated session + a serviceable Kota cluster
# (showDineIn=true; Dine In only shows there — see HOME-02) with at least one
# real DineInPackage from the backend (staging's Kota cluster already has 7,
# cloned from production).
- assertVisible: "Choose your plan"
- tapOn: "Dine In"
- assertVisible: "Kitchen"
- tapOn: "Monthly Package"
- assertVisible: "Dine In · "
- tapOn: "Lunch"
- tapOn: "Go to Cart →"
- assertVisible: "Dine-in"
- assertNotVisible: "Address"
```

(The `tapOn: "Monthly Package"` target is a substring match against whichever real
package name starts with "Monthly Package" on the test cluster — Maestro's `tapOn`
matches by substring by default. `"Dine In · "` matches
`subscription-configure.tsx`'s header caption, `"{context.category} · {days} days"`,
with `category` set to `'Dine In'`.)

- [ ] **Step 2: Register the new flow in the README index, remove the old one**

In `.maestro/README.md`'s Flow index table, remove the row for
`dine-in-booking.yaml` and add:

```
| `dine-in-package-cart.yaml` | Dine In package → configure → cart (no address row) | **Manual** |
```

- [ ] **Step 3: Fix the test catalogue**

In `scripts/generate-test-catalogue.mjs`:

1. Replace `DINEIN-01`/`02`/`03` (currently kitchen-list states) with:
   ```js
   ['DINEIN-01', 'Dine In', 'Empty state when not serviceable', 'No delivery location set', 'Open the Dine In tab', '"Set a delivery location" empty state shown, no package cards', 'P0'],
   ['DINEIN-02', 'Dine In', 'Empty state when serviceable but no packages', 'Serviceable Kota cluster, backend returns no DineInPackage docs', 'Open the Dine In tab', '"No dine-in packages here yet" empty state shown', 'P1'],
   ['DINEIN-03', 'Dine In', 'Selecting a package opens the shared configure flow with isDineIn set', 'Dine In tab has ≥1 package', 'Tap a package card', 'Navigates to /subscription-configure showing "Dine In · {days} days"; add-ons and Lunch/Dinner toggle behave exactly as they do for a Subscription package', 'P0'],
   ```
2. Delete `DINEIN-04` through `DINEIN-09` entirely (party size, special requests,
   date/slot cutoff, reservation confirm/retry — none of this exists in the
   package model).
3. Add after the renumbered `DINEIN-03`:
   ```js
   ['DINEIN-04', 'Dine In', 'Cart shows "Dine-in" instead of a delivery address', 'A dine-in package is in the cart', 'Open the cart', 'The address row reads "Dine-in · Eat at the kitchen" instead of a delivery address', 'P0'],
   ['DINEIN-05', 'Dine In', 'Delivery/packaging/platform charges are zero for a dine-in cart line', 'A dine-in package is in the cart', 'Expand the bill breakdown', 'Delivery, Packaging, and Platform fee rows are ₹0 (or hidden); only item price, add-ons, and taxes contribute', 'P1'],
   ```
4. Keep `DINEIN-10`/`11` exactly as they are (same IDs, same text, same
   position) — they cover Home-level cluster-detection/flag-priority behavior
   that's unrelated to the booking-vs-package internals and still applies
   unchanged. Nothing else in the script references those IDs, so leaving the
   numbering non-contiguous (`DINEIN-01..05`, then `DINEIN-10..11`) is fine —
   this project's catalogue doesn't renumber on delete elsewhere either.
5. Update `E2E-39` (`FULL_FLOW` array) from "Browse kitchens → book a table →
   confirm reservation" to:
   ```js
   ['E2E-39', 'Dine In', 'Browse dine-in packages → configure → cart shows dine-in row', 'Authenticated session, serviceable Kota cluster, ≥1 DineInPackage from the backend', 'Dine In tab → tap a package → pick Lunch/Dinner + dates → Go to Cart', 'Cart shows the package with a "Dine-in" row instead of an address', 'P0', 'dine-in-package-cart.yaml (manual)'],
   ```

- [ ] **Step 4: Regenerate the workbook**

```bash
npm install --no-save exceljs
node scripts/generate-test-catalogue.mjs
```

Expected: `docs/TEST-CATALOGUE.xlsx` rewritten with no errors.

- [ ] **Step 5: Commit**

```bash
git add .maestro/README.md .maestro/flows/dine-in-package-cart.yaml \
  scripts/generate-test-catalogue.mjs docs/TEST-CATALOGUE.xlsx
git commit -m "test: replace dine-in booking flow/catalogue rows with the package-cart flow"
```

---

### Task 7: Final build verification

**Files:** none (verification only)

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Full export build**

Run: `npx expo export --platform android -c`
Expected: build completes with no bundling errors.

- [ ] **Step 3: Grep for any missed reference**

```bash
grep -rn "dine-in-booking\|dine-in-confirm\|DineInBooking\|useDineInBookingStore\|KitchenHeroCard\|DineInDateSlotPicker\|BookingSummaryCard\|loadKitchens\|loadAvailability\|saveDineInBooking" src/ .maestro/ scripts/generate-test-catalogue.mjs
```

Expected: no matches (a match here means a call site was missed in Tasks 1-6).
Note: `src/features/on-demand/components/OnDemandSlotPicker.tsx` has a doc-comment
mentioning "DineInDateSlotPicker" by name as a design-pattern reference — that's a
comment, not an import, and is harmless to leave, but double-check it didn't
resurface as an actual import.

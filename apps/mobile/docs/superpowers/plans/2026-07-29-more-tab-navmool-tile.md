# More Tab + Navmool Tile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder "More" tab body in `(tabs)/index.tsx` with a real, cluster-gated feature hub (`MoreHome`), and add its first entry: a Navmool tile that pushes to a new placeholder `/marketplace` screen. This is sub-project 1 of 4 in the Navmool port — browse/catalog, cart+coupon+bill, and checkout land in later plans.

**Architecture:** Extend `clusterStore` with a `showNavmool` flag that mirrors the existing `showDineIn` flag byte-for-byte (same fetch, same cache, same null-on-failure contract), fired alongside it inside `detectClusters()`. Add a new presentational `MoreHome` component under `src/features/home/components/` (matching `SubscriptionHome`/`DineInHome`'s inline-tab-content pattern) that renders a filtered `MORE_FEATURES` tile list + Log out button, and wire it into `(tabs)/index.tsx` in place of the current placeholder JSX. Add one new icon alias and one new placeholder route.

**Tech Stack:** React Native (Expo SDK 57, expo-router), Zustand, lucide-react-native icons, NativeWind, existing `AppText`/design-system primitives.

**Spec:** `docs/superpowers/specs/2026-07-29-more-tab-navmool-tile-design.md`

**Verification convention (no unit tests in this project):** every task's file(s) are verified with `npx tsc --noEmit` (expect no errors mentioning the new/changed file). UI tasks additionally get a manual on-device check described in the step. Final task runs the full manual QA walkthrough plus the Maestro flow authoring/catalogue update.

---

### Task 1: Add `IconShoppingBag` to the icon set

**Files:**
- Modify: `src/components/ui/icons.tsx`

- [ ] **Step 1: Add the alias**

In `src/components/ui/icons.tsx`, add `ShoppingBag as IconShoppingBag` to the Lucide re-export list, alphabetically grouped with the other general-purpose icons near the top (after `IconLeaf`, before `IconReceipt`, to keep the existing loose grouping):

```ts
export {
  MapPin as IconMapPin,
  ChevronDown as IconChevronDown,
  ChevronRight as IconChevronRight,
  ArrowLeft as IconArrowLeft,
  Search as IconSearch,
  LocateFixed as IconLocate,
  Wallet as IconWallet,
  CircleUserRound as IconUser,
  Leaf as IconLeaf,
  ShoppingBag as IconShoppingBag,
  ReceiptText as IconReceipt,
  LifeBuoy as IconHelp,
  MessageSquareText as IconFeedback,
  LogOut as IconLogOut,
  Mail as IconMail,
  Phone as IconPhone,
  Gift as IconGift,
  Pencil as IconEdit,
  Coins as IconCoins,
  MessageCircle as IconChat,
  Lightbulb as IconSuggestion,
  Heart as IconPraise,
  CircleAlert as IconComplaint,
  ChevronUp as IconChevronUp,
  Sun as IconSun,
  Moon as IconMoon,
  Smartphone as IconSystem,
  // Subscription flow
  X as IconClose,
  Check as IconCheck,
  CircleCheckBig as IconCheckCircle,
  Star as IconStar,
  Flame as IconFlame,
  Clock as IconClock,
  Calendar as IconCalendar,
  Plus as IconPlus,
  Minus as IconMinus,
  ShoppingCart as IconCart,
  Ticket as IconTicket,
  Utensils as IconUtensils,
  Images as IconImages,
  CircleDot as IconDot,
  Bike as IconDelivery,
  ArrowRight as IconArrowRight,
  BadgePercent as IconOffer,
} from 'lucide-react-native';
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `icons.tsx`. (This is a pure re-export addition — nothing else imports `IconShoppingBag` yet, so there's nothing to break.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/icons.tsx
git commit -m "feat: add IconShoppingBag to the icon set"
```

---

### Task 2: Add `showNavmool` cluster flag to `clusterStore`

**Files:**
- Modify: `src/store/clusterStore.ts`

- [ ] **Step 1: Add the cache map and state field**

In `src/store/clusterStore.ts`, add a second module-level cache next to `dineInFlagCache` (after line 49):

```ts
let geofencingCache: Cluster[] | null = null;
/** showDineIn per clusterConfigName — avoids re-fetching on every detectClusters call. */
const dineInFlagCache = new Map<string, boolean>();
/** showNavmool per clusterConfigName — same rationale as dineInFlagCache. */
const navmoolFlagCache = new Map<string, boolean>();
```

Add `showNavmool` to the `ClusterState` interface, directly below `showDineIn`'s declaration:

```ts
  /**
   * The current cluster's `showDineIn` config flag — the authoritative signal
   * both reference apps use to gate the Dine In tab (mealaweApp's
   * FeatureFlagsService, MealaweUserApp's tabs.page `configvariableDetails
   * .showDineIn`). `null` until fetched or when the fetch fails; callers
   * should fall back to a `clusterName.includes('kota')` heuristic in that
   * case, not treat `null` as `false`.
   */
  showDineIn: boolean | null;
  /**
   * The current cluster's `showNavmool` config flag — gates the Navmool tile
   * in the More hub (mealaweApp's FeatureFlagsService.showNavmool). Unlike
   * showDineIn there is no naming-heuristic fallback: `null` (unresolved or
   * failed fetch) is treated as "not enabled" by callers, so the tile stays
   * hidden until this resolves to `true`.
   */
  showNavmool: boolean | null;
```

- [ ] **Step 2: Add `refreshNavmoolFlag`, a structural copy of `refreshDineInFlag`**

Directly below the existing `refreshDineInFlag` function, add:

```ts
/** Fetch (and cache) the `showNavmool` cluster-config flag. Sets state to
 * `null` on failure — never `false` — so callers can distinguish "known not
 * enabled" from "couldn't ask". Unlike showDineIn, callers have no naming
 * heuristic fallback: `null` should be treated as "hide the tile". */
async function refreshNavmoolFlag(configName: string, set: (partial: Partial<ClusterState>) => void): Promise<void> {
  if (!configName) {
    set({ showNavmool: null });
    return;
  }
  const cached = navmoolFlagCache.get(configName);
  if (cached !== undefined) {
    set({ showNavmool: cached });
    return;
  }
  try {
    const cfg = await clusterApi.searchClusterVariable(configName);
    const flag = cfg?.['showNavmool'] === true || cfg?.['showNavmool'] === 'true';
    navmoolFlagCache.set(configName, flag);
    set({ showNavmool: flag });
  } catch {
    set({ showNavmool: null });
  }
}
```

- [ ] **Step 3: Initialize the field and fire the refresh alongside `showDineIn`**

In the `create<ClusterState>(...)` initializer, add `showNavmool: null,` next to `showDineIn: null,`:

```ts
export const useClusterStore = create<ClusterState>((set, get) => ({
  clusters: [],
  detecting: false,
  showDineIn: null,
  showNavmool: null,
  // ...
```

In `detectClusters`, add the parallel fire-and-forget call right after the existing `showDineIn` refresh:

```ts
      const configName = matched.length ? String(matched[matched.length - 1].clusterConfigName ?? '') : '';
      void refreshDineInFlag(configName, set);
      void refreshNavmoolFlag(configName, set);
      return matched;
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `clusterStore.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/store/clusterStore.ts
git commit -m "feat: add showNavmool cluster-config flag to clusterStore"
```

---

### Task 3: Create the `MoreHome` component

**Files:**
- Create: `src/features/home/components/MoreHome.tsx`

- [ ] **Step 1: Write the component**

Create `src/features/home/components/MoreHome.tsx`:

```tsx
import { useRouter, type Href } from 'expo-router';
import type { ComponentType } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconLogOut, IconShoppingBag, type IconProps } from '@/components/ui/icons';
import type { CustomerProfile } from '@/features/auth/types';
import { palette, shadow } from '@/theme';

interface MoreFeature {
  key: string;
  label: string;
  description: string;
  icon: ComponentType<IconProps>;
  route: Href;
  ready: boolean;
}

const MORE_FEATURES: MoreFeature[] = [
  {
    key: 'navmool',
    label: 'Navmool',
    description: 'Ghee, oil, spices & more — delivered.',
    icon: IconShoppingBag,
    route: '/marketplace' as Href,
    ready: true,
  },
];

interface MoreHomeProps {
  profile: CustomerProfile | null;
  /** clusterStore.showNavmool — null (unresolved/failed) is treated as
   * "not enabled", matching this feature's no-heuristic-fallback contract. */
  showNavmool: boolean | null;
  onLogout: () => void;
}

/** The "More" tab body: a filtered list of secondary-vertical tiles (today:
 * just Navmool) plus account actions. Mirrors mealaweApp's MoreHomeComponent/
 * FeatureFlagsService.moreFeatures — a flat list filtered by ready + cluster
 * flags, not a generic per-entry resolver (YAGNI until a 2nd gated entry
 * exists; see the design spec's "flat filtered list" rationale). */
export function MoreHome({ profile, showNavmool, onLogout }: MoreHomeProps) {
  const router = useRouter();

  const features = MORE_FEATURES.filter(
    (f) => f.ready && (f.key !== 'navmool' || showNavmool === true),
  );

  return (
    <View className="flex-1 px-5">
      <AppText variant="h3" className="text-foreground">
        Hi {profile?.userName ?? 'there'} 👋
      </AppText>
      <AppText variant="body" className="mt-1 text-muted-foreground">
        More ways to order with Mealawe.
      </AppText>

      <View className="mt-4" style={{ gap: 12 }}>
        {features.map((feature) => (
          <Pressable
            key={feature.key}
            onPress={() => router.push(feature.route)}
            accessibilityRole="button"
            style={[shadow.card, { borderRadius: 18 }]}
            className="flex-row items-center gap-3 border border-border bg-card p-4 active:opacity-90">
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                backgroundColor: palette.brand.green,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <feature.icon size={24} color="#ffffff" />
            </View>
            <View className="flex-1">
              <AppText variant="label" className="text-foreground">
                {feature.label}
              </AppText>
              <AppText variant="caption" className="text-muted-foreground">
                {feature.description}
              </AppText>
            </View>
          </Pressable>
        ))}
      </View>

      <View className="mt-auto pb-6">
        <Pressable
          onPress={onLogout}
          className="items-center rounded-2xl border border-border py-3 active:opacity-80">
          <View className="flex-row items-center gap-2">
            <IconLogOut size={16} color={palette.status.danger} />
            <AppText variant="label" className="text-danger">
              Log out
            </AppText>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
```

Note: `topInset`/`paddingTop` is deliberately NOT baked into this component — the caller (`(tabs)/index.tsx`) currently wraps its placeholder branch in a `View` with `style={{ paddingTop: collapseDistance + 24 }}`. Keep that wrapping `View` in place around `<MoreHome />` in Task 4 rather than duplicating the inset logic inside the component, since `MoreHome` has no scroll view of its own to pad (unlike `DineInHome`, which owns a `ScrollView` and therefore does take `topInset` as a prop).

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `MoreHome.tsx`. (It isn't imported anywhere yet, so this only checks the file compiles in isolation — full integration is verified in Task 4.)

- [ ] **Step 3: Commit**

```bash
git add src/features/home/components/MoreHome.tsx
git commit -m "feat: add MoreHome component with filtered feature tile list"
```

---

### Task 4: Wire `MoreHome` into the More tab

**Files:**
- Modify: `src/app/(tabs)/index.tsx`

- [ ] **Step 1: Import `MoreHome` and read `showNavmool`**

Add the import alongside the other home-feature imports (near line 20-22):

```ts
import { HomeHeader } from '@/features/home/components/HomeHeader';
import { HomeTabs, type HomeTab } from '@/features/home/components/HomeTabs';
import { LottieHero } from '@/features/home/components/LottieHero';
import { MoreHome } from '@/features/home/components/MoreHome';
import { VegModePulse } from '@/features/home/components/VegModePulse';
```

Add the store read next to the existing `showDineIn` read (near line 44):

```ts
  const showDineIn = useClusterStore((s) => s.showDineIn);
  const showNavmool = useClusterStore((s) => s.showNavmool);
```

- [ ] **Step 2: Replace the placeholder `more` branch**

Replace the current final `else` branch (the placeholder JSX rendering the greeting, migration text, and Log out button — currently lines 178-197) with:

```tsx
        ) : (
          <View className="flex-1" style={{ paddingTop: collapseDistance + 24 }}>
            <MoreHome profile={profile} showNavmool={showNavmool} onLogout={logout} />
          </View>
        )}
```

The full conditional chain in the render body should now read (for context — only the final branch changes):

```tsx
        {activeTab === 'subscription' ? (
          <SubscriptionHome vegOnly={vegOnly} scrollY={scrollY} topInset={collapseDistance} />
        ) : activeTab === 'bulk' ? (
          <View className="flex-1 px-5" style={{ paddingTop: collapseDistance + 24 }}>
            {/* ...unchanged bulk JSX... */}
          </View>
        ) : activeTab === 'dinein' ? (
          <DineInHome topInset={collapseDistance + 24} />
        ) : (
          <View className="flex-1" style={{ paddingTop: collapseDistance + 24 }}>
            <MoreHome profile={profile} showNavmool={showNavmool} onLogout={logout} />
          </View>
        )}
```

Note: `MoreHome` itself applies `px-5` internally (see Task 3's component — it uses `className="flex-1 px-5"` on its own root `View`), so the wrapping `View` here should NOT also carry `px-5`, to avoid double horizontal padding. Confirm this by checking Task 3's `MoreHome` root view has `px-5` and the wrapper added here does not.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `(tabs)/index.tsx` or `MoreHome.tsx`.

- [ ] **Step 4: Manual on-device check**

Run the app (`npx expo start` with a dev client, or an existing running emulator session), log in, and tap the "More" tab.
Expected:
- If the logged-in account's delivery address resolves to a cluster with `showNavmool: true`: greeting text ("Hi {name} 👋"), a "Navmool" tile with the shopping-bag icon, and a "Log out" button at the bottom — no more "The more feed lands here..." placeholder text.
- If `showNavmool` is `false`/`null` for that cluster: greeting + Log out button only, no Navmool tile, no crash, no blank gap.
- Tapping "Log out" still shows the same behavior as before (clears session, returns to `/welcome`) — this logic is untouched, only relocated.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(tabs)/index.tsx"
git commit -m "feat: wire MoreHome into the More tab, replacing the placeholder"
```

---

### Task 5: Create the placeholder `/marketplace` route

**Files:**
- Create: `src/app/marketplace.tsx`

- [ ] **Step 1: Write the placeholder screen**

Create `src/app/marketplace.tsx`, following the same `Stack.Screen` header + centered-message pattern already used by other simple screens (e.g. `cashback.tsx`'s guest-gate branch):

```tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconShoppingBag } from '@/components/ui/icons';
import { palette } from '@/theme';

/** Placeholder for the Navmool (grocery marketplace) vertical. Browse/catalog,
 * cart, and checkout land in later sub-projects of the Navmool port — this
 * screen only exists so the More tab's Navmool tile has somewhere to go. */
export default function MarketplaceScreen() {
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Navmool' }} />
      <StatusBar style="dark" />
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <IconShoppingBag size={40} color={palette.brand.green} />
        <AppText variant="h3" className="text-center text-foreground">
          Navmool — coming soon
        </AppText>
        <AppText variant="body" className="text-center text-muted-foreground">
          Ghee, oil, spices, and more will be here shortly.
        </AppText>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `marketplace.tsx`.

- [ ] **Step 3: Manual on-device check**

From the More tab, tap the Navmool tile.
Expected: navigates to a screen with a header titled "Navmool", a shopping-bag icon, and the "Navmool — coming soon" message. Back button returns to the More tab.

- [ ] **Step 4: Commit**

```bash
git add src/app/marketplace.tsx
git commit -m "feat: add placeholder /marketplace route for the Navmool tile"
```

---

### Task 6: Full build verification

**Files:** none (verification-only task)

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: zero errors across the whole project.

- [ ] **Step 2: Export check**

Run: `npx expo export --platform android -c`
Expected: exports successfully with no bundling errors.

- [ ] **Step 3: Manual regression pass on the other tabs**

On-device, confirm Subscription, Bulk (or Dine In, whichever the current test cluster resolves to), and the address/profile flows still behave exactly as before — this task only touched the `more` branch and the shared `clusterStore`, so nothing else should have changed. Specifically check: the Bulk↔Dine In tab swap (driven by `showDineIn`) still works, since `detectClusters` was edited in Task 2.

- [ ] **Step 4: Commit (only if any fixes were needed in this task)**

```bash
git add -A
git commit -m "fix: address issues found in full build verification"
```

(Skip this step entirely if nothing needed fixing.)

---

### Task 7: Author the Maestro flow and test-catalogue rows

**Files:**
- Create: `.maestro/flows/more-tab-navmool-tile.yaml`
- Modify: `scripts/generate-test-catalogue.mjs`
- Modify: `.maestro/README.md`

- [ ] **Step 1: Write the Maestro flow**

Create `.maestro/flows/more-tab-navmool-tile.yaml`, following this repo's existing flow conventions (no `testID`, select by visible text, `# MANUAL` header comment since it's past login):

```yaml
appId: com.mealawe.app
---
# MANUAL: requires an authenticated session (see login-otp-flow.yaml) and a
# delivery address resolving to a cluster with showNavmool=true.
- assertVisible: "Choose your plan"
- tapOn: "More"
- assertVisible: "Navmool"
- tapOn: "Navmool"
- assertVisible: "Navmool — coming soon"
- back
- assertVisible: "Navmool" # back on the More tab
```

- [ ] **Step 2: Add the catalogue rows**

In `scripts/generate-test-catalogue.mjs`, add a new `'Home'` sheet entry (the existing `Home` array already covers `HOME-01`..`HOME-04` — append to it, don't create a new sheet) for the More tab:

```js
  Home: [
    ['HOME-01', 'Home', 'Home defaults to Subscription tab', 'Authenticated, serviceable location', 'Land on home', '"Choose your plan" visible by default', 'P0'],
    ['HOME-02', 'Home', 'Order-mode tabs are cluster-aware (Bulk vs Dine In)', 'Non-Kota vs Kota cluster', 'Compare tab set for each cluster type', 'Non-Kota shows "Bulk"; Kota shows "Dine In" instead', 'P1'],
    ['HOME-03', 'Home', 'PURE VEG toggle shows on/off confirmation pulse', 'On home', 'Tap "PURE VEG" pill twice', '"Pure Veg ON" then "Pure Veg OFF" transient confirmation shown', 'P1'],
    ['HOME-04', 'Home', 'Address label updates after changing delivery address', 'Address changed via Addresses screen', 'Return to home', 'Header address text reflects the newly selected address', 'P1'],
    ['HOME-05', 'Home', 'More tab shows the Navmool tile only when showNavmool is true', 'Cluster config has showNavmool=true', 'Tap the "More" tab', 'Greeting + "Navmool" tile + "Log out" button render; no placeholder migration text', 'P0'],
    ['HOME-06', 'Home', 'More tab hides the Navmool tile when showNavmool is false or unresolved', 'Cluster config has showNavmool=false, or the fetch fails', 'Tap the "More" tab', 'Greeting + "Log out" button render; no "Navmool" tile, no crash', 'P1'],
    ['HOME-07', 'Home', 'Tapping the Navmool tile opens the placeholder marketplace screen', 'Navmool tile visible', 'Tap "Navmool"', 'Navigates to a screen titled "Navmool" showing "Navmool — coming soon"', 'P1'],
  ],
```

Add one row to `FULL_FLOW` (append after the last existing entry, `E2E-39`):

```js
  ['E2E-40', 'Home', 'More tab → Navmool tile → placeholder screen', 'Authenticated session, serviceable cluster with showNavmool=true', 'Home → tap "More" → tap "Navmool"', '"Navmool — coming soon" screen shown; Back returns to the More tab', 'P1', 'more-tab-navmool-tile.yaml (manual)'],
```

- [ ] **Step 3: Regenerate the workbook**

Run:
```bash
npm install --no-save exceljs
node scripts/generate-test-catalogue.mjs
```
Expected output: `Wrote .../docs/TEST-CATALOGUE.xlsx (<N> cases across <M> sheets)` with no errors, where `<N>` is 3 higher than before this task (HOME-05, HOME-06, HOME-07) plus 1 more for E2E-40.

- [ ] **Step 4: Update the Maestro flow index**

In `.maestro/README.md`, add a row to the "Flow index" table (after `help-and-feedback.yaml`):

```markdown
| `more-tab-navmool-tile.yaml` | More tab → Navmool tile → placeholder screen | **Manual** |
```

- [ ] **Step 5: Commit**

```bash
git add .maestro/flows/more-tab-navmool-tile.yaml scripts/generate-test-catalogue.mjs .maestro/README.md docs/TEST-CATALOGUE.xlsx
git commit -m "test: add Maestro flow and catalogue rows for the More tab Navmool tile"
```

---

### Task 8: Remove `marketplace` from the excluded-features list

**Files:**
- Modify: `docs/TESTING-WORKFLOW.md`

The Navmool feature folder is still `.gitkeep`-only after this plan (browse/catalog lands in the next sub-project), but the More-tab entry point and its Maestro flow now exist — so `marketplace` should be dropped from `docs/TESTING-WORKFLOW.md`'s "Placeholder / unimplemented features" list to avoid contradicting Task 7's new flow. `scripts/generate-test-catalogue.mjs`'s `EXCLUDED_FEATURES` array is a separate, code-level list gating the *catalogue generator itself* — it stays as-is, since it excludes a `marketplace` **sheet name** (there is no `marketplace` feature sheet; this plan's rows went into the existing `Home` sheet), so nothing there currently references this work.

- [ ] **Step 1: Update the doc**

In `docs/TESTING-WORKFLOW.md`, change:

```markdown
`dine-in`, `marketplace`, `on-demand`, `oyo`, `payments` under `src/features/`
are `.gitkeep`-only placeholders with no implementation. They are **explicitly
excluded** from the catalogue and from `.maestro/flows/` until real code exists
```

to:

```markdown
`dine-in`, `on-demand`, `oyo`, `payments` under `src/features/` are
`.gitkeep`-only placeholders with no implementation. They are **explicitly
excluded** from the catalogue and from `.maestro/flows/` until real code exists.
(`marketplace` has a Home-tab entry point as of the More-tab-Navmool-tile work —
see the `Home` sheet's HOME-05..07 — but its own feature folder is still a
placeholder until the browse/catalog sub-project lands.)
```

- [ ] **Step 2: Commit**

```bash
git add docs/TESTING-WORKFLOW.md
git commit -m "docs: note Navmool's More-tab entry point in the placeholder-features list"
```

---

## Post-plan state

After this plan: the More tab renders a real (if minimal) hub instead of a stub, `showNavmool` is a first-class cluster flag any future screen can read from `useClusterStore`, and `/marketplace` exists as a named route ready for the next sub-project (browse/catalog) to fill in. No Navmool business logic (menu, cart, checkout) exists yet — that is intentionally deferred to the next 3 plans in the series.

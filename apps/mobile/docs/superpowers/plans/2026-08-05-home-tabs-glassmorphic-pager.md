# Home Tabs Glassmorphic Sliding Pager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `HomeTabs` (the Subscription/Bulk/Dine In/Daily/Advance/Navmool
order-mode row on Home) into a Zomato-style dark glassmorphic tab strip with a
continuously-sliding capsule indicator, add an icon to every pill, and make the three
feed tabs (Subscription/Bulk/Dine In) swipeable via a horizontal pager whose scroll
position drives the capsule in real time. Daily/Advance/Navmool stay tap-only shortcuts
outside the pager.

**Architecture:** The feed area in `(tabs)/index.tsx` (today a conditional render of one
of three bodies) becomes an `Animated.ScrollView` with `pagingEnabled` over the
cluster-filtered feed tabs. A shared `pagerProgress` value (0..feedTabCount-1,
continuous) is written by the pager's scroll handler and read by `HomeTabs` to compute
the capsule's `left`/`width` against each pill's measured layout. Tapping a pill
scrolls the pager to that page; the pager settling updates `activeTab` state. Built
entirely from `react-native-reanimated` (4.5.0) + the existing native `ScrollView` —
no new native dependency, no prebuild required.

**Tech Stack:** React Native (Expo SDK 57, expo-router), react-native-reanimated 4.5.0,
lucide-react-native icons, expo-blur, NativeWind, existing `AppText`/design-system
primitives.

**Spec:** `docs/superpowers/specs/2026-08-05-home-tabs-glassmorphic-pager-design.md`

**Verification convention (no unit tests in this project):** every code task is
verified with `npx tsc --noEmit` (expect no errors mentioning the changed file). The
final task runs the full build (`npx expo export --platform android -c`), a manual
on-device walkthrough, and the Maestro flow + test-catalogue update per
`docs/TESTING-WORKFLOW.md`.

---

### Task 1: Add the two missing icon aliases

**Files:**
- Modify: `src/components/ui/icons.tsx`

- [ ] **Step 1: Add `Repeat as IconRepeat` and `Store as IconStore`**

In `src/components/ui/icons.tsx`, add both aliases to the Lucide re-export list —
`IconRepeat` grouped near the top with the other general-purpose icons (after
`IconLeaf`), `IconStore` grouped with the order-mode icons near the bottom (after
`IconAdvance`):

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
  Repeat as IconRepeat,
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
  CalendarDays as IconDaily,
  CalendarClock as IconAdvance,
  Store as IconStore,
} from 'lucide-react-native';

export type { LucideProps as IconProps } from 'lucide-react-native';
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `icons.tsx`. (Pure re-export addition — nothing else
references `IconRepeat`/`IconStore` yet, so there's nothing to break.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/icons.tsx
git commit -m "feat: add IconRepeat and IconStore aliases"
```

---

### Task 2: Rewrite `HomeTabs` — dark glassmorphic band + sliding capsule + icons

**Files:**
- Modify: `src/features/home/components/HomeTabs.tsx`

- [ ] **Step 1: Replace the full file contents**

The `HomeTab` type gains a required `icon`. The component gains two new props
(`feedTabCount`, `pagerProgress`) that describe how many leading tabs live in the
swipeable pager and the pager's continuous scroll position, and renders an absolutely
positioned capsule inside the tab `ScrollView` whose `left`/`width` are derived from
each pill's measured `onLayout` rect. `VegToggle` is unchanged.

```tsx
import { useEffect, type ComponentType } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { IconLeaf, type IconProps } from '@/components/ui/icons';
import { palette } from '@/theme';

export interface HomeTab {
  key: string;
  label: string;
  icon: ComponentType<IconProps>;
}

interface PillLayout {
  x: number;
  width: number;
}

interface HomeTabsProps {
  tabs: HomeTab[];
  activeKey: string;
  /** Number of leading `tabs` entries that live in the swipeable feed pager
   * (Subscription/Bulk/Dine In). The rest are tap-only shortcuts (Daily/Advance/
   * Navmool) and never receive the capsule. */
  feedTabCount: number;
  /** Continuous 0..feedTabCount-1 pager scroll position — tracks an in-progress
   * swipe, not just settled taps, so the capsule visibly drags with the finger. */
  pagerProgress: SharedValue<number>;
  vegOnly: boolean;
  onSelect: (key: string) => void;
  onToggleVeg: () => void;
}

/**
 * Order-mode tabs on a dark glassmorphic (Zomato-style) band over the hero. The
 * leading `feedTabCount` tabs share a capsule indicator that slides/resizes with
 * `pagerProgress`; the remaining tabs are static tap-to-navigate shortcuts.
 */
export function HomeTabs({
  tabs,
  activeKey,
  feedTabCount,
  pagerProgress,
  vegOnly,
  onSelect,
  onToggleVeg,
}: HomeTabsProps) {
  const layouts = useSharedValue<PillLayout[]>([]);

  function handlePillLayout(index: number, e: LayoutChangeEvent) {
    const { x, width } = e.nativeEvent.layout;
    const next = layouts.value.slice();
    next[index] = { x, width };
    layouts.value = next;
  }

  const capsuleStyle = useAnimatedStyle(() => {
    const items = layouts.value;
    if (items.length === 0 || feedTabCount === 0) {
      return { opacity: 0 };
    }
    const clamped = Math.min(Math.max(pagerProgress.value, 0), feedTabCount - 1);
    const lo = Math.min(Math.floor(clamped), feedTabCount - 1);
    const hi = Math.min(lo + 1, feedTabCount - 1);
    const frac = clamped - lo;
    const a = items[lo];
    const b = items[hi];
    if (!a || !b) {
      return { opacity: 0 };
    }
    return {
      opacity: 1,
      left: a.x + (b.x - a.x) * frac,
      width: a.width + (b.width - a.width) * frac,
    };
  });

  return (
    <View className="mx-3 mb-3 mt-1 flex-row items-center gap-2">
      {/* frosted band — TABS ONLY */}
      <View className="flex-1 overflow-hidden rounded-[22px] border border-white/20">
        <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
        {/* dark saturated wash for the Zomato-deep glass look */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,20,15,0.38)' }]} />
        {/* inner top highlight hairline */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: 'rgba(255,255,255,0.25)',
          }}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 8 }}>
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: 8,
                height: 36,
                borderRadius: 16,
                backgroundColor: 'rgba(255,255,255,0.95)',
                shadowColor: '#000',
                shadowOpacity: 0.25,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: 3,
              },
              capsuleStyle,
            ]}
          />
          {tabs.map((tab, index) => {
            const active = tab.key === activeKey;
            const Icon = tab.icon;
            return (
              <Pressable
                key={tab.key}
                onLayout={(e) => handlePillLayout(index, e)}
                onPress={() => onSelect(tab.key)}
                className="items-center rounded-2xl px-4 py-1.5 active:opacity-80"
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={tab.label}>
                <Icon size={16} color={active ? palette.brand.teal : 'rgba(255,255,255,0.85)'} />
                <AppText
                  variant="overline"
                  className={active ? 'mt-0.5 text-brand-teal' : 'mt-0.5 text-white'}
                  style={active ? undefined : { opacity: 0.85 }}>
                  {tab.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* veg toggle sits OUTSIDE the blur */}
      <VegToggle on={vegOnly} onToggle={onToggleVeg} />
    </View>
  );
}

function VegToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const p = useSharedValue(on ? 1 : 0);
  const pop = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      p.value = on ? 1 : 0; // instant state change, no spring/pop
      return;
    }
    p.value = withSpring(on ? 1 : 0, { damping: 15, stiffness: 180 });
    pop.value = withSequence(withTiming(1, { duration: 160 }), withTiming(0, { duration: 220 }));
  }, [on, p, pop, reduced]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], [palette.neutral.gray400, palette.brand.green]),
  }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(p.value, [0, 1], [0, 14]) }],
  }));
  const leafStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + pop.value * 0.35 },
      { rotate: `${interpolate(p.value, [0, 1], [-12, 0]) + pop.value * 12}deg` },
    ],
  }));

  return (
    <Pressable
      onPress={onToggle}
      className="items-center justify-center rounded-2xl bg-white px-3 py-1.5 active:opacity-90"
      style={{ minWidth: 58 }}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel="Pure veg only">
      <Animated.View style={leafStyle}>
        <IconLeaf size={16} color={on ? palette.brand.green : palette.neutral.gray500} />
      </Animated.View>
      <AppText
        variant="overline"
        style={{ color: on ? palette.brand.green : palette.neutral.gray500, marginTop: 1, lineHeight: 12 }}>
        PURE VEG
      </AppText>
      <Animated.View
        style={[
          { marginTop: 3, height: 12, width: 28, borderRadius: 6, padding: 1, justifyContent: 'center' },
          trackStyle,
        ]}>
        <Animated.View
          style={[{ height: 10, width: 10, borderRadius: 5, backgroundColor: '#fff' }, knobStyle]}
        />
      </Animated.View>
    </Pressable>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: errors pointing at `(tabs)/index.tsx` (its call site still passes the old
`activeKey`/no-`icon` shape) — that's expected and fixed in Task 3. No errors should
originate from `HomeTabs.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add src/features/home/components/HomeTabs.tsx
git commit -m "feat: dark glassmorphic HomeTabs with sliding capsule and icons"
```

---

### Task 3: Wire a swipeable feed pager into `(tabs)/index.tsx`

**Files:**
- Modify: `src/app/(tabs)/index.tsx`

- [ ] **Step 1: Replace the full file contents**

Changes from today's version: `orderTabs` entries gain an `icon`; a `FEED_TAB_KEYS` set
and derived `feedTabs` list define the pager's pages; a `pagerProgress` shared value +
`Animated.ScrollView` replace the conditional feed `View`; `selectTab` now also scrolls
the pager; a settle handler keeps `activeTab` in sync with swipes; an effect clamps
`activeTab` if cluster flags remove the active feed tab at runtime.

```tsx
import { NavigationBar } from 'expo-navigation-bar';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/ui/AppText';
import { IconAdvance, IconDaily, IconRepeat, IconShoppingBag, IconStore, IconUtensils } from '@/components/ui/icons';
import { BulkCategoryTile } from '@/features/bulk';
import { DineInHome } from '@/features/dine-in';
import { HomeHeader } from '@/features/home/components/HomeHeader';
import { HomeTabs, type HomeTab } from '@/features/home/components/HomeTabs';
import { LottieHero } from '@/features/home/components/LottieHero';
import { VegModePulse } from '@/features/home/components/VegModePulse';
import { addressLabel } from '@/features/location/types';
import { SubscriptionHome } from '@/features/subscription';
import { useBalances } from '@/features/wallet';
import { useAuthStore, useClusterStore, useLocationStore } from '@/store';

/** Shortcut tabs that have no in-home feed of their own — selecting one
 * navigates straight to its (placeholder or real) screen instead of
 * swapping the feed body, mirroring how the old More hub's tiles behaved. */
const SHORTCUT_ROUTES: Partial<Record<string, string>> = {
  daily: '/on-demand-kitchens?mode=allDay',
  advance: '/on-demand-kitchens?mode=advance',
  navmool: '/marketplace',
};

/** Tabs that own an in-home feed body and live in the swipeable pager. Every
 * other tab in `orderTabs` is a tap-only shortcut (see `SHORTCUT_ROUTES`). */
const FEED_TAB_KEYS = new Set(['subscription', 'bulk', 'dinein']);

// Hero band: Lottie behind a transparent header + tabs. It collapses to just the
// address/profile strip on scroll. The band is absolute (out of the feed's layout)
// so its collapse never reflows the scrolling feed — that reflow was the glitch.
const HERO_HEIGHT = 365;
// Minimum scroll delta before toggling the system nav bar — avoids flicker from
// sub-pixel scroll jitter at rest.
const NAV_BAR_SCROLL_THRESHOLD = 4;

export default function HomeScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const currentAddress = useLocationStore((s) => s.current);
  const useCurrentLocation = useLocationStore((s) => s.useCurrentLocation);
  const clusters = useClusterStore((s) => s.clusters);
  const showSubscription = useClusterStore((s) => s.showSubscription);
  const showBulk = useClusterStore((s) => s.showBulk);
  const showDineIn = useClusterStore((s) => s.showDineIn);
  const showDaily = useClusterStore((s) => s.showDaily);
  const showAdvance = useClusterStore((s) => s.showAdvance);
  const showNavmool = useClusterStore((s) => s.showNavmool);
  const { cashback } = useBalances();

  const [activeTab, setActiveTab] = useState('subscription');
  const [vegOnly, setVegOnly] = useState(false);
  const [vegPulse, setVegPulse] = useState(0);

  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const scrollY = useSharedValue(0);
  const pagerProgress = useSharedValue(0);
  const pagerRef = useRef<Animated.ScrollView>(null);
  // Collapsed hero = safe-area top + the ~56px HomeHeader row. The feed starts at
  // this height and its content is padded down by collapseDistance so the first
  // row lands exactly at the hero bottom throughout the collapse.
  const collapsedHeight = insets.top + 58;
  const collapseDistance = Math.max(1, HERO_HEIGHT - collapsedHeight);
  // Height-clip from the bottom (same look as before), but on an ABSOLUTE view so
  // the feed's layout is untouched → no scroll glitch.
  const heroStyle = useAnimatedStyle(() => ({
    height: interpolate(
      scrollY.value,
      [0, collapseDistance],
      [HERO_HEIGHT, collapsedHeight],
      Extrapolation.CLAMP,
    ),
  }));
  const tabsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, collapseDistance * 0.5], [1, 0], Extrapolation.CLAMP),
  }));

  // Immersive feed: hide the system nav bar while scrolling down, bring it back
  // on scroll-up or once back at the top.
  const setNavBarHidden = useCallback((hidden: boolean) => {
    if (Platform.OS === 'android') NavigationBar.setHidden(hidden);
  }, []);

  useAnimatedReaction(
    () => scrollY.value,
    (curr, prev) => {
      if (prev === null) return;
      const delta = curr - prev;
      if (curr <= NAV_BAR_SCROLL_THRESHOLD) {
        scheduleOnRN(setNavBarHidden, false);
      } else if (delta > NAV_BAR_SCROLL_THRESHOLD) {
        scheduleOnRN(setNavBarHidden, true);
      } else if (delta < -NAV_BAR_SCROLL_THRESHOLD) {
        scheduleOnRN(setNavBarHidden, false);
      }
    },
  );

  useEffect(() => () => setNavBarHidden(false), [setNavBarHidden]);

  // Proactively try GPS on first mount if no delivery address is set yet —
  // without this, `clusters` never populates for a user who hasn't
  // explicitly visited /addresses, so cluster-gated UI (Dine In, serviceable
  // plans) silently defaults to "not serviceable" even when the device is
  // physically in a serviceable area. Mirrors the legacy apps'
  // maybeAutoDetectLocation(); a denied permission / GPS failure is a no-op
  // (useCurrentLocation already resolves to null safely; the header keeps
  // showing "Set your location" exactly as before).
  useEffect(() => {
    if (!currentAddress) {
      void useCurrentLocation();
    }
    // Intentionally run once on mount only — this is a one-shot attempt, not
    // a re-trigger every time `currentAddress` changes (which would refire on
    // every location update this same call causes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loggedIn = !!profile;
  const label = addressLabel(currentAddress);

  // Cluster-aware order modes: every entry is gated by its own server-side
  // cluster-config flag (mirrors mealaweApp's FeatureFlagsService — a flat
  // filtered list, one boolean per vertical, not a generic per-entry
  // resolver). `showDineIn` keeps its documented `clusterName` substring
  // fallback for when that flag hasn't resolved yet or the fetch failed
  // (showDineIn === null); the newer flags (`showDaily`/`showAdvance`/
  // `showNavmool`) have no naming heuristic, so `null` reads as "not enabled"
  // and stays hidden until the config resolves to `true`. This replaces the
  // old "More" tab — every secondary vertical now lives as its own shortcut
  // in this same horizontally scrollable row instead of being buried a tap
  // deeper. Feed tabs (Subscription/Bulk/Dine In) always come first so their
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
    if (showDaily === true) {
      tabs.push({ key: 'daily', label: 'Daily', icon: IconDaily });
    }
    if (showAdvance === true) {
      tabs.push({ key: 'advance', label: 'Advance', icon: IconAdvance });
    }
    if (showNavmool === true) {
      tabs.push({ key: 'navmool', label: 'Navmool', icon: IconStore });
    }
    return tabs;
  }, [clusters, showSubscription, showBulk, showDineIn, showDaily, showAdvance, showNavmool]);

  const feedTabs = useMemo(() => orderTabs.filter((tab) => FEED_TAB_KEYS.has(tab.key)), [orderTabs]);

  const onPagerScroll = useAnimatedScrollHandler((e) => {
    if (windowWidth > 0) {
      pagerProgress.value = e.contentOffset.x / windowWidth;
    }
  });

  function goToFeedTab(key: string, animated: boolean) {
    const index = feedTabs.findIndex((tab) => tab.key === key);
    if (index === -1) return;
    pagerRef.current?.scrollTo({ x: index * windowWidth, y: 0, animated });
  }

  function handlePagerMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
    const tab = feedTabs[index];
    if (tab && tab.key !== activeTab) {
      setActiveTab(tab.key);
    }
  }

  // If a cluster-config change removes the currently active feed tab at
  // runtime (e.g. showBulk flips false mid-session), fall back to the first
  // remaining feed tab instead of stranding the pager on a removed page.
  useEffect(() => {
    if (feedTabs.length > 0 && !feedTabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(feedTabs[0].key);
      goToFeedTab(feedTabs[0].key, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedTabs]);

  function selectTab(key: string) {
    const route = SHORTCUT_ROUTES[key];
    if (route) {
      router.push(route as Parameters<typeof router.push>[0]);
      return;
    }
    setActiveTab(key);
    goToFeedTab(key, !reducedMotion);
  }

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="light" />

      {/* Feed — fills the screen from the collapsed-hero line down. A horizontal
          pager over the feed tabs; shortcut tabs (Daily/Advance/Navmool) have no
          page here and are tap-only from the glass band below. */}
      <View style={{ position: 'absolute', top: collapsedHeight, left: 0, right: 0, bottom: 0 }}>
        {feedTabs.length > 0 ? (
          <Animated.ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            decelerationRate="fast"
            directionalLockEnabled
            showsHorizontalScrollIndicator={false}
            scrollEnabled={feedTabs.length > 1}
            onScroll={onPagerScroll}
            scrollEventThrottle={16}
            onMomentumScrollEnd={handlePagerMomentumEnd}>
            {feedTabs.map((tab) => (
              <View key={tab.key} style={{ width: windowWidth }}>
                {tab.key === 'subscription' ? (
                  <SubscriptionHome vegOnly={vegOnly} scrollY={scrollY} topInset={collapseDistance} />
                ) : tab.key === 'bulk' ? (
                  <View className="flex-1 px-5" style={{ paddingTop: collapseDistance + 24 }}>
                    <AppText variant="h2" className="text-foreground">
                      Large Orders
                    </AppText>
                    <AppText variant="body" className="mt-1 text-muted-foreground">
                      For events, offices, and get-togethers — pick a category to start.
                    </AppText>
                    <View className="mt-4 flex-row gap-3">
                      <BulkCategoryTile
                        category="meals"
                        onPress={() => router.push({ pathname: '/bulk-menu', params: { category: 'meals' } })}
                      />
                      <BulkCategoryTile
                        category="snacks"
                        onPress={() => router.push({ pathname: '/bulk-menu', params: { category: 'snacks' } })}
                      />
                      <BulkCategoryTile
                        category="foodbox"
                        onPress={() => router.push({ pathname: '/bulk-menu', params: { category: 'foodbox' } })}
                      />
                    </View>
                  </View>
                ) : tab.key === 'dinein' ? (
                  <DineInHome topInset={collapseDistance + 24} />
                ) : null}
              </View>
            ))}
          </Animated.ScrollView>
        ) : null}
      </View>

      {/* Hero — Lottie behind the transparent header + tabs. Absolute + clipped so
          collapsing never reflows the feed below. */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
          heroStyle,
        ]}>
        <LottieHero height={HERO_HEIGHT} />
        <SafeAreaView edges={['top']}>
          <HomeHeader
            addressLabel={label}
            loggedIn={loggedIn}
            cashback={cashback}
            onPressAddress={() => router.push('/addresses')}
            onPressCashback={() => router.push('/cashback')}
            onPressProfile={() => router.push('/profile')}
          />
          <Animated.View style={tabsStyle}>
            <HomeTabs
              tabs={orderTabs}
              activeKey={activeTab}
              feedTabCount={feedTabs.length}
              pagerProgress={pagerProgress}
              vegOnly={vegOnly}
              onSelect={selectTab}
              onToggleVeg={() => {
                setVegOnly((v) => !v);
                setVegPulse((n) => n + 1);
              }}
            />
          </Animated.View>
        </SafeAreaView>
      </Animated.View>

      {/* transient PURE VEG ON/OFF confirmation */}
      <VegModePulse on={vegOnly} trigger={vegPulse} />
    </View>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors in `(tabs)/index.tsx` or `HomeTabs.tsx`.

- [ ] **Step 3: Manual on-device check**

Run: `npm run android` (or `npx expo run:ios` if testing on iOS) against a dev client.
On the Home screen:
1. Confirm the tab band now renders as a dark frosted glass strip with icon+label
   pills and a white capsule under "Subscription".
2. Tap "Bulk" — the capsule should animate to it and the feed should show "Large
   Orders" content.
3. Swipe the feed left/right — the capsule should visibly track the swipe in real
   time (not just snap at the end), and the feed content should change pages.
4. If a Daily/Advance/Navmool shortcut is visible for your test cluster, tap it —
   it should still navigate to its own screen, and swiping should never reach it
   (swiping past the last feed tab should simply stop, not navigate).
5. Toggle "PURE VEG" — unchanged pulse/spring behavior should still work.
6. If the OS-level "Reduce Motion" setting is on, repeat steps 2–3 — the capsule
   should jump instantly instead of animating, and tapping a pill should jump the
   pager without a scroll animation.

Expected: all six checks pass. If step 3's capsule does not track the swipe in real
time (e.g. it only updates after the swipe completes), double check
`scrollEventThrottle={16}` is present on the `Animated.ScrollView` and that
`onPagerScroll` is passed to its `onScroll` prop — a missing/large throttle is the
most common cause of a laggy indicator.

**Contingency — if a page's internal vertical scroll fights the horizontal pager**
(e.g. dragging up/down inside `SubscriptionHome` or `DineInHome` occasionally pages
the feed sideways instead of scrolling): wrap the affected inner `ScrollView` with a
`NativeViewGestureHandler` from `react-native-gesture-handler` and give the outer
pager a matching ref via `simultaneousHandlers`/`waitFor` so the vertical gesture wins
first. This has not been needed in equivalent horizontal-pager-of-vertical-scrollviews
patterns elsewhere in Expo/RN, so only add it if the manual check above actually
reproduces the conflict — don't add it speculatively.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(tabs)/index.tsx"
git commit -m "feat: swipeable feed pager driving the HomeTabs capsule indicator"
```

---

### Task 4: Author the Maestro flow for tap + swipe tab switching

**Files:**
- Create: `.maestro/flows/home-tabs-swipe.yaml`

- [ ] **Step 1: Write the flow**

Per `docs/TESTING-WORKFLOW.md`, this flow is auth-gated (needs a real session with a
serviceable, Bulk+Dine-In-enabled cluster) so it's authored `# MANUAL` like the
existing `home-browse-subscription.yaml`:

```yaml
appId: com.mealawe.app
---
# MANUAL: requires an authenticated session with a serviceable delivery location set
# (see login-otp-flow.yaml + addresses-manage.yaml). Assumes app is already on the
# (tabs) home screen, Subscription tab active (the default), and the cluster has both
# Bulk and Dine In enabled (see HOME-02).
- assertVisible: "Choose your plan"
# Tap-to-switch still works (no swipe needed).
- tapOn: "Bulk"
- assertVisible: "Large Orders"
# Swipe back to Subscription.
- swipe:
    direction: RIGHT
- assertVisible: "Choose your plan"
# Swipe forward through Bulk into Dine In.
- swipe:
    direction: LEFT
- assertVisible: "Large Orders"
- swipe:
    direction: LEFT
- assertVisible: "Kitchen"
# Dine In is the last feed tab — swiping further left must not fall through to a
# shortcut tab's screen (Daily/Advance/Navmool stay tap-only, outside the pager).
- swipe:
    direction: LEFT
- assertVisible: "Kitchen"
```

- [ ] **Step 2: Verify**

This flow is `# MANUAL` (no staging OTP account exists yet, per
`docs/TESTING-WORKFLOW.md`) — there is nothing to run in CI. Confirm the YAML is
well-formed by running Maestro's syntax check if the CLI is installed:

Run: `maestro test --dry-run .maestro/flows/home-tabs-swipe.yaml` (skip this step if
the `maestro` CLI isn't installed locally — see `.maestro/README.md` for setup).
Expected: no YAML parse errors.

- [ ] **Step 3: Commit**

```bash
git add .maestro/flows/home-tabs-swipe.yaml
git commit -m "test: add Maestro flow for home tabs tap + swipe switching"
```

---

### Task 5: Add HOME-10..12 to the test-case catalogue and regenerate the workbook

**Files:**
- Modify: `scripts/generate-test-catalogue.mjs`

- [ ] **Step 1: Add the three rows**

In `scripts/generate-test-catalogue.mjs`, find the `Home` feature sheet array (the
block containing `'HOME-09'`) and add three new rows immediately after it:

```js
    ['HOME-10', 'Home', 'Swiping the home feed switches between feed tabs', 'Authenticated session, Bulk and Dine In both enabled for the cluster', 'On Home, swipe left/right across the feed', 'Feed content changes between Subscription/Bulk/Dine In and the capsule indicator follows', 'P1'],
    ['HOME-11', 'Home', 'Tapping a feed tab pill jumps directly to that tab', 'Authenticated session', 'Tap "Bulk" or "Dine In" pill without swiping', 'Feed jumps to the tapped tab immediately, capsule animates to match', 'P2'],
    ['HOME-12', 'Home', 'Swiping past the last feed tab does not trigger shortcut navigation', 'Authenticated session, Dine In is the last enabled feed tab', 'From Dine In, keep swiping left', 'Feed stays on Dine In; no navigation to Daily/Advance/Navmool screens occurs', 'P2'],
```

These match the `Home` sheet's existing 7-column shape (ID / Feature-Area / Title /
Preconditions / Steps / Expected Result / Priority) — the trailing Maestro-flow column
only exists on the separate `FULL_FLOW` (`E2E-xx`) sheet, not on feature sheets like
`Home`.

- [ ] **Step 2: Regenerate the workbook**

Run:
```bash
npm install --no-save exceljs
node scripts/generate-test-catalogue.mjs
```
Expected: `docs/TEST-CATALOGUE.xlsx` is rewritten with no errors, and its Summary
sheet's Home-area count increases by 3.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-test-catalogue.mjs docs/TEST-CATALOGUE.xlsx
git commit -m "test: catalogue HOME-10..12 for the swipeable home tabs pager"
```

---

### Task 6: Final build verification

**Files:** none (verification only)

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Full export build**

Run: `npx expo export --platform android -c`
Expected: build completes with no bundling errors (this is the project's standing
substitute for a unit-test suite — see root `CLAUDE.md`).

- [ ] **Step 3: Repeat the Task 3 Step 3 manual walkthrough once more end-to-end**

This confirms nothing regressed between Task 3 and the final commit (icon aliases,
catalogue changes, etc. don't touch runtime behavior, but it's a cheap final check).

- [ ] **Step 4: Commit** (only if Steps 1–3 turned up fixes; otherwise nothing to commit)

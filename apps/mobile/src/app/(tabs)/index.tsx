import { NavigationBar } from 'expo-navigation-bar';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, ToastAndroid, View, useColorScheme, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { IconApartment, IconMapPin, IconRepeat, IconShoppingBag, IconStore, IconUtensils } from '@/components/ui/icons';
import {
  ApartmentBulkComingSoon,
  ApartmentHome,
  resolveApartment,
  useApartmentCartStore,
  useApartmentEligibilityStore,
  useApartmentOrderTypeStore,
} from '@/features/apartment';
import { CouponCelebration } from '@/features/cart';
import { BulkHome } from '@/features/bulk';
import { DineInHome } from '@/features/dine-in';
import { OnDemandHome } from '@/features/on-demand';
import { HomeHeader } from '@/features/home/components/HomeHeader';
import { HomeBottomNav, type HomeTab } from '@/features/home/components/HomeBottomNav';
import { LottieHero } from '@/features/home/components/LottieHero';
import { NotServiceableHome } from '@/features/home/components/NotServiceableHome';
import { OutsideServiceAreaBanner } from '@/features/home/components/OutsideServiceAreaBanner';
import { RainBanner } from '@/features/home/components/RainBanner';
import { tabThemeFor } from '@/features/home/tabTheme';
import { useHeroLotties } from '@/features/home/useHeroLotties';
import { useScrollSolidHeader } from '@/features/home/useScrollSolidHeader';
import { useVisibleOrderModes } from '@/features/home/useVisibleOrderModes';
import { addressLabel } from '@/features/location/types';
import { BottomOverlayStack, useBottomCtaStore } from '@/features/orders';
import { resolveProfileImage } from '@/features/profile';
import { SubscriptionHome } from '@/features/subscription';
import { useBalances } from '@/features/wallet';
import { useScreenTracking } from '@/services/netcore';
import { useAuthStore, useClusterStore, useLocationStore } from '@/store';
import { useColors } from '@/theme';

/** Shortcut tabs that have no in-home feed of their own — selecting one
 * navigates straight to its (placeholder or real) screen instead of
 * swapping the feed body, mirroring how the old More hub's tiles behaved. */
const SHORTCUT_ROUTES: Partial<Record<string, string>> = {
  navmool: '/marketplace',
};

/** Tabs that own an in-home feed body and live in the (tap-only, non-swipeable)
 * pager. Every other tab in `orderTabs` is a tap-only shortcut (see
 * `SHORTCUT_ROUTES`). Apartment is a feed tab like every other one here —
 * it shares Home's hero/header band, its own content starting at its
 * search bar (see `ApartmentHome`), not a separate full-screen route. */
const FEED_TAB_KEYS = new Set(['subscription', 'bulk', 'dinein', 'ondemand', 'apartment', 'apartmentBulk']);

// Hero band: Lottie behind a transparent header. It collapses to just the
// address/profile strip on scroll. The band is absolute (out of the feed's layout)
// so its collapse never reflows the scrolling feed — that reflow was the glitch.
// Shorter than before now that the order-mode tabs live in a fixed bottom nav
// instead of floating inside this band.
// Taller on iOS: `collapsedHeight` below is `insets.top + 58`, and iOS's
// safe-area top inset (status bar + notch/Dynamic Island) runs well past
// Android's, eating into `collapseDistance` (the band's actual visible
// travel) at a fixed HERO_HEIGHT — the extra height here restores similar
// on-screen breathing room for the animation on iOS.
const HERO_HEIGHT = Platform.OS === 'ios' ? 400 : 325;
// Minimum scroll delta before toggling the system nav bar — avoids flicker from
// sub-pixel scroll jitter at rest.
const NAV_BAR_SCROLL_THRESHOLD = 4;

export default function HomeScreen() {
  useScreenTracking('home');

  const router = useRouter();
  // An empty-state "Browse" button elsewhere (a cart screen, etc.) can land
  // here wanting a specific order-mode tab active, not always the default
  // Subscription one — see the `selectTab(requestedTab)` effect below.
  const { tab: requestedTab } = useLocalSearchParams<{ tab?: string }>();
  const colors = useColors();
  const isDarkMode = useColorScheme() === 'dark';
  const profile = useAuthStore((s) => s.profile);
  const profilePhotoUri = resolveProfileImage(profile?.imageUrl);
  const currentAddress = useLocationStore((s) => s.current);
  const useCurrentLocation = useLocationStore((s) => s.useCurrentLocation);
  const clusters = useClusterStore((s) => s.clusters);
  const detectingCluster = useClusterStore((s) => s.detecting);
  const hasDetectedCluster = useClusterStore((s) => s.hasDetected);
  const detectClusters = useClusterStore((s) => s.detectClusters);
  const visibleOrderModes = useVisibleOrderModes();
  const showNavmool = useClusterStore((s) => s.showNavmool);
  const showRainyNotification = useClusterStore((s) => s.showRainyNotification);
  const { cashback } = useBalances();

  const isKota = useMemo(
    () => clusters.some((c) => (c.clusterName ?? '').toLowerCase().includes('kota')),
    [clusters],
  );
  const heroLotties = useHeroLotties();
  // Which Apartment sub-mode's hero slot to show — only read/relevant while
  // `activeTab === 'apartment'` (see `tabThemeFor`'s own doc comment), but
  // cheap to subscribe to unconditionally here.
  const apartmentOrderType = useApartmentOrderTypeStore((s) => s.orderType);

  const [activeTab, setActiveTab] = useState('subscription');
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set(['subscription']));
  // Bumped by NotServiceableHome's "Bring Mealawe Here" tap, to re-fire
  // CouponCelebration below — kept here (rather than inside
  // NotServiceableHome itself) because `onRetry` re-runs cluster detection,
  // which flips `detectingCluster` true almost immediately and unmounts
  // NotServiceableHome (see `outsideServiceArea` below) well before a
  // ~1.3s celebration animation can finish; this component doesn't unmount
  // when that happens, so the nudge survives regardless of which branch
  // below is currently rendering.
  const [requestNudge, setRequestNudge] = useState(0);
  // Bumped when the already-active feed tab is tapped again — each feed
  // scrolls itself back to the top in response (see `scrollToTopSignal` prop).
  const [scrollToTopSignal, setScrollToTopSignal] = useState(0);
  // Which bottom-nav LAYOUT is showing — independent of `activeTab`. Starts
  // undrilled (main-bar + Apartment pill); switches to the Home+order-type-
  // tabs layout once the Apartment pill is explicitly tapped (see
  // `selectTab`), and back once Home is tapped.
  const [navDrilledIn, setNavDrilledIn] = useState(false);
  // Tell BottomOverlayStack which tab's CTA slot to read — a feed that isn't
  // active keeps its last-pushed CTA in the store (its page stays mounted,
  // per `visitedTabs`), but only the active tab's slide should ever show.
  useEffect(() => {
    useBottomCtaStore.getState().setActiveOwnerKey(activeTab);
  }, [activeTab]);

  // Home is the root of the tab stack — Android's default hardware-back
  // behavior here is to exit the app immediately, on a single press. Require
  // a second press within 2s instead (the standard "press back again to
  // exit" pattern), so one accidental/muscle-memory back tap doesn't dump
  // the user out of the app. iOS has no hardware back button, so this is a
  // no-op there — `BackHandler` itself is Android-only.
  //
  // `useFocusEffect` (not `useEffect`) is load-bearing here, not
  // stylistic: Expo Router keeps this tab-root screen mounted in the
  // background when navigating to any other screen (cart, profile,
  // subscription-plan, ...), so a plain `useEffect([])` registers this
  // listener once and never tears it down — it kept intercepting back
  // presses on every other screen in the app too, not just Home. Wrapping
  // it in `useFocusEffect` adds the listener only while Home is actually
  // the focused screen and removes it the moment focus leaves, so every
  // other screen's back button goes back to its normal single-press
  // behavior.
  const lastBackPressRef = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') {
        return;
      }
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          BackHandler.exitApp();
          return true;
        }
        lastBackPressRef.current = now;
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const scrollY = useSharedValue(0);
  // Drives how far the hero + feed shift down while the rain banner is
  // visible — see RainBanner's `heightValue` prop. Animates `top` (with
  // `bottom` pinned) rather than a translateY, so the wrapper's own box
  // shrinks to make room instead of sliding — a translateY here would leave
  // its unmoved bottom edge exposing bare background past the shifted
  // content once the wrapper visually moved down.
  const rainBannerHeight = useSharedValue(0);
  // Same idea, for the outside-service-area banner below. The two banners
  // can't be visible at once in practice (a cluster's `showRainyNotification`
  // flag only ever resolves non-null for an address that IS serviceable —
  // see clusterStore.detectClusters), so simply summing them is safe without
  // needing to stack their positions.
  const outsideAreaBannerHeight = useSharedValue(0);
  const rainPushStyle = useAnimatedStyle(() => ({
    top: rainBannerHeight.value + outsideAreaBannerHeight.value,
  }));
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
  const { backdropStyle, solid: headerSolid } = useScrollSolidHeader(scrollY, collapseDistance);

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

  // Stable identity — ApartmentHome's CTA-push effect (the one that keeps
  // the "View order" rib's item count/price/kitchen in sync) depends on
  // this callback. Passed inline before, it was a NEW function every single
  // render of THIS screen (scroll updates, rain banner, ...), which doesn't
  // cause a staleness bug (the effect still fires with fresh values every
  // time) but did make it re-run far more often than any actual cart
  // change — wasted `setCta` calls with identical results.
  const goToApartmentCart = useCallback(() => router.push('/apartment-cart'), [router]);

  // Enhancement (mirrors the legacy Ionic app's own `showApartment` flag —
  // `tabs.page.ts`'s `getNearestApartment` check): whether apartment
  // ordering exists at the CURRENT location, resolved here — at the
  // always-mounted Home screen level — rather than inside `ApartmentHome`
  // itself, since that only mounts once the tab is first visited
  // (`visitedTabs`, below) and the floating "Apartment" pill's own
  // visibility needs an answer BEFORE the resident ever taps in, not after.
  // Written into the shared `useApartmentEligibilityStore` so `ApartmentHome`
  // reads the SAME resolution instead of running its own second one.
  const apartmentEligibility = useApartmentEligibilityStore((s) => s.apartment);
  const setApartmentEligibility = useApartmentEligibilityStore((s) => s.setApartment);
  useEffect(() => {
    const geo = currentAddress?.geolocation;
    // `{lat:0, lng:0}` is locationStore's `savedFromProfile` sentinel for "this
    // saved address never actually had a geo field" (see ApartmentHome's own
    // original comment on this exact check) — treated the same as no geo at
    // all rather than calling resolveApartment(0, 0), which always
    // "resolves" to nothing.
    if (!geo || (geo.lat === 0 && geo.lng === 0)) {
      setApartmentEligibility(null);
      return;
    }
    let active = true;
    void resolveApartment(geo.lng, geo.lat)
      .then((res) => {
        if (active) setApartmentEligibility(res);
      })
      .catch(() => {
        // Bug fix (see `resolveApartment`'s own doc comment): a REAL request
        // failure now rejects instead of resolving to `null` — deliberately
        // a no-op here, not `setApartmentEligibility(null)`. The resident's
        // location hasn't actually changed just because one request blipped,
        // so the last-known-good eligibility (and whatever `ApartmentHome`
        // is currently showing) stays exactly as it was rather than getting
        // wrongly blanked/force-navigated-away by a transient network hiccup.
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAddress?.geolocation?.lat, currentAddress?.geolocation?.lng]);

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

  // Safety net: the app's own boot-time cluster detection (`_layout.tsx`,
  // right after auth hydrates) is a fire-and-forget call racing the same
  // hydration against this screen's own mount/redirect — on some boots this
  // screen can render before that call has even started, which (before
  // `hasDetected` existed) read identically to "checked, found nothing" and
  // could show a real user in a serviceable area a false "not serviceable"
  // page. This guarantees detection gets a genuine chance to run for the
  // current address from this screen too, without relying solely on that
  // other call's timing. Only fires once per session — `hasDetectedCluster`
  // flips permanently true the first time any detection resolves, so this
  // never re-fires on a later address change (those already trigger their
  // own detection via `setCurrent`).
  useEffect(() => {
    if (currentAddress?.geolocation && !hasDetectedCluster && !detectingCluster) {
      void detectClusters(currentAddress.geolocation);
    }
  }, [currentAddress, hasDetectedCluster, detectingCluster, detectClusters]);

  const loggedIn = !!profile;
  const label = addressLabel(currentAddress);
  // Only flag "outside our delivery area" once there's an address to judge
  // AND detection has genuinely completed at least once for this session —
  // `hasDetectedCluster` is the piece that distinguishes "detection hasn't
  // run yet" from "ran and found nothing" (see clusterStore's own comment on
  // that field); `!detectingCluster` alone can't tell those apart, since it's
  // equally true before the first attempt as it is after a real empty result.
  const outsideServiceArea =
    !!currentAddress && hasDetectedCluster && !detectingCluster && clusters.length === 0;

  // Cluster-aware order modes: every entry is gated by its own server-side
  // cluster-config flag (mirrors mealaweApp's FeatureFlagsService — a flat
  // filtered list, one boolean per vertical, not a generic per-entry
  // resolver) — see `useVisibleOrderModes` for the exact fallback rules per
  // flag, shared with "My Orders" (`my-orders.tsx`) so the two screens can't
  // silently drift apart on which verticals a cluster actually offers. This
  // replaces the old "More" tab — every secondary vertical now lives as its
  // own shortcut in this same horizontally scrollable row instead of being
  // buried a tap deeper. Feed tabs (Subscription/Bulk/Dine In/On Demand)
  // always come first so their order matches the pager's page order — see
  // `FEED_TAB_KEYS`.
  const orderTabs = useMemo<HomeTab[]>(() => {
    const tabs: HomeTab[] = [];
    // Bug fix: `visibleOrderModes` falls back to visible/`true` for
    // subscription/bulk while their cluster-config flag is still `null` —
    // deliberately, per that hook's own doc, so they don't flicker hidden
    // during the brief window before a REAL cluster's config resolves. But
    // `outsideServiceArea` means there's no cluster at all (`clusters` is
    // empty), so those same flags are ALSO `null` here, and that same
    // fallback incorrectly showed Subscription/Bulk (plus Dine In/On
    // Demand) for an address with no serviceable cluster whatsoever — none
    // of those cluster-based verticals apply outside every cluster; only
    // the apartment fallback below (`apartmentBulk`/`apartment`) can.
    if (!outsideServiceArea) {
      if (visibleOrderModes.has('subscription')) {
        tabs.push({ key: 'subscription', label: 'Subscription', icon: IconRepeat });
      }
      if (visibleOrderModes.has('bulk')) {
        tabs.push({ key: 'bulk', label: 'Bulk', icon: IconShoppingBag });
      }
      if (visibleOrderModes.has('dinein')) {
        tabs.push({ key: 'dinein', label: 'Dine In', icon: IconUtensils });
      }
      if (visibleOrderModes.has('ondemand')) {
        tabs.push({ key: 'ondemand', label: 'On Demand', icon: IconUtensils });
      }
    }
    if (outsideServiceArea && apartmentEligibility) {
      tabs.push({ key: 'apartmentBulk', label: 'Bulk', icon: IconShoppingBag });
    }
    // Bug fix (this entry itself is deliberately NEVER gated on
    // eligibility): this entry never actually controlled a visible
    // tab-bar icon in the first place (`HomeBottomNav`'s own `mainTabs`
    // filter already excludes 'apartment', it's rendered as a separate
    // always-mounted floating pill instead — see below). Its ONLY real
    // effect is on `feedTabs`, which drives the PAGER — so excluding it
    // here while eligibility was still resolving (or genuinely false)
    // would mean tapping the pill (were it visible) could call
    // `goToTab('apartment')` against a pager with no such page, silently
    // no-oping the scroll (see `goToFeedTab`'s own `index === -1` guard)
    // while `activeTab`/`navDrilledIn` still flipped — exactly a
    // "home content stuck, but apartment's own bottom tabs showing" desync.
    // 'apartment' ALWAYS stays a valid pager page so that navigation can
    // never break this way. The eligibility gate itself lives ONLY at the
    // pill's own visibility (`apartmentVisible`, computed from
    // `useApartmentEligibilityStore`, passed to `HomeBottomNav` below) plus
    // the forced-navigate-away effect further down — never here.
    tabs.push({ key: 'apartment', label: 'Apartment', icon: IconApartment });
    // Navmool shortcut disabled for now (commented out, not removed — restore
    // by uncommenting once Navmool is ready to ship again).
    // if (showNavmool === true) {
    //   tabs.push({ key: 'navmool', label: 'Navmool', icon: IconStore });
    // }
    return tabs;
  }, [visibleOrderModes, outsideServiceArea, apartmentEligibility]);

  const feedTabs = useMemo(() => orderTabs.filter((tab) => FEED_TAB_KEYS.has(tab.key)), [orderTabs]);

  function goToFeedTab(key: string, animated: boolean) {
    const index = feedTabs.findIndex((tab) => tab.key === key);
    if (index === -1) return;
    pagerRef.current?.scrollTo({ x: index * windowWidth, y: 0, animated });
  }

  function markTabVisited(key: string) {
    setVisitedTabs((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }

  // Re-sync the pager's physical scroll position whenever `feedTabs` changes
  // shape at runtime (a cluster-config flag flips mid-session). Two cases,
  // one fix: if the active tab was removed entirely, fall back to the first
  // remaining feed tab. Otherwise the active tab is still present but may now
  // sit at a DIFFERENT index (an earlier tab was removed/inserted) — the
  // ScrollView's offset still reflects the OLD index, which under the new
  // mapping points at a different tab's page, desyncing the visible feed
  // from `activeTab`. Re-scrolling to the active tab's current
  // index (even when it didn't change) is a cheap no-op in the common case
  // and closes the gap in the shifted-index case.
  useEffect(() => {
    if (feedTabs.length === 0) return;
    const stillPresent = feedTabs.some((tab) => tab.key === activeTab);
    const targetKey = stillPresent ? activeTab : feedTabs[0].key;
    if (!stillPresent) {
      setActiveTab(targetKey);
      markTabVisited(targetKey);
    }
    goToFeedTab(targetKey, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedTabs]);

  function goToTab(key: string) {
    if (key === activeTab) {
      // Already there — scroll the feed back to the top instead of a no-op.
      setScrollToTopSignal((n) => n + 1);
      return;
    }
    setActiveTab(key);
    markTabVisited(key);
    goToFeedTab(key, !reducedMotion);
    // Bug fix ("scroll one tab, switch tabs, hero/Lottie stays hidden"):
    // `scrollY` is ONE shared value every tab's own ScrollView writes into
    // (see each Home component's `onScroll`) and the hero's collapse
    // animation reads from — it only gets overwritten on the ACTIVE tab's
    // next real scroll event. Switching to a different tab used to leave it
    // holding whatever offset the tab you just left was scrolled to, so the
    // hero (and its Lottie) stayed collapsed on the new tab — even though
    // that tab's own content was sitting at the top — until it was scrolled
    // again. Snap it back to 0 immediately on every tab switch, and reuse
    // the same "scroll feed to top" signal the re-tap case already bumps so
    // the destination tab's own scroll position stays in sync with it.
    scrollY.value = 0;
    setScrollToTopSignal((n) => n + 1);
  }

  function selectTab(key: string) {
    // Sentinel from HomeBottomNav's "Home" button (drilled-in mode) — not a
    // real tab key, so it's resolved here rather than in the nav component.
    if (key === '__home__') {
      setNavDrilledIn(false);
      // Leaving Apartment always empties its cart (product decision — unlike
      // an in-flow kitchen/order-type switch, which still raises the
      // conflict modal instead of silently discarding the current order).
      useApartmentCartStore.getState().reset();
      goToTab(orderTabs.find((tab) => tab.key !== 'apartment')?.key ?? 'subscription');
      return;
    }
    const route = SHORTCUT_ROUTES[key];
    if (route) {
      router.push(route as Parameters<typeof router.push>[0]);
      return;
    }
    if (key === 'apartment') {
      setNavDrilledIn(true);
    }
    goToTab(key);
  }

  // Honor a `?tab=` param from an external "Browse" link (e.g. an empty
  // cart's own tab's browse button — `router.replace('/(tabs)', { params:
  // { tab: 'bulk' } })`) by switching to that tab once it's a real,
  // currently-visible one. Only depends on `requestedTab`/`orderTabs`
  // (not `activeTab`), so it fires once per navigation here and never
  // fights a manual tab switch the user makes afterward.
  useEffect(() => {
    if (requestedTab && orderTabs.some((tab) => tab.key === requestedTab)) {
      selectTab(requestedTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedTab, orderTabs]);

  // Enhancement: mirrors the legacy Ionic app's own forced-navigation
  // safety net (`tabs.page.ts`'s `setSelectTab` — `shouldAutoNavigate =
  // currentActualTab === 'tabApartment' && !this.showApartment`) — if the
  // resident is ALREADY on the Apartment tab when a location change makes
  // it newly ineligible (moved out of the complex's service area, switched
  // to a non-apartment saved address, ...), send them back to Home rather
  // than leaving them stranded on a tab whose own entry pill just
  // disappeared. Goes through `selectTab('__home__')` — the SAME path the
  // Home pill itself uses — so `navDrilledIn`/the apartment cart reset the
  // exact same way, never a partial/ad-hoc version of that logic.
  const lastForceNavRef = useRef(0);
  useEffect(() => {
    if (apartmentEligibility === null && activeTab === 'apartment') {
      const now = Date.now();
      if (now - lastForceNavRef.current < 2000) return;
      lastForceNavRef.current = now;
      selectTab('__home__');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apartmentEligibility, activeTab]);

  // Outside every serviceable cluster: replace the whole hero/order-mode-tabs/
  // feed tree with a dedicated "not here yet" page instead of showing a
  // banner over content none of which is actually orderable. A ternary
  // inside one `return` (not two separate `if`/`return` statements) so none
  // of the animation/pager/cluster-fetch state above is disturbed if the
  // user later moves into a serviceable area and this flips back.
  // `CouponCelebration` is rendered exactly once, outside this ternary, so
  // it's the same child at the same position in every render regardless of
  // which branch below is active — critical, because `onRetry` (called
  // right after `onRequestSent` bumps the trigger) flips `outsideServiceArea`
  // moments later by design. Two *separate* `return` statements each with
  // their own `<CouponCelebration>` looked equivalent but weren't: React
  // remounts a fresh instance when the branch swaps, and that fresh
  // instance's mount-time effect replays the still-nonzero `trigger`,
  // showing the nudge a second time.
  //
  // Bug fix: this used to gate on `outsideServiceArea` alone — blocking with
  // this "not here yet" page even when the address IS usable via the
  // apartment fallback (`orderTabs`'s own `apartmentBulk`/`apartment` push
  // above already accounts for exactly this combination: outside every
  // regular cluster BUT still apartment-eligible). Only genuinely block
  // when there's no apartment fallback either.
  return (
    <>
      {outsideServiceArea && apartmentEligibility === null ? (
        <NotServiceableHome
          addressLabel={label}
          onPressAddress={() => router.push('/addresses')}
          onOrders={() => router.push('/my-orders')}
          onHelp={() => router.push('/help')}
          onFeedback={() => router.push('/feedback')}
          onRetry={useCurrentLocation}
          onRequestSent={() => setRequestNudge((n) => n + 1)}
        />
      ) : (
    <View className="flex-1 bg-background">
      {/* Over the hero, always light (white) — that backdrop is always dark/colorful
          regardless of app theme. Once solid, the backdrop is `colors.card`, which
          flips light/dark with the color scheme, so the icon color has to follow it
          too — hardcoding 'dark' here (as before) left white-on-dark-card status bar
          icons unreadably close to invisible in dark mode. */}
      <StatusBar style={headerSolid ? (isDarkMode ? 'light' : 'dark') : 'light'} />

      {/* Hero + feed, together — shifted down while the rain banner is visible
          (see rainBannerHeight/rainPushStyle) so the banner pushes the layout
          down and "makes space for itself" instead of floating over it. */}
      <Animated.View
        pointerEvents="box-none"
        style={[{ position: 'absolute', left: 0, right: 0, bottom: 0 }, rainPushStyle]}>
        {/* Feed — fills the screen from the collapsed-hero line down. A horizontal
            pager over the feed tabs, tap-only (no swipe — see HomeBottomNav); this
            also stops the pager from stealing horizontal gestures from
            nested horizontal lists like the On Demand kitchen grid. Shortcut
            tabs (Navmool) have no page here and are tap-only from the bottom nav. */}
        <View style={{ position: 'absolute', top: collapsedHeight, left: 0, right: 0, bottom: 0 }}>
          {feedTabs.length > 0 ? (
            <Animated.ScrollView ref={pagerRef} horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false}>
              {feedTabs.map((tab) => {
                // Unvisited pages render as a same-width empty placeholder so
                // paging math (`index * windowWidth`) stays correct, but their
                // real body — and its data-fetching effects — never mounts
                // until the user actually reaches that page.
                if (!visitedTabs.has(tab.key)) {
                  return <View key={tab.key} style={{ width: windowWidth }} />;
                }
                return (
                  <View key={tab.key} style={{ width: windowWidth }}>
                    {tab.key === 'subscription' ? (
                      <SubscriptionHome
                        scrollY={scrollY}
                        topInset={collapseDistance}
                        scrollToTopSignal={scrollToTopSignal}
                      />
                    ) : tab.key === 'bulk' ? (
                      <BulkHome
                        scrollY={scrollY}
                        topInset={collapseDistance}
                        scrollToTopSignal={scrollToTopSignal}
                      />
                    ) : tab.key === 'dinein' ? (
                      <DineInHome
                        topInset={collapseDistance + 24}
                        scrollY={scrollY}
                        scrollToTopSignal={scrollToTopSignal}
                      />
                    ) : tab.key === 'ondemand' ? (
                      <OnDemandHome scrollY={scrollY} topInset={collapseDistance} />
                    ) : tab.key === 'apartmentBulk' ? (
                      apartmentEligibility ? (
                        <ApartmentBulkComingSoon apartment={apartmentEligibility} topInset={collapseDistance} />
                      ) : null
                    ) : tab.key === 'apartment' ? (
                      <ApartmentHome
                        scrollY={scrollY}
                        topInset={collapseDistance}
                        onGoToCart={goToApartmentCart}
                        onGoHome={() => selectTab('__home__')}
                        onRequireLogin={() => router.push('/apartment-order-login-required')}
                      />
                    ) : null}
                  </View>
                );
              })}
            </Animated.ScrollView>
          ) : null}
        </View>

        {/* Hero — Lottie behind the transparent header. Absolute + clipped so
            collapsing never reflows the feed below. Tint + animation follow the
            active order-mode tab (see tabTheme.ts). */}
        <Animated.View
          pointerEvents="box-none"
          style={[
            { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
            heroStyle,
          ]}>
          <LottieHero
            // Remounts on tab change so every internal slide/scroll position
            // resets — otherwise switching tabs kept the previous tab's
            // in-carousel `index`, and the effect that resets+plays a slide
            // is keyed on that `index` changing, so a same-index swap (e.g.
            // both tabs sitting on their first slide) silently skipped the
            // reset and the new tab's animation never restarted from frame 0.
            // Also remounts on `apartmentOrderType` while on the Apartment
            // tab — switching Instant/Today/Advance swaps to a DIFFERENT
            // hero slot (`tabThemeFor`'s `apartment_${orderType}` lookup),
            // same "reset every internal position on a source swap" reasoning.
            key={`${isKota ? `${activeTab}-kota` : activeTab}${activeTab === 'apartment' ? `-${apartmentOrderType}` : ''}`}
            height={HERO_HEIGHT}
            tint={tabThemeFor(activeTab, isKota, heroLotties, apartmentOrderType).accent}
            sources={tabThemeFor(activeTab, isKota, heroLotties, apartmentOrderType).lotties}
          />
          {/* Fades in a solid backdrop behind the header row as the hero
              finishes collapsing — without this the header sits directly over
              (shrunk, still-visible) animation at every scroll position. */}
          <Animated.View
            pointerEvents="none"
            style={[
              { position: 'absolute', top: 0, left: 0, right: 0, height: collapsedHeight, backgroundColor: colors.card },
              backdropStyle,
            ]}
          />
          <SafeAreaView edges={['top']}>
            <HomeHeader
              addressLabel={label}
              loggedIn={loggedIn}
              cashback={cashback}
              solid={headerSolid}
              photoUri={profilePhotoUri}
              onPressAddress={() => router.push('/addresses')}
              onPressCashback={() => router.push('/cashback')}
              onPressProfile={() => router.push('/profile')}
            />
          </SafeAreaView>
        </Animated.View>
      </Animated.View>

      {/* Rain notification — cluster-config gated, plays once per session
          (see RainBanner). Pushes the hero + feed above down via
          rainBannerHeight instead of floating over them. */}
      <RainBanner active={showRainyNotification} heightValue={rainBannerHeight} />

      {/* Outside-service-area notice — up for as long as the active address
          resolves to zero clusters, with a direct way to change it. Pushes
          the hero + feed down the same way RainBanner does.
          Bug fix: this used to fire on `outsideServiceArea` alone, same gap
          the full-page block below already had — a resident outside every
          regular cluster but still Apartment-eligible would see this "we
          don't deliver here" banner sitting right above the (fully working)
          Apartment content, contradicting it. Matches the same
          `apartmentEligibility === null` condition used for the full block. */}
      <OutsideServiceAreaBanner
        active={outsideServiceArea && apartmentEligibility === null}
        heightValue={outsideAreaBannerHeight}
        onChangeLocation={() => router.push('/addresses')}
      />

      {/* today's open orders + the active tab's CTA, combined into one
          swipeable slot (see BottomOverlayStack) */}
      <BottomOverlayStack />

      {/* order-mode tabs — fixed floating pill, the app's primary nav on Home */}
      <HomeBottomNav
        tabs={orderTabs}
        activeKey={activeTab}
        onSelect={selectTab}
        drilledIn={navDrilledIn}
        // Hidden only once eligibility is DEFINITIVELY resolved to "no
        // apartment here" (`null`) — visible while still resolving
        // (`undefined`) or once available, so a resident who IS in a
        // serviced complex never sees the pill flash in then disappear.
        apartmentVisible={apartmentEligibility !== null}
      />

      {/* Solid backdrop for the true bottom edge — Android's edge-to-edge
          system nav bar strip is transparent by OS design (apps can't paint
          a background behind it directly), so without this, whatever's
          scrolled to the bottom of the feed shows through it. Only visually
          obvious over colorful content (On Demand kitchen photos, Dine In
          package art), which is why it read as "fine on Subscription, wrong
          on On Demand/Dine In" — same underlying gap on every tab. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: insets.bottom,
          backgroundColor: colors.background,
        }}
      />
    </View>
      )}
      <CouponCelebration
        trigger={requestNudge}
        title="Request received!"
        subtitle="We've noted your interest — we'll be there soon."
        icon={IconMapPin}
        tone="location"
      />
    </>
  );
}

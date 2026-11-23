import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// Aliased: core RN's Animated (search placeholder crossfade), distinct from reanimated's default import below (scroll handling).
import { ActivityIndicator, Animated as RNAnimated, Easing, Image, Pressable, TextInput, View, type FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedScrollHandler, type SharedValue } from 'react-native-reanimated';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { IconFilter, IconSearch, IconUtensils } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { useBottomCtaStore, useBottomStackClearance } from '@/features/orders';
import { useAuthStore, useLocationStore } from '@/store';
import { accentTint, FONT_FAMILY, palette, shadow, useApartmentColors, useColors } from '@/theme';
import { formatINR } from '@/utils/currency';

import { loadApartmentCatalog, type ApartmentCatalogFilters } from '../catalog';
import { loadApartmentConfig, type ApartmentConfig } from '../config';
import { useApartmentOrderTypeStore } from '../orderTypeStore';
import { filterDishes, isDishBlocked } from '../pricing';
import type { ApartmentDish, ApartmentKitchen, MealType } from '../types';
import { useApartmentCartStore } from '../useApartmentCartStore';
import { useApartmentEligibilityStore } from '../useApartmentEligibilityStore';
import { ApartmentAddSheet } from './ApartmentAddSheet';
import { ApartmentCategoryPills } from './ApartmentCategoryPills';
import { ApartmentConflictModal } from './ApartmentConflictModal';
import { ApartmentDishCard } from './ApartmentDishCard';
import { ApartmentFilterModal, type ApartmentDeliveryType, type ApartmentDiet } from './ApartmentFilterModal';

interface ApartmentHomeProps {
  /** Top padding so content starts below the home hero band, same as other feed tabs. */
  topInset?: number;
  /** Shared scroll offset so the home hero can collapse as this feed scrolls. */
  scrollY?: SharedValue<number>;
  onGoToCart: () => void;
  /** Navigates back Home the same way the bottom nav's Home pill does. */
  onGoHome: () => void;
  /** Pushed instead of opening the add-to-cart sheet when a guest taps "Add" — browsing stays open to everyone, starting an order doesn't. */
  onRequireLogin: () => void;
}

/** One row of this screen's virtualized flat list content (avoids mounting every dish card at once). */
type Row =
  | { type: 'loadingBand'; key: 'loadingBand' }
  | { type: 'pills'; key: 'pills' }
  | { type: 'searchRow'; key: 'searchRow' }
  | { type: 'searchResultsHeader'; key: 'searchResultsHeader' }
  | { type: 'skeleton'; key: 'skeleton' }
  | { type: 'emptyNotAvailable'; key: 'emptyNotAvailable' }
  // `genuinelyEmpty` distinguishes "nothing available at all" (gets the image + Go Home CTA) from a search/filter narrowed to nothing (stays text-only).
  | { type: 'emptyFiltered'; key: 'emptyFiltered'; title: string; message: string; genuinelyEmpty: boolean }
  | { type: 'priorityHeader'; key: 'priorityHeader' }
  | { type: 'divider'; key: 'divider' }
  // Up to 2 cards per row (2-column grid, pre-chunked); topGap is precomputed per-row spacing.
  | { type: 'cards'; key: string; dishes: ApartmentDish[]; topGap: number };

/** The Apartment tab's feed body (hero/header above it is shared with Subscription/On Demand): cuisine pills, search + filter row, dish grid, add sheet, filter modal, conflict modal. */
export function ApartmentHome({ topInset = 0, scrollY, onGoToCart, onGoHome, onRequireLogin }: ApartmentHomeProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const profile = useAuthStore((s) => s.profile);
  // Theme-aware palette for this screen's search bar/filter button/headers/empty states.
  const { colors: apartmentColors, orderType: orderTypeColors } = useApartmentColors();
  const bottomStackClearance = useBottomStackClearance();
  const address = useLocationStore((s) => s.current);

  // Shared store: one location-based resolution feeds both this screen and the bottom nav's Apartment pill visibility.
  const apartment = useApartmentEligibilityStore((s) => s.apartment);
  // The Today/Instant/Advance switcher lives in the fixed bottom bar, not inline here.
  const orderType = useApartmentOrderTypeStore((s) => s.orderType);
  // Per-order-type accent, matching the filter popup and dish cards so the filter button's color never mismatches the popup it opens.
  const tone = orderTypeColors[orderType];
  const [search, setSearch] = useState('');
  // Debounced for the catalog fetch (server-side search); `search` itself stays un-debounced for the input and "Search results" header.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);
  const [dishes, setDishes] = useState<ApartmentDish[]>([]);
  // Kept independent of `dishes` so the filter modal's kitchen checklist doesn't lose a kitchen just because its last matching dish got filtered out.
  const [kitchens, setKitchens] = useState<ApartmentKitchen[]>([]);
  // Backs FlatList's onEndReached pagination below. pageRef (not state) avoids a stale closure read inside loadMore; reset to 1 on every fresh fetch.
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef(1);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ApartmentConfig | null>(null);
  const [sheetDish, setSheetDish] = useState<ApartmentDish | null>(null);
  // Bumped on every openSheet call (even reopening the same dish) so the add-sheet's own reset effect always sees a fresh "open just happened" signal.
  const [sheetOpenSeq, setSheetOpenSeq] = useState(0);
  // Keeps the open sheet's dish snapshot synced to live `dishes` so slot/cutoff state doesn't go stale.
  useEffect(() => {
    if (!sheetDish) return;
    const fresh = dishes.find((d) => d.key === sheetDish.key);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fresh && fresh !== sheetDish) setSheetDish(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dishes]);
  // Ticks once a minute while Today/Instant is active, re-checking clock-driven cutoffs that nothing else would otherwise re-trigger.
  const [todayRefreshTick, setTodayRefreshTick] = useState(0);
  useEffect(() => {
    if (orderType !== 'today' && orderType !== 'instant') return;
    const t = setInterval(() => setTodayRefreshTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [orderType]);

  const cartLines = useApartmentCartStore((s) => s.lines);
  const cartMeta = useApartmentCartStore((s) => s.meta);
  const conflict = useApartmentCartStore((s) => s.conflict);
  const startNewOrder = useApartmentCartStore((s) => s.startNewOrder);
  const dismissConflict = useApartmentCartStore((s) => s.dismissConflict);

  const addSheetRef = useRef<BottomSheetModal>(null);
  const listRef = useRef<FlatList<Row>>(null);
  // Scrolls to top when a "priority kitchen" section first appears, so the reorganized grid is visible.
  const priorityKitchenIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (cartMeta?.kitchenId && cartMeta.kitchenId !== priorityKitchenIdRef.current) {
      // Deferred a frame so the scroll happens after rows' own structural change commits (avoids racing Fabric and crashing on Android).
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
    }
    priorityKitchenIdRef.current = cartMeta?.kitchenId ?? null;
  }, [cartMeta?.kitchenId]);

  const onScroll = useAnimatedScrollHandler((e) => {
    // eslint-disable-next-line react-hooks/immutability
    if (scrollY) scrollY.value = e.contentOffset.y;
  });

  useEffect(() => {
    void loadApartmentConfig().then(setConfig);
  }, []);

  // Clears a stale cart when the resolved apartment complex genuinely changes; a tweak resolving to the same complex is a no-op.
  useEffect(() => {
    if (apartment === undefined) return;
    const meta = useApartmentCartStore.getState().meta;
    if (meta && meta.apartmentId !== apartment?.apartmentId) {
      useApartmentCartStore.getState().reset();
    }
  }, [apartment]);

  // "Refine your menu" filter state — all server-side filters, no sort/price control by design.
  const [diet, setDiet] = useState<ApartmentDiet>('any');
  const [deliveryType, setDeliveryType] = useState<ApartmentDeliveryType>('any');
  const [kitchenFilter, setKitchenFilter] = useState<Set<string>>(new Set());
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  // Today-only meal-slot filter, lives inside the filter modal; `filtered` below re-applies it locally so the grid updates instantly rather than flashing the old slot.
  const [mealSlotFilter, setMealSlotFilter] = useState<MealType | 'all'>('all');
  const toggleKitchenFilter = (kitchenId: string) => {
    setKitchenFilter((prev) => {
      const next = new Set(prev);
      if (next.has(kitchenId)) next.delete(kitchenId);
      else next.add(kitchenId);
      return next;
    });
  };
  const clearFilters = () => {
    setDiet('any');
    setDeliveryType('any');
    setKitchenFilter(new Set());
    setSelectedCuisine(null);
    setMealSlotFilter('all');
    // "Clear all" also closes the popup (deliberate deviation from the reference design).
    setFilterModalOpen(false);
  };
  const filterCount =
    (selectedCuisine ? 1 : 0) +
    kitchenFilter.size +
    (deliveryType !== 'any' ? 1 : 0) +
    (diet !== 'any' ? 1 : 0) +
    (orderType === 'today' && mealSlotFilter !== 'all' ? 1 : 0);

  // Distinguishes a real change from a background clock tick with nothing else different.
  const hardDepsKeyRef = useRef<string | null>(null);
  // Perf fix ("switching order-type tabs calls the API again and re-populates
  // everything, every time — even flipping straight back to a tab just
  // left"): each (apartment, orderType, filters) combo's last successful
  // page-1 result is cached here. Revisiting one now restores instantly (no
  // skeleton, no blank list) while a background refetch still quietly
  // updates it — the same non-disruptive path already used for the
  // once-a-minute clock tick, just triggered by "seen this combo before"
  // instead of "identical to the immediately-prior one." Capped so cycling
  // through many filter combos in one session can't grow this unboundedly.
  const CATALOG_CACHE_LIMIT = 12;
  const catalogCacheRef = useRef<Map<string, { dishes: ApartmentDish[]; kitchens: ApartmentKitchen[]; hasMore: boolean }>>(new Map());

  useEffect(() => {
    const geo = address?.geolocation;
    const hardDepsKey = JSON.stringify({
      apartmentId: apartment?.apartmentId,
      orderType,
      debouncedSearch,
      diet,
      deliveryType,
      kitchenFilter: Array.from(kitchenFilter),
      selectedCuisine,
      mealSlotFilter,
    });
    // A tick-only re-fire (todayRefreshTick, nothing else changed) must not flash the skeleton once a minute mid-browse; only a real change (or first run) does.
    const isBackgroundRefresh = hardDepsKeyRef.current === hardDepsKey;
    hardDepsKeyRef.current = hardDepsKey;

    if (!apartment || !geo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDishes([]);
      setKitchens([]);
      setHasMore(false);
      setLoading(apartment === undefined);
      return;
    }
    let active = true;
    const cached = !isBackgroundRefresh ? catalogCacheRef.current.get(hardDepsKey) : undefined;
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDishes(cached.dishes);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setKitchens(cached.kitchens);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasMore(cached.hasMore);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
    }
    // Skips the skeleton/blank-on-error treatment for BOTH the pre-existing
    // background-refresh case (identical to the immediately-prior state)
    // AND a cache hit (seen this exact combo before, just not most-recently)
    // — either way there's already a valid list on screen to keep showing
    // while this fetch silently confirms/updates it.
    const skipDisruptive = isBackgroundRefresh || !!cached;
    // Delayed-skeleton pattern: only shows the skeleton if the fetch is still pending 150ms later, so a cache-hit tab switch never flashes one.
    let skeletonTimer: ReturnType<typeof setTimeout> | null = null;
    if (!skipDisruptive) {
      skeletonTimer = setTimeout(() => {
        if (active) setLoading(true);
      }, 150);
    }
    // Every path here is a from-scratch fetch: always page 1, replaces dishes/kitchens; loadMore below is the only thing that asks for page 2+.
    pageRef.current = 1;
    const catalogFilters: ApartmentCatalogFilters = {
      search: debouncedSearch || undefined,
      diet: diet === 'any' ? undefined : diet,
      deliveryType: deliveryType === 'any' ? undefined : deliveryType,
      cuisines: selectedCuisine ? [selectedCuisine] : undefined,
      kitchenIds: kitchenFilter.size > 0 ? Array.from(kitchenFilter) : undefined,
      mealSlot: orderType === 'today' && mealSlotFilter !== 'all' ? mealSlotFilter : undefined,
    };
    loadApartmentCatalog(apartment.apartmentId, orderType, geo, catalogFilters, 1)
      .then((catalog) => {
        if (!active) return;
        setDishes(catalog.dishes);
        setKitchens(catalog.kitchens);
        const hasMoreNow = catalog.hasMore && catalog.dishes.length > 0;
        setHasMore(hasMoreNow);
        // Cache this combo's fresh result for next time it's revisited.
        // Deleting before re-inserting moves it to the end (most-recently-used)
        // so the eviction below always drops the actual least-recently-seen entry.
        const cache = catalogCacheRef.current;
        cache.delete(hardDepsKey);
        cache.set(hardDepsKey, { dishes: catalog.dishes, kitchens: catalog.kitchens, hasMore: hasMoreNow });
        if (cache.size > CATALOG_CACHE_LIMIT) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
      })
      .catch(() => {
        // Falls back to empty state rather than a stuck skeleton — unless there's already a valid (cached or unchanged) list to keep showing instead.
        if (active && !skipDisruptive) {
          setDishes([]);
          setKitchens([]);
          setHasMore(false);
        }
      })
      .finally(() => {
        if (skeletonTimer) clearTimeout(skeletonTimer);
        if (active && !skipDisruptive) setLoading(false);
      });
    return () => {
      active = false;
      if (skeletonTimer) clearTimeout(skeletonTimer);
    };
    // Keyed off `apartment`, not raw geo, so this fires once per resolved apartment change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apartment, orderType, debouncedSearch, diet, deliveryType, kitchenFilter, selectedCuisine, mealSlotFilter, todayRefreshTick]);

  // Called by FlatList's onEndReached; same filters as the fetch effect above, just the next page — appends rather than replacing. Guarded by loadingMore/hasMore.
  const loadMore = useCallback(() => {
    const geo = address?.geolocation;
    if (!apartment || !geo || !hasMore || loadingMore) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    const catalogFilters: ApartmentCatalogFilters = {
      search: debouncedSearch || undefined,
      diet: diet === 'any' ? undefined : diet,
      deliveryType: deliveryType === 'any' ? undefined : deliveryType,
      cuisines: selectedCuisine ? [selectedCuisine] : undefined,
      kitchenIds: kitchenFilter.size > 0 ? Array.from(kitchenFilter) : undefined,
      mealSlot: orderType === 'today' && mealSlotFilter !== 'all' ? mealSlotFilter : undefined,
    };
    loadApartmentCatalog(apartment.apartmentId, orderType, geo, catalogFilters, nextPage)
      .then((catalog) => {
        pageRef.current = nextPage;
        setDishes((prev) => [...prev, ...catalog.dishes]);
        setKitchens((prev) => {
          const byId = new Map(prev.map((k) => [k._id, k]));
          for (const k of catalog.kitchens) if (!byId.has(k._id)) byId.set(k._id, k);
          return Array.from(byId.values());
        });
        // Requires both the server's hasNextPage flag AND a non-empty page, so a server miscount can't make onEndReached fire forever on a small catalog.
        setHasMore(catalog.hasMore && catalog.dishes.length > 0);
      })
      .catch(() => {
        // Leaves the existing list and hasMore as-is; scrolling back to the end retries.
      })
      .finally(() => setLoadingMore(false));
  }, [apartment, address?.geolocation, orderType, debouncedSearch, diet, deliveryType, kitchenFilter, selectedCuisine, mealSlotFilter, hasMore, loadingMore]);

  // Bug fix: blocked Today dishes now stay visible-but-disabled instead of hidden (blocking includes past-cutoff, not just nonexistence); `filterDishes(dishes, debouncedSearch)` stays client-side only to bridge the gap before the debounced server re-fetch lands.
  // Perf fix ("lots of items → typing in search lags the whole app"): this used to filter on the raw, un-debounced `search` value — a full
  // linear scan (string-concat + lowercase + includes) over every loaded dish on EVERY keystroke, which then cascaded into `priorityDishes`/
  // `otherDishes` re-sorting and `rows` re-chunking the entire grid, all synchronously, scaling with total item count. Reusing the same
  // `debouncedSearch` the server fetch already waits on means typing itself only ever re-renders the (cheap) search TextInput — the expensive
  // recompute chain fires once, after the user pauses, exactly like the network request does.
  const filtered = useMemo(() => {
    const bySearch = filterDishes(dishes, debouncedSearch);
    // Today-only meal-slot re-check — usually a no-op since `dishes` is already server-filtered, but avoids flashing the previous slot's dishes while a new fetch is in flight; irrelevant for Instant/Advance.
    // Bug fix: a dish now only counts for a slot if some kitchen can still serve it there (not just matching mealType), so it no longer shows under a slot it can't actually be ordered for.
    if (orderType !== 'today' || mealSlotFilter === 'all') return bySearch;
    return bySearch.filter((d) => d.offers.some((o) => o.mealType === mealSlotFilter && !o.blocked));
  }, [dishes, debouncedSearch, orderType, mealSlotFilter]);
  // All three order types render one flat grid (product decision) — Instant/Today never had real meal-slot sections, and Advance's old single "Menu" section wrapper was removed as vestigial.
  // Kitchen-priority split — once the cart has a committed kitchen, dishes it also serves show first under "More from {kitchen}" since those are the only ones that can join the current order.
  // Plain function, not memoized — it's a pure derivation of `cartMeta` (already tracked in dep arrays), so omitting it there is intentional.
  const isFromCartKitchen = (dish: ApartmentDish) => !!cartMeta && dish.offers.some((o) => o.kitchenId === cartMeta.kitchenId);
  // Stable sort pushes blocked dishes (out of stock / past cutoff) to the end without reordering anything else, so they group together but stay visible.
  const byAvailability = (a: ApartmentDish, b: ApartmentDish) => Number(isDishBlocked(a)) - Number(isDishBlocked(b));
  const priorityDishes = useMemo(
    () => (cartMeta ? [...filtered.filter(isFromCartKitchen)].sort(byAvailability) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, cartMeta],
  );
  const otherDishes = useMemo(
    () => (cartMeta ? [...filtered.filter((d) => !isFromCartKitchen(d))].sort(byAvailability) : [...filtered].sort(byAvailability)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, cartMeta],
  );
  // Search chrome renders unconditionally once loading settles (not gated on dishes.length) so stickyHeaderIndices doesn't flip mid-session and cause a jump/stutter.
  const catalogGenuinelyEmpty = !loading && filtered.length === 0 && !search && filterCount === 0;
  // Hidden when there's no apartment here, eligibility hasn't resolved, or the catalog is genuinely empty (excludes search/filter-narrowed-to-nothing).
  const showSearchBar = apartment !== null && apartment !== undefined && !catalogGenuinelyEmpty;

  // Cycling search placeholder built from real dish names on screen; falls back to generic copy.
  const searchSubjects = useMemo(() => {
    const names = [...new Set(dishes.map((d) => d.name))].slice(0, 8);
    if (names.length === 0) return ['menus, thalis, and dishes'];
    return names.map((name) => `${name}...`);
  }, [dishes]);
  const [subjectIndex, setSubjectIndex] = useState(0);
  // useState's lazy initializer (not useRef) to avoid tripping this repo's react-hooks/refs lint rule for a value only ever mutated via .timing().
  const [subjectFade] = useState(() => new RNAnimated.Value(1));
  useEffect(() => {
    if (searchSubjects.length <= 1) return;
    const t = setInterval(() => {
      RNAnimated.timing(subjectFade, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start(() => {
        // Modulo guards against searchSubjects having shrunk since the index was last set.
        setSubjectIndex((i) => (i + 1) % searchSubjects.length);
        RNAnimated.timing(subjectFade, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start();
      });
    }, 3600);
    return () => clearInterval(t);
  }, [searchSubjects, subjectFade]);
  const searchSubject = searchSubjects[subjectIndex % searchSubjects.length];
  const itemCount = cartLines.reduce((sum, l) => sum + l.count, 0);
  const cartSubTotal = cartLines.reduce((sum, l) => sum + l.offer.price * l.count, 0);
  // Names what's actually in the cart instead of a bare count; the rib's own subtitle truncates it.
  const cartLineSummary = cartLines.map((l) => `${l.dishName} x${l.count}`).join(', ');

  // Pushes this tab's cart CTA into the shared bottom overlay (same mechanism as other tabs) instead of a separate floating bar that would collide with the fixed HomeBottomNav.
  useEffect(() => {
    useBottomCtaStore.getState().setCta(
      'apartment',
      itemCount > 0
        ? {
            priceLabel: formatINR(cartSubTotal),
            subtitle: cartLineSummary,
            buttonLabel: 'View order',
            onPress: onGoToCart,
          }
        : null,
    );
    return () => {
      useBottomCtaStore.getState().setCta('apartment', null);
    };
  }, [itemCount, cartSubTotal, cartLineSummary, onGoToCart]);

  // Stable identity (nothing this reads ever changes) lets `ApartmentDishCard`'s memo actually skip re-rendering cards nothing changed about.
  const openSheet = useCallback(
    (dish: ApartmentDish): void => {
      // Browsing the menu stays open to a guest; starting an order doesn't — same rule the cart screen enforces, applied at the earliest point an order begins.
      if (!profile) {
        onRequireLogin();
        return;
      }
      setSheetDish(dish);
      setSheetOpenSeq((n) => n + 1);
      requestAnimationFrame(() => addSheetRef.current?.present());
    },
    [profile, onRequireLogin],
  );
  function closeSheet(): void {
    addSheetRef.current?.dismiss();
  }

  // Builds this screen's content as one flat, ordered list for FlatList virtualization; card rows are pre-chunked into pairs (2-column grid) so each pair is its own FlatList row.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (loading) out.push({ type: 'loadingBand', key: 'loadingBand' });
    if (showSearchBar) {
      out.push({ type: 'pills', key: 'pills' });
      out.push({ type: 'searchRow', key: 'searchRow' });
    }
    // Debounced (not raw `search`) — this whole row list rebuilds (re-chunks every card pair) whenever this changes, so tying it to
    // the same debounce the filter itself waits on keeps a keystroke from re-triggering this rebuild too (see `filtered`'s own comment).
    if (debouncedSearch) out.push({ type: 'searchResultsHeader', key: 'searchResultsHeader' });

    if (loading) {
      out.push({ type: 'skeleton', key: 'skeleton' });
    } else if (apartment === null) {
      out.push({ type: 'emptyNotAvailable', key: 'emptyNotAvailable' });
    } else if (filtered.length === 0) {
      out.push({
        type: 'emptyFiltered',
        key: 'emptyFiltered',
        title: search ? 'No dishes match that search' : filterCount > 0 ? 'No dishes match these filters' : 'Nothing orderable right now',
        message: search
          ? 'Try another dish, thali or kitchen name, or switch the order type.'
          : filterCount > 0
            ? // Covers the meal-slot filter too, since it lives in the same "Refine your menu" popup.
              'No kitchen in your society matches this cuisine and delivery combination right now. Clear a filter to widen the list.'
            : orderType === 'today'
              ? `Every meal slot has passed its ${config ? config.todayCutoffMinutes / 60 : 3}h cutoff for today. Try Instant or Advance.`
              : 'No items in this catalog at this hour.',
        // Genuinely empty only when neither a search nor a filter is narrowing the result.
        genuinelyEmpty: !search && filterCount === 0,
      });
    } else {
      // One flat grid, no meal-time grouping — every order type shares this path.
      if (priorityDishes.length > 0) {
        out.push({ type: 'priorityHeader', key: 'priorityHeader' });
        for (let i = 0; i < priorityDishes.length; i += 2) {
          const pair = priorityDishes.slice(i, i + 2);
          // Keyed by content (dish keys), not array position, so a stale cell after a re-sort/re-filter can never be mistaken for a current one.
          out.push({ type: 'cards', key: `priority-${pair.map((d) => d.key).join('|')}`, dishes: pair, topGap: i === 0 ? 11 : 14 });
        }
        // Only introduces the divider when there's genuinely something below it.
        if (otherDishes.length > 0) out.push({ type: 'divider', key: 'divider' });
      }
      for (let i = 0; i < otherDishes.length; i += 2) {
        // Same content-derived-key fix as the priority section above.
        const pair = otherDishes.slice(i, i + 2);
        out.push({ type: 'cards', key: `other-${pair.map((d) => d.key).join('|')}`, dishes: pair, topGap: 16 });
      }
    }
    return out;
  }, [loading, showSearchBar, search, apartment, filtered.length, filterCount, orderType, config, priorityDishes, otherDishes]);

  // `searchRow`'s real position in `rows` — computed rather than assumed, since row order can vary.
  const stickyHeaderIndex = useMemo(() => {
    const idx = rows.findIndex((r) => r.type === 'searchRow');
    return idx >= 0 ? [idx] : [];
  }, [rows]);

  // Deliberately a plain function, not `useCallback`'d — FlatList's own windowing solves the mount-burst problem, not this function's identity.
  function renderRow({ item }: { item: Row }) {
    switch (item.type) {
      case 'loadingBand':
        // Full-width centered loading band, rendered as a real row (not an overlay) between the hero and the pills/search row, both already visible.
        return (
          <View className="items-center justify-center" style={{ paddingVertical: 18 }}>
            <View
              className="flex-row items-center"
              style={[shadow.card, { gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.card }]}>
              <ActivityIndicator size="small" color={tone.accent} />
              <AppText variant="caption" style={{ color: apartmentColors.muted }}>
                Loading menus…
              </AppText>
            </View>
          </View>
        );
      case 'pills':
        // Plain, uncolored gap — the pills row sits on the normal page background regardless of scroll.
        return (
          <View style={{ backgroundColor: colors.background, paddingTop: 4, paddingBottom: 12 }}>
            <ApartmentCategoryPills selected={selectedCuisine} onSelect={setSelectedCuisine} />
          </View>
        );
      case 'searchRow':
        // Search + filter row — its own row, not part of the sticky pills band above.
        return (
          <View className="px-4 pb-3 pt-2" style={{ backgroundColor: colors.background }}>
            <View className="flex-row items-center" style={{ gap: 9 }}>
              {/* Fully rounded pill with a soft card shadow so it lifts off the page. */}
              <View
                className="flex-1 flex-row items-center gap-2 border border-border bg-card px-4"
                style={[shadow.card, { borderRadius: 999, height: 48 }]}>
                <IconSearch size={16} color={palette.neutral.gray500} />
                <View style={{ flex: 1, height: '100%' }}>
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    // No native `placeholder` — the custom overlay below animates just the dish-name part.
                    className="text-foreground"
                    style={{ flex: 1, height: '100%', fontFamily: FONT_FAMILY.regular, fontSize: 15 }}
                  />
                  {!search ? (
                    <View pointerEvents="none" className="flex-row items-center" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
                      {/* Static — only `searchSubject` below crossfades. */}
                      <AppText variant="body" style={{ color: palette.neutral.gray500, fontSize: 13 }}>
                        Search{' '}
                      </AppText>
                      <RNAnimated.Text
                        numberOfLines={1}
                        style={{
                          opacity: subjectFade,
                          // Rides the same `subjectFade` value to slide up while it fades in.
                          transform: [{ translateY: subjectFade.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) }],
                          color: palette.neutral.gray500,
                          fontFamily: FONT_FAMILY.regular,
                          fontSize: 13,
                          flexShrink: 1,
                        }}>
                        {searchSubject}
                      </RNAnimated.Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Round filter button — badge count + accent fill once a filter is active. */}
              <Pressable
                onPress={() => setFilterModalOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={filterCount > 0 ? `Filters, ${filterCount} active` : 'Filters'}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: filterCount > 0 ? tone.accent : apartmentColors.card,
                  borderWidth: filterCount > 0 ? 0 : 1,
                  borderColor: apartmentColors.border,
                }}>
                <IconFilter size={18} color={filterCount > 0 ? '#fff' : apartmentColors.ink} />
                {filterCount > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -2,
                      minWidth: 17,
                      height: 17,
                      paddingHorizontal: 4,
                      borderRadius: 999,
                      // Deliberately the type accent, not `.ink` — ink flips light in dark mode, which would break this badge's solid fill.
                      backgroundColor: tone.accent,
                      borderWidth: 1.5,
                      borderColor: '#fff',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <AppText variant="caption" weight="bold" style={{ color: '#fff', fontSize: 10 }}>
                      {filterCount}
                    </AppText>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>
        );
      case 'searchResultsHeader':
        // Shown only once there's an actual typed query, not for a plain filter narrowing.
        return (
          <View className="px-4 pt-4">
            <AppText variant="h2" style={{ color: apartmentColors.ink, letterSpacing: -0.2 }}>
              Search results
            </AppText>
          </View>
        );
      case 'skeleton':
        return (
          <View className="mt-3 flex-row flex-wrap justify-between gap-y-4 px-4">
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ width: '48%', borderRadius: 16, overflow: 'hidden' }}>
                <Skeleton height={100} radius={0} />
                <View style={{ padding: 10, gap: 6 }}>
                  <Skeleton width="80%" height={14} />
                  <Skeleton width="50%" height={11} />
                </View>
              </View>
            ))}
          </View>
        );
      case 'emptyNotAvailable':
        return (
          <EmptyState
            title="Not available at your address"
            message="Apartment ordering only shows up once your delivery address is inside a registered apartment complex."
          />
        );
      case 'emptyFiltered':
        return (
          <EmptyState
            title={item.title}
            message={item.message}
            // Only the genuinely-empty case gets the image/Go Home CTA; a search/filter narrowed to nothing stays text-only.
            image={item.genuinelyEmpty ? require('../../../../assets/images/apartment-images/Coming Soon.png') : undefined}
            onGoHome={item.genuinelyEmpty ? onGoHome : undefined}
          />
        );
      case 'priorityHeader':
        return (
          <View className="flex-row items-center gap-2.5" style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <View className="items-center justify-center rounded-2xl" style={{ width: 30, height: 30, backgroundColor: accentTint(tone.accent, 0.12) }}>
              <IconUtensils size={16} color={tone.accent} />
            </View>
            <View className="min-w-0 flex-1">
              <AppText variant="label" style={{ color: apartmentColors.ink, fontSize: 13.5 }}>
                More from {cartMeta?.kitchenName ?? 'your kitchen'}
              </AppText>
              <AppText variant="caption" style={{ color: apartmentColors.muted, marginTop: 1, fontSize: 11 }}>
                Anything here joins your current order
              </AppText>
            </View>
          </View>
        );
      case 'divider':
        return (
          <>
            <View style={{ height: 1, backgroundColor: apartmentColors.border, marginHorizontal: 16, marginTop: 22 }} />
            <AppText variant="caption" style={{ color: apartmentColors.muted, textAlign: 'center', paddingHorizontal: 22, paddingTop: 9, lineHeight: 16 }}>
              Menus from other kitchens, which cannot be clubbed together with your current order
            </AppText>
          </>
        );
      case 'cards':
        return (
          <View className="flex-row justify-between" style={{ paddingHorizontal: 16, paddingTop: item.topGap }}>
            {item.dishes.map((dish) => (
              <View key={dish.key} style={{ width: '48%' }}>
                <ApartmentDishCard dish={dish} orderType={orderType} onPress={openSheet} />
              </View>
            ))}
          </View>
        );
      default:
        return null;
    }
  }

  return (
    <View className="flex-1">
      <Animated.FlatList
        // No `key={loading ? ...}` remount hack here — content-derived row keys already prevent stale cells, so a full remount would just cause flicker.
        ref={listRef}
        className="flex-1"
        data={rows}
        keyExtractor={(item: Row) => item.key}
        renderItem={renderRow}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // Pins the search+filter row once scrolled past; `stickyHeaderIndex` is computed from `rows` so it stays correct regardless of which rows precede it.
        stickyHeaderIndices={stickyHeaderIndex}
        contentContainerStyle={{ paddingTop: topInset, paddingBottom: 24 + insets.bottom + bottomStackClearance }}
        // Smaller first batch than FlatList's defaults, so a long catalog's first paint mounts roughly one screenful, not the whole thing.
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={50}
        // windowSize governs rendering outside the viewport (distinct from initialNumToRender's first-mount burst) — left at RN's default.
        // Explicitly false, not just omitted — RN defaults this to true on Android, and a clipped-then-recycled view can keep stale content on reuse.
        removeClippedSubviews={false}
        // Fires `loadMore` once scrolled within 60% of a screenful of the bottom, so the next page is usually already in by the time they get there.
        onEndReachedThreshold={0.6}
        onEndReached={loadMore}
        ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={orderTypeColors[orderType].accent} style={{ marginVertical: 16 }} /> : null}
      />

      <ApartmentAddSheet
        ref={addSheetRef}
        dish={sheetDish}
        openSeq={sheetOpenSeq}
        orderType={orderType}
        apartmentId={apartment?.apartmentId ?? ''}
        apartmentName={apartment?.apartmentName}
        onAdded={closeSheet}
      />
      <ApartmentConflictModal
        conflict={conflict}
        currentKitchenName={cartMeta?.kitchenName}
        onStartNewOrder={() => {
          startNewOrder();
          closeSheet();
        }}
        onDismiss={dismissConflict}
      />

      <ApartmentFilterModal
        visible={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        kitchens={kitchens}
        orderType={orderType}
        diet={diet}
        onDietChange={setDiet}
        deliveryType={deliveryType}
        onDeliveryTypeChange={setDeliveryType}
        kitchenFilter={kitchenFilter}
        onKitchenToggle={toggleKitchenFilter}
        mealSlot={mealSlotFilter}
        onMealSlotChange={setMealSlotFilter}
        filterCount={filterCount}
        matchCount={filtered.length}
        onClear={clearFilters}
      />
    </View>
  );
}

/** Empty-state layout; `image`/`onGoHome` are optional — only the genuinely-empty case passes them. */
function EmptyState({
  title,
  message,
  image,
  onGoHome,
}: {
  title: string;
  message: string;
  image?: number;
  onGoHome?: () => void;
}) {
  return (
    <View className="items-center px-6 py-10">
      {image ? <Image source={image} style={{ width: 180, height: 180 }} resizeMode="contain" /> : null}
      <AppText variant="title" className="text-foreground" style={{ marginTop: image ? 8 : 0, textAlign: 'center' }}>
        {title}
      </AppText>
      <AppText variant="bodySm" className="text-muted-foreground" style={{ marginTop: 4, textAlign: 'center' }}>
        {message}
      </AppText>
      {onGoHome ? (
        <View style={{ marginTop: 18 }}>
          <Button label="Go to Home" onPress={onGoHome} />
        </View>
      ) : null}
    </View>
  );
}

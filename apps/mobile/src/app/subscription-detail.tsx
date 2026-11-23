import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, useColorScheme, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { DietMark } from '@/components/ui/DietMark';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  IconArrowLeft,
  IconMoon,
  IconSun,
  IconUtensils,
  type IconProps,
} from '@/components/ui/icons';
import { useScrollSolidHeader } from '@/features/home/useScrollSolidHeader';
import {
  CategoryThumbnail,
  cheapestPriceLabels,
  CityBottomBanner,
  IncludedChecklist,
  loadWeeklyMenu,
  PromiseStrip,
  useSubscriptionBrowseStore,
  useSubscriptionCatalog,
  type IncludedItem,
  type SubCategory,
  type WeekMenu,
} from '@/features/subscription';
import { useScreenTracking } from '@/services/netcore';
import { useAuthStore } from '@/store';
import { palette, accentTint, shadow, useColors } from '@/theme';

/** Sticky header row height (safe-area top + this) — the point the solid
 * backdrop + category name fade in against, and the height reserved for
 * `HeroBlock`'s own back button before this took over. */
const STICKY_HEADER_HEIGHT = 56;

const HERO_HEIGHT = 280;
/** How often the day strip auto-advances to the next day. */
const DAY_AUTO_ADVANCE_MS = 5000;

/** Sun–Sat, `Date.getDay()` order — matches the Ionic reference's
 * `menu-list.component.ts` (`days = ['Sunday', 'Monday', …, 'Saturday']`).
 * Deliveries do happen on Sunday for at least some clusters/categories, so
 * this used to wrongly drop it entirely; see the "today" effect below for
 * why Sunday-first also removes a special case there. */
const DAYS = [
  { full: 'Sunday', short: 'Sun' },
  { full: 'Monday', short: 'Mon' },
  { full: 'Tuesday', short: 'Tue' },
  { full: 'Wednesday', short: 'Wed' },
  { full: 'Thursday', short: 'Thu' },
  { full: 'Friday', short: 'Fri' },
  { full: 'Saturday', short: 'Sat' },
] as const;

/**
 * Subscription category detail — reached by tapping a category card on the
 * Subscription home tab. Hero photo (badge ribbon) → inline Sun–Sat day strip
 * → a Veg/Non-veg toggle + the selected day's dish → "What's included" → a
 * sticky "Choose plan" CTA that hands off to the Plan screen (meal-time
 * selection lives there now).
 */
export default function SubscriptionDetailScreen() {
  useScreenTracking('subscription_detail');

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const isDarkMode = useColorScheme() === 'dark';
  const { categoryParam } = useLocalSearchParams<{ categoryParam?: string }>();
  const profile = useAuthStore((s) => s.profile);

  // Sticky back-button-and-category-name header: transparent (floating pill
  // over the hero photo) at the top, fades to a solid bar once scrolled past
  // where the hero itself (and the in-content category name right below it)
  // would otherwise have scrolled out of view — so there's no gap where
  // neither shows the category name.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const collapseDistance = Math.max(1, HERO_HEIGHT - STICKY_HEADER_HEIGHT);
  const { backdropStyle, solid: headerSolid } = useScrollSolidHeader(scrollY, collapseDistance);

  // `categories` is cluster-aware — resolved independently here (not
  // borrowed from Home) so this screen also works from a cold deep link/reload.
  const { categories, loading: catalogLoading, packagesFor } = useSubscriptionCatalog();
  const storeCategory = useSubscriptionBrowseStore((s) => s.category);
  const setCategory = useSubscriptionBrowseStore((s) => s.setCategory);
  const selectedDay = useSubscriptionBrowseStore((s) => s.selectedDay);
  const setSelectedDay = useSubscriptionBrowseStore((s) => s.setSelectedDay);

  // Primary source of truth is the route param (works on a deep link/reload);
  // the store's category — already set by the Home tap — is only a fallback,
  // e.g. while the catalog is still loading.
  const category: SubCategory | null = useMemo(() => {
    if (categoryParam) {
      const match = categories.find((c) => c.param.toLowerCase() === categoryParam.toLowerCase());
      if (match) {
        return match;
      }
    }
    return storeCategory ?? null;
  }, [categoryParam, categories, storeCategory]);

  // Every other category in this cluster's catalog — the "check out more
  // from our meals" cross-sell carousel below What's Included.
  const otherCategories = useMemo(
    () => categories.filter((c) => c.param !== category?.param),
    [categories, category?.param],
  );

  function exploreCategory(next: SubCategory): void {
    setCategory(next);
    router.push({ pathname: '/subscription-detail', params: { categoryParam: next.param } });
  }

  // Reset the strip to today's weekday every time this screen mounts —
  // `selectedDay` lives in a cross-screen store, so without this a stale
  // pick left over from a previous visit/category would incorrectly persist
  // here instead of showing "today" on init like the strip is meant to.
  // `DAYS` is Sun-first (same order as `Date.getDay()`), so the index maps
  // straight across with no folding needed.
  useEffect(() => {
    const todayIndex = new Date().getDay(); // 0 = Sun … 6 = Sat
    setSelectedDay(DAYS[todayIndex]?.full ?? DAYS[0].full);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-advance the day strip every few seconds — a light "explore the
  // week" nudge so a first-time visitor sees more than just today's menu
  // without having to tap through it themselves. Reads/writes the store
  // directly via `getState()` (rather than depending on `selectedDay`) so
  // the interval is armed once and always advances from whatever day is
  // *currently* selected — including a day the user just tapped manually,
  // which becomes the base for the next tick instead of being overridden.
  useEffect(() => {
    const interval = setInterval(() => {
      const current = useSubscriptionBrowseStore.getState().selectedDay;
      const index = DAYS.findIndex((d) => d.full === current);
      const next = DAYS[(index + 1) % DAYS.length];
      useSubscriptionBrowseStore.getState().setSelectedDay(next.full);
    }, DAY_AUTO_ADVANCE_MS);
    return () => clearInterval(interval);
  }, []);

  // `SubscriptionWeeklyMenu` docs are authored in the dashboard against the
  // same short slug this screen already has as `category.param` (the
  // dashboard's `subscription-weekly-menu.component.ts` uses a hardcoded
  // `packageCategoryList` of these same param strings) — NOT against
  // `MealPackage.packageCategory`, which can hold a stale full display name
  // (e.g. "Special Thali" instead of "Special") for any package saved before
  // `mealPackage.dao.js`'s `resolvePackageCategoryName` fix landed, or via
  // `scripts/migrate-subscription-catalog-seed.js`'s still-buggy backfill.
  // This screen used to resolve `serverCategory` by fuzzy-matching that
  // field (`matchCategoryKey` against the grouped packages, the way
  // `loadPackagesForCategory` does for browsing) — for any category with
  // stale package data, that sent the wrong key to `loadWeeklyMenu`, got
  // zero rows back, and silently rendered "Not published" for every day.
  // The modern Ionic reference (`mealaweApp`'s `PackageService.loadWeeklyMenu`)
  // never resolves against packages either — it always passes the raw param
  // straight through, which is what this does now.
  const serverCategory = category?.param ?? null;

  const [weeks, setWeeks] = useState<WeekMenu[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);

  useEffect(() => {
    if (!serverCategory) {
      // Not ready yet (category/catalog still resolving) — keep showing the
      // loading skeleton instead of flipping `menuLoading` off early.
      return;
    }
    let active = true;
    setMenuLoading(true);
    loadWeeklyMenu(serverCategory)
      .then((result) => active && setWeeks(result))
      .catch(() => active && setWeeks([]))
      .finally(() => active && setMenuLoading(false));
    return () => {
      active = false;
    };
  }, [serverCategory]);

  const week = useMemo(() => weeks.find((w) => w.isSelected) ?? weeks[0], [weeks]);

  // Screen-local diet display toggle — deliberately NOT the app's global
  // `vegModeStore` (that's a different, app-wide preference). Defaults to
  // 'nonveg' only for categories that don't offer a veg menu at all, mirroring
  // the previous static `category.veg === false` check, but now switchable.
  //
  // `category` can resolve asynchronously (cold deep-link/reload path, where
  // it starts `null` and is later matched from the route param — see the
  // resolution comment above), so a one-shot `useState` initializer would
  // lock in the wrong default whenever that path resolves after first
  // render. Instead, resync via effect whenever `category.veg` changes,
  // but only until the user actually touches the toggle themselves.
  const [dietFilter, setDietFilter] = useState<'veg' | 'nonveg'>('veg');
  const dietTouchedRef = useRef(false);
  useEffect(() => {
    if (dietTouchedRef.current) {
      return;
    }
    setDietFilter(category?.veg === false ? 'nonveg' : 'veg');
  }, [category?.veg]);
  const setDietFilterFromUser = (value: 'veg' | 'nonveg'): void => {
    dietTouchedRef.current = true;
    setDietFilter(value);
  };
  const dayMenuList = dietFilter === 'nonveg' ? week?.nonvegMenuList : week?.vegMenuList;
  const selectedDayMenu = (dayMenuList ?? []).find((d) => d.day === selectedDay);

  // Whether the *selected day specifically* has a published non-veg menu —
  // the weekly menu varies day to day, so this isn't just a category-level
  // veg/non-veg flag. The Non-veg toggle option only makes sense to show
  // when there's actually something to switch to for this day.
  const selectedDayNonveg = week?.nonvegMenuList?.find((d) => d.day === selectedDay);
  // Checks all three meal slots, not just lunch/dinner — a Breakfast
  // category's published non-veg entry (if any) only ever populates
  // `.breakfast`, so checking lunch/dinner alone always read as "no non-veg
  // today" for Breakfast and permanently hid the toggle below regardless of
  // real data.
  const dayHasNonveg = Boolean(
    selectedDayNonveg?.breakfast?.description?.trim() ||
      selectedDayNonveg?.lunch?.description?.trim() ||
      selectedDayNonveg?.dinner?.description?.trim(),
  );

  // If the day changes (or the week finishes loading) and lands on a day
  // with no non-veg menu while 'nonveg' is selected, fall back to 'veg' —
  // the toggle option is about to be hidden below, so nothing should be left
  // selected that no longer has a visible button.
  useEffect(() => {
    if (!menuLoading && dietFilter === 'nonveg' && !dayHasNonveg) {
      setDietFilter('veg');
    }
  }, [menuLoading, dietFilter, dayHasNonveg]);

  // "What's included" comes from the package's own `vegMealDescription` /
  // `nonVegMealDescription` (real backend fields on MealPackage, set by
  // admins in the dashboard's meal-package form) — a comma-separated list of
  // what's in that meal, split into chips. Swaps with the diet toggle, same
  // as the dashboard's own veg/non-veg field pair. Any *actual* breakfast
  // package for this category carries the same description, so the first one
  // resolved is enough — this doesn't need the specific package chosen on
  // the Plan screen.
  //
  // Must NOT just take `packagesFor(category.param)[0]`: `loadGroupedPackages`
  // (features/subscription/api.ts) buckets a package under EVERY tag in its
  // comma-separated `searchCategory`, not just its real `packageCategory` — so
  // a non-breakfast package cross-tagged "Breakfast" can land in this bucket
  // too, and the bucket is sorted only by `days`, so ties leave backend
  // response order deciding which package sits at index 0. Blindly reading
  // `[0]` could resolve to that wrong package (empty/irrelevant description,
  // `isBreakFast` false) — reads as "content only shows after navigating back
  // and re-fetching happens to reorder it." Prefer the package that's
  // actually flagged breakfast; fall back to `[0]` only if none is.
  const categoryPackages = category ? packagesFor(category.param) : [];
  const categoryPackage = categoryPackages.find((p) => p.isBreakFast === true) ?? categoryPackages[0];
  // Same package-level flag `subscription-plan.tsx` already uses to hide the
  // Lunch/Dinner meal-time picker for Breakfast categories (ports the Ionic
  // reference's `!selectedPackage.isBreakFast` check on its own "SELECT
  // DELIVERY SLOT" section) — more robust than matching `category.param`
  // against the literal string `'Breakfast'`.
  const isBreakfastCategory = categoryPackage?.isBreakFast === true;
  const mealDescription =
    dietFilter === 'nonveg' ? categoryPackage?.nonVegMealDescription : categoryPackage?.vegMealDescription;
  // Veg and non-veg versions of a thali don't include the same items (e.g. an
  // extra curry swapped for a paneer dish) — the category's structured list
  // is split the same way the legacy per-package description pair above is.
  const structuredIncludedItems =
    dietFilter === 'nonveg' ? category?.includedItemsNonVeg : category?.includedItemsVeg;
  const includedItems: readonly IncludedItem[] = useMemo(() => {
    if (structuredIncludedItems?.length) {
      return structuredIncludedItems;
    }
    if (!mealDescription) {
      return [];
    }
    return mealDescription
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((label) => ({ label }));
  }, [structuredIncludedItems, mealDescription]);

  const goToLogin = (): void => {
    router.push({
      pathname: '/login',
      params: category ? { redirect: `/subscription-detail?categoryParam=${category.param}` } : {},
    });
  };

  const choosePlan = (): void => {
    // A guest can browse this whole screen freely, but committing to a plan
    // needs a session — surface that with the same "Sign in required" prompt
    // used elsewhere (see `requireLogin`) instead of silently redirecting,
    // then land straight back on this exact category page (not forward into
    // Plan) once they do. See `login.tsx`'s own `redirect` param.
    if (!profile) {
      Alert.alert('Sign in required', 'Please sign in to continue.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign in', onPress: goToLogin },
      ]);
      return;
    }
    // Should already be set from the Home tap — set again defensively in case
    // this screen is ever reached another way (deep link, back-forward, etc.).
    if (category) {
      setCategory(category);
    }
    router.push('/subscription-plan');
  };

  if (!category) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar style="auto" />
        <View style={{ paddingTop: insets.top + 8 }} className="flex-row items-center px-4">
          <IconPillButton icon={IconArrowLeft} onPress={() => router.back()} accessibilityLabel="Go back" />
        </View>
        <View className="flex-1 items-center justify-center px-10">
          {catalogLoading ? (
            <ActivityIndicator size="large" color={palette.brand.green} />
          ) : (
            <>
              <AccentIcon icon={IconUtensils} tone="food" size={26} tileSize={56} />
              <AppText variant="title" className="text-foreground" style={{ marginTop: 12, textAlign: 'center' }}>
                Category not found
              </AppText>
              <View style={{ marginTop: 16 }}>
                <Button label="Go back" variant="outline" onPress={() => router.back()} />
              </View>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      {/* Light (white) status bar icons while the hero photo runs full-bleed
          behind the status bar — flips to dark once the sticky header below
          goes solid (light surface), same as Home's hero. */}
      <StatusBar style={headerSolid ? (isDarkMode ? 'light' : 'dark') : 'light'} />

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}>
        <HeroBlock category={category} />

        <View className="px-4 pt-5" style={{ gap: 24 }}>
          {/* category name — the screen has no header (headerShown: false),
              and the hero photo itself carries no reliable title text, so
              this is the only place a user sees which category they're
              actually looking at. Name + tagline are wrapped in their own
              tight-gap container so the tagline reads as a subtitle sitting
              right under the name — the parent's `gap: 24` only applies
              BETWEEN this pair and the next section, not inside it. */}
          <View style={{ gap: 4 }}>
            <AppText variant="h2" className="text-foreground">
              {category.name}
            </AppText>
            {category.tagline ? (
              <AppText variant="bodySm" className="text-muted-foreground">
                {category.tagline}
              </AppText>
            ) : null}
          </View>

          <PromiseStrip />

          {/* day strip: inline Sun–Sat, no separate "full week" sheet — a
              plain day pill (no photo repeated 7 times over) */}
          <DayStrip selectedDay={selectedDay} onSelectDay={setSelectedDay} />

          {/* weekly menu — diet toggle + the selected day's lunch AND dinner
              (previously only one, chosen by an invisible global meal-time
              setting), in a bordered card like the rest of the screen's
              sections instead of floating plain text. */}
          <View className="rounded-2xl border border-border bg-card p-4" style={shadow.card}>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 14 }}>
              <AppText variant="overline" className="text-muted-foreground">
                WEEKLY MENU
              </AppText>
              {/* Only worth showing when there's actually a non-veg menu to
                  switch to for this day — a lone always-selected "Veg" pill
                  with no other option isn't a real toggle. */}
              {dayHasNonveg ? <DietToggle value={dietFilter} onChange={setDietFilterFromUser} /> : null}
            </View>
            {menuLoading ? (
              <View style={{ gap: 12 }}>
                <Skeleton width="100%" height={48} radius={14} />
                {!isBreakfastCategory ? <Skeleton width="100%" height={48} radius={14} /> : null}
              </View>
            ) : (
              // Keyed by the selected day so the day strip's own manual taps
              // AND the auto-advance timer both get the same fluid crossfade
              // — React treats the key change as unmount-old/mount-new,
              // which is what lets `exiting`/`entering` animate the swap.
              <Animated.View key={selectedDay} entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)}>
                {isBreakfastCategory ? (
                  // Breakfast categories have exactly one meal time, same as
                  // the Plan screen's meal-time picker already treats them
                  // (and the Ionic reference's own weekly-menu modal, which
                  // keys into `dayMenu.breakfast` instead of lunch/dinner and
                  // hides its Lunch/Dinner toggle for this exact category type).
                  <MealRow
                    icon={IconSun}
                    tone={palette.accent.offer}
                    label="Breakfast"
                    description={
                      selectedDayMenu?.breakfast?.description?.trim() ||
                      `Not published for ${selectedDay ?? 'this day'} yet.`
                    }
                  />
                ) : (
                  <View style={{ gap: 14 }}>
                    <MealRow
                      icon={IconSun}
                      tone={palette.accent.offer}
                      label="Lunch"
                      description={
                        selectedDayMenu?.lunch?.description?.trim() ||
                        `Not published for ${selectedDay ?? 'this day'} yet.`
                      }
                    />
                    <View style={{ height: 1, backgroundColor: colors.border }} />
                    <MealRow
                      icon={IconMoon}
                      tone={palette.accent.plan}
                      label="Dinner"
                      description={
                        selectedDayMenu?.dinner?.description?.trim() ||
                        `Not published for ${selectedDay ?? 'this day'} yet.`
                      }
                    />
                  </View>
                )}
              </Animated.View>
            )}
          </View>

          {/* what's included — swaps to the non-veg variant when the diet
              toggle is set to non-veg (see `includedItems` above) */}
          <View className='relative'>
            {includedItems?.length ? <IncludedChecklist categoryName={category.name} items={includedItems} /> : null}

            {/* check out more from our meals — cross-sell carousel to every
                other category in this cluster's catalog, between What's
                Included and the city banner. `marginHorizontal: -16` cancels
                the px-4 wrapper's own padding just for this row, so the
                carousel still bleeds edge-to-edge (like Home's testimonials
                strip) instead of scrolling inside a narrower inset area. */}
            {otherCategories.length > 0 ? (
              <View className="pt-6" style={{ marginHorizontal: -16 }}>
                <AppText variant="h3" className="px-4 text-foreground" style={{ marginBottom: 12 }}>
                  Check out more from our meals
                </AppText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 4 }}>
                  {otherCategories.map((c) => {
                    const prices = cheapestPriceLabels(packagesFor(c.param), c.homeTilePackageId);
                    return (
                      <MoreCategoryCard
                        key={c.param}
                        category={c}
                        priceLabel={prices?.current ?? null}
                        originalPriceLabel={prices?.original ?? null}
                        onPress={() => exploreCategory(c)}
                      />
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {/* city-specific "we deliver here" banner — renders nothing outside
              a known cluster (Pune/Kota/Bangalore/Mumbai) */}
            <CityBottomBanner />
          </View>
        </View>
      </Animated.ScrollView>

      {/* Sticky header — back button always present; fades from a floating
          pill over the hero photo into a solid bar with the category name
          beside it once scrolled past the hero (see `useScrollSolidHeader`).
          Sits on top of the ScrollView (later JSX siblings stack on top). */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: insets.top + STICKY_HEADER_HEIGHT,
              backgroundColor: colors.card,
            },
            backdropStyle,
          ]}
        />
        <View
          className="flex-row items-center px-4"
          style={{ height: insets.top + STICKY_HEADER_HEIGHT, paddingTop: insets.top, gap: 12 }}>
          <IconPillButton
            icon={IconArrowLeft}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            floating={!headerSolid}
          />
          {headerSolid ? (
            <AppText variant="title" className="flex-1 text-foreground" numberOfLines={1}>
              {category.name}
            </AppText>
          ) : null}
        </View>
      </View>

      {/* sticky CTA */}
      <View
        className="border-t border-border bg-card px-5 pt-3"
        style={[shadow.lifted, { paddingBottom: insets.bottom + 12 }]}>
        <Button label="Choose plan" block size="lg" onPress={choosePlan} />
      </View>
    </View>
  );
}

/** Shared circular icon button — the back button and the profile icon are
 * the exact same pill (size, radius, muted background), just a different
 * icon/handler, so both share this instead of duplicating the styling.
 * `floating` swaps the theme-based muted/foreground pair for a translucent
 * dark circle + white icon, for when the button sits directly over a photo
 * (e.g. the detail screen's hero) instead of a themed surface. */
function IconPillButton({
  icon: Icon,
  onPress,
  accessibilityLabel,
  floating = false,
}: {
  icon: ComponentType<IconProps>;
  onPress: () => void;
  accessibilityLabel: string;
  floating?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
      style={{ backgroundColor: floating ? 'rgba(0,0,0,0.35)' : colors.muted }}>
      <Icon size={20} color={floating ? '#ffffff' : colors.foreground} />
    </Pressable>
  );
}

/** Hero photo — full-bleed from the very top of the screen, behind the
 * status bar (its extra `insets.top` of height bleeds up behind it, same as
 * Home's `LottieHero`), so the visible photo area below the status bar still
 * matches `HERO_HEIGHT`. The back button lives in the screen-level sticky
 * header now (persists through the scroll, fading from floating-over-photo
 * to a solid bar), not here — see `SubscriptionDetailScreen`'s render. No
 * badge ribbon here (unlike the Home grid's `CategoryCard`) — the photo is
 * meant to read as a clean, full-bleed shot on this screen. Meal-time
 * selection used to live here too, but now lives exclusively on
 * `subscription-plan.tsx`. */
function HeroBlock({ category }: { category: SubCategory }) {
  const insets = useSafeAreaInsets();
  // `detailImage` is a distinct, detail-screen-only photo for categories that
  // have one (currently just Classic Thali) — the tile/card grid elsewhere
  // keeps showing `image` either way, since only this hero reads `detailImage`.
  const heroImage = category.detailImage ?? category.image;
  return (
    <View style={{ height: insets.top + HERO_HEIGHT }}>
      {heroImage ? (
        <Image source={heroImage} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: accentTint(palette.accent.food, 0.14),
          }}>
          <IconUtensils size={48} color={palette.accent.food} />
        </View>
      )}
    </View>
  );
}

/** Inline Sun–Sat day strip — no separate "full week" sheet. Every day used
 * to show the same category photo repeated 7 times over (misleadingly
 * implying a different dish per day) — now a plain filled/outlined pill per
 * day, same convention a calendar-style day-picker uses elsewhere in the
 * app. Selecting a day is the only interaction. */
function DayStrip({
  selectedDay,
  onSelectDay,
}: {
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}) {
  const colors = useColors();
  return (
    <View>
      <AppText variant="overline" className="text-muted-foreground" style={{ marginBottom: 10 }}>
        CHOOSE A DAY TO VIEW MENU
      </AppText>
      <View className="flex-row justify-between">
        {DAYS.map((d) => {
          const active = d.full === selectedDay;
          return (
            <Pressable
              key={d.full}
              onPress={() => onSelectDay(d.full)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? palette.brand.green : colors.muted,
              }}>
              <AppText
                variant="bodySm"
                weight="bold"
                style={{ color: active ? '#ffffff' : colors.mutedForeground }}>
                {d.short}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** One meal-time row in the Weekly Menu card — icon tile + label + that
 * day's dish description, same tile pattern `DetailRow`/`FirstDeliveryNote`
 * already use elsewhere for a label+value pairing, instead of plain
 * floating text stacks. */
function MealRow({
  icon: Icon,
  tone,
  label,
  description,
}: {
  icon: ComponentType<IconProps>;
  tone: string;
  label: string;
  description: string;
}) {
  return (
    <View className="flex-row items-start gap-3">
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: accentTint(tone, 0.14),
        }}>
        <Icon size={17} color={tone} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="label" className="text-muted-foreground">
          {label}
        </AppText>
        <AppText variant="title" className="text-foreground" style={{ marginTop: 2 }}>
          {description}
        </AppText>
      </View>
    </View>
  );
}

/** Two-segment Veg/Non-veg display toggle — screen-local (see `dietFilter` on
 * the screen component), not the app's global `vegModeStore`. Same
 * pill-in-a-track shape as `@/components/ui/Toggle`, just a 2-option
 * segmented control instead of a boolean, since both display options need a
 * visible label here. */
function DietToggle({
  value,
  onChange,
}: {
  value: 'veg' | 'nonveg';
  onChange: (value: 'veg' | 'nonveg') => void;
}) {
  const colors = useColors();
  const options = [
    { key: 'veg' as const, label: 'Veg' },
    { key: 'nonveg' as const, label: 'Non-veg' },
  ];
  return (
    <View className="flex-row rounded-full p-1" style={{ backgroundColor: colors.muted }}>
      {options.map((option) => {
        const active = value === option.key;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
            style={active ? [shadow.card, { backgroundColor: colors.card }] : undefined}>
            <DietMark veg={option.key === 'veg'} size={11} />
            <AppText
              variant="caption"
              weight={active ? 'bold' : undefined}
              className={active ? 'text-foreground' : 'text-muted-foreground'}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One card in the "check out more from our meals" carousel — a compact,
 * tap-to-explore tile (photo, name, starting price), lighter than the Home
 * grid's `CategoryCard` (no badge ribbon or "View more" button) since this
 * is a cross-sell strip, not the primary browse surface. */
function MoreCategoryCard({
  category,
  priceLabel,
  originalPriceLabel,
  onPress,
}: {
  category: SubCategory;
  priceLabel: string | null;
  /** Pre-discount price to show struck through next to `priceLabel` — same
   * "Starting at" pattern Home's `CategoryCard` uses, `null` when the
   * cheapest plan carries no discount. */
  originalPriceLabel: string | null;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[shadow.card, { width: 156, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.card }]}
      className="active:opacity-90">
      <View style={{ height: 100 }}>
        <CategoryThumbnail image={category.image} iconSize={22} />
      </View>
      <View className="gap-0.5 p-2.5">
        <AppText variant="label" className="text-foreground" numberOfLines={1}>
          {category.name}
        </AppText>
        {priceLabel ? (
          <View style={{ marginTop: 2 }}>
            <AppText variant="caption" className="text-muted-foreground">
              Starting at
            </AppText>
            <View className="flex-row items-baseline" style={{ gap: 5 }}>
              <AppText variant="label" className="text-foreground" numberOfLines={1}>
                {priceLabel}
              </AppText>
              {originalPriceLabel ? (
                <AppText
                  variant="caption"
                  className="text-muted-foreground"
                  numberOfLines={1}
                  style={{ textDecorationLine: 'line-through' }}>
                  {originalPriceLabel}
                </AppText>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

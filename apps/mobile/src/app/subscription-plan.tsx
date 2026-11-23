import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { IconMoon, IconSuggestion, IconSun, IconUtensils, IconCheckCircle } from '@/components/ui/icons';
import {
  MealSlot,
  PlanTierCard,
  PLAN_TIER_CARD_WIDTH,
  finalPrice,
  perDay,
  pickDefaultPackage,
  formatMealTimeWindow,
  aiRecommendationCopy,
  useConfigureStore,
  useSubscriptionBrowseStore,
  useSubscriptionCatalog,
  type MealPackage,
  type SubCategory,
} from '@/features/subscription';
import { CategoryThumbnail } from '@/features/subscription/components/CategoryThumbnail';
import { StepProgress } from '@/features/subscription/components/StepProgress';
import { trackProductView, useScreenTracking } from '@/services/netcore';
import { palette, accentTint, shadow, useColors } from '@/theme';
import { formatINR } from '@/utils/currency';

/** Matches the plan row's own `contentContainerStyle={{ gap: 12 }}` — kept
 * as one constant so the auto-scroll math below can't drift from it. */
const PLAN_TIER_GAP = 12;

/**
 * Subscription plan picker — step 2 of the "Choose plan" hand-off from
 * `subscription-detail.tsx`. Shows the category + meal time chosen on Detail
 * (both still adjustable here), a package/duration list, and an AI savings
 * tip, then hands the final `{ category, package }` selection off to the
 * shared `useConfigureStore` — same contract `DineInHome` uses — before
 * pushing into the existing `/subscription-configure` (Extras/Setup) screen.
 */
export default function SubscriptionPlanScreen() {
  useScreenTracking('subscription_plan');

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();

  const category = useSubscriptionBrowseStore((s) => s.category);
  const setSelectedPackage = useSubscriptionBrowseStore((s) => s.setSelectedPackage);
  const setConfigureContext = useConfigureStore((s) => s.set);

  const { packagesFor, loading: catalogLoading } = useSubscriptionCatalog();
  const packages = useMemo(() => (category ? packagesFor(category.param) : []), [category, packagesFor]);
  // Breakfast-category packages (MealPackage.isBreakFast, mirrors
  // MealaweUserApp's `pacakge.isBreakFast` check) have no lunch/dinner choice
  // at all. Checked with `.some`, not `packages[0]`: a package can land in
  // this bucket via its comma-separated `searchCategory` tags even when its
  // real `packageCategory` isn't Breakfast (see `loadGroupedPackages` in
  // `features/subscription/api.ts`), and the bucket is sorted only by
  // `days` — ties leave backend order deciding what index 0 is, so reading
  // `packages[0].isBreakFast` alone could miss a genuine breakfast package
  // sitting later in the array.
  const isBreakfast = packages.some((p) => p.isBreakFast === true);

  // Which of lunch/dinner this category actually accepts, per its admin-set
  // `mealTimes` (SubscriptionCategory) — an unmigrated category with no
  // `mealTimes` configured yet still shows both, same as before this existed,
  // rather than showing neither.
  const lunchWindow = category?.mealTimes?.find((m) => m.mealType === 'lunch');
  const dinnerWindow = category?.mealTimes?.find((m) => m.mealType === 'dinner');
  const breakfastWindow = category?.mealTimes?.find((m) => m.mealType === 'breakfast');
  const breakfastTimeLabel = breakfastWindow
    ? formatMealTimeWindow(breakfastWindow.startTime, breakfastWindow.endTime)
    : '7–9 AM';
  const mealTimesConfigured = !!category?.mealTimes?.length;
  const showLunch = !mealTimesConfigured || !!lunchWindow;
  const showDinner = !mealTimesConfigured || !!dinnerWindow;
  const showBoth = showLunch && showDinner;
  // Same fallback strings the individual Lunch/Dinner tiles below use when a
  // category hasn't had `mealTimes` configured yet — "Both" used to require
  // BOTH windows to be admin-set before showing any time at all, falling back
  // to the bare label "Lunch + Dinner" otherwise. That read as broken next to
  // Lunch/Dinner, which always show a real-looking time. Building each half
  // the same way the individual tiles do (real window, else this fallback)
  // means "Both" always shows a time too, admin-configured or not.
  const lunchTimeLabel = lunchWindow ? formatMealTimeWindow(lunchWindow.startTime, lunchWindow.endTime) : '12–1:30 PM';
  const dinnerTimeLabel = dinnerWindow ? formatMealTimeWindow(dinnerWindow.startTime, dinnerWindow.endTime) : '7:30–9 PM';
  const bothTimeLabel = `${lunchTimeLabel} & ${dinnerTimeLabel}`;

  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(null);
  // A single mutually-exclusive choice — Lunch, Dinner, or explicitly Both —
  // rather than two independent toggles, so the user always sees exactly
  // which meal(s) they're getting instead of having to infer it from two
  // checkboxes (moved here from the old Configure-screen picker so meal time
  // is decided alongside the package/duration). Ignored entirely for
  // breakfast categories.
  const [mealSelection, setMealSelection] = useState<'lunch' | 'dinner' | 'both'>('lunch');
  // If the category only accepts one of lunch/dinner, keep the selection
  // pinned to whichever one is actually available instead of leaving a
  // stale/impossible choice selected (e.g. category went dinner-only after
  // defaulting to 'lunch' above).
  useEffect(() => {
    // Breakfast categories show neither Lunch nor Dinner (see the Meal Time
    // section's own `isBreakfast` branch below) — `mealSelection` is inert
    // for them, so this correction must never run at all. Without this
    // guard, a breakfast category whose admin-set `mealTimes` only lists a
    // breakfast window (no lunch/dinner) makes `showLunch`/`showDinner` both
    // false, and the branches below ping-pong `mealSelection` between
    // 'lunch' and 'dinner' forever — each "fix" immediately re-triggers the
    // same "still not showable" check for the other value ("Maximum update
    // depth exceeded").
    if (isBreakfast) {
      return;
    }
    // Guarded with `showDinner`/`showLunch` (not the old unconditional
    // fallback) so a pathological config where NEITHER is showable — should
    // never happen outside breakfast, but costs nothing to guard against —
    // leaves `mealSelection` alone instead of looping the same way.
    if (mealSelection === 'both' && !showBoth) {
      if (showDinner) setMealSelection('dinner');
      else if (showLunch) setMealSelection('lunch');
    } else if (mealSelection === 'lunch' && !showLunch) {
      if (showDinner) setMealSelection('dinner');
    } else if (mealSelection === 'dinner' && !showDinner) {
      if (showLunch) setMealSelection('lunch');
    }
  }, [isBreakfast, showLunch, showDinner, showBoth, mealSelection]);
  const lunch = mealSelection === 'lunch' || mealSelection === 'both';
  const dinner = mealSelection === 'dinner' || mealSelection === 'both';
  const mealsPerDay = isBreakfast ? 1 : mealSelection === 'both' ? 2 : 1;

  const planScrollRef = useRef<ScrollView>(null);
  // Only auto-scroll the horizontal plan row once, for the initial default
  // selection below — a later manual tap shouldn't fight the user's own
  // scroll position.
  const didAutoScrollRef = useRef(false);
  // Drives the right-edge fade below — true whenever there's more of the
  // plan row to scroll to, so a user landing on (say) the 10-day default
  // still sees a clear "there are other plans" cue even when it isn't the
  // first or last card. Starts true (most categories offer more than one
  // duration) and turns off once an actual scroll event confirms the row is
  // fully scrolled to its end.
  const [canScrollMorePlans, setCanScrollMorePlans] = useState(packages.length > 1);

  function onPlanRowScroll(e: NativeSyntheticEvent<NativeScrollEvent>): void {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const atEnd = contentOffset.x + layoutMeasurement.width >= contentSize.width - 4;
    setCanScrollMorePlans(!atEnd);
  }

  // Default selection: the server's `isDefaultSelection` flag, else
  // `isBestSeller`, else the cheapest ₹/day plan — the one rule shared with
  // Dine In and the plan tier ribbon (`pickDefaultPackage`), so this can never
  // disagree with what's badged "MOST POPULAR" again.
  const defaultPkgId = useMemo(() => pickDefaultPackage(packages)?._id ?? null, [packages]);
  // The id that actually renders as selected — the user's own tap
  // (`selectedPkgId`) when it's still valid for the current `packages` list,
  // else the default. A plain synchronous derivation, not a `useEffect` that
  // used to set `selectedPkgId` itself a tick after `packages` first
  // resolved — that left the very first render with real package data
  // showing no card highlighted at all until the effect caught up and
  // forced a second render ("selected plan not visible on init"). This way
  // the correct card is already selected on the same render `packages`
  // arrives.
  const validSelectedId =
    selectedPkgId && packages.some((p) => p._id === selectedPkgId) ? selectedPkgId : defaultPkgId;

  // That default is usually the longest (cheapest-per-meal) plan, not
  // necessarily the first card — scroll it into view once packages/selection
  // resolve, so it isn't left off-screen to the right on first load. Centered
  // in the viewport (not pinned to the left edge) so the selected card reads
  // as "the one you're looking at" with peeks of its neighbors on both
  // sides, same as a carousel would. The row bleeds to the full window width
  // via `marginHorizontal: -16` below, so `windowWidth` is its real viewport;
  // `+ 16` accounts for the content's own re-added horizontal padding.
  useEffect(() => {
    if (didAutoScrollRef.current || !validSelectedId || !packages.length) {
      return;
    }
    const index = packages.findIndex((p) => p._id === validSelectedId);
    if (index < 0) {
      return;
    }
    didAutoScrollRef.current = true;
    const cardLeft = index * (PLAN_TIER_CARD_WIDTH + PLAN_TIER_GAP) + 16;
    const centeredX = cardLeft - (windowWidth - PLAN_TIER_CARD_WIDTH) / 2;
    planScrollRef.current?.scrollTo({ x: Math.max(0, centeredX), animated: true });
  }, [validSelectedId, packages, windowWidth]);

  // `packages` is still empty on first render (the catalog fetch is async),
  // so the `useState` initializer above can't see the real count — sync it
  // once real data arrives. Harmless to keep firing after that: `packages`'
  // reference is stable once loaded, so this only meaningfully runs once.
  useEffect(() => {
    setCanScrollMorePlans(packages.length > 1);
  }, [packages]);

  const selectedPackage = useMemo(
    () => packages.find((p) => p._id === validSelectedId) ?? packages[0] ?? null,
    [packages, validSelectedId],
  );

  // The store is the next screen's (and this screen's own CTA's) source of
  // truth for "what's currently picked" — keep it in sync with every change,
  // including the initial default so it's never stale/empty.
  useEffect(() => {
    setSelectedPackage(selectedPackage);
    if (selectedPackage) {
      trackProductView(selectedPackage.packageName ?? category?.name ?? '', category?.name, finalPrice(selectedPackage));
    }
  }, [selectedPackage, setSelectedPackage, category]);

  const handleNext = (): void => {
    if (!category || !selectedPackage) {
      return;
    }
    setConfigureContext({
      package: selectedPackage,
      category: category.name,
      lunch: isBreakfast ? false : lunch,
      dinner: isBreakfast ? false : dinner,
      breakfast: isBreakfast,
    });
    router.push('/subscription-configure');
  };

  if (!category) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ headerShown: true, title: 'Choose your plan' }} />
        <StatusBar style="auto" />
        <View className="flex-1 items-center justify-center px-10">
          <AccentIcon icon={IconUtensils} tone="food" size={26} tileSize={56} />
          <AppText variant="title" className="text-foreground" style={{ marginTop: 12, textAlign: 'center' }}>
            No category selected
          </AppText>
          <AppText
            variant="bodySm"
            className="text-muted-foreground"
            style={{ marginTop: 4, textAlign: 'center' }}>
            Head back and pick a category to see its plans.
          </AppText>
          <View style={{ marginTop: 16 }}>
            <Button label="Go back" variant="outline" onPress={() => router.back()} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Choose your plan' }} />
      <StatusBar style="auto" />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom, gap: 24 }}
        showsVerticalScrollIndicator={false}>
        <StepProgress step={1} />

        <CategorySummaryRow category={category} onChange={() => router.back()} />

        <View>
          <AppText variant="overline" className="text-muted-foreground" style={{ marginBottom: 10 }}>
            MEAL TIME
          </AppText>
          {catalogLoading ? (
            // `isBreakfast` depends on the fetched packages (mirrors the
            // backend's per-package `isBreakFast` flag) — on the very first
            // render `packages` is still empty, so `isBreakfast` would
            // default to false and briefly show the Lunch/Dinner/Both
            // selector even for a Breakfast category, self-correcting only
            // once the catalog loads and re-renders. A skeleton here avoids
            // that wrong-then-right flash entirely.
            <Skeleton width="100%" height={64} radius={14} />
          ) : isBreakfast ? (
            // Breakfast packages have exactly one meal time — nothing to
            // toggle, so this always renders as the selected state (same
            // `MealSlot` used for Lunch/Dinner, so it visually reads as
            // "selected" instead of a plain neutral info card).
            <View className="flex-row gap-2">
              <MealSlot label="Breakfast" time={breakfastTimeLabel} tone={palette.accent.offer} Icon={IconSun} active onPress={() => { }} />
            </View>
          ) : (
            <View className="flex-row gap-2">
              {showLunch ? (
                <MealSlot
                  compact
                  label="Lunch"
                  time={lunchTimeLabel}
                  tone={palette.accent.offer}
                  Icon={IconSun}
                  active={mealSelection === 'lunch'}
                  onPress={() => setMealSelection('lunch')}
                />
              ) : null}
              {showDinner ? (
                <MealSlot
                  compact
                  label="Dinner"
                  time={dinnerTimeLabel}
                  tone={palette.accent.plan}
                  Icon={IconMoon}
                  active={mealSelection === 'dinner'}
                  onPress={() => setMealSelection('dinner')}
                />
              ) : null}
              {showBoth ? (
                <MealSlot
                  compact
                  label="Both"
                  time={bothTimeLabel}
                  tone={palette.accent.veg}
                  Icon={IconCheckCircle}
                  active={mealSelection === 'both'}
                  onPress={() => setMealSelection('both')}
                />
              ) : null}
            </View>
          )}
        </View>

        <View>
          <AppText variant="h2" className="text-foreground">
            Choose your plan
          </AppText>
          <AppText variant="bodySm" className="text-muted-foreground" style={{ marginTop: 2 }}>
            Longer plan, lower per meal
          </AppText>

          <View style={{ marginTop: 16 }}>
            {catalogLoading ? (
              <PlanListSkeleton />
            ) : packages.length === 0 ? (
              <AppText variant="bodySm" className="text-muted-foreground">
                No plans available for this category yet.
              </AppText>
            ) : (
              // Bleeds past the screen's own 16px padding so the next tile
              // always peeks in at the edge — the "there's more, scroll me"
              // signal — then re-adds that 16px as scroll-content padding so
              // the tiles themselves still line up with the rest of the page.
              <View style={{ position: 'relative' }}>
                <ScrollView
                  ref={planScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  onScroll={onPlanRowScroll}
                  scrollEventThrottle={32}
                  style={{ marginHorizontal: -16 }}
                  // `paddingTop`/`paddingBottom` give `PlanTierCard`'s
                  // absolutely-positioned "MOST POPULAR" ribbon (pokes above
                  // the card) and its selected-state scale-up (grows from
                  // center, so the bottom edge moves outward too) room inside
                  // the ScrollView's clip bounds — ScrollView, unlike a plain
                  // View, clips its content to its own bounds by default, so
                  // without this a selected card's grown bottom edge would be
                  // cut off / read as "hidden behind" whatever section
                  // follows this row.
                  contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: PLAN_TIER_GAP }}>
                  {packages.map((pkg) => (
                    <PlanTierCard
                      key={pkg._id ?? pkg.packageName}
                      pkg={pkg}
                      mealsPerDay={mealsPerDay}
                      selected={pkg._id === validSelectedId}
                      onPress={() => setSelectedPkgId(pkg._id ?? null)}
                    />
                  ))}
                </ScrollView>
                {/* Right-edge fade — the same "there's more" cue Swiggy/
                    Zomato-style horizontal card rows use, on top of the raw
                    peek above so it reads clearly even when the default
                    10-day plan lands mid-row rather than as the first card. */}
                {canScrollMorePlans ? (
                  <LinearGradient
                    colors={[`${colors.background}00`, colors.background]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    pointerEvents="none"
                    style={{ position: 'absolute', top: 0, right: -16, bottom: 0, width: 40 }}
                  />
                ) : null}
              </View>
            )}
          </View>
        </View>

        {selectedPackage ? (
          <AiRecommendationCard pkg={selectedPackage} allPackages={packages} />
        ) : null}
      </ScrollView>

      {/* sticky CTA — price stacked above a full-width button, same layout
          as Configure's "Review & pay" footer, instead of squeezing a
          fixed-width button in beside the price. */}
      <View
        className="border-t border-border bg-card px-5 pt-3"
        style={[shadow.lifted, { gap: 12, paddingBottom: insets.bottom + 12 }]}>
        {selectedPackage ? (
          <View className="flex-row items-center justify-between">
            <AppText variant="bodySm" className="text-muted-foreground">
              {selectedPackage.days * mealsPerDay} meals · {formatINR(perDay(selectedPackage))} each
            </AppText>
            <AppText variant="h3" className="text-foreground">
              {formatINR(finalPrice(selectedPackage) * mealsPerDay)}
            </AppText>
          </View>
        ) : null}
        <Button
          label="Next: set up"
          size="lg"
          block
          onPress={handleNext}
          disabled={!selectedPackage}
        />
      </View>
    </View>
  );
}

/** Category thumbnail + name + a short sub-line + a "Change" link back to
 * Detail — lets the user confirm (or bail out and change) the category
 * without losing their place in the Plan flow. */
function CategorySummaryRow({
  category,
  onChange,
}: {
  category: SubCategory;
  onChange: () => void;
}) {
  return (
    <View className="flex-row items-center" style={{ gap: 12 }}>
      <CategoryThumbnail image={category.image} size={52} iconSize={20} radius={14} />
      <View style={{ flex: 1 }}>
        <AppText variant="title" className="text-foreground">
          {category.name}
        </AppText>
        <AppText variant="bodySm" className="text-muted-foreground" numberOfLines={1}>
          {category.tagline || 'Delivered fresh, daily'}
        </AppText>
      </View>
      <Pressable onPress={onChange} accessibilityRole="button" accessibilityLabel="Change category" hitSlop={8}>
        <AppText variant="label" className="text-primary">
          Change
        </AppText>
      </Pressable>
    </View>
  );
}

/** Light-green tip card — the bulb icon + `aiRecommendationCopy`'s pure,
 * derived-from-real-prices copy (never fabricated numbers). */
function AiRecommendationCard({
  pkg,
  allPackages,
}: {
  pkg: MealPackage;
  allPackages: readonly MealPackage[];
}) {
  return (
    <View
      className="flex-row rounded-2xl p-4"
      style={{ backgroundColor: accentTint(palette.brand.green, 0.12), gap: 12 }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: accentTint(palette.brand.green, 0.25),
        }}>
        <IconSuggestion size={18} color={palette.brand.greenDark} />
      </View>
      <AppText variant="bodySm" className="text-foreground" style={{ flex: 1 }}>
        {aiRecommendationCopy(pkg, allPackages)}
      </AppText>
    </View>
  );
}

/** Matches `PlanTierCard`'s fixed width/shape so the loading state doesn't
 * jump in size once real plans replace it. */
function PlanListSkeleton() {
  return (
    <View className="flex-row" style={{ gap: 12 }}>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} width={PLAN_TIER_CARD_WIDTH} height={196} radius={18} />
      ))}
    </View>
  );
}

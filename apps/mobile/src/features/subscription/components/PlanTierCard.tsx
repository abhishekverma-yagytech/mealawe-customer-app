import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { PriceWithOriginal } from '@/components/ui/PriceWithOriginal';
import { palette, accentTint, useColors } from '@/theme';
import { formatINR } from '@/utils/currency';

import { finalPrice, originalPerDay, perDay, planTag } from '../pricing';
import type { MealPackage } from '../types';

/** Fixed tile width for the horizontally-scrolling plan row — narrow enough
 * that the next tile always peeks in at the edge, hinting there's more to
 * scroll to. */
export const PLAN_TIER_CARD_WIDTH = 156;

const SELECT_ANIM_MS = 220;
const CARD_RADIUS = 18;

interface PlanTierCardProps {
  pkg: MealPackage;
  /** Meals/day the user has toggled (Lunch/Dinner/Breakfast) — scales the
   * meal count and total price the same way the screen's sticky-footer total
   * does, so this card's numbers never drift from the actual checkout total. */
  mealsPerDay: number;
  selected: boolean;
  onPress: () => void;
}

/**
 * Fixed-width plan tile for the horizontally-scrolling "Choose your plan"
 * row — duration + meal count, per-meal price (current + struck-through
 * original), the plan's total (current + struck-through original), and the
 * flat ₹ saved by this package's own discount. "Save up to" used to be a
 * cross-plan comparison (`planSaveAmount`, vs. the category's priciest plan)
 * that could disagree with the current/original prices shown right above
 * it — now it's just `originalTotal - total`, so it always matches exactly.
 * No per-card CTA: selecting a tile is enough, the screen's single sticky
 * "Next: set up" button is the only confirm action (see
 * `subscription-plan.tsx`). Selecting a tile fluidly grows it and animates
 * its border/tint in (`useAnimatedStyle` below) rather than snapping, so the
 * chosen plan reads as physically "lifted" out of the row. "MOST POPULAR"
 * tags whichever tile `pickDefaultPackage` would actually preselect
 * (`isDefaultSelection`, else `isBestSeller`) — the same signal driving the
 * real selection, so the ribbon can never badge a different tile than the one
 * that's actually chosen. It's absolutely positioned (a corner ribbon, not a
 * layout row) so a tile with no badge doesn't carry a reserved empty gap
 * above its name — every tile's content starts at the same top offset either
 * way, badge or not.
 */
export function PlanTierCard({ pkg, mealsPerDay, selected, onPress }: PlanTierCardProps) {
  const colors = useColors();
  const perMeal = perDay(pkg);
  const originalPerMeal = originalPerDay(pkg);
  const totalMeals = pkg.days * mealsPerDay;
  const total = finalPrice(pkg) * mealsPerDay;
  const originalTotal = pkg.packagePrice * mealsPerDay;
  const hasDiscount = (pkg.discount || 0) > 0;
  const save = originalTotal - total;
  const isRecommended = pkg.isDefaultSelection || pkg.isBestSeller;

  // `accentTint`/theme colors are precomputed here (plain JS) rather than
  // inside `useAnimatedStyle` below, which runs as a UI-thread worklet and
  // can't call non-worklet functions.
  const selectedBg = accentTint(palette.brand.green, 0.08);
  const unselectedBg = colors.card;
  const unselectedBorder = colors.border;

  const reduced = useReducedMotion();
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    progress.value = reduced ? (selected ? 1 : 0) : withTiming(selected ? 1 : 0, { duration: SELECT_ANIM_MS });
  }, [selected, reduced, progress]);

  const animatedCardStyle = useAnimatedStyle(() => ({
    borderWidth: interpolate(progress.value, [0, 1], [1, 2]),
    borderColor: interpolateColor(progress.value, [0, 1], [unselectedBorder, palette.brand.green]),
    backgroundColor: interpolateColor(progress.value, [0, 1], [unselectedBg, selectedBg]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 1.04]) }],
  }));

  // TODO: selected-state "snake" border animation (a segment traveling
  // around the card's perimeter) removed temporarily — re-add later.

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{ width: PLAN_TIER_CARD_WIDTH }}
      className="active:opacity-90">
      <Animated.View style={[{ borderRadius: CARD_RADIUS, padding: 14 }, animatedCardStyle]}>
        {isRecommended ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: -10, left: 0, right: 0, alignItems: 'center' }}>
            <View
              style={{
                backgroundColor: palette.accent.offer,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 8,
              }}>
              <AppText variant="overline" className="text-white">
                MOST POPULAR
              </AppText>
            </View>
          </View>
        ) : null}

        {/* The package's own admin-set name (e.g. "Weekly Thali") when there is
            one — the real source of truth for what this tier is actually
            called — falling back to the computed duration bucket only when a
            package has no name at all. `planTag`'s buckets are coarse (e.g.
            "Trial" covers every plan of 6 days or fewer), so a real but
            short-duration plan like a 6-day weekly pack could otherwise read
            as a "Trial" it isn't. */}
        <AppText variant="label" className="text-foreground">
          {pkg.packageName?.trim() || `${planTag(pkg)} Plan`}
        </AppText>
        <AppText variant="caption" className="text-muted-foreground" style={{ marginTop: 4 }}>
          {pkg.days} Days / {totalMeals} meals
        </AppText>
        <View style={{ marginTop: 12 }}>
          <PriceWithOriginal
            price={`${formatINR(perMeal)} /meal`}
            originalPrice={originalPerMeal > perMeal ? formatINR(originalPerMeal) : null}
            priceVariant="bodySm"
            gap={6}
          />
        </View>
        <View style={{ marginTop: 2 }}>
          <PriceWithOriginal
            price={formatINR(total)}
            originalPrice={hasDiscount ? formatINR(originalTotal) : null}
            priceVariant="h2"
            gap={6}
          />
        </View>
        {save > 0 ? (
          <AppText variant="caption" style={{ color: palette.brand.green, marginTop: 6 }}>
            Save up to {formatINR(save)}
          </AppText>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

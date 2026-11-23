import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { DietMark } from '@/components/ui/DietMark';
import { IconUtensils } from '@/components/ui/icons';
import { PriceWithOriginal } from '@/components/ui/PriceWithOriginal';
import { palette, accentTint, useColors, type AccentTone } from '@/theme';
import { formatINR } from '@/utils/currency';

import { finalPrice, offPercent } from '../pricing';
import { packageImageUri } from '../media';
import type { MealPackage } from '../types';

interface PlanCardProps {
  pkg: MealPackage;
  /** Tapping the whole card (image or body) hands off straight to Configure
   * — there's no separate select-then-Continue step, so the card carries no
   * selected/unselected visual state of its own. Omit this (and pass `onAdd`
   * instead) for contexts like the cart's "Other Plans" swap row, where a
   * plan-replacing action needs a deliberate tap target, not a whole-card one. */
  onPress?: () => void;
  /** Renders a dedicated "Add" button instead of making the whole card
   * pressable — for suggestion contexts (e.g. the cart's "Other Plans" row)
   * where the card is shown alongside other content the user might tap/scroll
   * near, and an accidental whole-card tap triggering a plan-replace
   * confirmation would be surprising. Mutually exclusive with `onPress` in
   * practice — pass exactly one. */
  onAdd?: () => void;
  /** Static category image used when the package has no photo. */
  fallbackImage?: number;
  /**
   * Order-mode accent — Dine In passes `tone="food"` since this card is
   * shared between Subscription and Dine In. Ignored (green stays) when
   * omitted. See the Order-Mode CTA Rule in DESIGN.md.
   */
  tone?: AccentTone;
  /** Total meals over the whole plan (days × meals/day) — omit to hide the
   * badge (e.g. a package whose meal time isn't determinable). */
  mealCount?: number;
}

/**
 * A single plan tile in a 2-column grid. Shows the dish image, a POPULAR
 * badge (`isBestSeller`), the package name, a meal-count badge and a
 * discount badge side by side, and the discounted price with the struck
 * original.
 */
export function PlanCard({
  pkg,
  onPress,
  onAdd,
  fallbackImage,
  tone,
  mealCount,
}: PlanCardProps) {
  const colors = useColors();
  const uri = packageImageUri(pkg);
  const imageSource = uri ? { uri } : fallbackImage;
  const price = finalPrice(pkg);
  const off = offPercent(pkg);
  const hasDiscount = (pkg.discount || 0) > 0;
  const accent = tone ? palette.accent[tone] : palette.brand.green;
  const CardContainer = onPress ? Pressable : View;
  // Dine In gets its own reference-matched treatment (scalloped meals-count
  // sticker, plain-text off%, a veg/non-veg dot on the image) — every other
  // caller (Subscription's own grid, the cart's "Other Plans" row) keeps the
  // existing pill-badge look untouched. `tone === 'food'` is Dine In's own
  // accent everywhere else in the app (Order-Mode CTA Rule), so it's already
  // the right signal here without a separate `isDineIn` prop.
  const dineInStyle = tone === 'food';

  return (
    <CardContainer
      {...(onPress ? { onPress, accessibilityRole: 'button' as const } : {})}
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        borderRadius: 18,
        overflow: 'hidden',
      }}
      className={onPress ? 'active:opacity-90' : undefined}
    >
      {/* image */}
      <View style={{ height: 96 }}>
        {imageSource ? (
          <Image source={imageSource} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: accentTint(palette.accent.food, 0.14),
            }}
          >
            <IconUtensils size={28} color={palette.accent.food} />
          </View>
        )}
        {pkg.isBestSeller ? (
          <View
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              backgroundColor: palette.accent.offer,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
            }}
          >
            <AppText variant="overline" className="text-white">
              POPULAR
            </AppText>
          </View>
        ) : null}
        {dineInStyle && pkg.packageType ? (
          <View style={{ position: 'absolute', top: 8, left: 8 }}>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <DietMark veg={pkg.packageType === 'Veg'} size={13} />
            </View>
          </View>
        ) : null}
      </View>

      {/* body */}
      <View style={{ padding: 12, gap: 6 }}>
        {pkg.packageName ? (
          <AppText variant="label" className="text-foreground">
            {pkg.packageName}
          </AppText>
        ) : null}
        <View className="flex-row flex-wrap items-center" style={{ gap: 6 }}>
          {dineInStyle ? (
            typeof mealCount === 'number' && mealCount > 0 ? (
              <MealsBadgeShape label={`(${mealCount} Meals)`} />
            ) : null
          ) : typeof mealCount === 'number' && mealCount > 0 ? (
            <Badge tone={accent} label={`${mealCount} Meals`} />
          ) : null}
          {off > 0 && !dineInStyle ? <Badge tone={palette.accent.offer} label={`Upto ${off}% off`} /> : null}
        </View>
        {off > 0 && dineInStyle ? (
          <AppText variant="caption" style={{ color: palette.accent.offer, fontWeight: '700' }}>
            UPTO {off}% OFF
          </AppText>
        ) : null}
        <View className="flex-row items-end justify-between" style={{ gap: 8 }}>
          <PriceWithOriginal
            price={formatINR(price)}
            originalPrice={hasDiscount ? formatINR(pkg.packagePrice) : null}
            priceVariant="title"
          />
          {onAdd ? (
            <Button label="Add" size="sm" variant="outline" accentColor={accent} onPress={onAdd} />
          ) : null}
        </View>
      </View>
    </CardContainer>
  );
}

function Badge({ tone, label }: { tone: string; label: string }) {
  return (
    <View
      style={{
        backgroundColor: accentTint(tone, 0.14),
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
      }}
    >
      <AppText variant="caption" style={{ color: tone }}>
        {label}
      </AppText>
    </View>
  );
}

/**
 * Dine In's "(N Meals)" pill — the scalloped sticker shape from the provided
 * reference design (`Shape.svg`), not the plain rounded pill every other
 * `Badge` here uses. Rendered as a PNG (pre-exported from the source SVG at
 * 4x resolution) rather than an inline `react-native-svg` component —
 * `react-native-svg`'s percentage-based width/height inside an
 * absolutely-positioned parent wasn't reliably filling its container on
 * device, leaving the label crowding or poking past the shape's edge no
 * matter how much padding this got. A raster `Image` with a fixed pixel
 * size sidesteps that layout ambiguity entirely — every other decorative
 * shape in this app (tree-plantation art, the login hero poster) is a
 * raster asset for the same reason, not an inline SVG.
 *
 * Fixed size rather than stretched-to-label-width: the shape's safe zone is
 * generous enough at this size for any realistic meal count (checked up to
 * 3 digits), and a uniform badge size reads tidier across a grid of cards
 * than one that changes proportions per card.
 */
function MealsBadgeShape({ label }: { label: string }) {
  return (
    <View style={{ width: 92, height: 27, alignItems: 'center', justifyContent: 'center' }}>
      <Image
        source={require('@/assets/images/subscription/meals-badge-shape.png')}
        style={StyleSheet.absoluteFill}
        contentFit="fill"
      />
      <AppText
        variant="caption"
        className="text-white"
        numberOfLines={1}
        style={{ fontWeight: '700', paddingHorizontal: 10 }}>
        {label}
      </AppText>
    </View>
  );
}

import { View } from 'react-native';

import { AppText } from './AppText';
import type { TextVariant } from '@/theme';

interface PriceWithOriginalProps {
  /** Current (post-discount) price, already formatted (e.g. "₹89/meal"). */
  price: string;
  /** Pre-discount price to show struck through — omit or pass `null`/`undefined` when there's no discount to show. */
  originalPrice?: string | null;
  /** Variant for the current price. The struck-through original always
   * renders at `caption` (the app's smallest established size for this
   * pattern — see docs/superpowers/plans/2026-08-31-responsive-text.md)
   * regardless of this prop, so it never crowds the current price on a
   * narrow card. */
  priceVariant?: TextVariant;
  /** Gap between the current and original price, in px. Matches each
   * call site's existing spacing (`gap-2` = 8, `gap-1.5` = 6). */
  gap?: number;
}

/**
 * "Current price (+ optional struck-through original)" — the teaser-card
 * price pattern shared by CategoryCard, PlanCard, and PlanTierCard. Extracted
 * because three independent copies of this pattern had already drifted to
 * two different sizes for the struck-through original (`bodySm` in two of
 * them, `caption` in the third) — one shared component instead of three
 * copies means that can't happen again.
 */
export function PriceWithOriginal({ price, originalPrice, priceVariant = 'title', gap = 8 }: PriceWithOriginalProps) {
  return (
    <View className="flex-row items-baseline" style={{ gap, flexShrink: 1, minWidth: 0 }}>
      <AppText variant={priceVariant} className="text-foreground" numberOfLines={1} style={{ flexShrink: 1 }}>
        {price}
      </AppText>
      {originalPrice ? (
        <AppText
          variant="caption"
          className="text-muted-foreground"
          numberOfLines={1}
          style={{ textDecorationLine: 'line-through', flexShrink: 1 }}>
          {originalPrice}
        </AppText>
      ) : null}
    </View>
  );
}

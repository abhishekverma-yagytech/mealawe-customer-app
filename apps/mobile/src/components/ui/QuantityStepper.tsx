import { Pressable, View } from 'react-native';

import { palette, useColors, type AccentTone } from '@/theme';

import { AppText } from './AppText';
import { IconMinus, IconPlus } from './icons';

interface QuantityStepperProps {
  count: number;
  onIncrease: () => void;
  onDecrease: () => void;
  disabled?: boolean;
  /** Override the default a11y labels — pass an item name so screen-reader
   * users can tell rows apart in a list (e.g. "Decrease Paneer Butter Masala quantity"). */
  decreaseLabel?: string;
  increaseLabel?: string;
  /** Accent for the enabled "+" glyph — defaults to brand green. Bulk passes
   * `"plan"`, On Demand passes `"info"` so the stepper matches that mode's
   * own tab accent instead of green (Order-Mode CTA Rule). */
  tone?: AccentTone;
  /** Raw hex override, takes precedence over `tone` — for a caller whose
   * accent isn't one of the semantic `palette.accent.*` roles `tone` maps
   * to (e.g. Apartment's own `apartmentOrderType[type].accent`, a
   * per-feature palette entirely separate from `palette.accent`). */
  accentColor?: string;
  /** Extra breathing room around the count digit — the Subscription cart's
   * stepper passes a wider value so it doesn't read as cramped next to that
   * screen's larger item card; other callers keep the default. */
  countMinWidth?: number;
  /** Stretches to fill whatever width the caller gives it, with `−` and `+`
   * pushed out to the opposite edges (count centered between them) instead
   * of the default compact, content-sized pill — for a caller replacing a
   * full-width "Add"/"View more" button with this stepper once something's
   * already in the cart (e.g. ApartmentDishCard's grid card), where a small
   * pill floating in the middle of that much wider space read as
   * disproportionately tiny. Every other caller keeps the original compact
   * pill by default (`false`), unaffected. */
  fullWidth?: boolean;
  /** Greys out and disables ONLY the "+" button — `disabled` above still
   * disables both. For a caller at its own quantity ceiling (Apartment's
   * per-kitchen `availableQty` — see useApartmentCartStore's
   * `clampToAvailable`) where decreasing should stay live but increasing
   * shouldn't, so the resident sees WHY tapping "+" stopped doing anything
   * instead of it silently no-op-ing forever. */
  increaseDisabled?: boolean;
}

/** `-`/count/`+` stepper, ≥44×44 touch targets. Used by the Bulk and On Demand menu/cart item rows. */
export function QuantityStepper({
  count,
  onIncrease,
  onDecrease,
  disabled = false,
  decreaseLabel = 'Decrease quantity',
  increaseLabel = 'Increase quantity',
  tone,
  accentColor,
  countMinWidth = 24,
  fullWidth = false,
  increaseDisabled = false,
}: QuantityStepperProps) {
  const colors = useColors();
  const canDecrease = !disabled && count > 0;
  const canIncrease = !disabled && !increaseDisabled;
  const increaseColor = canIncrease ? accentColor ?? (tone ? palette.accent[tone] : palette.brand.green) : palette.neutral.gray400;
  return (
    <View
      className={fullWidth ? 'flex-row items-center justify-between rounded-2xl border border-border' : 'flex-row items-center rounded-2xl border border-border'}
      style={{ opacity: disabled ? 0.5 : 1, width: fullWidth ? '100%' : undefined }}>
      <Pressable
        onPress={onDecrease}
        disabled={!canDecrease}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 0 }}
        accessibilityRole="button"
        accessibilityLabel={decreaseLabel}
        accessibilityState={{ disabled: !canDecrease }}
        className="h-11 w-11 items-center justify-center active:opacity-60">
        <IconMinus size={16} color={canDecrease ? colors.foreground : palette.neutral.gray400} />
      </Pressable>
      <AppText
        variant="label"
        className="text-foreground"
        style={{ minWidth: countMinWidth, textAlign: 'center' }}
        accessibilityLabel={`Quantity: ${count}`}>
        {count}
      </AppText>
      <Pressable
        onPress={onIncrease}
        disabled={!canIncrease}
        hitSlop={{ top: 8, bottom: 8, left: 0, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={increaseLabel}
        accessibilityState={{ disabled: !canIncrease }}
        className="h-11 w-11 items-center justify-center active:opacity-60">
        <IconPlus size={16} color={increaseColor} />
      </Pressable>
    </View>
  );
}

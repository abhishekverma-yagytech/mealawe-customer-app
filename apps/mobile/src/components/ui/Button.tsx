import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';

import { AppText } from './AppText';
import { palette, type AccentTone } from '@/theme';

/**
 * Button variants. Per the Mealawe color plan, **green (`primary`) is reserved
 * for the main call-to-action** — the one action we want the eye to land on.
 * Use `secondary` / `outline` / `ghost` for lower-emphasis actions and
 * `danger` for destructive ones.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to fill the parent width. */
  block?: boolean;
  loading?: boolean;
  disabled?: boolean;
  /**
   * Override the `primary` variant's green with an order-mode accent — Bulk's
   * "Proceed to Pay" passes `tone="plan"`, On-Demand's passes `tone="info"`.
   * Ignored on every other variant. Omit to keep the default green. See the
   * Order-Mode CTA Rule in DESIGN.md — this is the only sanctioned way to put
   * a non-green fill on a primary CTA.
   */
  tone?: AccentTone;
  /**
   * One-off border + label color override for `outline`/`ghost` buttons
   * (e.g. a coupon "Apply" button styled to match that card's own accent
   * instead of the neutral default). Ignored on filled variants
   * (primary/secondary/danger), which keep their own fixed brand fill —
   * use `tone` for those instead.
   */
  accentColor?: string;
  /** Optional leading / trailing icon nodes (render Lucide icons at ~18–20px). */
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
}

const CONTAINER: Record<ButtonVariant, string> = {
  primary: 'bg-primary active:opacity-90',
  secondary: 'bg-secondary active:opacity-90',
  outline: 'bg-transparent border border-border active:opacity-70',
  ghost: 'bg-transparent active:opacity-60',
  danger: 'bg-danger active:opacity-90',
};

const LABEL_CLASS: Record<ButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-brand-teal',
  outline: 'text-foreground',
  ghost: 'text-primary',
  danger: 'text-white',
};

const SIZE_PADDING: Record<ButtonSize, string> = {
  sm: 'py-2.5 px-4 rounded-xl',
  md: 'py-3.5 px-5 rounded-2xl',
  lg: 'py-4 px-6 rounded-2xl',
};

/** Spinner color that reads on each variant's background. */
const SPINNER_COLOR: Record<ButtonVariant, string> = {
  primary: '#ffffff',
  secondary: palette.brand.teal,
  outline: palette.brand.green,
  ghost: palette.brand.green,
  danger: '#ffffff',
};

/**
 * The one button primitive for the app — replaces the hand-rolled
 * `Pressable + bg-primary + rounded-2xl` pattern duplicated across screens so
 * every CTA has the same shape, press feedback, and disabled state.
 *
 * @example
 * <Button label="Subscribe" onPress={subscribe} block />
 * <Button label="Add to cart" variant="outline" onPress={add} />
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  disabled = false,
  tone,
  accentColor,
  leftIcon,
  rightIcon,
  className,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const toneColor = variant === 'primary' && tone ? palette.accent[tone] : undefined;
  const hasAccentOverride = !!accentColor && (variant === 'outline' || variant === 'ghost');
  // A soft brand-tinted lift on the primary CTA so the eye lands on it (the one
  // action per view). Filled variants only; flat/ghost stay flush. `toneColor`
  // (Order-Mode CTA Rule) overrides both the shadow tint and the fill itself —
  // inline style always wins over the `bg-primary` className below it.
  const lift =
    !isDisabled && variant === 'primary'
      ? {
          shadowColor: toneColor ?? palette.brand.green,
          shadowOpacity: 0.35,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
          ...(toneColor ? { backgroundColor: toneColor } : null),
        }
      : hasAccentOverride
        ? { borderColor: accentColor }
        : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={lift}
      className={[
        'flex-row items-center justify-center',
        SIZE_PADDING[size],
        CONTAINER[variant],
        block ? 'w-full' : 'self-start',
        isDisabled ? 'opacity-50' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={SPINNER_COLOR[variant]} />
      ) : (
        <View className="flex-row items-center justify-center gap-2">
          {leftIcon}
          <AppText
            variant="label"
            className={LABEL_CLASS[variant]}
            style={hasAccentOverride ? { color: accentColor } : undefined}>
            {label}
          </AppText>
          {rightIcon}
        </View>
      )}
    </Pressable>
  );
}

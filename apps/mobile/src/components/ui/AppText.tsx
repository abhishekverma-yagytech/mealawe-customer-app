import { Text, type TextProps } from 'react-native';

import {
  typography,
  FONT_FAMILY,
  useResponsiveFontScale,
  type TextVariant,
  type FontWeightName,
} from '@/theme';

/** Caps how far the OS "large text" accessibility setting can stretch app text before layouts break. */
const MAX_FONT_SIZE_MULTIPLIER = 1.3;

interface AppTextProps extends TextProps {
  /** Type preset from the Mealawe scale. Defaults to `body`. */
  variant?: TextVariant;
  /**
   * Override the variant's font weight (Metropolis regular / bold / black). Use this to
   * emphasize a body-size line instead of hand-setting `fontFamily` inline — the
   * type system stays the single source of truth.
   */
  weight?: FontWeightName;
  /**
   * NativeWind classes — use for color (`text-primary`, `text-muted-foreground`),
   * alignment, margins, etc. The variant owns size / line-height / family / weight.
   */
  className?: string;
}

/**
 * The one text primitive for the app. Encapsulates the Metropolis type scale so screens
 * never hand-set fontSize / fontFamily / lineHeight. Color and layout stay in
 * NativeWind classes; the variant carries the typographic decision. Applies a
 * small width-based scale on top of each variant's base size (see
 * `useResponsiveFontScale`) so text reads consistently across small and large
 * phones, capped by `maxFontSizeMultiplier` so OS-level "large text" settings
 * can't blow up layouts.
 *
 * @example
 * <AppText variant="h2" className="text-foreground">Nearby kitchens</AppText>
 * <AppText variant="caption" className="text-muted-foreground">Delivered in 30 min</AppText>
 */
export function AppText({
  variant = 'body',
  weight,
  className,
  style,
  maxFontSizeMultiplier,
  ...rest
}: AppTextProps) {
  const fontScale = useResponsiveFontScale();
  const preset = typography[variant];
  const scaledPreset = {
    ...preset,
    fontSize: preset.fontSize * fontScale,
    lineHeight: preset.lineHeight * fontScale,
  };

  return (
    <Text
      className={className ?? 'text-foreground'}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SIZE_MULTIPLIER}
      style={[scaledPreset, weight ? { fontFamily: FONT_FAMILY[weight] } : null, style]}
      {...rest}
    />
  );
}

import { useColorScheme } from 'react-native';

import { getSemanticColors, type SemanticColors } from './theme';

/**
 * Current-scheme semantic colors for JS-side styling (inline `style`, SVG,
 * gradients, sheets) where NativeWind `bg-card` / `text-foreground` classes
 * can't reach. Follows the OS/app color scheme so surfaces theme correctly in
 * dark mode — never hardcode `palette.neutral.white` for a surface again.
 */
export function useColors(): SemanticColors {
  const scheme = useColorScheme();
  return getSemanticColors(scheme === 'dark' ? 'dark' : 'light');
}

import { palette } from './palette';

/**
 * Semantic theme objects for light and dark. These match the flipping CSS
 * variables in `src/global.css` so JS-driven surfaces (navigation bars,
 * status bar, native containers) stay in sync with NativeWind styling.
 */
export interface SemanticColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  primary: string;
  primaryForeground: string;
}

export const lightColors: SemanticColors = {
  background: '#f7f8fa',
  foreground: '#042a33',
  card: '#ffffff',
  cardForeground: '#042a33',
  muted: '#edeff3',
  mutedForeground: '#6d6d6d',
  border: '#e5e5e5',
  primary: palette.brand.green,
  primaryForeground: '#ffffff',
};

export const darkColors: SemanticColors = {
  // Neutral black surfaces (not the brand teal) — matches global.css's dark
  // CSS vars exactly; keeps backgrounds/cards from reading as green-tinted.
  // Soft near-black background with a clearly lighter elevated card surface
  // (not OLED-pure-black with barely-distinguishable cards).
  background: '#1a1a1a',
  foreground: '#faf7f0',
  card: '#2a2a2a',
  cardForeground: '#faf7f0',
  muted: '#323232',
  mutedForeground: '#94a3a5',
  border: '#3d3d3d',
  primary: palette.brand.green,
  primaryForeground: '#ffffff',
};

export type ColorSchemeName = 'light' | 'dark';

export function getSemanticColors(scheme: ColorSchemeName): SemanticColors {
  return scheme === 'dark' ? darkColors : lightColors;
}

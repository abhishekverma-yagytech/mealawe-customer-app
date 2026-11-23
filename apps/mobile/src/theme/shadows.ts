import type { ViewStyle } from 'react-native';

/**
 * Soft elevation for surfaces so cards lift off the page (light + dark). Depth is
 * carried by both the surface-vs-background contrast AND a diffuse shadow — never
 * flat. `card` for resting surfaces, `lifted` for sheets / floating elements,
 * `sheet` for the auth bottom-sheet cards (login/register) which cast their
 * shadow upward since the sheet sits above the hero rather than on a page.
 */
export const shadow: Record<'card' | 'lifted' | 'sheet', ViewStyle> = {
  card: {
    shadowColor: '#0b1220',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  lifted: {
    shadowColor: '#0b1220',
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  sheet: {
    shadowColor: '#042a33',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 12,
  },
};

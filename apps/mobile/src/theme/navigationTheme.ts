import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';

import { darkColors, lightColors } from './theme';

/**
 * React Navigation / Expo Router theme objects derived from the Mealawe
 * semantic colors, so the router chrome (headers, backgrounds) matches the
 * NativeWind-styled screens.
 */
export const navigationLightTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: lightColors.primary,
    background: lightColors.background,
    card: lightColors.card,
    text: lightColors.foreground,
    border: lightColors.border,
  },
};

export const navigationDarkTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: darkColors.primary,
    background: darkColors.background,
    card: darkColors.card,
    text: darkColors.foreground,
    border: darkColors.border,
  },
};

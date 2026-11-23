'use client';

import { useCallback, useEffect, useState } from 'react';

import { THEME_COOKIE } from '@/lib/theme-init';

export type Theme = 'dark' | 'light';

/** Dark unless the visitor picked otherwise. */
export const DEFAULT_THEME: Theme = 'dark';
const EVENT = 'mw-theme-change';

export function readTheme(): Theme {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const m = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=(light|dark)`));
  return (m?.[1] as Theme | undefined) ?? DEFAULT_THEME;
}

export function writeTheme(theme: Theme): void {
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; SameSite=Lax${secure}`;
  document.documentElement.setAttribute('data-theme', theme);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: theme }));
}

/** Current theme (cookie-backed) + a setter that persists it. SSR renders the default; the real value lands after mount. */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  useEffect(() => {
    setThemeState(readTheme());
    const on = (e: Event) => setThemeState((e as CustomEvent<Theme>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const setTheme = useCallback((t: Theme) => writeTheme(t), []);
  const toggle = useCallback(() => writeTheme(readTheme() === 'dark' ? 'light' : 'dark'), []);
  return { theme, setTheme, toggle };
}

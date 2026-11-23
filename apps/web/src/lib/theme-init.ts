/** Cookie that remembers the visitor's theme choice (1 year). Server-safe module (used by the root layout). */
export const THEME_COOKIE = 'mw_theme';

/**
 * Runs before first paint (see app/layout.tsx): sets data-theme from the cookie, dark by default. Plain ES5 on
 * purpose; the cookie name here must match THEME_COOKIE.
 */
export const THEME_INIT_SCRIPT =
  "(function(){try{var m=document.cookie.match(/(?:^|; )mw_theme=(light|dark)/);document.documentElement.setAttribute('data-theme',m?m[1]:'dark')}catch(e){}})();";

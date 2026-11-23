// Ambient module declarations for non-TS assets imported in source.

// Side-effect CSS imports (NativeWind global stylesheet).
declare module '*.css';

// CSS Modules (web-only components).
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

// Babel config for Expo SDK 57 + NativeWind v5 (Tailwind v4) + Reanimated 4.
//
// `nativewind/babel` provides NativeWind's transforms (cssInterop for Gluestack
// components) AND registers `react-native-worklets/plugin`. We disable
// babel-preset-expo's own worklets pass (`worklets: false`) so the plugin is
// registered exactly once.
//
// Path aliases (`@/*` -> `src/*`) come from tsconfig via Expo Metro — no babel
// module-resolver needed.
//
// `lazyImports: true` defers each dependency's `require()` to first use
// instead of eagerly requiring everything at bundle init — side-effect-aware,
// unlike Metro's own `inlineRequires` (which Expo's metro-config hardcodes
// off project-wide since it isn't side-effect safe).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { worklets: false, lazyImports: true }],
      'nativewind/babel',
    ],
  };
};

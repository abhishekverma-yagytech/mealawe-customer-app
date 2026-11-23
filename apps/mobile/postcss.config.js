// Tailwind CSS v4 runs through PostCSS. Expo's Metro CSS pipeline picks this up
// and compiles `@import "tailwindcss"`, `@theme`, `@utility` into plain CSS
// before NativeWind (react-native-css) consumes it.
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

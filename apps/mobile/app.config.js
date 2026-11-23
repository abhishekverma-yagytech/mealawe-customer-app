// Dynamic override layer on top of app.json (Expo's standard pattern — Expo
// CLI parses app.json's "expo" object and passes it in as `config` here;
// app.json itself stays the static base for everything that doesn't need to
// vary per build profile).
//
// Only reason this file exists: `NSAllowsArbitraryLoads` (iOS) /
// `usesCleartextTraffic` (Android) in app.json blanket-allow plain HTTP for
// every build, but that's only actually needed by the `local` (LAN IP) and
// `staging` (plain-HTTP ELB) backends — see src/config/environments.ts.
// Production talks to https://api.mealawe.com over real TLS and doesn't need
// either exception; Apple's App Review Guidelines specifically discourage
// broad ATS exceptions like app.json's blanket one, so production builds
// deliberately drop it here instead of carrying it unconditionally.
//
// `EXPO_PUBLIC_ENV` is set by `eas.json`'s build profiles (and by the
// `ios:prod`/`android:prod` local scripts) — same signal already used
// throughout the app's own runtime config, just read here at config-eval
// time instead of JS-runtime.
module.exports = ({ config }) => {
  const isProduction = process.env.EXPO_PUBLIC_ENV === 'production';

  return {
    ...config,
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios.infoPlist,
        NSAppTransportSecurity: isProduction ? undefined : { NSAllowsArbitraryLoads: true },
      },
    },
    plugins: config.plugins.map((plugin) => {
      if (Array.isArray(plugin) && plugin[0] === 'expo-build-properties') {
        return [
          'expo-build-properties',
          {
            ...plugin[1],
            android: {
              ...plugin[1].android,
              usesCleartextTraffic: !isProduction,
            },
          },
        ];
      }
      return plugin;
    }),
  };
};

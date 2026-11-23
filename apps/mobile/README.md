# Mealawe User App (React Native)

The customer-facing Mealawe app, rebuilt natively on Expo/React Native. Behavioral
reference for parity is the existing Ionic/Angular app (`MealaweUserApp`); this
project ports and modernizes that experience screen by screen rather than
wrapping it in a WebView.

## Stack

- **Expo SDK 57** · React Native 0.86 · React 19.2 · TypeScript
- **Expo Router** (file-based routing, typed routes)
- **NativeWind v5** (Tailwind v4) + **Gluestack UI v5** for styling/components
- **Zustand** for state, feature-first folders under `src/features/<domain>`
- **react-native-maps** for live order tracking, **socket.io-client** for live chat
- `expo-secure-store` + `react-native-mmkv` for persistence
- Android + iOS only (web target removed)

## Features

- Subscription ordering (meal plans, weekly menu, coupons)
- Bulk ordering (Meals / Snacks / Food Box) for events and offices
- Dine-in table booking
- On-demand (Daily / Advance) kitchen ordering
- Live order tracking on a map, with smooth marker interpolation and ETA
- My Orders hub — subscription, on-demand, dine-in, bulk, Navmool, Oyo, and
  apartment order history in one place
- Live support chat (Socket.IO), backed by the existing Mealawe support-chat
  service
- Navmool marketplace, embedded via WebView

## Getting started

```bash
npm install
npx expo start --dev-client
```

Native modules (maps, WebView, notifications, etc.) mean this app needs a
**dev client**, not Expo Go. After changing native config or adding a native
dependency:

```bash
npx expo prebuild --clean
npm run android   # or: npm run ios
```

### Environment

The API target is chosen by `EXPO_PUBLIC_ENV` (see `src/config/environments.ts`):

```bash
npm run start:local      # local backend
npm run start:staging    # staging
npm run start:prod       # production
```

### Verifying changes

This project has no unit test suite — verify with:

```bash
npx tsc --noEmit                              # typecheck
npx expo lint                                 # lint
npx expo export --platform android -c         # bundle sanity check
```

E2E coverage is [Maestro](https://maestro.mobile.dev/)-only — see
`.maestro/README.md` and `docs/TESTING-WORKFLOW.md`.

## Project structure

```
src/
  app/                 # Expo Router screens (file-based routing)
  features/<domain>/   # feature-first modules: api, types, store, components
  components/ui/       # shared design-system primitives (AppText, Button, icons, …)
  services/http/       # API client + endpoint registry
  store/                # cross-feature Zustand stores (auth, location, cluster)
  theme/                # palette, typography, semantic color tokens
```

See `CLAUDE.md`, `PRODUCT.md`, and `DESIGN.md` for the product/design system
context behind these conventions.

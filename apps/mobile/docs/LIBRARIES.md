# MealaweUserAppRN — Libraries & AI/LLM Docs

Reference for every dependency in the app: what it does, its official docs, and
its **AI/LLM documentation** (`llms.txt` / `llms-full.txt` / MCP) where the
project publishes one. `llms.txt` is a markdown map of a library's docs designed
for AI coding assistants (Cursor, Copilot, Claude) — point your assistant at
these URLs for accurate, version-correct code generation.

> **What is `.gitkeep`?** Git does not track empty folders — it only tracks
> files. To keep an intentionally-empty directory in the repo (e.g. the feature
> domain folders under `src/features/*`), you commit a placeholder file inside
> it. `.gitkeep` is that placeholder — a conventional, empty, zero-meaning file
> (not a Git feature, just a name people agreed on). When a folder gets real
> files, the `.gitkeep` can be deleted.

---

## Core runtime

| Library | Purpose | Docs | AI/LLM docs |
|---|---|---|---|
| **expo** (SDK 57) | React Native framework + tooling (build, updates, native modules) | https://docs.expo.dev | **https://docs.expo.dev/llms.txt** · `llms-full.txt` · `llms-eas.txt` · `llms-sdk.txt` |
| **react-native** 0.86 | Native UI runtime | https://reactnative.dev | — |
| **react / react-dom** 19.2 | UI library | https://react.dev | https://react.dev/llms.txt |
| **expo-router** | File-based navigation (built on React Navigation) | https://docs.expo.dev/router/introduction | via Expo `llms.txt` |
| **react-native-screens** | Native navigation primitives | https://github.com/software-mansion/react-native-screens | — |
| **react-native-safe-area-context** | Safe-area insets | https://github.com/AppAndFlow/react-native-safe-area-context | — |
| **react-native-gesture-handler** | Native gestures | https://docs.swmansion.com/react-native-gesture-handler | — |
| **react-native-reanimated** 4 + **react-native-worklets** | UI-thread animations | https://docs.swmansion.com/react-native-reanimated | — |

## Styling & UI

| Library | Purpose | Docs | AI/LLM docs |
|---|---|---|---|
| **nativewind** v5 | Tailwind CSS for React Native (`className`) | https://www.nativewind.dev | https://www.nativewind.dev (see `/llms.txt`) |
| **react-native-css** | NativeWind v5's CSS compiler engine | https://github.com/nativewind/react-native-css | — |
| **tailwindcss** v4 + **@tailwindcss/postcss** + **postcss** | Utility CSS + build pipeline | https://tailwindcss.com | https://tailwindcss.com/llms.txt |
| **@gluestack-ui/core** + **@gluestack-ui/utils** | Gluestack UI v5 component primitives | https://gluestack.io/ui/docs | **https://gluestack.io/ui/docs/llms.txt** · `llms-full.txt` (+ MCP) |
| **tailwind-variants** | Variant/slot styling API (used by Gluestack) | https://www.tailwind-variants.org | — |
| **react-aria / react-stately** | Accessibility + state primitives (Gluestack deps) | https://react-spectrum.adobe.com/react-aria | — |
| **@legendapp/motion** | Declarative animations (Gluestack dep) | https://legendapp.com/open-source/motion | — |
| **@expo/html-elements** | Semantic HTML-like RN elements (Gluestack dep) | https://github.com/expo/expo/tree/main/packages/html-elements | — |
| **react-native-svg** | SVG rendering | https://github.com/software-mansion/react-native-svg | — |

## Forms & validation

| Library | Purpose | Docs |
|---|---|---|
| **react-hook-form** | Performant form state (uncontrolled, minimal re-renders) | https://react-hook-form.com |
| **zod** | Schema validation + inferred TS types (`phoneSchema`, `profileSchema`) | https://zod.dev · https://zod.dev/llms.txt |
| **@hookform/resolvers** | Bridges zod schemas into react-hook-form | https://github.com/react-hook-form/resolvers |

## State & storage

| Library | Purpose | Docs | AI/LLM docs |
|---|---|---|---|
| **zustand** | Minimal state management (`useAuthStore`, `useLocationStore`) | https://zustand.docs.pmnd.rs | https://zustand.docs.pmnd.rs (llms via context7) |
| **react-native-mmkv** v4 | Fast synchronous key-value storage | https://github.com/mrousavy/react-native-mmkv | — |
| **react-native-nitro-modules** | Native module framework (MMKV v4 runtime) | https://nitro.margelo.com | — |
| **expo-secure-store** | Encrypted key store (Keychain / Keystore) — session token | https://docs.expo.dev/versions/latest/sdk/securestore | via Expo `llms.txt` |

## Media, assets & device

| Library | Purpose | Docs |
|---|---|---|
| **expo-video** | Video playback (login/welcome hero) | https://docs.expo.dev/versions/latest/sdk/video |
| **expo-image** | High-performance images (logo, slides) | https://docs.expo.dev/versions/latest/sdk/image |
| **expo-splash-screen** | Native splash screen | https://docs.expo.dev/versions/latest/sdk/splash-screen |
| **expo-font / expo-symbols / expo-glass-effect / expo-system-ui / expo-status-bar** | Fonts, SF Symbols, glass blur, system UI, status bar | https://docs.expo.dev/versions/latest |
| **expo-constants / expo-device / expo-linking / expo-web-browser** | App constants, device info, deep links, in-app browser | https://docs.expo.dev/versions/latest |
| **@expo/ui** | Native SwiftUI/Jetpack Compose components | https://docs.expo.dev/versions/latest/sdk/ui |

## Security / crypto

| Library | Purpose | Docs |
|---|---|---|
| **crypto-js** | AES `session_x` request/response encryption | https://github.com/brix/crypto-js |

## Dev tooling

| Library | Purpose | Docs |
|---|---|---|
| **typescript** | Static typing | https://www.typescriptlang.org |
| **@types/react, @types/crypto-js** | Type definitions | — |
| **babel-preset-expo** (via expo) | JS/TS transform, Reanimated worklets, React Compiler | https://docs.expo.dev/versions/latest/config/babel |

## Notes

- **Web is not a target.** `react-native-web` remains only as a transitive peer
  of Expo/Gluestack; `app.json` restricts `platforms` to `ios`/`android` and the
  `web` script was removed.
- **`lightningcss` is pinned to `1.30.1`** (`overrides` + `resolutions`) because
  Expo SDK 57's default `1.33.0` breaks NativeWind v5's `react-native-css`
  compiler. Do not remove until NativeWind v5 leaves preview.
- **Best AI-docs to hand your assistant for this stack:** Expo `llms.txt`,
  Gluestack `llms-full.txt`, Tailwind `llms.txt`. Together they cover the
  navigation, styling engine, and component layer.

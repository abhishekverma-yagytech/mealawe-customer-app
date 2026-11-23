# mealawe-customer — monorepo

Customer apps for Mealawe. One repo, shared logic, per-platform UI.

```
apps/mobile      Expo (React Native) app  — @mealawe/mobile  (see apps/mobile/CLAUDE.md)
apps/web         Next.js web app V1 — @mealawe/web (see apps/web/CLAUDE.md); replaces the Angular userWebApp
packages/core    @mealawe/core    pure TS: http client + AES envelope, ENDPOINTS, zod schemas, domain logic
                                  (billing, order status, pricing, schedules), analytics events, platform ports
packages/api     @mealawe/api     per-feature API functions (no stores/UI); session + location-provider ports
packages/state   @mealawe/state   Zustand stores (auth, cart, cluster, location, bulk/on-demand carts, ...)
packages/hooks   @mealawe/hooks   platform-neutral React hooks
packages/design-tokens            palette, semantic colours, spacing, radii
packages/config  @mealawe/config  tsconfig base + shared ESLint boundary rules
```

## Layering (dependencies point down only)
`app UI  →  hooks  →  state  →  api  →  core`

Shared packages (`packages/*`) MUST NOT import `react-native`, `expo-*`, `next`, app aliases (`@/…`),
or use `window`/`document`/`localStorage`/`navigator`/`__DEV__`. ESLint enforces this
(`packages/config/eslint.shared.js`). Reach the platform through ports:
- runtime config: `configureCore({ serverUrl, apiSecretKey, isDev, registeredPlatform })` — mobile does it in `apps/mobile/src/bootstrap/core.ts`
- platform services: `registerPlatform({ kv, secure, analytics, ... })` (core) — mobile: `apps/mobile/src/bootstrap/platform.ts`
- location: `registerLocationProvider()` (api); session reads for API calls: `registerSessionContext()` (api) — mobile: `bootstrap/session.ts`
- A new platform (web) must register all of the above before the first request/store hydrate.

## Commands (run from repo root; npm workspaces + Turborepo)
- `npm install` — installs all workspaces (patch-package runs from the root for `apps/mobile/patches`)
- `npm run typecheck` / `npm run lint` / `npm test` — all workspaces via turbo
- `npm run mobile` — start the Expo dev server
- `npm run dev --workspace @mealawe/web` — start the web app (needs apps/web/.env.local)
- Single package: `npm run test --workspace @mealawe/core`

## Adding a feature (target workflow)
1. endpoint in `core` ENDPOINTS + zod schema/types  2. api function  3. hook/store  4. mobile screen  5. web page.
Only steps 4–5 are platform-specific.

## Notes
- Old import paths in `apps/mobile` (`@/services/http`, `@/utils/currency`, …) are thin re-export shims to
  `@mealawe/core`; new code should import from `@mealawe/core` directly. Remove shims once call sites are migrated.
- EAS builds: run from `apps/mobile`; the root `.easignore` governs the upload archive. Verify with a preview build before relying on it.

## Known gaps (Phase 1 remaining)
- Still mobile-only (native deps): apartment api (Juspay payment), home api (media cache), profile api (expo-file-system), orders/useOrders (Live Activity), typography tokens, themeStore, tracking store.
- Payment port (`PaymentGateway`) is declared but not implemented/used yet.
- 2 existing react-hooks/set-state-in-effect lint errors are suppressed in packages/hooks (see eslint.config.js).
- Do NOT run `eslint --fix` for import/no-duplicates in packages: it can merge value imports into `import type`.

# apps/web — Next.js customer web app (V1)

Mirrors the mobile app's routes and flow (same paths/query params as `apps/mobile/src/app`). **Payments are behind a flag** (see
"Payments" below): with `NEXT_PUBLIC_PAYMENTS_ENABLED` off, "Pay" is replaced by a "Complete your order in the Mealawe app" bar
(`components/cart/CartParts.tsx`).

## Run
- `cp .env.example .env.local` and fill `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_API_SECRET_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (referrer-restricted key).
- `npm run dev --workspace @mealawe/web` · build: `npm run build --workspace @mealawe/web`
- `/dev/smoke` proves the browser↔API AES round-trip (run it first against staging).

## Architecture
- `src/platform/` — web implementations of the shared ports (kv/secure = localStorage with memory fallback, analytics = GTM
  `dataLayer`, location = `navigator.geolocation` + Maps JS Geocoder) and `register.ts` (`configureCore`, `registerPlatform`,
  `setAuthTokenProvider`, `registerSessionContext`, `registerLocationProvider`). `components/AppBootstrap.tsx` hydrates stores in
  the same order as mobile's `_layout.tsx`.
- All data fetching is **client-side** (shared stores/caches are module singletons — never fetch or read user state during SSR).
- Pages are thin: logic lives in `@mealawe/*` (billing: `buildBill`/`buildBulkBill`/`buildOnDemandBill`; stores; hooks).
- UI: Tailwind v4 theme in `src/app/globals.css` (mirrors `@mealawe/design-tokens`), Radix dialogs replace mobile bottom sheets.
- Pages using `useSearchParams` must be wrapped in `<Suspense>`; `useRequireLogin` avoids it on purpose.

## Not in V1
Navmool marketplace checkout, push, Netcore/Branch SDKs, reschedule/cancel order actions, hero Lottie/video
backgrounds, `/explore` (placeholder on mobile too).

## Gotchas
- TypeScript 6 doesn't auto-include `@types/*` → `tsconfig.json` lists `types` explicitly.
- `registeredPlatform` is `mealawe_web` (backend enum).
- Don't run `eslint --fix` for import/no-duplicates in packages (see root CLAUDE.md).

## Payments (Juspay hosted Payment Page)
Code is **web-only** under `src/payment/` (the mobile app and existing shared packages are deliberately untouched).
- Flag: `NEXT_PUBLIC_PAYMENTS_ENABLED=true` turns the cart Pay bar on; off keeps "complete your order in the app".
- Flow: cart → `usePayment` (login check, `build*Body`) → `startPayment` (POST start endpoint with `orderCreatedBy:'mealawe_web'`,
  `returnURL=<origin>/payment-check`, `idempotencyKey`) → zero amount ⇒ straight to `/order-result`; else save a pending record
  (`src/payment/pending.ts`, ids only, 30-min TTL) and **redirect the whole page** to `jusPayPaymentLink`.
- Return: `/payment-check?order_id=…` reads only `order_id`, loads the pending record, then `pollPayment` (server confirm +
  read-only status polling; `error:true` from confirm means "already resolved" → re-read status). `pending` after ~30 s is NOT a
  failure: record kept, `/order-result?status=pending`, and `PendingPaymentBanner` / order-detail "Check payment status" re-check it.
- Result screen `/order-result` params mirror mobile (`status`, `foodOrderId`, `mode`, `recap*`, `reason`).
- Order bodies (`bodies.ts`) duplicate the mobile carts' fields on purpose; `__tests__/bodies.test.ts` pins them. If mobile's
  order fields change, update web + tests.
- Prerequisites before enabling: Juspay dashboard must allow the web origin as a return URL; backend accepts `mealawe_web`.
- Test only against **staging** (Juspay sandbox). Out of scope: Navmool marketplace, wallet top-up, apartment Bulk.

## Apartment (Instant / Today / Advance)
Web-only code in `src/features/apartment/` (ported from the mobile feature, which is read-only reference; mobile and `packages/*` are untouched).
- **Gating = mobile's rule**: `ApartmentEligibilityResolver` (mounted in AppBootstrap) calls `getNearestApartment(lng,lat)` for the current address; no
  complex ⇒ no Apartment pill / `/apartment` shows "not available". The cluster flag `showApartment` is deliberately NOT used.
- Pages: `/apartment` (3 menu tabs), `/apartment/cart`, `/apartment/orders`, `/apartment/orders/[id]`; result screen is `/order-result?mode=apartment`.
- Cart: one kitchen per cart; Instant+Today may mix, Advance never mixes (`cartStore.ts`). Groups → payment **buckets** (`checkout.ts`):
  Today+Instant combine per fulfilment mode, each Advance group is its own. Wire `orderType` is always the literal `'apartment'`.
- Payment: web pays **one bucket per redirect** (the first now; the paid bucket's lines leave the cart via `removeApartmentGroups`, the rest stay for
  the next payment). The pending record carries `apartmentGroupKeys`. There is NO backend webhook/cron for apartment payments, so the
  `/payment-check` confirm (or "Check payment status"/banner recovery) is the only thing that places the order.
- Amounts: the bucket total shown is `POST /apartmentOrder/quote` (falls back to the local estimate); the server trusts client item prices/GST, so
  bodies must use the same bill the quote used (`chargeFields`). Tests: `features/apartment/__tests__/checkout.test.ts`.
- Dev helpers on `/dev/smoke`: Inspect apartments / apartment menus, and "Use first apartment as location" (`?apartment=<name>`).

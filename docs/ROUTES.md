# Route map — Expo Router (mobile) → Next.js App Router (web)

> **V1 status:** the web app (apps/web) uses the **mobile route paths verbatim** (e.g. `/subscription-plan`, `/on-demand-kitchen?kitchenId=`), and `/home` for the tabs home. The pretty-URL table below is the later target (via Next rewrites).

Same information architecture on both platforms. Keep slugs identical so deep links / Branch links work on both.
Web uses responsive layouts (side panels instead of bottom sheets); public pages are SSR for SEO.

| Mobile (`apps/mobile/src/app`) | Web (`apps/web/app`) | Auth | Notes |
|---|---|---|---|
| `index` (splash/onboarding) | `/` | public | Web: marketing landing + location prompt (SSR) |
| `(tabs)/index` (home) | `/home` | public | Order-mode shortcuts gated by cluster flags |
| `(tabs)/explore` | `/explore` | public | |
| `login` | `/login` | public | Phone + OTP; WebOTP optional |
| `register` | `/register` | auth | Complete profile |
| `profile`, `profile-edit` | `/profile`, `/profile/edit` | auth | |
| `addresses`, `address-form` | `/addresses`, `/addresses/new`, `/addresses/[id]` | auth | Browser geolocation + Places |
| `subscription-plan` | `/subscription/plan` | public | |
| `subscription-configure` | `/subscription/configure` | public | |
| `subscription-detail` | `/subscription/[id]` | auth | |
| `manage-subscription` | `/subscription/[id]/manage` | auth | |
| `cart` | `/cart` | public→auth at pay | |
| `bulk-menu`, `bulk-cart` | `/bulk`, `/bulk/cart` | public | |
| `on-demand-kitchens`, `on-demand-kitchen`, `on-demand-cart` | `/on-demand`, `/on-demand/[kitchenId]`, `/on-demand/cart` | public | |
| `apartment-cart`, `apartment-order-history`, `apartment-order-detail`, `apartment-order-login-required` | `/apartment/cart`, `/apartment/orders`, `/apartment/orders/[id]` | auth | |
| `marketplace` | `/marketplace` | public | |
| `order-result` | `/orders/result` | auth | Web: payment return URL + status polling |
| `orders`, `my-orders` | `/orders` | auth | |
| `order-history/[category]` | `/orders/history/[category]` | auth | |
| `order-detail` | `/orders/[id]` | auth | |
| `order-tracking` | `/orders/[id]/track` | auth | socket.io + Maps JS |
| `wallet`, `cashback` | `/wallet`, `/wallet/cashback` | auth | |
| `refer-earn` | `/refer` | auth | |
| `help`, `feedback`, `support-chat` | `/help`, `/feedback`, `/help/chat` | mixed | socket.io chat |

Dine-in and OYO exist as features without top-level mobile routes; decide web placement in Phase 2.

# Feature checklist (new feature, both platforms)
1. Endpoint added to `ENDPOINTS` (`@mealawe/core`) + zod schema / types
2. API function in `@mealawe/api` (no store/UI imports; context passed as arguments)
3. Shared hook / store (Phase 1 `@mealawe/state`, `@mealawe/hooks`) using ports for platform needs
4. Mobile screen (`apps/mobile`) + Maestro flow
5. Web page (`apps/web`) + Playwright spec
6. Analytics event through the `Analytics` port
7. Unit tests in the shared package for any billing/status/mapping logic
8. Add the route to this table

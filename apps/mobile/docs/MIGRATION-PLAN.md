# Mealawe User App — React Native Migration Plan

**Project:** `MealaweUserAppRN` — a ground-up rebuild of the Mealawe customer app on
React Native + Expo.
**Source of truth:** `../MealaweUserApp` (Angular 16 / Ionic 7, original) for behaviour;
`../mealaweApp` (modern Ionic 8) as the cleaned-up reference for ported logic.
**Goal:** ship the full customer experience (all ordering verticals) on a single modern
React Native codebase, wired to the live Mealawe backend, without regressing behaviour.

---

## Stack & foundations

| Area | Choice |
| --- | --- |
| Runtime | Expo SDK 57 · React Native 0.86 · React 19.2 |
| Language | TypeScript (strict) |
| Navigation | Expo Router (file-based, typed routes) |
| Styling | NativeWind v5 + Tailwind v4 · Gluestack UI v5 |
| State | Zustand (auth, location, theme) |
| Storage | `expo-secure-store` (secrets) + `react-native-mmkv` (fast KV) |
| Maps | `react-native-maps` + Google Places / Geocoding REST |
| Icons | `lucide-react-native` |
| Animation | `lottie-react-native` (hero); motion via Reanimated |
| Build & OTA | EAS Build + EAS Update |
| Platforms | Android + iOS (`com.mealawe.app`) |

> **Dependencies are added incrementally.** The table above is the current foundation,
> not a fixed allow-list. Each phase pulls in only the libraries it needs when it starts
> (e.g. payment SDKs for the cart phases, charts/date pickers where a screen needs them),
> preferring an Expo-compatible, well-maintained package and keeping the bundle lean.

**Status legend:** ✅ Done · 🔄 In progress · ⏳ Planned

---

## Phase 1 — Foundation ✅

Establish the shared platform every feature builds on.

- **Project structure** — feature-first folders under `src/features/<domain>`, shared UI
  in `src/components/ui`, cross-cutting services in `src/services`, state in `src/store`.
- **Design system** — brand tokens (green `#63AB45`, yellow, cream, teal) in `global.css`
  with a TypeScript mirror; the `AppText` typography primitive (Lato scale); a Lucide icon
  set; documented in `DESIGN.md` / `DESIGN-REFERENCE.md`.
- **Theming** — light / dark / system with a persisted preference (MMKV) applied through
  React Native `Appearance`; switchable from the profile. Defaults to **system**.
- **API transport & encryption** — a fetch client that ports the Ionic app's AES
  `session_x` scheme exactly: every request body is encrypted to `{ data_key }` and every
  response decrypted with a per-request key derived from the bearer token + session salt.
- **Storage** — AES-encrypted secure store for the session token and profile; MMKV for
  fast, non-sensitive state (selected address, theme, drafts).
- **Authentication state** — a Zustand auth store that hydrates on boot, exposes the
  session token to the HTTP client, and drives the routing gate.
- **Routing** — Expo Router with a boot gate (`welcome` → `login` → tabs) and typed routes.
- **EAS baseline** — `eas.json`, project linked (`projectId`), runtime versioning and OTA
  update channel configured.

**Acceptance:** app boots, encrypted requests succeed, session persists across restarts,
theme persists, typecheck and Android export are green.

---

## Phase 2 — Onboarding & Authentication ✅

The full entry flow, wired to live endpoints.

- **Welcome** — three-slide onboarding carousel.
- **Login** — phone entry → 6-box OTP → verify, against `registerPhoneNo` / `resendOTP` /
  `verifyOTP`; on success stores the session and fetches the customer profile.
- **Register / profile completion** — name, email, referral, with referral-code validation.
- **Boot gate** — routes by session state: not welcomed → welcome; unauthenticated →
  login; authenticated → home.

**Acceptance:** a new and returning user can complete the flow end-to-end on device.

---

## Phase 3 — Home, Location & Profile ✅

The signed-in shell users land in.

- **Immersive home header** — a Lottie hero carousel behind a floating header (delivery
  address, cashback pill, profile) and the order-mode tabs with a global VEG toggle;
  story-style auto-advancing progress; content sheet overlapping the hero (Zomato-style).
- **Location & address** — GPS + reverse geocoding, a **map picker with a draggable pin**
  and **Google Places autocomplete search**, 500 m saved-address matching, add / edit /
  delete saved addresses, and backend sync of the current delivery location.
- **Profile** — customer details with edit, **wallet (Mealawe Money)** and **cashback**
  balances and history screens, **Help & support** (chat / call / email + FAQ accordion),
  **Feedback**, theme selector, and a branded sign-out confirmation.

**Acceptance:** address selection updates the home context; wallet, cashback, help, and
feedback call live endpoints and render real data.

---

## Phase 3.5 — EAS: Staging ✅

- Build profiles in `eas.json`:
  - **development** — staging environment, dev-client, internal APK.
  - **staging** — staging environment, release APK for internal QA distribution.
- Each profile injects `EXPO_PUBLIC_ENV` so the correct backend, keys, and config load.
- Remote app-version source with auto-increment to avoid install/version conflicts.

**Acceptance:** a staging build installs on internal testers' devices and points at the
staging backend.

---

## Shared building blocks for the ordering verticals

Phases 4–9 each deliver one ordering vertical. They share the same spine, so it is built
once and reused. Each vertical layers its own catalogue and business rules on top.

- **Vertical home** — hero/banners, coupons, and the entry point into that vertical's menu.
- **Catalogue & menu** — items, weekly menu where applicable, **cluster-wise** availability
  (serviceable-area filtering), and category browsing.
- **Cart & pricing engine** — a single, well-tested calculation module: item totals,
  add-ons, taxes/GST, delivery, packaging, platform fees, coupons, and wallet/cashback
  redemption. Bill math mirrors the Ionic `tabCart` logic per vertical.
- **Payments** — one payment service with the two live gateways (JusPay HyperSDK and Paytm
  All-in-One) switched by config, plus order creation and payment validation.
- **Orders** — a hierarchy of **parent order → child orders → daily orders**, each with
  live status and a delivery map where relevant.

**Acceptance (per vertical):** browse → add to cart → correct bill → pay → order created →
track status.

---

## Phase 4 — Subscription 🔄

The flagship vertical; also the template for the others.

- **Subscription home** — plans, banners, coupons.
- **Menu** — weekly menu, cluster-wise menu, and categories.
- **Configure** — plan options and add-ons; dates, meal selection (lunch/dinner), delivery
  address.
- **Cart** — full bill calculation (per-day × meals, GST, charges, coupons, wallet).
- **Payments** — JusPay / Paytm integration with order creation and validation.
- **Orders** — subscription parent order → child orders → **daily orders** with delivery
  map and per-day status.

**Acceptance:** a user can subscribe, pay, and track daily deliveries end-to-end.

---

## Phase 5 — Bulk ⏳

Same spine as Phase 4, specialised for bulk ordering: bulk home, bulk menu / food-box
configuration, bulk cart and pricing, payment, and bulk orders with status.

## Phase 6 — Daily Order ⏳

Same spine: on-demand daily ordering — home, menu/categories, cart, payment, and
same-day order tracking with map and status.

## Phase 7 — Dine-in ✅

Diverges from the shared vertical spine: the Ionic apps model dine-in as a
subscription meal-package purchase with an `isDineIn` flag (fixed lunch/dinner
windows, delivery/packaging/platform fees waived, no address) — there is no
real table/seat booking anywhere in either reference app to port. The RN app
instead builds dine-in as an actual **table booking** flow:

- **Dine In home** (Kota-cluster tab) — gradient hero banner + a list of
  bookable kitchens for the current cluster, each with a photo/gradient card
  and a "Book a table" action.
- **Booking** — date (same-day allowed) + lunch/dinner meal-slot picker with a
  same-day cutoff, party size, optional special requests.
- **Confirm** — a booking summary and a direct "Reserve Table" action (no
  payment gateway — reservations aren't paid for up front) with a
  success/retry state.

No cart, pricing engine, or payment step — a reservation has no bill. The
`getDineInKitchensForCluster` / `getDineInAvailability` / `saveDineInBooking`
backend endpoints are proposed, not yet implemented or verified (flagged in
`src/services/http/endpoints.ts`); the feature shows an empty kitchen list
until backend ships them.

**Acceptance:** a user can browse kitchens, pick a date/meal/party size, and
reserve a table end-to-end once the three `dineIn` endpoints exist.

## Phase 8 — Navmool (Marketplace) ⏳

Same spine: marketplace home, kitchen and item browsing, options sheets, cart, payment,
and marketplace orders with status.

## Phase 9 — Advance Order ⏳

Same spine: advance/scheduled ordering — home, menu, scheduling, cart, payment, and
scheduled-order tracking.

---

## Phase 10 — Hardening & Finalisation ⏳

- Cross-vertical audit: cart and pricing edge cases, coupon + wallet + cashback
  interactions, empty/error/loading states, and cluster/serviceability conditions.
- Accessibility, responsive layout, reduced-motion, and light/dark parity across screens.
- Performance pass (list virtualisation, image/animation weight, cold-start).
- Feature-flag and cluster-condition verification against the backend config.
- QA sweep on real devices for each vertical's happy path and key edge cases.

**Acceptance:** every vertical passes its happy path and priority edge cases on device.

---

## Phase 11 — EAS: Production + CI/CD ⏳

- **Production build profile** — production environment, store-ready Android App Bundle and
  iOS build, auto-incrementing version codes.
- **Store submission** — `eas submit` wired for Play Store (and App Store) with service
  credentials.
- **CI/CD** — automated pipeline: on merge to the release branch, run typecheck + build,
  trigger EAS builds per environment, and publish EAS Updates (OTA) to the matching
  channel; staging auto-builds, production gated by approval.
- **Release hygiene** — versioning policy, changelog, and rollback via EAS Update.

**Acceptance:** a tagged release produces store artifacts and an OTA update through the
pipeline with no manual build steps.

---

## Appendix

### Ordering-vertical checklist (applied to Phases 4–9)

- [ ] Vertical home (hero, banners, coupons)
- [ ] Menu: items · weekly menu · cluster-wise menu · categories
- [ ] Cart with full pricing (items, add-ons, GST, charges, coupons, wallet/cashback)
- [ ] Payment gateway (JusPay / Paytm) + order creation + validation
- [ ] Orders: parent → child → daily, with delivery map and live status
- [ ] Empty / error / loading states and serviceability conditions

### Key risks & dependencies

- **Payment SDKs** are native and gateway-specific; validate the native build early per
  gateway.
- **Cluster / serviceability** logic gates catalogue and tabs; port it faithfully.
- **Bill math** must match the backend to the paisa; reuse one engine and test it hard.
- **Google & Firebase keys** must be enabled for the app's package and signing certificate.
- **App identity** is shared with the production app (`com.mealawe.app`); manage versionCodes
  via EAS remote versioning to avoid install conflicts.

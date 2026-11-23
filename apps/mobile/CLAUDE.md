@AGENTS.md

# MealaweUserAppRN — Claude working notes

React Native + Expo clone of the Ionic `MealaweUserApp`. Behavioural reference for
screens is `../mealaweApp` (modern Ionic 8); source of truth is `../MealaweUserApp`.

**Stack:** Expo SDK 57 · RN 0.86 · React 19.2 · Expo Router · NativeWind v5 + Tailwind
v4 · Gluestack UI v5 · Zustand · expo-secure-store + react-native-mmkv · lottie-react-native
· expo-location. Android + iOS only (web removed).

> No unit tests in this project — verify with `npx expo export --platform android -c`
> and `npx tsc --noEmit`. Native changes need a dev-client rebuild (`npx expo prebuild`
> → `npm run android`). E2E coverage is Maestro-only — see
> **[docs/TESTING-WORKFLOW.md](docs/TESTING-WORKFLOW.md)** for the convention to
> follow whenever a feature is added or changed, and **[.maestro/README.md](.maestro/README.md)**
> for flow setup/selector notes.
>
> Releases (versioning, EAS build/submit, Play Store tracks, GitHub Actions CI/CD,
> iOS setup for later) are documented in
> **[docs/CI-CD-RELEASE-GUIDE.md](docs/CI-CD-RELEASE-GUIDE.md)**.
>
> Native navigation (Expo Router's Stack.Toolbar/Header/SearchBar), the Expo MCP
> server (`.mcp.json`, project-scoped), and EAS Observe (performance monitoring) are
> documented in **[docs/NATIVE-NAV-AND-OBSERVABILITY-PLAN.md](docs/NATIVE-NAV-AND-OBSERVABILITY-PLAN.md)**.

---

## Design Context

Strategy + visual system are captured at the app root (via `/impeccable`):
- **[PRODUCT.md](PRODUCT.md)** — register (product), platform (adaptive), users, purpose,
  design principles, a11y (WCAG AA · reduced-motion · colour-blind safe).
- **[DESIGN.md](DESIGN.md)** — DESIGN.md-spec tokens + the six-section visual system
  (North Star: "The Modern Tiffin").

Read those for the *why*; the practical class/token reference below and
**[docs/DESIGN-REFERENCE.md](docs/DESIGN-REFERENCE.md)** for the *how*.

## Design system

The visual system is documented in **[docs/DESIGN-REFERENCE.md](docs/DESIGN-REFERENCE.md)** —
read it before building or restyling any screen. Highlights:

### Color (never hardcode hex)

Tokens live in [src/global.css](src/global.css) (NativeWind, light + dark) with a TS
mirror in [src/theme/palette.ts](src/theme/palette.ts) + [theme.ts](src/theme/theme.ts)
for JS-side needs (navigation, StatusBar, gradients, SVG).

| Token | Hex | Role |
| --- | --- | --- |
| `primary` / `brand-green` | `#63AB45` | Primary (leaf green) |
| `brand-green-dark` | `#518937` | Primary dark |
| `secondary` / `brand-yellow` | `#FFCA22` | Secondary / accent |
| `accent` / `brand-cream` | `#EAE2B7` | Warm surface |
| `brand-teal` | `#042A33` | Deep ink / dark bg |

Use semantic classes (`bg-primary`, `text-foreground`, `text-muted-foreground`,
`border-border`, `text-danger`). Fixed brand hues that must not flip: `bg-brand-green`,
`text-brand-teal`, `bg-brand-yellow`.

### Typography (Metropolis)

Brand typeface is **Metropolis**, loaded locally from `src/assets/fonts/metropolis/` in
[src/app/_layout.tsx](src/app/_layout.tsx) (splash held until fonts are ready) — the same
open-source geometric sans Zomato's "Okra" is built on (Okra itself is Zomato's own
unreleased modification, not public). Size scale is Zomato's published Sushi scale
verbatim (11/12/13/15/17/19/21/24/27px, line-height = 150% of font size — see
[docs/DESIGN-REFERENCE.md](docs/DESIGN-REFERENCE.md) §3). RN does not synthesize weights —
each weight is its own family.

- **Use the `AppText` primitive** ([src/components/ui/AppText.tsx](src/components/ui/AppText.tsx))
  with a `variant` — never hand-set `fontSize` / `fontFamily` / `lineHeight`.
  Variants: `display, h1, h2, h3, title, bodyLg, body, bodySm, label, caption, overline`
  (scale in [src/theme/typography.ts](src/theme/typography.ts)).
- NativeWind utilities also exist: `text-h1`…`text-caption`, `font-metropolis` /
  `font-metropolis-bold` / `font-metropolis-black`.

### Components & conventions

- One text primitive (`AppText`); one inline SVG icon set
  ([src/components/ui/icons.tsx](src/components/ui/icons.tsx), Lucide paths via
  react-native-svg). **SVG icons, never emoji-as-icon.**
- Zustand for state (`src/store`), feature-first folders under `src/features/<domain>`.
- Immutable updates, explicit error handling, files ~200–400 lines.
- Touch targets ≥ 44×44, `active:opacity-*` press feedback, `prefers-reduced-motion`
  respected for any motion.

---

## Home top section

`src/features/home` — a hero-behind-the-header composition (mirrors mealaweApp home):

- **`LottieHero`** — full-bleed background carousel of `.lottie` animations over the
  brand gradient. Sources come from [src/features/home/homeLotties.ts](src/features/home/homeLotties.ts);
  drop files into [assets/lottie/](assets/lottie/) named `homelottie1.lottie`, … and
  register them there. Empty registry → brand gradient fallback (nothing breaks).
- **`HomeHeader`** — address (left) + wallet & profile (right), white-on-hero.
- **`HomeTabs`** — a horizontally scrollable row of order-mode shortcuts
  (Subscription / Bulk or Dine In / Daily / Advance / Navmool, each gated by its
  own `clusterStore` flag — see `(tabs)/index.tsx`'s `orderTabs`) + VEG toggle.
  There is no "More" tab: every secondary vertical is its own shortcut in this
  row, and tapping a shortcut with no in-home feed (Daily/Advance/Navmool)
  navigates straight to its screen via `SHORTCUT_ROUTES`.

Currently a **static** scaffold; per-tab feeds and scroll-driven header color land later.

## Address & location feature

`src/features/location` + `src/store/locationStore.ts`:

- GPS via `expo-location` (permission + reverse geocode, no Google key), saved-address
  match within 500m, current-address persisted locally (MMKV) and synced to the backend
  (`/api/updatecustomercurrlocation/:id`, address list via `/api/updatecustomerprofile/:id`).
- Screens: `/addresses` (manage + use current location) and `/address-form` (add / edit).
- Components: `AddressCard`, `AddressForm`, `LocationGate`.

---

## Design skills (available globally)

Two skills are installed in `~/.claude/skills` and apply to any project:

- **`/impeccable`** — production-grade UI craft (audit / polish / typeset / colorize /
  animate …). Respects existing tokens; identity-preserving.
- **`/ui-ux-pro-max`** — searchable UI/UX design DB (styles, palettes, font pairings, UX
  rules) with a React Native stack. Use for UX guidelines (touch targets, contrast,
  motion timings) — but keep Mealawe's established brand (green / Metropolis / light-first),
  don't adopt its generic palette suggestions.

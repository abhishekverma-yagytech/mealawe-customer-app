# Mealawe — Design Reference

The visual + interaction source of truth for MealaweUserAppRN. The behavioural and
visual reference is **`../mealaweApp`** (Ionic 8 rebuild); this doc ports its system to
React Native / NativeWind. Read it before building or restyling a screen.

---

## 1. Brand

Mealawe is a homely food-ordering app — fresh, trustworthy, warm. The design **serves the
task** (product register): the tool disappears into ordering. Familiar patterns beat
novelty; delight is saved for moments, not pages.

- **Register:** product · **Platform:** native (iOS + Android, one unified look)
- **Mood:** fresh, healthy, homely, confident — never clinical or loud
- **Mode:** light-mode-first (dark tokens exist and are supported)

---

## 2. Color

Single source of truth: [src/global.css](../src/global.css) (NativeWind tokens, light +
dark) with a TS mirror in [src/theme/palette.ts](../src/theme/palette.ts). **Never
hardcode hex in a component — use the token classes.**

| Role | Token / class | Light hex |
| --- | --- | --- |
| Primary | `primary` / `brand-green` | `#63AB45` |
| Primary dark | `brand-green-dark` | `#518937` |
| Secondary / accent | `secondary` / `brand-yellow` | `#FFCA22` |
| Warm surface | `accent` / `brand-cream` | `#EAE2B7` |
| Deep ink / dark bg | `brand-teal` | `#042A33` |
| Background | `background` | `#FFFFFF` |
| Foreground (ink) | `foreground` | `#042A33` |
| Muted surface | `muted` | `#F5F6F9` |
| Muted text | `muted-foreground` | `#6D6D6D` |
| Border | `border` | `#E5E5E5` |
| Danger | `danger` / `destructive` | `#E62841` |

**Strategy:** Restrained + brand-committed. Green carries primary actions, selection, and
the hero gradient; yellow is a sparing accent. The hero gradient is leaf → forest → teal
(`#63AB45 → #518937 → #042A33`) so white text reads over it. Body text is ink, not light
gray — verify ≥ 4.5:1.

### 2a. Buttons — green is for the CTA, and only the CTA

Use the shared **[`<Button>`](../src/components/ui/Button.tsx)** primitive — never hand-roll
`Pressable + bg-primary`. Variants:

| Variant | Use | Fill |
| --- | --- | --- |
| `primary` | The main call-to-action (one per view) | Solid green `#63AB45`, white label |
| `secondary` | Secondary emphasis | Solid yellow, teal label |
| `outline` | Lower-emphasis / paired action | Transparent + border |
| `ghost` | Tertiary / inline | Transparent, green label |
| `danger` | Destructive confirm | Solid danger red |

**Green never appears on a non-actionable surface.** If it isn't tappable-and-primary, it
isn't green. Buttons are solid single colors — never gradients.

### 2a-i. Order-mode CTA exception (Bulk / On-Demand only)

Bulk and On-Demand checkout touchpoints — the "Proceed to Pay"/"Pay now" CTA, the sticky
`BulkCartFooter`/`OnDemandCartFooter` bar, the menu item `<ItemAddButton>`, the
`<QuantityStepper>`'s `+`, and the `/order-result` success icon — pass `tone` to swap
green for that mode's own tab accent (`"plan"` for Bulk, `"info"` for On-Demand),
matching the color already used for their tab pill in `HomeBottomNav`. This is the
**only** place a non-green color is allowed on a primary CTA — see the Order-Mode CTA
Rule in `DESIGN.md`. Subscription and Dine In CTAs are unaffected and stay green.

| Component | Prop | Bulk | On-Demand |
| --- | --- | --- | --- |
| `<Button variant="primary">` | `tone` | `"plan"` | `"info"` |
| `<QuantityStepper>` | `tone` | `"plan"` | `"info"` |
| `<ItemAddButton>` | `tone` (required) | `"plan"` | `"info"` |
| `/order-result` success icon | via `mode` route param | `"plan"` | `"info"` |

### 2b. Icons — the "Modern Fresh" accent system

Icons carry meaning through color. Use **[`<AccentIcon icon tone>`](../src/components/ui/AccentIcon.tsx)**
— a solid-hue Lucide glyph on a soft (~12%) tint tile. Tones (TS: `palette.accent.*`,
classes: `text-accent-*` / `bg-accent-*`):

| Tone | Hex | Role |
| --- | --- | --- |
| `offer` | `#FF8A00` | Offers / POPULAR / savings |
| `plan` | `#6C5CE7` | Plan / duration |
| `info` | `#159AAB` | Delivery slot / time |
| `location` | `#2E7DF6` | Address / location |
| `reward` | `#EC4899` | Coupons / wallet / cashback |
| `food` | `#F97316` | Food / menu items |
| `veg` | `#63AB45` | Veg dot |
| `nonveg` | `#E23744` | Non-veg dot |
| `rating` | `#F5A623` | Star / rating |

**Green (`veg`) is the one overlap** — it means "veg", not "action". Everything else stays
off-green so the CTA green never has to compete. Pick the tone by *meaning*, not decoration;
the same concept gets the same hue everywhere (a location pin is always blue).

---

## 3. Typography

Brand typeface **Metropolis**, loaded locally from
`src/assets/fonts/metropolis/` (public-domain revival of Chris M. Simpson's geometric sans —
see `LICENSE.md` alongside the font files). This is the same open-source typeface
Zomato's own "Okra" is built on, per their
["Defining our typography system"](https://www.zomato.com/blog/defining-our-typography-system/)
post — Okra itself is Zomato's own unreleased modification, so Metropolis is the closest
legitimately-licensed match. RN doesn't synthesize weights — each weight is a distinct
family (`Metropolis-Regular`, `Metropolis-Bold`, `Metropolis-Black`).

**Use `<AppText variant>`** ([src/components/ui/AppText.tsx](../src/components/ui/AppText.tsx)).
Size scale is Zomato's own published Sushi scale, verbatim — 11/12/13/15/17/19/21/24/27px,
every line-height exactly 150% of its font size (per that same post):

| Variant | Size / line | Weight | Use |
| --- | --- | --- | --- |
| `display` | 27 / 41 | Bold | Big splash numbers |
| `h1` | 24 / 36 | Bold | Screen title |
| `h2` | 21 / 32 | Bold | Section title |
| `h3` | 19 / 29 | Regular | Sub-section / greeting |
| `title` | 17 / 26 | Regular | Card / row title |
| `bodyLg` | 15 / 23 | Regular | Emphasised body |
| `body` | 13 / 20 | Regular | Default body |
| `bodySm` | 13 / 20 | Regular | Secondary detail |
| `label` | 14 / 21 | Bold (exception) | Buttons, form labels — bumped +1px off the raw Zomato scale |
| `caption` | 12 / 18 | Regular | Meta |
| `overline` | 11 / 17 | Bold (exception), uppercase | Eyebrows (sparing) |

Weight follows Zomato's stated rule of thumb — regular for the 11–19px range, bold for the
headline-scale steps above it — except `label` and `overline`, kept bold since both are
short all-caps/button text where regular weight is a legibility regression, not a look.

Scale defined in [src/theme/typography.ts](../src/theme/typography.ts); NativeWind
utilities (`text-h1`, `font-metropolis-bold`, …) mirror it in [global.css](../src/global.css).

**One family, one source.** Metropolis only (no display/body pairing — product register).
Never hand-set `fontFamily` / `fontSize` inline. To emphasise a body-size line, pass
`<AppText variant="bodyLg" weight="bold">` (`weight`: `regular` \| `bold` \| `black`). The
only place a raw `FONT_FAMILY.*` belongs is a `TextInput` (which can't render `AppText`).

---

## 4. Icons

**One inline SVG set** — [src/components/ui/icons.tsx](../src/components/ui/icons.tsx),
Lucide icon paths rendered via `react-native-svg`. **SVG only, never emoji-as-icon.**

**Sizes in use** (pick the nearest, don't invent a new one):

| Size (px) | Context |
| --- | --- |
| 10–12 | Inline glyphs beside caption/overline-size text (status dots, tiny meta icons) |
| 14–16 | Default row/list icons, compact search bars, chip glyphs |
| 18 | Header actions (profile, cashback), form leading icons |
| 22–24 | Card badges, location pins, standalone tap targets |
| 28–30 | Empty-state illustrations, large `LocationGate`-style prompts |

**Stroke width:** default Lucide stroke (2) for standard icons. Override only for a
specific effect — thinner (1.25–1.75) for large low-opacity watermark icons over a
gradient fill, heavier (2.5–3.4) for small bold glyphs like stepper +/− that need to read
clearly at 14–18px.

**Color:** icons are colored via the same meaning-mapped accent system as everything else
(§2) — never a raw hex inline. A location pin is `palette.accent.location`, a coupon icon
is `palette.accent.reward`, and so on; `AccentIcon` wraps the common "solid glyph on a
~12% tint tile" pattern for icon-tile contexts.

---

## 5. Home top section (reference layout)

Ported from mealaweApp `home.page.html` — a **hero behind a floating header**:

```
┌───────────────────────────────────────────────┐
│  📍 Delivered to ⌄            [💳 120] [ 👤 ]   │  ← HomeHeader (white on hero)
│  Home · Kothrud                                 │
│  [Subscription] Dine In  Bulk  More      🌿VEG  │  ← HomeTabs + veg toggle
│                                                 │
│            (Lottie hero carousel)               │  ← LottieHero background
│              • • ○ ○                            │     brand gradient + dots
├───────────────────────────────────────────────┤
│  ╭─────────────────────────────────────────╮   │
│  │  Body sheet (rounded lip, white)         │   │  ← per-tab feed lands here
```

- **Address** (top-left): tap → `/addresses`. Label is `Tag · area` (`addressLabel`).
- **Wallet + profile** (top-right): wallet pill shown only when logged in.
- **Tabs**: order modes; active = white pill / green text, inactive = white on the hero.
- **VEG toggle**: global veg-only preference, leaf + switch.
- **Hero**: `.lottie` carousel (see §6); transparent so it sits behind the header.
- **Body sheet**: rounded-top white sheet overlapping the hero bottom.

mealaweApp additionally turns the header solid green once the hero scrolls past and shows
a brief "Veg Mode Activated" splash — both are **planned enhancements**, not in the static
scaffold yet.

---

## 6. Motion

- 150–250 ms on transitions; motion conveys state, not decoration.
- Ease-out curves, no bounce/elastic. Every animation needs a `prefers-reduced-motion`
  fallback.
- Press feedback via `active:opacity-*` on all pressables.

---

## 7. Lottie hero

- Library: `lottie-react-native` (native module — needs a dev-client rebuild).
- `.lottie` (dotLottie) files bundle via the `lottie` asset ext in
  [metro.config.js](../metro.config.js); `.json` Bodymovin also works.
- Drop files in [assets/lottie/](../assets/lottie/) named `homelottie1.lottie`,
  `homelottie2.lottie`, … then register them in
  [src/features/home/homeLotties.ts](../src/features/home/homeLotties.ts).
- Carousel is thumb-swipeable + fluid with pagination dots; empty registry falls back to
  the brand gradient so nothing ever ships blank.

---

## 8. Anti-slop guardrails

- No emoji as icons — use the SVG set ([icons.tsx](../src/components/ui/icons.tsx)).
- No gradient text, no decorative glassmorphism, no side-stripe borders.
- No inconsistent component vocabulary — same button shape, same field style everywhere
  (`AppText`, `TextField`, the shared icons).
- Gray-on-gray body text is the top failure mode; keep body on `foreground`, not
  `muted-foreground`, unless it's genuinely secondary.

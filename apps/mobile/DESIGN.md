---
name: Mealawe
description: Cluster-aware homestyle thali meal-subscription app — fresh, modern, effortless.
colors:
  primary: "#63AB45"
  primary-dark: "#518937"
  secondary: "#FFCA22"
  cream: "#EAE2B7"
  ink: "#042A33"
  danger: "#E62841"
  accent-offer: "#FF8A00"
  accent-plan: "#6C5CE7"
  accent-info: "#159AAB"
  accent-location: "#2E7DF6"
  accent-reward: "#EC4899"
  accent-food: "#F97316"
  accent-veg: "#63AB45"
  accent-nonveg: "#E23744"
  accent-rating: "#F5A623"
  bg-light: "#FFFFFF"
  fg-light: "#042A33"
  muted-light: "#F5F6F9"
  muted-fg-light: "#6D6D6D"
  border-light: "#E5E5E5"
  bg-dark: "#042A33"
  card-dark: "#083A45"
  fg-dark: "#F5F5F0"
  muted-dark: "#0F4A54"
  border-dark: "#144752"
typography:
  display:
    fontFamily: "Metropolis-Bold, system-ui, sans-serif"
    fontSize: "27px"
    fontWeight: 700
    lineHeight: "41px"
    letterSpacing: "-0.5px"
  h1:
    fontFamily: "Metropolis-Bold, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: "36px"
    letterSpacing: "-0.4px"
  h2:
    fontFamily: "Metropolis-Bold, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: "32px"
    letterSpacing: "-0.3px"
  title:
    fontFamily: "Metropolis-Regular, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: "26px"
    letterSpacing: "-0.1px"
  body:
    fontFamily: "Metropolis-Regular, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
    letterSpacing: "0"
  label:
    fontFamily: "Metropolis-Bold, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: "21px"
    letterSpacing: "0.1px"
  caption:
    fontFamily: "Metropolis-Regular, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "18px"
    letterSpacing: "0.1px"
  overline:
    fontFamily: "Metropolis-Bold, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: "17px"
    letterSpacing: "0.6px"
rounded:
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "14px 20px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.fg-light}"
    rounded: "{rounded.md}"
    padding: "14px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "14px 20px"
  chip:
    backgroundColor: "{colors.muted-light}"
    textColor: "{colors.fg-light}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
  card:
    backgroundColor: "{colors.bg-light}"
    textColor: "{colors.fg-light}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.fg-light}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  plan-card:
    backgroundColor: "{colors.bg-light}"
    textColor: "{colors.fg-light}"
    rounded: "{rounded.lg}"
    padding: "12px"
---

# Design System: Mealawe

## 1. Overview

**Creative North Star: "The Modern Tiffin"**

Mealawe is the daily home kitchen, digitised: warm, dependable, and quick. The system
leads with real food — thali photography fills tiles and heroes so the appetite does the
persuading — set against clean white (or deep-teal, at night) surfaces that never
compete with the plate. A single committed leaf-green carries every action and selection,
so the eye always knows where to go next. Everything else is quiet: generous whitespace,
soft rounded shapes, one calm sans (Lato) doing all the work.

This system rejects the **generic SaaS-cream dashboard** (beige surfaces, gray-on-gray
text), **cold corporate fintech** (navy-and-gold, sterile and transactional), and the
**flat, colourless utility** with no warmth or appetite. It also refuses the
coupon-spam grocery look where every banner shouts. Colour here is a language, not
decoration: green means act, and a fixed set of accents each carry one meaning.

**Key Characteristics:**
- Food-forward: imagery is the hero; chrome recedes.
- One green voice for action + selection; meaning-mapped accents for everything else.
- Light-first, fully dark-capable (surfaces flip to deep teal, green stays constant).
- Soft, rounded, generously spaced — calm, not busy.
- Motion is feedback, not choreography (150–250 ms).

## 2. Colors

A committed leaf-green over clean neutrals, warmed by food imagery and a disciplined
set of meaning-mapped accents.

### Primary
- **Leaf Green** (#63AB45): The one action colour. Primary buttons (Subscribe, Proceed
  to Pay), the selected plan/category ring, the veg dot, and the hero gradient's head.
  Reserved — if it isn't tappable-and-primary or "selected", it isn't green.
- **Forest Green** (#518937): Primary-dark; gradient mid-tone and pressed emphasis.

### Secondary
- **Saffron** (#FFCA22): Sparing warm accent; secondary-emphasis fills.

### Tertiary — the meaning-mapped accent set
Each hue owns exactly one meaning and renders as a solid glyph on a ~12% tint tile:
- **Offer Orange** (#FF8A00): offers, POPULAR badges, savings.
- **Plan Violet** (#6C5CE7): plan / duration.
- **Delivery Teal** (#159AAB): delivery slot / time.
- **Location Blue** (#2E7DF6): address / location.
- **Reward Pink** (#EC4899): coupons / wallet / cashback.
- **Food Orange** (#F97316): menu items / food fallbacks.
- **Non-veg Red** (#E23744) & **Veg Green** (#63AB45): diet dots (always paired with a shape/label).
- **Rating Gold** (#F5A623): stars.

### Neutral
- **Ink** (#042A33): body text (light mode) and the dark-mode background. Body is ink,
  never light gray.
- **Muted Surface** (#F5F6F9 light / #0F4A54 dark): chips, tiles, insets.
- **Muted Text** (#6D6D6D light / #94A3A5 dark): captions/meta only — never body.
- **Border** (#E5E5E5 light / #144752 dark): hairline dividers and card strokes.
- **Dark surfaces**: background #042A33, card #083A45, foreground #F5F5F0.

### Named Rules
**The Green-Is-Action Rule.** Leaf green appears only on the one primary CTA, current
selection, and the veg meaning. Never as a section background, never decorative.
**The One-Hue-One-Meaning Rule.** A location pin is always Location Blue; a coupon is
always Reward Pink. Pick the accent by meaning, not by looks.
**The Order-Mode CTA Rule.** Inside a specific order-mode flow — Bulk or On-Demand
checkout only — that mode's own tab accent (Plan Violet for Bulk, Delivery Teal for
On-Demand) replaces green on the flow's primary CTA, its sticky cart bar, the item ADD
control, and the order-confirmation check. This is a scoped exception, not a repeal:
Subscription's CTAs, the veg dot, and every icon-tile meaning elsewhere in the app stay
exactly as the Green-Is-Action and One-Hue-One-Meaning rules describe. Use `<Button
tone>` / `<QuantityStepper tone>` / `<ItemAddButton tone>` — never a bare hex.

## 3. Typography

**Display / Body / Label Font:** Metropolis (with system-ui, sans-serif fallback) — the
same open-source geometric sans Zomato's own "Okra" is built on (per their
["Defining our typography system"](https://www.zomato.com/blog/defining-our-typography-system/)
post; Okra itself is Zomato's proprietary modification and isn't publicly available).

**Character:** One well-tuned geometric sans carries headings, buttons, labels, body, and
data — no display/body pairing. Warmth comes from the food and the green, not from a
decorative typeface. Size scale is Zomato's own published Sushi scale, verbatim
(11/12/13/15/17/19/21/24/27px, every line-height exactly 150% of its font size). Weight
follows their stated rule of thumb — regular for the 11–19px range, bold for the
headline-scale steps above it — except `label`/`overline`, kept bold as a deliberate
exception (short all-caps/button text, where regular weight is a legibility regression,
not a look). RN loads each weight as its own family.

### Hierarchy
- **Display** (Bold, 27/41, -0.5px): big price / splash numbers only.
- **H1** (Bold, 24/36, -0.4px): screen titles.
- **H2** (Bold, 21/32, -0.3px): section titles ("Choose your plan", "Weekly Menu").
- **H3** (Regular, 19/29, -0.2px): sub-section / greeting.
- **Title** (Regular, 17/26, -0.1px): card and row titles.
- **Body Lg** (Regular, 15/23): emphasised body.
- **Body** (Regular, 13/20): default reading text, on ink — cap prose at 65–75ch.
- **Label** (Bold, 14/21, +0.1px): buttons and form labels.
- **Caption** (Regular, 12/18, +0.1px): meta.
- **Overline** (Bold, 11/17, uppercase, +0.6px): sparing eyebrows.

### Named Rules
**The One-Family Rule.** Metropolis only. Never introduce a second typeface; emphasise
with the `AppText` `weight` prop, never a raw inline `fontFamily`.
**The Ink-Body Rule.** Body text is ink (#042A33), never muted gray — muted is for meta.

## 4. Elevation

Mostly flat with tonal layering — surfaces sit on white/teal, separated by hairline
borders and muted insets rather than heavy shadows. Depth appears as a response to
importance, not by default. The single deliberate shadow is the brand-tinted lift under
the **primary green CTA**, so the one action floats slightly toward the user. Bottom
sheets carry the standard dimmed backdrop + rounded lip; the hero uses a top scrim for
white-text legibility.

### Shadow Vocabulary
- **CTA Lift** (`shadowColor: #63AB45; opacity 0.35; radius 12; offset 0,6; elevation 6`):
  primary buttons only.
- **Sheet / Overlay** (`shadowColor: #000; opacity 0.18; radius 24; offset 0,8`): the
  veg-mode pulse card and floating overlays.

### Named Rules
**The Flat-By-Default Rule.** Cards are flat, bordered, and muted-filled at rest. The
only resting shadow in the app is the green CTA lift — because attention is the point.

## 5. Components

### Buttons
- **Shape:** Soft rounded (16px `md`; 20px `lg` for prominent CTAs; 12px `sm` compact).
- **Primary:** Solid leaf-green (#63AB45), white bold label, brand-tinted CTA lift,
  `active:opacity-90` press. One per view. Exception: a Bulk/On-Demand checkout CTA
  passes `tone` to recolor fill + lift in that mode's own accent (Order-Mode CTA Rule).
- **Secondary:** Solid saffron, ink label. **Outline:** transparent + hairline border,
  ink label. **Ghost:** transparent, green label. **Danger:** solid #E62841, white label.
- **States:** loading swaps label for a variant-tinted spinner; disabled drops to 50%
  opacity and removes the lift. Solid single colours — never gradients on buttons.

### Chips
- **Style:** Muted-surface fill (#F5F6F9 / #0F4A54), ink text, full-radius pill; "What's
  included" and add-on tags.
- **State:** selection is a green ring + check, never a colour swap alone.

### Cards / Containers
- **Corner Style:** 16px (`md`); plan cards and tiles 18–20px (`lg`).
- **Background:** theme card (#FFFFFF / #083A45) — resolved via `useColors()`, never a
  hardcoded white.
- **Shadow Strategy:** flat (see Elevation) — hairline border + optional muted inset.
- **Border:** 1px theme border; selected state is a 2px green ring.
- **Internal Padding:** 12–16px.

### Inputs / Fields
- **Style:** 1px `input` border, transparent fill, 12px radius, Lato regular text.
- **Focus:** border shifts to the ring green; placeholders meet 4.5:1 (muted-fg, not light gray).
- **Disabled:** 50% opacity.

### Navigation
- **No bottom tab bar.** A fixed hero band holds the floating header + order-mode tabs
  (frosted `BlurView` band, active tab a solid white pill, ghost tabs over the hero).
  Order modes are cluster-aware (Bulk default / Dine In for Kota). Screen-to-screen nav
  is a headerless stack with native back headers on pushed routes.

### Signature Components
- **LocationClusterBar:** the reusable location+cluster combo (pin, address, serviceability).
- **CategoryCluster → PlanCard grid:** cluster-aware category circles filtering a 2-col
  plan grid; POPULAR badge (offer orange), discount %, green selection radio, sticky
  green Subscribe bar.
- **Bottom sheets** (`AppSheet`): MealDetail, WeeklyMenu (veg/non-veg + day tabs),
  Coupon, and the animated Theme picker — dimmed backdrop, rounded lip, theme card bg.

## 6. Do's and Don'ts

### Do:
- **Do** reserve leaf-green (#63AB45) for the one primary CTA, current selection, and the
  veg meaning — the Green-Is-Action Rule.
- **Do** use `tone` on Bulk/On-Demand checkout CTAs, cart bars, and ADD controls to match
  that mode's tab accent instead of green — the Order-Mode CTA Rule's one scoped exception.
- **Do** pick every non-green icon colour by meaning from the accent set (location = blue,
  coupon = pink, plan = violet…), rendered as a solid glyph on a ~12% tint tile.
- **Do** keep body text on ink (#042A33 / #F5F5F0); muted gray is for captions only.
- **Do** resolve every surface through `useColors()` so dark mode renders correctly.
- **Do** pair colour with a shape, icon, or label for veg/non-veg, selection, and status —
  colour-blind safe, never colour-only.
- **Do** keep motion to 150–250 ms feedback with a reduced-motion fallback; touch targets ≥ 44×44.

### Don't:
- **Don't** build a **generic SaaS-cream dashboard** — no beige/near-white surfaces, no
  gray-on-gray text.
- **Don't** drift toward **cold corporate fintech** — no navy-and-gold, sterile, transactional feel.
- **Don't** ship a **flat, colourless utility** with no food warmth or appetite appeal.
- **Don't** stack coupon-spam banners or let multiple elements shout for attention.
- **Don't** put green on anything non-actionable, or use gradients on buttons.
- **Don't** hand-set `fontFamily`/`fontSize` inline or add a second typeface — use `AppText`
  + `weight`.
- **Don't** rely on colour alone to signal veg/non-veg or state.

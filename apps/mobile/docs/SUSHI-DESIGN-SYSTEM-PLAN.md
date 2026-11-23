# Mealawe — Adopting Zomato's "Sushi" Design System Structure

**App:** MealaweUserAppRN
**Prepared:** 2026-08-13
**Status:** For review — no code has been changed yet

---

## 1. Why this plan exists

Zomato's 2019 "Sushi" post isn't a visual spec (no colors, no font, no exact spacing
numbers) — it's a **structure**: how a design system should be organized so it stays
maintainable as a product grows. Three parts:

1. **Four principles** — User Centricity, Inclusivity, Simplicity, Consistency.
2. **Atomic Design layering** — Foundations (typography, color, icons, spacing, shadow,
   information architecture) → Component Library (buttons, inputs, cards — "molecules and
   organisms") → Patterns/Templates (composed screens built from those components).
3. **One shared library** so designers/developers stop re-deriving the same button, card,
   or spacing decision on every new screen.

You asked to check this against the app and implement the same structure for fonts,
spacing, "all that." This plan is the audit + gap-fill, not a redesign — the good news
up front: **most of this already exists**. The real gap is smaller and more specific than
a from-scratch design-system build.

---

## 2. Current state, mapped against Sushi's three layers

### 2.1 Foundations

| Sushi foundation | Mealawe today | Status |
|---|---|---|
| Typography | `src/theme/typography.ts` + `AppText` primitive — Metropolis, Zomato's own published 11/12/13/15/17/19/21/24/27px scale, enforced (screens can't hand-set `fontSize`) | **Done** (just implemented) |
| Color | `src/theme/palette.ts` + `theme.ts` + `useColors()` — full light/dark semantic tokens, a documented "one-hue-one-meaning" accent system in `DESIGN.md` | **Done** |
| Shadow | `src/theme/shadows.ts` — `card`/`lifted`, documented "flat-by-default" rule in `DESIGN.md` | **Done** |
| Icons | `src/components/ui/icons.tsx` — one inline SVG set (Lucide paths via `react-native-svg`), "never emoji" rule in `CLAUDE.md` | **Exists, undocumented** — no foundation-level reference doc listing sizes/usage conventions the way typography and color have |
| Spacing | **Only exists as a spec in `DESIGN.md`'s frontmatter** (`xs 4 / sm 8 / md 12 / lg 16 / xl 20`) — never became a real, importable token. Every screen picks Tailwind spacing classes (`gap-3`, `px-4`, `py-2.5`, …) ad hoc, with no shared scale enforcing consistency | **Gap** — the one foundation category with no code-level enforcement at all |
| Information architecture | Route structure under `src/app/`, `CLAUDE.md`'s per-feature breakdown | **Done**, informally — no single IA diagram, but the file structure itself is the map |

### 2.2 Component Library

`src/components/ui/` (Button, AppText, QuantityStepper, ItemAddButton, AppSheet, Skeleton,
Toggle, ConfirmDialog, …) plus feature-scoped components under `src/features/*/components/`
— this **is** Sushi's component library, functionally. The gap: Sushi's post shows a
browsable catalog (their Figma "Buttons and Core Components" panel) — Mealawe has no
single reference listing what exists, so it's easy for a new screen to accidentally
duplicate a component that's already built (this happened at least once already this
session — the coupon-code `TextInput` was hand-duplicated identically across `cart.tsx`,
`on-demand-cart.tsx`, and `BulkCouponCard.tsx` instead of one shared component).

### 2.3 Patterns / Templates

Several genuine recurring patterns exist in the code but aren't named or documented as
reusable templates — every new screen re-derives them from scratch by copying a similar
screen:
- The "Zomato/Swiggy menu row" (name/price left, photo right, floating ADD/stepper over
  the photo's bottom edge) — used almost identically in `OnDemandItemCard` and
  `BulkMenuItemCard`.
- The "bottom overlay stack" (open orders + sticky CTA combined into one swipeable card
  above the nav bar).
- The 2-column category/kitchen grid card (photo + white footer, `border-border` + 18px
  radius) — just standardized for Bulk and On-Demand this session.

### 2.4 Principles

Sushi's four principles already exist in `PRODUCT.md`'s "Design Principles" section —
just under different names. They're the same ideas:

| Sushi | Mealawe (`PRODUCT.md`) |
|---|---|
| User Centricity | "One confident path" — one primary action per screen |
| Inclusivity | "Accessibility & Inclusion" — WCAG AA, reduced-motion, colour-blind safe |
| Simplicity | "Appetite, not noise" — no competing banners/badges |
| Consistency | "Meaningful colour" — one hue, one meaning, everywhere |

No change needed here beyond cross-referencing the two documents (§4.4).

---

## 3. What's actually missing (the real scope of this plan)

Stripped of what already exists, four concrete gaps:

1. **No code-level spacing scale.** Spacing lives only as unused YAML in `DESIGN.md`.
2. **`DESIGN.md` is now stale.** It still documents Lato and the pre-compaction 34/28/24…
   type scale — both superseded earlier this session (Metropolis, 27/24/21/19/17/15/13…).
3. **No icon foundation reference** (sizes used, when to use `size` 14 vs 18 vs 24, stroke
   width conventions) — exists in practice, not in writing.
4. **No component catalog or named pattern library** — both exist as code, neither as a
   single findable reference, which is exactly the "searching for existing components was
   always a tedious task" problem Sushi's own post describes solving.

---

## 4. Proposed additions

### 4.1 A real spacing token (closes the biggest gap)

New `src/theme/spacing.ts`:

```ts
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
} as const;
```

Matches `DESIGN.md`'s existing spec exactly (no new numbers invented) — this just makes
the already-documented scale real and importable. Exported from `theme/index.ts` alongside
`palette`/`typography`/`shadow`, same pattern. Existing Tailwind spacing classes
(`gap-3`, `px-4`) already map to the same 4px grid, so this isn't a rewrite of every
screen — it's a named reference new components can cite instead of picking an arbitrary
number, plus something `DESIGN.md`/`DESIGN-REFERENCE.md` can point to as source of truth.

### 4.2 Resync `DESIGN.md` to the current system

Update the frontmatter + prose typography section to Metropolis and the exact
11/12/13/15/17/19/21/24/27 scale (currently documents the pre-Metropolis Lato spec).
Everything else in `DESIGN.md` (color, shadow, component rules) is already accurate —
this is a targeted fix, not a rewrite.

### 4.3 An icons foundation reference

Add an "Icons" section to `docs/DESIGN-REFERENCE.md` alongside the existing Color/
Typography sections: the sanctioned sizes in use (11–24px range, by context), stroke-width
convention, "SVG only, never emoji" rule (already stated in `CLAUDE.md`, just not
collected with the other foundations).

### 4.4 A component catalog + named patterns doc

New `docs/COMPONENT-CATALOG.md`:
- One table per `components/ui/*` primitive: name, purpose, key props, one-line usage
  example — so "do we already have a stepper/sheet/toggle for this" is a doc search, not
  a grep.
- A short "Patterns" section documenting the 3 recurring templates from §2.3 by name
  (Menu Row, Bottom Overlay Stack, Category Grid Card), pointing at their canonical
  implementation, so the next screen that needs one imports/copies the named pattern
  instead of re-deriving it — directly closing the duplicated-coupon-input gap.

### 4.5 Principles cross-reference

One-line addition to `PRODUCT.md`'s "Design Principles" header noting the Sushi mapping
from §2.4, so the intentional lineage is documented, not just coincidental.

---

## 5. Phased plan

| Phase | Scope | Size | Risk |
|---|---|---|---|
| 1 | `spacing.ts` token + export | S | None — additive, matches existing documented values exactly |
| 2 | Resync `DESIGN.md` typography section to Metropolis | S | None — doc-only fix |
| 3 | Icons foundation section in `DESIGN-REFERENCE.md` | S | None — doc-only |
| 4 | `docs/COMPONENT-CATALOG.md` (component table + named patterns) | M | None — doc-only, but takes the most audit time (cataloging every `components/ui/*` file) |
| 5 | `PRODUCT.md` principles cross-reference | XS | None |

Nothing in this plan touches a screen's actual UI — it's foundation/documentation work
that makes the design system Sushi-shaped: real tokens where they were missing, and a
findable catalog where duplication has already happened once. Low risk, no visual QA
needed, verifiable by `tsc --noEmit` for the one new token file.

## 6. What's explicitly out of scope

- No new visual redesign — colors, shadows, and the button/card component set are
  already documented and correct; this plan doesn't touch them.
- No tooling change (no Sketch→Figma equivalent migration — this app's "design system" is
  code + markdown docs, not a separate design tool artifact).
- No component API changes — the catalog documents what exists, it doesn't refactor it.

---

*This plan covers documentation and one new token file only — no screen UI changes.
Implementation starts once this is approved.*

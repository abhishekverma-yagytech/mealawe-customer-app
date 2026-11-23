# Product

## Register

product

## Platform

adaptive

## Users

Everyday home-food eaters in serviceable Indian city clusters (Pune, Bangalore, Kota,
…) — students, working professionals, and families who want a dependable daily meal
without cooking or deciding every day. They open the app in short, purposeful sessions:
pick a thali category, choose a plan length, set meal time and dates, and check out.
Their delivery area (cluster) determines which categories, plans, menus, and prices they
see, so "where am I ordering to" is context they carry through every screen.

## Product Purpose

Mealawe lets a customer subscribe to homestyle thali meal plans — cluster-aware
categories → multi-day plans → weekly menu → schedule + add-ons → cart — instead of
ordering meal by meal. Success is a customer who configures and subscribes to a plan in
one confident sitting, and comes back because the flow is fast and the food is trusted.

## Brand Personality

Fresh, modern, effortless. The voice is friendly and plain-spoken (no jargon, no
hard-sell). The interface should feel like a well-run kitchen: calm, confident, and
quick — appetite-forward warmth from food imagery and a committed green, not from noise.
Green signals action and freshness; other accents carry meaning, never decoration.

## Anti-references

Not a generic SaaS-cream dashboard (beige/near-white surfaces, gray-on-gray text). Not
cold corporate fintech (navy-and-gold, sterile, transactional). Not a flat, colourless
utility with no warmth or appetite appeal. Also not a cluttered, coupon-spam grocery app
where every element shouts.

## Design Principles

_Maps onto Zomato's Sushi design system's four named principles: "Location is the frame"
+ "One confident path" = User Centricity; Accessibility & Inclusion (below) = Inclusivity;
"Appetite, not noise" = Simplicity; "Meaningful colour" = Consistency. Same ideas, named
for this product — see `docs/SUSHI-DESIGN-SYSTEM-PLAN.md` for the full audit._

- **Location is the frame.** The serviceable cluster + delivery address are first-class
  context, resolved once and reused everywhere — never make the user re-establish where
  they're ordering to.
- **One confident path.** Each screen has a single primary action in green; everything
  else steps back. The eye should always know where to go next.
- **Appetite, not noise.** Warmth comes from real food imagery and a committed palette,
  not from banners, badges, or decorative gradients competing for attention.
- **Meaningful colour.** Green = action/selection/freshness; every other hue maps to a
  fixed meaning (offers, plans, delivery, location, rewards, veg/non-veg). Never colour
  for decoration, and never rely on colour alone to carry meaning.
- **Fast and flow-preserving.** Motion conveys state and feedback in 150–250ms; no
  page-load choreography, no waiting on animation to act.

## Accessibility & Inclusion

Target WCAG AA: body text and placeholders ≥ 4.5:1 against their background; large text ≥
3:1. Respect reduced-motion — every animation needs a crossfade/instant fallback.
Colour-blind safe: veg/non-veg, selection, and status must never rely on colour alone —
pair them with an icon, label, or shape. Touch targets ≥ 44×44.

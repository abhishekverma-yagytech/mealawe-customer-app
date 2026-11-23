# Visual Design Audit & Improvement Plan

**App:** MealaweUserAppRN (Expo/React Native)
**Date:** 2026-08-26
**Scope:** Full screen-by-screen audit — all 33 routed screens under `src/app/`, evaluated against the
8-principle framework below.
**Method:** Code-level audit (JSX + NativeWind classes + design tokens), not a live-device screenshot
pass. Recommendation: re-run a screenshot-based pass (`/design-review`) after Phase 1 lands, since some
spacing/contrast calls read differently rendered than in source.

---

## Why this document exists

Building a simple app is easy now. The gap between an app spawned by vibe-coding tools and one made by
professionals is visibly obvious — not because the AI-built app is missing features, but because it's
missing **polish**. Polish is what happens when persistence and taste meet the science of design.

Agents are good at assembling patterns and layouts. They are bad at judging whether the result looks
right, because design is not code — an agent has no eyes. Left alone, agent output tends toward
**utilitarian**: feature-complete, correctly wired, visually flat. That pattern shows up repeatedly in
this audit — bare row lists, missing celebratory moments, borrowed OS dialogs instead of in-app ones,
skeleton states that don't match their real content.

The fix isn't a vague "make it nicer" instruction. It's a fixed vocabulary you can point at any screen
and get a concrete answer:

| Principle | What it checks |
|---|---|
| **Contrast** | Do differences in size/color/weight/shape create a clear focal point, or does everything compete equally? |
| **Hierarchy** | Does the eye know what to look at 1st, 2nd, 3rd? Is the primary action visually distinct from secondary ones? |
| **Alignment** | Do elements share edges/axes, or is spacing ad hoc? |
| **Proximity** | Are related items grouped tighter than unrelated ones, or is every gap the same regardless of relationship? |
| **Repetition** | Does the screen reuse the app's tokens (AppText variants, palette, radii, icon set) or invent one-offs? |
| **Balance** | Is visual weight distributed well top-to-bottom, or is it lopsided? |
| **White space** | Does the layout breathe, or is it cluttered — or empty *without intent*? |
| **Unity** | Does everything feel like one decision, or a template with content poured in? |

Every finding below is tagged to one of these eight. Every fix is concrete: a file, a line, a change.

---

## Executive summary — patterns that repeat across the app

Nine issues showed up in more than one screen. Fixing these systemically is higher leverage than
fixing screens one at a time, because each one is currently being *reinvented* slightly differently in
every place it appears.

1. **The single biggest miss: order confirmation has no recap, and no celebration.**
   `order-result.tsx` is the app's highest-emotion moment (money spent, order placed) and today it shows
   a generic "Order placed!" with zero plan name, day count, or amount — while `CouponCelebration`
   (in `features/cart`) fires a Lottie confetti burst for merely *applying a coupon*. The bigger win gets
   the smaller reaction. See Phase 1 #1 and Phase 3 #1.

2. **Flat, uniform spacing collapses proximity into nothing.** `cart.tsx`, `on-demand-cart.tsx`,
   `bulk-cart.tsx`, and `subscription-configure.tsx` each wrap their sections in one `gap: 14` /
   `gap: SPACING.lg` / `marginTop: 22` value applied uniformly, so a tightly-related pair (e.g. cart line
   + "add more items" link) sits exactly as far apart as two unrelated sections (e.g. items vs. delivery
   slot). Proximity principle: tiered spacing (tight within a group, loose between groups) is what
   signals grouping — flat spacing signals nothing.

3. **"Bare row list" is the app's default utilitarian pattern.** `wallet.tsx` transactions, `cashback.tsx`
   transactions, `my-orders.tsx`'s category hub, and `profile-edit.tsx` all reduce to: text, a border,
   repeat. No icon, no accent, no illustration, no framing copy. Compare to `profile.tsx` or
   `subscription-detail.tsx`, which use the exact same list-of-rows *shape* but add per-row accent tiles
   and section framing — proof the fix is cheap once named.

4. **Design tokens drift into hardcoded values.** `cashback.tsx:91` hardcodes `'#f0a500'` for its hero
   gradient — but DESIGN.md's One-Hue-One-Meaning rule assigns **Reward Pink**
   (`palette.accent.reward`) specifically to cashback/coupons/wallet, so this screen is visually
   off-brand *and* breaks the meaning-mapped color system. `manage-subscription.tsx` hardcodes
   `borderRadius: 18` in four places (lines 182, 237, 252, 453) instead of the shared `RADIUS` token.
   `welcome.tsx:106` hardcodes a teal gradient rgba instead of deriving it from `palette.brand.teal`.
   `refer-earn.tsx` mixes inline `RADIUS.lg` and the `rounded-2xl` className for the same visual radius.

5. **Loading skeletons don't match their real content's geometry**, causing a visible resize/pop when
   data arrives: `bulk-menu.tsx`'s skeleton (84×84, radius 18) vs. its real card (118×118, radius 14);
   `on-demand-kitchen.tsx`'s skeleton (64×64) vs. its real photo (118×118).

6. **Food/kitchen photography gets dropped exactly where it matters most.** `on-demand-kitchen.tsx`
   shows the kitchen's photo on the browse grid, then drops it entirely on the detail/menu screen —
   contradicting DESIGN.md's "imagery is the hero" principle. `on-demand-cart.tsx` renders a generic
   utensil icon for every cart line instead of the item's real photo, even though the same item carried
   a photo one screen earlier — and even though `bulk-cart.tsx`'s equivalent component
   (`BulkCartLineItem.tsx:36-40`) already does this correctly. That's a same-codebase reference
   implementation sitting unused one file away.

7. **Hand-rolled buttons instead of the shared `Button` primitive.** `login.tsx` (lines 218-229,
   276-287) and `register.tsx` (194-205) each hand-roll `Pressable` + manual `opacity-50` disabled state
   + manual `ActivityIndicator` — exactly what `Button.tsx`'s `loading`/`disabled`/`block` props already
   solve. Same pattern, reinvented twice, missing the one that's already built.

8. **Native OS dialogs break the in-app illusion at the one moment that should feel most "in-app."**
   `feedback.tsx` uses `Alert.alert(...)` (lines 29, 42, 48) for both a login-required prompt and the
   "Thank you!" confirmation, instead of the app's own `ConfirmDialog`/`AppSheet`.

9. **Duplicated markup that should be a shared component.** The FAQ accordion in `help.tsx:65-89` is
   copy-pasted near-verbatim from `refer-earn.tsx:84-109`. The bottom-sheet shadow style object is
   duplicated identically (`shadowColor:'#042a33', shadowOffset:{0,-8}, shadowOpacity:0.12,
   shadowRadius:20, elevation:12`) inline in both `login.tsx` and `register.tsx`. Not a visual bug today,
   but the two copies will drift the next time either gets touched.

### What's already working — protect these as reference patterns

- **Home screen** (`(tabs)/index.tsx` + `src/features/home/`) — the strongest screen in the app. A
  per-vertical accent color carries through hero → active nav icon → progress dots via `tabTheme.ts`;
  story-style progress bars, a wavy rain banner, platform-aware glass/blur nav. This is what "Unity"
  looks like when every principle agrees with the others.
- **`subscription-detail.tsx`** — best contrast in its flow (real hero photography vs. flat cards below),
  and a textbook-correct Proximity execution: name+tagline are explicitly grouped at a tighter `gap: 4`,
  separated by code comment from the outer `gap: 24` rhythm.
- **`address-form.tsx`** — map-as-anchor + logical top-to-bottom decision flow; the strongest of the
  profile/account screens.
- **`on-demand-kitchens.tsx`** and **`bulk-cart.tsx`** — food-forward card imagery, and `bulk-cart.tsx`
  specifically is the reference implementation for the item-photo fix needed in `on-demand-cart.tsx`
  (finding #6 above).
- **`register.tsx`** — correctly sizes its video hero (`h-48`, not `flex-1`) so the form gets a stable
  majority of the screen; **`login.tsx`** should match this (see Phase 1).
- **`refer-earn.tsx`** — deliberate teal hero + icon badge, the best-executed of the rewards/support
  screens (needs personalization, not a redesign — see Phase 3).

---

## Roadmap

### Phase 1 — Quick wins (days, not weeks; low risk, high visual leverage)

| # | Fix | File | Principle |
|---|---|---|---|
| 1 | Add a recap block (plan name, day count, amount paid) to the success state, reusing `DetailRow`/`BillRow` | `order-result.tsx:170-188` | Hierarchy, Unity |
| 2 | Replace the bare text stub with the existing `ComingSoonScreen` primitive | `(tabs)/explore.tsx` | White space, Unity |
| 3 | Replace hardcoded `'#f0a500'` hero gradient with `palette.accent.reward` (Reward Pink) — fixes both the off-brand color and the One-Hue-One-Meaning violation | `cashback.tsx:91` | Repetition |
| 4 | Make "Extend plan" a full-width `block` button to match every sibling screen's CTA weight | `manage-subscription.tsx:289` | Hierarchy |
| 5 | Replace 4× hardcoded `borderRadius: 18` with the shared `RADIUS` token | `manage-subscription.tsx:182,237,252,453` | Repetition |
| 6 | Replace hand-rolled `Pressable` CTAs with the shared `Button` component | `login.tsx:218-229,276-287`, `register.tsx:194-205` | Repetition |
| 7 | Cap the login hero's height (match `register.tsx`'s `h-48` instead of `flex-1`) so the form isn't squeezed on tall screens | `login.tsx:147` | Balance |
| 8 | Render `line.item.itemImage` in cart-line tiles instead of a generic utensil icon — port `BulkCartLineItem.tsx:36-40`'s pattern | `on-demand-cart.tsx:300-312` | Repetition, Contrast |
| 9 | Replace `Alert.alert` calls with `ConfirmDialog`/`AppSheet` | `feedback.tsx:29,42,48` | Unity |
| 10 | Fix skeleton-to-real-content size mismatch (84×84 r18 → 118×118 r14) | `bulk-menu.tsx:171-179` vs `BulkMenuItemCard.tsx:65,136-144` | Repetition |
| 11 | Fix skeleton-to-real-content size mismatch (64×64 → 118×118) | `on-demand-kitchen.tsx:130-143` | Repetition |
| 12 | Token-derive the hero gradient instead of a hardcoded teal rgba | `welcome.tsx:106` | Repetition |

### Phase 2 — Systemic consistency (1-2 weeks)

| # | Fix | File | Principle |
|---|---|---|---|
| 1 | Tiered-spacing pass: tight gap within a group, loose gap between groups, instead of one flat value | `cart.tsx`, `on-demand-cart.tsx:270`, `bulk-cart.tsx:283`, `subscription-configure.tsx:177-329` | Proximity |
| 2 | Extract a shared `FaqAccordion` component to de-duplicate the two copies | `help.tsx:65-89`, `refer-earn.tsx:84-109` | Repetition |
| 3 | Extract the duplicated bottom-sheet shadow style into one shared constant | `login.tsx`, `register.tsx` | Repetition |
| 4 | Reconcile `StepProgress` — Plan renders one filled + one tinted segment with two overline labels; Configure renders both segments filled + a "2/2" counter. Same component, two visual languages. | `subscription-plan.tsx:288-311` vs `subscription-configure.tsx:404-416` | Unity |
| 5 | Give bare row lists a per-row icon/accent treatment and section framing copy | `wallet.tsx:104-123`, `cashback.tsx:109-134`, `my-orders.tsx:23-41` | White space, Unity |
| 6 | Carry the kitchen photo into the detail screen as a header image; render kitchen name in-body as `h2` instead of relying on native header chrome | `on-demand-kitchen.tsx:127,160-187` | Contrast, Hierarchy |
| 7 | Elevate plan-name hierarchy to `h3`/bold so it outranks the six cards below it; differentiate the bill card with a subtle tint border; add a one-line trust cue near the CTA | `cart.tsx:308,525,625` | Contrast |
| 8 | Add an avatar/identity element to the edit-profile form; visually differentiate read-only fields from editable ones (icon or "Verified" label, not opacity alone) | `profile-edit.tsx:44-58`, `EditProfileForm.tsx:83-107` | Unity, Hierarchy |
| 9 | Give "Sign out" real separation (hairline + margin, or a plain text link) instead of parity with every other settings row | `profile.tsx:213-219` | Hierarchy |
| 10 | Unify the header-block spacing idiom (`px-4 pt-3` vs `mx-4 mt-3` for adjacent blocks) | `bulk-menu.tsx:131,154,165` | Alignment |

### Phase 3 — Bigger investment (backlog, plan for a dedicated sprint)

| # | Fix | File | Principle |
|---|---|---|---|
| 1 | Give the actual purchase-success moment the same delight tier `CouponCelebration` already gives a coupon apply (Lottie/confetti on the biggest emotional payoff in the app, not the smallest) | `order-result.tsx`, reuse `features/cart`'s `CouponCelebration` | Unity |
| 2 | Personalize `refer-earn.tsx` with a live stat ("You've earned ₹X from N friends") for returning users, not just the pitch | `refer-earn.tsx:39-45` | Hierarchy |
| 3 | Decide whether `order-tracking.tsx` still needs to exist as a standalone destination now that `order-detail.tsx` has inline tracking; if kept, give the live-tracking moment a livelier "delivery journey" treatment (progress dots, rider avatar) instead of map+card+button | `order-tracking.tsx` | Balance, Unity |
| 4 | Merge `profile.tsx`'s nine separately-shadowed rows into fewer true iOS-style grouped cards with internal dividers | `profile.tsx:137-227` | Repetition |
| 5 | Restore/replace the hero scrim on subscription-detail (a `LinearGradient` is commented out, leaving a flat photo with a floating button) | `subscription-detail.tsx:485-488` | Contrast |

---

## Full screen-by-screen audit

### Group A — Onboarding, Auth & Shell

#### Welcome (`src/app/welcome.tsx`)
**Snapshot:** Full-bleed 3-slide image carousel with autoplay, bottom gradient scrim, pagination dots, logo, headline/subtitle, "Get Started" CTA.
- Contrast — Solid: white text over teal gradient scrim, active dot `bg-secondary` vs `bg-white/55` inactive.
- Hierarchy — The 150×46 logo sits directly above the headline with its own `mt-20` gap, competing with the title for "read first" — two brand-weight elements stacked with no differentiation.
- Alignment — Fine, all centered on one axis.
- Proximity — Logo spacing is a hardcoded `marginTop: 20` inline style (line 133) instead of joining the `gap-2` rhythm the rest of the stack uses.
- Repetition — Gradient scrim hardcodes `rgba(4,42,51,…)` (line 106) instead of deriving from `palette.brand.teal`.
- Balance — Good, appropriately bottom-heavy for a carousel onboarding pattern.
- White space — Comfortable.
- Unity — Reads as one intentional cinematic screen; best-executed of the group.

**Top fixes:** (1) token-derive the gradient rgba — line 106. (2) fold the logo's inline margin into the surrounding `gap-2` rhythm — lines 130-137. (3) shrink/de-emphasize the logo relative to the headline.

#### Login (`src/app/login.tsx`)
**Snapshot:** Two-step phone→OTP flow: looping video hero over a rounded bottom-sheet form card.
- Contrast — Solid: `bg-black/25` scrim keeps top controls legible; card text tokens are clean.
- Hierarchy — Clear per step; disabled buttons drop to `opacity-50`.
- Alignment — Consistent `gap-5`/`gap-1` rhythm inside the sheet.
- Proximity — The resend row (line 262-274) leaves a floating empty space once the countdown ends — "Resend OTP" reads isolated rather than grouped near the OTP boxes.
- Repetition — Both CTAs (218-229, 276-287) hand-roll `Pressable` + manual disabled/loading state instead of using `Button.tsx`, which already covers this exact case.
- Balance — The video hero is `flex-1` (grows to fill remaining space); on tall screens it can dominate over half the screen for what's fundamentally a data-entry form.
- White space — Generous, unforced sheet padding.
- Unity — Mirrors Register's pattern, giving the auth flow a consistent identity.

**Top fixes:** (1) replace both hand-rolled CTAs with `Button` — lines 218-229, 276-287. (2) cap the hero's height instead of `flex-1` — line 147. (3) reserve a fixed-width slot for "Resend OTP" so the row doesn't shift — lines 262-274.

#### Register (`src/app/register.tsx`)
**Snapshot:** Post-login profile completion (name/email/optional referral), same video-hero + bottom-sheet pattern as Login, with a "Skip" escape hatch top-right and bottom.
- Contrast — Solid, same system as Login.
- Hierarchy — Good: headline → subcopy → 3 fields → primary Confirm → correctly de-emphasized "Skip for now" text link.
- Alignment — Fine, uniform `gap-4` field stack.
- Proximity — Good grouping of fields vs. error message vs. CTA pair.
- Repetition — Confirm button (194-205) hand-rolls `Pressable` instead of `Button`; also duplicates Login's identical shadow style object verbatim instead of sharing one constant.
- Balance — Better than Login: hero is a fixed `h-48`, so the form gets a stable majority of the screen.
- White space — Comfortable `padding:22`.
- Unity — Consistent with Login/Welcome.

**Top fixes:** (1) replace the Confirm `Pressable` with `Button` — line 194-205. (2) extract the duplicated shadow style into one shared constant. (3) "Skip for now" (207-211) and the hero's own "Skip" (102-108) duplicate the same exit with two different affordances — pick one or subordinate the redundant one.

#### Index / Boot Gate (`src/app/index.tsx`) + Root Layout (`src/app/_layout.tsx`)
**Snapshot:** Pure routing logic — no visual surface of their own. `index.tsx` delegates its visible content to `LocationSplash` (pulsing radar rings, centered pin badge, `h3`/`body` on `bg-brand-green`); `_layout.tsx` is provider/initialization wiring only.
- `LocationSplash` correctly reuses `AppText`/`palette`/`accentTint` tokens, single clear focal point, generous space — solid, no action needed. One of the more delightful moments in the app (animated radar ping), not a sterile loader.
- `_layout.tsx` note for whoever owns visual QA: the font-load gate (line 94-96) returns `null` with no fallback background — worth verifying `app.json`'s native splash `backgroundColor` matches the brand colors used on Welcome/Login/Index so there's no color mismatch if a frame gap ever shows.

**Top fixes:** None required for either file.

---

### Group B — Home, Discovery & Marketplace

#### Home Tab Layout (`src/app/(tabs)/_layout.tsx`)
Pass-through `Stack` with no rendered content — correctly defers all chrome to the Home screen instead of duplicating a tab bar. No action needed.

#### Home (`src/app/(tabs)/index.tsx` + `src/features/home/`)
**Snapshot:** Landing screen — collapsing Lottie hero carousel behind a transparent header, horizontal order-mode pager, floating glass/blur bottom-nav pill, optional rain banner.
- Contrast — Strong overall (white hero text vs gradient, per-tab accent driving active nav icon). Minor gap: the cashback pill and profile avatar share an identical `bg-white/20` circular treatment (`HomeHeader.tsx:72,84`), so an actionable balance doesn't stand out from a purely-navigational avatar.
- Hierarchy — Good top-to-bottom read, but `HomeBottomNav` — described as primary navigation — visually reads as secondary (small 18px icons, low-contrast float) next to the much louder hero above it.
- Alignment — Consistent 16px screen margin shared by header and nav pill.
- Proximity — Well grouped throughout.
- Repetition — Excellent: `AppText` variants, `accentTint`/`mixHex` helpers, `tabThemeFor` centralizing per-vertical mapping instead of scattering conditionals.
- Balance — Slightly top-heavy by construction (300px hero + header); worth checking worst-case stacking of rain banner + nav pill + overlay stack on a small device.
- White space — Hero fills fully and correctly; not sparse, not cluttered.
- Unity — The strongest screen in the app. A per-tab gradient tint carries through hero → active nav icon → progress dots as a real system decision, not incidental styling.

**Top fixes:** (1) give the cashback pill its own tint (`palette.accent.reward`) instead of matching the avatar's neutral treatment — `HomeHeader.tsx:72,84`. (2) bump the active nav tab's label weight so "primary navigation" reads as primary at a glance. (3) verify rain banner + nav pill + overlay stack never collide on a small-height device.

#### Explore (`src/app/(tabs)/explore.tsx`)
**Snapshot:** Bare centered placeholder ("Explore" heading + one sentence), explicitly labeled WIP in its own copy.
- Contrast/Hierarchy/Alignment/Proximity/Repetition — Individually fine (correct token usage, clean centering) but there's nothing to actually demonstrate hierarchy or grouping with just two lines of text.
- Balance — Centered by default, not by design.
- White space — This is empty, not breathing — reads as unfinished.
- Unity — **The clearest utilitarian-AI-slop moment in the app.** Zero emotional payoff, no icon, no illustration, sitting in the same codebase as the Home screen's Lottie hero and accent system. Doesn't appear to use the existing `ComingSoonScreen` primitive.

**Top fixes:** (1) replace the raw stub with `ComingSoonScreen`. (2) add an `AccentIcon` above the heading as a focal point. (3) if genuinely temporary, at least match the brand's voice rather than a flat feature-migration status message.

#### Marketplace / Navmool (`src/app/marketplace.tsx`)
**Snapshot:** WebView wrapper around the external Navmool site, with native-styled loading/error states.
- Contrast — Error state is well-composed (icon → heading → subtext → CTA); loading state is a bare `ActivityIndicator` — flat next to the more considered error state in the same file.
- Hierarchy — Good in the error branch; none in the loading branch.
- Alignment — Solid, consistent centering approach in both states.
- Proximity — Fine.
- Repetition — Solid overall; one hardcoded `color="#fff"` on a button icon could use `palette.neutral.white` for consistency.
- Balance — Reasonable for a container screen.
- White space — The loading state is the flattest moment — a centered spinner with zero brand personality.
- Unity — The error state shows real design care; the loading state and the eventual handoff to an external site's own visual language is an inherent, architecturally-unavoidable gap (this is explicitly a stopgap until the native port lands).

**Top fixes:** (1) replace the bare `ActivityIndicator` with the shared `Skeleton` primitive. (2) swap the hardcoded `#fff` for `palette.neutral.white`. (3) consider a one-line branded loading caption.

---

### Group C — Subscription Flow

#### Subscription Plan (`src/app/subscription-plan.tsx`)
**Snapshot:** Step 2 — category recap, Lunch/Dinner/Both picker, plan/duration carousel, AI savings tip, sticky price+CTA footer.
- Contrast/Hierarchy/Alignment/Balance/White space — Solid throughout: clear size steps, single full-width primary CTA, consistent 16px page padding, comfortable section gaps.
- Proximity — `AiRecommendationCard` sits at the same 24px gap as every unrelated section, so it doesn't read as commentary on the carousel just above it.
- Repetition — Good cross-screen reuse of the icon-tile pattern shared with Detail/Configure.
- Unity — The in-page `h2` "Choose your plan" duplicates the native header title verbatim — redundant rather than a distinct step title.

**Top fixes:** (1) retitle the in-body `h2` (e.g. "Pick a duration") — lines 214-216. (2) pull the AI tip card closer to the carousel it comments on — lines 253-255. (3) reconcile `StepProgress` styling with Configure (see cross-cutting #4).

#### Subscription Configure (`src/app/subscription-configure.tsx`)
**Snapshot:** Step 3 — dense single-scroll form: meal time, weekends toggle, start-date chips, add-ons, delivery address, itemized bill, "Review & pay" footer.
- Contrast — Five section headers (MEAL TIME, DELIVERY DAYS, START DATE, ADD-ONS, DELIVER TO) are all identical `overline` weight with no larger anchor element anywhere on the page.
- Hierarchy — Solid within rows.
- Alignment — Solid, consistent left edges.
- Proximity — Uniform `marginTop: 22` before every section gives no differentiation between a sub-detail and a genuinely new block.
- Repetition — Card idiom consistent with the rest of the app.
- Balance — Bottom-heavy: five stacked label→control rows with no visual break, no photography, no accent equivalent to Detail's hero or Plan's tip card.
- White space — Outer padding (`20`) is a small, noticeable drift from Plan/Detail's `16`.
- Unity — Weakest link in the 3-step journey — `StepProgress` here uses both segments filled + a "2/2" counter, while Plan's version uses one filled/one tinted segment + two overline labels. Same component, two visual systems.

**Top fixes:** (1) this is the flow's utilitarian screen — add one visual anchor (compact order-preview strip, or Plan's tinted tip-card treatment) so it isn't five uninterrupted rows. (2) unify `StepProgress` with Plan. (3) match outer scroll padding to `16`.

#### Subscription Detail (`src/app/subscription-detail.tsx`)
**Snapshot:** Category landing — full-bleed hero photo, promise strip, day picker, weekly menu card with veg/non-veg toggle, "what's included," cross-sell carousel, sticky CTA.
- Contrast — Best of the four: real photo contrast vs. flat bordered cards below.
- Hierarchy — Solid, single sticky CTA, unambiguous day-strip selection state.
- Alignment/Proximity — Solid; name+tagline are explicitly, deliberately separated (by code comment) from the outer rhythm — a textbook-correct execution.
- Repetition — Solid, consistent card idiom.
- Balance — Mostly solid; the cross-sell carousel and `CityBottomBanner` are packed with no explicit gap between them.
- White space — Solid, day-strip circles and the promise strip add texture.
- Unity — A commented-out `LinearGradient` scrim sits dead in the hero block — the hero currently has no scrim at all, leaving it flatter than the code clearly once intended.

**Top fixes:** (1) restore or replace the hero's bottom scrim gradient — lines 485-488. (2) add explicit spacing between the cross-sell carousel and `CityBottomBanner` — lines 399-404. (3) otherwise no further action needed — the strongest screen in this group.

#### Manage Subscription (`src/app/manage-subscription.tsx`)
**Snapshot:** Post-purchase management — dark teal hero summary card with progress bar, bill/invoice row, per-day child order list, footer CTA to extend the plan.
- Contrast — Arguably the flow's strongest brand moment: the teal hero card stands out sharply against the white list below.
- Hierarchy — The only real action, "Extend plan," is a plain (non-block) button sitting right-aligned next to muted caption text — every sibling screen in this flow uses a full-width `block size="lg"` CTA; here the primary action is the visually weakest of the four screens.
- Alignment — Solid, consistent fixed-width date column.
- Proximity — Solid, clean separation of hero/bill/orders blocks.
- Repetition — Corner radius hardcoded `18` in four places instead of the shared `RADIUS` token.
- Balance/White space — Solid.
- Unity — The teal hero is the best-executed, most "branded" surface in the group — but that quality doesn't extend to the footer CTA or bill sheet, which read as comparatively plain.

**Top fixes:** (1) make "Extend plan" full-width `block` — line 289. (2) replace 4× hardcoded `borderRadius: 18` with the `RADIUS` token — lines 182, 237, 252, 453. (3) extend the teal hero's polish to the bill sheet (currently a plain list).

---

### Group D — On-Demand & Bulk Ordering

#### On-Demand Kitchens (`src/app/on-demand-kitchens.tsx`)
**Snapshot:** Search + Veg/Non-Veg/Jain filters above a two-column kitchen grid.
- Contrast — Solid: photos get real weight (55% of card) with rating/prep-time pills overlaid.
- Hierarchy — Weak: the only heading is a small muted overline "KITCHENS NEAR YOU" — nothing tells the user how many kitchens are near them before scanning 6+ near-identical cards.
- Alignment/Proximity — Solid, consistent gutters and grouping.
- Repetition — Solid; loading skeleton geometry closely matches the real card, minimal pop-in.
- Balance/White space — Fine for a browse screen.
- Unity — Consistent with the rest of the vertical; strongest-executed screen of the five in this group.

**Top fixes:** (1) give the grid header more substance, e.g. "12 kitchens near you." (2) consider a warmer illustration/copy pass for empty/loading states, shared across the vertical. (3) otherwise ship as-is.

#### On-Demand Kitchen (`src/app/on-demand-kitchen.tsx`)
**Snapshot:** Kitchen detail/menu — meta row, search, Daily/Advance toggle, diet chips, item list with sticky cart footer.
- Contrast — Mixed: item cards contrast well, but the kitchen's own name never renders in-body — it only lives in native header chrome (`Stack.Screen options={{ title: kitchen?.kitchenName }}`), so the boldest text a user sees is OS chrome, not the app's type scale.
- Hierarchy — Weak for the same reason — no h2/h3 anchor confirming which kitchen you're in.
- Alignment/Proximity — Solid.
- Repetition — Item-card pattern is identical to `BulkMenuItemCard` — good system consistency.
- Balance — Good, photo-forward item rows.
- White space — Fine.
- Unity — Disconnected from the previous screen: the kitchen photo shown on the browse grid vanishes entirely here, contradicting DESIGN.md's "imagery is the hero" principle.

**Top fixes:** (1) carry the kitchen photo forward as a compact header image. (2) render the kitchen name in-body as `h2` above the speciality line. (3) fix the loading skeleton (64×64) to match the real 118×118 photo.

#### On-Demand Cart (`src/app/on-demand-cart.tsx`)
**Snapshot:** Full checkout — savings banner, kitchen row, cart lines, slot picker, coupon card, wallet/cashback toggles, collapsible bill, sticky Pay bar.
- Contrast — Solid, clear final action.
- Hierarchy — Sensible read order.
- Alignment — Solid, uniform card treatment.
- Proximity — Weak: one flat `gap: 14` applies to every section regardless of relatedness — item lines and the "add something else" link sit exactly as far apart as items and the delivery-slot picker.
- Repetition — Inconsistent with its sibling screen: cart lines always render a generic `IconUtensils` tile, never the item's real photo, even though `bulk-cart.tsx`'s equivalent component already renders the real photo correctly.
- Balance/White space — Good/adequate.
- Unity — Mostly consistent, undercut by the missing food photography.

**Top fixes:** (1) show `line.item.itemImage` instead of the hardcoded utensil icon — port `BulkCartLineItem.tsx:36-40`'s pattern. (2) break the uniform gap into tiered spacing. (3) consider dimming the in-scroll total since the sticky footer already owns that job.

#### Bulk Menu (`src/app/bulk-menu.tsx`)
**Snapshot:** Individual/Bulk toggle, MOQ note, search, diet chips, then either a generic item list or the bespoke `CustomFoodBox` builder for Food Box Bulk.
- Contrast — Solid, clear toggle state.
- Hierarchy — Fine, logical flow.
- Alignment — Minor: the toggle row uses `px-4 pt-3` while the search/chip rows below switch to `mx-4 mt-3` — two spacing idioms for adjacent blocks.
- Proximity — Fine.
- Repetition — `BulkMenuItemCard` intentionally mirrors `OnDemandItemCard` — good cross-vertical consistency.
- Balance/White space — Good, photo-forward rows.
- Unity — Split personality: the default item-list path is plain, while the `CustomFoodBox` branch gets a promo card, gift-icon accent, colored selection borders, and a running total — noticeably more design investment than the rest of the screen.

**Top fixes:** (1) fix the skeleton mismatch (84×84 r18 vs. real 118×118 r14). (2) unify the header spacing idiom. (3) carry some of `CustomFoodBox`'s delight into the plain item-list branch.

#### Bulk Cart (`src/app/bulk-cart.tsx`)
**Snapshot:** Bulk checkout — savings banner, cart lines, "add more items" link, delivery picker, coupon card, wallet/cashback, bill, sticky "Place order" bar.
- Contrast — Solid, violet accent correctly distinguishes Bulk from On-Demand's teal.
- Hierarchy — Fine, matches on-demand-cart's read order.
- Alignment — Solid, consistent card treatment.
- Proximity — Same flat-gap issue as on-demand-cart.
- Repetition — Good: `BillRow`/`RedeemRow` are copy-identical to on-demand-cart's, keeping the two flows visually interchangeable.
- Balance/White space — Good.
- Unity — This screen is the **reference implementation** to fix on-demand-cart: it correctly renders the item's real photo, with an icon fallback only when no photo exists.

**Top fixes:** (1) apply the same tiered-spacing fix as on-demand-cart. (2) use this screen as the image-handling reference for on-demand-cart. (3) no other significant issues — solid, well-unified screen.

---

### Group E — Cart, Checkout & Orders

#### Cart (`src/app/cart.tsx`)
**Snapshot:** Checkout — item recap, add-ons, delivery details, coupon, wallet/cashback redemption, collapsible bill, sticky "Proceed to Pay" footer. The highest-stakes conversion moment in the app.
- Contrast — Weak: no `h1`/`h2`/`display` variant appears anywhere; the plan name is the same weight as the "Total Bill" heading and the coupon-applied label. The one purchase the user is about to make doesn't visually outrank the six cards competing beside it.
- Hierarchy — Six near-identical bordered white cards are stacked with equal visual weight — nothing marks which are informational vs. actionable.
- Alignment — Solid, no drift.
- Proximity — Mostly good; the quantity stepper sits inside the item card separated only by margin, no divider, reading ambiguously.
- Repetition — Excellent, no one-off styling.
- Balance — Top-loaded scroll of identical cards, thin single-line footer — reads as a ledger.
- White space — Adequate.
- Unity — Coherent tokens, but color is nearly absent unless a savings banner triggers. Zero reassurance copy near the app's single biggest-stakes button.

**Top fixes:** (1) bump the plan name to `h3`/bold so it leads the six cards below it — line 308. (2) differentiate the bill card with a subtle tint/accent border — line 525. (3) add a one-line trust cue under the CTA, e.g. "Secure payment · Cancel anytime" — line 625.

#### Order Result (`src/app/order-result.tsx`)
**Snapshot:** Post-payment landing (success/failure) for every checkout type — icon, title, message, subscription reassurance/first-delivery card, CTAs.
- Contrast — Strong: the 84px icon + `h2` title clearly outranks everything else.
- Hierarchy/Alignment/Proximity — Clean top-to-bottom flow, consistent stacking, good grouping.
- Repetition — Reuses shared primitives correctly.
- Balance — For subscription success, the stack is long enough to break the "centered celebratory moment" framing on smaller screens.
- White space — Comfortable.
- Unity — Single accent color per mode keeps it cohesive.
- **This is the biggest miss in the whole audit**: no order recap. After paying, the user sees "Order placed!" with zero plan name, day count, or amount charged — the trust-building recap this exact kind of screen exists to provide is absent. Compounding it, `CouponCelebration` (elsewhere in the cart flow) gives a Lottie confetti burst for merely *applying a coupon*, while the actual purchase confirmation gets only a static icon.

**Top fixes:** (1) add a recap block (plan name, days, amount paid) right under the title, reusing `DetailRow`/`BillRow` — lines 170-188. (2) give the success state the same delight treatment `CouponCelebration` already has. (3) trim "what you can do any time" so it doesn't compete with the CTAs for a screen meant to feel quick and satisfying.

#### Orders (`src/app/orders.tsx`)
**Snapshot:** Filterable list of subscription orders — status chips + buy-date filter, ACTIVE/PAST sections.
- Contrast — Good: active filter chips get tint+border, `OrderRow`'s "Track" affordance visually distinguishes ongoing from past.
- Hierarchy — Clear sectioning; auto-selecting the "Accepted" filter on first load is a thoughtful default.
- Alignment — Filter bar and list both resolve to the same 20px edge.
- Proximity — Status chips and buy-date row read as one filter unit; sections below cleanly separated.
- Repetition — The buy-date pill duplicates the status-chip's inline style instead of sharing one component — minor drift risk.
- Balance — Two full filter rows above content is slightly heavy for a short list.
- White space — Comfortable.
- Unity — Consistent with order-history/order-detail via shared `OrderRow`.

**Top fixes:** (1) extract the buy-date pill into the shared filter-chip component. (2) consider a subtle background tint on the ACTIVE section container. (3) otherwise solid.

#### My Orders (`src/app/my-orders.tsx`)
**Snapshot:** Hub of order-history categories (Subscription, Dine In, On Demand, Bulk, Navmool) as tappable rows.
- Contrast — Flat by design; icons do vary per category, but nothing marks the most-used one.
- Hierarchy — None — all five categories carry equal visual priority regardless of actual usage.
- Alignment/Proximity/Repetition — Clean, consistent, correctly tokenized.
- Balance/White space — Fine.
- Unity — Consistent tokens, but the screen is a bare menu with zero header copy, no counts, no context — a textbook utilitarian moment for what should feel like an inviting order hub.

**Top fixes:** (1) add a short header line above the list. (2) differentiate the Subscription row (primary flow) with heavier weight or a tint. (3) consider surfacing a live count (e.g. "2 active") pulled from existing order data.

#### Order Detail (`src/app/order-detail.tsx`)
**Snapshot:** Single order/package view — item header + status pill, stepper or per-day list, live map when out-for-delivery, delivery details, amount paid, actions.
- Contrast — Good use of a colored stepper against gray unreached steps, status pill color-coded correctly.
- Hierarchy — Logical order matching what a user needs to check first.
- Alignment/Proximity/Repetition — Consistent card treatment, correctly grouped daily-order rows, strong cross-screen reuse with cart.tsx.
- Balance — Can get very tall with no visual pacing beyond card boundaries — the live map gets the same white-card weight as static delivery-address info below it.
- White space — Adequate.
- Unity — Feels like the same design system as cart/orders — good continuity.

**Top fixes:** (1) visually separate the live-tracking block with a tinted/colored border to match its time-sensitivity. (2) otherwise one of the stronger-executed screens in the set.

#### Order Tracking (`src/app/order-tracking.tsx`)
**Snapshot:** Standalone live-tracking screen — map, ETA card, rider name/call, help CTA. Mostly superseded by inline tracking in order-detail.tsx per its own code comments.
- Contrast — Thin: ETA text isn't meaningfully larger than the rest of the page — no strong anchor for the number that matters.
- Hierarchy — Map-first is correct, but ETA/rider cards carry the same visual weight as the generic "Need help" button.
- Alignment/Proximity/Repetition — Fine, consistent with app conventions.
- Balance — Sparse — a lot of empty space below the fold with no illustration/personality to fill it.
- White space — Ample, but unintentionally sparse rather than deliberate.
- Unity — Consistent tokens, but visually the plainest screen in the set — no accent color, no motion around what's otherwise an exciting real-time feature.

**Top fixes:** (1) make ETA the clear headline (bump to `h2`/`h3`). (2) since order-detail.tsx now handles inline tracking, consider whether this needs to remain a separate destination. (3) add personality to the rider card (placeholder avatar/illustration).

#### Order History Category (`src/app/order-history/[category].tsx`)
**Snapshot:** Generic paginated list for a single category, reusing `OrderRow`.
- All eight principles — Consistent, correctly minimal, strong reuse of existing list/empty-state patterns. This is a template correctly applied, not a design gap.

**Top fixes:** No significant issues. Only nitpick: the per-category empty-state copy is the sole differentiator between categories — worth a pass to ensure each is warm/specific rather than generic.

---

### Group F — Profile, Addresses & Wallet

#### Profile (`src/app/profile.tsx`)
**Snapshot:** Account hub — gradient hero (avatar, name, phone, email, edit), wallet/cashback tiles, teal "Refer & Earn" promo card, grouped settings rows, Sign out.
- Contrast — Solid: gradient hero reads immediately as the "you" zone; per-row accent tones keep otherwise-identical rows from blurring together.
- Hierarchy — Every settings row uses identical size/weight/card treatment regardless of importance — "Sign out" gets only a red tint, not any size/position distinction, so it doesn't read as the terminal action it is.
- Alignment — Solid, consistent rhythm throughout.
- Proximity — Solid, section labels correctly cluster rows with visible group gaps.
- Repetition — Solid, no ad hoc styling found.
- Balance — Slightly top-heavy: hero + balance tiles + promo card front-load a lot of color before the plain row list begins.
- White space — Solid.
- Unity — Best of this group: the teal promo card intentionally breaks the "row template" monotony, exactly the kind of touch other screens lack.

**Top fixes:** (1) give "Sign out" real separation instead of color alone. (2) check section-label contrast ratio in dark mode. (3) consider merging same-section rows into one shadowed card with internal dividers, iOS-grouped-list style, rather than N separate shadow chips.

#### Profile Edit (`src/app/profile-edit.tsx`)
**Snapshot:** Simple edit form — name/email fields, read-only phone/referral chips, Save button. No hero, no avatar.
- Contrast — Weak: zero visual differentiation from a generic form screen — no color, no icon, nothing but fields on white; Save is the only saturated element.
- Hierarchy — Adequate, but read-only rows look almost identical to editable fields at a glance — easy to tap expecting them to be editable.
- Alignment/Proximity/Repetition — Solid, consistent.
- Balance — Content starts right at the header with no breathing intro, then a lone button at the bottom.
- White space — Adequate but sterile — feels like the emptiest screen in the set.
- Unity — **Weakest of this group** — reads as "template with content poured in." Doesn't borrow the Profile screen's avatar/gradient identity at all, despite being one hop away and editing the same avatar.

**Top fixes:** (1) add the user's avatar/initials at the top of the form. (2) differentiate read-only rows more (lock icon or "Verified" label, not opacity alone). (3) add a thin accent band or a subtitle line so it doesn't feel like raw CRUD.

#### Addresses (`src/app/addresses.tsx`)
**Snapshot:** Saved-address list with "use current location"/"search" rows, address cards, dashed "+ Add new address" button; falls back to a location-gate empty state.
- Contrast — Solid: current-location row stands out from the plain search row; the "Current" pill on address cards is clear and well-placed.
- Hierarchy — Adequate: the location row is a half-step between a CTA and a plain row, competing somewhat with the "Add new address" button at the bottom.
- Alignment/Proximity/Repetition — Solid, consistent.
- Balance — A list of near-identical bordered rows is visually monotone.
- White space — Solid.
- Unity — Functionally coherent but generic — nothing here signals "food delivery app"; no warmth or illustration in the populated state (only the empty state gets icon treatment).

**Top fixes:** (1) give "Use my current location" real solid-CTA treatment instead of its current outlined style, matching the empty state's own button. (2) add a small colored tag chip per address type (Home/Work/Other) instead of plain text. (3) promote "+ Add new address" beyond its faint dashed treatment.

#### Address Form (`src/app/address-form.tsx`)
**Snapshot:** Add/edit flow — full-screen map with draggable pin + search, then a details form (tag chips, flat/house field, landmark, serviceability pill, Save).
- All eight principles — Solid to excellent throughout: map is a strong visual anchor, logical top-to-bottom decision order, consistent spacing, coherent loading state matching brand green. The strongest of this group.

**Top fixes:** (1) minor — tighten a negative-margin spacing hack into real tokens. (2) consider icons on the tag pills for faster recognition. (3) no major fix needed otherwise.

#### Wallet (`src/app/wallet.tsx`)
**Snapshot:** "Mealawe Money" balance screen — green gradient balance card, flat chronological transaction list, "Load more" pagination; login gate for unauthenticated users.
- Contrast — Adequate: strong gradient hero, but the transaction list beneath is pure text-on-white with only amount color to differentiate credit/debit.
- Hierarchy — Every transaction row carries identical visual weight regardless of size — a ₹5 cashback reads the same as a ₹500 refund.
- Alignment/Proximity/Repetition — Solid, correct token usage.
- Balance — Top-heavy: nearly all visual weight sits in the first 150px.
- White space — Adequate but plain enough to feel utilitarian.
- Unity — Weak below the fold: the gradient hero has real brand personality; the transaction list is a bare bank-statement list that drifts toward the "cold corporate fintech" pattern DESIGN.md explicitly warns against. **Clearest utilitarian-slop moment in this group** — no icon per row, and the empty state is a single flat gray line, unlike the icon-circle empty states used elsewhere in the app.

**Top fixes:** (1) add a small leading icon per transaction row, tinted by credit/debit direction. (2) give the empty state the same icon-circle treatment used elsewhere. (3) DESIGN.md's colour-blind-safe rule calls for pairing color with a shape/icon — add a `+`/`−` badge rather than relying on color alone.

---

### Group G — Rewards & Support

#### Cashback (`src/app/cashback.tsx`)
**Snapshot:** Reward balance hero + chronological cashback transaction list with "Load more."
- Contrast — Weak: the row title and the earned amount are nearly the same size/weight — the payoff number doesn't pop the way a reward figure should.
- Hierarchy — Balance is clearly #1, "History" is #2, but every row after that reads flat.
- Alignment — Consistent.
- Proximity — "History" heading shares the same gap with its first row as row-to-row spacing — doesn't feel attached to its own list.
- Repetition — **Breaks the design system**: DESIGN.md assigns Reward Pink specifically to cashback/coupons/wallet, but the hero uses a hardcoded, non-palette `'#f0a500'`.
- Balance/White space — Fine.
- Unity — Reads like a generic bank statement, not a branded reward moment — a screen about money the user *earned* gets a bare list with a plain-text empty state, no icons, no celebration.

**Top fixes:** (1) replace the hardcoded gradient with `palette.accent.reward` + brand teal, per DESIGN.md's meaning-mapped palette — line 91. (2) add a small reward-pink icon tile per transaction row instead of bare text. (3) tighten the "History" heading-to-first-row gap to establish real grouping.

#### Refer & Earn (`src/app/refer-earn.tsx`)
**Snapshot:** Teal hero explaining the referral reward, code + copy/share card, FAQ accordion.
- Contrast/Hierarchy/Alignment/Proximity — Solid to good throughout; correct use of the primary Button for Share.
- Repetition — Mixed: the hero uses inline `RADIUS.lg` while the code/FAQ cards use the `rounded-2xl` className — two mechanisms for the same radius value.
- Balance/White space — Good, hero has real breathing room.
- Unity — Best-executed screen in this group; deliberate teal hero + icon badge feels intentional. No personalization though — no "you've earned ₹X from N friends" stat, so the screen stays purely instructional with no payoff shown to people who've already referred; the gift badge is also just a flat translucent circle, giving it little visual pop for a "reward" moment.

**Top fixes:** (1) add a personal stats line near the hero for returning users. (2) give the gift badge more pop (secondary/yellow fill instead of translucent white-on-teal). (3) standardize radius application across the hero and cards.

#### Feedback (`src/app/feedback.tsx`)
**Snapshot:** Type picker (Suggestion/Praise/Complaint) + free-text box + submit.
- Contrast/Hierarchy/Alignment/Proximity/Repetition/Balance/White space — Fine for a simple form; clear linear flow, consistent tokens.
- Unity — Breaks at the finish line: uses native `Alert.alert` for both the login-required prompt and the "Thank you!" confirmation instead of the app's own dialog primitives, so the one emotional beat on this screen renders as a bare OS dialog, not an in-app moment. **The barest screen in this group** — no lead-in sentence setting tone, and the success moment is a stock system alert.

**Top fixes:** (1) replace `Alert.alert` calls with `ConfirmDialog`/`AppSheet`. (2) add a one-line intro under the title before the text-entry label. (3) match the type-tile tap-target padding to `help.tsx`'s contact tiles for consistency.

#### Help (`src/app/help.tsx`)
**Snapshot:** Chat/Call/Email contact tiles + FAQ accordion.
- Contrast/Hierarchy — Deliberately flat across the three contact options — the right call here, since none should read as more primary than another.
- Alignment/Proximity/Repetition/Balance/White space — Solid, consistent with app conventions.
- Unity — Cohesive with the rest of the card/radius language. The three contact tiles are functionally identical with no differentiation — e.g. no "usually replies in minutes" hint under Chat, even though the live chat screen has connection status that could inform this.

**Top fixes:** (1) extract the duplicated FAQ accordion (also in `refer-earn.tsx`) into one shared component. (2) add a short reassurance line under the Chat tile to set response-time expectations. (3) bump the sole intro line from `body` to `bodyLg`.

#### Support Chat (`src/app/support-chat.tsx`)
**Snapshot:** Live chat — connection-status strip, message bubbles, typing indicator, composer.
- Contrast — Good: filled "mine" bubbles vs. bordered "theirs" give instant sender distinction.
- Hierarchy — Status strip appropriately de-emphasized; composer send button color-codes active/inactive.
- Alignment/Proximity — Standard, consistent chat conventions.
- Repetition — Mostly consistent; the composer's circular send button is bespoke inline-styled rather than the shared `Button` — understandable for an icon-only circle, but a one-off.
- Balance/White space — Standard chat layout, fine.
- Unity — One of the stronger, purpose-built screens in this group; tokens used consistently. The empty state ("Hi, how can we help?") is plain centered text with no icon — a missed chance to warm up the cold first-open moment.

**Top fixes:** (1) add an icon above the empty-state heading, matching `help.tsx`'s contact-tile treatment. (2) reconsider reusing the gold "ratings" accent for the "reconnecting" status dot — a status meaning borrowed from an unrelated accent, drifting from the One-Hue-One-Meaning rule. (3) fold the composer's hardcoded circular send button into a shared icon-button style if one exists.

---

## How to keep using this framework

This document is a snapshot, not a one-time fix list. The fastest way to keep design quality from
regressing as new screens get added:

1. **Screenshot the screen** (device or simulator — this audit was code-level; a live screenshot catches
   what source alone can't, like actual rendered contrast and real device safe-areas).
2. **Run it through the 8-principle checklist** above, screen by screen — either manually or by asking
   an AI to critique the screenshot against exactly these eight questions (a `visual-design.md` skill
   file alone won't do this — the AI needs an image, not just a rule list).
3. **Fix, re-screenshot, re-check.** Iterate until nothing on the list reads as a clear miss.
4. Watch specifically for the **utilitarian pattern** flagged nine times in this audit: a screen that's
   functionally complete but is just rows-of-text-on-white with no icon, no accent, no framing copy, no
   moment of delight. That's the tell that a screen shipped as "AI output," not as a finished product.

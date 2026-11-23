# Component Catalog

Sushi-style "component library" reference — one place to check "do we already have this"
before building something new. See [DESIGN-REFERENCE.md](DESIGN-REFERENCE.md) for the
foundations (color, typography, icons, motion) these components are built from.

If you add a new shared primitive to `src/components/ui/`, add a row here.

## Primitives (`src/components/ui/`)

| Component | Purpose | Key props | Example |
| --- | --- | --- | --- |
| `AppText` | The one text primitive — encapsulates the Metropolis type scale so screens never hand-set `fontSize`/`fontFamily`/`lineHeight`. Applies the responsive width-based font scale automatically. | `variant` (`display`…`overline`), `weight` (`regular`\|`bold`\|`black` override), `className` | `<AppText variant="h2" className="text-foreground">Nearby kitchens</AppText>` |
| `Button` | The one button primitive — replaces hand-rolled `Pressable + bg-primary` blocks. Green is reserved for the primary CTA (see `DESIGN.md`'s Green-Is-Action rule); `tone` is the one sanctioned way to override that inside an order-mode flow. | `variant` (`primary`\|`secondary`\|`outline`\|`ghost`\|`danger`), `size` (`sm`\|`md`\|`lg`), `tone` (order-mode accent override), `block`, `loading`, `disabled`, `leftIcon`/`rightIcon` | `<Button label="Subscribe" onPress={subscribe} block />` |
| `QuantityStepper` | The bordered pill +/− control shown once an item is in the cart. Bare — no background of its own; screens that float it over an image add their own backing (see Menu Row pattern below). | `count`, `onIncrease`, `onDecrease`, `tone`, `decreaseLabel`/`increaseLabel` | `<QuantityStepper count={2} onIncrease={inc} onDecrease={dec} tone="info" />` |
| `ItemAddButton` | The "ADD" pill shown before an item enters the cart — stage 1 of the ADD → `QuantityStepper` handoff. Extracted from Bulk/On-Demand's near-identical inline blocks so the two verticals can't drift apart. | `tone`, `accessibilityLabel`, `onPress` | `<ItemAddButton tone="plan" accessibilityLabel="Add Paneer Thali" onPress={add} />` |
| `AccentIcon` | A semantic, colored icon — solid Lucide glyph on a soft (~12%) tint tile, driven by an accent role (never green — green stays reserved for CTAs). | `icon`, `tone`, `size` (default 20), `tileSize` (default 40), `bare` (skip the tile) | `<AccentIcon icon={IconMapPin} tone="location" />` |
| `DietMark` | The veg/non-veg mark — colour-blind safe by shape (circle = veg, triangle = non-veg), colour is reinforcement only. | `veg`, `size` (default 16) | `<DietMark veg={item.isVeg} size={14} />` |
| `AppSheet` | The bottom-sheet shell — `BottomSheetModal` with dimmed tap-to-close backdrop, rounded top, brand handle. Content is provided by the caller. | `children`, `snapPoints` (omit for dynamic sizing), `onDismiss`; present/dismiss via forwarded ref | `ref.current?.present()` after `<AppSheet ref={ref}>…</AppSheet>` |
| `ConfirmDialog` | Branded confirmation modal replacing the OS `Alert` — centered card over a dimmed backdrop, tap-outside cancels. | `visible`, `title`, `message`, `confirmLabel`, `cancelLabel`, `destructive` (red confirm + tint), `icon`, `onConfirm`/`onCancel` | Sign-out confirmation |
| `Toggle` | The one switch primitive — pill + knob, replaces hand-rolled track/knob markup that used to be duplicated between subscription and bulk cart wallet rows. | `value`, `onChange`, `disabled`, `accessibilityLabel` | `<Toggle value={useWallet} onChange={toggleWallet} />` |
| `Skeleton` | Shimmering loading placeholder — the answer to "skeletons, not a spinner mid-content." Honors reduced-motion (holds a static block). | `width`, `height`, `radius` | `<Skeleton height={80} radius={16} />` |
| `ComingSoonScreen` | Shared "not built yet" screen for a tab shortcut whose vertical hasn't landed — keeps every placeholder route consistent instead of hand-rolling one per route. | `title`, `icon`, `message` | Navmool/Daily/Advance placeholder routes |
| `icons.tsx` | The one icon set — Lucide paths via `react-native-svg`. SVG only, never emoji. See [DESIGN-REFERENCE.md §4](DESIGN-REFERENCE.md#4-icons) for size/stroke-width conventions. | — | `import { IconMapPin } from '@/components/ui/icons'` |

## Named patterns (recurring compositions, not yet single components)

These show up more than once, built the same way each time, but aren't extracted into
one shared component yet — name them when reaching for them so the next screen that
needs one copies the named pattern instead of re-deriving it from scratch.

### Menu Row
Name/description/price on the left, a large photo on the right with the ADD control (or
`QuantityStepper`) floating over the photo's bottom edge — the Zomato/Swiggy menu-row
layout. Canonical implementations: `src/features/on-demand/components/OnDemandItemCard.tsx`,
`src/features/bulk/components/BulkMenuItemCard.tsx`. When floating a `QuantityStepper`
over an image, wrap it in a `borderRadius: 22` (matching the stepper's own 44px-tall pill)
+ `shadow.card` + `colors.card` background — a radius mismatch here is a known past bug
(a rectangular corner peeking out from behind the pill).

### Bottom Overlay Stack
Today's open orders combined with the active tab's sticky CTA into one swipeable card
slot, sitting just above the floating nav bar. Canonical implementation:
`src/features/orders/components/BottomOverlayStack.tsx` + `useHomeNavBarClearance`/
`useBottomStackClearance` (`src/features/home/homeNavBarStore.ts`) — these read the nav
bar's *actual measured height*, not a hardcoded guess, so don't reintroduce a fixed
clearance constant when building something similar.

### Category Grid Card
A 2-column grid of photo-over-white-footer cards — `border-border` (1px, `#e5e5e5`),
18px radius, `shadow.card`, real photography (not an illustrated gradient/icon).
Canonical implementations: `src/features/bulk/components/BulkCategoryTile.tsx`,
`src/features/on-demand/components/OnDemandKitchenCard.tsx`. Both match the Sushi/Figma
design reference's plain-card treatment for this shape.

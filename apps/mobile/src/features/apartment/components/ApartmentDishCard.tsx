import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { DietMark } from '@/components/ui/DietMark';
import { IconClock, IconDelivery, IconShoppingBag, IconStore, IconUsers, IconUtensils } from '@/components/ui/icons';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { accentTint, mixHex, palette, useApartmentColors } from '@/theme';
import { formatINR } from '@/utils/currency';

import { cartLineForDish, cartLineForTodayDish, cheapestOfferFor, isDishBlocked } from '../pricing';
import type { ApartmentDish, OrderType } from '../types';
import { useApartmentCartStore } from '../useApartmentCartStore';

interface ApartmentDishCardProps {
  dish: ApartmentDish;
  orderType: OrderType;
  // Takes `dish` itself so a stable useCallback handler from the caller
  // keeps this component's memo wrap below actually effective.
  onPress: (dish: ApartmentDish) => void;
}

/** One dish card — 2-column grid cell. Blocked (every offer ineligible)
 * renders dimmed with an "Unavailable"/"Unorderable"/"Out of stock" CTA
 * (see `outOfStock`/`unorderable` below) rather than being hidden — U15's
 * earlier "hide a fully-blocked Today dish outright" rule was removed
 * (product instruction, 2026-08-27, see ApartmentHome.tsx's own comment):
 * a dish past its own kitchen's cutoff/slot/meal-type-off stays fully
 * VISIBLE here, just disabled and labelled accordingly.
 *
 * Redesigned (product instruction, 2026-08-31 — reference screenshot):
 * gradient ribbon, a top-right time chip (in place of a wishlist heart the
 * reference design had there — this app has no wishlist feature, and time
 * is the more useful thing to put in that spot), a rating chip overlaid on
 * the image, "Serves N" + "N kitchens" rows, real labelled delivery/pickup
 * pills, and a filled gradient "View more" button (was a bordered pill).
 *
 * Product instruction (reverses the EARLIER reversal, noted below): once a
 * dish is already in the cart — the FIRST add still always goes through the
 * full add-sheet, kitchen picked deliberately — the card's own footer
 * switches from "View more" to a `QuantityStepper` bound directly to that
 * cart line, so bumping the count for something already added doesn't need
 * reopening the sheet every time. (The reverted decision this superseded:
 * Instant used to get its own inline "Add" → qty-stepper shortcut that
 * skipped kitchen selection entirely on the FIRST tap — that part stays
 * reverted; this is only ever a stepper on an EXISTING line, the kitchen is
 * already fixed by then via that line's own `offer.kitchenId`.) Applies
 * uniformly to every order type — Today included, same as Instant, no
 * special-casing needed since `cartLineForDish` already resolves the right
 * line per meal-slot context. */
// Perf fix (product report — apartment screen freezing/sluggish): this
// grid can hold dozens of these, all inside one non-virtualized ScrollView
// (see ApartmentHome.tsx's own note on that). `memo` can't stop the FIRST
// mount-time burst when a fresh catalog lands (every card still mounts at
// once then), but it does stop the much more frequent case of every
// already-mounted card fully re-rendering for a reason that had nothing to
// do with it — the search-placeholder text cycling every 3.6s, typing in
// the search box, opening the filter modal, etc. all used to re-render
// EVERY visible card, unconditionally, purely because `ApartmentHome`
// itself re-rendered. Only pays off because `dish`/`orderType`/`onPress`
// are now genuinely stable across such renders (see the callers' own
// comments) — memoizing a component whose props are recreated every render
// anyway would do nothing.
export const ApartmentDishCard = memo(function ApartmentDishCard({ dish, orderType, onPress }: ApartmentDishCardProps) {
  // Bug fix history: an earlier pass here reserved a fixed `minHeight` for a
  // possible 2-line name, found to leave a visible gap before the price
  // whenever a name only took one line — that was "fixed" by measuring the
  // name's real line count via `onTextLayout` and conditionally showing/
  // hiding the description below it. That measurement-driven approach is
  // what caused the WORSE bug this file's `flexGrow`/name-block comments
  // now document (content silently vanishing on Today specifically, from
  // many cards' post-layout state updates racing each other) — reverted
  // back to fixed reservations (see the name/description `minHeight`s
  // below) deliberately: a small, constant, always-present gap for a short
  // name is a far smaller cost than a card's content disappearing outright.
  const blocked = isDishBlocked(dish);
  // Names the specific block reason (out of stock) instead of a generic "Unavailable".
  const outOfStock = blocked && dish.offers.some((o) => o.blockKind === 'outOfStock');
  // "Unorderable" (kitchen closed/cutoff) vs other blocks; some()+priority
  // surfaces the most actionable reason when offers have mixed blockKinds.
  const unorderable = blocked && !outOfStock && dish.offers.some((o) => o.blockKind === 'cutoff');
  // Mirrors useColors()'s light/dark switch for this feature's own token set.
  const { colors, orderType: orderTypeColors } = useApartmentColors();
  const tone = orderTypeColors[orderType];
  const lines = useApartmentCartStore((s) => s.lines);
  const setLineCount = useApartmentCartStore((s) => s.setLineCount);
  // Today can span multiple meal slots at once, so mealType alone isn't a reliable lookup key.
  const cartLine = blocked ? null : orderType === 'today' ? cartLineForTodayDish(lines, dish.name) : cartLineForDish(lines, dish.name, dish.mealType);
  const cheapestOffer = cheapestOfferFor(dish.offers);
  // Price shown is the cheapest across kitchens; "onwards" only shown when
  // kitchens actually differ on price for this dish.
  const priceVaries = new Set(dish.offers.map((o) => o.price)).size > 1;
  // Kitchen count and delivery/pickup availability scoped to offers actually
  // serving this dish now (not blocked ones); missing fulfillment data fails open.
  const orderableOffers = dish.offers.filter((o) => !o.blocked);
  const activeOffers = orderableOffers.length > 0 ? orderableOffers : dish.offers;
  const kitchenCount = new Set(activeOffers.map((o) => o.kitchenId)).size;
  // Once the cart is committed to a specific kitchen, delivery/pickup reflect
  // only that kitchen's own offer, not the any-kitchen aggregate.
  const cartMeta = useApartmentCartStore((s) => s.meta);
  const committedOffer = cartMeta ? activeOffers.find((o) => o.kitchenId === cartMeta.kitchenId) : undefined;
  const deliveryPickupOffers = committedOffer ? [committedOffer] : activeOffers;
  const deliveryAvailable = deliveryPickupOffers.some((o) => !o.kitchenFulfillmentModes || o.kitchenFulfillmentModes.deliveryEnabled);
  const pickupAvailable = deliveryPickupOffers.some((o) => !o.kitchenFulfillmentModes || o.kitchenFulfillmentModes.pickupEnabled);
  // Fastest prep time among kitchens currently serving this dish (not
  // first-array-match); not shown for Advance orders.
  const prepTimes = activeOffers.map((o) => o.preparationTime).filter((t): t is number => typeof t === 'number');
  const prepTime = orderType !== 'advance' && prepTimes.length > 0 ? Math.min(...prepTimes) : undefined;

  return (
    <Pressable
      onPress={() => onPress(dish)}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityLabel={dish.name}
      accessibilityState={{ disabled: blocked }}
      // Regression fix: NativeWind's `flex-1` class compiles to `flex: 1 1
      // 0%` — that zero flex-BASIS makes every card in the row report "no
      // natural height" during the row's own stretch-measurement pass,
      // collapsing the whole row to a hairline (seen on-device right after
      // adding it). `flexGrow: 1` alone (RN's own defaults already give
      // `flexShrink: 0`/`flexBasis: 'auto'`) keeps this card's real content
      // height as its MINIMUM and only grows it to fill leftover space from
      // the row's cross-axis stretch — no zero-basis trap, and still fixes
      // the original bug (a shorter card's footer overlapping/clipping its
      // own name+price block instead of sitting at the row's real bottom).
      className="overflow-hidden rounded-2xl active:opacity-90"
      style={{ flexGrow: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: blocked ? 0.72 : 1 }}>
      {/* No-photo placeholder tints with tone.accent, matching the other
          order-type-aware surfaces on this card. */}
      <View style={{ height: 118, position: 'relative', backgroundColor: accentTint(tone.accent, 0.14) }}>
        {dish.imageUrl ? (
          <Image source={{ uri: dish.imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <View className="h-full items-center justify-center">
            <IconUtensils size={26} color={tone.accent} />
          </View>
        )}
        {dish.ribbon ? (
          <LinearGradient
            colors={dish.ribbon === 'NEW' ? [colors.green, colors.greenDeep] : [colors.gold, mixHex(colors.gold, '#000000', 0.3)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', left: 8, top: 8, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4 }}>
            <AppText variant="caption" weight="bold" style={{ color: '#fff', fontSize: 9 }}>
              {dish.ribbon}
            </AppText>
          </LinearGradient>
        ) : null}
        {/* Top-right chip shows prep time (no wishlist feature in this app). */}
        {prepTime ? (
          <View
            className="absolute right-2 top-2 flex-row items-center gap-0.5 rounded-full px-2 py-1"
            style={{ backgroundColor: 'rgba(255,255,255,.9)' }}>
            <IconClock size={11} color={palette.apartment.ink} />
            <AppText variant="caption" weight="bold" style={{ color: palette.apartment.ink, fontSize: 9.5 }}>
              {prepTime} min
            </AppText>
          </View>
        ) : null}
        {/* Diet mark sits on the photo (bottom-right) with a white chip
            background so it stays legible over any image. */}
        <View
          className="absolute bottom-2 right-2 items-center justify-center rounded-md"
          style={{ width: 18, height: 18, backgroundColor: 'rgba(255,255,255,.92)' }}>
          <DietMark veg={dish.isVeg} size={12} />
        </View>
      </View>

      {/* `justify-content: space-between` between the two groups below pins
          the button/stepper to the bottom of whatever height this card ends
          up at, however short or long the title+description group above it
          is. That height was previously left ENTIRELY to cross-axis
          `stretch` matching this card against its one row-mate (RN/Yoga's
          default for a flex-row sibling) — correct in principle, but it
          means a card's own content is only ever guaranteed to fit if its
          NEIGHBOR happens to be at least as tall; a short neighbor (e.g. a
          blocked/out-of-stock dish with no delivery/pickup pills, or the
          lone odd-one-out card in a final unpaired row with no neighbor at
          all) left THIS card exactly as tall as its own naive content
          measurement, which the outer `overflow-hidden` Pressable then
          clips if that measurement ever comes up short (product report —
          "some cards' content not visible, only the image shows").
          `minHeight` here reserves enough room for the tallest realistic
          combination of every block below (2-line name, price, one
          description line, Serves-N row, kitchen-count row, delivery/pickup
          pills, plus the bottom button/stepper and this container's own
          padding) UNCONDITIONALLY — every card is now tall enough on its
          own, regardless of its row-mate's height or whether it has one. */}
      <View className="flex-1 p-3" style={{ justifyContent: 'space-between', minHeight: 240 }}>
        <View>
          {/* Product instruction: name gets its own full-width row (was
              sharing one line with the diet mark AND price, which forced it
              down to `numberOfLines={1}` and truncated anything longer than
              a couple of words) — 2 lines now, same as before this card's
              first redesign pass. Price moved to its own row directly below
              (was sharing the name's row) so neither one competes with the
              other for space or clarity. No fixed height here (product
              report, 2026-09-03 — see `nameWrapped`'s own comment above): it
              hugs however many lines it actually needs, so there's never a
              gap between a short name and the price below it. */}
          {/* Regression fix (root cause of the persistent "card content
              disappears" bug — Today specifically): this used to measure the
              name's real line count via `onTextLayout` and conditionally
              omit the description below it (trading a 2nd name line for a
              description line so every card's total height matched). That's
              an ASYNC state update firing after first layout, once per card
              — fine for a couple of cards, but Today's per-meal-slot merge
              (see catalog.ts) can produce far more `ApartmentDish`s mounting
              in the same burst than Instant/Advance ever do, and that many
              simultaneous post-layout `setState` calls left some cards'
              Yoga tree stuck mid-relayout, never settling to their real
              height — on-device this showed as whole rows rendering just an
              image + button with everything between silently gone. Fixed
              height reservations (`minHeight` below, sized from this
              variant's own line-height in typography.ts) make every card's
              top block deterministic from the FIRST layout pass — no
              measurement round-trip, no per-card state, so no timing window
              for many cards to race each other. Costs a small, fixed
              vertical gap for a short single-line name with no
              description — a fine trade against the block disappearing
              outright. */}
          <AppText variant="label" style={{ color: colors.ink, minHeight: 42 }} numberOfLines={2}>
            {dish.name}
          </AppText>
          <AppText variant="label" style={{ color: colors.ink, marginTop: 2 }}>
            {formatINR(cheapestOffer?.price ?? 0)}
            {priceVaries ? <AppText variant="caption" style={{ color: colors.muted }}> onwards</AppText> : null}
          </AppText>
          <AppText variant="caption" style={{ color: colors.muted, marginTop: 4, minHeight: 18 }} numberOfLines={1}>
            {dish.description ?? ' '}
          </AppText>

          {/* "Serves N" — only ever known for a kitchen's own daily dated
              item (see ApartmentDish.servesTo's own comment); absent for a
              standing-catalog-only dish. Same "always reserve the row"
              fix as the description above — a dish with no `servesTo` used
              to skip this row's height entirely, shifting the kitchen-count
              row/pills/button up relative to a neighboring card that DOES
              have one. Icon/text also bumped to bold + `colors.ink` (was
              `colors.muted`, same flat grey as the description right above
              it) — product instruction, 2026-09-03, so this reads as a
              distinct fact, not more of the same body copy. */}
          <View className="mt-2 flex-row items-center gap-1" style={{ minHeight: 15 }}>
            {dish.servesTo ? (
              <>
                <IconUsers size={13} color={colors.ink} />
                <AppText variant="caption" weight="bold" style={{ color: colors.ink, fontSize: 10.5 }}>
                  Serves {dish.servesTo}
                </AppText>
              </>
            ) : null}
          </View>

          {/* Product instruction, 2026-09-03 — "For the Today order type,
              remove the slot information displayed on the menu card...
              Lunch/Dinner/Breakfast/High Tea should not be shown": this used
              to surface `activeMealSlots` as a row of small pills right
              here (product instruction, 2026-09-02, since reversed) — the
              add-sheet's own slot picker, one tap deeper, still shows
              exactly which slot(s) apply; this card no longer does. */}

          {/* No. of kitchens — same fact the "Refine your menu" filter's own
              kitchen checklist lets a resident narrow by, surfaced right on
              the card so they don't have to open the add-sheet just to find
              out how many kitchens serve this dish. */}
          {/* Bold + `colors.ink` (was `colors.muted`) — product instruction,
              2026-09-03, same reasoning as the Serves row above: this is a
              distinct fact, not more description-style body copy. */}
          {/* Bug fix (product report, 2026-09-03 — "when the kitchen count
              is 2, the icon appears but the '2 Kitchens' text is not
              displayed correctly"): no `numberOfLines` here at all — "2
              kitchens" is one character longer than "1 kitchen", enough to
              wrap onto a second line in a narrow grid cell at some
              font-scale/device-width combinations; the card's own
              `overflow-hidden` (see its outer `Pressable`) then clips that
              wrapped second line clean off, reading as the text having
              vanished while the icon stayed put. `numberOfLines={1}`
              (matching the icon row right below it, which already has one)
              keeps this to a single line, truncating with an ellipsis in
              the genuinely-too-narrow case instead of silently losing the
              whole line. */}
          <View className="mt-1.5 flex-row items-center gap-1">
            <IconShoppingBag size={13} color={colors.ink} />
            <AppText variant="caption" weight="bold" numberOfLines={1} style={{ color: colors.ink, fontSize: 10.5, flexShrink: 1 }}>
              {kitchenCount} kitchen{kitchenCount === 1 ? '' : 's'}
            </AppText>
          </View>

          {/* Delivery / self-pickup — real labelled pills now (was two bare
              icons) so a dish that's delivery-only or pickup-only reads at
              a glance instead of needing the icon's color guessed at. A
              dimmed, outlined pill (not hidden) means that mode isn't
              available from ANY kitchen offering this dish, so the row's
              shape stays constant across cards. */}
          <View className="mt-2 flex-row items-center" style={{ gap: 6 }}>
            <View
              className="flex-row items-center gap-1 rounded-full px-2 py-1"
              style={{
                backgroundColor: deliveryAvailable ? accentTint(colors.green, 0.12) : 'transparent',
                borderWidth: deliveryAvailable ? 0 : 1,
                borderColor: colors.border,
              }}>
              {/* Bug fix (product report, 2026-09-04 — "delivery pill is
                  looking active, make icon and text light gray like border
                  color so it can look like disable"): `colors.mutedLine` read
                  too close to the active green to land as genuinely
                  disabled — matching `colors.border` (the pill's own
                  outline color) instead makes a disabled pill's icon/text
                  visually recede WITH its border, not compete against it. */}
              <IconDelivery size={12} color={deliveryAvailable ? colors.green : colors.border} />
              <AppText variant="caption" weight="bold" style={{ color: deliveryAvailable ? colors.green : colors.border, fontSize: 9.5 }}>
                Delivery
              </AppText>
            </View>
            {/* Bug fix (product instruction, 2026-09-01 — "pickup is not
                activated... static design, make it dynamic"): this used to
                switch only between two very similar-looking greys
                (`colors.border`/`colors.borderSoft`, `colors.ink`/
                `colors.mutedLine`) regardless of `pickupAvailable` — never
                an actual accent fill the way Delivery's own tint already
                was, so it read as the same flat outline either way. Now
                gets the same tinted-pill treatment as Delivery when
                active, just gold-toned instead of green — matches the
                existing gold-for-"self-pickup" convention already used
                elsewhere in this feature (DeliveryChip in the add-sheet's
                kitchen picker). */}
            <View
              className="flex-row items-center gap-1 rounded-full px-2 py-1"
              style={{
                backgroundColor: pickupAvailable ? accentTint(colors.gold, 0.16) : 'transparent',
                borderWidth: pickupAvailable ? 0 : 1,
                borderColor: colors.border,
              }}>
              <IconStore size={12} color={pickupAvailable ? mixHex(colors.gold, '#000000', 0.35) : colors.border} />
              <AppText variant="caption" weight="bold" style={{ color: pickupAvailable ? mixHex(colors.gold, '#000000', 0.35) : colors.border, fontSize: 9.5 }}>
                Pickup
              </AppText>
            </View>
          </View>
        </View>

        {cartLine ? (
          // Bug fix (product instruction, 2026-09-01 — "extend width of
          // itself for qty manipulation"): a wrapping border box around the
          // stepper's own default COMPACT size still left the actual −/+
          // targets small and clustered in the middle, with unused space
          // either side — not what was being asked for. `QuantityStepper`'s
          // own `fullWidth` prop (opt-in, every other caller unaffected)
          // stretches the control itself edge-to-edge instead, so − and +
          // land at the same spots the "View more" button's own left/right
          // edges did, with more room around each for an actual tap.
          <View className="mt-2.5">
            <QuantityStepper
              count={cartLine.count}
              onIncrease={() => setLineCount(cartLine.key, cartLine.count + 1)}
              onDecrease={() => setLineCount(cartLine.key, cartLine.count - 1)}
              accentColor={tone.accent}
              decreaseLabel={`Decrease ${dish.name} quantity`}
              increaseLabel={`Increase ${dish.name} quantity`}
              // Bug fix (product instruction, 2026-09-01 — "do not allow
              // user to add more qty than available/serving qty from
              // anywhere"): this stepper used to have no ceiling at all —
              // the store now clamps the WRITE for every order type (see
              // `clampToAvailable`), but without this the "+" here just
              // silently stopped doing anything once the kitchen's own
              // remaining stock was hit, with no visible reason why. Advance
              // used to be exempt here too — reversed, product instruction
              // 2026-09-02 ("keep logic of serving and booked qty" for
              // Advance same as Instant/Today).
              increaseDisabled={cartLine.offer.availableQty !== undefined && cartLine.count >= cartLine.offer.availableQty}
              fullWidth
            />
            {/* Bug fix (product report, 2026-09-03 — "capped quantity
                message... currently not appearing" on the menu card): the
                stepper's "+" above already silently stopped once
                `availableQty` was hit (`increaseDisabled`), but with nothing
                explaining why — same gap the View More sheet's own qty
                stepper already closed for itself (ApartmentAddSheet.tsx),
                mirrored here with the same copy/condition. */}
            {cartLine.offer.availableQty !== undefined && cartLine.count >= cartLine.offer.availableQty ? (
              <AppText variant="caption" style={{ color: colors.warn, marginTop: 6 }}>
                {cartLine.offer.kitchenName} only serves {cartLine.offer.availableQty} of this item{orderType === 'advance' ? '' : ' today'}.
              </AppText>
            ) : null}
          </View>
        ) : blocked ? (
          <View className="mt-2.5 items-center rounded-2xl py-2" style={{ borderWidth: 1, borderColor: colors.border }}>
            <AppText variant="caption" weight="bold" style={{ color: colors.muted }}>
              {outOfStock ? 'Out of stock' : unorderable ? 'Unorderable' : 'Unavailable'}
            </AppText>
          </View>
        ) : (
          // Product instruction (2026-08-31): reverted back to the ORIGINAL
          // bordered/outline pill — a filled gradient button was tried in
          // the previous pass but explicitly asked back to how it was.
          <View className="mt-2.5 items-center rounded-2xl py-2" style={{ borderWidth: 1, borderColor: tone.accent }}>
            <AppText variant="caption" weight="bold" style={{ color: tone.accent }}>
              View more
            </AppText>
          </View>
        )}
      </View>
    </Pressable>
  );
});

import { Image } from 'expo-image';
import { forwardRef, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheetScrollView, type BottomSheetModal } from '@gorhom/bottom-sheet';
// Gesture-handler ScrollView (not RN's own) so nested scroll areas aren't starved by the bottom sheet's pan gesture.
import { ScrollView } from 'react-native-gesture-handler';

import { AppSheet } from '@/components/ui/AppSheet';
import { AppText } from '@/components/ui/AppText';
import { DietMark } from '@/components/ui/DietMark';
import { IconDelivery, IconStore, IconUtensils } from '@/components/ui/icons';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { accentTint, mixHex, palette, useApartmentColors } from '@/theme';
import { formatINR } from '@/utils/currency';

import { loadItemPairings, loadRecommendations } from '../api';
import { loadApartmentConfig, type ApartmentConfig } from '../config';
import {
  DEFAULT_INSTANT_PREP_MINUTES,
  cartLineForDish,
  dayLabel,
  formatHHmm,
  formatHour12,
  formatHourLabel,
  isDifferentKitchenOffer,
  isoForDay,
  isPastAdvanceCutoff,
  isPastNextDayCutoffHour,
  pairingNotInCart,
  stableIndexFor,
  todayIso,
} from '../pricing';
import type { ApartmentDish, ApartmentDishOffer, ApartmentMenuItem, MealType, OrderType } from '../types';
import { lineKeyFor, useApartmentCartStore } from '../useApartmentCartStore';
import { KitchenReel } from './KitchenReel';

interface ApartmentAddSheetProps {
  dish: ApartmentDish | null;
  /** Bumped by the caller on every open (even a reopen of the same dish) so the reset effect can tell those apart. */
  openSeq?: number;
  orderType: OrderType;
  apartmentId: string;
  apartmentName?: string;
  onAdded: () => void;
}

/** Add-to-cart sheet — one continuous scroll: day picker (Advance), slot picker (Today only), kitchen picker, quantity, pairings, Instant ETA, Add. */
export const ApartmentAddSheet = forwardRef<BottomSheetModal, ApartmentAddSheetProps>(
  ({ dish, openSeq, orderType, apartmentId, apartmentName, onAdded }, ref) => {
    const insets = useSafeAreaInsets();
    // Theme-aware palette.
    const { colors, orderType: orderTypeColors } = useApartmentColors();
    const addLine = useApartmentCartStore((s) => s.addLine);
    const addPairing = useApartmentCartStore((s) => s.addPairing);
    const checkKitchenConflict = useApartmentCartStore((s) => s.checkKitchenConflict);
    const cartLines = useApartmentCartStore((s) => s.lines);
    const setLineCount = useApartmentCartStore((s) => s.setLineCount);
    // Kitchen the cart is already committed to, if any — defaults the picker onto it.
    const cartMeta = useApartmentCartStore((s) => s.meta);

    // The resident's own tap; `count` below derives the live total from the cart so it stays in sync with changes made elsewhere.
    const [manualCount, setManualCount] = useState<number | null>(null);
    const [day, setDay] = useState<1 | 2>(1);
    // The resident's own tap; `slot` below re-derives per render to avoid racing the reset effect.
    const [manualSlot, setManualSlot] = useState<MealType | null>(null);
    const [kitchenId, setKitchenId] = useState<string | null>(null);
    const [pairs, setPairs] = useState<ApartmentMenuItem[]>([]);
    const [config, setConfig] = useState<ApartmentConfig | null>(null);

    // Pre-emptively blocks Add once the selected Advance day+slot is within its cutoff window.
    useEffect(() => {
      void loadApartmentConfig().then(setConfig);
    }, []);

    const needsDay = orderType === 'advance';
    // Advance's delivery-slot pick is a whole-order choice elsewhere; only Today uses this per-dish slot picker.
    const needsSlot = orderType === 'today';

    // Reset every field on a new dish open — keyed on dish?.key AND openSeq since a reopen never nulls `dish` out.
    useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setManualCount(null);
      setDay(1);
      setManualSlot(null);
      setKitchenId(null);
      setPairs([]);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dish?.key, openSeq]);

    const day1Iso = isoForDay(1);
    const day2Iso = isoForDay(2);

    const dayOpts = useMemo(() => {
      if (!dish || !needsDay) return [];
      // Tomorrow (T+1) stops being orderable after a configurable cutoff hour, folded into day 1's own `ok` so it greys out.
      const nextDayCutoffHour = config?.advanceNextDayCutoffHour;
      return ([1, 2] as const).map((d) => {
        const targetIso = d === 1 ? day1Iso : day2Iso;
        const hasOffer = dish.offers.some((o) => (o.source === 'daily' ? o.itemServingDate === targetIso && !o.blocked : d >= (dish.advanceLeadDays ?? 1)));
        const pastNextDayCutoff = nextDayCutoffHour !== undefined && isPastNextDayCutoffHour(d, nextDayCutoffHour);
        return { day: d, ok: hasOffer && !pastNextDayCutoff, pastNextDayCutoff: hasOffer && pastNextDayCutoff };
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dish, needsDay, config?.advanceNextDayCutoffHour]);

    // Auto-pick the first available day once options resolve.
    useEffect(() => {
      if (needsDay && dayOpts.length && !dayOpts.some((o) => o.day === day && o.ok)) {
        const firstOk = dayOpts.find((o) => o.ok);
        // `day` is real state (directly settable by the resident's tap), unlike the useMemo derivations `slot`/`autoOffer` below.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (firstOk) setDay(firstOk.day);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dayOpts]);

    const offersForDay = useMemo(() => {
      if (!dish) return [];
      if (!needsDay) return dish.offers;
      const targetIso = day === 1 ? day1Iso : day2Iso;
      return dish.offers.filter((o) => (o.source === 'daily' ? o.itemServingDate === targetIso : day >= (dish.advanceLeadDays ?? 1)));
    }, [dish, needsDay, day, day1Iso, day2Iso]);

    const slotOpts = useMemo(() => {
      if (!needsSlot) return [];
      const set = new Set<MealType>();
      // Only a slot with at least one not-blocked offer is selectable so a fully blocked slot isn't shown as a tappable pill.
      for (const o of offersForDay) if (o.mealType && !o.blocked) set.add(o.mealType);
      return Array.from(set);
    }, [offersForDay, needsSlot]);

    // This dish's sole existing cart line regardless of slot/day — a last-resort match for `existingLine` when the computed key misses (e.g. its slot's window closed).
    const soleCartLineForDish = useMemo(() => {
      if (!dish) return null;
      const prefix = `${dish.name.trim().toLowerCase()}|`;
      const matches = cartLines.filter((l) => l.key.startsWith(prefix));
      return matches.length === 1 ? matches[0] : null;
    }, [dish, cartLines]);
    const cartMealTypeForDish = soleCartLineForDish?.offer.mealType ?? null;

    // Resident's own tap wins if still valid; else auto-picks the lone option.
    const slot = useMemo(() => {
      if (manualSlot && slotOpts.includes(manualSlot)) return manualSlot;
      if (slotOpts.length === 1) return slotOpts[0];
      if (cartMealTypeForDish && slotOpts.includes(cartMealTypeForDish)) return cartMealTypeForDish;
      return null;
    }, [manualSlot, slotOpts, cartMealTypeForDish]);

    // The cart's own existing line for this exact dish/slot/day (no kitchen in the key — a cart never mixes kitchens).
    const existingLineMealType = needsSlot ? (slot ?? undefined) : orderType === 'advance' ? offersForDay[0]?.mealType : undefined;
    const existingLine = useMemo(() => {
      if (!dish) return null;
      const key = lineKeyFor(dish.name, { mealType: existingLineMealType, itemServingDate: needsDay ? (day === 1 ? day1Iso : day2Iso) : undefined });
      return cartLines.find((l) => l.key === key) ?? soleCartLineForDish;
    }, [dish, existingLineMealType, needsDay, day, day1Iso, day2Iso, cartLines, soleCartLineForDish]);
    // Reads straight from the existing cart line once there is one; manualCount only matters for a genuinely new pick.
    const count = existingLine ? existingLine.count : (manualCount ?? 1);

    // A kitchen serving this dish under 2+ meal slots dedupes to its best offer (not-blocked over blocked, then more remaining stock).
    const kitchenOpts = useMemo(() => {
      const bySlot = needsSlot && slot ? offersForDay.filter((o) => o.mealType === slot) : offersForDay;
      const byKitchen = new Map<string, ApartmentDishOffer>();
      for (const o of bySlot) {
        const existing = byKitchen.get(o.kitchenId);
        if (!existing) {
          byKitchen.set(o.kitchenId, o);
          continue;
        }
        const isBetter =
          existing.blocked !== o.blocked
            ? existing.blocked // existing is blocked, o isn't (or vice versa) — prefer the not-blocked one
            : (o.availableQty ?? Infinity) > (existing.availableQty ?? Infinity);
        if (isBetter) byKitchen.set(o.kitchenId, o);
      }
      return Array.from(byKitchen.values());
    }, [offersForDay, needsSlot, slot]);

    // R8: default kitchen assignment is RANDOM among eligible kitchens (not rating-based), derived synchronously in a `useMemo` (not `useEffect`+setKitchenId) to avoid a race with the dish-reset effect that left Instant's kitchen permanently unselected; `availableQty` undefined means no serving cap.
    const qtyOkFor = (offer: ApartmentDishOffer): boolean => offer.availableQty === undefined || offer.availableQty >= count;

    const autoOffer = useMemo(() => {
      // Instant no longer auto-assigns a kitchen (R8) — the resident must always tap one themselves, even with only one option; Today/Advance still auto-pick.
      if (orderType === 'instant') return null;
      // Only defaults onto a kitchen that can actually cover the CURRENT count; `count` is in the deps so raising qty re-derives which kitchens still qualify.
      const eligible = kitchenOpts.filter((o) => !o.blocked && qtyOkFor(o));
      if (eligible.length === 0) return null;
      // Bug fix: `Math.random()` in a `useMemo` could re-roll a different kitchen on an unrelated re-render; a stable hash of dish+eligible-kitchens keeps R8's randomness pure and jitter-free.
      const seed = `${dish?.key ?? ''}|${eligible.map((o) => o.kitchenId).sort().join(',')}`;
      return eligible[stableIndexFor(seed, eligible.length)];
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kitchenOpts, count, orderType]);

    // If this dish is also served by the kitchen the cart is already committed to, default onto that kitchen for every order type (Instant included) — avoids a pointless conflict prompt.
    const cartKitchenOffer = useMemo(() => {
      if (!cartMeta) return null;
      const offer = kitchenOpts.find((o) => o.kitchenId === cartMeta.kitchenId);
      if (!offer || offer.blocked || !qtyOkFor(offer)) return null;
      return offer;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kitchenOpts, cartMeta, count]);

    // A dish served by exactly ONE kitchen auto-selects it too (every order type, Instant included) — still goes through the conflict prompt at Add time if it differs from the cart's kitchen.
    const soleKitchenOffer = useMemo(() => {
      if (kitchenOpts.length !== 1) return null;
      const offer = kitchenOpts[0];
      if (offer.blocked || !qtyOkFor(offer)) return null;
      return offer;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kitchenOpts, count]);

    // Manual pick wins only while still valid for the current dish/day/slot, else falls through to cart kitchen / sole kitchen / random default; not filtered on qtyOkFor so an explicit pick stays chosen (surfaced via `overCap` instead of silently reassigned).
    const manualOffer = kitchenId ? (kitchenOpts.find((o) => o.kitchenId === kitchenId && !o.blocked) ?? null) : null;
    const selectedOffer = manualOffer ?? cartKitchenOffer ?? soleKitchenOffer ?? autoOffer;

    // MOQ is kitchen-side, never enforced here — a resident can always start at 1 up to the kitchen's remaining stock (`qtyCap`, undefined meaning no cap), the only real ceiling that applies.
    const qtyCap = selectedOffer?.availableQty;

    // Bug fix ("prep time is not taking"): removed a redundant server round-trip for prep-time estimate — `selectedOffer.preparationTime` is already fresh from the same merged catalog response, and the old endpoint could silently mask it with stale/mismatched data.

    // Same-kitchen-only pairings: a daily item uses loadItemPairings, a standing item uses loadRecommendations.
    useEffect(() => {
      if (!selectedOffer) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPairs([]);
        return;
      }
      let active = true;
      const fetchPairs =
        selectedOffer.source === 'daily'
          ? loadItemPairings(selectedOffer.kitchenId, orderType, selectedOffer.itemId, todayIso())
          : loadRecommendations(selectedOffer.kitchenId, selectedOffer.itemId, todayIso(), orderType as 'instant' | 'advance');
      fetchPairs.then((list) => {
        // Excludes anything already in the cart so a dish never suggests itself.
        if (active) setPairs(pairingNotInCart(list, useApartmentCartStore.getState().lines));
      });
      return () => {
        active = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedOffer?.kitchenId, selectedOffer?.itemId, selectedOffer?.source, orderType]);

    if (!dish) {
      return (
        <AppSheet ref={ref} snapPoints={['1%']}>
          <View />
        </AppSheet>
      );
    }

    // The server's own assertWithinAdvanceCutoff is the real enforcement; this is
    // purely a pre-submit warning so Add doesn't just come back with an error.
    const targetIso = day === 1 ? day1Iso : day2Iso;
    const advancePastCutoff =
      needsDay && selectedOffer && config
        ? isPastAdvanceCutoff(selectedOffer.kitchenMealTiming, selectedOffer.mealType, targetIso, config.advanceCutoffMinutes)
        : false;

    // Product decision (superseding the earlier auto-switch-kitchen
    // behavior): a qty increase no longer silently reassigns the kitchen.
    // Instead each kitchen ROW disables itself once it can't cover the
    // CURRENT count (see the picker below, `ok = !offer.blocked &&
    // qtyOkFor(offer)`) — the resident sees exactly which kitchens still
    // qualify and picks among them themselves. `overCap` here is the
    // backstop that blocks Add if the resident's OWN pick (which stays
    // selected even once insufficient — see `manualOffer`'s comment above)
    // can't actually cover the count, telling them to lower it or switch.
    //
    // Advance briefly included this too (2026-09-02, since reverted) on the
    // assumption its own merged menu response carries a real per-kitchen
    // serving/booked figure the same way Instant/Today do — confirmed WRONG
    // per the "Apartment Orders API Reference" doc: Advance's own
    // `availableQuantity`/`quantityBooked` are explicitly "not meaningful"
    // (real stock lives in a separate per-date ledger never surfaced to this
    // app's menu fetch — see pricing.ts's `mergeDailyItems` for the full
    // story), so `offer.availableQty`/`qtyCap` are always `undefined` for an
    // Advance offer regardless of what this flag says — kept `true` for it
    // anyway since it's a harmless no-op (nothing downstream ever fires
    // without a real `qtyCap` to compare against) and stays correct for
    // free if Advance ever does get real per-offer stock data later.
    const usesQtyCap = orderType === 'instant' || orderType === 'today' || orderType === 'advance';
    // `handleIncreaseCount` already refuses to step `count` past `qtyCap`
    // (see its own comment) going forward, so this mainly catches the
    // KITCHEN-SWITCH case — a qty set against one kitchen's cap that
    // outruns a DIFFERENT kitchen's smaller one once the resident switches
    // (manualOffer stays exactly what they picked even once insufficient,
    // see its own comment above) — not something the stepper cap alone
    // can prevent.
    const overCap = usesQtyCap && !!selectedOffer && qtyCap !== undefined && qtyCap < count;

    // Bug fix (product decision): the old first branch's "one order is
    // cooked end to end by one kitchen" explainer wasn't wrong, just not
    // what a resident needs in the moment — a direct instruction for
    // whichever ONE thing is actually blocking Add right now, checked in
    // the order a resident would naturally resolve them (pick a kitchen,
    // then a slot, then a valid day, then a quantity that fits). No MOQ
    // check here — see the qty-derivation comment above for why.
    // Bug fix (found while adding the next-day-cutoff check below): a day
    // this dish has no offer for at all used to just leave `blockedMsg`
    // empty — `addDisabled` already correctly blocked Add for it, but with
    // no explanation, a silently-disabled button. Now distinguishes the two
    // real reasons a chosen day can be invalid — no kitchen serves it at
    // all vs. ADVANCE_NEXT_DAY_CUTOFF_PASSED specifically (which needs its
    // own wording — "no kitchen open" would be misleading when a kitchen
    // genuinely IS open, the platform just stopped taking Tomorrow orders
    // for the rest of today).
    const dayInvalidReason = needsDay && !dayOpts.some((o) => o.day === day && o.ok) ? dayOpts.find((o) => o.day === day) : undefined;
    const blockedMsg = !selectedOffer
      ? 'Please select a kitchen to continue.'
      : needsSlot && !slot
        ? 'Please select a meal slot to continue.'
        : dayInvalidReason?.pastNextDayCutoff
          ? `Orders for ${dayLabel(1)} are no longer accepted after ${config ? formatHourLabel(config.advanceNextDayCutoffHour) : '10 PM'} today. Try ${dayLabel(2)} instead.`
          : dayInvalidReason
            ? 'No kitchen is open for this day. Try the other day.'
            : advancePastCutoff
              ? `Too close to this slot's start for Advance — needs ${config ? config.advanceCutoffMinutes / 60 : 12}h lead time. Try the other day, or order via Today/Instant instead.`
              : overCap
                ? // "today" is only accurate for Instant/Today — Advance is
                  // for a resident-picked FUTURE date, so this names that
                  // day instead (same `dayLabel` the day picker itself uses).
                  `${selectedOffer.kitchenName} only serves ${qtyCap} of this item ${orderType === 'advance' ? `for ${dayLabel(day)}` : 'today'} — lower the quantity or switch kitchens.`
                : '';
    const addDisabled = !selectedOffer || (needsSlot && !slot) || (needsDay && !dayOpts.some((o) => o.day === day && o.ok)) || advancePastCutoff || overCap;
    const tone = orderTypeColors[orderType];

    // Bug fix: price showing as ₹0 once qty outran EVERY kitchen's cap —
    // `selectedOffer` is `null` in that exact state (by design: `autoOffer`
    // only ever picks a kitchen that can actually cover the current count,
    // and with nothing manually chosen there's nothing left to fall back
    // to), so `selectedOffer?.price ?? 0` was reading as a real ₹0 price
    // instead of "nothing valid is selected right now" — Add is correctly
    // disabled either way (`addDisabled` doesn't depend on this), but the
    // displayed price shouldn't lie about what the item actually costs.
    // Falls back to any non-blocked kitchen (ignoring qty), then to the
    // first kitchen at all, purely for this display — never used for
    // anything that actually submits.
    const priceReferenceOffer = selectedOffer ?? kitchenOpts.find((o) => !o.blocked) ?? kitchenOpts[0] ?? null;

    // Bug fix: the footer's own price used to be a static
    // `mainDish.price × count`, never updating once a "GOES WELL WITH"
    // pairing got tapped — those add straight to the cart the moment
    // they're tapped (not deferred to "Add to order" the way the main dish
    // is), so by the time this footer is looked at, any already-added
    // pairing's own cost belongs in this running total too. Summed off
    // `pairs` + the shared `cartLines` (same `cartLineForDish` lookup each
    // pairing card itself uses to decide whether to show its own qty
    // stepper), so this always reflects whichever pairings — and however
    // many of each, via that stepper — are actually in the cart right now.
    const pairingsTotal = pairs.reduce((sum, p) => {
      const line = cartLineForDish(cartLines, p.itemName, p.mealType);
      return line ? sum + line.offer.price * line.count : sum;
    }, 0);

    function commitAdd(): void {
      if (!selectedOffer) return;
      const offer: ApartmentDishOffer = needsDay ? { ...selectedOffer, itemServingDate: day === 1 ? day1Iso : day2Iso } : selectedOffer;
      // `count` is the dish's intended FINAL total, so an existing line gets
      // SET to it directly rather than added on top (which would double-count).
      if (existingLine) {
        setLineCount(existingLine.key, count);
      } else {
        addLine(dish!, offer, orderType, apartmentId, apartmentName, count);
      }
      if (!useApartmentCartStore.getState().conflict) {
        onAdded();
      }
      // On conflict, the sheet stays open behind the conflict modal until the
      // resident resolves it, then can retry Add.
    }

    // Bug fix (product report, 2026-09-02 — see `count`'s own comment
    // above): writes straight to the store the instant this dish/slot/day
    // is already a real cart line — exactly what `manualCount` used to
    // buffer locally (and could go stale). A genuinely new pick (nothing to
    // write to yet) still just buffers in `manualCount`, committed for real
    // by `commitAdd`'s own `addLine` call.
    function setCount(next: number): void {
      if (existingLine) setLineCount(existingLine.key, next);
      else setManualCount(next);
    }

    // Bug fix (product instruction): "+" used to climb past whatever the
    // selected kitchen can actually serve today with no feedback at all
    // until the resident scrolled down to a disabled Add button — now it
    // simply refuses to go past `qtyCap`, and the caption right under the
    // stepper (below) explains why the moment they hit it. Doesn't touch
    // kitchen-switching logic at all (see `overCap`'s own comment) — this
    // only caps forward progress from HERE, it can't retroactively fix a
    // qty that already outran a DIFFERENT kitchen's smaller cap.
    function handleIncreaseCount(): void {
      if (qtyCap !== undefined && count >= qtyCap) return;
      setCount(count + 1);
    }

    // Product instruction, 2026-09-01 — a kitchen row is now tappable
    // regardless of whether it covers the CURRENT count (a lower-capacity
    // kitchen used to disable itself instead — see KitchenRow's own comment
    // for the reasoning this reverses): the KITCHEN choice is always the
    // deliberate, primary one and is never silently reassigned, but QTY is
    // secondary and now adapts to fit whichever kitchen the resident
    // actually picks — e.g. 15 already dialled in against a 20-serving
    // kitchen clamps down to 10 the moment a 10-serving kitchen is tapped,
    // rather than that row staying disabled until the resident manually
    // lowers the count first.
    //
    // Product instruction: raise the "different kitchen" conflict prompt
    // the MOMENT the resident taps a kitchen row that isn't the cart's
    // existing one — not only later, at "Add to order" time (which
    // `commitAdd`'s own `addLine` call still separately guards, as a
    // backstop). `checkKitchenConflict` sets the SAME `conflict` state
    // `addLine` would, so the existing `ApartmentConflictModal` (rendered
    // by the screen this sheet lives in) picks it up unchanged: "Start a
    // new order" resets the cart to exactly this (dish, kitchen, qty) and
    // closes this sheet (see ApartmentHome's own wiring) — "Keep current
    // order" (or tapping outside it) just dismisses the prompt, and since
    // `setKitchenId` never ran, the picker stays exactly as it was
    // (`selectedOffer` still resolves via `cartKitchenOffer`).
    function handleSelectKitchen(offer: ApartmentDishOffer): void {
      if (checkKitchenConflict(dish!, offer, orderType, apartmentId, apartmentName, count)) return;
      setKitchenId(offer.kitchenId);
      if (offer.availableQty !== undefined && offer.availableQty < count) {
        setCount(Math.max(1, offer.availableQty));
      }
    }

    return (
      <AppSheet ref={ref} snapPoints={['85%']}>
        <View className="border-b pb-3 pt-1" style={{ borderColor: colors.borderSoft }}>
          {/* Name/description come first, above the media reel. No close (X)
              button — the sheet's own backdrop/drag handle dismiss it. */}
          <View className="flex-row items-center gap-3 px-4">
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center gap-1.5">
                <DietMark veg={dish.isVeg} size={13} />
                <AppText variant="label" style={{ color: colors.ink, flexShrink: 1 }} numberOfLines={1}>
                  {dish.name}
                </AppText>
                {/* Serving qty/unit is kitchen-specific — reads off `selectedOffer`
                    so it updates when the kitchen selection changes. */}
                {selectedOffer?.servingQuantity && selectedOffer.servingQuantityUnit ? (
                  <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: tone.soft, flexShrink: 0 }}>
                    <AppText variant="caption" weight="bold" style={{ color: tone.accent, fontSize: 11 }}>
                      {selectedOffer.servingQuantity} {selectedOffer.servingQuantityUnit}
                    </AppText>
                  </View>
                ) : null}
              </View>
              {/* Uncapped here — the browse grid's card truncates it as a teaser. */}
              {dish.description ? (
                <AppText variant="caption" style={{ color: colors.muted, marginTop: 2 }}>
                  {dish.description}
                </AppText>
              ) : null}
            </View>
          </View>
          <KitchenReel images={dish.bannerImages ?? []} videos={dish.bannerVideos ?? []} />
        </View>

        {/* No order-type badge/note banner in this sheet, by design. */}
        <BottomSheetScrollView contentContainerStyle={{ padding: 18, gap: 4 }}>
          {needsDay ? (
            <View style={{ marginTop: 14 }}>
              <AppText variant="overline" style={{ color: colors.muted, marginBottom: 8 }}>
                DELIVERY DATE
              </AppText>
              <View className="flex-row" style={{ gap: 9 }}>
                {dayOpts.map((opt) => {
                  const active = day === opt.day;
                  return (
                    <Pressable
                      key={opt.day}
                      onPress={() => opt.ok && setDay(opt.day)}
                      disabled={!opt.ok}
                      className="flex-1 rounded-2xl px-3 py-2.5"
                      style={{
                        borderWidth: active ? 2 : 1,
                        borderColor: active ? tone.accent : colors.border,
                        // Opacity-based, not opaque white — matches every card below.
                        backgroundColor: active ? tone.soft : opt.ok ? colors.card : colors.borderSoft,
                      }}>
                      <AppText variant="label" style={{ color: opt.ok ? (active ? tone.accent : colors.mutedLine) : colors.muted }}>
                        {dayLabel(opt.day)}
                      </AppText>
                      <AppText variant="caption" style={{ color: opt.ok ? (active ? tone.accent : colors.mutedLine) : colors.muted, marginTop: 2, opacity: 0.85 }}>
                        {/* Cutoff-passed gets its own reason — "no kitchen open" would
                            be misleading when a kitchen genuinely is open. */}
                        {opt.ok ? `T+${opt.day}` : opt.pastNextDayCutoff ? 'Cutoff passed' : 'No kitchen open'}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {needsSlot ? (
            <View style={{ marginTop: 14 }}>
              <AppText variant="overline" style={{ color: colors.muted, marginBottom: 8 }}>
                {/* Imperative label only while nothing's chosen yet; matches
                    KITCHEN's own dynamic label below. */}
                {slot ? 'MEAL SLOT' : 'SELECT MEAL SLOT'}
              </AppText>
              {slotOpts.length === 0 ? (
                <AppText variant="caption" style={{ color: colors.muted }}>
                  No meal slot is currently open for this dish.
                </AppText>
              ) : (
                <View className="flex-row" style={{ gap: 8 }}>
                  {slotOpts.map((m) => {
                    const active = slot === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => setManualSlot(m)}
                        className="flex-1 items-center rounded-2xl px-2 py-2.5"
                        style={{ borderWidth: active ? 2 : 1, borderColor: active ? tone.accent : colors.border, backgroundColor: active ? tone.soft : colors.card }}>
                        <AppText variant="caption" weight="bold" style={{ color: active ? tone.accent : colors.mutedLine }}>
                          {m}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          ) : null}

          {/* Quantity is shown above the kitchen picker, by design. */}
          <View className="mt-3.5 rounded-2xl p-3.5" style={{ backgroundColor: '#f6f6ec', borderWidth: 1, borderColor: colors.borderSoft }}>
            <View className="flex-row items-center justify-between">
              <View>
                <AppText variant="overline" style={{ color: colors.muted }}>
                  QUANTITY
                </AppText>
                <AppText variant="label" style={{ color: colors.ink, marginTop: 2 }}>
                  {formatINR(priceReferenceOffer?.price ?? 0)} each
                </AppText>
              </View>
              {/* Disabled until a kitchen actually resolves (Quantity sits above
                  the kitchen picker, so nothing to increment against yet). */}
              <QuantityStepper count={count} onIncrease={handleIncreaseCount} onDecrease={() => setCount(Math.max(1, count - 1))} disabled={!selectedOffer} />
            </View>
            {/* Shown right where the resident is looking, not only once they
                scroll down to a disabled Add button. */}
            {usesQtyCap && qtyCap !== undefined && count >= qtyCap ? (
              <AppText variant="caption" style={{ color: colors.warn, marginTop: 6 }}>
                {selectedOffer?.kitchenName} only serves {qtyCap} of this item {orderType === 'advance' ? `for ${dayLabel(day)}` : 'today'}.
              </AppText>
            ) : null}
          </View>

          <View style={{ marginTop: 14 }}>
            <AppText variant="overline" style={{ color: colors.muted, marginBottom: 8 }}>
              {/* Same dynamic-label rule as MEAL SLOT above. */}
              {selectedOffer ? 'KITCHEN' : 'SELECT KITCHEN'}
            </AppText>
            {(() => {
              // Product instruction: when a dish is served by several
              // kitchens but every-other-one-but-one is currently blocked
              // (out of stock, or — Today — past its own meal-slot window),
              // don't clutter the picker with rows the resident can't
              // actually tap anyway — show ONLY the one kitchen that's
              // still genuinely orderable, same "direct, no real choice to
              // make" treatment the true single-kitchen case below already
              // gets. Falls back to `kitchenOpts[0]` when the dish only
              // ever had ONE kitchen to begin with (whether or not it's
              // currently blocked) — that case still needs to render
              // SOMETHING, even if the one thing it renders is disabled, so
              // the resident can see why (unchanged from before this).
              const orderableKitchenOpts = kitchenOpts.filter((o) => !o.blocked);
              const singleKitchenOffer = orderableKitchenOpts.length === 1 ? orderableKitchenOpts[0] : kitchenOpts.length === 1 ? kitchenOpts[0] : null;
              // Product decision: show up to 3 kitchen rows at a fixed
              // height — a 4th+ kitchen scrolls WITHIN that fixed area
              // instead of pushing "GOES WELL WITH"/the ETA banner/Add
              // button further down the sheet every time an apartment
              // happens to have a lot of kitchens serving the same dish.
              const rows =
                singleKitchenOffer ? (
                  // Only one kitchen is actually in play here — for
                  // Today/Advance there's nothing to actually choose between
                  // (autoOffer already silently picked it, no tap needed).
                  // Instant is the exception: it no longer auto-selects ANY
                  // kitchen — see autoOffer's own comment — so even this
                  // lone option needs an explicit tap before Add unlocks,
                  // same as any multi-kitchen row below.
                  (() => {
                    const offer = singleKitchenOffer;
                    // Bug fix (product decision): a qty past what this
                    // kitchen can serve used to auto-switch to a "better"
                    // kitchen — now it just disables the row instead (see
                    // usesQtyCap's comment above), same as the multi-kitchen
                    // list below.
                    // Product instruction, 2026-09-01 — no longer disables
                    // the row (see handleSelectKitchen's own comment): a
                    // lower-capacity kitchen stays tappable, tapping it
                    // clamps qty down to fit instead. `qtyInsufficient` is
                    // now purely informational (the caption below).
                    const qtyInsufficient = !offer.blocked && !qtyOkFor(offer);
                    const ok = !offer.blocked;
                    // Bug fix (product decision): a single kitchen is
                    // effectively "selected" by definition (there's nothing
                    // else it could be) — showing it as a neutral,
                    // unselected-looking row read as if nothing had been
                    // chosen at all. Same active border/background/radio
                    // treatment the multi-kitchen list uses. For Instant,
                    // `active` genuinely depends on whether the resident has
                    // tapped it yet (`selectedOffer` only becomes this offer
                    // via `manualOffer` there); for every other type it's
                    // effectively always true (autoOffer already resolved to
                    // it), same visual result as before.
                    const active = selectedOffer?.kitchenId === offer.kitchenId;
                    const differentKitchen = isDifferentKitchenOffer(offer, cartMeta?.kitchenId);
                    return (
                      <KitchenRow
                        offer={offer}
                        orderType={orderType}
                        active={active}
                        ok={ok}
                        qtyInsufficient={qtyInsufficient}
                        differentKitchen={differentKitchen}
                        onPress={() => ok && orderType === 'instant' && handleSelectKitchen(offer)}
                        disabled={!ok || orderType !== 'instant'}
                        tone={tone}
                        colors={colors}
                      />
                    );
                  })()
              ) : (
                kitchenOpts.map((offer) => {
                  // Against `selectedOffer`, not raw `kitchenId` — highlights
                  // whichever kitchen is actually in effect, auto-picked or not.
                  const active = selectedOffer?.kitchenId === offer.kitchenId;
                  // Product instruction, 2026-09-01 — no longer disables the
                  // row (see handleSelectKitchen's own comment): tapping a
                  // lower-capacity kitchen now clamps qty down to fit
                  // instead of the row being untappable. `qtyInsufficient`
                  // stays purely informational (the caption below).
                  const qtyInsufficient = !offer.blocked && !qtyOkFor(offer);
                  const ok = !offer.blocked;
                  const differentKitchen = isDifferentKitchenOffer(offer, cartMeta?.kitchenId);
                  return (
                    <KitchenRow
                      key={offer.kitchenId}
                      offer={offer}
                      orderType={orderType}
                      active={active}
                      ok={ok}
                      qtyInsufficient={qtyInsufficient}
                      differentKitchen={differentKitchen}
                      onPress={() => ok && handleSelectKitchen(offer)}
                      disabled={!ok}
                      tone={tone}
                      colors={colors}
                    />
                  );
                })
              );
              return kitchenOpts.length > 3 ? (
                <ScrollView style={{ maxHeight: 216 }} contentContainerStyle={{ gap: 9 }} showsVerticalScrollIndicator={false}>
                  {rows}
                </ScrollView>
              ) : (
                <View style={{ gap: 9 }}>{rows}</View>
              );
            })()}
          </View>

          {pairs.length > 0 ? (
            <View style={{ marginTop: 16 }}>
              <AppText variant="overline" style={{ color: colors.muted, marginBottom: 8 }}>
                GOES WELL WITH
              </AppText>
              {/* Keyed on the currently selected kitchen+item — a different
                  kitchen surfaces that kitchen's own pairings. */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
                {pairs.map((p) => {
                  // A daily item always carries a real `itemServingDate`; a
                  // standing (shared-catalog) one never does.
                  const pairingSource: 'daily' | 'standard' = p.itemServingDate ? 'daily' : 'standard';
                  // Advance stamps the same day picked for the main dish rather
                  // than the pairing's own (not necessarily day-scoped) date.
                  const pairingServingDate = needsDay ? (day === 1 ? day1Iso : day2Iso) : pairingSource === 'daily' ? p.itemServingDate.slice(0, 10) : undefined;
                  // Already-in-cart pairings show a qty stepper instead of "ADD".
                  const cartLine = cartLineForDish(cartLines, p.itemName, p.mealType);
                  // `quantityAvailable` is already the server's real, netted
                  // remaining figure — don't subtract `quantityBooked` again.
                  // `undefined` (no stock concept) fails open.
                  const remaining = p.quantityAvailable !== undefined ? Math.max(0, p.quantityAvailable) : undefined;
                  const pairingUnorderable = remaining === 0;
                  return (
                    // Fixed card height, matching apartment-cart.tsx's "Add more
                    // from kitchen" cards — keep both in sync if either changes.
                    <View
                      key={p._id}
                      style={{ width: 168, height: 236, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                      <View style={{ height: 100, backgroundColor: accentTint(palette.accent.food, 0.14) }}>
                        {p.imageUrl ? (
                          <Image source={{ uri: p.imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                        ) : (
                          <View className="h-full items-center justify-center">
                            <IconUtensils size={24} color={palette.accent.food} />
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1, padding: 10, justifyContent: 'space-between' }}>
                        <View style={{ gap: 3 }}>
                          <AppText variant="label" style={{ color: colors.ink }} numberOfLines={1}>
                            {p.itemName}
                          </AppText>
                          {p.itemDescription ? (
                            <AppText variant="caption" style={{ color: colors.muted }} numberOfLines={2}>
                              {p.itemDescription}
                            </AppText>
                          ) : null}
                        </View>
                        {/* Price and the Add/qty-stepper share one row, matching
                            the browse grid's and cart screen's dish cards. */}
                        <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
                          <AppText variant="label" style={{ color: colors.ink, flexShrink: 1 }} numberOfLines={1}>
                            {formatINR(p.itemPrice)}
                          </AppText>
                          {pairingUnorderable ? (
                            <View
                              className="items-center rounded-lg px-2.5 py-1.5"
                              style={{ backgroundColor: colors.warnBg, borderWidth: 1, borderColor: colors.warnLine, flexShrink: 0 }}>
                              <AppText variant="caption" weight="bold" style={{ color: colors.warn }}>
                                Unorderable
                              </AppText>
                            </View>
                          ) : cartLine ? (
                            <QuantityStepper
                              count={cartLine.count}
                              onIncrease={() => setLineCount(cartLine.key, cartLine.count + 1)}
                              onDecrease={() => setLineCount(cartLine.key, cartLine.count - 1)}
                              accentColor={tone.accent}
                              decreaseLabel={`Decrease ${p.itemName} quantity`}
                              increaseLabel={`Increase ${p.itemName} quantity`}
                            />
                          ) : (
                            <Pressable
                              onPress={() =>
                                selectedOffer &&
                                addPairing(p, orderType, apartmentId, apartmentName, selectedOffer.kitchenId, selectedOffer.kitchenName, pairingSource, pairingServingDate)
                              }
                              className="items-center rounded-lg px-2.5 py-1.5"
                              style={{ backgroundColor: tone.soft, borderWidth: 1, borderColor: tone.line, flexShrink: 0 }}>
                              <AppText variant="caption" weight="bold" style={{ color: tone.accent }}>
                                ADD
                              </AppText>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {orderType === 'instant' && selectedOffer ? (
            <View className="mt-4 rounded-2xl p-3" style={{ backgroundColor: 'rgba(30,91,63,.1)', borderWidth: 1, borderColor: 'rgba(30,91,63,.28)' }}>
              <AppText variant="caption" weight="bold" style={{ color: colors.green }}>
                {/* Falls back to a default when a kitchen never set its own
                    preparationTime — a common, not edge-case, gap. */}
                Tentative preparation about {selectedOffer.preparationTime ?? DEFAULT_INSTANT_PREP_MINUTES} min once order is in preparation
              </AppText>
            </View>
          ) : null}
        </BottomSheetScrollView>

        <View className="border-t px-4 pt-3" style={{ borderColor: colors.borderSoft, paddingBottom: insets.bottom + 14 }}>
          {blockedMsg ? (
            <View className="mb-2.5 rounded-2xl px-3 py-2.5" style={{ backgroundColor: colors.warnBg, borderWidth: 1, borderColor: colors.warnLine }}>
              <AppText variant="caption" weight="bold" style={{ color: colors.warn, lineHeight: 16 }}>
                {blockedMsg}
              </AppText>
            </View>
          ) : null}
          <Pressable
            onPress={commitAdd}
            disabled={addDisabled}
            accessibilityRole="button"
            className="flex-row items-center justify-between rounded-2xl px-4 py-4"
            style={{ backgroundColor: addDisabled ? colors.disabled : tone.accent }}>
            <AppText variant="label" style={{ color: '#fff' }}>
              Add to order
            </AppText>
            <AppText variant="label" style={{ color: '#fff' }}>
              {formatINR((priceReferenceOffer?.price ?? 0) * count + pairingsTotal)}
            </AppText>
          </Pressable>
        </View>
      </AppSheet>
    );
  },
);

ApartmentAddSheet.displayName = 'ApartmentAddSheet';

/** Delivery/Pickup pills matching ApartmentDishCard's menu card. Unlike that
 * card, an unsupported mode is hidden outright here (one specific kitchen is
 * already named); fails open to showing both when mode data is missing. */
function FulfillmentPills({ modes, colors }: { modes?: { deliveryEnabled: boolean; pickupEnabled: boolean }; colors: ApartmentPalette }) {
  const deliveryAvailable = !modes || modes.deliveryEnabled;
  const pickupAvailable = !modes || modes.pickupEnabled;
  return (
    <View className="flex-row items-center" style={{ gap: 6 }}>
      {deliveryAvailable ? (
        <View className="flex-row items-center gap-1 rounded-full px-2 py-1" style={{ backgroundColor: accentTint(colors.green, 0.12) }}>
          <IconDelivery size={12} color={colors.green} />
          <AppText variant="caption" weight="bold" style={{ color: colors.green, fontSize: 9.5 }}>
            Delivery
          </AppText>
        </View>
      ) : null}
      {pickupAvailable ? (
        <View className="flex-row items-center gap-1 rounded-full px-2 py-1" style={{ backgroundColor: accentTint(colors.gold, 0.16) }}>
          <IconStore size={12} color={mixHex(colors.gold, '#000000', 0.35)} />
          <AppText variant="caption" weight="bold" style={{ color: mixHex(colors.gold, '#000000', 0.35), fontSize: 9.5 }}>
            Pickup
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

/** Wing/block sub-line under a kitchen's name (so self-pickup residents know
 * where to walk); falls back to the kitchen's street address, or undefined
 * if it has neither. */
function kitchenAddress(offer: ApartmentDishOffer): string | undefined {
  if (offer.kitchenWingName && offer.kitchenRoomNumber) return `${offer.kitchenWingName} · ${offer.kitchenRoomNumber}`;
  if (offer.kitchenWingName || offer.kitchenRoomNumber) return offer.kitchenWingName || offer.kitchenRoomNumber || undefined;
  return offer.kitchenStreetAddress;
}

/** Unlike a placed order (committed to one mode), a kitchen here can support
 * either or both — fails open to "both" when mode data is missing. */
function fulfillmentVerb(modes?: { deliveryEnabled: boolean; pickupEnabled: boolean }): string {
  const deliveryOk = !modes || modes.deliveryEnabled;
  const pickupOk = !modes || modes.pickupEnabled;
  if (deliveryOk && pickupOk) return 'deliver/pickup';
  return pickupOk ? 'pickup' : 'deliver';
}

/** Kitchen-row prep text: Instant shows a plain duration; Today shows the
 * kitchen's configured prep-end time (falling back to a now-plus-duration
 * estimate); Advance has no same-day prep concept, so returns undefined. */
function kitchenPrepLabel(offer: ApartmentDishOffer, orderType: OrderType): string | undefined {
  if (orderType === 'advance') return undefined;
  if (orderType === 'instant') return offer.preparationTime ? `Ready in ${offer.preparationTime} min` : undefined;
  const verb = fulfillmentVerb(offer.kitchenFulfillmentModes);
  if (offer.kitchenPrepEndTime) return `Ready to ${verb} after ${formatHHmm(offer.kitchenPrepEndTime)}`;
  return offer.preparationTime ? `Ready to ${verb} by ${formatHour12(new Date(Date.now() + offer.preparationTime * 60000))}` : undefined;
}

type ApartmentTone = ReturnType<typeof useApartmentColors>['orderType'][OrderType];
type ApartmentPalette = ReturnType<typeof useApartmentColors>['colors'];

/** Derives the day label straight off the offer since `KitchenRow` has no
 * `day` state of its own. Falls back to "that date" rather than nothing. */
function offerDayLabel(itemServingDate: string | undefined): string {
  if (!itemServingDate) return 'that date';
  const iso = itemServingDate.slice(0, 10);
  if (iso === isoForDay(1)) return dayLabel(1);
  if (iso === isoForDay(2)) return dayLabel(2);
  return 'that date';
}


/** One shared row layout for every kitchen-picker row (single- or
 * multi-kitchen, all three order types) — the radio still renders even on a
 * non-interactive row, just to show current selection. */
function KitchenRow({
  offer,
  orderType,
  active,
  ok,
  qtyInsufficient,
  differentKitchen,
  onPress,
  disabled,
  tone,
  colors,
}: {
  offer: ApartmentDishOffer;
  orderType: OrderType;
  active: boolean;
  ok: boolean;
  /** True when remaining stock is below the current qty — shown as a
   * heads-up that tapping this row will lower the quantity to fit. */
  qtyInsufficient?: boolean;
  differentKitchen: boolean;
  onPress: () => void;
  disabled: boolean;
  tone: ApartmentTone;
  colors: ApartmentPalette;
}) {
  const address = kitchenAddress(offer);
  const prepLabel = kitchenPrepLabel(offer, orderType);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="rounded-2xl p-3"
      style={{
        borderWidth: active ? 2 : differentKitchen ? 1.5 : 1,
        borderColor: active ? tone.accent : differentKitchen ? colors.warn : colors.border,
        borderStyle: differentKitchen && !active ? 'dashed' : 'solid',
        backgroundColor: active ? tone.soft : colors.card,
        opacity: ok ? 1 : 0.6,
      }}>
      <View className="flex-row items-center gap-3">
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="label" style={{ color: tone.accent }}>
            {offer.kitchenName.charAt(0)}
          </AppText>
        </View>
        <View className="min-w-0 flex-1" style={{ gap: 4 }}>
          {/* Name + fulfillment pills, price on the right; name truncates first. */}
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-row items-center gap-1.5" style={{ flexShrink: 1, minWidth: 0 }}>
              <AppText variant="label" style={{ color: colors.ink, flexShrink: 1 }} numberOfLines={1}>
                {offer.kitchenName}
              </AppText>
              <FulfillmentPills modes={offer.kitchenFulfillmentModes} colors={colors} />
            </View>
            <AppText variant="label" weight="bold" style={{ color: colors.ink, flexShrink: 0 }}>
              {formatINR(offer.price)}
            </AppText>
          </View>
          {/* Address on the left, selection radio on the right; `flex: 1` on the
              address claims space up to the radio before truncating. */}
          <View className="flex-row items-center gap-2" style={{ justifyContent: address ? 'space-between' : 'flex-end' }}>
            {address ? (
              <AppText variant="caption" style={{ color: colors.mutedLine, flex: 1 }} numberOfLines={1}>
                {address}
              </AppText>
            ) : null}
            <View
              style={{
                width: 19,
                height: 19,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: active ? tone.accent : colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
              {active ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: tone.accent }} /> : null}
            </View>
          </View>
          {/* Prep text on its own row, black + bold. */}
          {prepLabel ? (
            <AppText variant="caption" weight="bold" style={{ color: colors.ink }} numberOfLines={1}>
              {prepLabel}
            </AppText>
          ) : null}
          {/* Why this row isn't selectable, or a heads-up that tapping it will
              adjust the quantity. */}
          {!ok ? (
            <AppText variant="caption" style={{ color: colors.warn }} numberOfLines={1}>
              {offer.blockReason || 'Not eligible right now'}
            </AppText>
          ) : qtyInsufficient ? (
            <AppText variant="caption" style={{ color: colors.warn }} numberOfLines={1}>
              Serves only {offer.availableQty} of this {orderType === 'advance' ? `for ${offerDayLabel(offer.itemServingDate)}` : 'today'} — tapping will lower your quantity
            </AppText>
          ) : differentKitchen ? (
            <AppText variant="caption" style={{ color: colors.warn }} numberOfLines={1}>
              Different kitchen from your current order — adding this starts a new one
            </AppText>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

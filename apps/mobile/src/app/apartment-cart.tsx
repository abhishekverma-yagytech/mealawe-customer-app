import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ComponentType, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { BillRow } from '@/components/ui/BillRow';
import { Button } from '@/components/ui/Button';
import { DietMark } from '@/components/ui/DietMark';
import { LoginRequiredScreen } from '@/components/ui/LoginRequiredScreen';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconCheckCircle,
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconComplaint,
  IconInfo,
  IconMapPin,
  IconPhone,
  IconTicket,
  IconUtensils,
  IconWallet,
  type IconProps,
} from '@/components/ui/icons';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { Toggle } from '@/components/ui/Toggle';
import { STORAGE_KEYS } from '@/config';
import {
  loadApartmentAdvanceMenu,
  loadEligibleKitchens,
  loadKitchenAddress,
  loadOrderableMealTypes,
  loadOrdersByParent,
  parseApartmentOrderError,
  quoteApartmentOrder,
  startApartmentPayment,
  type ApartmentQuote,
} from '@/features/apartment/api';
import { buildApartmentBucketBill, buildApartmentBucketDeliveryBreakdown, buildApartmentGroupBill, ZERO_GST_CONFIG } from '@/features/apartment/bill';
import { loadApartmentCatalog } from '@/features/apartment/catalog';
import { ApartmentConflictModal } from '@/features/apartment/components/ApartmentConflictModal';
import { loadApartmentConfig, type ApartmentConfig } from '@/features/apartment/config';
import { apartmentOrderReadyLabel, apartmentOrderStatusColor, apartmentOrderStatusLabel } from '@/features/apartment/orderStatus';
import { cartLineForDish, cheapestOfferFor, dayLabel, DEFAULT_INSTANT_PREP_MINUTES, dishKeyFor, formatHHmm, formatHour12, formatHourLabel, groupCartLines, isDishBlocked, isoForDay, isPastNextDayCutoffHour, ORDER_TYPE_LABEL, todayIso } from '@/features/apartment/pricing';
import type { AdvanceDeliverySlot, ApartmentCartLine, ApartmentDish, ApartmentOrder, MealType, OrderType } from '@/features/apartment/types';
import { useActiveOrdersStore } from '@/features/apartment/useActiveOrdersStore';
import { useApartmentAdvanceSlotWindow } from '@/features/apartment/useApartmentAdvanceSlotWindow';
import { useApartmentCartStore } from '@/features/apartment/useApartmentCartStore';
import { useApartmentTodayPrepEndTime } from '@/features/apartment/useApartmentTodayPrepEndTime';
import { useSelectedOrderStore } from '@/features/apartment/useSelectedOrderStore';
import { requireLogin } from '@/features/auth';
import { useBalances } from '@/features/wallet';
import { customerLocationFrom } from '@/services/payment';
import { kvStorage } from '@/services/storage/kvStore';
import { useAuthStore, useLocationStore } from '@/store';
import { accentTint, palette, shadow, useApartmentColors } from '@/theme';
import { formatINR } from '@/utils/currency';

/** Locally-remembered wing/room text — independent of (and a fallback
 * for) the "saved address already has these" auto-fill/lock path below.
 * Covers the resident who never filled these into their saved address but
 * still shouldn't have to retype them on every single visit to this
 * screen. */
interface SavedFlatDetails {
  wingName: string;
  roomNumber: string;
}

/** Fallback used ONLY before `loadApartmentConfig()` has resolved (or if it
 * fails outright) — mirrors config.ts's own `DEFAULT_CONFIG.
 * defaultDeliveryChargeByOrderType` so a bill computed in that brief window
 * never differs from what the same screen shows a moment later once the
 * real config lands. */
const DEFAULT_DELIVERY_CHARGE_BY_ORDER_TYPE: Record<OrderType, number> = { instant: 30, today: 30, advance: 30 };


interface GroupResult {
  key: string;
  orderType: OrderType;
  mealType: string | null;
  /** Bug fix: a group with no mealType (Instant) had nothing else to
   * show on the results screen, so a failed one rendered the bare word
   * "Order" — indistinguishable from any other failed group and useless
   * for telling which item(s) actually failed. Captured at push time so
   * the failure row can name the dish(es) instead. */
  itemNames: string[];
  status: 'success' | 'failed';
  order?: ApartmentOrder;
  errorMessage?: string;
  /** Bug fix (product report, 2026-09-02 — "this message clearly says
   * payment succeeded without payment which will lead to customer
   * confusion"): a real, distinct outcome from an ordinary "failed, nothing
   * happened" result — the JusPay charge went through but the order record
   * itself never got created server-side (a rare race, see this flag's own
   * set-site comment). Kept as its own explicit flag rather than string-
   * matching `errorMessage` for "Payment succeeded" — fragile, and the ONE
   * place that actually needs to know this happened (the results header
   * above) shouldn't have to parse prose to find out. Drives the header's
   * own copy so it can never again claim "Nothing placed" in the exact
   * breath a per-item message says a payment went through. */
  chargedButNotPlaced?: boolean;
}

/** Builds the combined itemList for one payment bucket — shared between the
 * live preview-quote effect and the real placement call in
 * `placeAllOrders`, so both always send the EXACT same shape. Any drift
 * between them would just reintroduce the "cart shows one number, JusPay
 * charges another" bug this quote mechanism exists to close for good.
 *
 * `advanceMealType` (product instruction — "add payment process to Advance,
 * keep flow same as Today/Instant"): Advance now places through the same
 * `startApartmentPayment` call Today/Instant use, which has no top-level
 * whole-order `mealType` field of its own — the resident's one delivery-slot
 * pick is stamped onto every Advance line here instead, the exact same
 * convention Today's own per-dish `mealType` already uses. Every Advance
 * offer's own `offer.mealType` is always `undefined` (Advance items carry no
 * per-item mealType — see `ApartmentMenuFoodItem`'s own comment), so this is
 * a straight override, never a fallback-vs-real-value ambiguity. */
function buildBucketItemList(bucketGroups: { orderType: OrderType; lines: ApartmentCartLine[] }[], advanceMealType?: MealType | null) {
  return bucketGroups.flatMap((g) =>
    g.lines.map((l) => ({
      _id: l.offer.itemId,
      itemId: l.offer.itemId,
      itemName: l.dishName,
      itemPrice: l.offer.price,
      count: l.count,
      // Product instruction (2026-09-01 — payload-completeness pass against
      // the "Resident App Implementation Guide"): the cart line only ever
      // tracked veg/non-veg as a plain boolean (`isVeg`), which folds Jain
      // into "veg" the same way `mergeDailyItems` itself does (see
      // `ApartmentDish.isVeg`'s own derivation) — so this is a best-effort
      // 'Veg'/'NonVeg', never able to distinguish a genuine Jain item from
      // plain Veg. Still strictly better than sending nothing.
      itemType: l.isVeg ? 'Veg' : 'NonVeg',
      mealType: g.orderType === 'advance' ? (advanceMealType ?? undefined) : l.offer.mealType,
      imageUrl: l.imageUrl,
      preparationTime: l.offer.preparationTime,
      // Root-cause fix (product instruction, 2026-09-01 — "check kitchen
      // data is sending correct"): this used to send the CART-LEVEL
      // `meta.kitchenId` for every single line, rather than each line's own
      // `offer.kitchenId` — always the same value TODAY, since the cart
      // enforces one kitchen per cart (`checkKitchenConflict`/R2/U6) and
      // `addLine` always sets `meta.kitchenId` from the just-added offer's
      // own kitchen. But it was an ASSUMED invariant, not something this
      // function actually verified — a per-line field should describe that
      // line's own real kitchen directly, not infer it from cart-wide state
      // that happens to agree today. No behavior change for any currently-
      // valid cart; only matters if that invariant is ever violated by a
      // future bug, in which case this now fails correctly (sends the
      // wrong item under the RIGHT kitchen) instead of silently (sends the
      // right item under the WRONG kitchen).
      kitchenId: l.offer.kitchenId,
      isStandardMenu: l.offer.source === 'standard' ? true : undefined,
      // Root-cause fix (product instruction, 2026-08-31 — "check the data
      // for posting Order is sending correctly"): this used to only stamp
      // `standingType` on STANDING (shared-catalog) offers — but the
      // server's own combined Today+Instant checkout grouping
      // (`apartmentOrderGrouping.util.js#groupCartItems`) buckets an item
      // into the Instant group by `item.standingType === 'instant'` alone,
      // with NO fallback to `isStandardMenu`/mealType/anything else. A
      // kitchen's own DAILY dated item tagged Instant (`offer.source ===
      // 'daily'`, the common case — most Instant items are this, not a
      // shared-catalog opt-in) used to leave `standingType` undefined, so
      // the server silently miscategorized it into the `apartment_today`
      // group instead (keyed on whatever incidental `mealType` the item
      // happened to carry) — wrong cutoff check (`assertWithinTodayCutoff`
      // instead of `assertInstantWindowOpen`), wrong delivery-charge
      // config variable, and — since the client then looks for a returned
      // child order with `orderType === 'instant'`, never `'today'` — a
      // silent "payment succeeded, but this item could not be placed"
      // false-failure with no active-order rib ever tracked for it. Keys
      // off the GROUP's orderType now (what the resident actually chose),
      // never the offer's source — `isStandardMenu` right above is the
      // one field that's still correctly source-based (it drives the
      // server's separate standing-vs-daily stock/validation split, which
      // already handles this correctly either way).
      standingType: g.orderType === 'today' ? undefined : g.orderType,
      itemServingDate: l.offer.itemServingDate,
    })),
  );
}

export default function ApartmentCartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const address = useLocationStore((s) => s.current);
  // Root-cause fix: this whole screen used to read the Apartment feature's
  // own palette directly — fixed light-mode hex with no dark-mode
  // counterpart — so it stayed on its light cream/white surfaces even after
  // the app was switched to dark mode. `colors`/`orderTypeColors` below
  // replace every such reference in this file with their theme-aware
  // equivalents.
  const { colors, orderType: orderTypeColors } = useApartmentColors();

  const lines = useApartmentCartStore((s) => s.lines);
  const meta = useApartmentCartStore((s) => s.meta);
  const pickup = useApartmentCartStore((s) => s.pickup);
  const setLineCount = useApartmentCartStore((s) => s.setLineCount);
  const togglePickup = useApartmentCartStore((s) => s.togglePickup);
  const setPickup = useApartmentCartStore((s) => s.setPickup);
  const advanceDeliverySlot = useApartmentCartStore((s) => s.advanceDeliverySlot);
  const setAdvanceDeliverySlot = useApartmentCartStore((s) => s.setAdvanceDeliverySlot);
  const addLine = useApartmentCartStore((s) => s.addLine);
  const reset = useApartmentCartStore((s) => s.reset);
  // Bug fix (product instruction — "make sure do not allow any loophole to
  // [combine] advance from anywhere"): this screen's own "Add more from this
  // kitchen" button (below) calls `addLine` directly, same as every other
  // add path in this feature — `addLine` already raises `conflict`
  // internally (kitchen OR order-type mismatch, see
  // `useApartmentCartStore#checkKitchenConflict`) as the one structural
  // backstop nothing can bypass. This screen used to never read `conflict`
  // at all, so if that ever fired here the add would correctly still be
  // BLOCKED (no silent combining), but the resident would see nothing
  // happen at all instead of the explanatory prompt — same modal
  // `ApartmentHome.tsx` already renders for its own add paths.
  const conflict = useApartmentCartStore((s) => s.conflict);
  const startNewOrderFromConflict = useApartmentCartStore((s) => s.startNewOrder);
  const dismissConflict = useApartmentCartStore((s) => s.dismissConflict);

  // A cart/checkout session can now hold multiple order types from the same
  // kitchen (product decision — see ApartmentCartLine's own comment), so
  // anything that needs "what type(s) is this cart actually for" reads this
  // instead of the single, no-longer-authoritative `meta.orderType`. Moved
  // up here (rather than nearer where it's mostly read, further down) so
  // the "Add more from kitchen" effect below — which needs it too, and
  // runs before this component's early returns — can use it directly
  // rather than through some other indirection.
  const distinctOrderTypes = [...new Set(lines.map((l) => l.orderType))];

  // Seeded from the resident's saved address when it already has these —
  // filled in once on the address form (AddressForm.tsx) rather than
  // re-typed at every single checkout, which was the actual gap being
  // patched before this existed (free-text fields with nothing to read
  // from). Falls back to blank, editable fields when the address predates
  // this or the resident chose not to fill them in there.
  const [wingName, setWingName] = useState(
    () => address?.wingName ?? kvStorage.getObject<SavedFlatDetails>(STORAGE_KEYS.apartmentCartAddress)?.wingName ?? '',
  );
  const [roomNumber, setRoomNumber] = useState(
    () => address?.roomNumber ?? kvStorage.getObject<SavedFlatDetails>(STORAGE_KEYS.apartmentCartAddress)?.roomNumber ?? '',
  );
  const flatDetailsLocked = !!address?.wingName && !!address?.roomNumber;
  // Product decision: persisting on every keystroke (the previous
  // behavior) is now an explicit "Save"/"Update" tap instead (see the
  // Delivery details card below) — `savedFlatDetails` is what's actually on
  // disk right now, so the button can tell whether there's anything unsaved
  // to write (and label itself "Update" once something already is saved).
  const [savedFlatDetails, setSavedFlatDetails] = useState(
    () => kvStorage.getObject<SavedFlatDetails>(STORAGE_KEYS.apartmentCartAddress) ?? null,
  );
  const flatDetailsDirty = wingName.trim() !== (savedFlatDetails?.wingName ?? '') || roomNumber.trim() !== (savedFlatDetails?.roomNumber ?? '');
  function saveFlatDetails(): void {
    const next = { wingName: wingName.trim(), roomNumber: roomNumber.trim() };
    kvStorage.setObject<SavedFlatDetails>(STORAGE_KEYS.apartmentCartAddress, next);
    setSavedFlatDetails(next);
  }
  const [config, setConfig] = useState<ApartmentConfig | null>(null);
  const [staleGroups, setStaleGroups] = useState<Set<string>>(new Set());
  const [kitchenStale, setKitchenStale] = useState(false);
  // Bug fix: every buildApartmentGroupBill call below used to pass `undefined`
  // here unconditionally, so the bill this screen shows — and, critically,
  // the wallet redemption cap computed FROM it — always fell back to the
  // generic platform default delivery charge, never this kitchen's own real
  // apartmentSettings.deliveryCharge override. The server's own
  // deliveryChargeService.computeDeliveryCharge reads that SAME override
  // when actually pricing the order — so whenever a kitchen has one set
  // (and it differs from the platform default), this screen under/over-
  // estimated the real bill by that delta. Invisible on the old no-payment
  // path (the server just recorded whatever it computed), but very visible
  // now that Today/Instant route through JusPay: a resident who set
  // Mealawe Wallet to fully cover THIS screen's total could still see the
  // payment gateway open for a small leftover, because the server's real
  // payableAmount came in higher than the wallet amount they'd sent.
  // Captured from the SAME loadEligibleKitchens call the staleness check
  // below already makes — no extra fetch needed, just not discarding the
  // rest of what it returns.
  const [kitchenDeliveryCharge, setKitchenDeliveryCharge] = useState<number | null>(null);
  // Root-cause fix ("kitchen shows delivery even though only pickup is
  // configured"): the toggle-gating below used to read `kitchenFulfillmentModes`
  // off each cart LINE's `offer` — a snapshot taken at add-to-cart time. If a
  // kitchen's fulfillment settings change AFTER an item is already in the
  // cart (the exact scenario this whole U17 revalidation block exists for —
  // see its own comment), that snapshot goes stale and the gating silently
  // keeps enforcing the OLD modes. Sourced from the SAME live
  // `loadEligibleKitchens` call below, same staleness fix as
  // `kitchenDeliveryCharge` right above it.
  const [kitchenFulfillmentModes, setKitchenFulfillmentModes] = useState<
    Partial<Record<OrderType, { deliveryEnabled: boolean; pickupEnabled: boolean }>>
  >({});
  // Advance-only (product instruction, 2026-09-02 — "select delivery
  // slot"): the cart's committed kitchen's own enabled Advance delivery
  // windows, live-fetched fresh (same staleness reasoning as
  // `kitchenDeliveryCharge`/`kitchenFulfillmentModes` right above), but a
  // SEPARATE source — see AdvanceDeliverySlot's own comment: this comes
  // from `loadApartmentAdvanceMenu`'s per-kitchen `advanceDeliverySlots`
  // (per the "Apartment Orders API Reference" doc, 2 Sep 2026), NOT
  // `apartmentSettings.advanceSubTypes` off `loadEligibleKitchens`'s
  // aggregation-pipeline response — that pipeline reads RAW stored
  // documents (Mongoose schema defaults never apply to a plain `.aggregate()`
  // read the way they do to a hydrated `.find()`/`.findOne()` document), so
  // any kitchen that hasn't re-saved its settings since `advanceSubTypes`
  // shipped could come back with the field simply absent — exactly
  // reproducing "not able to select delivery slot" for real kitchens.
  // `undefined` until the fetch below first resolves, or when the cart has
  // no Advance group at all.
  const [advanceDeliverySlots, setAdvanceDeliverySlots] = useState<AdvanceDeliverySlot[] | undefined>(undefined);
  const [pairs, setPairs] = useState<ApartmentDish[]>([]);
  const [placing, setPlacing] = useState(false);
  // Bill details is now collapsible — exact structural change from the
  // Claude Design's own updated `Apartment Prototype.dc.html`
  // (`toggleBill`/`billOpen`/`billHint`/`billChevStyle`/`billBodyStyle`),
  // same collapsed-by-default "Total Bill" pattern Subscription's own
  // cart.tsx already established (`billOpen`, tap-to-expand chevron).
  const [billOpen, setBillOpen] = useState(false);
  // Reverted from a popup back to an inline accordion (product instruction,
  // 2026-09-02 — see the GST row's own comment further down for the full
  // story) — nested inside the already-collapsible Bill Details section,
  // same tap-to-expand convention `billOpen` above already uses, one level
  // deeper.
  const [gstBreakupOpen, setGstBreakupOpen] = useState(false);
  const [results, setResults] = useState<GroupResult[] | null>(null);

  // Product instruction: a short "Your Order placed successfully" entrance
  // animation plays FIRST on a clean success, THEN the existing results
  // page (checkmark/"Order placed"/ribs/etc., unchanged) reveals — purely a
  // smoother hand-off into that same page, not a new destination. Only for
  // the all-succeeded case; a partial/total failure goes straight to its
  // own (already-existing) "Some orders need attention" content, no
  // celebratory animation to skip past.
  const [successPhase, setSuccessPhase] = useState<'intro' | 'done'>('intro');
  // Render-time reset (NOT an effect) — a retry ("Try again") can produce a
  // SECOND successful `results` later in this same mount, after
  // `successPhase` already settled on 'done' from the first one; this needs
  // to already read 'intro' again before that next render paints anything,
  // which is exactly what adjusting state during render (compared against
  // the previous `results` reference) gives, vs. a `useEffect` doing the
  // same reset only AFTER an extra commit.
  const [lastResultsForPhase, setLastResultsForPhase] = useState<GroupResult[] | null>(null);
  if (results !== lastResultsForPhase) {
    setLastResultsForPhase(results);
    if (results && results.every((r) => r.status === 'success')) {
      setSuccessPhase('intro');
    }
  }
  const introOpacity = useSharedValue(0);
  const introScale = useSharedValue(0.6);
  const pageOpacity = useSharedValue(0);
  // Kicks off the intro's own entrance the moment a fresh all-success
  // `results` lands, and schedules the hand-off to 'done' — the ONLY
  // setState call in this effect body is inside the timer's callback, never
  // synchronous at the top level.
  useEffect(() => {
    if (!results || results.some((r) => r.status !== 'success')) return;
    introOpacity.value = 0;
    introScale.value = 0.6;
    introOpacity.value = withTiming(1, { duration: 240 });
    introScale.value = withSpring(1, { damping: 12, stiffness: 160 });
    const t = setTimeout(() => setSuccessPhase('done'), 1300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);
  // The results page's own fade-in — kept in its OWN effect, keyed on
  // `successPhase` rather than mutated from `skipIntro` below too: a shared
  // value should only ever be written from inside an effect, never split
  // between an effect and a plain event handler for the same value.
  useEffect(() => {
    if (successPhase === 'done') pageOpacity.value = withTiming(1, { duration: 260 });
    else pageOpacity.value = 0;
  }, [successPhase, pageOpacity]);
  const introAnimStyle = useAnimatedStyle(() => ({ opacity: introOpacity.value, transform: [{ scale: introScale.value }] }));
  const pageAnimStyle = useAnimatedStyle(() => ({ opacity: pageOpacity.value }));
  // Tapping the intro skips straight to the results page — frictionless for
  // a resident who doesn't want to wait out the animation.
  function skipIntro(): void {
    setSuccessPhase('done');
  }

  // Shown below the kitchen's name on this screen — the Claude Design's own
  // kitchen-info card shape: "{wing/tower}, {apartment name} · {cuisine}"
  // (`orderKitchenAddr: kObj.tower + ', ' + apartmentName + ' · ' +
  // kObj.cuisine` in the design's own script) — data every cart line's own
  // offer already carries (`kitchenWingName`/`kitchenRoomNumber`/
  // `kitchenCuisine`), no fetch needed for THIS line.
  const firstOffer = lines[0]?.offer;
  const kitchenWingBlock =
    firstOffer?.kitchenWingName && firstOffer?.kitchenRoomNumber
      ? `${firstOffer.kitchenWingName} · ${firstOffer.kitchenRoomNumber}`
      : firstOffer?.kitchenWingName || firstOffer?.kitchenRoomNumber || undefined;
  const kitchenAddressLine = (() => {
    const head = [kitchenWingBlock, meta?.apartmentName].filter(Boolean).join(', ');
    return [head, firstOffer?.kitchenCuisine].filter(Boolean).join(' · ');
  })();
  // Product instruction: show the kitchen's real, full street address too
  // (not just the wing/apartment-name summary above) — the SAME generic
  // `GET /api/getKitchenPartner/:id` lookup On Demand's own
  // `loadKitchenProfile` already uses, re-enabled here for exactly this.
  const [kitchenFullAddress, setKitchenFullAddress] = useState<string | null>(null);
  useEffect(() => {
    if (!meta?.kitchenId) {
      setKitchenFullAddress(null);
      return;
    }
    let active = true;
    loadKitchenAddress(meta.kitchenId).then((addr) => {
      if (active) setKitchenFullAddress(addr);
    });
    return () => {
      active = false;
    };
  }, [meta?.kitchenId]);
  // Resident's own OWN delivery address, for the "Delivery details" card
  // (distinct from `kitchenAddressLine` above, which describes the
  // KITCHEN) — `address.location` is always present (the human-formatted
  // area label); `address`/`landmark`/`pincode` are additive when set.
  const fullAddressLine = address ? [address.address, address.location, address.landmark, address.pincode].filter(Boolean).join(', ') : undefined;

  useEffect(() => {
    void loadApartmentConfig().then(setConfig);
  }, []);

  // Mealawe Wallet — an opt-in toggle, same redemption model Subscription's
  // own checkout (`cart.tsx`) uses. Declared up here (BEFORE this
  // component's early returns further down) — hooks can't follow a
  // conditional return.
  //
  // Root-cause fix (product instruction — "add payment process to Advance,
  // keep flow same as Today/Instant"): Mealawe Cashback used to also be
  // redeemable here, but ONLY safe to apply to an Advance bucket — the one
  // order type that never went through JusPay, so nothing needed to
  // subtract it from a gateway charge (see `startApartmentPayment`'s own
  // doc comment for why cashback can't safely apply to a JusPay-gated
  // bucket). Now that Advance places through that same JusPay-gated path
  // too, there's no order type left on this screen cashback could safely
  // apply to — removed entirely (`applyCashback`/`advanceSubtotal`/
  // `cashbackUsed` and the "Use Mealawe Cashback" toggle are all gone) —
  // this screen still reads `useBalances()` for wallet alone.
  const { wallet: walletBalanceStr, refresh: refreshBalances } = useBalances();
  const walletBalance = Math.max(0, Number(walletBalanceStr) || 0);
  const [applyWallet, setApplyWallet] = useState(false);
  // Product instruction — "when user enters cart call wallet API to get
  // latest value": `useBalances()` already fetches once on mount, which
  // covers a fresh push onto this stack route today, but a resident can
  // spend wallet elsewhere (another order, another device) between visits —
  // `useFocusEffect` re-fetches every time this screen GAINS focus, not just
  // the first time it mounts, so the balance shown is never stale-by-
  // navigation regardless of how this screen is reached or kept around.
  useFocusEffect(
    useCallback(() => {
      refreshBalances();
    }, [refreshBalances]),
  );

  // Bug fix (product instruction, 2026-08-31 — "prep time is not taking"):
  // this used to ask the server for a SEPARATE "tentative fulfilment"
  // estimate here (`loadInstantFulfillmentEstimate`) and let THAT take
  // priority over each line's own `preparationTime` whenever it resolved.
  // Same root cause as ApartmentAddSheet.tsx's own identical fix (see its
  // comment) — that endpoint predates the "new buy/sell flow" merged-menu
  // pivot and was never confirmed to look items up against the collection
  // `getApartmentInstantMenu` now reads from, so it could silently mask a
  // real per-line `preparationTime` the merged fetch already got right.
  // `instantLines` still needs to live up here (before this component's
  // early returns further down) purely so `localMaxPrep`'s own declaration
  // point, later in the file, doesn't have to move — hooks can't follow a
  // conditional return, but this is now a plain derived value, not a hook.
  const instantLines = lines.filter((l) => l.orderType === 'instant');

  const groups = useMemo(() => groupCartLines(lines), [lines]);

  // Bug fix: wing/room used to be optional with no gate on placement — a
  // delivery order with neither has nowhere to deliver to, so both are
  // required before "Place order" is enabled (declared once here so the
  // render below and placeAllOrders' own guard read the same check).
  //
  // Bug fix (product report, 2026-09-03 — self-pickup carts shouldn't
  // require wing/flat): when EVERY group is self-pickup there's nowhere
  // for wing/flat to matter. Still required if even one group is delivery,
  // or while `groups` is empty / `pickup` hasn't resolved yet (fail safe).
  const allPickup = groups.length > 0 && groups.every((g) => !!pickup[g.key]);
  const flatDetailsMissing = !allPickup && (!wingName.trim() || !roomNumber.trim());

  // Product instruction: a slot's pickup/delivery choice should only be a
  // resident-editable TOGGLE when the kitchen actually supports BOTH modes
  // for that slot's order type (`kitchenFulfillmentModes`, already threaded
  // onto every offer by pricing.ts and already used to gate
  // ApartmentAddSheet/ApartmentDishCard's own delivery copy) — otherwise the
  // slot should just show, fixed, whichever ONE mode the kitchen actually
  // offers. Self-corrects the STORED `pickup` value too, not just what
  // renders below — a pickup-only kitchen's slot must actually check out as
  // pickup, not merely display a locked "Self-Pickup" row while still
  // secretly carrying whatever `pickup[group.key]` happened to default to
  // (`false`/delivery), which is exactly how this used to silently send the
  // wrong `fulfillmentMode` — and the wrong delivery charge alongside it —
  // at checkout. `undefined` modes (no fulfillment data) fails open, same
  // convention as `fulfillmentModeLabel` elsewhere.
  useEffect(() => {
    for (const group of groups) {
      // Live-fetched (see kitchenFulfillmentModes' own comment) preferred;
      // falls back to this group's own cart-line snapshot only for the brief
      // gap before the live fetch above first resolves.
      const modes = kitchenFulfillmentModes[group.orderType] ?? group.lines[0]?.offer.kitchenFulfillmentModes;
      if (!modes || modes.deliveryEnabled === modes.pickupEnabled) continue;
      const forced = modes.pickupEnabled;
      if (!!pickup[group.key] !== forced) setPickup(group.key, forced);
    }
  }, [groups, pickup, setPickup, kitchenFulfillmentModes]);

  // Product instruction: "if I'm ordering 4 items from Today and Instant,
  // all payment should go from one payment, not separate" — Today and
  // Instant both route through the SAME ApartmentParentOrder/JusPay flow,
  // which explicitly supports combining several (orderType, mealType)
  // groups into ONE checkout/JusPay session (see
  // apartmentParentOrder.service.js's own "Path unification" design) — this
  // screen was just never using that, calling the payment step once PER
  // GROUP instead of once per combinable set. Bucketed by pickup/delivery
  // choice because the server resolves exactly ONE fulfillmentMode per
  // orderType per call — groups that genuinely differ there (e.g. Breakfast
  // delivery + Lunch pickup) still need separate calls, that's a real
  // fulfilment difference, not the bug being fixed.
  //
  // Advance (as of "add payment process to Advance, keep flow same as
  // Today/Instant") ALSO places through this same JusPay-gated mechanism
  // now — it just stays its OWN bucket below, never combined into the same
  // payment as a Today/Instant bucket (a different itemServingDate/whole-
  // order mealType/cutoff ruleset makes combining a materially bigger,
  // separate change — out of scope here). "Same flow" means the same
  // payment MECHANISM (quote → JusPay-for-the-remainder, or a direct
  // wallet-covered placement), not a shared transaction across types.
  const paymentBuckets = useMemo(() => {
    const todayInstant = groups.filter((g) => g.orderType === 'today' || g.orderType === 'instant');
    const singleton = groups.filter((g) => g.orderType !== 'today' && g.orderType !== 'instant');
    const byPickup = new Map<boolean, typeof groups>();
    for (const g of todayInstant) {
      const isPickup = !!pickup[g.key];
      const list = byPickup.get(isPickup) ?? [];
      list.push(g);
      byPickup.set(isPickup, list);
    }
    const combined = Array.from(byPickup.entries()).map(([isPickup, bucketGroups]) => ({
      key: `combined|${isPickup ? 'pickup' : 'delivery'}`,
      isPickup,
      groups: bucketGroups,
    }));
    // Advance stays one-bucket-per-UI-group — same shape, just never
    // combined with anything else, so the rest of this screen's logic can
    // treat every bucket uniformly regardless of type.
    const singletons = singleton.map((g) => ({ key: g.key, isPickup: !!pickup[g.key], groups: [g] }));
    return [...combined, ...singletons];
  }, [groups, pickup]);

  // Root-cause fix for "cart shows one amount, JusPay charges another":
  // this screen's own bill math (buildApartmentGroupBill/
  // buildApartmentBucketBill) is necessarily an ESTIMATE, and estimates keep
  // drifting from the server's real total in ways that only surface once
  // the payment gateway opens for an unexpected amount. Rather than patch
  // each drift as it's found, this fetches the REAL server-computed price —
  // same pricing function the payment call itself uses — for every
  // JusPay-gated bucket and uses THAT for display everywhere a total is
  // shown (see `bucketTotal`/`bucketDelivery` below), not just at the
  // wallet-capping step in `placeAllOrders`. Root-cause fix (product
  // instruction — "add payment process to Advance, keep flow same as
  // Today/Instant"): Advance used to be excluded here (it never touched the
  // gateway, so its own estimate was the only number that could ever be
  // shown) — now that it places through the same JusPay-gated path, it gets
  // a real quote too, same as every other bucket. `null`/missing entries
  // fall back to the estimate, never block rendering.
  const [bucketQuotes, setBucketQuotes] = useState<Record<string, ApartmentQuote>>({});
  useEffect(() => {
    if (!meta || !profile) {
      setBucketQuotes({});
      return;
    }
    const quotableBuckets = paymentBuckets;
    if (quotableBuckets.length === 0) {
      setBucketQuotes({});
      return;
    }
    // Bug fix (product report, 2026-09-02 — "toggle to self-pickup and back
    // to delivery... instead of ₹35 it added a random number around ₹300 or
    // ₹400, then after ~1 sec caught the correct price — check this on
    // priority"): a bucket's own `key` is just `combined|delivery` /
    // `combined|pickup` (or one group's own key for a singleton) — stable
    // across a pickup/delivery TOGGLE even though the actual GROUPS inside
    // it change (toggling one type moves it into/out of that bucket). This
    // fetch is async, and `bucketQuotes` (which `bucketTotal`/
    // `bucketDelivery` above PREFER over the live estimate) used to stay
    // exactly as it was — from the PRE-toggle bucket composition — for the
    // whole round trip. So the instant you toggled, the screen kept showing
    // a real, but now-STALE, server quote for a completely different set of
    // items/types that happened to reuse the same key — not an estimate,
    // a genuinely wrong CACHED total — until this fetch resolved and
    // overwrote it a moment later. Clearing synchronously here means that
    // gap now falls back to `bucketTotal`/`bucketDelivery`'s own live
    // ESTIMATE (computed fresh from the CURRENT cart/pickup state every
    // render, always right for what's actually in the cart right now) —
    // visibly a quick, correct-either-way refinement instead of a
    // wrong-then-right flash.
    setBucketQuotes({});
    let active = true;
    Promise.all(
      quotableBuckets.map((b) => {
        // Same GST/platform-charge fields `placeAllOrders`'s own quote call
        // sends — see that call site's own comment. Without these this
        // effect's quote (which `bucketTotal`/`bucketDelivery` above prefer
        // for every pre-checkout display) would keep coming back with no
        // GST, understating the bill right up until placement.
        const bill = buildApartmentBucketBill(b.groups, b.isPickup, kitchenDeliveryCharge, config?.defaultDeliveryChargeByOrderType ?? DEFAULT_DELIVERY_CHARGE_BY_ORDER_TYPE, config ?? ZERO_GST_CONFIG);
        const primaryOrderType = b.groups[0].orderType;
        // Same "Advance uses its own picked T+1/T+2 date, everything else is
        // today" rule `placeAllOrders`'s own quote call uses below — a bucket
        // quoted with today's date for an Advance item would ask the server
        // to price/validate against the WRONG day's cutoff/capacity.
        const itemServingDate = primaryOrderType === 'advance' ? b.groups[0].lines[0]?.offer.itemServingDate : todayIso();
        return quoteApartmentOrder({
          apartmentId: meta.apartmentId,
          apartmentName: meta.apartmentName,
          wingName: wingName.trim(),
          roomNumber: roomNumber.trim(),
          customerLocation: address ? customerLocationFrom(address) : undefined,
          kitchenId: meta.kitchenId,
          kitchenName: meta.kitchenName,
          customerId: profile._id,
          customerName: profile.userName ?? '',
          customerPhoneNo: profile.phoneNo,
          orderType: primaryOrderType,
          itemServingDate,
          fulfillmentMode: b.isPickup ? 'pickup' : 'delivery',
          itemList: buildBucketItemList(b.groups, advanceDeliverySlot),
          platformCharges: bill.platformCharges,
          packagingCharges: bill.packagingCharges,
          cgst: bill.cgst,
          sgst: bill.sgst,
          deliveryChargesGST: bill.deliveryChargesGST,
          platformChargesGST: bill.platformChargesGST,
          packagingChargesGST: bill.packagingChargesGST,
        }).then((quote) => [b.key, quote] as const);
      }),
    ).then((entries) => {
      if (!active) return;
      const next: Record<string, ApartmentQuote> = {};
      for (const [key, quote] of entries) {
        if (quote) next[key] = quote;
      }
      setBucketQuotes(next);
    });
    return () => {
      active = false;
    };
    // wingName/roomNumber deliberately excluded — they're passthrough order
    // fields, never part of pricing, so a keystroke there shouldn't refire
    // this network call; the effect still sends whatever they currently are.
    //
    // Bug fix (product report, 2026-09-02 — "Taxes, GST, platform charges
    // are calculating but not adding in payable amount... after adding
    // another item it is showing"): `config`/`kitchenDeliveryCharge` used to
    // be missing from this array entirely. `loadApartmentConfig()` resolves
    // ASYNCHRONOUSLY (its own effect, elsewhere in this screen) — so on a
    // fresh cart open, THIS effect's very first run almost always fires
    // before `config` has loaded, sending the quote request with
    // `ZERO_GST_CONFIG`'s all-zero GST/platform-charge fields. That
    // zero-GST quote then got cached into `bucketQuotes` and — since this
    // effect never re-ran on its own — stayed the preferred, quote-wins
    // source `bucketTotal`/`grandTotal`/`payableTotal` all read from
    // indefinitely, even though `config` (and this screen's own Bill
    // Details rows, which never read the quote for GST/platform charges —
    // see `bucketPlatformAndTaxes`'s own comment) had since loaded the real
    // rates correctly. The payable total silently stayed GST-less until
    // something ELSE (an item add/qty change) happened to change
    // `paymentBuckets` and re-fire this effect for an unrelated reason —
    // exactly the "only updates after another change" symptom reported.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentBuckets, meta?.kitchenId, meta?.apartmentId, profile?._id, config, kitchenDeliveryCharge]);

  /** The real, quoted total for a bucket when available, else this screen's
   * own estimate — the SINGLE thing every bill display below reads, so the
   * number shown can never diverge from what `placeAllOrders` will actually
   * cap wallet against (see its own `realBucketTotal`, same quote call). */
  function bucketTotal(bucket: (typeof paymentBuckets)[number]): number {
    const quoted = bucketQuotes[bucket.key]?.payableAmount;
    if (typeof quoted === 'number') return quoted;
    return buildApartmentBucketBill(bucket.groups, bucket.isPickup, kitchenDeliveryCharge, config?.defaultDeliveryChargeByOrderType ?? DEFAULT_DELIVERY_CHARGE_BY_ORDER_TYPE, config ?? ZERO_GST_CONFIG).estimatedTotal;
  }

  /** Same idea, just the delivery-charge component alone (for the Bill
   * Details breakdown's per-bucket delivery row). */
  function bucketDelivery(bucket: (typeof paymentBuckets)[number]): number {
    const quoted = bucketQuotes[bucket.key]?.deliveryCharges;
    if (typeof quoted === 'number') return quoted;
    return buildApartmentBucketBill(bucket.groups, bucket.isPickup, kitchenDeliveryCharge, config?.defaultDeliveryChargeByOrderType ?? DEFAULT_DELIVERY_CHARGE_BY_ORDER_TYPE, config ?? ZERO_GST_CONFIG).estimatedDelivery;
  }

  /** Platform charge + GST components for one bucket (product instruction,
   * 2026-09-02 — real GST/platform-charge display, not the hardcoded ₹0
   * this used to show). Unlike `bucketTotal`/`bucketDelivery` above, this
   * always uses THIS screen's own config-driven estimate, never the
   * server's quote — `ApartmentQuote` folds GST straight into
   * `payableAmount` without ever breaking platformCharges/cgst/sgst back
   * out individually, so there's nothing to prefer here even once a real
   * quote is in. Same accepted-imprecision convention the multi-type
   * delivery breakdown above already documents: this sums to the same
   * total shown everywhere else in the normal case (no kitchen-override
   * drift), and is never what wallet capping or `grandTotal` itself is
   * computed from (those stay quote-preferring via `bucketTotal`). */
  function bucketPlatformAndTaxes(bucket: (typeof paymentBuckets)[number]): {
    platformCharges: number;
    packagingCharges: number;
    cgst: number;
    sgst: number;
    deliveryChargesGST: number;
    platformChargesGST: number;
    packagingChargesGST: number;
    taxes: number;
  } {
    const bill = buildApartmentBucketBill(bucket.groups, bucket.isPickup, kitchenDeliveryCharge, config?.defaultDeliveryChargeByOrderType ?? DEFAULT_DELIVERY_CHARGE_BY_ORDER_TYPE, config ?? ZERO_GST_CONFIG);
    return {
      platformCharges: bill.platformCharges,
      packagingCharges: bill.packagingCharges,
      cgst: bill.cgst,
      sgst: bill.sgst,
      deliveryChargesGST: bill.deliveryChargesGST,
      platformChargesGST: bill.platformChargesGST,
      packagingChargesGST: bill.packagingChargesGST,
      taxes: bill.taxes,
    };
  }

  // U17 — re-validate at checkout: a slot/kitchen that was eligible while
  // browsing can have gone stale by the time the resident reaches Cart.
  // Since a cart can now hold multiple order types (same kitchen), this
  // checks kitchen eligibility PER distinct type actually present, not
  // just once against a single cart-wide type — the kitchen could easily
  // still be eligible for Instant but have just closed for Today, and
  // that's a real, type-specific staleness the old single check would
  // have missed entirely for a mixed cart.
  useEffect(() => {
    if (!meta || !address?.geolocation) return;
    let active = true;
    const distinctTypes = [...new Set(groups.map((g) => g.orderType))];
    (async () => {
      const todayGroups = groups.filter((g) => g.orderType === 'today');
      if (todayGroups.length > 0) {
        const orderable = await loadOrderableMealTypes(meta.kitchenId);
        if (!active) return;
        const stale = new Set(todayGroups.filter((g) => g.mealType && !orderable.includes(g.mealType)).map((g) => g.key));
        setStaleGroups(stale);
      } else {
        setStaleGroups(new Set());
      }
      const eligibleByType = await Promise.all(
        distinctTypes.map((t) => loadEligibleKitchens(meta.apartmentId, t, address.geolocation!.lng, address.geolocation!.lat)),
      );
      if (!active) return;
      setKitchenStale(eligibleByType.some((eligible) => !eligible.some((k) => k._id === meta.kitchenId)));
      const matchedKitchen = eligibleByType.flat().find((k) => k._id === meta.kitchenId);
      setKitchenDeliveryCharge(
        typeof matchedKitchen?.apartmentSettings?.deliveryCharge === 'number' ? matchedKitchen.apartmentSettings.deliveryCharge : null,
      );
      setKitchenFulfillmentModes(matchedKitchen?.apartmentSettings?.fulfillmentModes ?? {});
      // See `advanceDeliverySlots`' own comment for why this is a SEPARATE
      // fetch from the eligible-kitchens call above, not read off
      // `matchedKitchen` — only actually needed when an Advance group is
      // present, so skipped entirely otherwise.
      if (distinctTypes.includes('advance')) {
        const advanceMenu = await loadApartmentAdvanceMenu(meta.apartmentId);
        if (!active) return;
        const allRows = advanceMenu ? [...advanceMenu.activeItems, ...advanceMenu.inactiveItems] : [];
        setAdvanceDeliverySlots(allRows.find((row) => row.kitchenId === meta.kitchenId)?.advanceDeliverySlots);
      } else {
        setAdvanceDeliverySlots(undefined);
      }
    })().catch((error) => {
      // Every awaited call above already swallows its own errors and
      // returns a safe fallback, so this should never fire — kept purely
      // as a defensive net so a future edit inside this IIFE can't turn
      // into a silent unhandled rejection.
      console.error('[apartment-cart] revalidation IIFE failed unexpectedly:', error);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.kitchenId, groups.length]);

  // "Add more from {kitchen}" upsell row — the kitchen's own ACTUAL menu
  // for whatever order type is already in the cart, not the narrow R20
  // same-item pairing suggestions (that's what the add-sheet's own "GOES
  // WELL WITH" is for — a DIFFERENT feature, kept as-is). Bug fix: this
  // used to reuse that same R20 pairing data here too (fetching
  // recommendations for each daily cart line and merging them) — real
  // pairing only ever surfaces items a kitchen explicitly configured as
  // "goes with X", which is often nothing at all, so this section read as
  // near-empty ("menus not showing from that kitchen") even though the
  // kitchen has a full menu the resident could easily add more from.
  // Reuses `loadApartmentCatalog` — the SAME already-verified pipeline the
  // browse screen's own grid is built from — scoped to just this one
  // kitchen via its `kitchenIds` filter (see catalog.ts/api.ts), so this is
  // never a second, differently-behaved menu-fetch path.
  useEffect(() => {
    const geo = address?.geolocation;
    if (!meta || !geo) {
      setPairs([]);
      return;
    }
    let active = true;
    Promise.all(
      distinctOrderTypes.map((t) => loadApartmentCatalog(meta.apartmentId, t, geo, { kitchenIds: [meta.kitchenId] })),
    ).then((catalogs) => {
      if (!active) return;
      // Excludes anything already in the cart — matched against `dish.key`
      // itself now (not a bare name), since `dishKeyFor` folds mealType
      // into the key for Advance (see its own comment in pricing.ts — the
      // Maggi-at-Breakfast-vs-Lunch-vs-Dinner fix). A bare-name-only
      // `inCart` set would never match an Advance `dish.key` again (which
      // still carries `|mealType`), silently breaking this dedup and
      // letting an already-in-cart Advance dish reappear here as if it
      // weren't — each line's OWN offer.mealType is the real source (same
      // one `dish.key` was built from on the merge side), not the
      // dish-level `mealType`, since a cart line only ever carries the
      // exact offer it was added from.
      //
      // Root-cause fix (product instruction, 2026-08-31 — "goes well with
      // showing added items which will not show"): this used to ALSO fold
      // mealType in for Today, which was correct before the 2026-08-30
      // cross-kitchen-dedup server rewrite but has been stale since —
      // Today's own `dishKeyFor` call site (`mergeDailyItems`) no longer
      // passes mealType at all (see its own comment), so a Today dish's
      // real `dish.key` here is bare-name-only. Still folding a mealType
      // in for Today produced a DIFFERENT key than the catalog's own
      // `dish.key` (e.g. `"maggi|breakfast"` vs the real `"maggi"`), so
      // `inCart.has(dish.key)` could never match — an already-in-cart
      // Today dish kept reappearing in this "Add more from kitchen" list
      // as if it weren't there at all.
      const inCart = new Set(lines.map((l) => dishKeyFor(l.dishName, l.orderType === 'advance' ? l.offer.mealType : undefined)));
      const seen = new Set<string>();
      const merged: ApartmentDish[] = [];
      for (const catalog of catalogs) {
        for (const dish of catalog.dishes) {
          if (inCart.has(dish.key) || seen.has(dish.key)) continue;
          seen.add(dish.key);
          merged.push(dish);
        }
      }
      setPairs(merged.slice(0, 6));
    })
      // Bug fix (product report, 2026-09-04 — expired-session API failures
      // surfacing as a full app "crash"): this `Promise.all` had no
      // `.catch()` — an uncaught rejection here (this "Add more from
      // kitchen" list is decoration, never worth losing the whole Cart
      // screen over) is what RN's rejection tracker turns into a blocking
      // dev error screen. Belt-and-suspenders with the `loadAdvanceCatalog`
      // fix in catalog.ts.
      .catch(() => {
        if (active) setPairs([]);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.kitchenId, meta?.apartmentId, address?.geolocation?.lat, address?.geolocation?.lng, lines]);

  // Product instruction, 2026-09-02 — "check cutoffs when user can order
  // advance for tomorrow": the add-sheet's own day picker already keeps a
  // resident from ADDING a new Tomorrow item once ADVANCE_NEXT_DAY_CUTOFF_
  // PASSED fires, but a resident who added one BEFORE the cutoff and
  // lingers in the cart past it needs the same re-check at placement time
  // every other staleness guard here already gets. A `Set` of affected
  // GROUP keys, same shape as `staleGroups` above, so "Remove affected
  // items" below can clear exactly these groups too, not just Today's.
  const advanceNextDayCutoffGroups = new Set(
    config === null
      ? []
      : groups
          .filter(
            (g) => g.orderType === 'advance' && g.lines[0]?.offer.itemServingDate?.slice(0, 10) === isoForDay(1) && isPastNextDayCutoffHour(1, config.advanceNextDayCutoffHour),
          )
          .map((g) => g.key),
  );
  const revalidateNeeded = staleGroups.size > 0 || kitchenStale || advanceNextDayCutoffGroups.size > 0;
  // Product instruction, 2026-09-02 — placing an Advance order requires a
  // delivery-slot choice (see the picker above and `advanceDeliverySlot`'s
  // own store comment); irrelevant for Today/Instant, which have no such
  // concept at all.
  const advanceDeliverySlotMissing = distinctOrderTypes.includes('advance') && !advanceDeliverySlot;

  // Retrying after a partial/total failure re-enters this SAME screen
  // (clears `results` back to null) rather than the only alternative being
  // "Done" → Home — see the failure branch below for why that mattered.
  function backToCart(): void {
    setResults(null);
  }

  /** Same navigation the pre-placement cart CTA rib uses (see
   * `BottomOverlayStack`'s "View order" → `/apartment-cart`) — the object
   * is already in hand from placement's own response (`startApartmentPayment`
   * + `loadOrdersByParent`, for every order type now), so it's handed to the
   * detail screen directly via the store rather than making it re-fetch
   * what we already have. */
  function viewOrder(order: ApartmentOrder): void {
    useSelectedOrderStore.getState().select(order);
    router.push({ pathname: '/apartment-order-detail', params: { orderId: order._id } });
  }

  /** `router.replace('/(tabs)')` forces a FRESH mount of the tabs screen,
   * which resets its local `activeTab`/`navDrilledIn` state back to
   * defaults (Home/Subscription) — that's what was sending residents back
   * to Home after placing, regardless of which order-type tab (Instant/
   * Today/Advance) they'd actually been on. This screen was pushed ON
   * TOP of that already-mounted tabs screen, so popping back to it instead
   * (same pattern as `addresses.tsx`/`profile.tsx`'s own back handling)
   * reveals it exactly as it was — Apartment tab, drilled-in nav, and the
   * order-type selection (a separate global store, unaffected either way)
   * all intact. */
  function backToBrowsing(): void {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  async function placeAllOrders(): Promise<void> {
    // Bug fix (product report, 2026-09-05 — "only loggedIn user can place
    // order... browsing should stay open for everyone"): matches the same
    // guard Subscription/Dine-in, On Demand, and Bulk checkout already use
    // (`requireLogin`) — Apartment was the one checkout that still just
    // silently no-op'd on a guest tap instead of prompting them to sign in.
    // Placed first so a guest never even sees the revalidate/flat-details
    // checks below fire for a cart they can't submit yet anyway.
    if (!requireLogin(router) || !profile || !address || !meta || revalidateNeeded || flatDetailsMissing || advanceDeliverySlotMissing) return;
    setPlacing(true);
    const outcomes: GroupResult[] = [];
    try {
      // Root-cause fix (product report, 2026-09-02 — "why is
      // getNearestApartment calling when I'm placing an advance order"):
      // this used to re-resolve `apartmentId` from the resident's CURRENT
      // GPS position right here, at the moment of tapping Place order —
      // removed, it never made sense. The cart's `meta.apartmentId` is
      // already the one true value everything else in this checkout is
      // built against (every line's kitchen, `wingName`/`roomNumber`) — an
      // Advance order in particular is scheduling a FUTURE delivery to an
      // already-fixed flat, which has nothing to do with wherever the
      // resident's phone happens to have a GPS fix RIGHT NOW. Swapping in a
      // live re-resolve here only risked silently sending a MISMATCHED
      // pair — `kitchenId` still pointing at the apartment the cart was
      // built for, `apartmentId` pointing at whatever complex the resident
      // physically happens to be standing near instead — for zero
      // correctness benefit, plus an extra network round-trip on the
      // critical path of every single order placement.
      const apartmentId = meta.apartmentId;
      // A checkout can split across several independent PAYMENT buckets
      // (Advance never combines with Today/Instant — always its own bucket
      // — but a combined Today+Instant bucket is still just one bucket, one
      // payment), but the resident only made ONE wallet redemption decision
      // for the whole checkout — sending the SAME full amount to every
      // bucket's own call would debit it once PER BUCKET server-side (each
      // call is independent, there's no shared "checkout" the server could
      // dedupe against). Walk the buckets in order, each one draws from
      // whatever's left of the wallet pool, capped at that bucket's own
      // total — the running remainder guarantees the SUM sent across every
      // bucket never exceeds what the resident actually opted into.
      //
      // Root-cause fix (product instruction — "add payment process to
      // Advance, keep flow same as Today/Instant"): Cashback
      // (`mealaweWalletPointsUsed`) used to have its own separate pool here,
      // safe to apply ONLY to Advance (the one type that never went through
      // JusPay, so nothing needed to subtract it from a gateway charge). Now
      // that Advance also places via `startApartmentPayment`, there is no
      // order type left on this screen where redeeming cashback wouldn't
      // silently overcharge relative to what JusPay actually bills (see
      // `startApartmentPayment`'s own doc comment) — cashback redemption has
      // been removed from this screen entirely (see `applyCashback`'s own
      // removal above), so only wallet is tracked here now.
      let remainingWallet = moneyWalletUsed;
      for (const bucket of paymentBuckets) {
        const primaryOrderType = bucket.groups[0].orderType;
        const itemServingDate =
          // The server calls this unconditionally regardless of order type
          // (`toClientDayString(payload.itemServingDate)` in
          // apartmentOrder.service.js#prepareApartmentOrder, with no
          // per-type branch before it) — leaving it undefined for
          // Instant throws INVALID_SERVING_DATE server-side. Advance
          // uses its own picked date; everything else falls back to
          // today's date, which is also what the server's daily-menu
          // lookup (apartmentMenuDao.getApartmentMenu) expects for a
          // same-day order.
          primaryOrderType === 'advance' ? bucket.groups[0].lines[0]?.offer.itemServingDate : todayIso();
        // Flattened across every group IN THIS BUCKET (not just one group,
        // per the product instruction: Today + Instant items combine into
        // ONE payment) — each line keeps its OWN originating group's
        // orderType for standingType, so the server's own groupCartItems
        // still re-derives the right (orderType, mealType) sub-groups from
        // this combined list.
        const itemList = buildBucketItemList(bucket.groups, advanceDeliverySlot);
        const fulfillmentMode = bucket.isPickup ? 'pickup' : 'delivery';
        // Product instruction, 2026-09-02 — computed BEFORE the quote call
        // below (used to come after) so its GST/platform-charge fields can
        // feed that SAME request body too — otherwise the quote would keep
        // coming back with no GST at all (payload.cgst etc undefined),
        // silently under-quoting relative to what startApartmentPayment
        // actually sends moments later.
        const bucketBill = buildApartmentBucketBill(bucket.groups, bucket.isPickup, kitchenDeliveryCharge, config?.defaultDeliveryChargeByOrderType ?? DEFAULT_DELIVERY_CHARGE_BY_ORDER_TYPE, config ?? ZERO_GST_CONFIG);
        // Root-cause fix for "cart shows one amount, JusPay charges
        // another": ask the server what it will ACTUALLY charge for this
        // exact bucket (same itemList/fulfillmentMode the real payment call
        // below sends) and cap wallet against THAT, not this screen's own
        // bill estimate. Now applies to every order type, Advance included
        // (product instruction — "add payment process to Advance, keep flow
        // same as Today/Instant") — it used to be skipped for Advance since
        // that bucket never touched the gateway at all. `null` on any quote
        // failure — fall back to the estimate rather than block placement.
        const realBucketTotal = await quoteApartmentOrder({
          apartmentId,
          apartmentName: meta.apartmentName,
          wingName: wingName.trim(),
          roomNumber: roomNumber.trim(),
          customerLocation: address ? customerLocationFrom(address) : undefined,
          kitchenId: meta.kitchenId,
          kitchenName: meta.kitchenName,
          customerId: profile._id,
          customerName: profile.userName ?? '',
          customerPhoneNo: profile.phoneNo,
          orderType: primaryOrderType,
          itemServingDate,
          fulfillmentMode,
          itemList,
          platformCharges: bucketBill.platformCharges,
          packagingCharges: bucketBill.packagingCharges,
          cgst: bucketBill.cgst,
          sgst: bucketBill.sgst,
          deliveryChargesGST: bucketBill.deliveryChargesGST,
          platformChargesGST: bucketBill.platformChargesGST,
          packagingChargesGST: bucketBill.packagingChargesGST,
        }).then((quote) => quote?.payableAmount ?? null);
        const bucketTotal = realBucketTotal ?? bucketBill.estimatedTotal;
        const bucketWallet = Math.min(remainingWallet, bucketTotal);
        remainingWallet -= bucketWallet;
        try {
          // Root-cause fix (product instruction — "add payment process to
          // Advance, keep flow same as Today/Instant, wallet usable too"):
          // Advance used to place via the old, no-payment `createApartmentOrder`
          // call — no way to collect anything beyond wallet. It now goes
          // through the exact same JusPay-gated `startApartmentPayment` call
          // every other order type uses; a combined bucket already handles
          // several groups in one payment ("Path unification" in
          // apartmentParentOrder.service.js), and Advance is always a
          // bucket-of-one, so this is the N=1 case of the same mechanism.
          // Advance's whole-order delivery-slot pick is threaded through via
          // `itemList` (see `buildBucketItemList`'s own comment), not a
          // separate top-level field.
          const result = await startApartmentPayment({
            apartmentId,
            apartmentName: meta.apartmentName,
            wingName: wingName.trim(),
            roomNumber: roomNumber.trim(),
            customerLocation: address ? customerLocationFrom(address) : undefined,
            kitchenId: meta.kitchenId,
            kitchenName: meta.kitchenName,
            customerId: profile._id,
            customerName: profile.userName ?? '',
            customerPhoneNo: profile.phoneNo,
            customerEmail: profile.email ?? '',
            orderType: primaryOrderType,
            itemServingDate,
            fulfillmentMode,
            itemList,
            platformCharges: bucketBill.platformCharges,
            packagingCharges: bucketBill.packagingCharges,
            cgst: bucketBill.cgst,
            sgst: bucketBill.sgst,
            deliveryChargesGST: bucketBill.deliveryChargesGST,
            platformChargesGST: bucketBill.platformChargesGST,
            packagingChargesGST: bucketBill.packagingChargesGST,
            moneyWalletPointsUsed: bucketWallet > 0 ? bucketWallet : undefined,
          });
          if (result.status !== 'success' || !result.foodOrderId) {
            // Root-cause fix (product instruction — "message should be
            // clear, exception handled well"): every failure used to
            // collapse to this exact same generic string regardless of
            // WHY — `result.message` now carries a real, specific reason
            // when `payWithJusPay` actually knows one (an order-creation
            // validation error, or a distinct "payment may have been
            // charged, check your orders" case) — only falls back to
            // this generic wording when it genuinely has nothing more
            // specific to say.
            throw new Error(result.message || 'Payment could not be completed. Please try again.');
          }
          // `result.foodOrderId` is the shared ApartmentParentOrder's id —
          // the real, orderNo-bearing ApartmentOrder(s) it split into
          // (one per group in this bucket) live under it.
          const children = await loadOrdersByParent(result.foodOrderId);
          if (children.length === 0) {
            throw new Error('Your payment went through, but we could not load the order yet. Check "Your orders" shortly.');
          }
          const bucketOrders: ApartmentOrder[] = children;
          // Map each real order back to whichever original cart group it
          // belongs to, by (orderType, mealType) — a combined bucket's
          // payment call is one success/failure as a whole, but the
          // results screen (and the "clear placed lines from cart" step
          // below) still needs one outcome per ORIGINAL group.
          //
          // Root-cause fix (product report, 2026-09-02 — "Advance order not
          // showing in Order rib"): the `mealType` half of this match is
          // meaningless for Advance and now actively breaks it. `g.mealType`
          // comes from `groupCartLines` grouping CART LINES by their own
          // `offer.mealType` — always `null` for Advance, since an Advance
          // item carries no per-item mealType at all (see
          // ApartmentMenuFoodItem's own comment). `matched.mealType`, on the
          // other hand, is the REAL placed order's field — and since the
          // server now requires a real `mealType` on every Advance order
          // (the resident's whole-order delivery-slot pick, threaded through
          // `buildBucketItemList` above), it's a real value like "Lunch",
          // not `null`. `"Lunch" === null` never matched, so
          // `matched` came back `undefined` for every Advance placement —
          // silently reported as a failed-to-place outcome (no alert shown
          // for it specifically, since the OUTER payment/order-creation call
          // had already genuinely succeeded) and `track()` below never ran,
          // which is exactly "placed fine, just missing from the rib."
          // Advance is always a bucket-of-one (never combines, one group,
          // one order per bucket — see the branch above), so matching by
          // `orderType` alone is already unambiguous for it; the mealType
          // check stays required for Today/Instant, where ONE bucket's
          // payment call can genuinely combine several distinct Today
          // mealType groups (plus Instant) and needs it to disambiguate.
          for (const g of bucket.groups) {
            const matched = bucketOrders.find((o) => o.orderType === g.orderType && (g.orderType === 'advance' || (o.mealType ?? null) === (g.mealType ?? null)));
            if (matched) {
              outcomes.push({ key: g.key, orderType: g.orderType, mealType: g.mealType, itemNames: g.lines.map((l) => l.dishName), status: 'success', order: matched });
              // Feeds the persistent "open order" rib (BottomOverlayStack) —
              // visible until this order's status comes back terminal, not
              // just for this screen's own lifetime.
              useActiveOrdersStore.getState().track(matched);
            } else {
              // Payment for the whole bucket succeeded, but this specific
              // group's own child didn't come back — a rare partial-split
              // failure (server retries 3x then logs and moves on, see
              // apartmentParentOrder.service.js's createOneChildOrder).
              // Surfaced honestly as failed-to-place rather than guessing
              // another group's order belongs to this one.
              outcomes.push({
                key: g.key,
                orderType: g.orderType,
                mealType: g.mealType,
                itemNames: g.lines.map((l) => l.dishName),
                status: 'failed',
                errorMessage: 'Payment succeeded, but this item could not be placed — contact support with your payment reference.',
                chargedButNotPlaced: true,
              });
            }
          }
        } catch (error) {
          const parsed = parseApartmentOrderError(error);
          // Bug fix (product report, 2026-09-02 — see `chargedButNotPlaced`'s
          // own comment): this catch also covers the "payment went through,
          // but we could not load the order yet" throw above (line ~1062) —
          // a genuine charged-but-uncertain outcome, not an ordinary
          // nothing-happened failure. Both of this screen's own "a payment
          // definitely/probably went through" messages are worded starting
          // "Your payment went through"/"Payment succeeded" on purpose, so
          // this can detect them without a second, separately-maintained
          // list of error codes to keep in sync.
          const chargedButNotPlaced = /^(your payment went through|payment succeeded)/i.test(parsed.message);
          for (const g of bucket.groups) {
            outcomes.push({ key: g.key, orderType: g.orderType, mealType: g.mealType, itemNames: g.lines.map((l) => l.dishName), status: 'failed', errorMessage: parsed.message, chargedButNotPlaced });
          }
        }
      }
      setResults(outcomes);
      // Any group that actually placed may have spent wallet — re-fetch so
      // the balance shown (here, and anywhere else reading the same
      // `useBalances()` store) reflects what's really left, instead of the
      // pre-checkout number this screen started with.
      if (outcomes.some((o) => o.status === 'success') && moneyWalletUsed > 0) {
        refreshBalances();
      }
      if (outcomes.every((o) => o.status === 'success')) {
        reset();
      } else {
        // Partial failure — a group that DID place must not linger in the
        // cart (retrying would resubmit it and double-order); a group that
        // FAILED stays so "Try again" below has something to retry with.
        //
        // Bug fix (product report, 2026-09-02 — "payment succeeded... will
        // lead to customer confusion"): a `chargedButNotPlaced` group is the
        // SAME risk as a success here, not an ordinary failure — the JusPay
        // charge already went through, so leaving it in the cart for "Try
        // again" to resubmit would attempt a SECOND payment for something
        // already (probably) paid for. Cleared from the cart the same way a
        // real success is; the results screen itself still shows it —
        // `results` isn't cleared, only the editable cart is — so the
        // resident doesn't lose visibility into what happened or the
        // "contact support" instruction just because it's gone from Cart.
        const clearFromCartKeys = new Set(outcomes.filter((o) => o.status === 'success' || o.chargedButNotPlaced).map((o) => o.key));
        for (const group of groups) {
          if (clearFromCartKeys.has(group.key)) for (const line of group.lines) setLineCount(line.key, 0);
        }
        // Product decision: for the overwhelmingly common case — one
        // order type in the cart, and it failed for one clear reason (the
        // kitchen just closed, went over cap, etc.) — surface that reason
        // immediately as a popup with a direct way back to browsing,
        // rather than making the resident scroll down to find it on the
        // results screen below (which still renders underneath, with the
        // same reason and a "Try again" option, for the multi-group case
        // this popup doesn't try to summarize).
        if (outcomes.length === 1 && outcomes[0].status === 'failed') {
          const reason = outcomes[0].errorMessage || 'Something went wrong.';
          Alert.alert('Could not place your order', `${reason}\n\nTry a different kitchen, or try again in a bit.`, [
            { text: 'Try again', style: 'default' },
            { text: 'Back to menu', style: 'cancel', onPress: backToBrowsing },
          ]);
        }
      }
    } catch (error) {
      // Every await above (startApartmentPayment per group, the quote
      // calls) already has its own try/catch, so nothing here should be
      // reachable
      // today — kept purely as a defensive net against a future edit adding
      // unguarded logic to this function, so it degrades to a visible alert
      // instead of a silent unhandled promise rejection on the "Place order"
      // button press.
      console.error('[apartment-cart] placeAllOrders failed unexpectedly:', error);
      Alert.alert('Something went wrong', "We couldn't place your order. Please try again.");
    } finally {
      setPlacing(false);
    }
  }

  if (results) {
    const allOk = results.every((r) => r.status === 'success');
    // A batch can now mix order types (Instant alongside Today, etc.) —
    // these read from the actual per-result type rather than the no-longer-
    // authoritative `meta.orderType` (see ApartmentCartMeta's own comment).
    const anyAdvance = results.some((r) => r.orderType === 'advance');
    // Success branch below is a deliberately fixed, celebratory green
    // surface — unlike the rest of this screen, it does NOT switch with
    // dark/light mode (same idea as a checkout-success moment staying on
    // brand regardless of theme); the failure branch's `colors.page` stays
    // theme-aware since that's just the normal page.
    return (
      <View className="flex-1" style={{ backgroundColor: allOk ? palette.apartment.green : colors.page }}>
        <StatusBar style={allOk ? 'light' : 'dark'} />
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 24, gap: 14, flexGrow: 1, justifyContent: allOk ? 'center' : 'flex-start' }}>
          {allOk ? (
            successPhase === 'intro' ? (
              // Brief success intro — checkmark pops in (spring) then the
              // confirmation line fades up alongside it; tapping anywhere
              // skips straight to the results page below.
              <Pressable onPress={skipIntro} className="flex-1 items-center justify-center" accessibilityRole="button" accessibilityLabel="Continue">
                <Animated.View style={[introAnimStyle, { alignItems: 'center' }]}>
                  <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(255,255,255,.2)', alignItems: 'center', justifyContent: 'center' }}>
                    <IconCheck size={42} color="#fff" strokeWidth={3} />
                  </View>
                  <AppText variant="display" style={{ color: '#fff', marginTop: 18, textAlign: 'center' }}>
                    Your Order placed successfully
                  </AppText>
                </Animated.View>
              </Pressable>
            ) : (
              <Animated.View style={pageAnimStyle}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,.2)', alignItems: 'center', justifyContent: 'center' }}>
                  <IconCheck size={30} color="#fff" strokeWidth={3} />
                </View>
                <AppText variant="display" style={{ color: '#fff', marginTop: 6 }}>
                  Order placed
                </AppText>
                <AppText variant="body" style={{ color: 'rgba(255,255,255,.88)', maxWidth: 280, marginTop: 14 }}>
                  {results.length > 1 ? `${results.length} orders placed — one per meal slot/type.` : 'Order confirmed.'}
                </AppText>
                <View className="rounded-2xl p-3.5" style={{ marginTop: 14, backgroundColor: 'rgba(255,255,255,.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,.22)' }}>
                  <AppText variant="overline" style={{ color: 'rgba(255,255,255,.7)' }}>
                    WHAT HAPPENS NEXT
                  </AppText>
                  <AppText variant="caption" style={{ color: '#fff', marginTop: 6, lineHeight: 18 }}>
                    {anyAdvance
                      ? 'For Advance: the kitchen already committed to that date, so it cannot decline, and it cannot be edited once placed. Any other order above has a short kitchen response window — it transfers to the nearest kitchen automatically if missed.'
                      : 'The kitchen has a short window to respond. If it misses the window the order transfers to the nearest kitchen automatically.'}
                  </AppText>
                </View>

                {/* One rib per placed order — same shape as the add-to-cart
                    CTA rib (BottomOverlayStack's CtaSlideCard): price/subtitle
                    on the left, a white "View order" pill on the right. */}
                <View style={{ gap: 8, marginTop: 14 }}>
                  {results.map((r) => (r.order ? <PlacedOrderRow key={r.key} result={r} order={r.order} onView={viewOrder} /> : null))}
                </View>

                <Pressable onPress={backToBrowsing} className="self-start rounded-2xl bg-white px-5 py-3.5" style={{ marginTop: 14 }}>
                  <AppText variant="label" style={{ color: palette.apartment.ink }}>
                    Back to menu
                  </AppText>
                </Pressable>
              </Animated.View>
            )
          ) : (
            <>
              {/* Bug fix (product report, 2026-09-02 — "this message clearly
                  says payment succeeded without payment which will lead to
                  customer confusion... handle exception very well and
                  correct messaging"): the subtitle used to check ONLY
                  whether anything had `status === 'success'` — a genuinely
                  charged-but-not-placed item is `status: 'failed'`, so it
                  fell straight into the "Nothing placed" branch, directly
                  contradicting the per-item row right below it that says a
                  payment went through. Checked first (a real charge is the
                  more urgent fact — worth saying plainly up front, not
                  buried under a per-row caption the resident might not
                  read), and worded to never again claim nothing happened
                  when something financial actually did. */}
              <AppText variant="h2" style={{ color: colors.ink }}>
                {results.some((r) => r.chargedButNotPlaced) ? 'A payment needs your attention' : 'Some orders need attention'}
              </AppText>
              <AppText variant="bodySm" style={{ color: colors.muted, marginTop: -6 }}>
                {results.some((r) => r.chargedButNotPlaced)
                  ? 'A payment went through for the item(s) marked below, but they could not be placed — you will not be charged again for them. Contact support with your payment reference to sort it out. Any other items below can be fixed and retried normally.'
                  : results.some((r) => r.status === 'success')
                    ? 'The meal slots below that placed are done — they have been cleared from your cart. Fix and retry the ones that failed.'
                    : 'Nothing placed. Fix the issue below and try again, or head back to Home.'}
              </AppText>
              {results.map((r) => (
                <Pressable
                  key={r.key}
                  onPress={r.order ? () => viewOrder(r.order!) : undefined}
                  disabled={!r.order}
                  className="flex-row items-center gap-3 rounded-2xl p-3.5 active:opacity-90"
                  style={{
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: r.chargedButNotPlaced ? colors.warn : colors.border,
                  }}>
                  {/* `chargedButNotPlaced` gets its own distinct (amber,
                      alert-style) icon — reusing the same red circle an
                      ordinary "nothing happened" failure uses would visually
                      flatten two very differently-serious outcomes into
                      looking identical. */}
                  {r.status === 'success' ? (
                    <IconCheckCircle size={20} color={colors.green} />
                  ) : r.chargedButNotPlaced ? (
                    <IconComplaint size={20} color={colors.warn} />
                  ) : (
                    <IconCheckCircle size={20} color={palette.status.danger} />
                  )}
                  <View className="flex-1">
                    <AppText variant="label" style={{ color: colors.ink }} numberOfLines={1}>
                      {r.mealType ?? (r.itemNames.length > 0 ? r.itemNames.join(', ') : 'Order')}
                    </AppText>
                    <AppText variant="caption" style={{ color: r.status === 'success' ? colors.green : r.chargedButNotPlaced ? colors.warn : palette.status.danger }}>
                      {r.status === 'success' ? `Confirmed · Order #${r.order?.orderNo}` : r.errorMessage}
                    </AppText>
                  </View>
                  {r.order ? <IconArrowRight size={16} color={colors.muted} /> : null}
                </Pressable>
              ))}
              {/* Retrying re-enters the cart-edit view (below) with only the
                  still-failed items left in it — the ONLY exit used to be
                  "Done" → Home, which meant any tap after a failed/partial
                  placement forced the user back to Home with no way to fix
                  and resubmit. */}
              <Button label="Try again" block onPress={backToCart} />
              <Pressable
                onPress={() => {
                  reset();
                  backToBrowsing();
                }}
                className="items-center py-1">
                <AppText variant="caption" weight="bold" style={{ color: colors.muted }}>
                  Discard remaining items
                </AppText>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  if (lines.length === 0 || !meta) {
    return (
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: colors.page }}>
        <StatusBar style="dark" />
        <AppText variant="h3" style={{ color: colors.ink }}>
          Nothing on the stove yet
        </AppText>
        <AppText variant="bodySm" style={{ color: colors.muted, marginTop: 6, textAlign: 'center' }}>
          Someone in your society is cooking right now. Pick a dish and we will find the kitchen for you.
        </AppText>
        <Pressable onPress={() => router.back()} className="mt-5 rounded-2xl px-5 py-3.5" style={{ backgroundColor: colors.green }}>
          <AppText variant="label" style={{ color: '#fff' }}>
            See what&apos;s cooking
          </AppText>
        </Pressable>
      </View>
    );
  }

  const tone = orderTypeColors[meta.orderType];
  const grandTotal = paymentBuckets.reduce((sum, b) => sum + bucketTotal(b), 0);
  // Lifted out of the Bill Details JSX (was a nested IIFE there) so the GST
  // popup sheet below can read the exact same numbers — computed once here,
  // never twice.
  const gstTotals = paymentBuckets.reduce(
    (sum, b) => {
      const { platformCharges, packagingCharges, cgst, sgst, deliveryChargesGST, platformChargesGST, packagingChargesGST, taxes } = bucketPlatformAndTaxes(b);
      return {
        platformCharges: sum.platformCharges + platformCharges,
        packagingCharges: sum.packagingCharges + packagingCharges,
        itemGst: sum.itemGst + cgst + sgst,
        deliveryChargesGST: sum.deliveryChargesGST + deliveryChargesGST,
        platformChargesGST: sum.platformChargesGST + platformChargesGST,
        packagingChargesGST: sum.packagingChargesGST + packagingChargesGST,
        taxes: sum.taxes + taxes,
      };
    },
    { platformCharges: 0, packagingCharges: 0, itemGst: 0, deliveryChargesGST: 0, platformChargesGST: 0, packagingChargesGST: 0, taxes: 0 },
  );
  const itemCount = lines.reduce((sum, l) => sum + l.count, 0);
  // Today, Instant, AND (as of "add payment process to Advance, keep flow
  // same as Today/Instant") Advance now all place via the JusPay payment
  // gateway (see placeAllOrders below) — and that gateway's own apartment
  // functions, confirmed server-side, decide whether a real charge happens
  // purely from `payableAmount - moneyWalletPointsUsed`. Mealawe Cashback
  // (`mealaweWalletPointsUsed`) is never subtracted from what JusPay
  // actually charges, so there is no longer any order type on this screen
  // it's safe to apply to — cashback redemption has been removed here
  // entirely (see `applyWallet`'s own declaration comment above for the
  // fuller history). Wallet alone caps the payable total now.
  const moneyWalletUsed = applyWallet ? Math.max(0, Math.min(walletBalance, grandTotal)) : 0;
  const payableTotal = Math.max(0, grandTotal - moneyWalletUsed);
  // For the Bill details header's own "Saved ₹X" badge — same idea as
  // Subscription's own `bill.saving` (cart.tsx), just wallet alone now
  // (no coupon discount to fold in here, that card is a static
  // placeholder — see its own comment).
  const totalSaving = moneyWalletUsed;
  // Bug fix: `?? 0` meant a kitchen that never set its own prep-time override
  // silently zeroed out the WHOLE banner (see DEFAULT_INSTANT_PREP_MINUTES's
  // own comment) — falls back to the platform default per line first, so a
  // missing override never suppresses the estimate entirely. No separate
  // server round-trip any more (see `instantLines`' own comment, above) —
  // every line's `preparationTime` is already real, per-item data straight
  // from the merged Instant fetch.
  const maxPrep = instantLines.length === 0 ? 0 : Math.max(...instantLines.map((l) => l.offer.preparationTime ?? DEFAULT_INSTANT_PREP_MINUTES));

  return (
    <View className="flex-1" style={{ backgroundColor: colors.page }}>
      <StatusBar style="dark" />
      <View className="flex-row items-center gap-3 px-4 pb-3" style={{ paddingTop: insets.top + 10 }}>
        <Pressable onPress={() => router.back()} className="h-9 w-9 items-center justify-center rounded-2xl" style={{ borderWidth: 1, borderColor: colors.border }}>
          <IconArrowLeft size={18} color={colors.ink} />
        </Pressable>
        <AppText variant="h3" style={{ color: colors.ink }}>
          Your order
        </AppText>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}>
        {revalidateNeeded ? (
          <View className="rounded-2xl p-3.5" style={{ backgroundColor: colors.warnBg, borderWidth: 1, borderColor: colors.warnLine }}>
            <AppText variant="label" style={{ color: colors.warn }}>
              Eligibility changed while you were browsing
            </AppText>
            <AppText variant="caption" style={{ color: '#8a6a52', marginTop: 4, marginBottom: 10, lineHeight: 17 }}>
              {kitchenStale
                ? `${meta.kitchenName} is no longer eligible for ${distinctOrderTypes.length > 1 ? 'one or more of your order types' : 'this order type'}. Remove these items and pick another kitchen.`
                : advanceNextDayCutoffGroups.size > 0
                  ? `Orders for ${dayLabel(1)} are no longer accepted after ${config ? formatHourLabel(config.advanceNextDayCutoffHour) : '10 PM'} today. Remove these items, or add them again for ${dayLabel(2)} instead.`
                  : 'A meal slot in your cart just passed its cutoff for today. Remove it to continue.'}
            </AppText>
            <Pressable
              onPress={() => {
                for (const g of groups) if (staleGroups.has(g.key) || kitchenStale || advanceNextDayCutoffGroups.has(g.key)) for (const l of g.lines) setLineCount(l.key, 0);
              }}
              className="self-start rounded-2xl px-3.5 py-2"
              style={{ borderWidth: 1, borderColor: colors.warn }}>
              <AppText variant="caption" weight="bold" style={{ color: colors.warn }}>
                Remove affected items
              </AppText>
            </Pressable>
          </View>
        ) : null}

        <View className="rounded-2xl p-3.5" style={{ backgroundColor: colors.card }}>
          {/* Product decision (reverses the earlier "order type is never
              shown to the resident" rule for this ONE card): kitchen name +
              which order type this is + the kitchen's own rating, up top —
              exactly the identity a resident wants confirmed before placing. */}
          <View className="flex-row items-center gap-2">
            <AppText variant="label" style={{ color: colors.ink, flex: 1 }} numberOfLines={1}>
              {meta.kitchenName}
            </AppText>
            <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: tone.soft }}>
              {/* Bug fix (product report, 2026-09-03 — "Cart kitchen card...
                  should be determined order-detail-wise, based on the actual
                  items in that kitchen's cart... do not use a single global
                  order type"): this used to always read `meta.orderType` —
                  the FIRST order type this kitchen's cart happened to be
                  opened under, never updated again once a second type (Today
                  + Instant can combine into one checkout, see
                  `distinctOrderTypes`'s own comment above) joined it. Shows
                  every distinct type actually present instead, "Today" first
                  when both are ("Today + Instant") — Advance never combines
                  with either (R2/one-kitchen-one-checkout-type, see
                  ApartmentConflictModal), so that's the only real multi-type
                  case, but this reads whatever's ACTUALLY in the cart rather
                  than assuming it. */}
              <AppText variant="caption" weight="bold" style={{ color: tone.accent, fontSize: 10.5 }}>
                {distinctOrderTypes
                  .slice()
                  .sort((a, b) => (a === 'today' ? -1 : b === 'today' ? 1 : 0))
                  .map((t) => ORDER_TYPE_LABEL[t])
                  .join(' + ')}
              </AppText>
            </View>
            {/* Product instruction, 2026-09-03 — "remove all rating from
                apartment from menu, kitchen": rating badge removed here too. */}
          </View>
          {kitchenAddressLine ? (
            <AppText variant="caption" style={{ color: colors.muted, marginTop: 4, lineHeight: 16 }}>
              {kitchenAddressLine}
            </AppText>
          ) : null}
          {/* Product instruction: the kitchen's real, full street address —
              a plain KitchenPartner-by-id lookup (loadKitchenAddress above),
              additive to the wing/apartment-name summary line above it, not
              a replacement for it. */}
          {kitchenFullAddress ? (
            <AppText variant="caption" style={{ color: colors.muted, marginTop: 2, lineHeight: 16 }}>
              {kitchenFullAddress}
            </AppText>
          ) : null}
        </View>

        {distinctOrderTypes.includes('instant') && maxPrep > 0 ? (
          <View className="rounded-2xl p-3.5" style={{ backgroundColor: 'rgba(30,91,63,.1)', borderWidth: 1, borderColor: 'rgba(30,91,63,.28)' }}>
            {/* Text-only change (product instruction): "preparation", not
                "fulfilment" — everything else about this banner (condition,
                sub-line, styling) is unchanged. */}
            <AppText variant="label" style={{ color: colors.green }}>
              Tentative preparation about {maxPrep} min
            </AppText>
            <AppText variant="caption" style={{ color: colors.mutedLine, marginTop: 2 }}>
              {/* Bug fix: the real countdown (order-detail screen) is
                  anchored to 'preparing', not acceptance — this pre-
                  placement estimate needs the same story so it doesn't
                  promise something the live timer won't match later. */}
              Tentative — the kitchen starts the clock once it&apos;s preparing your order.
            </AppText>
          </View>
        ) : null}
        {distinctOrderTypes.includes('advance') ? (
          <View className="rounded-2xl p-3.5" style={{ backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldLine }}>
            <AppText variant="caption" style={{ color: '#8a6512', lineHeight: 18 }}>
              Advance orders can&apos;t be modified or cancelled once placed. The kitchen has already committed to this date.
            </AppText>
          </View>
        ) : null}

        {/* Advance delivery-slot picker (product instruction, 2026-09-02 —
            "select delivery slot... when order should gets deliver on that
            day"): one choice for the whole Advance order (not per-dish —
            Advance items have no mealType of their own at all, and Advance
            never combines with another order type, so there's only ever ONE
            Advance group in a cart — see `advanceDeliverySlot`'s own store
            comment). This choice is also REQUIRED server-side now (the
            server's own `ADVANCE_MEAL_TYPE_REQUIRED`/`_DISABLED` — see
            `buildBucketItemList`'s own `advanceMealType` param, which is
            what actually carries this value into the placement/quote calls
            below).
            Options come straight from the committed kitchen's own
            `advanceDeliverySlots` (per the "Apartment Orders API Reference"
            doc, 2 Sep 2026) — already enabled-only and Breakfast/Lunch/
            HighTea/Dinner-ordered server-side, no client-side filtering/
            sorting needed. `undefined` until the U17 revalidation effect
            above first resolves (or if the kitchen predates this field) —
            nothing to show yet either way, so this renders a loading state
            rather than a misleading empty picker in that gap; an empty
            ARRAY (fetch resolved, kitchen genuinely has nothing enabled) is
            shown as its own distinct message instead. */}
        {distinctOrderTypes.includes('advance') ? (
          <View className="rounded-2xl p-3.5" style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 10 }}>
            <View className="flex-row items-center gap-2">
              <IconClock size={15} color={colors.green} />
              <AppText variant="label" style={{ color: colors.ink }}>
                Delivery slot
              </AppText>
            </View>
            {advanceDeliverySlots === undefined ? (
              <AppText variant="caption" style={{ color: colors.muted }}>
                Loading this kitchen&apos;s delivery windows…
              </AppText>
            ) : advanceDeliverySlots.length === 0 ? (
              <AppText variant="caption" style={{ color: colors.warn }}>
                This kitchen hasn&apos;t set up any Advance delivery windows yet — contact support to place this order.
              </AppText>
            ) : (
              <>
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {advanceDeliverySlots.map((slot) => {
                    const active = advanceDeliverySlot === slot.mealType;
                    return (
                      <Pressable
                        key={slot.mealType}
                        onPress={() => setAdvanceDeliverySlot(slot.mealType)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        className="active:opacity-80"
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 14,
                          backgroundColor: active ? colors.green : colors.page,
                          borderWidth: active ? 0 : 1,
                          borderColor: colors.borderSoft,
                        }}>
                        <AppText variant="caption" weight="bold" style={{ color: active ? '#fff' : colors.ink, fontSize: 12.5 }}>
                          {slot.mealType}
                        </AppText>
                        <AppText variant="caption" style={{ color: active ? 'rgba(255,255,255,.85)' : colors.muted, fontSize: 10.5, marginTop: 1 }}>
                          {formatHHmm(slot.deliveryStartTime)} – {formatHHmm(slot.deliveryEndTime)}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
                {!advanceDeliverySlot ? (
                  <AppText variant="caption" style={{ color: colors.warn }}>
                    Please choose a delivery slot to continue.
                  </AppText>
                ) : null}
              </>
            )}
          </View>
        ) : null}

        <AppText variant="label" style={{ color: colors.ink, marginTop: 2 }}>
          Order details
        </AppText>

        {groups.map((group) => {
          const isPickup = !!pickup[group.key];
          // Root-cause fix ("checkbox and Bill Details show different
          // delivery charges"): this used to compute its OWN isolated
          // estimate via buildApartmentGroupBill, which — even once it read
          // the right per-order-type config default — could still diverge
          // from Bill Details for two independent reasons: (1) it never
          // consulted the REAL server quote (`bucketQuotes`) Bill Details
          // prefers the moment one resolves, so a config value an admin just
          // changed showed correctly below but stayed on the pre-change
          // estimate up here; (2) it was computed per MEAL-SLOT GROUP, not
          // per PAYMENT BUCKET — the server (and Bill Details, via
          // `bucketDelivery`) charges ONE combined fee per distinct order
          // type actually present in a bucket, not one per group, so a
          // Today cart spanning Breakfast+Dinner showed the fee twice up
          // here against once below. Resolving this group's own bucket and
          // reading the SAME `bucketDelivery` Bill Details reads makes the
          // two provably impossible to disagree — quote-preferring,
          // bucket-scoped, single source of truth either way.
          const myBucket = paymentBuckets.find((b) => b.groups.some((g) => g.key === group.key));
          // Bug fix (product report, 2026-09-02 — "if I add Instant and
          // Today items then in Order details on both items it is showing
          // addition of delivery charges... in bill details delivery charge
          // is showing different and on order details showing different"):
          // `bucketDelivery(myBucket)` is the BUCKET's total — correct for a
          // single-order-type bucket (every group in it shares that one
          // charge, nothing to split), but once a bucket combines 2+
          // DISTINCT order types (Instant + Today), that total is the SUM of
          // each type's own charge — showing it unconditionally on every
          // group meant an Instant row and a Today row in the SAME bucket
          // each displayed the FULL combined total, reading as though the
          // combined amount was being charged twice. Bill Details already
          // solved this exact problem for its own delivery rows (one row
          // PER distinct type, via `buildApartmentBucketDeliveryBreakdown`)
          // — this now reads from that SAME breakdown instead of a second,
          // divergent computation, so the two can no longer disagree.
          const bucketDistinctTypes = myBucket ? [...new Set(myBucket.groups.map((g) => g.orderType))] : [];
          const groupDeliveryDisplay = !myBucket
            ? 0
            : bucketDistinctTypes.length > 1
              ? (buildApartmentBucketDeliveryBreakdown(
                  myBucket.groups,
                  myBucket.isPickup,
                  kitchenDeliveryCharge,
                  config?.defaultDeliveryChargeByOrderType ?? DEFAULT_DELIVERY_CHARGE_BY_ORDER_TYPE,
                ).find((d) => d.orderType === group.orderType)?.amount ?? 0)
              : bucketDelivery(myBucket);
          // Bug fix: this group's own pickup checkbox used the CART-WIDE
          // `tone` (== meta.orderType, itself just "whichever type was
          // added most recently" — see ApartmentCartMeta's own comment),
          // not this specific group's type — wrong color whenever a cart
          // mixes types (e.g. an Instant + a Today group together), since
          // every group's checkbox painted identically regardless of which
          // one it actually belonged to.
          const groupTone = orderTypeColors[group.orderType];
          // Product decision (reverses the earlier "order type is never
          // shown" rule for this row too, same as the kitchen card above):
          // a meal slot name (Breakfast, Dinner, ...) is shown when the
          // group has one; a group with none (Instant) now names its
          // own order type instead of a type-less "Order".
          const groupLabel = group.mealType ?? `${ORDER_TYPE_LABEL[group.orderType]} order`;
          // Bug fix (product instruction, 2026-09-01, item 4 — Advance
          // "while placing order we need to show on which day you want to
          // get order"): the T+1/T+2 day the resident picked in the
          // add-sheet was only ever sent in the order payload
          // (`itemServingDate` below), never actually shown back to them
          // anywhere on this screen — the group header only ever named the
          // meal slot (e.g. "Lunch"), identical to how Today renders,
          // giving no visual confirmation of WHICH day an Advance group is
          // actually for. Derived the same way the add-sheet's own day
          // picker compares dates (`isoForDay`), against this group's own
          // first line's stamped `itemServingDate` — every line in one
          // group shares the same day (`dishKeyFor` folds mealType, not
          // day, but a group is also always one kitchen/one order-type
          // bucket-of-lines added together for the same day in practice).
          const groupDayLabel =
            group.orderType === 'advance'
              ? (() => {
                  const iso = group.lines[0]?.offer.itemServingDate;
                  if (!iso) return null;
                  const day = iso.slice(0, 10) === isoForDay(1) ? 1 : iso.slice(0, 10) === isoForDay(2) ? 2 : null;
                  return day ? dayLabel(day) : null;
                })()
              : null;
          // Bug fix (product report, 2026-09-03 — Advance's "Sat 5 sept,
          // Hightea slot (4 PM to 5 PM)"): day + slot used to be two lines
          // with no real time window — this kitchen's real delivery window
          // for the slot, from `advanceDeliverySlots` (already fetched live
          // for the picker above). `undefined` falls back to the slot name
          // alone.
          const advanceSlotWindow = advanceDeliverySlots?.find((s) => s.mealType === advanceDeliverySlot);
          const advanceSlotLabel =
            group.orderType === 'advance' && advanceDeliverySlot
              ? [
                  groupDayLabel,
                  `${advanceDeliverySlot} slot${advanceSlotWindow ? ` (${formatHHmm(advanceSlotWindow.deliveryStartTime)} to ${formatHHmm(advanceSlotWindow.deliveryEndTime)})` : ''}`,
                ]
                  .filter(Boolean)
                  .join(', ')
              : null;
          // Product instruction, 2026-09-03 — "show ready to deliver in
          // prep-time of selected kitchen inside Order details below every
          // order type": Instant/Today groups get a "Ready to deliver"
          // line; Advance has no same-day prep-time concept — shown its own
          // selected delivery slot instead (below). Today reads this
          // kitchen's own REAL configured prep-end time for the group's
          // meal slot (every line in a group shares one slot — see
          // `kitchenPrepEndTime`'s own comment, types.ts, for why this isn't
          // the same as a guessed now-plus-duration estimate) — product
          // instruction, 2026-09-03: "prep time is 7 to 8 PM, ready to
          // deliver after 8 PM". Falls back to that now-plus-duration
          // estimate only when there's no real prep-end time to read (a
          // kitchen that hasn't configured this slot, or Instant, which has
          // no meal-slot concept and so never carries one at all) — same
          // MAX-across-lines/DEFAULT_INSTANT_PREP_MINUTES fallback
          // convention `maxPrep` above already uses.
          // Bug fix (product report, 2026-09-03 — "if user is doing
          // self-pickup add 'ready to pickup', or if user is taking
          // delivery... 'ready to deliver'"): `isPickup` (this group's own
          // pickup checkbox — already computed above) decides the verb; the
          // rest of the sentence is unchanged either way.
          const readyVerb = isPickup ? 'pickup' : 'deliver';
          const groupReadyLabel =
            group.orderType !== 'advance'
              ? (() => {
                  const prepEndTime = group.lines[0]?.offer.kitchenPrepEndTime;
                  if (prepEndTime) return `Ready to ${readyVerb} after ${formatHHmm(prepEndTime)}`;
                  const prepTimes = group.lines.map((l) => l.offer.preparationTime ?? DEFAULT_INSTANT_PREP_MINUTES);
                  if (prepTimes.length === 0) return null;
                  const prep = Math.max(...prepTimes);
                  return `Ready to ${readyVerb} by ${formatHour12(new Date(Date.now() + prep * 60000))}`;
                })()
              : null;
          // Only an interactive toggle when the kitchen supports BOTH modes
          // for this order type — see this file's `groups`-scoped
          // useEffect above for the matching store-side correction, and
          // `kitchenFulfillmentModes`'s own comment for why this reads the
          // LIVE-fetched value (falling back to the cart line's own
          // possibly-stale snapshot) rather than the snapshot alone.
          const fulfillmentModes = kitchenFulfillmentModes[group.orderType] ?? group.lines[0]?.offer.kitchenFulfillmentModes;
          const canToggleFulfillment = !fulfillmentModes || (fulfillmentModes.deliveryEnabled && fulfillmentModes.pickupEnabled);
          return (
            <View key={group.key} className="overflow-hidden rounded-2xl" style={{ backgroundColor: colors.card }}>
              <View className="flex-row items-center justify-between px-3.5 py-3" style={{ backgroundColor: colors.page, borderBottomWidth: 1, borderColor: colors.borderSoft }}>
                <View>
                  <AppText variant="label" style={{ color: colors.ink }}>
                    {groupLabel}
                  </AppText>
                  {/* Bug fix (product report, 2026-09-03 — Advance's
                      "Sat 5 sept, Hightea slot (4 PM to 5 PM)"): one
                      combined slot+time line for Advance (`advanceSlotLabel`
                      above); Instant/Today show the ready-to-deliver time
                      instead. Bold + this group's own type accent either
                      way — "keep it bold and in theme color". */}
                  {advanceSlotLabel ? (
                    <AppText variant="caption" weight="bold" style={{ color: groupTone.accent }}>
                      {advanceSlotLabel}
                    </AppText>
                  ) : groupReadyLabel ? (
                    <AppText variant="caption" weight="bold" style={{ color: groupTone.accent }}>
                      {groupReadyLabel}
                    </AppText>
                  ) : null}
                </View>
                {/* Product instruction: no cuisine text (e.g. "Maharashtrian,
                    Rajasthani") here anymore, just the item count — kept
                    simple, no kitchen-identity info duplicated next to the
                    order type. */}
                <AppText variant="caption" style={{ color: colors.muted }} numberOfLines={1}>
                  {group.lines.length} item{group.lines.length > 1 ? 's' : ''}
                </AppText>
              </View>
              {group.lines.map((line) => {
                // Bug fix: this stepper never checked the kitchen's own
                // serving cap at all — a resident could freely push a line's
                // count past `availableQty` right here even though the
                // add-sheet (ApartmentAddSheet.tsx) already enforces exactly
                // this same cap on the way IN. The server would still
                // correctly reject an over-cap Instant/Today order at
                // placement (reserveInstantStock / the daily-item stock
                // check), but only after the resident had already filled in
                // flat details and tapped "Place order" — this closes the
                // gap where it should have been caught in the first place.
                const usesQtyCap = line.orderType === 'instant' || line.orderType === 'today';
                const atCap = usesQtyCap && line.offer.availableQty !== undefined && line.count >= line.offer.availableQty;
                return (
                  <View key={line.key} style={{ borderBottomWidth: 1, borderColor: colors.borderSoft }}>
                    <View className="flex-row items-center gap-3 px-3.5 py-3">
                      <View style={{ width: 40, height: 40, borderRadius: 12, overflow: 'hidden', backgroundColor: accentTint(palette.accent.food, 0.14), flexShrink: 0 }}>
                        {line.imageUrl ? (
                          <Image source={{ uri: line.imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                        ) : (
                          <View className="h-full items-center justify-center">
                            <IconUtensils size={16} color={palette.accent.food} />
                          </View>
                        )}
                      </View>
                      <View className="min-w-0 flex-1">
                        <View className="flex-row items-center gap-1.5">
                          <DietMark veg={line.isVeg} size={13} />
                          <AppText variant="body" style={{ color: colors.ink, flex: 1 }} numberOfLines={1}>
                            {line.dishName}
                          </AppText>
                        </View>
                        <AppText variant="caption" style={{ color: colors.muted, marginTop: 1 }}>
                          {formatINR(line.offer.price)} each
                        </AppText>
                      </View>
                      <QuantityStepper
                        count={line.count}
                        onIncrease={() => {
                          if (atCap) return;
                          setLineCount(line.key, line.count + 1);
                        }}
                        onDecrease={() => setLineCount(line.key, line.count - 1)}
                        // Bug fix (product instruction, 2026-09-01 — "after
                        // placing the button goes disabled, data should not
                        // be editable"): a placement in flight (JusPay's
                        // page can close and hand control back to this
                        // screen a good few seconds before placeAllOrders
                        // itself resolves — see its own quote/validate
                        // await chain) used to leave the ENTIRE cart still
                        // fully editable underneath — quantity, wallet,
                        // pickup, address — none of which actually reaches
                        // the in-flight call (its own itemList/body was
                        // already captured), so an edit here just silently
                        // did nothing while looking like it should have.
                        disabled={placing}
                        // Bug fix (product instruction, 2026-09-01 — "do not
                        // allow user to add more qty than available/serving
                        // qty from anywhere"): `onIncrease`'s own `atCap`
                        // early-return already stopped the write, but the
                        // "+" glyph itself stayed full-color and tappable —
                        // no visible reason it stopped working besides the
                        // caption below (easy to miss, or scrolled past).
                        increaseDisabled={atCap}
                      />
                    </View>
                    {atCap ? (
                      <AppText variant="caption" style={{ color: colors.warn, paddingHorizontal: 14, paddingBottom: 10, marginTop: -4 }}>
                        {line.offer.kitchenName} only serves {line.offer.availableQty} of this today — quantity capped.
                      </AppText>
                    ) : null}
                  </View>
                );
              })}
              <Pressable
                onPress={canToggleFulfillment && !placing ? () => togglePickup(group.key) : undefined}
                disabled={!canToggleFulfillment || placing}
                accessibilityState={canToggleFulfillment && !placing ? undefined : { disabled: true }}
                className="flex-row items-center justify-between px-3.5 py-3">
                <View className="flex-row items-center gap-2.5">
                  {/* Bug fix (product instruction, 2026-09-01 — "pickup-only
                      kitchen is read-only but not checked"): this glyph used
                      to render CHECKED only for the "Delivery" state and a
                      plain empty box for "Self-Pickup" — a leftover from
                      when this really was a single yes/no "deliver?"
                      checkbox. It's a two-state toggle now (the label text
                      itself switches between "Self-Pickup"/"Delivery from
                      kitchen"), so exactly ONE of those two is always the
                      current selection — this should read as checked
                      regardless of WHICH of the two that is. A pickup-only
                      kitchen forced into this state (see the effect above
                      that sets `isPickup`/disables toggling) was rendering
                      as an empty, unchecked-looking box despite genuinely
                      being the active, correct, read-only choice. */}
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: groupTone.accent,
                      opacity: canToggleFulfillment && !placing ? 1 : 0.6,
                    }}>
                    <IconCheck size={12} color="#fff" strokeWidth={3.4} />
                  </View>
                  <AppText variant="caption" weight="bold" style={{ color: colors.ink }}>
                    {/* Explicit copy change (product instruction) — shorter,
                        clearer labels than the previous "I will get/pickup
                        order from kitchen" phrasing. */}
                    {isPickup ? 'Self-Pickup' : 'Delivery from kitchen'}
                  </AppText>
                </View>
                <AppText variant="caption" weight="bold" style={{ color: isPickup ? colors.muted : colors.ink }}>
                  {isPickup ? 'No delivery fee' : `+ ${formatINR(groupDeliveryDisplay)}`}
                </AppText>
              </Pressable>
            </View>
          );
        })}

        {/* "Goes well together" moved below Delivery details and renamed
            "Add more from {kitchen}" (product instruction) — same `pairs`
            data (already same-kitchen-only, R20), just relabeled/repositioned
            to read as "more from the kitchen you're already ordering from"
            rather than a generic recommendation block. See its new home
            further down, right after the Delivery details card. */}

        {/* Bug fix (product report, 2026-09-03 — rename "Delivery details"
            to "User details"): this card is the resident's own name/phone/
            address/wing/flat, not delivery logistics — just as relevant for
            self-pickup (who's picking up) as for delivery. */}
        <View className="rounded-2xl p-4" style={{ backgroundColor: colors.card }}>
          <View className="flex-row items-center justify-between">
            <AppText variant="label" style={{ color: colors.ink }}>
              User details
            </AppText>
            <Pressable onPress={() => router.push('/addresses')} disabled={placing} accessibilityRole="button">
              <AppText variant="caption" weight="bold" style={{ color: placing ? colors.muted : tone.accent }}>
                Change
              </AppText>
            </Pressable>
          </View>
          <View className="mt-3 flex-row items-start gap-2.5">
            <IconMapPin size={15} color={colors.muted} style={{ marginTop: 1 }} />
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center gap-1.5 flex-wrap">
                <AppText variant="body" style={{ color: colors.ink }} numberOfLines={1}>
                  {profile?.userName || 'You'}
                </AppText>
                {profile?.phoneNo ? (
                  <View className="flex-row items-center gap-1">
                    <IconPhone size={11} color={colors.muted} />
                    <AppText variant="caption" style={{ color: colors.muted }}>
                      {profile.phoneNo}
                    </AppText>
                  </View>
                ) : null}
              </View>
              {fullAddressLine ? (
                <AppText variant="caption" style={{ color: colors.muted, marginTop: 3, lineHeight: 16 }}>
                  {fullAddressLine}
                </AppText>
              ) : null}
            </View>
          </View>

          <View className="mt-3.5 flex-row" style={{ gap: 8 }}>
            <View className="flex-1">
              <AppText variant="overline" style={{ color: colors.muted, marginBottom: 4 }}>
                FLAT
              </AppText>
              <TextInput
                value={roomNumber}
                onChangeText={setRoomNumber}
                editable={!placing}
                placeholder="e.g. B-1204"
                placeholderTextColor={colors.muted}
                className="rounded-xl border px-3 py-2.5"
                style={{
                  // Bug fix (product report, 2026-09-03 — self-pickup carts
                  // shouldn't require wing/flat): only warn when actually
                  // required — see `flatDetailsMissing`'s `allPickup` above.
                  borderColor: !allPickup && !roomNumber.trim() ? colors.warn : colors.border,
                  backgroundColor: colors.card,
                  color: colors.ink,
                  opacity: placing ? 0.6 : 1,
                }}
              />
            </View>
            <View className="flex-1">
              <AppText variant="overline" style={{ color: colors.muted, marginBottom: 4 }}>
                WING
              </AppText>
              <TextInput
                value={wingName}
                onChangeText={setWingName}
                editable={!placing}
                placeholder="e.g. Tower B"
                placeholderTextColor={colors.muted}
                className="rounded-xl border px-3 py-2.5"
                style={{
                  borderColor: !allPickup && !wingName.trim() ? colors.warn : colors.border,
                  backgroundColor: colors.card,
                  color: colors.ink,
                  opacity: placing ? 0.6 : 1,
                }}
              />
            </View>
          </View>

          {flatDetailsMissing ? (
            <AppText variant="caption" style={{ color: colors.warn, marginTop: 8 }}>
              Wing and flat/room number are both required — the kitchen needs them to deliver.
            </AppText>
          ) : null}
          {/* Explicit Save/Update action (product instruction) — replaces
              the previous save-on-every-keystroke behavior. Disabled once
              there's nothing unsaved to write, so it can't be tapped
              redundantly; label switches to "Update" once something is
              already on disk, matching the "add a Save/Update button"
              wording literally. */}
          <Pressable
            onPress={saveFlatDetails}
            disabled={!flatDetailsDirty || flatDetailsMissing || placing}
            className="mt-3 self-start rounded-xl px-4 py-2.5"
            style={{ backgroundColor: !flatDetailsDirty || flatDetailsMissing || placing ? colors.disabled : tone.accent }}>
            <AppText variant="caption" weight="bold" style={{ color: '#fff' }}>
              {savedFlatDetails ? 'Update' : 'Save'} details
            </AppText>
          </Pressable>
        </View>

        {pairs.length > 0 ? (
          <View>
            {/* Product instruction, 2026-09-03 — "replace with a unique,
                concise upselling message": the old heading ("Add more from
                {kitchen}") just labeled the section without giving the
                resident any reason to tap through it. This keeps the same
                dynamic kitchen name (still driven by real cart data, not
                hardcoded) but frames it as an upsell instead of a bare
                label. */}
            <AppText variant="label" style={{ color: colors.ink }}>
              Complete your order — more from {meta.kitchenName}
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 10 }}>
              {pairs.map((dish) => {
                // Bug fix (product instruction, 2026-09-01 — "lunch slot is
                // gone but still able to order for lunch"): `cheapestOfferFor`
                // never excluded BLOCKED offers — for a dish that's only
                // PARTIALLY blocked (e.g. one kitchen's Lunch window closed
                // but Breakfast/Dinner are still fine elsewhere), if the
                // blocked Lunch offer happened to be the cheapest-priced one,
                // tapping ADD here would silently add THAT unorderable offer
                // straight to the cart — no slot picker, no kitchen picker,
                // no blocked check at all, unlike the full add-sheet. Scoped
                // to orderable offers first, same "activeOffers" convention
                // ApartmentDishCard.tsx's grid card already uses — only
                // falls back to every offer (blocked or not) when the WHOLE
                // dish is blocked, at which point `blocked` below already
                // swaps this card to the "Unavailable"/"Out of stock" state
                // instead of an ADD button anyway.
                const orderableOffers = dish.offers.filter((o) => !o.blocked);
                const cheapestOffer = cheapestOfferFor(orderableOffers.length > 0 ? orderableOffers : dish.offers);
                // Product instruction (2026-08-31) — same "onwards" suffix
                // as ApartmentDishCard.tsx's own grid card, and for the same
                // reason: this is the CHEAPEST of however many kitchens
                // offer the dish, not necessarily what gets charged once one
                // is actually picked. See that file's own comment.
                const priceVaries = new Set(dish.offers.map((o) => o.price)).size > 1;
                // Same "already in cart? show a qty stepper instead of an
                // Add button" treatment the browse grid's own dish cards
                // and the add-sheet's "GOES WELL WITH" cards use.
                const cartLine = cartLineForDish(lines, dish.name, dish.mealType);
                // Bug fix: this card never checked `blocked` at all — a
                // Today dish past its own meal-type's fixed cutoff window
                // (ApartmentDishCard.tsx's grid correctly disables it) could
                // still be freely ADDed from right here, since "Add more
                // from kitchen" is a separate surface built from the same
                // catalog data but skipped the check entirely. Same
                // "Unorderable"/"Out of stock" labelling as the main grid.
                const blocked = isDishBlocked(dish);
                // Root-cause fix (found during the 2026-08-31 pairing-logic
                // pass): this compared `blockReason` against the literal
                // strings `'Out of stock'`/`'Unorderable'` — the SAME bug
                // ApartmentDishCard.tsx's grid card already had fixed
                // (`blockKind`'s own comment in types.ts): Today/Instant's
                // per-kitchen cutoff message is now a dynamic, kitchen-named
                // sentence, never that literal `'Unorderable'` string, so
                // `unorderable` here could never actually become true —
                // every cutoff-blocked dish silently fell through to the
                // generic "Unavailable" instead. This surface just never got
                // the same fix applied to it. `blockKind` is the coarse,
                // stable category `blockReason`'s free text was never meant
                // to double as.
                const outOfStock = blocked && dish.offers.every((o) => o.blockKind === 'outOfStock');
                const unorderable = blocked && dish.offers.every((o) => o.blockKind === 'cutoff');
                return (
                  // Product instruction: fixed card height (identical to
                  // ApartmentAddSheet.tsx's own "GOES WELL WITH" cards —
                  // keep these two numbers in sync if either changes) so
                  // every card here — and every card on THAT other screen —
                  // is the same height regardless of description length,
                  // and so the price/action row never visibly shifts when
                  // it swaps between the "ADD" pill and the (taller) qty
                  // stepper. Same `flex:1` + `justify-content:space-between`
                  // two-group split (name/description, then price/action)
                  // ApartmentDishCard.tsx's own footer uses, absorbing
                  // whatever slack a short/absent description leaves in the
                  // middle instead of in the price row.
                  <View
                    key={dish.key}
                    style={{ width: 168, height: 236, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ height: 100, backgroundColor: accentTint(palette.accent.food, 0.14) }}>
                      {dish.imageUrl ? (
                        <Image source={{ uri: dish.imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      ) : (
                        <View className="h-full items-center justify-center">
                          <IconUtensils size={22} color={palette.accent.food} />
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1, padding: 10, justifyContent: 'space-between' }}>
                      <View style={{ gap: 3 }}>
                        <AppText variant="caption" weight="bold" style={{ color: colors.ink }} numberOfLines={1}>
                          {dish.name}
                        </AppText>
                        {dish.description ? (
                          <AppText variant="caption" style={{ color: colors.muted }} numberOfLines={2}>
                            {dish.description}
                          </AppText>
                        ) : null}
                      </View>
                      {/* Product instruction: price and the Add/qty-
                          stepper action share ONE row, same layout as the
                          browse grid's own dish cards and the add-sheet's
                          "GOES WELL WITH" cards. */}
                      <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
                        <AppText variant="label" style={{ color: colors.ink, flexShrink: 1 }} numberOfLines={1}>
                          {formatINR(cheapestOffer?.price ?? 0)}
                          {priceVaries ? <AppText variant="caption" style={{ color: colors.muted }}> onwards</AppText> : null}
                        </AppText>
                        {cartLine ? (
                          <QuantityStepper
                            count={cartLine.count}
                            onIncrease={() => setLineCount(cartLine.key, cartLine.count + 1)}
                            onDecrease={() => setLineCount(cartLine.key, cartLine.count - 1)}
                            accentColor={tone.accent}
                            decreaseLabel={`Decrease ${dish.name} quantity`}
                            increaseLabel={`Increase ${dish.name} quantity`}
                            disabled={placing}
                            // Bug fix (product instruction, 2026-09-01 — "do
                            // not allow user to add more qty than available/
                            // serving qty from anywhere"): this card never
                            // had a ceiling either — same gap as the browse
                            // grid's own card, same store-level backstop
                            // now covers the write, this just makes the "+"
                            // visibly reflect it. Advance used to be exempt
                            // here too — reversed, product instruction
                            // 2026-09-02 ("keep logic of serving and booked
                            // qty" for Advance same as Instant/Today).
                            increaseDisabled={cartLine.offer.availableQty !== undefined && cartLine.count >= cartLine.offer.availableQty}
                          />
                        ) : blocked ? (
                          <View className="items-center rounded-xl border px-2.5 py-1.5" style={{ borderColor: colors.border, flexShrink: 0 }}>
                            <AppText variant="caption" weight="bold" style={{ color: '#a8ada4' }}>
                              {outOfStock ? 'Out of stock' : unorderable ? 'Unorderable' : 'Unavailable'}
                            </AppText>
                          </View>
                        ) : (
                          // `addLine`, not `addPairing` — these come from
                          // `loadApartmentCatalog` now (the kitchen's real
                          // menu, see the effect above), each already
                          // carrying its own real offer for THIS kitchen, not
                          // a synthetic one built from `meta.kitchenId` the
                          // way a hydrated recommendation card needed. No
                          // conflict check needed here either — every dish
                          // was fetched scoped to `meta.kitchenId` already.
                          <Pressable
                            onPress={() => !placing && cheapestOffer && addLine(dish, cheapestOffer, meta.orderType, meta.apartmentId, meta.apartmentName, 1)}
                            disabled={placing}
                            className="items-center rounded-xl border px-2.5 py-1.5"
                            style={{ borderColor: placing ? colors.border : tone.accent, flexShrink: 0 }}>
                            <AppText variant="caption" weight="bold" style={{ color: placing ? colors.muted : tone.accent }}>
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

        {/* Coupons/vouchers card, then ONE combined Wallet+Cashback card —
            product instruction: match how Subscription's own cart.tsx
            designs these (a single card holding both redeem rows, a real
            `Toggle` switch rather than a checkbox, Wallet listed before
            Cashback) instead of apartment's previous three separate
            checkbox cards. Same shared `AccentIcon`/`Toggle` primitives
            Subscription's own `RedeemRow` uses — not a re-styled copy. */}
        <View className="rounded-2xl p-4" style={{ backgroundColor: colors.card }}>
          <View className="flex-row items-center gap-2.5">
            <AccentIcon icon={IconTicket} tone="reward" size={17} tileSize={34} />
            <View className="flex-1">
              <AppText variant="label" style={{ color: colors.ink }}>
                Coupons & Vouchers
              </AppText>
              {/* Honest placeholder, not a fake "Apply" flow — apartment
                  orders have no coupon/voucher catalog wired up server-side
                  yet (unlike Subscription/On Demand's own coupon
                  system), so this states that plainly rather than pretending
                  to validate a code that can never actually apply. */}
              <AppText variant="caption" style={{ color: colors.muted, marginTop: 1 }}>
                No coupons available for this order right now
              </AppText>
            </View>
          </View>
        </View>

        {/* Cashback ("Redeem Cashback") removed from this card (product
            instruction — "add payment process to Advance, keep flow same as
            Today/Instant"): see `applyWallet`'s own declaration comment
            above for why — no order type on this screen can safely redeem
            it through JusPay any more, now that Advance also places that
            way. */}
        {walletBalance > 0 ? (
          <View className="rounded-2xl" style={{ backgroundColor: colors.card, overflow: 'hidden' }}>
            <ApartmentRedeemRow
              icon={IconWallet}
              title="Use Mealawe Wallet"
              sub={applyWallet && moneyWalletUsed > 0 ? `Saving ${formatINR(moneyWalletUsed)} on this order` : `${formatINR(walletBalance)} available`}
              on={applyWallet}
              onToggle={() => setApplyWallet((v) => !v)}
              disabled={placing}
            />
          </View>
        ) : null}

        <View className="rounded-2xl" style={{ backgroundColor: colors.card, overflow: 'hidden' }}>
          {/* Collapsed by default — exact structural change from the
              design's own updated `toggleBill`/`billOpen`/`billHint`
              (previously always-expanded). Same tap-header-to-expand
              pattern Subscription's own cart.tsx already established. */}
          <Pressable onPress={() => setBillOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: billOpen }} className="flex-row items-center gap-2.5 active:opacity-80" style={{ padding: 15 }}>
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center gap-2">
                <AppText variant="label" style={{ color: colors.ink, fontSize: 14 }}>
                  Bill details
                </AppText>
                {/* Same "Saved ₹X" badge Subscription's own Total Bill
                    header shows next to its title. */}
                {totalSaving > 0 ? (
                  <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: accentTint(colors.green, 0.14) }}>
                    <AppText variant="caption" style={{ color: colors.green, fontSize: 10.5 }}>
                      Saved {formatINR(totalSaving)}
                    </AppText>
                  </View>
                ) : null}
              </View>
              <AppText variant="caption" style={{ color: colors.muted, marginTop: 2, fontSize: 11 }}>
                {billOpen ? 'Tap to collapse' : `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · taxes & delivery included`}
              </AppText>
            </View>
            <AppText variant="label" style={{ color: colors.ink, fontSize: 15 }}>
              {formatINR(grandTotal)}
            </AppText>
            {billOpen ? <IconChevronUp size={18} color={colors.muted} /> : <IconChevronDown size={18} color={colors.muted} />}
          </Pressable>

          {billOpen ? (
            <View style={{ paddingHorizontal: 15, paddingBottom: 15 }}>
              {/* Root-cause fix: switched from this file's own bespoke
                  string-value `BillRow` to the SAME shared
                  `components/ui/BillRow.tsx` Subscription checkout/Manage
                  Subscription already use — same component, not just a
                  similar-looking copy. A pickup slot's delivery row now goes
                  through the shared component's own established "FREE" +
                  struck-through-original convention (already used elsewhere
                  for a discounted delivery fee) instead of a plain "Self-
                  pickup" string, which needed a component that couldn't
                  render prose at all. "Taxes & charges" is a real line here,
                  never omitted even at ₹0 (unset/not configured) — exact
                  structure from the Claude Design's own `billLines`. Product
                  instruction, 2026-09-02: this now reflects REAL, config-
                  driven GST (`bill.ts`'s `computeApartmentCharges`) — used
                  to always show ₹0 because apartment orders had no GST
                  concept wired up at all yet, not because ₹0 was ever the
                  intended permanent value (see bill.ts's own comment). */}
              <View style={{ gap: 8 }}>
                <BillRow label="Item total" amount={groups.reduce((s, g) => s + buildApartmentGroupBill(g.lines, false, undefined, 0, ZERO_GST_CONFIG).subTotal, 0)} />
                {/* One delivery row per PAYMENT bucket, not per meal-slot
                    group — a combined Today+Instant (or multi-meal-slot
                    Today) bucket really only costs what it'll actually be
                    charged, per orderType, not per group (see
                    buildApartmentBucketBill's own comment). */}
                {paymentBuckets.flatMap((b) => {
                  const distinctOrderTypes = [...new Set(b.groups.map((g) => g.orderType))];
                  // "original" (struck-through, pickup-only) stays the
                  // client estimate — it's a hypothetical ("what delivery
                  // would have cost"), never actually charged, so there's
                  // nothing to quote for it.
                  const nonPickupBreakdown = buildApartmentBucketDeliveryBreakdown(
                    b.groups,
                    false,
                    kitchenDeliveryCharge,
                    config?.defaultDeliveryChargeByOrderType ?? DEFAULT_DELIVERY_CHARGE_BY_ORDER_TYPE,
                  );
                  // Root-cause fix (product instruction, 2026-09-01 —
                  // "delivery charges different for each type... currently
                  // showing addition on both items which is in bill
                  // combined"): a combined Today+Instant bucket used to show
                  // ONE row adding both types' own config-driven charges
                  // together with no attribution — each type's charge comes
                  // from a DIFFERENT config variable
                  // (APARTMENT_DELIVERY_INSTANT_CHARGE vs _TODAYS_CHARGE),
                  // so it reads clearer broken out: one row per distinct
                  // type actually present, each equal to and labelled with
                  // ITS OWN charge. A single-type bucket (the overwhelmingly
                  // common case — Advance is always one, Today-only or
                  // Instant-only carts too) keeps the exact same one-row
                  // rendering as before, unaffected. The bucket's own total
                  // (`bucketDelivery`, quote-preferring) is used ONLY on
                  // that single-row path — a real server quote is never
                  // split, since it doesn't come broken down by type; the
                  // multi-type path uses each row's own config-derived
                  // amount instead, which sums to the same total shown
                  // everywhere else on this screen in the normal case (no
                  // kitchen override drift between the two).
                  if (distinctOrderTypes.length > 1) {
                    return nonPickupBreakdown.map((d) => (
                      // Product instruction, 2026-09-02 — "make delivery
                      // charges 0 do not mention free": no `original` prop
                      // here any more — passing one made BillRow's own
                      // "struck-through original + FREE" convention kick in
                      // for a self-pickup row; a plain ₹0 (BillRow's normal
                      // rendering once `original` is absent) is what was
                      // actually asked for instead.
                      <BillRow
                        key={`${b.key}|${d.orderType}`}
                        label={`Delivery · ${ORDER_TYPE_LABEL[d.orderType as OrderType] ?? d.orderType}`}
                        amount={b.isPickup ? 0 : d.amount}
                      />
                    ));
                  }
                  const label = `Delivery · ${b.groups[0].mealType ?? ORDER_TYPE_LABEL[b.groups[0].orderType]}`;
                  // Product instruction, 2026-09-02 — "make delivery charges
                  // 0 do not mention free": same reasoning as the multi-type
                  // path above — no `original` prop, so a self-pickup row
                  // renders as a plain ₹0 instead of BillRow's own "FREE" +
                  // struck-through-original treatment.
                  return [<BillRow key={b.key} label={label} amount={bucketDelivery(b)} />];
                })}
                {/* Product instruction, 2026-09-02: platform charge is its
                    own config-driven line item (APARTMENT_PLATFORM_CHARGES),
                    distinct from "GST (govt. taxes)" below — omitted
                    entirely when 0 (unset/not configured) rather than a
                    redundant "₹0" row. */}
                {gstTotals.platformCharges > 0 ? <BillRow label="Platform charge" amount={gstTotals.platformCharges} /> : null}
                {gstTotals.packagingCharges > 0 ? <BillRow label="Packaging charge" amount={gstTotals.packagingCharges} /> : null}
                {/* Reverted from a BottomSheetModal popup back to an inline
                    accordion (product instruction, 2026-09-02 — "if the
                    popup is still not working, do not change the existing
                    behavior/UI, keep the current implementation as is
                    rather than introducing a broken popup"): reported not
                    opening across multiple reload attempts, and this code
                    couldn't be shown to be wrong by any static check
                    (matched `manage-subscription.tsx`'s own working
                    `BottomSheetModal` popup pattern exactly, clean
                    typecheck) — rather than keep guessing at something
                    unverifiable, this goes back to plain conditional
                    rendering: no ref, no imperative `.present()` timing, no
                    gesture-handler/bottom-sheet dependency at all, just
                    `gstBreakupOpen` state toggled by a tap — the simplest,
                    most-proven mechanism available. Keeps the ⓘ icon +
                    dotted underline "this is tappable" hint from the popup
                    attempt (a genuine, independent improvement, unrelated
                    to whichever mechanism shows the breakup itself). */}
                <Pressable onPress={() => setGstBreakupOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: gstBreakupOpen }} className="active:opacity-70">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-1">
                      <AppText variant="body" className="text-muted-foreground" style={{ textDecorationLine: 'underline', textDecorationStyle: 'dotted' }}>
                        GST (govt. taxes)
                      </AppText>
                      <IconInfo size={13} color={colors.muted} />
                      {gstBreakupOpen ? <IconChevronUp size={13} color={colors.muted} /> : <IconChevronDown size={13} color={colors.muted} />}
                    </View>
                    <AppText variant="body" className="text-foreground">
                      {formatINR(gstTotals.taxes)}
                    </AppText>
                  </View>
                </Pressable>
                {gstBreakupOpen ? (
                  <View style={{ gap: 6, paddingLeft: 14, marginTop: 6 }}>
                    {gstTotals.itemGst > 0 ? <BillRow label="Item GST (CGST + SGST)" amount={gstTotals.itemGst} /> : null}
                    {gstTotals.deliveryChargesGST > 0 ? <BillRow label="Delivery GST" amount={gstTotals.deliveryChargesGST} /> : null}
                    {gstTotals.platformChargesGST > 0 ? <BillRow label="Platform charge GST" amount={gstTotals.platformChargesGST} /> : null}
                    {gstTotals.packagingChargesGST > 0 ? <BillRow label="Packaging charge GST" amount={gstTotals.packagingChargesGST} /> : null}
                  </View>
                ) : null}
                {moneyWalletUsed > 0 ? <BillRow label="Wallet credit" amount={-moneyWalletUsed} positive /> : null}
              </View>
              <View className="my-2.5 border-t border-dashed" style={{ borderColor: colors.border }} />
              <View className="flex-row items-center justify-between">
                <AppText variant="label" style={{ color: colors.ink }}>
                  To pay
                </AppText>
                <AppText variant="label" style={{ color: colors.ink }}>
                  {formatINR(payableTotal)}
                </AppText>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View className="px-4 pt-2" style={{ paddingBottom: insets.bottom + 14 }}>
        <Pressable
          onPress={placeAllOrders}
          disabled={revalidateNeeded || placing || flatDetailsMissing || advanceDeliverySlotMissing}
          className="flex-row items-center justify-between rounded-2xl px-4 py-4"
          style={{ backgroundColor: revalidateNeeded || placing || flatDetailsMissing || advanceDeliverySlotMissing ? colors.disabled : tone.accent }}>
          {/* Bug fix: this showed `grandTotal` (the gross bill, before
              wallet is deducted) — so a resident whose Wallet covered the
              ENTIRE order still saw the full pre-discount amount on the one
              button that actually places it, right next to a bill section
              one tap away showing ₹0 "To pay". This is the real payable
              figure (`payableTotal`, same value as "To pay" in Bill details
              above) — genuinely ₹0 when Wallet covers everything, and the
              button stays enabled at ₹0: `startApartmentPayment`'s own
              server-side dispatch (`netPayableAmount > 0 ? open JusPay :
              place directly`) already handles a ₹0 net amount for every
              order type, so nothing extra is needed here for that to work. */}
          <AppText variant="label" style={{ color: '#fff' }}>
            {formatINR(payableTotal)}
          </AppText>
          <AppText variant="label" style={{ color: '#fff' }}>
            {placing
              ? 'Placing…'
              : revalidateNeeded
                ? 'Resolve to continue'
                : flatDetailsMissing
                  ? 'Add flat details'
                  : advanceDeliverySlotMissing
                    ? 'Choose a delivery slot'
                    : 'Place order'}
          </AppText>
        </Pressable>
      </View>

      {/* Bug fix (product instruction — "make sure do not allow any
          loophole to [combine] advance from anywhere"): this screen's own
          "Add more from this kitchen" button can raise the SAME
          kitchen/order-type `conflict` every other add path in this feature
          does (see `addLine`'s own internal `checkKitchenConflict` call) —
          without this, that conflict was still correctly BLOCKING the add,
          just silently, with no explanation shown. */}
      <ApartmentConflictModal conflict={conflict} currentKitchenName={meta?.kitchenName} onStartNewOrder={startNewOrderFromConflict} onDismiss={dismissConflict} />
    </View>
  );
}

/** One rib per placed order on the results screen — same shape as the
 * add-to-cart CTA rib (BottomOverlayStack's CtaSlideCard): price/subtitle
 * on the left, a white "View order" pill on the right.
 *
 * Pulled out of an inline `results.map()` callback into its own component
 * so `useApartmentAdvanceSlotWindow` (a real hook) can be called correctly,
 * once per row — hooks can't run inside a loop/map callback. */
function PlacedOrderRow({ result, order, onView }: { result: GroupResult; order: ApartmentOrder; onView: (order: ApartmentOrder) => void }) {
  const advanceSlotWindow = useApartmentAdvanceSlotWindow(order);
  const todayPrepEndTime = useApartmentTodayPrepEndTime(order);
  const readyLabel = apartmentOrderReadyLabel(order, advanceSlotWindow, todayPrepEndTime);
  return (
    <View style={shadow.card} className="flex-row items-center justify-between rounded-2xl bg-white px-4 py-3.5">
      {/* Bug fix (product decision): title + status + button used to compete
          for the same tight row, reading as congested — a fixed gap keeps
          the button clear of the text column regardless of how long the
          title gets, and the pill shape matches the same tightened
          treatment BottomOverlayStack's own ribs now use. */}
      <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
        <AppText variant="label" style={{ color: palette.apartment.ink }} numberOfLines={1}>
          Order #{order.orderNo}
          {result.mealType ? ` · ${result.mealType}` : result.itemNames.length > 0 ? ` · ${result.itemNames.join(', ')}` : ''}
        </AppText>
        <AppText variant="caption" style={{ color: apartmentOrderStatusColor(order.orderstatus), marginTop: 2 }} numberOfLines={1}>
          {apartmentOrderStatusLabel(order.orderstatus)}
        </AppText>
        {/* Product instruction, 2026-09-03 — "when Order placed... also
            need to show Ready to deliver... if Instant/Today... and for
            advance delivery slot [and time]". */}
        {readyLabel ? (
          <AppText variant="caption" style={{ color: palette.apartment.muted, marginTop: 1 }} numberOfLines={1}>
            {readyLabel}
          </AppText>
        ) : null}
      </View>
      <Pressable
        onPress={() => onView(order)}
        accessibilityRole="button"
        className="flex-row items-center gap-1 rounded-full px-3.5 py-2 active:opacity-90"
        style={{ backgroundColor: palette.apartment.page, flexShrink: 0 }}>
        <AppText variant="caption" weight="bold" style={{ color: palette.apartment.green }}>
          View order
        </AppText>
        <IconArrowRight size={14} color={palette.apartment.green} />
      </Pressable>
    </View>
  );
}

/** Same shape as Subscription's own local `RedeemRow` (cart.tsx) — a
 * tinted `AccentIcon`, title + dynamic sub-line (green once active and
 * actually saving something), and a real `Toggle` switch instead of the
 * checkbox this screen used before. Kept local (not shared) since
 * Subscription's own copy is local too — genuinely identical markup,
 * duplicated once already, not worth extracting for a third caller that
 * doesn't exist yet. */
function ApartmentRedeemRow({
  icon,
  title,
  sub,
  on,
  onToggle,
  divider,
  disabled,
}: {
  icon: ComponentType<IconProps>;
  title: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
  divider?: boolean;
  /** Bug fix (product instruction, 2026-09-01 — "after placing the button
   * goes disabled, data should not be editable"): a placement already in
   * flight has already captured whatever wallet amount was selected at that
   * moment (see placeAllOrders' own `remainingWallet` walk) — flipping this
   * mid-flight can't change what's already being submitted, it just looked
   * like it should. */
  disabled?: boolean;
}) {
  const { colors } = useApartmentColors();
  return (
    <Pressable
      onPress={disabled ? undefined : onToggle}
      disabled={disabled}
      className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-80"
      style={divider ? { borderBottomWidth: 1, borderBottomColor: colors.borderSoft } : undefined}>
      <AccentIcon icon={icon} tone="reward" size={18} tileSize={38} />
      <View className="flex-1">
        <AppText variant="body" style={{ color: colors.ink }}>
          {title}
        </AppText>
        <AppText variant="caption" style={{ color: on ? colors.green : colors.muted }}>
          {sub}
        </AppText>
      </View>
      <Toggle value={on} onChange={onToggle} accessibilityLabel={title} disabled={disabled} />
    </Pressable>
  );
}

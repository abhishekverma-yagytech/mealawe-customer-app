/**
 * Apartment ordering — menu-first browsing inside the resident's own apartment complex,
 * against the server's `ApartmentOrder`/`ApartmentMenu`/`ApartmentStandardMenu`/
 * `KitchenPartner` model. Three order types, matching the server's own enums — a
 * top-level tab switch, not a filter.
 */
export type OrderType = 'instant' | 'today' | 'advance';

export type MealType = 'Breakfast' | 'Lunch' | 'HighTea' | 'Dinner';

export type FulfillmentMode = 'delivery' | 'pickup';

/** One of a kitchen's own enabled Advance delivery windows, pre-filtered to enabled
 * slots and in Breakfast/Lunch/HighTea/Dinner order. Kitchen-level, not item-level. */
export interface AdvanceDeliverySlot {
  mealType: MealType;
  deliveryStartTime: string;
  deliveryEndTime: string;
}

/** A kitchen serving this apartment complex, from `POST /api/getNearestKitchensOfApartment`.
 * Only the fields this app actually uses are typed; the wire payload carries more
 * (compliance docs, phone/email — never log those). */
export interface ApartmentKitchen {
  _id: string;
  kitchenName: string;
  imageUrl?: string;
  rating?: number;
  kitchenOpened: boolean;
  mealType?: string[];
  cuisine?: string;
  mealTiming?: { mealType: MealType; acceptOrderFrom?: string; acceptOrderTill?: string }[];
  apartmentInfo?: { apartmentId: string; apartmentName?: string };
  apartmentSettings?: {
    todayEnabled: boolean;
    instantEnabled: boolean;
    instantStartTime: string;
    instantEndTime: string;
    advanceEnabled: boolean;
    fulfillmentModes: Record<OrderType, { deliveryEnabled: boolean; pickupEnabled: boolean }>;
    autoAccept: Record<OrderType, boolean>;
    deliveryCharge: number | null;
    advanceBlockedDates: string[];
    /** This kitchen's own per-meal-slot Advance DELIVERY windows — on/off toggle +
     * start/end time per meal type. Missing entry means "disabled", never crash on it. */
    advanceSubTypes?: Partial<Record<MealType, { enabled: boolean; deliveryStartTime: string; deliveryEndTime: string }>>;
    /** This kitchen's own per-meal-slot Today PREP window — different from
     * `mealTiming`'s accept-order window: `prepStartTime` gates Today's order cutoff,
     * `prepEndTime` is when the kitchen expects the order to be ready. */
    todaySubTypes?: Partial<Record<MealType, { enabled: boolean; prepStartTime: string; prepEndTime: string }>>;
    /** Which wing/block the kitchen itself is in. `null`/absent means unset — show
     * nothing, not a placeholder. */
    wingName?: string | null;
    roomNumber?: string | null;
  };
  distance?: number;
  /** This kitchen's own real street address — replaces `distance` as the kitchen-picker's
   * fallback when a kitchen hasn't set a wing/room. */
  address?: { address1?: string; address2?: string; landmark?: string };
}

/** One day-scoped item from a kitchen's `ApartmentMenu.itemList` — covers Today (`tags`
 * includes `'today'`) and a kitchen's own curated Advance dishes (`'advance'`, future
 * `itemServingDate`), plus any daily item can additionally be tagged `'instant'`. */
export interface ApartmentMenuItem {
  _id: string;
  itemId: string;
  itemName: string;
  imageUrl?: string;
  itemType: 'Veg' | 'NonVeg' | 'Jain';
  itemServingDate: string;
  mealType?: MealType;
  itemPrice: number;
  itemDescription?: string;
  tasteOfRegion?: string;
  servesTo?: number;
  /** This dish's own serving SIZE from THIS kitchen (e.g. "250 ml", "6 Piece") — distinct
   * from `servesTo`, a people-count. Genuinely per-kitchen, not a dish-wide constant. */
  servingQuantity?: number;
  servingQuantityUnit?: string;
  quantityAvailable?: number;
  quantityBooked?: number;
  preparationTime?: number;
  /** Minimum order quantity for this dish from THIS kitchen. Undefined/1 means no floor. */
  moq?: number;
  tags: ('today' | 'instant' | 'advance')[];
  pairedItemIds?: string[];
}

/** The admin-curated shared catalog (`ApartmentStandardMenu`) — Instant/Advance only,
 * never Today. A kitchen opts in per (item, type) pair via `standardMenuSelections`. */
export type StandardMenuType = 'instant' | 'advance';

export interface ApartmentStandardMenuItem {
  _id: string;
  itemName: string;
  imageUrl?: string;
  itemDescription?: string;
  itemType: 'Veg' | 'NonVeg' | 'Jain';
  itemPrice: number;
  menuTypes: StandardMenuType[];
  advanceLeadDays?: number;
  // R18 — the admin-set catalog value (minutes to prepare), sourced from
  // the server's `estimatedTime` field (required there when 'instant' is
  // one of `menuTypes` — see apartmentStandardMenu.model.js's own doc
  // comment). NOT a per-kitchen override — unlike advanceLeadDays/
  // instantQty below, no such override field exists on a kitchen's own
  // opt-in (`StandardMenuSelection`, below) for prep time; every kitchen
  // serving this item shares the one admin-set value.
  // Only ever meaningful when this item is being merged for Instant (see
  // catalog.ts's mergeStandardCatalog).
  preparationTime?: number;
  // Kitchen's own daily serving cap for Instant (e.g. "20 samosas today").
  instantQty?: number;
  // Server-tracked running count already booked today; NOT client-editable.
  // `instantQtyBookedDate` is the server-local 'YYYY-MM-DD' it applies to — a stale date
  // means "nothing booked yet today" even if the count itself looks nonzero.
  instantQtyBookedToday?: number;
  instantQtyBookedDate?: string;
  mealType?: MealType;
  cuisines?: string[];
  /** Catalog-item-level promo media ("Kitchen Reel"). `bannerImages` falls back to the
   * item's own `imageUrl` server-side, so it's rarely empty; `bannerVideos` has no such
   * fallback. */
  bannerImages?: string[];
  bannerVideos?: string[];
}

/** One kitchen's opt-in list — `{itemId, menuType}` pairs, no hydrated item data (the
 * client joins against `ApartmentStandardMenuItem` by id). */
export interface StandardMenuSelection {
  kitchenId: string;
  kitchenOpened: boolean;
  selections: {
    itemId: string;
    menuType: StandardMenuType;
    // This kitchen's OWN override for this one opt-in, per R7/K2's "the
    // admin catalog no longer sets this per item, each kitchen decides"
    // rule — never fall back to a catalog-wide value for these, and never
    // apply one for a menuType it doesn't belong to (see catalog.ts's
    // mergeStandardCatalog for why that matters — a stray value here
    // leaking into the wrong order type was a confirmed bug).
    advanceLeadDays?: number; // only meaningful when menuType === 'advance'
    // Deliberately NO `preparationTime` field here — a real server
    // `standardMenuSelections` sub-doc has never had one (root-cause fix:
    // see ApartmentStandardMenuItem's own comment above). Prep time for a
    // standing item is the shared catalog's admin-set value, not something
    // any individual kitchen's opt-in overrides.
    instantQty?: number; // only meaningful when menuType === 'instant' — K4 daily serving cap
    instantQtyBookedToday?: number; // only meaningful when menuType === 'instant' — see ApartmentStandardMenuItem's comment
    instantQtyBookedDate?: string; // only meaningful when menuType === 'instant'
  }[];
}

/**
 * One way to order a given dish — a specific kitchen (and, for Advance, a specific
 * serving date). `source` tells the cart builder which id space `itemId` lives in.
 */
export interface ApartmentDishOffer {
  kitchenId: string;
  kitchenName: string;
  source: 'daily' | 'standard';
  /** Daily: the `ApartmentMenu.itemList` subdoc id (drives stock booking/restore).
   * Standard: the shared catalog id (same value across every kitchen offering it). */
  itemId: string;
  price: number;
  mealType?: MealType;
  /** Set once a specific date is chosen (Advance only). */
  itemServingDate?: string;
  preparationTime?: number;
  /** This offer's own serving size from THIS kitchen — see
   * `ApartmentMenuItem.servingQuantity`/`servingQuantityUnit`'s own comment.
   * Genuinely per-kitchen: two kitchens serving the same dish can set
   * different values, so the View More sheet must read THIS offer's own
   * copy (the currently-selected kitchen's), never a dish-wide constant. */
  servingQuantity?: number;
  servingQuantityUnit?: string;
  /** This kitchen's own rating/cuisine — copied straight from the
   * `ApartmentKitchen` object each merge function already receives, so the
   * kitchen picker (ApartmentAddSheet) can show more than just a name/price
   * when choosing between several kitchens serving the same dish. */
  kitchenRating?: number;
  kitchenCuisine?: string;
  /** Which wing/block the kitchen itself is in — "if any" (see
   * `ApartmentKitchen.apartmentSettings`'s own comment); undefined/null
   * when the kitchen never set one. Shown in the add-sheet's kitchen
   * picker so a resident doing self-pickup knows where to walk. */
  kitchenWingName?: string | null;
  kitchenRoomNumber?: string | null;
  /** Bug fix (product report, 2026-09-03 — "still showing kilometers which
   * needs to be removed and show address instead"): replaces the earlier
   * `kitchenDistance` (km) fallback — this offer's kitchen's own real short
   * street address instead, copied from `ApartmentKitchen.address` (see its
   * own comment). The fallback the kitchen picker shows when a kitchen
   * hasn't set a wing/room — see `kitchenAddress()` in ApartmentAddSheet.tsx. */
  kitchenStreetAddress?: string;
  /** Today only — this offer's own meal slot's PREP-END time at this
   * kitchen ("HH:mm", 24h — `ApartmentKitchen.apartmentSettings.
   * todaySubTypes[mealType].prepEndTime`, see that field's own comment for
   * why it's a different concept from the order-acceptance window).
   * Product instruction, 2026-09-03 — "ready to deliver after {prep end
   * time}", not a guessed now-plus-duration estimate. `undefined` for
   * Instant/Advance (no such concept) or a kitchen that hasn't configured
   * this slot. */
  kitchenPrepEndTime?: string;
  /** This offer's kitchen's own delivery/pickup support for THIS order
   * type (`apartmentSettings.fulfillmentModes[orderType]`) — lets the
   * add-sheet show real "Delivery or self-pickup" / "Self-pickup only" /
   * "Delivery only" copy instead of always implying both are available
   * (the cart screen's own pickup checkbox used to render unconditionally,
   * regardless of what the kitchen actually supports). */
  kitchenFulfillmentModes?: { deliveryEnabled: boolean; pickupEnabled: boolean };
  /** How many of THIS item THIS kitchen can STILL serve today — undefined
   * means no cap (fail open, matches server convention). Two different
   * sources feed this depending on `source`, but both are now genuine
   * REMAINING stock, not a static ceiling:
   *  - `daily` (kitchen's own dated item, tagged Instant): `quantityAvailable
   *    - quantityBooked` (server-tracked, decrements as real orders come in).
   *  - `standard` (shared-catalog opt-in): the kitchen's own declared daily
   *    cap MINUS its own running `instantQtyBookedToday` (server added real
   *    per-day booking tracking for standing items too — see
   *    `apartmentMenu.model.js`'s `instantQtyBookedToday`/`instantQtyBookedDate`
   *    and the atomic `reserveInstantStock` reservation at order time; this
   *    field mirrors that on the client so the "switch kitchen" flow below
   *    reasons about the same number the server will actually enforce,
   *    computed in pricing.ts's mergeStandardItem). The server's atomic
   *    reservation is still the real backstop against overselling either
   *    way — this is what keeps the CLIENT's own number from being stale.
   * Only ever populated for Instant offers; undefined for every other order
   * type, since this is what drives the Instant "switch kitchen if this one
   * can't cover the count I want" flow in ApartmentAddSheet. */
  availableQty?: number;
  /** Minimum order quantity for THIS offer specifically (a kitchen's own
   * `moq`, see `ApartmentMenuItem.moq`'s comment) — per-OFFER, not
   * per-dish, since two kitchens serving the same dish can set different
   * floors. Undefined/1 means no floor. */
  moq?: number;
  /** Daily items only — R20 pairing is same-kitchen-only, so this is
   * necessarily per-offer, not per-dish. */
  pairedItemIds?: string[];
  /** True when this exact (kitchen, date) combo is currently ineligible (closed/off, or
   * past cutoff). Blocked offers still render but can't be selected. */
  blocked: boolean;
  blockReason?: string;
  /** Coarse CATEGORY of why this offer is blocked — separate from
   * `blockReason`'s free-text human sentence (which, for Today/Instant's
   * per-kitchen cutoff messages, now names the specific kitchen/meal-type/
   * slot and so can never be exact-string-matched against a fixed literal
   * again — that was a real bug: ApartmentDishCard's card-level "Unorderable"
   * vs "Unavailable" pill used to compare `blockReason` against the literal
   * string `'Unorderable'`, which broke the moment that reason became a
   * dynamic sentence). `mergeDailyItems`/`mergeStandardItem` (pricing.ts)
   * always stamp `'outOfStock'` for a stock-exhaustion block (overriding
   * whatever the caller's `isBlocked` returned, same priority the existing
   * `blockReason` override already had); every other kind is whatever the
   * caller's own `isBlocked` callback decided (`'cutoff'` for Today/Instant's
   * server-determined "not currently eligible" case, `'other'`/undefined for
   * anything else, e.g. Advance's "kitchen marked this date off"). */
  blockKind?: 'outOfStock' | 'cutoff' | 'other';
  /** This offer's kitchen's own `mealTiming` (U11/R15 — lets the Advance add
   * sheet warn/disable pre-submit once a day+slot combo is within the
   * Advance cutoff window, instead of only finding out from the server's
   * ADVANCE_CUTOFF_PASSED error after tapping Add. Same source data the
   * server's own assertWithinAdvanceCutoff reads (`kitchenPartnerDao
   * .getMealTiming`) — mirrored here for pre-submit UX only; the server
   * call remains the actual enforcement, this never replaces it. */
  kitchenMealTiming?: ApartmentKitchen['mealTiming'];
}

/**
 * One dish, grouped by name across every kitchen offering it under the ACTIVE order-type
 * tab (never across tabs). Kitchen selection happens inside the add-to-cart sheet, from
 * `offers` — browse by dish, pick the kitchen last.
 */
export interface ApartmentDish {
  key: string;
  name: string;
  imageUrl?: string;
  description?: string;
  isVeg: boolean;
  mealType?: MealType;
  cuisines?: string[];
  rating?: string;
  ribbon?: string;
  /** "Serves N" — only populated from a kitchen's own daily dated item; the shared
   * standing catalog has no such field, so this stays undefined for a standing-only dish. */
  servesTo?: number;
  /** Every order type this dish carries a tag/menuType for — NOT limited to the active tab. */
  badgeTypes: OrderType[];
  /** Present when at least one offer is a standing (shared-catalog) item — drives the
   * date picker's lead-time floor for Advance standing offers. */
  standingType?: StandardMenuType;
  advanceLeadDays?: number;
  /** "Kitchen Reel" media — only populated for a standing-catalog item; a daily item has
   * no such fields, so this stays undefined there. */
  bannerImages?: string[];
  bannerVideos?: string[];
  offers: ApartmentDishOffer[];
}

/** One line in the Apartment cart. Single-kitchen per cart is enforced by both the design
 * and the server, but multiple order TYPES from that same kitchen are allowed in one
 * cart/session — each type still submits as its own separate `ApartmentOrder` at
 * checkout. `_id`/`itemId` for daily items must be the real `ApartmentMenu.itemList`
 * subdoc id — never let the client mint its own. */
export interface ApartmentCartLine {
  /** `${dishKey}|${mealType ?? ''}|${itemServingDate ?? ''}` — dedupe key. */
  key: string;
  dishName: string;
  imageUrl?: string;
  isVeg: boolean;
  offer: ApartmentDishOffer;
  orderType: OrderType;
  count: number;
}

/** Cart-level context — which KITCHEN this cart is currently scoped to. `null` once the
 * cart is emptied. `orderType` is informational only (the most-recently-added line's
 * type) — not authoritative once multiple types can coexist; `groupCartLines`/each
 * line's own `orderType` is the real source of truth at checkout. */
export interface ApartmentCartMeta {
  orderType: OrderType;
  kitchenId: string;
  kitchenName: string;
  apartmentId: string;
  apartmentName?: string;
}

/** Per-meal-slot delivery/self-pickup choice, keyed by the same mealType group a cart
 * line carries. */
export type PickupBySlot = Record<string, boolean>;

/** `POST /api/apartmentOrder`'s created-order response — the fields this app actually
 * reads. No payment step exists on this path — a 200 here means the order is already
 * `placed`/`accepted`; never open a payment SDK for it. */
export interface ApartmentOrder {
  _id: string;
  orderNo: number;
  orderType: OrderType;
  kitchenId: string;
  kitchenName: string;
  /** Snapshot of the kitchen's own contact info at placement time, for a "call the
   * kitchen" affordance (most useful for self-pickup). `kitchenmapTelNo` is the server's
   * own separate tel-link number and occasionally differs from `kitchenPhoneNo`. */
  kitchenPhoneNo?: string;
  kitchenmapTelNo?: string;
  kitchenAddress?: { address1?: string; address2?: string; landmark?: string };
  kitchenGeolocation?: { lat: number; lng: number };
  apartmentId: string;
  apartmentName?: string;
  wingName?: string;
  roomNumber?: string;
  /** Snapshot of the resident's own delivery address at placement time, for the
   * order-detail screen. Kept as its own local structural type rather than importing
   * `CustomerLocation` (this file stays dependency-free by convention). */
  customerLocation?: {
    tagLocation?: string;
    address?: string;
    location?: string;
    landmark?: string;
    pincode?: string | number;
    city?: string;
    state?: string;
  };
  /** For Today, the per-item slot a dish is tagged under. For Advance, this is repurposed
   * as a whole-order choice of which of the kitchen's configured delivery windows the
   * order should arrive in (Advance items carry no mealType of their own). */
  mealType?: MealType;
  itemServingDate?: string;
  fulfillmentMode: FulfillmentMode;
  /** Persisted on the model but only read by the "View order" detail screen. Present on
   * both the create-response and `GET .../:orderId`. */
  itemList?: {
    itemId?: string;
    itemName: string;
    itemPrice: number;
    count: number;
    itemType?: 'Veg' | 'NonVeg' | 'Jain';
    mealType?: string;
  }[];
  itemAmount: number;
  deliveryCharges: number;
  packagingCharges?: number;
  platformCharges?: number;
  taxes: number;
  discount?: number;
  /** Persisted GST fields — all optional since genuinely absent on an order placed before
   * this existed, or on order types never GST-eligible, not just zero. */
  cgst?: number;
  sgst?: number;
  deliveryChargesGST?: number;
  packagingChargesGST?: number;
  platformChargesGST?: number;
  /** Coupon/voucher passthrough — the human-readable codes actually applied, shown
   * alongside their own discount amount rather than folded into `discount`. */
  couponCode?: string;
  couponDiscount?: number;
  voucherCode?: string;
  voucherDiscount?: number;
  extraDiscount?: number;
  /** Mealawe Wallet / cashback actually redeemed against this order. */
  moneyWalletPointsUsed?: number;
  mealaweWalletPointsUsed?: number;
  payableAmount: number;
  orderstatus: string;
  apartmentOtp?: string;
  acceptanceDeadline?: string | null;
  estimatedFulfillmentMinutes?: number;
  orderDate: string;
  /** `createdAt`/`updatedAt` — Mongoose timestamps, always present on a real
   * order (only genuinely optional in the type because very old/synthetic
   * test fixtures might omit them). */
  createdAt?: string;
  updatedAt?: string;
  /** Status-transition audit trail (`apartmentOrder.model.js`'s
   * `statusHistory`) — every push (including the initial one at creation)
   * carries a real server timestamp. Used to find WHEN this order was
   * actually accepted (`orderstatus === 'accepted'`), since that's when a
   * kitchen's prep clock genuinely starts — not order placement, which for
   * a non-auto-accept kitchen can sit in the acceptance window for a while
   * first. See apartment-order-detail.tsx's live Instant countdown.
   * `normalizeApartmentOrder` already passes this through untouched (it
   * spreads the raw response) — declaring it here just gives that same
   * already-present data a type. */
  statusHistory?: { orderstatus: string; updatedOn: string }[];
}

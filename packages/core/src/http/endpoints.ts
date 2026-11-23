/**
 * Central API endpoint registry. Paths verified against the live backend via
 * the Ionic apps (mealaweApp / MealaweUserApp) apiConfig + apiMain services.
 * Base URL comes from `env.serverUrl` (https://api.mealawe.com).
 */
export const ENDPOINTS = {
  auth: {
    /** POST — send OTP to a phone number. Body: { phoneNo, registeredPlatform } */
    registerPhoneNo: '/authuser/registerPhoneNo',
    /** POST — resend OTP. Body: { phoneNo, registeredPlatform } */
    resendOtp: '/authuser/resendOTP',
    /** POST — verify OTP. Body: { phoneNo, password: otp, userType:'customer', registeredPlatform } -> { token, loginInfo } */
    verifyOtp: '/authuser/verifyOTP',
    /** GET — logout */
    logout: '/authuser/logout',
    /** GET /api/getActiveLoginVideo → LoginVideoConfig | null (admin-configured
     * login-screen background video, dashboard-managed, common to every user —
     * no cluster scoping; null/error falls back to a gradient, see
     * useHeroVideoPlayer). No auth required — fetched before the user logs in. */
    activeLoginVideo: '/api/getActiveLoginVideo',
  },
  profile: {
    /** POST — save/retrieve customer profile. Body: loginInfo -> userProfile */
    customerProfile: '/api/customerProfile',
    /** POST /api/updatecustomerprofile/:id — update profile */
    updateProfile: '/api/updatecustomerprofile',
    /** POST — save FCM token. Body: { profileId, fcmToken } */
    saveFcmToken: '/api/saveFcmToken',
    /** POST — remove FCM token on logout. Body: { profileId } */
    removeFcmToken: '/api/removeFcmToken',
    /** POST — register this device's ActivityKit push-to-start token (iOS
     * only). Body: { profileId, pushToStartToken } — see
     * `docs/LIVE-ACTIVITY-PUSH-UPDATES-PLAN.md` §3.3. */
    registerLiveActivityPushToStartToken: '/api/registerLiveActivityPushToStartToken',
    /** POST — register/refresh the per-activity update token for the
     * currently-active Live Activity (iOS only). Body: { profileId,
     * activityId, pushToken }. */
    registerLiveActivityUpdateToken: '/api/registerLiveActivityUpdateToken',
    /** GET /api/validateReferralCode/:code -> { referralCodeValid } */
    validateReferralCode: '/api/validateReferralCode',
    /** POST /api/updatecustomercurrlocation/:id — set the active delivery address */
    updateCurrentLocation: '/api/updatecustomercurrlocation',
  },
  wallet: {
    /** GET /api/getWalletBalance/:id — Mealawe Money balance */
    balance: '/api/getWalletBalance',
    /** GET /api/userRewardsPointsHistory/:id/:page/:perPage — wallet transactions */
    history: '/api/userRewardsPointsHistory',
    /** GET /api/getCashbackBalance/:id — cashback points balance */
    cashbackBalance: '/api/getCashbackBalance',
    /** GET /api/getCashbackListUser/:id/:page — cashback history */
    cashbackHistory: '/api/getCashbackListUser',
  },
  support: {
    /** GET /api/getUserFAQ — help FAQs */
    faq: '/api/getUserFAQ',
    /** POST /api/getVariables — body { variableNames: [...] } → config values */
    variables: '/api/getVariables',
    /** POST /api/saveGeneralAppFeeback — submit app feedback (backend spelling kept) */
    feedback: '/api/saveGeneralAppFeeback',
  },
  /** Live support chat — realtime transport is Socket.IO (see features/chat/socket.ts); these are just the REST bootstrap/history calls. */
  supportChat: {
    /** POST /supportChat/start — body { userId, userName?, userPhoneNo?, subject? } → ChatSession (one open session per user). */
    start: '/supportChat/start',
    /** GET /supportChat/:sessionId/messages?userId=&before=&limit= → ChatMessage[] (paginated history; live messages arrive over the socket). */
    messages: '/supportChat',
  },
  /** Serviceable-area (cluster) geofencing + per-cluster config. */
  cluster: {
    /** GET /api/getGeoFencingList → Cluster[] (polygons); detect via point-in-polygon locally. */
    geoFencingList: '/api/getGeoFencingList',
    /** POST /api/searchClusterVariable — body { configName } → per-cluster charge/config values. */
    searchVariable: '/api/searchClusterVariable',
  },
  /** Food subscription (meal packages, weekly menu, coupons). */
  subscription: {
    /** POST /api/getMealPackageListCluster — body { custerList: string[] } → MealPackage[] (backend spelling). */
    mealPackageList: '/api/getMealPackageListCluster',
    /** GET /api/getSubscriptionWeeklyMenu/:category/:clusterId → weekly menu docs. */
    weeklyMenu: '/api/getSubscriptionWeeklyMenu',
    /** POST /api/getValidClusterUserCouponList/:customerId — body { clusters: string[] } → coupons. */
    validCoupons: '/api/getValidClusterUserCouponList',
    /** GET /api/validateCouponForUser/:couponCode/:userId/:clientDate →
     * { status: 'VALID_OFFER' | 'INVALID' | 'ERROR', msg?: string } — the
     * only place couponUsage (oneTimeOneUser/oneTimeOneDay) limits are
     * actually enforced. `clientDate` only needs to be present/truthy (an
     * ISO string works); the server computes its own "today" boundary. */
    validateCouponForUser: '/api/validateCouponForUser',
    /** POST /api/validateClusterVoucherCode/:voucherCode/:userId/:orderType —
     * body { clusters: string[] } → { status: 'VALID_OFFER' | 'INVALID',
     * msg?: string, voucher?: Voucher }. Vouchers are a separate, simpler
     * redemption system from coupons — no browsable list, resolved by code
     * only (see `Voucher` in subscription/types.ts and `validateVoucherCode`
     * in couponApi.ts). */
    validateVoucherCode: '/api/validateClusterVoucherCode',
    /** GET /api/getSubscriptionCategoryListByClusterConfig/:clusterConfigName → ServerSubCategory[] (admin-managed, replaces the static per-cluster arrays). */
    categoryList: '/api/getSubscriptionCategoryListByClusterConfig',
    /** GET /api/getSubscriptionReviewListByClusterConfig/:clusterConfigName → ServerReview[] (admin-managed home testimonials). */
    reviewList: '/api/getSubscriptionReviewListByClusterConfig',
  },
  /** Customer orders / subscriptions. */
  orders: {
    /** GET /api/getCustomerCurrentOpenOrders/:id/:todayStartMs → grouped active orders. */
    currentOpen: '/api/getCustomerCurrentOpenOrders',
    /** GET /api/getCustomerSubscriptionList/:id/:page → subscription day-orders (paginated). */
    subscriptionList: '/api/getCustomerSubscriptionList',
    /** GET /api/getOrderSubscription/:id → a single subscription order. */
    orderSubscription: '/api/getOrderSubscription',
    /** GET /api/trackdeliveryTask/:taskId/:partner → { runner: { location: { lat, lng } } } (backend spelling). */
    trackDeliveryTask: '/api/trackdeliveryTask',
    /** GET /api/getFoodOrder/:id → order with runner.location, used when there's no deliveryTaskId yet. */
    getFoodOrder: '/api/getFoodOrder',
    /** GET /api/getDirections/:originLat/:originLng/:destLat/:destLng → { polyline, distanceMeters, durationSeconds, durationInTrafficSeconds, etaText }. */
    getDirections: '/api/getDirections',
    /** GET /api/getCustomerPackageList/:id/:page → dine-in/package day-orders (paginated), same shape as subscriptionList. */
    packageList: '/api/getCustomerPackageList',
    /** GET /api/getCustomerPastOrdersByType/:id/:page/:clientDateIso/:type → FoodOrder[]. type ∈ 'subscription' (Meal Orders) | 'allDay' (On Demand Orders). */
    pastOrdersByType: '/api/getCustomerPastOrdersByType',
    /** GET /api/getOrdersByOrderTypeAndCustomerId/:orderType/:id → FoodOrder[]. orderType ∈ 'oyo' | 'apartment'. */
    byTypeAndCustomer: '/api/getOrdersByOrderTypeAndCustomerId',
    /** GET /api/getOrderPackage/:orderId → the full FoodOrderPackage doc (subscriptionPackage
     * orders only — parallel to orderSubscription for subscriptionParent). Includes
     * `dailyOrderList[]`: { foodOrderId, orderNo, mealType, orderDate, orderstatus, amount,
     * mealaweTotalAmt, ... } — the real per-day child orders for this package. NOTE:
     * dailyOrderList[].orderstatus is a creation-time snapshot, never updated live server-side —
     * pair with childOrdersStatusByPackage below for accurate current status. */
    orderPackage: '/api/getOrderPackage',
    /** GET /api/getChildOrdersStatusByPackageId/:packageId → [{ foodOrderId, orderstatus,
     * supportReaction, mealType, orderDate, deliveredAt }] — FRESH per-child-order status queried
     * live off the FoodOrder collection (no orderNo/amount; join on foodOrderId with
     * dailyOrderList from orderPackage for those). deliveredAt is the child's statusHistory
     * 'delivered' timestamp, or null. Superseded by `foodOrdersByPackage` below for this app's
     * own child-orders list — kept here only because other backend clients may still call it. */
    childOrdersStatusByPackage: '/api/getChildOrdersStatusByPackageId',
    /** GET /api/getFoodOrdersByPackageId/:packageId → [{ foodOrderId, orderNo, orderstatus,
     * mealType, orderDate, amount, supportReaction, deliveredAt }] — every child FoodOrder for a
     * package, queried directly off the FoodOrder collection by its own `subscriptionMasterId`
     * field. Unlike `childOrdersStatusByPackage`, this never touches the package doc's
     * `dailyOrderList` snapshot at all, so it can't miss or mismatch an order that snapshot
     * forgot to record — the sole source for a package's child-orders list. */
    foodOrdersByPackage: '/api/getFoodOrdersByPackageId',
    /** GET /api/resechedulePackageOrder/:orderDate/:foodOrderId/:packageOrderId → updated child
     * FoodOrder. Reschedules one child order's date only. packageOrderId = the child order's own
     * `subscriptionMasterId` field. (Backend spelling: "reschedule" is misspelled server-side.) */
    resechedulePackageOrder: '/api/resechedulePackageOrder',
    /** GET /api/checkRescheduleConflict/:packageOrderId/:orderDate/:mealType → { conflict: boolean }.
     * Call before reschedule to warn if another live child order already exists same date+mealType. */
    checkRescheduleConflict: '/api/checkRescheduleConflict',
    /** GET /api/getShiftLocation/:shiftId → { shiftId, stage, mealSlot, routeNo, startedAt,
     * currentLocation: { lat, lng, updatedAt } | null, rider: { _id, name, phoneNo, imageUrl } }.
     * Live rider location + profile for a self-delivery order, joined via the FoodOrder's own
     * `shiftId` field (RiderShift + latest RiderLocationPing + DeliveryPartner) — the
     * authoritative, high-frequency source for Mealawe's own riders. Richer and fresher than
     * `runner.location`/`runner.phone_number` on the FoodOrder doc itself, which is only ever
     * populated for 3rd-party vendor deliveries (Porter/Shadowfax/Pidge, tracked instead via
     * `trackDeliveryTask`). Customer-authed; returns null while the order has no shift yet. */
    getShiftLocation: '/api/getShiftLocation',
  },
  /** Bulk ordering (Meals / Snacks / Food Box) — all menu categories share one parameterized endpoint. */
  bulk: {
    /** GET /api/fetchBulkMenu/:category → BulkMenuResponse. category ∈ 'bulkMeals'|'individualMeals'|'bulkSnacks'|'individualSnacks'|'predefinedSnackbox'|'customSnackbox'. */
    fetchMenu: '/api/fetchBulkMenu',
    /** GET /api/getPastBulkFoodOrders/:profileId/:page → past bulk orders. */
    pastOrders: '/api/getPastBulkFoodOrders',
    /** GET /api/getApartmentPastBulkFoodOrders/:profileId/:page → past apartment-bulk orders. */
    apartmentPastOrders: '/api/getApartmentPastBulkFoodOrders',
  },
  /** Navmool marketplace — order history only; browsing happens in the navmool.com WebView. */
  marketplace: {
    /** GET /api/getCustomerMarketPlaceItemPastOrders/:id/:page → past marketplace item orders. */
    pastOrders: '/api/getCustomerMarketPlaceItemPastOrders',
  },
  /** Dine-in packages — reuses the subscription package model. The real
   * backend has no kitchen/table-booking concept; "Dine In" is a Subscription
   * package flagged `isDineIn: true` on the cart line (see
   * `src/features/dine-in/api.ts` and `useConfigureStore`). */
  dineInPackage: {
    /** POST /api/getDineInPackageListCluster — body { custerList: string[] }
     * (backend spelling, matches subscription's mealPackageList) → raw
     * DineInPackage[] documents. */
    listCluster: '/api/getDineInPackageListCluster',
  },
  /**
   * On-demand kitchen ordering (Daily/Advance). Paths verified against
   * MealaweUserApp's apiConfig (getNearestKitchen, getkitchenMenu,
   * getKitchenPartner, getValidClusterUserCouponList — shared with bulk/
   * subscription).
   */
  onDemand: {
    /** POST /api/getNearestKitchen/:pageNumber/:lng/:lat — body { clusterList } → OnDemandKitchen[]. */
    nearestKitchens: '/api/getNearestKitchen',
    /** GET /api/getKitchenPartner/:id → OnDemandKitchen. */
    kitchenProfile: '/api/getKitchenPartner',
    /** GET /api/kitchenMenu/:kitchenId → { itemList: OnDemandMenuItem[] } (both modes' eligibility flags included). */
    kitchenMenu: '/api/kitchenMenu',
    /**
     * GET /api/getKitchMenuByClusterAndKitchenType/:clusterId/:kitchenType →
     * one pre-merged menu for the whole cluster (Kota-only flow, gated by the
     * `showClusterMenu` cluster-config flag — see `clusterStore.ts`). Verified
     * against MealaweUserApp's `tabClusterMenu.component.ts`.
     */
    clusterMenu: '/api/getKitchMenuByClusterAndKitchenType',
  },
  /**
   * Apartment ordering — menu-first browsing inside the resident's own
   * apartment complex. Rewritten against the REAL, already-implemented
   * server model (audited fresh against MealaweServerApp's actual route/
   * service/dao/model code, not the Ionic client's — see the plan PDF's
   * "Server findings" section). One order = one kitchen = one order type
   * (R2/U6); four order types — instant/today/advance/bulk — are a
   * top-level tab switch (U4), each with its own catalog fetch, not a
   * filter over one shared list. There is NO payment step on this path —
   * `orders.create` below places the order directly (see its own comment).
   */
  apartment: {
    /** GET /api/getNearestApartment/:lng/:lat → `KitchenPartner[]`
     * (apartment.route.js → apartment.service.js: geofences the point
     * against the `Apartments` collection's polygon, then returns that
     * matched complex's own kitchens via `getKitchensByApartmentId`), used
     * to resolve which apartment (`apartmentInfo.apartmentId`/
     * `apartmentName`) the current address falls near. Empty array = no
     * active apartment kitchen serves this address; the browse screen (and
     * the floating nav pill, see `useApartmentEligibilityStore`) both treat
     * that as "not available here", never as "still loading". Deliberately
     * the SAME endpoint the legacy Ionic app (`MealaweUserApp`) uses for its
     * own `showApartment` flag (`tabs.page.ts`'s `getNearestApartment`
     * call) — kept in lockstep with that source of truth rather than a
     * separately-tuned discovery endpoint. */
    resolveApartment: '/api/getNearestApartment',
    /** GET /api/getApartmentTodayMenu/:apartmentId — no auth. Recommended
     * (per the "new buy/sell flow" API reference doc, §2) fetch for the
     * Today tab: merges every kitchen linked to this apartment's Today
     * menus into one response, pre-split into `breakfastItems`/`lunchItems`/
     * `highTeaItems`/`dinnerItems`/`inactiveItems` — an item counts as
     * active only if BOTH its stock is fine AND its OWN kitchen's meal-slot
     * time window is open right now, computed server-side. Replaces the
     * older per-kitchen `nearestKitchensOfApartment` + `menuByDate` +
     * `orderableMealTypes` fetch-and-merge-client-side approach for Today
     * specifically (Advance still uses that older approach — see catalog.ts). */
    todayMenu: '/api/getApartmentTodayMenu',
    /** GET /api/getApartmentInstantMenu/:apartmentId — no auth. Instant's
     * counterpart of `todayMenu` above — merges every linked kitchen's
     * Instant menu into one `activeItems`/`inactiveItems` split (no
     * meal-slot dimension), active meaning stock is fine AND at least one of
     * that kitchen's own configured Instant time slots is running right now. */
    instantMenu: '/api/getApartmentInstantMenu',
    /** GET /api/getApartmentAdvanceMenu/:apartmentId — no auth. Advance's
     * counterpart of `todayMenu`/`instantMenu` above (per the "Advance Order
     * API Reference" doc, 2026-09-01) — merges every linked kitchen's own
     * curated Advance items into one `activeItems`/`inactiveItems` split,
     * same shape, active meaning stock + itemAvailable only (no meal-slot or
     * time-window concept for Advance at all). Date-AGNOSTIC — this alone
     * says nothing about which of T+1/T+2 a kitchen is actually eligible
     * for; catalog.ts's `loadAdvanceCatalog` still separately calls
     * `nearestKitchensOfApartment` per day for that (unchanged), and crosses
     * the two together. Replaces only the item/kitchen half of the OLDER
     * per-kitchen `loadFutureMenu` approach, not the day-eligibility half. */
    advanceMenu: '/api/getApartmentAdvanceMenu',
    /** POST /api/getNearestKitchensOfApartment/:pageNumber/:lng/:lat — body
     * { apartmentId (required), orderType, itemServingDate? } → KitchenPartner[]
     * (full docs + `distance`), already R25/R26/R27/R17-filtered for
     * `orderType`. `apartmentId` is enforced server-side (400 if missing) —
     * without it this would silently degrade into a citywide geo search
     * across every apartment, not just this one.
     * ⚠ Eligibility filtering happens AFTER pagination server-side — a
     * short page does not mean "no more eligible kitchens", see api.ts. */
    nearestKitchensOfApartment: '/api/getNearestKitchensOfApartment',
    /** GET /api/apartmentMenu/:kitchenId/orderableMealTypes → string[] of
     * meal types (R23) still inside today's cutoff for this kitchen — the
     * server-configured cutoff (APARTMENT_TODAY_CUTOFF_MINUTES, default
     * 180) is the source of truth, never recomputed client-side. Confirmed
     * live/actively wired in per the "Apartment Orders API Reference" doc
     * (2 Sep 2026) — "Do not remove."
     *
     * `menuByDate`/`futureMenu`/`instantWindowOpen` (the per-kitchen
     * `/api/apartmentMenu/:kitchenId/:clientDate`, `.../future`, `.../
     * instantWindowOpen` routes this constant used to sit alongside) were
     * removed 2026-09-02 — dead code (`loadMenuByDate`/`loadFutureMenu`/
     * `loadInstantWindowOpen` in api.ts, never called anywhere once Today/
     * Instant/Advance all moved onto the merged `getApartmentTodayMenu`/
     * `getApartmentInstantMenu`/`getApartmentAdvanceMenu` endpoints). Server-
     * side, only the sibling `POST /apartmentMenu/byApartmentType` route
     * (a different, never-used-by-any-client-app route) was actually
     * deleted per that same doc — these three GET sub-routes may still
     * exist server-side; they were removed HERE only because nothing in
     * this app calls them any more. */
    orderableMealTypes: '/api/apartmentMenu',
    /** GET /api/apartmentMenu/:kitchenId/item/:itemId/recommendations (R20)
     * → ApartmentMenuItem[] paired with this item, SAME KITCHEN ONLY. OLDER,
     * apartmentMenu.model.js-based flow — kept as-is (server decision, see
     * the companion "Item Pairing Recommendations API" doc §3), still the
     * right one for Advance, which hasn't moved to the new buy/sell flow.
     * Today/Instant use `kitchenTypeMenuRecommendations` below instead. */
    recommendations: '/api/apartmentMenu',
    /** GET /api/kitchenApartmentTypeMenu/:kitchenId/:type/items/:itemId/
     * recommendations (NEW — "new buy/sell flow" API) → the source item's
     * own `pairedItemIds` resolved to full item objects, each tagged
     * `isActive`, from the SAME KitchenApartmentTypeMenu collection
     * Today/Instant's own merged-menu fetches read from. Kitchen-scoped, not
     * apartment-scoped — pairing candidates are looked up in the SAME
     * sub-type list as the source item only (a Today item only ever pairs
     * with other Today items, etc.), server-enforced. `isActive` here is
     * stock/on-off ONLY — it does NOT layer on Today's meal-slot window or
     * Instant's time-window check (documented server behavior), so a
     * pairing can show active even if that kitchen's window has since
     * closed; not cross-referenced against the full catalog here, a
     * documented, accepted simplification. */
    kitchenTypeMenuRecommendations: '/api/kitchenApartmentTypeMenu',
    /** GET /api/getStandardMenuItems/:menuType? → the shared, admin-curated
     * 1,700-item catalog (Instant/Advance only — never Today). */
    standardMenuItems: '/api/getStandardMenuItems',
    /** POST /api/standardMenuSelectionsByKitchens — body { kitchenIds } →
     * which (itemId, menuType) pairs each kitchen opted into — join against
     * `standardMenuItems` client-side, the server returns ids only. */
    standardMenuSelections: '/api/standardMenuSelectionsByKitchens',
    /** POST /api/validateApartmentFoodOrder/:clientDayStartTime — pre-flight
     * stock/availability check (never creates an order); the create call
     * below re-validates internally too, so this is a UX check only. */
    validateOrder: '/api/validateApartmentFoodOrder',
    /** POST /api/apartmentOrder (userAuthMiddleware) → places the order
     * directly — server recomputes deliveryCharges/taxes and auto-assigns a
     * kitchen when `kitchenId` is omitted (R8/R9); throws ORDER_MULTI_KITCHEN/
     * NO_ELIGIBLE_KITCHEN/TODAY_CUTOFF_PASSED/ADVANCE_CUTOFF_PASSED/
     * FULFILLMENT_MODE_UNAVAILABLE as `Error.message` strings (parsed by the
     * ":" prefix — see api.ts). NO payment gateway is involved anywhere on
     * this path — a 200 response means the order is already
     * `placed`/`accepted`; never open a payment SDK for it. */
    createOrder: '/api/apartmentOrder',
    /** POST /api/apartmentOrder/estimateFulfillment — body
     * { kitchenId, itemIds } → { minutes }. Pre-placement version of the
     * SAME server-side R18 max(prep-time)-across-items calculation the
     * create-order path already runs — lets Instant's "tentative
     * fulfilment" figure (add-sheet, cart screen) be a real server number
     * before the order is placed, instead of a client-side guess built
     * from a possibly-missing per-item `preparationTime` catalog field. */
    estimateFulfillment: '/api/apartmentOrder/estimateFulfillment',
    /** POST /api/apartmentOrder/quote — same request shape as the real
     * payment call (minus wallet fields), runs the EXACT SAME server-side
     * pricing function (prepareApartmentParentOrder for Today/Instant)
     * read-only, no persistence, no side effects → the
     * real itemAmount/deliveryCharges/taxes/payableAmount. Call this right
     * before capping wallet/cashback redemption so that cap is always based
     * on what will ACTUALLY be charged, not a client-side estimate that can
     * drift (kitchen delivery override, multi-meal-slot delivery merging,
     * etc. — see this route's own server-side comment for the fuller
     * rationale). */
    quote: '/api/apartmentOrder/quote',
    /** GET /api/apartmentOrder/customer/:customerId?orderType= → this
     * customer's full order history (newest first, no pagination). */
    ordersByCustomer: '/api/apartmentOrder/customer',
    /** GET /api/apartmentOrder/:orderId → a single order. A 500 with
     * message "order not found" means not-found, not a real error — this
     * route never returns 404. */
    orderById: '/api/apartmentOrder',
    /** PUT /api/apartmentOrder/:orderId/markDelivered — body { customerId }.
     * The customer-initiated replacement for OTP-based delivery
     * confirmation (product instruction, 2026-08-27): once the kitchen
     * marks a DELIVERY order 'readyToDelivery', the order-detail screen
     * shows a "Mark complete" button (below Bill details) that calls this.
     * Server-side this runs the exact same updateApartmentOrderStatus path
     * the old OTP-verify used, so the kitchen-payout/ledger flow fires
     * identically. Throws NOT_READY_TO_DELIVER / CUSTOMER_MISMATCH /
     * ALREADY_DELIVERED (see parseApartmentOrderError) if called out of
     * turn. */
    markDelivered: '/api/apartmentOrder',
    /** GET /api/apartmentOrder/byParent/:parentOrderId → the real child
     * ApartmentOrder(s) a Today/Instant JusPay checkout produced. A payment
     * against `startJusPayPaymentProcess` (orderType 'apartment'/
     * 'apartment_today'/'apartment_instant') only ever returns the
     * ApartmentParentOrder's own `_id` — there's no client route for the
     * parent record itself (it's an internal payment/split bookkeeping
     * document) — so this is how the app resolves that id back to the
     * orderNo-bearing order(s) the resident can actually view. */
    ordersByParent: '/api/apartmentOrder/byParent',
  },
  /**
   * JusPay HyperSDK checkout — order-creation endpoints (one per vertical
   * bucket the backend recognizes) plus a shared validate call.
   * Marketplace's `startMarketPlaceJusPayPaymentProcess` is intentionally
   * omitted — no RN marketplace cart exists yet (see the design spec).
   */
  juspay: {
    /** POST — dispatches server-side by body.orderType: Subscription/Dine
     * In (isDineIn:true) and plain On-Demand orders, PLUS (as of the
     * apartment-split-order-checkout-v2 migration) Apartment Today/Instant
     * ('apartment'/'apartment_today'/'apartment_instant', routed to
     * startApartmentParentJusPayPaymentProcess) — see
     * features/apartment/api.ts#startApartmentPayment. Same one URL for all
     * of these; the backend's own /startJusPayPaymentProcess route reads
     * body.orderType to decide which service function actually runs. */
    startSubscription: '/transaction/startJusPayPaymentProcess',
    /** POST — the separate, standalone Bulk-ordering vertical's own
     * (meals/snacks/food-box) orders — NOT Apartment's own Bulk order type,
     * which has been removed from this feature entirely. */
    startBulk: '/transaction/startBulkJusPayPaymentProcess',
    /** POST — confirm the JusPay SDK result after `process()` returns. Body:
     * { orderType, foodOrderId }. Mutating and NOT safe to call repeatedly —
     * once it flips an order out of `paymentInprogress`, a second call
     * returns { status:false, error:true } instead of re-confirming success.
     * Use once; poll `validateStatus` for retries. */
    validate: '/transaction/validateJusPayPaymentTransaction',
    /** POST — same lookup as `validate` but read-only, never mutates order
     * state. Body: { orderType, foodOrderId }. Safe to call repeatedly, e.g.
     * to retry past a race where the SDK's process_result ("charged")
     * arrives slightly before JusPay's own Orders API reflects it. */
    validateStatus: '/transaction/validateJusPayPaymentTransactionandshowstatus',
  },
  /** Home screen — dashboard-managed hero content. */
  home: {
    /** GET /api/getHeroLottiesForTab/:tabKey?clusterConfigName= → HeroLottieConfig[]
     * (admin-configured home hero carousel slides for one order-mode tab,
     * cluster-scoped server-side — cluster-specific override wins over the
     * global set when both exist). [] on error/none configured falls back to
     * the bundled local animation for that tab, see useHeroLotties. No auth
     * required — fetched pre-subscription. */
    heroLottiesForTab: '/api/getHeroLottiesForTab',
  },
  /** App launch — dashboard-managed splash screen. */
  splash: {
    /** GET /api/getActiveSplashLottie → SplashLottieConfig | null
     * (admin-configured animated splash-handoff Lottie, dashboard-managed,
     * common to every user — no cluster scoping; null/error/timeout falls
     * back to the bundled local animation, see SplashAnimationOverlay). No
     * auth required — fetched before login, at the very first paint. */
    activeSplashLottie: '/api/getActiveSplashLottie',
  },
  // ...add domains (marketplace, oyo) as each vertical is migrated.
} as const;

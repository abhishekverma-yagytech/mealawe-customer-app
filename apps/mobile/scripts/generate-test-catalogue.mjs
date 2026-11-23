// One-off generator for docs/TEST-CATALOGUE.xlsx — E2E-scenario test case catalogue
// for the Maestro suite in .maestro/flows/**. Run: node scripts/generate-test-catalogue.mjs
// Requires `exceljs` (not a project dependency — install ad hoc or run via npx).
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'docs', 'TEST-CATALOGUE.xlsx');

const COLUMNS = [
  { header: 'ID', key: 'id', width: 12 },
  { header: 'Feature / Area', key: 'area', width: 20 },
  { header: 'Title', key: 'title', width: 42 },
  { header: 'Preconditions', key: 'pre', width: 40 },
  { header: 'Steps', key: 'steps', width: 55 },
  { header: 'Expected Result', key: 'expected', width: 45 },
  { header: 'Priority', key: 'priority', width: 10 },
  { header: 'Maestro flow', key: 'flow', width: 32 },
];

// ---------------------------------------------------------------------------
// Full-flow E2E catalogue (E2E-01..E2E-37) — scenario-level, maps to .maestro/flows/*.yaml
// ---------------------------------------------------------------------------
const FULL_FLOW = [
  ['E2E-01', 'Auth', 'First-run onboarding → welcome → login screen', 'Fresh install, no session', 'Launch app, swipe through 3 welcome slides, tap "Get Started"', 'Lands on Login screen with video hero playing', 'P0', 'onboarding-to-login.yaml'],
  ['E2E-02', 'Auth', 'Login: phone entry → OTP → verify (new user)', 'Fresh session, backend accepts test phone/OTP', 'Enter phone, tap Send OTP, enter test OTP, auto-verify', 'Redirected to /register (no name/email yet)', 'P0', 'login-otp-flow.yaml (manual)'],
  ['E2E-03', 'Auth', 'Register: complete profile → home', 'Post-OTP, on /register', 'Enter name, email, optional referral, tap Confirm', 'Redirected to (tabs) home, profile persisted', 'P0', 'register-new-user.yaml (manual)'],
  ['E2E-04', 'Auth', 'Login: returning user skips register', 'Existing profile with name+email already set', 'Complete OTP verify', 'Redirected directly to (tabs) home, /register skipped', 'P0', 'login-otp-flow.yaml (manual)'],
  ['E2E-05', 'Auth', '"Skip" bypasses to home without completing profile', 'On login or register hero', 'Tap "Skip"', 'Redirected to (tabs) home', 'P1', 'manual'],
  ['E2E-06', 'Location', 'Set delivery location via GPS on first home visit', 'No address set yet', 'Tap "Change delivery address" → Addresses screen → "Use my current location"', 'Address detected, cluster serviceability checked, addressLabel updates on home', 'P0', 'addresses-manage.yaml (manual)'],
  ['E2E-07', 'Location', 'Add a new address manually via map + form', 'On /addresses, no saved addresses', 'Tap "+ Add new address", pan map or search, fill flat/landmark, choose tag, Save', 'New address appears in saved list, becomes current', 'P0', 'addresses-manage.yaml (manual)'],
  ['E2E-08', 'Location', 'Edit an existing saved address', '≥1 saved address exists', 'Tap Edit on a card, change landmark, Save', 'Address list reflects updated landmark', 'P1', 'manual'],
  ['E2E-09', 'Location', 'Delete a saved address (not current, not last)', '≥2 saved addresses, deleting a non-current one', 'Tap Delete, confirm', 'Address removed from list', 'P1', 'manual'],
  ['E2E-10', 'Location', 'Cannot delete the only saved address', 'Exactly 1 saved address', 'Tap Delete', 'Alert: "You cannot delete all addresses"', 'P1', 'manual'],
  ['E2E-11', 'Subscription', 'Browse subscription categories and open a category\'s detail screen', 'Serviceable location set', 'On home, tap a category card (or the "Picked for you" banner\'s Subscribe button)', 'subscription-detail opens with a hero photo, inline Mon-Sat day strip, and that day\'s weekly menu', 'P0', 'home-browse-subscription.yaml (manual)'],
  ['E2E-12', 'Subscription', 'Day strip + diet toggle update the displayed menu', 'Category detail open', 'Tap a different day, then toggle Non-veg', 'Selected day highlights; lunch/dinner descriptions and "What\'s included" update for the new day/diet', 'P1', 'home-browse-subscription.yaml (manual)'],
  ['E2E-13', 'Subscription', '"Choose plan" hands off to the Plan screen', 'Category detail open', 'Tap "Choose plan"', 'subscription-plan opens showing MEAL TIME toggles (or a fixed Breakfast slot) and a package/duration list for the category', 'P0', 'subscribe-configure-cart.yaml (manual)'],
  ['E2E-14', 'Subscription', 'Plan: pick meal time + package → Configure: pick dates/add-ons → cart', 'Plan screen open, packages loaded', 'Toggle Lunch, pick a package, tap "Next: set up" → on Configure pick a start date, toggle an add-on, tap "Review & pay"', 'Lands on /cart with the configured line, correct bill totals shown', 'P0', 'subscribe-configure-cart.yaml (manual)'],
  ['E2E-15', 'Subscription', 'Configure\'s "Change plan"/"Change" links return to the Plan screen', 'On subscription-configure (non-dine-in)', 'Tap "Change plan", then separately tap meal time\'s "Change"', 'Both navigate back to /subscription-plan so the package or meal time can be adjusted without restarting the flow', 'P1', 'manual'],
  ['E2E-16', 'Cart', 'Apply a coupon by code', 'Cart has an item, valid coupon list available', 'Type coupon code, tap Apply', 'Coupon applied banner + celebration animation; bill total reduces', 'P0', 'cart-coupon-and-wallet.yaml (manual)'],
  ['E2E-17', 'Cart', 'Apply best-available coupon suggestion', 'Cart has an item, no coupon applied yet', 'Tap "Apply" on the auto-surfaced best coupon nudge', 'Same coupon becomes applied; savings banner updates', 'P1', 'manual'],
  ['E2E-18', 'Cart', 'Toggle wallet/cashback redemption', 'Wallet balance > 0', 'Toggle "Use Mealawe Wallet" switch', 'Bill’s "To pay" reduces by wallet amount used; toggle off restores', 'P1', 'manual'],
  ['E2E-19', 'Cart', 'Edit add-ons re-enters configure with prefilled state', 'Cart has a configured item', 'Tap "Edit add-ons"', 'Configure screen opens prefilled with existing lunch/dinner/dates/add-ons', 'P1', 'manual'],
  ['E2E-20', 'Cart', 'Empty state prompts to browse plans', 'No item in cart (fresh cart)', 'Navigate to /cart directly', '"Your cart is empty" + "Browse plans" CTA shown', 'P1', 'manual'],
  ['E2E-21', 'Cart', 'Tapping Proceed to Pay opens the real JusPay checkout', 'Cart has an item', 'Tap "Proceed to Pay →"', 'JusPay\'s native payment page opens with the cart\'s total; completing/cancelling it lands on /order-result with the matching status', 'P0', 'cart-coupon-and-wallet.yaml (manual)'],
  ['E2E-22', 'Bulk', 'Browse category → adjust quantities → view cart', 'Home "Bulk" tab active (non-Kota cluster)', 'Tap Bulk Meals → increase qty on 2 items → tap sticky "View cart →"', 'Bulk cart shows both lines with correct running subtotal', 'P0', 'bulk-browse-and-cart.yaml (manual)'],
  ['E2E-23', 'Bulk', 'Below-MOQ warning shown and blocks checkout implicitly', 'MOQ=5, item qty set to 2', 'Increase item to 2 only', 'Card shows "Minimum order quantity is 5"; item resolves to 0 in cart', 'P0', 'manual'],
  ['E2E-24', 'Bulk', 'Bulk cart: pick delivery date + slot, then Place order', 'Bulk cart has lines', 'Select a date chip, select a slot chip, tap Place order', 'JusPay payment page opens; button disabled with "Pick a delivery date and slot" before selection', 'P0', 'bulk-browse-and-cart.yaml (manual)'],
  ['E2E-25', 'Bulk', 'Switching category clears previous cart lines', 'Cart has meals lines', 'From home Bulk tab, switch to Snacks category', 'Previously-added meals lines are gone from bulk cart', 'P1', 'manual'],
  ['E2E-26', 'Orders', 'View ongoing vs past subscription orders', 'Logged-in user with order history', 'Navigate Profile → My orders', 'Orders split into "ACTIVE" and "PAST" sections with correct status pills', 'P0', 'manual'],
  ['E2E-27', 'Orders', 'Tap an order opens detail with live timeline', 'Order list populated', 'Tap an ongoing order', 'Order detail shows correct status step highlighted on timeline', 'P1', 'manual'],
  ['E2E-28', 'Orders', 'Empty state prompts to browse plans', 'New user, no orders yet', 'Navigate to Orders', '"No orders yet" + Browse plans CTA', 'P1', 'manual'],
  ['E2E-29', 'Wallet', 'View balance and transaction history, paginate', 'Logged-in user with wallet history', 'Profile → Mealawe Money → scroll → Load more', 'Balance shown, transactions listed credit/debit correctly, pagination loads more rows', 'P1', 'manual'],
  ['E2E-30', 'Wallet', 'Cashback: view balance and history, see expiry labels', 'Logged-in user with cashback history incl. expired entries', 'Profile → Cashback', 'Balance shown; expired entries labeled "Expired", others "Expires <date>"', 'P1', 'manual'],
  ['E2E-31', 'Wallet', 'Wallet/Cashback: guest sees login gate', 'Logged out (guest)', 'Navigate to /wallet directly', '"Log in to view your Mealawe Money" + Login CTA shown', 'P1', 'manual'],
  ['E2E-32', 'Profile', 'Edit name/email and save', 'Logged-in user', 'Profile → Edit → change name → Save', 'Returns to Profile screen, header shows updated name', 'P0', 'manual'],
  ['E2E-33', 'Profile', 'Change appearance theme', 'Logged-in user, on Profile', 'Tap "Appearance" row → select "Dark" in sheet', 'App switches to dark theme immediately; Profile row subtitle updates to "Dark"', 'P1', 'profile-theme-signout.yaml (manual)'],
  ['E2E-34', 'Profile', 'Sign out clears session and returns to welcome', 'Logged-in user', 'Profile → Sign out → confirm in dialog', 'Session cleared, nav stack dismissed, lands on /welcome; Back doesn’t return to authenticated screens', 'P0', 'profile-theme-signout.yaml (manual)'],
  ['E2E-35', 'Support', 'Help & support: contact actions and FAQ expand', 'Support contacts + FAQs loaded', 'Help screen → tap an FAQ row → tap Call', 'FAQ answer expands/collapses; Call opens tel: intent', 'P1', 'help-and-feedback.yaml (manual)'],
  ['E2E-36', 'Support', 'Submit a suggestion via Feedback', 'Logged-in user, on Feedback screen', 'Select "Suggestion" type, type comment, Submit', '"Thank you!" alert shown, returns to previous screen', 'P1', 'help-and-feedback.yaml (manual)'],
  ['E2E-37', 'Full Regression', 'Full happy-path: onboarding → login → subscribe → cart → (deferred pay)', 'Fresh install', 'Chain E2E-01 through E2E-21 in one continuous flow', 'Entire journey completes without a crash or unexpected redirect; final state is cart screen with Proceed-to-Pay alert', 'P0', 'manual (chains multiple flows)'],
  ['E2E-38', 'Bulk', 'Category switch mid-cart shows a confirm dialog', 'Bulk cart has lines under one category', 'From home, switch to a different bulk category and add an item', '"Switch category?" ConfirmDialog appears before the old cart is cleared; confirming clears it, cancelling preserves it', 'P1', 'bulk-browse-and-cart.yaml (manual)'],
  ['E2E-39', 'Dine In', 'Browse dine-in packages → configure → cart shows dine-in row', 'Authenticated session, serviceable Kota cluster, ≥1 DineInPackage from the backend', 'Dine In tab → tap a package → tap Dinner (adds to the already-selected Lunch) → Review & pay', 'Cart shows the package with a "Dine-in" row instead of an address', 'P0', 'dine-in-package-cart.yaml (manual)'],
  ['E2E-40', 'Home', 'Navmool shortcut tab → placeholder screen', 'Authenticated session, serviceable cluster with showNavmool=true', 'Home → tap the "Navmool" shortcut tab', '"Navmool — coming soon" screen shown; Back returns to home', 'P1', 'navmool-shortcut-tile.yaml (manual)'],
  ['E2E-41', 'On Demand', 'On Demand tab → kitchen → add items → cart ready for checkout', 'Authenticated session, serviceable cluster with showOndemand=true and ≥1 on-demand kitchen', 'Home → tap "On Demand" → open a kitchen → add 2 items → open cart → pick a slot', '"Pay now" enabled; tapping it opens the real JusPay checkout', 'P0', 'on-demand-kitchen-to-cart.yaml (manual)'],
  ['E2E-42', 'Home', 'Tap between home feed tabs (Subscription/Bulk/Dine In), no swipe', 'Authenticated session, Bulk and Dine In both enabled for the cluster', 'Home → tap "Bulk" → tap "Dine In" → tap "Subscription"', 'Each tap switches the feed to that tab immediately, with a solid white pill background on the active tab; the pager itself does not respond to swipe', 'P1', 'home-tabs-tap-switch.yaml (manual)'],
  ['E2E-43', 'Subscription', 'Manage subscription: pause and skip a day', 'Ongoing subscription order exists', 'Orders → "Manage subscription" → tap Pause → tap Resume → tap a day row', 'Status pill and day rows update immediately; local-only state (no backend call — noted as UI shell in the plan)', 'P1', 'manage-subscription.yaml (manual)'],
  ['E2E-44', 'Referral', 'Refer & Earn: copy code and expand a FAQ', 'Logged-in user', 'Profile → "Refer & Earn" → tap Copy → tap a FAQ question', 'Code copies with a "Copied!" confirmation; FAQ answer expands/collapses on tap', 'P1', 'refer-earn.yaml (manual)'],
];

// ---------------------------------------------------------------------------
// Per-feature breakdown — same E2E granularity, grouped for readability. IDs
// are feature-prefixed and distinct from the E2E-xx numbering above (this is a
// cross-reference view, not a duplicate suite).
// ---------------------------------------------------------------------------
const FEATURE_SHEETS = {
  Auth: [
    ['AUTH-01', 'Auth', 'Welcome carousel renders all 3 slides and "Get Started" CTA', 'Fresh install', 'Launch app, swipe left twice through slides', 'Slide titles: "Ghar Ka Khana", "Advance Order", "Subscribe Order"; "Get Started" always visible', 'P1'],
    ['AUTH-02', 'Auth', 'Phone entry validates 10-digit number before enabling Send OTP', 'On Login screen', 'Type fewer than 10 digits', '"Send OTP" stays disabled', 'P0'],
    ['AUTH-03', 'Auth', 'OTP screen shows masked phone + Change link', 'After Send OTP', 'Observe subheading', '"Sent to +91 <phone>" with a tappable "Change" that returns to phone entry', 'P1'],
    ['AUTH-04', 'Auth', 'Resend OTP disabled during 30s countdown', 'Just sent OTP', 'Observe Resend OTP button', 'Disabled with "Resend in 00:SS" countdown; enables after it reaches 0', 'P1'],
    ['AUTH-05', 'Auth', 'Verify & Continue disabled until 6 digits entered', 'On OTP screen', 'Enter fewer than 6 digits', 'Button stays disabled', 'P0'],
    ['AUTH-06', 'Auth', 'New user redirected to Register after OTP verify', 'First-time phone number', 'Complete OTP verify', 'Redirect to /register, not home', 'P0'],
    ['AUTH-07', 'Auth', 'Returning user (name+email set) skips Register', 'Existing complete profile', 'Complete OTP verify', 'Redirect straight to (tabs) home', 'P0'],
    ['AUTH-08', 'Auth', 'Register requires name and email before Confirm', 'On /register', 'Leave name or email blank, tap Confirm', 'Validation error shown, not submitted', 'P0'],
    ['AUTH-09', 'Auth', '"Skip for now" on Register bypasses profile completion', 'On /register', 'Tap "Skip for now"', 'Navigates to (tabs) home without saving name/email', 'P1'],
    ['AUTH-10', 'Auth', 'Expired session (401 from any API call) forces a clean logout', 'Authenticated session, then the session token is invalidated server-side', 'Trigger any API call (e.g. pull-to-refresh on home)', 'Nav stack clears, lands on /welcome, "Session expired" alert shown, cart is empty on next login, and the device push token is re-registered on next login', 'P1'],
  ],
  Home: [
    ['HOME-01', 'Home', 'Home defaults to Subscription tab', 'Authenticated, serviceable location', 'Land on home', '"Categories" section and the search bar visible by default', 'P0'],
    ['HOME-02', 'Home', 'Order-mode shortcuts row is cluster-aware (Bulk vs Dine In)', 'Non-Kota vs Kota cluster', 'Compare shortcut set for each cluster type', 'Non-Kota shows "Bulk"; Kota shows "Dine In" instead', 'P1'],
    ['HOME-03', 'Home', 'REMOVED: the home-header "PURE VEG" pill no longer exists', 'On home', 'Look for a "PURE VEG" pill anywhere on Home', 'Nothing found — the global veg-only preference moved to Profile > Preferences > "Pure Veg" (see PROF-05); kept as a regression guard so this ID is never silently reintroduced with stale expectations', 'P2'],
    ['HOME-04', 'Home', 'Address label updates after changing delivery address', 'Address changed via Addresses screen', 'Return to home', 'Header address text reflects the newly selected address', 'P1'],
    ['HOME-05', 'Home', 'CURRENTLY DISABLED: Navmool shortcut only appears when showNavmool is true', 'Cluster config has showNavmool=true', 'Scroll the shortcuts row', 'The tab-push for this entry is commented out in (tabs)/index.tsx\'s orderTabs regardless of the flag — no "Navmool" shortcut shows today; re-enable that block first', 'P2'],
    ['HOME-06', 'Home', 'Navmool shortcut is hidden when showNavmool is false or unresolved', 'Cluster config has showNavmool=false, or the fetch fails', 'Scroll the shortcuts row', 'No "Navmool" shortcut tab, no crash', 'P1'],
    ['HOME-07', 'Home', 'Tapping the Navmool shortcut opens the placeholder marketplace screen', 'Navmool shortcut visible (see HOME-05 — currently requires uncommenting the tab-push)', 'Tap "Navmool"', 'Navigates to a screen titled "Navmool" showing "Navmool — coming soon"', 'P1'],
    ['HOME-08', 'Home', 'On Demand tab appears only when showOndemand is true', 'Cluster config has showOndemand=true', 'Scroll the shortcuts row', '"On Demand" feed tab visible alongside Subscription/Bulk/Dine In; tapping it shows nearby kitchens', 'P2'],
    ['HOME-09', 'Home', 'There is no standalone "More" tab', 'Any cluster', 'Scroll the shortcuts row end to end', 'No tab labeled "More" appears — every secondary vertical is its own shortcut in the row', 'P1'],
    ['HOME-10', 'Home', 'The home feed pager does not respond to swipe', 'Authenticated session, Bulk and Dine In both enabled for the cluster', 'On Home, swipe left/right across the feed', 'The feed tab does not change — swipe on the pager is intentionally disabled so it never steals a horizontal gesture from nested content (e.g. the On Demand kitchen grid)', 'P1'],
    ['HOME-11', 'Home', 'Tapping a feed tab pill jumps directly to that tab', 'Authenticated session, Bulk and/or Dine In enabled for the cluster', 'Tap "Bulk" or "Dine In" pill', 'Feed jumps to the tapped tab immediately; the tapped pill shows a solid white background with dark teal text, every other pill stays white-text-on-glass', 'P2'],
    ['HOME-12', 'Home', 'On Demand\'s kitchen grid scrolls horizontally', 'Authenticated session, On Demand enabled, ≥3 kitchen columns for the cluster', 'On the On Demand tab, swipe left/right over the kitchen grid', 'The kitchen grid scrolls horizontally in place — the home pager (HOME-10) does not intercept the gesture', 'P1'],
    ['HOME-13', 'Home', 'Rain banner slides in once per session when the cluster flags rain', 'Cluster config has showRainyNotification=true, fresh app-foreground session', 'Land on Home', 'A banner reading "It\'s raining near this location" slides down from above the safe area, holds ~8s, then slides back out; the hero + feed shift down to make room and return to their original position once it hides; revisiting Home in the same session does not replay it', 'P2'],
  ],
  OnDemand: [
    ['OD-01', 'On Demand', 'Kitchen list shows loading/empty/populated states', 'On Demand tab tapped', 'Observe kitchen list screen', 'Skeleton while loading; "Set a delivery location" if no address; "No kitchens here yet" if empty; otherwise a scrollable list of kitchen cards', 'P0'],
    ['OD-02', 'On Demand', 'Kitchen search filters the list client-side', 'Kitchen list populated', 'Type a partial kitchen name in the search box', 'List narrows to matching kitchens only, no network call', 'P1'],
    ['OD-03', 'On Demand', 'Mode toggle re-filters the same menu without refetching', 'On a kitchen detail screen with both Daily and Advance items', 'Tap the Advance card, then Daily again', 'Item list changes immediately with no loading flash', 'P0'],
    ['OD-04', 'On Demand', 'Veg/Non-veg/Jain filter narrows the item list', 'Kitchen detail screen open', 'Tap "Veg"', 'Only veg items remain visible; tapping "Veg" again clears the filter', 'P1'],
    ['OD-05', 'On Demand', 'Missed/Coming next/Not available badges replace the stepper', 'Outside the Daily ordering window (or an Advance-only item viewed in Daily mode)', 'View an ineligible item', 'A tinted status badge shows instead of a quantity stepper; item cannot be added', 'P0'],
    ['OD-06', 'On Demand', 'Adding from a different kitchen prompts a clear-cart confirm', 'Cart already has items from kitchen A', 'Open kitchen B and tap "+" on an item', '"Switch kitchen or mode?" dialog appears; confirming clears kitchen A’s lines and adds kitchen B’s item', 'P0'],
    ['OD-07', 'On Demand', 'Advance mode requires both date and slot before checkout', 'On-demand cart has items, mode is Advance', 'Leave date or slot unselected', '"Pay now" stays disabled with a "Pick a delivery slot and date" caption', 'P0'],
    ['OD-08', 'On Demand', 'Daily mode requires only a slot (no date picker shown)', 'On-demand cart has items, mode is Daily', 'View the slot picker', 'No date chip row rendered; only slot chips for today', 'P1'],
    ['OD-09', 'On Demand', 'Kitchen discount offer applies before coupon/wallet/cashback', 'Kitchen has an active discountOffer, cart has items', 'Open the bill breakdown', '"Kitchen discount" row appears above coupon/wallet/cashback rows, correctly capped by maxLimit (percentage) or the subtotal (flat)', 'P1'],
    ['OD-10', 'On Demand', 'Pay now opens the real JusPay checkout with the correct orderType', 'Date/slot selected, cart has items', 'Tap "Pay now"', 'JusPay payment page opens for an order created with orderType matching cart.mode ("allDay" or "advance") passed straight through', 'P0'],
    ['OD-11', 'On Demand', 'On Demand tab home shows the hero header and description', 'On Demand tab tapped', 'View the top of the screen, above the search bar', '"Order on demand" header and "Home kitchens cooking near you right now. One meal at a time, no plan needed." description shown', 'P2'],
    ['OD-12', 'On Demand', 'Kitchen cards show speciality, distance, and a prep-time pill alongside rating', 'Kitchen list populated with kitchens that have speciality/distance/preparationTime data', 'View a kitchen card in the grid', 'Rating pill (bottom-left) and a prep-time pill (bottom-right, e.g. "20 min") overlay the photo; speciality text and a distance line (e.g. "2.3 km") render below the kitchen name when that data is present', 'P2'],
    ['OD-13', 'On Demand', 'Mode toggle cards show descriptive subtext, not just a bare label', 'On a kitchen detail screen', 'View the Daily/Advance mode toggle above the search results', 'Daily card shows "Cooking now · Ready in {kitchen.preparationTime} min" (or "Cooking now" if the kitchen has no preparationTime); Advance card shows "Schedule for tomorrow or the day after" — both driven by real kitchen data, not a live delivery-partner ETA', 'P2'],
    ['OD-14', 'On Demand', 'Menu items with their own prep time show a "Ready in X min" line', 'A menu item in the loaded menu has its own preparationTime set (kitchenMenu.itemList[].preparationTime, distinct from the kitchen-level field)', 'View that item\'s card in an orderable state', 'A clock icon + "Ready in {item.preparationTime} min" caption renders below the price; items with no preparationTime of their own show no extra line, and the line never shows for missed/coming-next/sold-out/not-available items', 'P2'],
    ['OD-15', 'On Demand', 'On-demand cart offers a "Change" link to switch kitchens', 'On-demand cart has items', 'View the kitchen summary row at the top of on-demand-cart', '"Change" link is visible next to the kitchen name and navigates to the kitchen list (on-demand-kitchens) for the cart\'s current mode', 'P1'],
    ['OD-16', 'On Demand', 'On-demand cart offers an "Add something else" link back to the kitchen menu', 'On-demand cart has items', 'View the cart below the line-items list', '"Add something else" link is visible and navigates to the current kitchen\'s menu (on-demand-kitchen) with the same kitchenId/mode, preserving context instead of losing the cart', 'P1'],
  ],
  Subscription: [
    ['SUB-01', 'Subscription', 'Plan grid empty state when no serviceable location', 'No delivery location set', 'View Subscription tab', '"Set a delivery location" empty state shown, no plan cards', 'P0'],
    ['SUB-02', 'Subscription', 'POPULAR badge shown on best-seller plan', 'A plan has isBestSeller=true', 'View plan grid', 'That plan card shows a "POPULAR" badge', 'P1'],
    ['SUB-03', 'Subscription', 'Category detail: inline day strip + diet toggle update the shown menu', 'On subscription-detail (no separate Weekly Menu sheet anymore)', 'Tap a different day in the Mon-Sat strip, then toggle Veg/Non-veg', 'Selected day highlights; lunch/dinner descriptions and "What\'s included" update for the new day/diet combination', 'P1'],
    ['SUB-04', 'Subscription', 'Configure: "Review & pay" disabled until a full date run is selected', 'On subscription-configure (meal time is fixed here, chosen earlier on Plan)', 'Before completing a full date run', '"Review & pay" CTA stays disabled', 'P0'],
    ['SUB-05', 'Subscription', '"Weekends off" toggle recomputes date chips', 'On subscription-configure', 'Toggle "Weekends off" OFF', 'Weekend date chips re-enable (Sat/Sun become selectable); selected-dates count updates to include them', 'P0'],
    ['SUB-06', 'Subscription', 'Add-on selection recalculates footer total', 'On subscription-configure, addons available', 'Toggle a paid add-on', 'Footer total price increases by the add-on’s contribution', 'P1'],
    ['SUB-07', 'Subscription', 'Manage subscription entry point shown for active plans', '≥1 ongoing subscription order', 'Open Orders screen', '"Manage subscription" card shown above the ACTIVE section', 'P1'],
    ['SUB-08', 'Subscription', 'Pause toggles status pill and disables day-skip taps', 'On /manage-subscription', 'Tap "Pause"', 'Status pill reads "PAUSED"; every day row shows "Paused" and stops responding to taps', 'P1'],
    ['SUB-09', 'Subscription', 'Skipping a day shows a strikethrough + "Skipped" pill', 'On /manage-subscription, not paused', 'Tap a day row', 'Dish name gets a strikethrough, pill changes to "Skipped"; tapping again undoes it', 'P1'],
    ['SUB-10', 'Subscription', 'Meal time is chosen on Plan, shown read-only on Configure', 'On subscription-plan, then subscription-configure', 'Toggle Lunch/Dinner on Plan, proceed to Configure', 'Configure shows "MEAL TIME" as a read-only label (e.g. "Lunch & Dinner") with a "Change" link back to Plan — no tappable meal-time picker on Configure itself', 'P1'],
    ['SUB-11', 'Subscription', 'Breakfast categories have no Lunch/Dinner toggle on Plan', 'Selected category\'s packages all have isBreakFast=true', 'View the MEAL TIME section on subscription-plan', 'A single non-interactive "Breakfast" slot renders (always shown as selected) instead of the Lunch/Dinner toggle pair', 'P2'],
  ],
  Cart: [
    ['CART-01', 'Cart', 'Empty cart shows Browse plans CTA', 'No item in cart', 'Navigate to /cart', '"Your cart is empty" + "Browse plans" button', 'P1'],
    ['CART-02', 'Cart', 'Total Bill row opens the Bill Summary sheet', 'Cart has an item', 'Tap "Total Bill" row', 'Bill Summary bottom sheet opens showing Delivery/Packaging/Platform/GST/To pay breakdown', 'P1'],
    ['CART-03', 'Cart', 'Invalid coupon code shows inline error', 'Cart has an item', 'Type an unknown code, tap Apply', '"Invalid or expired coupon" error text shown', 'P0'],
    ['CART-04', 'Cart', 'Applied coupon can be removed', 'A coupon is applied', 'Tap "Remove"', 'Coupon row disappears, coupon-entry UI returns, bill recalculates', 'P1'],
    ['CART-05', 'Cart', 'Proceed to Pay opens the real JusPay checkout', 'Cart has an item, JusPay initialized', 'Tap "Proceed to Pay →"', 'Button shows a loading state, then the JusPay payment page opens (native SDK) with the cart\'s exact total', 'P0'],
    ['CART-06', 'Cart', 'A wallet-covered order (₹0 payable) skips the JusPay page entirely', 'Wallet/cashback toggled on covers the full bill (toPay = 0)', 'Tap "Proceed to Pay →"', 'No JusPay page opens; navigates straight to the success screen ("Order placed!")', 'P1'],
    ['CART-07', 'Cart', 'A successful payment clears the cart and shows the success screen', 'JusPay payment completes and validates successfully', 'Complete the JusPay payment flow', 'Navigates to /order-result?status=success ("Order placed!"); cart is empty on return to Home', 'P0'],
    ['CART-08', 'Cart', 'A failed payment keeps the cart intact for retry', 'JusPay payment fails/is cancelled', 'Cancel or fail the JusPay payment flow', 'Navigates to /order-result?status=failed ("Payment failed"); "Try again" returns to the same cart, still populated', 'P0'],
    ['CART-09', 'Cart', 'Double-tapping Proceed to Pay does not create two orders', 'Cart has an item', 'Rapidly tap "Proceed to Pay →" twice', 'Only one JusPay session opens — the in-flight guard in payWithJusPay blocks the second call (no backend idempotency exists for this endpoint)', 'P0'],
    ['CART-10', 'Cart', 'GST & charges row opens the GST breakdown sheet', 'Bill Summary sheet is open', 'Tap "GST & charges"', 'A second sheet opens on top showing GST on item/delivery/packaging/platform + Total GST equal to the combined figure', 'P2'],
    ['CART-11', 'Cart', 'Checking Tree Plantation reveals the receiver-name field inline', 'Cart has an item', 'Tap the Tree Plantation checkbox', 'Card border/checkbox turn green, a "Tree Receiver Name" field appears in the same card (no popup)', 'P2'],
    ['CART-12', 'Cart', 'Unchecking Tree Plantation clears the receiver name', 'Tree Plantation is checked with a name entered', 'Tap the checkbox again', 'The name field collapses and the stored receiver name is cleared', 'P2'],
    ['CART-13', 'Cart', 'Adding another plan from Other Subscriptions replaces the cart item after confirming', 'Cart has an item; at least one sibling package exists in its category', 'Tap a card in "Other Monthly Subscriptions", then "Replace" on the confirm alert', 'Cart\'s item switches to the new package with fresh dates and no add-ons; tapping "Cancel" instead leaves the original item untouched', 'P1'],
  ],
  Bulk: [
    ['BULK-01', 'Bulk', 'Increasing below MOQ keeps adding, does not silently zero the line', 'Item qty under MOQ, tapping "+"', 'Tap "+" repeatedly on an item until count reaches MOQ', 'Each tap increases the visible count (1,2,3…); "Minimum order quantity is N" caption shows below MOQ; line is NOT discarded before reaching MOQ', 'P0'],
    ['BULK-01b', 'Bulk', 'Decreasing below MOQ snaps the line to 0', 'Item at or above MOQ in cart', 'Tap "-" until count drops below MOQ', 'Count snaps straight to 0 and the line is removed, matching legacy decreaseCount/countBlur behavior', 'P0'],
    ['BULK-02', 'Bulk', 'Individual vs Bulk packaging toggle changes menu/pricing', 'On bulk-menu', 'Switch "Individual" ↔ "Bulk"', 'Menu items/pricing refresh for the selected packaging', 'P1'],
    ['BULK-03', 'Bulk', 'Top filter row shows the category MOQ and a Veg/Non-Veg diet filter', 'Menu loaded for any bulk category', 'View the top filter row', '"Min {moq} units" caption shown in the packaging row; a Veg/Non-Veg chip row is visible below the search bar', 'P1'],
    ['BULK-04', 'Bulk', 'Sticky cart footer shows running item count + subtotal', 'At least 1 item added', 'Observe footer after adding items', '"<n> items · ₹<subtotal>" and "View cart →" button shown', 'P0'],
    ['BULK-05', 'Bulk', 'Checkout blocked until delivery date + slot chosen', 'Bulk cart has lines', 'Attempt Place order before selecting date/slot', 'Button disabled, "Pick a delivery date and slot" caption shown', 'P0'],
    ['BULK-15', 'Bulk', 'Place order sends the correct orderType for the category/packaging combo', 'Bulk cart has lines for a given category+packaging', 'Tap "Place order"', 'The JusPay session opens for an order created with the matching orderType (e.g. Food Box + Bulk → customSnackbox) — see bulkOrderType()', 'P0'],
    ['BULK-06', 'Bulk', 'Category/packaging switch mid-cart shows a confirm dialog before clearing', 'Cart has lines under category A', 'On a different category/packaging screen, increase an item quantity', '"Switch category?" ConfirmDialog appears before the cart is cleared; Cancel leaves the old cart untouched', 'P0'],
    ['BULK-07', 'Bulk', 'Menu item card shows a fallback icon when it has no photo', 'Item has no itemImage', 'View the item in the bulk menu list', 'A utensils icon renders in the tinted tile instead of a blank colored square', 'P2'],
    ['BULK-08', 'Bulk', 'Menu loading state shows skeleton rows, not plain text', 'Menu is loading', 'Open bulk-menu', '5 skeleton placeholder rows render (image + 2 text lines each), no "Loading menu…" text', 'P2'],
    ['BULK-09', 'Bulk', 'Delivery date chips show day-of-week', 'On bulk-cart delivery picker', 'View the date chip row', 'Each chip shows a short weekday label ("Mon") above the day/month ("3 Aug")', 'P1'],
    ['BULK-10', 'Bulk', 'Coupon savings text is consistently green (applied vs. best-nudge state)', 'A coupon is either applied or auto-surfaced as best-available', 'Compare the savings text color in both states', 'Both use the same green (palette.accent.veg), not green in one state and pink in the other', 'P2'],
    ['BULK-11', 'Bulk', 'Bulk cart line items and delivery picker show icons', 'Bulk cart has ≥1 line', 'View a cart line and the delivery date/slot picker', 'Each line shows an image/utensils-icon tile; DELIVERY DATE/SLOT headers show a calendar/clock AccentIcon', 'P2'],
    ['BULK-12', 'Bulk', 'Wallet/cashback redeem rows show an icon and turn green when toggled on', 'Wallet or cashback balance > 0', 'Toggle "Use Mealawe Wallet" / "Redeem Cashback" on', 'Row shows a wallet/coins icon; sub-text turns green once toggled on', 'P1'],
    ['BULK-13', 'Bulk', 'Bill details are always visible, not collapsed behind a toggle', 'Bulk cart has ≥1 line', 'Open bulk-cart', 'Items/Delivery/Packaging/Platform fee/Taxes/To-pay rows all render inline immediately under "Total Bill" — no chevron or tap-to-expand affordance', 'P1'],
    ['BULK-14', 'Bulk', 'Discount/wallet/cashback bill rows render in green', 'A discount, wallet, or cashback deduction applies', 'View the bill', 'Those specific rows render their amount in green with a "- " prefix; other rows stay default color', 'P2'],
    ['BULK-16', 'Bulk', 'Veg/Non-Veg filter chips narrow the bulk item list', 'Menu loaded with a mix of veg and non-veg items', 'Tap the "Veg" chip, then tap it again', 'List narrows to veg-only items (diet mark matches); tapping "Veg" again clears the filter and restores the full list — same tap-to-clear behavior as On Demand\'s filter', 'P1'],
    ['BULK-17', 'Bulk', 'Menu item card shows description text when the item has one configured', 'An item in the loaded menu has a non-empty itemDescription', 'View that item\'s card in the list', 'Description renders as muted text below the item name (max 2 lines); items with no description show no extra line', 'P2'],
    ['BULK-18', 'Bulk', 'Slab-price info icon reveals the item\'s tier breakdown and a slab note', 'Item has more than one configured slab tier (slab2/3/4 differ from slab1)', 'Tap the info icon next to the unit price', 'An inline breakdown expands listing each real tier\'s quantity threshold → per-unit price (from the item\'s own slab1..4Price); a note below the price reads "slab price · was ₹X" once quantity is in a discounted tier, or "from ₹X at N+ units" otherwise — both using real slab data, not placeholder numbers', 'P1'],
    ['BULK-19', 'Bulk', 'Bulk cart offers a way back to the menu to add more items', 'Bulk cart has ≥1 line', 'View the cart below the line-items list', '"Add more items" link is visible and navigates to bulk-menu for the cart\'s own category, preserving context instead of losing the cart', 'P1'],
    ['BULK-20', 'Bulk', 'Bulk cart quantity stepper steps by 10 above MOQ, matching Bulk Menu', 'A line is in the cart at/above MOQ', 'Tap "+"/"-" on a cart line\'s stepper', 'Count changes by 10 per tap (not 1) via the shared nextCountFor(); decrementing below MOQ snaps the line to 0 — identical behavior to the Bulk Menu stepper, so both screens stay in sync', 'P1'],
  ],
  'Food Box': [
    ['FOODBOX-01', 'Food Box', '"Individual" packaging shows predefined boxes as a generic list', 'Food Box category, Individual packaging', 'Open Food Box → Individual', 'Standard item-list UI (same as meals/snacks), not the custom builder', 'P1'],
    ['FOODBOX-02', 'Food Box', '"Bulk" packaging opens the Customized box builder', 'Food Box category, Bulk packaging', 'Open Food Box → Bulk', 'CustomFoodBox builder renders: promo card + grouped item grid, not the generic list', 'P0'],
    ['FOODBOX-03', 'Food Box', 'Box price is the sum of each selected item’s price × its count', 'Builder open, 2 items selected at different counts', 'Add item A ×2, item B ×1', 'Promo card shows "₹{sum of (price×count)} per box"', 'P0'],
    ['FOODBOX-04', 'Food Box', 'Item picker enforces the box item limit', 'totalSelected already at FOOD_BOX_LIMIT', 'Tap "+" on any item', 'Tap is a no-op past the limit; no error crash, count does not exceed the limit', 'P0'],
    ['FOODBOX-05', 'Food Box', '"Add box" is disabled until at least one item is selected', 'Builder open, nothing selected', 'Observe the Add box button', 'Button disabled; card shows "Add items to price your box"', 'P0'],
    ['FOODBOX-06', 'Food Box', 'Adding a box starts the box count at the category MOQ', 'Builder open, ≥1 item selected', 'Tap "Add box"', 'A single cart line appears with count = menu.moq (not 1)', 'P0'],
    ['FOODBOX-07', 'Food Box', 'Changing box count preserves the already-stored price', 'A box is already in the cart, screen remounted (local selection reset)', 'Tap the box-count stepper "+"', 'Box count increases without the price recomputing to ₹0 — reuses the stored line’s item/price', 'P0'],
    ['FOODBOX-08', 'Food Box', 'Food Box packaging is billed per box, not the flat category charge', 'A customized box is in the cart', 'Open bulk-cart', '"Packaging" row = FOOD_BOX_PACKAGING_COST × box count, not orgInfo.packagingCharges', 'P1'],
  ],
  'Dine In': [
    ['DINEIN-01', 'Dine In', 'Empty state when not serviceable', 'No delivery location set', 'Open the Dine In tab', '"Set a delivery location" empty state shown, no package cards', 'P0'],
    ['DINEIN-02', 'Dine In', 'Empty state when serviceable but no packages', 'Serviceable Kota cluster, backend returns no DineInPackage docs', 'Open the Dine In tab', '"No dine-in packages here yet" empty state shown', 'P1'],
    ['DINEIN-03', 'Dine In', 'A package is auto-selected on load, same rule as SubscriptionHome', 'Dine In tab has ≥1 package', 'Open the Dine In tab', 'The best-seller package (else the first) is pre-selected — its card shows the selected style and the sticky bottom bar shows its price/days with a "Continue" button, with no tap needed', 'P0'],
    ['DINEIN-06', 'Dine In', 'Tapping a card changes the selection; Continue opens the shared configure flow with isDineIn set', 'Dine In tab has ≥2 packages', 'Tap a different package card, then tap "Continue"', 'The tapped card becomes selected (previous selection clears) and the sticky bar updates; "Continue" navigates to /subscription-configure showing "Dine In · {days} days" for the selected package; meal time always reads "Lunch" (read-only, no "Change" link — DineInHome never sets lunch/dinner in its configure context) while dates and add-ons behave exactly as they do for a Subscription package', 'P0'],
    ['DINEIN-04', 'Dine In', 'Cart shows "Dine-in" instead of a delivery address', 'A dine-in package is in the cart', 'Open the cart', 'The address row\'s label reads "Dine-in" with "Eat at the kitchen" below it, instead of a delivery address', 'P0'],
    ['DINEIN-05', 'Dine In', 'Delivery/packaging/platform charges are zero for a dine-in cart line', 'A dine-in package is in the cart', 'Expand the bill breakdown', 'Delivery, Packaging, and Platform fee rows are ₹0 (or hidden); only item price, add-ons, and taxes contribute', 'P1'],
    ['DINEIN-10', 'Dine In', 'Home auto-detects location on first mount when no address is set', 'Fresh session, no current address, location permission available', 'Land on home for the first time', 'GPS auto-detect fires silently; once resolved, clusters populate without the user visiting /addresses', 'P0'],
    ['DINEIN-11', 'Dine In', 'showDineIn cluster-config flag takes priority over the clusterName heuristic', 'A cluster’s config explicitly sets showDineIn (true or false)', 'Detect that cluster', 'Dine In tab visibility matches the config flag even if it disagrees with a clusterName "kota" substring match', 'P0'],
    ['DINEIN-12', 'Dine In', 'clusterName heuristic is used only when showDineIn is unresolved', 'searchClusterVariable fails or returns no showDineIn key', 'Detect a Kota-named cluster under that failure', 'Dine In tab still shows based on clusterName.includes("kota") — the fetch failure does not regress to always-Bulk', 'P1'],
  ],
  Orders: [
    ['ORD-01', 'Orders', 'Orders split into ACTIVE and PAST sections', 'User has both ongoing and past orders', 'Open Orders screen', 'Two labeled sections, each with correctly grouped rows', 'P0'],
    ['ORD-02', 'Orders', 'Empty state for a user with no orders', 'New user, zero orders', 'Open Orders screen', '"No orders yet" + "Browse plans" CTA', 'P1'],
    ['ORD-03', 'Orders', 'Tapping an order opens its detail/timeline', 'At least 1 order exists', 'Tap an order row', 'Navigates to /order-detail with the correct status step highlighted', 'P1'],
  ],
  Profile: [
    ['PROF-01', 'Profile', 'Edit profile updates the header name after save', 'Logged-in user', 'Profile → Edit → change name → Save', 'Returns to Profile, header reflects new name', 'P0'],
    ['PROF-02', 'Profile', 'Appearance sheet switches theme immediately', 'Logged-in user', 'Appearance → select Dark', 'App re-themes without restart; row subtitle shows "Dark"', 'P1'],
    ['PROF-03', 'Profile', 'Sign out requires confirmation before clearing session', 'Logged-in user', 'Tap "Sign out"', 'ConfirmDialog "Sign out?" shown before any session change', 'P0'],
    ['PROF-04', 'Profile', 'Sign out clears session and blocks Back to authenticated screens', 'Logged-in user', 'Confirm sign out, then try device Back', 'Lands on /welcome; Back does not return to Profile/home', 'P0'],
    ['PROF-05', 'Profile', 'Pure Veg preference toggle lives in Preferences', 'Logged-in user, on Profile', 'Preferences section, tap "Pure Veg"', 'Row toggles the global veg-only preference (formerly a "PURE VEG" pill on Home, see HOME-03) and filters On Demand kitchen results by mealType', 'P1'],
  ],
  'Wallet & Cashback': [
    ['WAL-01', 'Wallet', 'Guest sees login gate on Wallet/Cashback', 'Logged out', 'Navigate to /wallet or /cashback', '"Log in to view your Mealawe Money" + Login CTA', 'P1'],
    ['WAL-02', 'Wallet', 'Wallet transaction list paginates via Load more', 'History longer than one page', 'Scroll to bottom, tap "Load more"', 'Additional older transactions append to the list', 'P1'],
    ['WAL-03', 'Wallet', 'Credit vs debit transactions are visually distinct', 'Mixed credit/debit history', 'View transaction list', 'Credit rows show "+₹" in green/success, debit rows show "−₹" in red/danger', 'P1'],
    ['WAL-04', 'Cashback', 'Expired cashback entries labeled distinctly', 'History includes expired entries', 'View cashback history', 'Expired entries show "Expired <date>" instead of "Expires <date>"', 'P1'],
  ],
  Support: [
    ['SUP-01', 'Support', 'Help screen disables Chat/Call when no phone contact configured', 'No SUPPORT_PHONE_NO configured', 'View Help screen', 'Chat and Call actions render disabled', 'P1'],
    ['SUP-02', 'Support', 'FAQ rows expand/collapse independently', 'FAQs loaded', 'Tap one FAQ row', 'Only that row’s answer expands; others remain collapsed', 'P1'],
    ['SUP-03', 'Support', 'Feedback submit requires a non-empty comment', 'On Feedback screen', 'Leave comment blank, attempt Submit', 'Submit button stays disabled', 'P1'],
    ['SUP-04', 'Support', 'Feedback submit shows thank-you and resets the form', 'Comment filled in, logged-in user', 'Tap "Submit feedback"', '"Thank you!" alert shown; comment field resets after dismiss', 'P1'],
  ],
  Referral: [
    ['REF-01', 'Referral', 'Referral code is lazily generated and persisted on first visit', 'Logged-in profile with no referralCode yet', 'Open Profile > "Refer & Earn"', 'A spinner shows briefly while a code is generated + saved to the profile (see useReferralCode); the code then renders and persists across future visits', 'P1'],
    ['REF-02', 'Referral', 'Copy button copies the code and shows transient confirmation', 'Refer & Earn open, code resolved', 'Tap "Copy"', 'Code is copied to the clipboard; button label swaps to "Copied!" for 2s, then reverts to "Copy"', 'P1'],
    ['REF-03', 'Referral', 'Share Now opens the native share sheet with the code', 'Refer & Earn open, code resolved', 'Tap "Share Now"', 'OS share sheet opens (shareReferral) — not scripted further, gateway-owned UI', 'P2'],
    ['REF-04', 'Referral', 'FAQ rows expand/collapse independently', 'Refer & Earn open', 'Tap a FAQ question, then tap it again', 'That row\'s answer expands then collapses; other rows are unaffected', 'P1'],
  ],
  Location: [
    ['LOC-01', 'Location', 'Add a new address via the map/manual form', 'Logged-in user, on /addresses', 'Tap "+ Add new address", fill the flat/street field, Save', 'New address appears under "Saved addresses" and becomes the current delivery address', 'P0'],
    ['LOC-02', 'Location', 'Inline location search resolves a searched place to a serviceable pill', 'On /addresses, Google Places autocomplete reachable', 'Tap "Search a location to check availability", type ≥3 chars, select a suggestion', 'A resolved-address row shows "We deliver here" (green) or "We don\'t deliver here yet" (red); a "Use this" button appears only when serviceable', 'P1'],
    ['LOC-03', 'Location', 'LocationSplash is the first screen on every cold launch', 'Fresh app launch (any auth state)', 'Launch the app', '"Finding your location…" shows over a brand-green background before routing to /welcome, /register, or (tabs) home; never blocks longer than 4s even if GPS/permission stalls', 'P1'],
    ['LOC-04', 'Location', 'Returning users with a saved address still see the branded splash beat', 'A current address already exists locally', 'Launch the app', 'LocationSplash shows for a short fixed minimum (~1.1s) instead of skipping straight through — no real GPS wait since the address is already known', 'P2'],
  ],
};

// Placeholder/unimplemented verticals — explicitly out of scope, not invented.
// 'dine-in' shipped (see the "Dine In" sheet + dine-in-package-cart.yaml) and
// was removed from this list accordingly — don't re-add it without checking
// src/features/dine-in/ first.
const EXCLUDED_FEATURES = ['marketplace', 'oyo', 'payments'];

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Mealawe E2E test catalogue generator';
  wb.created = new Date(2026, 6, 28);

  // --- Summary sheet (first tab) ---
  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Sheet', key: 'sheet', width: 24 },
    { header: 'Case count', key: 'count', width: 14 },
    { header: 'P0', key: 'p0', width: 8 },
    { header: 'P1', key: 'p1', width: 8 },
    { header: 'P2', key: 'p2', width: 8 },
  ];
  styleHeader(summary);

  const summaryRows = [];
  summaryRows.push(countRow('Full Flow E2E', FULL_FLOW));
  for (const [name, rows] of Object.entries(FEATURE_SHEETS)) {
    summaryRows.push(countRow(name, rows));
  }
  summary.addRows(summaryRows);
  const totalCount = summaryRows.reduce((s, r) => s + r.count, 0);
  const totalP0 = summaryRows.reduce((s, r) => s + r.p0, 0);
  const totalP1 = summaryRows.reduce((s, r) => s + r.p1, 0);
  const totalP2 = summaryRows.reduce((s, r) => s + r.p2, 0);
  const totalRow = summary.addRow({ sheet: 'TOTAL', count: totalCount, p0: totalP0, p1: totalP1, p2: totalP2 });
  totalRow.font = { bold: true };

  const note = summary.addRow([]);
  summary.mergeCells(note.number, 1, note.number, 5);
  const noteRow = summary.getRow(note.number + 1);
  noteRow.getCell(1).value =
    'Excluded (no implementation yet, .gitkeep only): ' + EXCLUDED_FEATURES.join(', ');
  noteRow.getCell(1).font = { italic: true, color: { argb: 'FF888888' } };
  summary.mergeCells(noteRow.number, 1, noteRow.number, 5);

  // --- Full Flow E2E sheet ---
  addCatalogueSheet(wb, 'Full Flow E2E', FULL_FLOW, true);

  // --- Per-feature sheets ---
  for (const [name, rows] of Object.entries(FEATURE_SHEETS)) {
    addCatalogueSheet(wb, name, rows, false);
  }

  await wb.xlsx.writeFile(OUT_PATH);
  console.log(`Wrote ${OUT_PATH} (${totalCount} cases across ${summaryRows.length} sheets)`);
}

function countRow(name, rows) {
  const priorityIdx = rows[0].length - 1 === 7 ? 6 : 6; // priority is always 2nd-to-last or fixed index 6
  const p0 = rows.filter((r) => r[6] === 'P0').length;
  const p1 = rows.filter((r) => r[6] === 'P1').length;
  const p2 = rows.filter((r) => r[6] === 'P2').length;
  return { sheet: name, count: rows.length, p0, p1, p2 };
}

function styleHeader(ws) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF518937' } };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function addCatalogueSheet(wb, name, rows, hasFlowColumn) {
  const ws = wb.addWorksheet(name.slice(0, 31)); // Excel sheet-name length cap
  ws.columns = hasFlowColumn ? COLUMNS : COLUMNS.slice(0, 7);
  styleHeader(ws);

  for (const row of rows) {
    const added = ws.addRow(row);
    const priority = row[6];
    if (priority === 'P0') {
      added.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE9E9' } };
      });
    }
    added.alignment = { vertical: 'top', wrapText: true };
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

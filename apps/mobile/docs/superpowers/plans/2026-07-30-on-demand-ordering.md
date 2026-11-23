# On-Demand Ordering (Daily + Advance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "Daily" and "Advance" on-demand kitchen-ordering vertical in
MealaweUserAppRN — kitchen list → kitchen detail (mode toggle + item grid) → cart/
checkout — replacing the two placeholder shortcut screens, with full functional
parity with MealaweUserApp's `allDay`/`advance` on-demand flow plus this app's
established improved UI/UX conventions (design tokens, empty/loading states, disabled-
button-not-toast, etc.).

**Architecture:** New feature module `src/features/on-demand/` mirroring
`src/features/bulk/`'s shape (own types/api/schedule/pricing/bill/store/components),
one shared `kitchenMenu` fetch serving both modes via client-side filtering, a
dedicated `useOnDemandCartStore` scoped to one kitchen + one mode at a time. Three
new routes (`on-demand-kitchens`, `on-demand-kitchen`, `on-demand-cart`) replace the
two placeholder routes. No payment integration — checkout ends at the same
"Proceed to Pay →" alert every other cart in this app currently ships with.

**Tech Stack:** React Native (Expo SDK 57, expo-router), Zustand, TypeScript,
NativeWind v4, lucide-react-native icons, existing `AppText`/`Button`/`AccentIcon`/
`QuantityStepper`/`Skeleton`/`ConfirmDialog` primitives, `@/services/http` client,
`@/features/cart`'s `CouponSheet`/`SavingsBanner`/`CouponCelebration`.

**Spec:** `docs/superpowers/specs/2026-07-30-on-demand-ordering-design.md`

**Verification convention (no unit tests in this project):** every task's file(s)
are verified with `npx tsc --noEmit` (run via `node node_modules/typescript/bin/tsc
--noEmit` from `MealaweUserAppRN/` — `npx tsc` resolves to the wrong binary in this
environment; confirm no errors mention the new/changed file). UI tasks additionally
get a manual on-device description. A final task runs the full manual QA walkthrough.

---

### Task 1: On-demand domain types

**Files:**
- Create: `src/features/on-demand/types.ts`

- [ ] **Step 1: Write the types**

Create `src/features/on-demand/types.ts`:

```ts
export type OnDemandMode = 'allDay' | 'advance';

export interface DiscountOffer {
  discountType: 'percentage' | 'flat';
  discountValue: number;
  minAmount?: number;
  maxLimit?: number;
  startDate: string;
  expiryDate: string;
}

/** A kitchen that accepts on-demand (Daily/Advance) orders. */
export interface OnDemandKitchen {
  _id: string;
  kitchenName: string;
  imageUrl?: string;
  kitchenOpened: boolean;
  distance?: number;
  rating?: number;
  speciality?: string;
  mainSpeciality?: string;
  /** Veg/NonVeg/Jain tags the kitchen serves. */
  mealType?: string[];
  discountOffer?: DiscountOffer;
  /** Minutes the kitchen needs to prepare an order. */
  preparationTime?: number;
}

export interface OnDemandMenuItem {
  _id: string;
  itemName: string;
  itemDescription?: string;
  itemImage?: string;
  itemPrice: number;
  isVeg: boolean;
  itemType: 'Veg' | 'NonVeg' | 'Jain';
  mealType?: string;
  groupCategory?: string;
  itemIsCombo?: boolean;
  /** Eligible for Daily (allDay) mode. */
  serveDaily: boolean;
  /** Eligible for Advance mode. */
  itemAvailable: boolean;
  /** Present only for stock-limited items; undefined = uncapped. */
  quantityAvailable?: number;
  quantityBooked?: number;
}

export interface OnDemandMenuGroup {
  groupName: string;
  items: OnDemandMenuItem[];
}

export interface OnDemandCartLine {
  item: OnDemandMenuItem;
  count: number;
}

export type ItemStatus = 'available' | 'missed' | 'coming-next' | 'sold-out' | 'not-available';
```

- [ ] **Step 2: Verify**

Run (from `MealaweUserAppRN/`): `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors mentioning `on-demand/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/features/on-demand/types.ts
git commit -m "feat: add on-demand domain types"
```

---

### Task 2: Ordering-window + slot schedule logic

**Files:**
- Create: `src/features/on-demand/schedule.ts`

- [ ] **Step 1: Write the schedule module**

Create `src/features/on-demand/schedule.ts`:

```ts
import { ENDPOINTS, http } from '@/services/http';

export interface OrderingWindow {
  start: string; // "HH:mm"
  end: string;
}

export interface OrderingWindows {
  allDay: OrderingWindow;
  advance: OrderingWindow;
}

const DEFAULT_WINDOWS: OrderingWindows = {
  allDay: { start: '08:00', end: '22:00' },
  advance: { start: '08:00', end: '22:00' },
};

/** Parses "08:00"-style config strings into an hour number; falls back on any parse failure. */
function hourFrom(value: string | undefined, fallback: number): number {
  const hour = Number.parseInt((value ?? '').split(':')[0] ?? '', 10);
  return Number.isFinite(hour) ? hour : fallback;
}

/**
 * Fetch the Daily (`ALLDAY_ORDER_*`) and Advance (`ADV_ORDER_*`) ordering
 * windows from the backend config variables, falling back to 8am–10pm for
 * both on any failure — mirrors `bulk/schedule.ts#loadBulkSlotWindow`.
 */
export async function loadOrderingWindows(): Promise<OrderingWindows> {
  try {
    const res = await http.post<Array<{ configName: string; configData: string }>>(
      ENDPOINTS.support.variables,
      {
        variableNames: [
          'ALLDAY_ORDER_START_TIME',
          'ALLDAY_ORDER_END_TIME',
          'ADV_ORDER_START_TIME',
          'ADV_ORDER_END_TIME',
        ],
      },
    );
    const map: Record<string, string> = {};
    for (const row of Array.isArray(res) ? res : []) {
      if (row?.configName) map[row.configName] = row.configData;
    }
    return {
      allDay: {
        start: map.ALLDAY_ORDER_START_TIME ?? DEFAULT_WINDOWS.allDay.start,
        end: map.ALLDAY_ORDER_END_TIME ?? DEFAULT_WINDOWS.allDay.end,
      },
      advance: {
        start: map.ADV_ORDER_START_TIME ?? DEFAULT_WINDOWS.advance.start,
        end: map.ADV_ORDER_END_TIME ?? DEFAULT_WINDOWS.advance.end,
      },
    };
  } catch {
    return DEFAULT_WINDOWS;
  }
}

/** True when `now` falls inside the given mode's ordering window. */
export function isOrderingWindowOpen(
  mode: 'allDay' | 'advance',
  windows: OrderingWindows,
  now = new Date(),
): boolean {
  const w = windows[mode];
  const startHour = hourFrom(w.start, 8);
  const endHour = hourFrom(w.end, 22);
  const hour = now.getHours();
  return hour >= startHour && hour < endHour;
}

/** True when within 2 hours before the Daily window opens — "coming next" state.
 * Exact port of the legacy's `1000 * 60 * 60 * 2` threshold. */
export function isAllDayUpcoming(windows: OrderingWindows, now = new Date()): boolean {
  const startHour = hourFrom(windows.allDay.start, 8);
  const startToday = new Date(now);
  startToday.setHours(startHour, 0, 0, 0);
  const diffMs = startToday.getTime() - now.getTime();
  return diffMs > 0 && diffMs <= 1000 * 60 * 60 * 2;
}

export interface TimeSlot {
  start: string; // "HH:mm"
  end: string;
}

/**
 * Today's remaining hourly slots inside the Daily window, filtered so a slot
 * is only offered if it's more than `preparationTimeMins` away — exact port
 * of `generateTimeSlotsArray('allDay', maxPreparationTime)`, minus the
 * legacy's delivery-partner ETA term (no live-quote infra in this app; see
 * design spec's "Explicitly out of scope").
 */
export function allDaySlotsFor(windows: OrderingWindows, preparationTimeMins = 0, now = new Date()): TimeSlot[] {
  const startHour = hourFrom(windows.allDay.start, 8);
  const endHour = hourFrom(windows.allDay.end, 22);
  const slots: TimeSlot[] = [];
  for (let h = startHour; h < endHour; h++) {
    if (h <= now.getHours()) continue;
    const slotStart = new Date(now);
    slotStart.setHours(h, 0, 0, 0);
    const diffMins = (slotStart.getTime() - now.getTime()) / (1000 * 60);
    if (diffMins > preparationTimeMins) {
      slots.push({ start: `${String(h).padStart(2, '0')}:00`, end: `${String(h + 1).padStart(2, '0')}:00` });
    }
  }
  return slots;
}

/** Tomorrow + day-after-tomorrow (noon-pinned), as YYYY-MM-DD — exact port of
 * `tabCart.page.ts`'s fixed `allowedMinDate`/`allowedMaxDate`. */
export function advanceDates(now = new Date()): string[] {
  const dates: string[] = [];
  for (let i = 1; i <= 2; i++) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** Hourly slots across the Advance window — no "future only" filter needed
 * since the date is always at least tomorrow. */
export function advanceSlotsFor(windows: OrderingWindows): TimeSlot[] {
  const startHour = hourFrom(windows.advance.start, 8);
  const endHour = hourFrom(windows.advance.end, 22);
  const slots: TimeSlot[] = [];
  for (let h = startHour; h < endHour; h++) {
    slots.push({ start: `${String(h).padStart(2, '0')}:00`, end: `${String(h + 1).padStart(2, '0')}:00` });
  }
  return slots;
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-08-03" -> "3 Aug". Same format as bulk/dine-in's formatShort. */
export function formatShort(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}
```

- [ ] **Step 2: Verify**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors mentioning `on-demand/schedule.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/features/on-demand/schedule.ts
git commit -m "feat: add on-demand ordering-window and slot schedule logic"
```

---

### Task 3: Menu grouping + item-status pure logic

**Files:**
- Create: `src/features/on-demand/pricing.ts`

- [ ] **Step 1: Write the pricing/grouping module**

Create `src/features/on-demand/pricing.ts`:

```ts
import { isAllDayUpcoming, isOrderingWindowOpen, type OrderingWindows } from './schedule';
import type { DiscountOffer, ItemStatus, OnDemandKitchen, OnDemandMenuGroup, OnDemandMenuItem, OnDemandMode } from './types';

/** Exact port of `fetchKitchenMenu`'s fixed group ordering — unrecognized
 * groups sort to the end. */
const GROUP_ORDER = ['Main course', 'Thalis', 'Combo', 'Breads', 'Rice', 'Deserts', 'Desserts', 'Breakfast'];

function groupNameFor(item: OnDemandMenuItem): string {
  if (item.groupCategory) return item.groupCategory;
  if (item.itemIsCombo) return 'Combo';
  if (item.itemType) return item.itemType;
  return 'Other';
}

/**
 * Buckets a kitchen's full item list into one mode's menu, grouped and
 * sorted — exact port of `fetchKitchenMenu`'s `allDayItemList`/`advItemList`
 * split + `groupOrder`/`sortByGroup`. Daily uses `item.serveDaily`, Advance
 * uses `item.itemAvailable`.
 */
export function groupMenuByMode(items: OnDemandMenuItem[], mode: OnDemandMode): OnDemandMenuGroup[] {
  const eligible = items.filter((item) => (mode === 'allDay' ? item.serveDaily : item.itemAvailable));
  const byGroup = new Map<string, OnDemandMenuItem[]>();
  for (const item of eligible) {
    const name = groupNameFor(item);
    const list = byGroup.get(name) ?? [];
    list.push(item);
    byGroup.set(name, list);
  }
  const groups = Array.from(byGroup.entries()).map(([groupName, groupItems]) => ({
    groupName,
    items: groupItems,
  }));
  groups.sort((a, b) => {
    const ai = GROUP_ORDER.findIndex((g) => g.toLowerCase() === a.groupName.toLowerCase());
    const bi = GROUP_ORDER.findIndex((g) => g.toLowerCase() === b.groupName.toLowerCase());
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return groups;
}

/**
 * Per-item ordering status. Daily: 'missed' when the window is closed,
 * 'coming-next' when within 2h of opening, 'sold-out' when a stock cap
 * exists and is exhausted (cartCount included, matching the legacy's
 * `quantityAvailable - quantityBooked - item.count` check). Advance items
 * are never stock-capped — only gated by the window being open at all
 * (there's no advance-specific missed/coming-next state in the legacy app;
 * an advance order just isn't placeable outside its window, enforced at
 * checkout, not per-item).
 */
export function itemStatusFor(
  item: OnDemandMenuItem,
  mode: OnDemandMode,
  windows: OrderingWindows,
  cartCount: number,
): ItemStatus {
  if (mode === 'allDay') {
    if (!isOrderingWindowOpen('allDay', windows)) {
      return isAllDayUpcoming(windows) ? 'coming-next' : 'missed';
    }
    if (
      typeof item.quantityAvailable === 'number' &&
      item.quantityAvailable - (item.quantityBooked ?? 0) - cartCount <= 0
    ) {
      return 'sold-out';
    }
    return 'available';
  }
  return item.itemAvailable ? 'available' : 'not-available';
}

/**
 * Kitchen-level discount offer resolved against a subtotal — exact port of
 * `checkForOffers()`/`getKitchenDiscount()`: percentage capped by maxLimit,
 * flat capped by the subtotal itself, gated by start/expiry date.
 */
export function kitchenDiscountFor(
  offer: DiscountOffer | undefined,
  subTotal: number,
  now = new Date(),
): number {
  if (!offer) return 0;
  const start = new Date(offer.startDate).getTime();
  const expiry = new Date(offer.expiryDate).getTime();
  const time = now.getTime();
  if (time < start || time > expiry) return 0;
  if (offer.discountType === 'flat') {
    return Math.min(offer.discountValue, subTotal);
  }
  const raw = Math.floor((subTotal / 100) * offer.discountValue);
  return offer.maxLimit ? Math.min(raw, offer.maxLimit) : raw;
}

/** Formats an offer for the kitchen-card badge — "Upto 20% OFF" / "FLAT 50 OFF". */
export function offerBadgeText(kitchen: OnDemandKitchen, now = new Date()): string | null {
  const offer = kitchen.discountOffer;
  if (!offer) return null;
  const start = new Date(offer.startDate).getTime();
  const expiry = new Date(offer.expiryDate).getTime();
  const time = now.getTime();
  if (time < start || time > expiry) return null;
  return offer.discountType === 'percentage'
    ? `Upto ${offer.discountValue}% OFF`
    : `FLAT ${offer.discountValue} OFF`;
}
```

- [ ] **Step 2: Verify**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors mentioning `on-demand/pricing.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/features/on-demand/pricing.ts
git commit -m "feat: add on-demand menu grouping and item-status logic"
```

---

### Task 4: Bill computation

**Files:**
- Create: `src/features/on-demand/bill.ts`

- [ ] **Step 1: Write the bill module**

Create `src/features/on-demand/bill.ts`:

```ts
import type { OnDemandCartLine } from './types';

export interface OnDemandBillCharges {
  deliveryCharge: number;
  deliveryChargeDiscount: number;
  deliveryGstPercent: number;
  packagingCharge: number;
  packagingChargeDiscount: number;
  packagingGstPercent: number;
  platformCharge: number;
  platformChargeDiscount: number;
  platformGstPercent: number;
  /** GST % on the (discounted) item amount. */
  itemGstPercent: number;
}

/** Fallback charges (overridden by the cluster config in a later phase). */
export const DEFAULT_ONDEMAND_CHARGES: OnDemandBillCharges = {
  deliveryCharge: 30,
  deliveryChargeDiscount: 0,
  deliveryGstPercent: 18,
  packagingCharge: 10,
  packagingChargeDiscount: 0,
  packagingGstPercent: 18,
  platformCharge: 5,
  platformChargeDiscount: 0,
  platformGstPercent: 18,
  itemGstPercent: 5,
};

/** Map a cluster config variable (searchClusterVariable) onto OnDemandBillCharges.
 * Field names match real, already-existing keys on the server's
 * ClusterConfigVariable model (onDemand* fields) — see design spec's Business
 * logic section. */
export function chargesFromOnDemandConfig(cfg: Record<string, unknown> | null | undefined): OnDemandBillCharges {
  if (!cfg) {
    return DEFAULT_ONDEMAND_CHARGES;
  }
  const num = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    deliveryCharge: num(cfg['onDemandDeliveryCharges'], DEFAULT_ONDEMAND_CHARGES.deliveryCharge),
    deliveryChargeDiscount: num(
      cfg['onDemandDeliveryChargesDiscount'],
      DEFAULT_ONDEMAND_CHARGES.deliveryChargeDiscount,
    ),
    deliveryGstPercent: num(cfg['onDemandDeliveryGstPercentage'], DEFAULT_ONDEMAND_CHARGES.deliveryGstPercent),
    packagingCharge: num(
      cfg['onDemandEcoFriendlyPackagingCharges'],
      DEFAULT_ONDEMAND_CHARGES.packagingCharge,
    ),
    packagingChargeDiscount: num(
      cfg['onDemandEcoFriendlyPackagingChargesDiscount'],
      DEFAULT_ONDEMAND_CHARGES.packagingChargeDiscount,
    ),
    packagingGstPercent: num(
      cfg['onDemandEcoFriendlyPackagingGstPercentage'],
      DEFAULT_ONDEMAND_CHARGES.packagingGstPercent,
    ),
    platformCharge: num(cfg['onDemandPlatformCharges'], DEFAULT_ONDEMAND_CHARGES.platformCharge),
    platformChargeDiscount: num(
      cfg['onDemandPlatformChargesDiscount'],
      DEFAULT_ONDEMAND_CHARGES.platformChargeDiscount,
    ),
    platformGstPercent: num(cfg['onDemandPlatformChargesGstPercentage'], DEFAULT_ONDEMAND_CHARGES.platformGstPercent),
    itemGstPercent: DEFAULT_ONDEMAND_CHARGES.itemGstPercent,
  };
}

export interface OnDemandBill {
  subTotal: number;
  kitchenDiscount: number;
  delivery: number;
  packaging: number;
  platform: number;
  taxes: number;
  discount: number;
  cashbackUsed: number;
  moneyWalletUsed: number;
  toPay: number;
  saving: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function emptyOnDemandBill(): OnDemandBill {
  return {
    subTotal: 0,
    kitchenDiscount: 0,
    delivery: 0,
    packaging: 0,
    platform: 0,
    taxes: 0,
    discount: 0,
    cashbackUsed: 0,
    moneyWalletUsed: 0,
    toPay: 0,
    saving: 0,
  };
}

/**
 * Pure bill computation — mirrors `getOtherPayAmt()`: flat (not per-day)
 * delivery/packaging/platform charges with their own GST%, kitchen discount
 * applied before coupon, then cashback then money-wallet reduce the payable.
 */
export function buildOnDemandBill(
  lines: OnDemandCartLine[],
  kitchenDiscount: number,
  charges: OnDemandBillCharges = DEFAULT_ONDEMAND_CHARGES,
  couponDiscount = 0,
  cashbackUsed = 0,
  moneyWalletUsed = 0,
): OnDemandBill {
  const subTotal = round2(lines.reduce((sum, l) => sum + l.item.itemPrice * l.count, 0));

  if (lines.length === 0) {
    return emptyOnDemandBill();
  }

  const delivery = round2(charges.deliveryCharge - charges.deliveryChargeDiscount);
  const packaging = round2(charges.packagingCharge - charges.packagingChargeDiscount);
  const platform = round2(charges.platformCharge - charges.platformChargeDiscount);

  const totalDiscount = round2(kitchenDiscount + couponDiscount);
  const itemGst = round2(((subTotal - totalDiscount) * charges.itemGstPercent) / 100);
  const deliveryGst = round2((delivery * charges.deliveryGstPercent) / 100);
  const packagingGst = round2((packaging * charges.packagingGstPercent) / 100);
  const platformGst = round2((platform * charges.platformGstPercent) / 100);
  const taxes = round2(itemGst + deliveryGst + packagingGst + platformGst);

  const grossToPay = round2(subTotal - totalDiscount + delivery + packaging + platform + taxes);
  const cashback = round2(Math.max(0, Math.min(cashbackUsed, grossToPay)));
  const afterCashback = round2(grossToPay - cashback);
  const moneyWallet = round2(Math.max(0, Math.min(moneyWalletUsed, afterCashback)));
  const toPay = round2(afterCashback - moneyWallet);
  const saving = round2(totalDiscount + cashback + moneyWallet);

  return {
    subTotal,
    kitchenDiscount,
    delivery,
    packaging,
    platform,
    taxes,
    discount: couponDiscount,
    cashbackUsed: cashback,
    moneyWalletUsed: moneyWallet,
    toPay,
    saving,
  };
}
```

- [ ] **Step 2: Verify**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors mentioning `on-demand/bill.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/features/on-demand/bill.ts
git commit -m "feat: add on-demand bill computation"
```

---

### Task 5: API client

**Files:**
- Modify: `src/services/http/endpoints.ts`
- Create: `src/features/on-demand/api.ts`

- [ ] **Step 1: Add the on-demand endpoint domain**

In `src/services/http/endpoints.ts`, replace the trailing comment line with a new
`onDemand` domain (verified paths/methods against `MealaweUserApp/src/service/
apiService/apiConfig.service.ts` — see line references in the design spec):

```ts
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
  },
  // ...add domains (home, marketplace, oyo) as each vertical is migrated.
```

- [ ] **Step 2: Write the API client**

Create `src/features/on-demand/api.ts`:

```ts
import { env } from '@/config';
import { ENDPOINTS, http } from '@/services/http';
import type { SubscriptionCoupon } from '@/features/subscription';
import { useAuthStore } from '@/store/authStore';
import { useClusterStore } from '@/store/clusterStore';
import { useLocationStore } from '@/store/locationStore';

import type { OnDemandKitchen, OnDemandMenuItem, OnDemandMode } from './types';

/** Absolute URL for a backend image path — the legacy templates always
 * concatenate `environment.imageUrl + item.imageUrl`/`kitchen.imageUrl`
 * (confirmed in kitchen-card.component.html:5 and item-card.component.html:41);
 * the raw field itself is a relative path, never a full URL. */
function resolveImage(path: unknown): string | undefined {
  return typeof path === 'string' && path ? `${env.imageUrl}${path}` : undefined;
}

function normalizeKitchen(raw: Record<string, unknown>): OnDemandKitchen {
  const offerRaw = raw.discountOffer as Record<string, unknown> | undefined;
  return {
    _id: String(raw._id ?? raw.id ?? ''),
    kitchenName: String(raw.kitchenName ?? raw.name ?? ''),
    imageUrl: resolveImage(raw.imageUrl),
    kitchenOpened: raw.kitchenOpened !== false,
    distance: typeof raw.distance === 'number' ? raw.distance : undefined,
    rating: typeof raw.rating === 'number' ? raw.rating : undefined,
    speciality: raw.speciality ? String(raw.speciality) : undefined,
    mainSpeciality: raw.mainSpeciality ? String(raw.mainSpeciality) : undefined,
    mealType: Array.isArray(raw.mealType) ? (raw.mealType as string[]) : undefined,
    discountOffer: offerRaw
      ? {
          discountType: offerRaw.discountType === 'flat' ? 'flat' : 'percentage',
          discountValue: Number(offerRaw.discountValue ?? 0),
          minAmount: offerRaw.minAmount !== undefined ? Number(offerRaw.minAmount) : undefined,
          maxLimit: offerRaw.maxLimit !== undefined ? Number(offerRaw.maxLimit) : undefined,
          startDate: String(offerRaw.startDate ?? ''),
          expiryDate: String(offerRaw.expiryDate ?? ''),
        }
      : undefined,
    preparationTime: typeof raw.preparationTime === 'number' ? raw.preparationTime : undefined,
  };
}

function normalizeMenuItem(raw: Record<string, unknown>): OnDemandMenuItem {
  const itemType = String(raw.itemType ?? 'Veg') as 'Veg' | 'NonVeg' | 'Jain';
  return {
    _id: String(raw._id ?? raw.id ?? ''),
    itemName: String(raw.itemName ?? ''),
    itemDescription: raw.itemDescription ? String(raw.itemDescription) : undefined,
    // Legacy field is `imageUrl` (item-card.component.html:41), not `itemImage`
    // — that name only exists in this app's unrelated bulk-menu item type.
    itemImage: resolveImage(raw.imageUrl),
    itemPrice: Number(raw.itemPrice ?? 0),
    isVeg: itemType === 'Veg',
    itemType,
    mealType: raw.mealType ? String(raw.mealType) : undefined,
    groupCategory: raw.groupCategory ? String(raw.groupCategory) : undefined,
    itemIsCombo: raw.itemIsCombo === true,
    serveDaily: raw.serveDaily === true,
    itemAvailable: raw.itemAvailable === true,
    quantityAvailable: typeof raw.quantityAvailable === 'number' ? raw.quantityAvailable : undefined,
    quantityBooked: typeof raw.quantityBooked === 'number' ? raw.quantityBooked : undefined,
  };
}

/**
 * Cluster-scoped kitchen list for on-demand ordering. `mode` is accepted for
 * future server-side filtering but the current endpoint returns every
 * on-demand kitchen regardless of mode (mode-eligibility is per-item, not
 * per-kitchen — see `groupMenuByMode`). Empty (not thrown) when
 * unserviceable, missing location, or on any request failure.
 */
export async function loadNearestKitchens(_mode: OnDemandMode): Promise<OnDemandKitchen[]> {
  const clusterList = useClusterStore.getState().clusterIds();
  const geo = useLocationStore.getState().current?.geolocation;
  if (clusterList.length === 0 || !geo) {
    return [];
  }
  try {
    const path = `${ENDPOINTS.onDemand.nearestKitchens}/1/${geo.lng}/${geo.lat}`;
    const list = await http.post<Record<string, unknown>[]>(path, { clusterList });
    return Array.isArray(list) ? list.map(normalizeKitchen) : [];
  } catch {
    return [];
  }
}

/** A single kitchen's profile (used when deep-linking straight to a kitchen). */
export async function loadKitchenProfile(kitchenId: string): Promise<OnDemandKitchen | null> {
  try {
    const raw = await http.get<Record<string, unknown>>(`${ENDPOINTS.onDemand.kitchenProfile}/${kitchenId}`);
    return raw && raw._id ? normalizeKitchen(raw) : null;
  } catch {
    return null;
  }
}

/** A kitchen's full item list (both modes' eligibility flags included in one response). */
export async function loadKitchenMenu(kitchenId: string): Promise<OnDemandMenuItem[]> {
  try {
    const raw = await http.get<{ itemList?: Record<string, unknown>[] }>(
      `${ENDPOINTS.onDemand.kitchenMenu}/${kitchenId}`,
    );
    const itemList = raw?.itemList;
    return Array.isArray(itemList) ? itemList.map(normalizeMenuItem) : [];
  } catch {
    return [];
  }
}

/**
 * Valid on-demand coupons for the current cluster(s), filtered to the given
 * mode's `orderTypes` tag (`'allDay'` or `'advance'` — confirmed against the
 * legacy coupon model's `orderTypes: ['advance','daily','allDay']`). Same
 * `validCoupons` endpoint bulk/subscription already call.
 */
export async function loadOnDemandCoupons(mode: OnDemandMode): Promise<SubscriptionCoupon[]> {
  const clusters = useClusterStore.getState().clusterIds();
  if (clusters.length === 0) {
    return [];
  }
  const profileId = useAuthStore.getState().profile?._id ?? 'all';
  try {
    const list = await http.post<SubscriptionCoupon[]>(
      `${ENDPOINTS.subscription.validCoupons}/${profileId}`,
      { clusters },
    );
    if (!Array.isArray(list)) {
      return [];
    }
    return list
      .filter((c) => Array.isArray(c?.orderTypes) && c.orderTypes!.indexOf(mode) > -1)
      .sort((a, b) => (b.seqWeightage || 0) - (a.seqWeightage || 0));
  } catch {
    return [];
  }
}
```

- [ ] **Step 3: Verify**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors mentioning `endpoints.ts` or `on-demand/api.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/services/http/endpoints.ts src/features/on-demand/api.ts
git commit -m "feat: add on-demand API client and endpoint registry"
```

---

### Task 6: Cart store

**Files:**
- Modify: `src/config/constants.ts`
- Create: `src/features/on-demand/useOnDemandCartStore.ts`

- [ ] **Step 1: Add the storage key**

In `src/config/constants.ts`, add a new key to `STORAGE_KEYS` after `dineInBooking`:

```ts
export const STORAGE_KEYS = {
  sessionToken: 'mw.session.token',
  user: 'mw.user',
  selectedAddress: 'mw.location.address',
  clusters: 'mw.location.clusters',
  cart: 'mw.cart',
  bulkCart: 'mw.cart.bulk',
  dineInBooking: 'mw.booking.dinein',
  onDemandCart: 'mw.cart.ondemand',
  themePreference: 'mw.theme.preference',
} as const;
```

- [ ] **Step 2: Write the cart store**

Create `src/features/on-demand/useOnDemandCartStore.ts`:

```ts
import { create } from 'zustand';

import { STORAGE_KEYS } from '@/config';
import { kvStorage } from '@/services/storage/kvStore';

import type { AppliedCoupon } from '../cart/types';
import type { OnDemandCartLine, OnDemandKitchen, OnDemandMenuItem, OnDemandMode } from './types';

export interface OnDemandCart {
  kitchen: OnDemandKitchen | null;
  mode: OnDemandMode | null;
  lines: OnDemandCartLine[];
  coupon: AppliedCoupon | null;
}

const EMPTY_CART: OnDemandCart = {
  kitchen: null,
  mode: null,
  lines: [],
  coupon: null,
};

interface OnDemandCartState {
  cart: OnDemandCart;
  hydrate: () => void;
  /**
   * Set an item's quantity (0 removes the line). On-demand carts are
   * single-kitchen + single-mode — passing a `kitchen`/`mode` different from
   * the cart's current one clears every existing line first (mirrors the
   * legacy's `checkIfItemCanBeAdded` same-kitchen-and-orderType conflict rule).
   */
  setCount: (item: OnDemandMenuItem, kitchen: OnDemandKitchen, mode: OnDemandMode, count: number) => void;
  applyCoupon: (coupon: AppliedCoupon) => void;
  clearCoupon: () => void;
  reset: () => void;
}

function readCart(): OnDemandCart {
  try {
    return { ...EMPTY_CART, ...(kvStorage.getObject<OnDemandCart>(STORAGE_KEYS.onDemandCart) ?? {}) };
  } catch {
    return EMPTY_CART;
  }
}

function writeCart(cart: OnDemandCart): void {
  try {
    kvStorage.setObject(STORAGE_KEYS.onDemandCart, cart);
  } catch {
    // storage unavailable (e.g. Expo Go) — in-memory state still works
  }
}

/**
 * On-demand cart state — one kitchen + one mode + an array of quantity lines,
 * kept as its own store (not merged into useBulkCartStore or useCartStore)
 * since the single-kitchen/single-mode scoping constraint doesn't fit
 * either existing store's shape. See design spec's "Why a separate cart
 * store" section.
 */
export const useOnDemandCartStore = create<OnDemandCartState>((set, get) => ({
  cart: EMPTY_CART,

  hydrate: () => set({ cart: readCart() }),

  setCount: (item, kitchen, mode, count) => {
    const current = get().cart;
    const sameContext = current.kitchen?._id === kitchen._id && current.mode === mode;
    const lines = sameContext ? current.lines : [];
    const resolvedCount = Math.max(0, count);

    let nextLines: OnDemandCartLine[];
    if (resolvedCount <= 0) {
      nextLines = lines.filter((l) => l.item._id !== item._id);
    } else {
      const exists = lines.some((l) => l.item._id === item._id);
      nextLines = exists
        ? lines.map((l) => (l.item._id === item._id ? { item, count: resolvedCount } : l))
        : [...lines, { item, count: resolvedCount }];
    }

    // A coupon's discount was computed against the old kitchen/mode's
    // subtotal — carrying it across a context switch would apply a stale,
    // unrevalidated discount to a cart the coupon was never checked against.
    const cart: OnDemandCart = {
      kitchen,
      mode,
      lines: nextLines,
      coupon: sameContext ? current.coupon : null,
    };
    writeCart(cart);
    set({ cart });
  },

  applyCoupon: (coupon) => {
    const cart: OnDemandCart = { ...get().cart, coupon };
    writeCart(cart);
    set({ cart });
  },

  clearCoupon: () => {
    const cart: OnDemandCart = { ...get().cart, coupon: null };
    writeCart(cart);
    set({ cart });
  },

  reset: () => {
    writeCart(EMPTY_CART);
    set({ cart: EMPTY_CART });
  },
}));
```

- [ ] **Step 3: Verify**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors mentioning `constants.ts` or `useOnDemandCartStore.ts`.

- [ ] **Step 4: Wire into `initStores()`**

In `src/store/index.ts`, add the import and hydrate call, and re-export the store —
following the exact pattern already used for `useBulkCartStore`/`useDineInBookingStore`:

```ts
import { useBulkCartStore } from '@/features/bulk/useBulkCartStore';
import { useDineInBookingStore } from '@/features/dine-in/useDineInBookingStore';
import { useOnDemandCartStore } from '@/features/on-demand/useOnDemandCartStore';
import { setAuthTokenProvider } from '@/services/http';

import { useAuthStore } from './authStore';
import { useCartStore } from './cartStore';
import { useClusterStore } from './clusterStore';
import { useLocationStore } from './locationStore';
import { useThemeStore } from './themeStore';

/** Call once at startup to connect stores to cross-cutting services. */
export function initStores(): void {
  // HTTP client reads the token straight from the auth store on each request.
  setAuthTokenProvider(() => useAuthStore.getState().token);
  // Apply the persisted theme preference before first render (no flash).
  useThemeStore.getState().hydrate();
  // Seed cached clusters, then refresh detection from the current address.
  useClusterStore.getState().hydrate();
  const current = useLocationStore.getState().current;
  if (current?.geolocation) {
    void useClusterStore.getState().detectClusters(current.geolocation);
  }
  // Restore any in-progress cart.
  useCartStore.getState().hydrate();
  useBulkCartStore.getState().hydrate();
  useDineInBookingStore.getState().hydrate();
  useOnDemandCartStore.getState().hydrate();

  // Keep saved addresses in sync when the profile loads/changes after boot
  // (login fetches the profile async — its addressList must reflow into the store).
  useAuthStore.subscribe((state, prev) => {
    if (state.profile !== prev.profile) {
      useLocationStore.getState().hydrate();
    }
  });
}

export { useAuthStore } from './authStore';
export { useThemeStore, type ThemePreference } from './themeStore';
export { useClusterStore } from './clusterStore';
export { useCartStore } from './cartStore';
export { useBulkCartStore } from '@/features/bulk/useBulkCartStore';
export { useDineInBookingStore } from '@/features/dine-in/useDineInBookingStore';
export { useOnDemandCartStore } from '@/features/on-demand/useOnDemandCartStore';
export {
  useLocationStore,
  type Address,
  type GeoPoint,
  type TagLocation,
} from './locationStore';
export type { Cluster } from '@/features/location/types';
```

- [ ] **Step 5: Verify**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors mentioning `store/index.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/config/constants.ts src/features/on-demand/useOnDemandCartStore.ts src/store/index.ts
git commit -m "feat: add on-demand cart store, wire into initStores"
```

---

### Task 7: Kitchen list + mode-toggle + veg-filter components

**Files:**
- Create: `src/features/on-demand/components/OnDemandKitchenCard.tsx`
- Create: `src/features/on-demand/components/ModeToggle.tsx`
- Create: `src/features/on-demand/components/VegFilterChips.tsx`

- [ ] **Step 1: Write `OnDemandKitchenCard`**

Create `src/features/on-demand/components/OnDemandKitchenCard.tsx`:

```tsx
import { Image } from 'expo-image';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { IconMapPin, IconStar, IconUtensils } from '@/components/ui/icons';
import { palette, shadow, useColors } from '@/theme';

import { offerBadgeText } from '../pricing';
import type { OnDemandKitchen } from '../types';

interface OnDemandKitchenCardProps {
  kitchen: OnDemandKitchen;
  onPress: () => void;
}

/** Kitchen list tile — photo (or gradient fallback) banner with a rating pill
 * and offer badge, closed-state dimming, and a white footer with name/
 * distance and a CTA. Same visual shape as dine-in's KitchenHeroCard, plus
 * the on-demand-specific offer badge and closed dim. */
export function OnDemandKitchenCard({ kitchen, onPress }: OnDemandKitchenCardProps) {
  const colors = useColors();
  const offerText = offerBadgeText(kitchen);
  return (
    <View
      style={[shadow.card, { borderRadius: 18, overflow: 'hidden', opacity: kitchen.kitchenOpened ? 1 : 0.6 }]}>
      <View style={{ height: 140 }}>
        {kitchen.imageUrl ? (
          <Image source={{ uri: kitchen.imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <LinearGradient
            colors={[palette.accent.food, palette.brand.teal]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <IconUtensils size={40} color="#ffffff" strokeWidth={1.5} style={{ opacity: 0.9 }} />
          </LinearGradient>
        )}
        {kitchen.rating ? (
          <View className="absolute left-3 top-3 flex-row items-center gap-1 rounded-full bg-black/50 px-2.5 py-1">
            <IconStar size={13} color={palette.accent.rating} fill={palette.accent.rating} />
            <AppText variant="caption" className="text-white">
              {kitchen.rating.toFixed(1)}
            </AppText>
          </View>
        ) : null}
        {!kitchen.kitchenOpened ? (
          <View className="absolute inset-0 items-center justify-center bg-black/40">
            <AppText variant="label" className="text-white">
              CLOSED
            </AppText>
          </View>
        ) : offerText ? (
          <View
            className="absolute bottom-2 left-2 rounded-lg px-2 py-1"
            style={{ backgroundColor: palette.accent.offer }}>
            <AppText variant="caption" className="text-white">
              {offerText}
            </AppText>
          </View>
        ) : null}
      </View>

      <View className="gap-2 p-4" style={{ backgroundColor: colors.card }}>
        <AppText variant="title" className="text-foreground">
          {kitchen.kitchenName}
        </AppText>
        {kitchen.speciality ? (
          <AppText variant="bodySm" className="text-muted-foreground" numberOfLines={1}>
            {kitchen.speciality}
          </AppText>
        ) : null}
        {typeof kitchen.distance === 'number' ? (
          <View className="flex-row items-center gap-1.5">
            <IconMapPin size={14} color={colors.mutedForeground} />
            <AppText variant="bodySm" className="text-muted-foreground">
              {kitchen.distance.toFixed(1)} {kitchen.distance > 1 ? 'Kms' : 'Km'}
            </AppText>
          </View>
        ) : null}
        <View style={{ marginTop: 4 }}>
          <Button label="View menu" onPress={onPress} block disabled={!kitchen.kitchenOpened} />
        </View>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Write `ModeToggle`**

Create `src/features/on-demand/components/ModeToggle.tsx`:

```tsx
import { View } from 'react-native';

import { Button } from '@/components/ui/Button';

import type { OnDemandMode } from '../types';

interface ModeToggleProps {
  mode: OnDemandMode;
  onChange: (mode: OnDemandMode) => void;
  /** Hide a capsule when that mode has no eligible items for this kitchen —
   * mirrors the legacy's `*ngIf="!noAlldayMenu"` guard. */
  showDaily?: boolean;
  showAdvance?: boolean;
}

/** Two-capsule Daily/Advance segmented control — same visual language as
 * bulk-menu.tsx's Individual/Bulk Button pair. */
export function ModeToggle({ mode, onChange, showDaily = true, showAdvance = true }: ModeToggleProps) {
  return (
    <View className="flex-row items-center gap-2">
      {showDaily ? (
        <Button
          label="Daily"
          variant={mode === 'allDay' ? 'primary' : 'outline'}
          size="sm"
          onPress={() => onChange('allDay')}
        />
      ) : null}
      {showAdvance ? (
        <Button
          label="Advance"
          variant={mode === 'advance' ? 'primary' : 'outline'}
          size="sm"
          onPress={() => onChange('advance')}
        />
      ) : null}
    </View>
  );
}
```

- [ ] **Step 3: Write `VegFilterChips`**

Create `src/features/on-demand/components/VegFilterChips.tsx`:

```tsx
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { DietMark } from '@/components/ui/DietMark';
import { palette, useColors } from '@/theme';

export type DietFilter = 'Veg' | 'NonVeg' | 'Jain' | null;

interface VegFilterChipsProps {
  value: DietFilter;
  onChange: (value: DietFilter) => void;
}

/** Single-select Veg/Non-veg/Jain filter row — tapping the active chip again
 * clears the filter (mirrors the legacy's `changeItemFilter`'s crossIcon-to-clear). */
export function VegFilterChips({ value, onChange }: VegFilterChipsProps) {
  const colors = useColors();
  const chip = (label: DietFilter, text: string) => {
    const active = value === label;
    return (
      <Pressable
        onPress={() => onChange(active ? null : label)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${active ? 'border-primary bg-primary' : 'border-border'}`}>
        {label !== 'Jain' ? <DietMark veg={label === 'Veg'} size={12} /> : null}
        <AppText variant="caption" className={active ? 'text-white' : 'text-foreground'}>
          {text}
        </AppText>
      </Pressable>
    );
  };
  return (
    <View className="flex-row gap-2" style={{ backgroundColor: colors.card }}>
      {chip('Veg', 'Veg')}
      {chip('NonVeg', 'Non-Veg')}
      {chip('Jain', 'Jain')}
    </View>
  );
}
```

- [ ] **Step 4: Verify**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors mentioning any of the three new component files.

- [ ] **Step 5: Commit**

```bash
git add src/features/on-demand/components/OnDemandKitchenCard.tsx src/features/on-demand/components/ModeToggle.tsx src/features/on-demand/components/VegFilterChips.tsx
git commit -m "feat: add on-demand kitchen card, mode toggle, veg filter components"
```

---

### Task 8: Item card + slot picker + cart footer components

**Files:**
- Create: `src/features/on-demand/components/OnDemandItemCard.tsx`
- Create: `src/features/on-demand/components/OnDemandSlotPicker.tsx`
- Create: `src/features/on-demand/components/OnDemandCartFooter.tsx`

- [ ] **Step 1: Write `OnDemandItemCard`**

Create `src/features/on-demand/components/OnDemandItemCard.tsx`:

```tsx
import { Image } from 'expo-image';
import { View } from 'react-native';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { DietMark } from '@/components/ui/DietMark';
import { IconClock, IconUtensils } from '@/components/ui/icons';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { accentTint, palette, shadow } from '@/theme';

import type { ItemStatus, OnDemandMenuItem } from '../types';

interface OnDemandItemCardProps {
  item: OnDemandMenuItem;
  count: number;
  status: ItemStatus;
  onIncrease: () => void;
  onDecrease: () => void;
}

const STATUS_LABEL: Record<Exclude<ItemStatus, 'available'>, string> = {
  missed: 'MISSED',
  'coming-next': 'COMING NEXT',
  'sold-out': 'SOLD OUT',
  'not-available': 'NOT AVAILABLE',
};

/** Item row: image/fallback tile, diet mark, name + description, price,
 * quantity stepper — or a tinted status badge in place of the stepper when
 * not orderable (Missed/Coming next/Sold out/Not available), replacing the
 * legacy's plain-text badges with this app's AccentIcon tone system. */
export function OnDemandItemCard({ item, count, status, onIncrease, onDecrease }: OnDemandItemCardProps) {
  const orderable = status === 'available';
  return (
    <View style={shadow.card} className="flex-row gap-3 rounded-2xl border border-border bg-card p-3">
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: accentTint(palette.accent.food, 0.14),
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {item.itemImage ? (
          <Image source={{ uri: item.itemImage }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <IconUtensils size={24} color={palette.accent.food} />
        )}
      </View>
      <View className="flex-1 justify-between">
        <View className="flex-row items-start gap-2">
          <View className="mt-1">
            <DietMark veg={item.isVeg} size={14} />
          </View>
          <View className="flex-1">
            <AppText variant="label" className="text-foreground">
              {item.itemName}
            </AppText>
            {item.itemDescription ? (
              <AppText variant="caption" className="text-muted-foreground" numberOfLines={2}>
                {item.itemDescription}
              </AppText>
            ) : null}
          </View>
        </View>
        <View className="flex-row items-center justify-between">
          <AppText variant="body" className="text-foreground">
            ₹{item.itemPrice}
          </AppText>
          {orderable ? (
            <QuantityStepper
              count={count}
              onIncrease={onIncrease}
              onDecrease={onDecrease}
              decreaseLabel={`Decrease ${item.itemName} quantity`}
              increaseLabel={`Increase ${item.itemName} quantity`}
            />
          ) : (
            <View className="flex-row items-center gap-1">
              <AccentIcon
                icon={IconClock}
                tone={status === 'coming-next' ? 'info' : 'nonveg'}
                bare
                size={13}
              />
              <AppText
                variant="caption"
                style={{ color: status === 'coming-next' ? palette.accent.info : palette.accent.nonveg }}>
                {STATUS_LABEL[status as Exclude<ItemStatus, 'available'>]}
              </AppText>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Write `OnDemandSlotPicker`**

Create `src/features/on-demand/components/OnDemandSlotPicker.tsx`:

```tsx
import { Pressable, ScrollView, View } from 'react-native';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { IconCalendar, IconClock } from '@/components/ui/icons';
import { shadow } from '@/theme';

import { formatShort } from '../schedule';
import type { TimeSlot } from '../schedule';
import type { OnDemandMode } from '../types';

function dayOfWeek(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

interface OnDemandSlotPickerProps {
  mode: OnDemandMode;
  /** Date chips — only rendered for Advance mode (Daily is always today). */
  dateOptions: string[];
  date: string | null;
  onSelectDate: (date: string) => void;
  slots: TimeSlot[];
  slot: TimeSlot | null;
  onSelectSlot: (slot: TimeSlot) => void;
}

/** Date (Advance only) + hourly slot picker — same visual pattern as
 * BulkDeliveryPicker/DineInDateSlotPicker. */
export function OnDemandSlotPicker({
  mode,
  dateOptions,
  date,
  onSelectDate,
  slots,
  slot,
  onSelectSlot,
}: OnDemandSlotPickerProps) {
  return (
    <View className="rounded-2xl border border-border bg-card p-4" style={[shadow.card, { gap: 10 }]}>
      {mode === 'advance' ? (
        <>
          <View className="flex-row items-center gap-2">
            <AccentIcon icon={IconCalendar} tone="plan" size={14} tileSize={26} />
            <AppText variant="overline" className="text-muted-foreground">
              DELIVERY DATE
            </AppText>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {dateOptions.map((d) => {
                const active = date === d;
                return (
                  <Pressable
                    key={d}
                    onPress={() => onSelectDate(d)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`items-center rounded-xl border px-3 py-2 ${active ? 'border-primary bg-primary' : 'border-border'}`}>
                    <AppText variant="caption" className={active ? 'text-white/80' : 'text-muted-foreground'}>
                      {dayOfWeek(d)}
                    </AppText>
                    <AppText variant="bodySm" className={active ? 'text-white' : 'text-foreground'}>
                      {formatShort(d)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </>
      ) : null}

      <View className="flex-row items-center gap-2" style={{ marginTop: mode === 'advance' ? 8 : 0 }}>
        <AccentIcon icon={IconClock} tone="info" size={14} tileSize={26} />
        <AppText variant="overline" className="text-muted-foreground">
          DELIVERY SLOT
        </AppText>
      </View>
      {slots.length === 0 ? (
        <AppText variant="bodySm" className="text-muted-foreground">
          No delivery slots available right now.
        </AppText>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            {slots.map((s) => (
              <Pressable
                key={s.start}
                onPress={() => onSelectSlot(s)}
                accessibilityRole="button"
                accessibilityState={{ selected: slot?.start === s.start }}
                className={`rounded-xl border px-3 py-2 ${slot?.start === s.start ? 'border-primary bg-primary' : 'border-border'}`}>
                <AppText variant="bodySm" className={slot?.start === s.start ? 'text-white' : 'text-foreground'}>
                  {s.start}–{s.end}
                </AppText>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
```

- [ ] **Step 3: Write `OnDemandCartFooter`**

Create `src/features/on-demand/components/OnDemandCartFooter.tsx`:

```tsx
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { IconCart } from '@/components/ui/icons';
import { palette } from '@/theme';

interface OnDemandCartFooterProps {
  itemCount: number;
  subTotal: number;
  onPress: () => void;
}

/** Sticky "N items · ₹total · View cart" bar — identical shape to
 * BulkCartFooter, own copy so each vertical's footer stays independently
 * editable. */
export function OnDemandCartFooter({ itemCount, subTotal, onPress }: OnDemandCartFooterProps) {
  const insets = useSafeAreaInsets();
  if (itemCount === 0) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="absolute inset-x-4 flex-row items-center justify-between rounded-2xl bg-primary px-5 py-4 active:opacity-90"
      style={{
        bottom: 16 + insets.bottom,
        shadowColor: palette.brand.green,
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      }}>
      <View className="flex-row items-center gap-2">
        <IconCart size={18} color="#fff" />
        <AppText variant="label" className="text-white">
          {itemCount} item{itemCount > 1 ? 's' : ''} · ₹{subTotal}
        </AppText>
      </View>
      <AppText variant="label" className="text-white">
        View cart →
      </AppText>
    </Pressable>
  );
}
```

- [ ] **Step 4: Verify**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors mentioning any of the three new component files.

- [ ] **Step 5: Commit**

```bash
git add src/features/on-demand/components/OnDemandItemCard.tsx src/features/on-demand/components/OnDemandSlotPicker.tsx src/features/on-demand/components/OnDemandCartFooter.tsx
git commit -m "feat: add on-demand item card, slot picker, cart footer components"
```

---

### Task 9: Feature barrel

**Files:**
- Create: `src/features/on-demand/index.ts`

- [ ] **Step 1: Write the barrel**

Create `src/features/on-demand/index.ts`:

```ts
export type {
  OnDemandMode,
  OnDemandKitchen,
  OnDemandMenuItem,
  OnDemandMenuGroup,
  OnDemandCartLine,
  DiscountOffer,
  ItemStatus,
} from './types';
export { loadNearestKitchens, loadKitchenProfile, loadKitchenMenu, loadOnDemandCoupons } from './api';
export {
  loadOrderingWindows,
  isOrderingWindowOpen,
  isAllDayUpcoming,
  allDaySlotsFor,
  advanceDates,
  advanceSlotsFor,
  formatShort,
  type OrderingWindow,
  type OrderingWindows,
  type TimeSlot,
} from './schedule';
export { groupMenuByMode, itemStatusFor, kitchenDiscountFor, offerBadgeText } from './pricing';
export {
  buildOnDemandBill,
  emptyOnDemandBill,
  DEFAULT_ONDEMAND_CHARGES,
  chargesFromOnDemandConfig,
  type OnDemandBill,
  type OnDemandBillCharges,
} from './bill';
export { useOnDemandCartStore, type OnDemandCart } from './useOnDemandCartStore';
export { OnDemandKitchenCard } from './components/OnDemandKitchenCard';
export { ModeToggle } from './components/ModeToggle';
export { VegFilterChips, type DietFilter } from './components/VegFilterChips';
export { OnDemandItemCard } from './components/OnDemandItemCard';
export { OnDemandSlotPicker } from './components/OnDemandSlotPicker';
export { OnDemandCartFooter } from './components/OnDemandCartFooter';
```

- [ ] **Step 2: Verify**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors mentioning `on-demand/index.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/features/on-demand/index.ts
git commit -m "feat: add on-demand feature barrel"
```

---

### Task 10: Kitchen list screen

**Files:**
- Create: `src/app/on-demand-kitchens.tsx`

- [ ] **Step 1: Write the screen**

Create `src/app/on-demand-kitchens.tsx`:

```tsx
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { IconMapPin, IconSearch } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { loadNearestKitchens, OnDemandKitchenCard, type OnDemandKitchen, type OnDemandMode } from '@/features/on-demand';
import { useClusterStore } from '@/store';
import { palette } from '@/theme';

const TITLE: Record<OnDemandMode, string> = { allDay: 'Daily Order', advance: 'Advance Order' };

export default function OnDemandKitchensScreen() {
  const router = useRouter();
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const mode: OnDemandMode = modeParam === 'advance' ? 'advance' : 'allDay';

  const serviceable = useClusterStore((s) => s.clusters.length > 0);
  const [kitchens, setKitchens] = useState<OnDemandKitchen[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadNearestKitchens(mode).then((res) => {
      if (active) {
        setKitchens(res);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [mode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return kitchens;
    return kitchens.filter((k) => k.kitchenName.toLowerCase().includes(q));
  }, [kitchens, search]);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: TITLE[mode] }} />
      <StatusBar style="auto" />

      <View className="px-4 pt-3">
        <View className="flex-row items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <IconSearch size={16} color={palette.neutral.gray500} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search kitchens"
            placeholderTextColor={palette.neutral.gray500}
            className="flex-1 text-foreground"
          />
        </View>
      </View>

      {loading ? (
        <View style={{ padding: 16, gap: 14 }}>
          {[0, 1].map((i) => (
            <View key={i} style={{ borderRadius: 18, overflow: 'hidden' }}>
              <Skeleton height={140} radius={0} />
              <View style={{ padding: 16, gap: 8 }}>
                <Skeleton width="55%" height={18} />
                <Skeleton width="35%" height={14} />
              </View>
            </View>
          ))}
        </View>
      ) : !serviceable ? (
        <EmptyState
          title="Set a delivery location"
          message="Choose your location to see kitchens open for on-demand orders near you."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? 'No matching kitchens' : 'No kitchens here yet'}
          message={search ? 'Try a different search term.' : 'On-demand ordering isn’t available in your area right now.'}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(k) => k._id}
          contentContainerStyle={{ padding: 16, gap: 14 }}
          renderItem={({ item }) => (
            <OnDemandKitchenCard
              kitchen={item}
              onPress={() =>
                router.push({
                  pathname: '/on-demand-kitchen',
                  params: { kitchenId: item._id, mode },
                } as Href)
              }
            />
          )}
        />
      )}
    </View>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View className="flex-1 items-center justify-center px-10">
      <AccentIcon icon={IconMapPin} tone="location" size={26} tileSize={56} />
      <AppText variant="title" className="text-center text-foreground" style={{ marginTop: 12 }}>
        {title}
      </AppText>
      <AppText variant="bodySm" className="mt-1 text-center text-muted-foreground">
        {message}
      </AppText>
    </View>
  );
}
```

- [ ] **Step 2: Verify**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors mentioning `on-demand-kitchens.tsx`.

- [ ] **Step 3: Manual on-device check**

Run the app, navigate to Home → tap the Daily shortcut. Expected: header title
"Daily Order", a search box, and either a loading skeleton, an empty state ("Set a
delivery location" if no address set, or "No kitchens here yet" if serviceable but
empty), or a scrollable list of kitchen cards. Typing in the search box filters the
list by name. Repeat via the Advance shortcut — header title should read "Advance
Order" and the `mode` param should be `advance` (verify via a temporary
`console.log(mode)` if needed, then remove it).

- [ ] **Step 4: Commit**

```bash
git add src/app/on-demand-kitchens.tsx
git commit -m "feat: add on-demand kitchen list screen"
```

---

### Task 11: Kitchen detail screen

**Files:**
- Create: `src/app/on-demand-kitchen.tsx`

- [ ] **Step 1: Write the screen**

Create `src/app/on-demand-kitchen.tsx`:

```tsx
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { SectionList, View } from 'react-native';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IconMapPin, IconStar, IconUtensils } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  groupMenuByMode,
  itemStatusFor,
  loadKitchenMenu,
  loadKitchenProfile,
  loadOrderingWindows,
  ModeToggle,
  OnDemandCartFooter,
  OnDemandItemCard,
  useOnDemandCartStore,
  VegFilterChips,
  type DietFilter,
  type OnDemandKitchen,
  type OnDemandMenuGroup,
  type OnDemandMenuItem,
  type OnDemandMode,
  type OrderingWindows,
} from '@/features/on-demand';
import { palette } from '@/theme';

export default function OnDemandKitchenScreen() {
  const router = useRouter();
  const { kitchenId, mode: modeParam } = useLocalSearchParams<{ kitchenId?: string; mode?: string }>();

  const cart = useOnDemandCartStore((s) => s.cart);
  const setCount = useOnDemandCartStore((s) => s.setCount);

  const [kitchen, setKitchen] = useState<OnDemandKitchen | null>(null);
  const [items, setItems] = useState<OnDemandMenuItem[]>([]);
  const [windows, setWindows] = useState<OrderingWindows | null>(null);
  const [mode, setMode] = useState<OnDemandMode>(modeParam === 'advance' ? 'advance' : 'allDay');
  const [dietFilter, setDietFilter] = useState<DietFilter>(null);
  const [loading, setLoading] = useState(true);
  const [pendingSwitch, setPendingSwitch] = useState<{ itemId: string; delta: number } | null>(null);

  useEffect(() => {
    if (!kitchenId) return;
    let active = true;
    setLoading(true);
    Promise.all([loadKitchenProfile(kitchenId), loadKitchenMenu(kitchenId), loadOrderingWindows()]).then(
      ([k, menuItems, w]) => {
        if (!active) return;
        setKitchen(k);
        setItems(menuItems);
        setWindows(w);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [kitchenId]);

  if (!kitchenId) {
    return <Redirect href={'/(tabs)' as Href} />;
  }

  const groups: OnDemandMenuGroup[] = useMemo(() => groupMenuByMode(items, mode), [items, mode]);

  const dietMatches = (item: OnDemandMenuItem): boolean => {
    if (!dietFilter) return true;
    return item.itemType === dietFilter;
  };

  const sections = groups
    .map((g) => ({ title: g.groupName, data: g.items.filter(dietMatches) }))
    .filter((s) => s.data.length > 0);

  const cartMatchesView = cart.kitchen?._id === kitchenId && cart.mode === mode;

  const countFor = (itemId: string): number =>
    cartMatchesView ? (cart.lines.find((l) => l.item._id === itemId)?.count ?? 0) : 0;

  const applyChange = (itemId: string, delta: number): void => {
    if (!kitchen) return;
    const item = items.find((i) => i._id === itemId);
    if (!item) return;
    setCount(item, kitchen, mode, Math.max(0, countFor(itemId) + delta));
  };

  const change = (itemId: string, delta: number): void => {
    const wouldClearCart = !cartMatchesView && cart.lines.length > 0 && delta > 0;
    if (wouldClearCart) {
      setPendingSwitch({ itemId, delta });
      return;
    }
    applyChange(itemId, delta);
  };

  const itemCount = cartMatchesView ? cart.lines.reduce((sum, l) => sum + l.count, 0) : 0;
  const subTotal = cartMatchesView ? cart.lines.reduce((sum, l) => sum + l.item.itemPrice * l.count, 0) : 0;

  const hasDailyMenu = groupMenuByMode(items, 'allDay').length > 0;
  const hasAdvanceMenu = groupMenuByMode(items, 'advance').length > 0;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: kitchen?.kitchenName ?? 'Kitchen' }} />
      <StatusBar style="auto" />

      {loading ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton width="60%" height={22} />
          <Skeleton width="40%" height={16} />
          {[0, 1, 2].map((i) => (
            <View key={i} className="flex-row gap-3 rounded-2xl border border-border bg-card p-3">
              <Skeleton width={64} height={64} radius={12} />
              <View style={{ flex: 1, gap: 8, paddingTop: 4 }}>
                <Skeleton width="60%" height={15} />
                <Skeleton width="35%" height={13} />
              </View>
            </View>
          ))}
        </View>
      ) : !kitchen ? (
        <View className="flex-1 items-center justify-center px-10">
          <AccentIcon icon={IconUtensils} tone="nonveg" size={26} tileSize={56} />
          <AppText variant="title" className="text-center text-foreground" style={{ marginTop: 12 }}>
            Kitchen not found
          </AppText>
          <View style={{ marginTop: 16 }}>
            <Button label="Go back" variant="outline" onPress={() => router.back()} />
          </View>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 12 }}
          ListHeaderComponent={
            <View style={{ gap: 12, marginBottom: 4 }}>
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  {kitchen.speciality ? (
                    <AppText variant="bodySm" className="text-muted-foreground" numberOfLines={1}>
                      {kitchen.speciality}
                    </AppText>
                  ) : null}
                  <View className="flex-row items-center gap-3">
                    {typeof kitchen.distance === 'number' ? (
                      <View className="flex-row items-center gap-1">
                        <IconMapPin size={13} color={palette.neutral.gray600} />
                        <AppText variant="caption" className="text-muted-foreground">
                          {kitchen.distance.toFixed(1)} Km
                        </AppText>
                      </View>
                    ) : null}
                    {kitchen.rating ? (
                      <View className="flex-row items-center gap-1">
                        <IconStar size={13} color={palette.accent.rating} fill={palette.accent.rating} />
                        <AppText variant="caption" className="text-muted-foreground">
                          {kitchen.rating.toFixed(1)}
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              <ModeToggle mode={mode} onChange={setMode} showDaily={hasDailyMenu} showAdvance={hasAdvanceMenu} />
              <VegFilterChips value={dietFilter} onChange={setDietFilter} />
            </View>
          }
          renderSectionHeader={({ section }) => (
            <AppText variant="label" className="bg-background text-foreground" style={{ paddingVertical: 6 }}>
              {section.title}
            </AppText>
          )}
          renderItem={({ item }) => (
            <View style={{ marginBottom: 12 }}>
              <OnDemandItemCard
                item={item}
                count={countFor(item._id)}
                status={windows ? itemStatusFor(item, mode, windows, countFor(item._id)) : 'available'}
                onIncrease={() => change(item._id, 1)}
                onDecrease={() => change(item._id, -1)}
              />
            </View>
          )}
          ListEmptyComponent={
            <View className="items-center px-8 py-14">
              <AccentIcon icon={IconUtensils} tone="food" size={26} tileSize={56} />
              <AppText variant="title" className="text-center text-foreground" style={{ marginTop: 12 }}>
                No items in this mode
              </AppText>
              <AppText variant="bodySm" className="mt-1 text-center text-muted-foreground">
                Try switching to {mode === 'allDay' ? 'Advance' : 'Daily'} instead.
              </AppText>
            </View>
          }
        />
      )}

      <OnDemandCartFooter itemCount={itemCount} subTotal={subTotal} onPress={() => router.push('/on-demand-cart' as Href)} />

      <ConfirmDialog
        visible={pendingSwitch !== null}
        title="Switch kitchen or mode?"
        message="Adding an item here will clear your current on-demand cart."
        confirmLabel="Switch"
        onConfirm={() => {
          if (pendingSwitch) applyChange(pendingSwitch.itemId, pendingSwitch.delta);
          setPendingSwitch(null);
        }}
        onCancel={() => setPendingSwitch(null)}
      />
    </View>
  );
}
```

- [ ] **Step 2: Verify**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors mentioning `on-demand-kitchen.tsx`.

- [ ] **Step 3: Manual on-device check**

From the kitchen list, tap a kitchen. Expected: header shows the kitchen name,
distance/rating row, a Daily/Advance toggle (only showing modes with eligible
items), a Veg/Non-veg/Jain filter row, and a grouped item list. Tapping "+" on an
item shows a quantity stepper and a sticky cart footer appears. Switching modes
re-filters the same list without a new network request (confirm no loading flash on
toggle). Tapping "+" on an item from a different kitchen after already having items
in the cart shows the "Switch kitchen or mode?" dialog.

- [ ] **Step 4: Commit**

```bash
git add src/app/on-demand-kitchen.tsx
git commit -m "feat: add on-demand kitchen detail screen"
```

---

### Task 12: Cart/checkout screen

**Files:**
- Create: `src/app/on-demand-cart.tsx`

- [ ] **Step 1: Write the screen**

Create `src/app/on-demand-cart.tsx`:

```tsx
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { IconChevronDown, IconChevronUp, IconCoins, IconUtensils, IconWallet, type IconProps } from '@/components/ui/icons';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { Toggle } from '@/components/ui/Toggle';
import {
  advanceDates,
  advanceSlotsFor,
  allDaySlotsFor,
  buildOnDemandBill,
  chargesFromOnDemandConfig,
  formatShort,
  kitchenDiscountFor,
  loadOnDemandCoupons,
  loadOrderingWindows,
  OnDemandSlotPicker,
  useOnDemandCartStore,
  type OnDemandBillCharges,
  type OrderingWindows,
  type TimeSlot,
} from '@/features/on-demand';
import { CouponSheet, SavingsBanner, CouponCelebration, discountFor } from '@/features/cart';
import { clusterApi } from '@/features/location/clusterApi';
import type { SubscriptionCoupon } from '@/features/subscription';
import { useClusterStore } from '@/store';
import { useBalances } from '@/features/wallet';
import { accentTint, palette, shadow, useColors } from '@/theme';

export default function OnDemandCartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const cart = useOnDemandCartStore((s) => s.cart);
  const setCount = useOnDemandCartStore((s) => s.setCount);
  const { wallet, cashback, refresh } = useBalances();

  const [windows, setWindows] = useState<OrderingWindows | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<TimeSlot | null>(null);
  const [useWallet, setUseWallet] = useState(false);
  const [useCashback, setUseCashback] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [charges, setCharges] = useState<OnDemandBillCharges | undefined>(undefined);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    loadOrderingWindows().then(setWindows);
  }, []);

  const applyCoupon = useOnDemandCartStore((s) => s.applyCoupon);
  const clearCoupon = useOnDemandCartStore((s) => s.clearCoupon);

  const [coupons, setCoupons] = useState<SubscriptionCoupon[]>([]);
  const [code, setCode] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponPulse, setCouponPulse] = useState(0);
  const [celebrated, setCelebrated] = useState({ code: '', saving: 0 });
  const couponSheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    if (!cart.mode) return;
    loadOnDemandCoupons(cart.mode).then(setCoupons).catch(() => setCoupons([]));
  }, [cart.mode]);

  const dateOptions = useMemo(() => advanceDates(), []);
  const slots = useMemo(() => {
    if (!windows || !cart.mode) return [];
    return cart.mode === 'advance' ? advanceSlotsFor(windows) : allDaySlotsFor(windows, cart.kitchen?.preparationTime ?? 0);
  }, [windows, cart.mode, cart.kitchen]);

  // Advance mode needs a date pinned before slots make sense; default to the
  // first offered date once it's known.
  useEffect(() => {
    if (cart.mode === 'advance' && !date && dateOptions.length) {
      setDate(dateOptions[0]);
    }
  }, [cart.mode, date, dateOptions]);

  useEffect(() => {
    const configName = useClusterStore.getState().currentConfigName();
    if (!configName) return;
    clusterApi
      .searchClusterVariable(configName)
      .then((cfg) => setCharges(chargesFromOnDemandConfig(cfg)))
      .catch(() => {
        // charges stays undefined — buildOnDemandBill's default param covers this
      });
  }, []);

  const walletBalance = Number.parseFloat(wallet) || 0;
  const cashbackBalance = cashback || 0;

  const kitchenDiscount = useMemo(
    () =>
      kitchenDiscountFor(
        cart.kitchen?.discountOffer,
        cart.lines.reduce((sum, l) => sum + l.item.itemPrice * l.count, 0),
      ),
    [cart.kitchen, cart.lines],
  );

  const bill = useMemo(
    () =>
      buildOnDemandBill(
        cart.lines,
        kitchenDiscount,
        charges,
        cart.coupon?.discount ?? 0,
        useCashback ? cashbackBalance : 0,
        useWallet ? walletBalance : 0,
      ),
    [cart.lines, kitchenDiscount, charges, cart.coupon, useCashback, useWallet, cashbackBalance, walletBalance],
  );

  const bestCoupon = useMemo(() => {
    let best: { coupon: SubscriptionCoupon; discount: number } | null = null;
    for (const c of coupons) {
      const { discount, reason } = discountFor(c, bill.subTotal);
      if (!reason && discount > (best?.discount ?? 0)) {
        best = { coupon: c, discount };
      }
    }
    return best;
  }, [coupons, bill.subTotal]);

  const celebrate = (couponCode: string, saving: number): void => {
    setCelebrated({ code: couponCode, saving });
    setCouponPulse((n) => n + 1);
  };

  const applyByCode = (): void => {
    const found = coupons.find((c) => (c.couponCode ?? '').toLowerCase() === code.trim().toLowerCase());
    if (!found) {
      setCouponError('Invalid or expired coupon');
      return;
    }
    const { discount, reason } = discountFor(found, bill.subTotal);
    if (reason) {
      setCouponError(reason);
      return;
    }
    setCouponError(null);
    const finalCode = found.couponCode ?? code;
    applyCoupon({ couponCode: finalCode, discount, couponHeader: found.couponHeader });
    celebrate(finalCode, discount);
  };

  const applyResolved = (c: SubscriptionCoupon, discount: number): void => {
    setCouponError(null);
    applyCoupon({ couponCode: c.couponCode ?? '', discount, couponHeader: c.couponHeader });
    couponSheetRef.current?.dismiss();
    celebrate(c.couponCode ?? '', discount);
  };

  const change = (itemId: string, delta: number): void => {
    const line = cart.lines.find((l) => l.item._id === itemId);
    if (!line || !cart.kitchen || !cart.mode) return;
    setCount(line.item, cart.kitchen, cart.mode, Math.max(0, line.count + delta));
  };

  if (cart.lines.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ headerShown: true, title: 'Cart' }} />
        <StatusBar style="auto" />
        <View className="flex-1 items-center justify-center px-10">
          <AppText variant="title" className="text-foreground">
            Your cart is empty
          </AppText>
          <View style={{ marginTop: 16 }}>
            <Button label="Browse kitchens" onPress={() => router.replace('/(tabs)')} />
          </View>
        </View>
      </View>
    );
  }

  const canCheckout = cart.mode === 'allDay' ? !!slot : !!date && !!slot;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Cart' }} />
      <StatusBar style="auto" />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24, gap: 14 }}>
        {bill.saving > 0 ? (
          <SavingsBanner
            saving={bill.saving}
            percent={bill.toPay + bill.saving > 0 ? Math.round((bill.saving / (bill.toPay + bill.saving)) * 100) : 0}
          />
        ) : null}

        {cart.kitchen ? (
          <AppText variant="label" className="text-foreground">
            {cart.kitchen.kitchenName}
          </AppText>
        ) : null}

        {cart.lines.map((line) => (
          <View key={line.item._id} style={shadow.card} className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3">
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: accentTint(palette.accent.food, 0.14),
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <IconUtensils size={20} color={palette.accent.food} />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center justify-between">
                <AppText variant="label" className="flex-1 text-foreground">
                  {line.item.itemName}
                </AppText>
                <QuantityStepper
                  count={line.count}
                  onIncrease={() => change(line.item._id, 1)}
                  onDecrease={() => change(line.item._id, -1)}
                  decreaseLabel={`Decrease ${line.item.itemName} quantity`}
                  increaseLabel={`Increase ${line.item.itemName} quantity`}
                />
              </View>
              <AppText variant="bodySm" className="mt-1 text-muted-foreground">
                ₹{line.item.itemPrice} · ₹{line.item.itemPrice * line.count}
              </AppText>
            </View>
          </View>
        ))}

        {cart.mode ? (
          <OnDemandSlotPicker
            mode={cart.mode}
            dateOptions={dateOptions}
            date={date}
            onSelectDate={setDate}
            slots={slots}
            slot={slot}
            onSelectSlot={setSlot}
          />
        ) : null}

        <View style={shadow.card} className="rounded-2xl border border-border bg-card p-4" >
          {coupons.length === 0 && !cart.coupon ? null : (
            <CouponRow
              appliedCoupon={cart.coupon}
              bestCoupon={bestCoupon}
              code={code}
              onCodeChange={(t) => {
                setCode(t.toUpperCase());
                setCouponError(null);
              }}
              couponError={couponError}
              onApplyByCode={applyByCode}
              onApplyBest={() => bestCoupon && applyResolved(bestCoupon.coupon, bestCoupon.discount)}
              onClear={clearCoupon}
              onOpenSheet={() => couponSheetRef.current?.present()}
            />
          )}
        </View>

        {walletBalance > 0 || cashbackBalance > 0 ? (
          <View className="rounded-2xl border border-border bg-card" style={[shadow.card, { overflow: 'hidden' }]}>
            {walletBalance > 0 ? (
              <RedeemRow
                icon={IconWallet}
                tone="reward"
                title="Use Mealawe Wallet"
                sub={useWallet && bill.moneyWalletUsed > 0 ? `Saving ₹${bill.moneyWalletUsed}` : `₹${wallet} available`}
                on={useWallet}
                onToggle={() => setUseWallet((v) => !v)}
                divider={cashbackBalance > 0}
              />
            ) : null}
            {cashbackBalance > 0 ? (
              <RedeemRow
                icon={IconCoins}
                tone="rating"
                title="Redeem Cashback"
                sub={useCashback && bill.cashbackUsed > 0 ? `Saving ₹${bill.cashbackUsed}` : `₹${cashbackBalance} available`}
                on={useCashback}
                onToggle={() => setUseCashback((v) => !v)}
              />
            ) : null}
          </View>
        ) : null}

        <View className="rounded-2xl border border-border bg-card p-4" style={shadow.card}>
          <Pressable
            onPress={() => setBillOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: billOpen }}
            className="flex-row items-center justify-between active:opacity-70">
            <View className="flex-row items-center gap-2">
              <AppText variant="title" className="text-foreground">
                Total Bill
              </AppText>
              {bill.saving > 0 ? (
                <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: accentTint(palette.accent.veg, 0.14) }}>
                  <AppText variant="caption" style={{ color: palette.accent.veg }}>
                    Saved ₹{bill.saving}
                  </AppText>
                </View>
              ) : null}
            </View>
            <View className="flex-row items-center gap-1.5">
              <AppText variant="title" className="text-foreground">
                ₹{bill.toPay}
              </AppText>
              {billOpen ? (
                <IconChevronUp size={18} color={palette.neutral.gray600} />
              ) : (
                <IconChevronDown size={18} color={palette.neutral.gray600} />
              )}
            </View>
          </Pressable>

          {billOpen ? (
            <View style={{ gap: 10, marginTop: 12 }}>
              <BillRow label="Items" amount={bill.subTotal} />
              {bill.kitchenDiscount > 0 ? <BillRow label="Kitchen discount" amount={-bill.kitchenDiscount} positive /> : null}
              {bill.discount > 0 ? <BillRow label="Coupon discount" amount={-bill.discount} positive /> : null}
              <BillRow label="Delivery" amount={bill.delivery} />
              <BillRow label="Packaging" amount={bill.packaging} />
              <BillRow label="Platform fee" amount={bill.platform} />
              <BillRow label="Taxes" amount={bill.taxes} />
              {bill.moneyWalletUsed > 0 ? <BillRow label="Mealawe Wallet" amount={-bill.moneyWalletUsed} positive /> : null}
              {bill.cashbackUsed > 0 ? <BillRow label="Cashback" amount={-bill.cashbackUsed} positive /> : null}
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />
              <View className="flex-row items-center justify-between">
                <AppText variant="label" className="text-foreground">
                  To pay
                </AppText>
                <AppText variant="label" className="text-foreground">
                  ₹{bill.toPay}
                </AppText>
              </View>
            </View>
          ) : (
            <AppText variant="caption" className="text-muted-foreground" style={{ marginTop: 6 }}>
              Incl. all taxes and charges · tap to view breakdown
            </AppText>
          )}
        </View>
      </ScrollView>

      <View
        className="flex-row items-center justify-between border-t border-border bg-card px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}>
        <View>
          <AppText variant="h3" className="text-foreground">
            ₹{bill.toPay}
          </AppText>
          {!canCheckout ? (
            <AppText variant="caption" className="text-danger">
              Pick a delivery slot{cart.mode === 'advance' ? ' and date' : ''}
            </AppText>
          ) : null}
        </View>
        <Button
          label="Proceed to Pay →"
          size="lg"
          disabled={!canCheckout}
          onPress={() => Alert.alert('Payment', 'Payment (JusPay / Paytm) is the next phase — cart is ready.')}
        />
      </View>

      <CouponSheet ref={couponSheetRef} coupons={coupons} subTotal={bill.subTotal} onApply={applyResolved} onClose={() => {}} />
      <CouponCelebration trigger={couponPulse} code={celebrated.code} saving={celebrated.saving} />
    </View>
  );
}

function CouponRow({
  appliedCoupon,
  bestCoupon,
  code,
  onCodeChange,
  couponError,
  onApplyByCode,
  onApplyBest,
  onClear,
  onOpenSheet,
}: {
  appliedCoupon: { couponCode: string; discount: number } | null;
  bestCoupon: { coupon: SubscriptionCoupon; discount: number } | null;
  code: string;
  onCodeChange: (t: string) => void;
  couponError: string | null;
  onApplyByCode: () => void;
  onApplyBest: () => void;
  onClear: () => void;
  onOpenSheet: () => void;
}) {
  // Thin wrapper kept in this file (not a shared component) since it's a
  // one-call-site adaptation of BulkCouponCard's layout for on-demand's coupon
  // shape — see BulkCouponCard for the canonical version if a 3rd cart needs it.
  return (
    <View style={{ gap: 12 }}>
      {appliedCoupon ? (
        <View className="flex-row items-center gap-3">
          <AccentIcon icon={IconCoins} tone="reward" size={18} tileSize={36} />
          <View className="flex-1">
            <AppText variant="label" className="text-foreground">
              {appliedCoupon.couponCode} applied
            </AppText>
            <AppText variant="caption" style={{ color: palette.accent.veg }}>
              You saved ₹{appliedCoupon.discount}
            </AppText>
          </View>
          <Pressable onPress={onClear} accessibilityRole="button" className="active:opacity-70">
            <AppText variant="label" className="text-danger">
              Remove
            </AppText>
          </Pressable>
        </View>
      ) : (
        <>
          {bestCoupon ? (
            <View
              className="flex-row items-center gap-3 rounded-xl px-3 py-2.5"
              style={{ backgroundColor: accentTint(palette.accent.reward, 0.1) }}>
              <View className="flex-1">
                <AppText variant="label" className="text-foreground">
                  {bestCoupon.coupon.couponCode}
                </AppText>
                <AppText variant="caption" style={{ color: palette.accent.veg }}>
                  Save ₹{bestCoupon.discount} on this order
                </AppText>
              </View>
              <Button label="Apply" size="sm" onPress={onApplyBest} />
            </View>
          ) : null}
          <View className="flex-row items-center gap-2">
            <Pressable onPress={onOpenSheet} accessibilityRole="button" className="flex-1 active:opacity-70">
              <AppText variant="label" style={{ color: palette.accent.reward }}>
                View all coupons
              </AppText>
            </Pressable>
            <Button label="Apply" variant="outline" size="sm" onPress={onApplyByCode} disabled={!code.trim()} />
          </View>
        </>
      )}
      {couponError ? (
        <AppText variant="caption" className="text-danger">
          {couponError}
        </AppText>
      ) : null}
    </View>
  );
}

function RedeemRow({
  icon,
  tone,
  title,
  sub,
  on,
  onToggle,
  divider,
}: {
  icon: ComponentType<IconProps>;
  tone: 'reward' | 'rating';
  title: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
  divider?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onToggle}
      className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-80"
      style={divider ? { borderBottomWidth: 1, borderBottomColor: colors.border } : undefined}>
      <AccentIcon icon={icon} tone={tone} size={18} tileSize={38} />
      <View className="flex-1">
        <AppText variant="label" className="text-foreground">
          {title}
        </AppText>
        <AppText variant="caption" style={{ color: on ? palette.accent.veg : colors.mutedForeground }}>
          {sub}
        </AppText>
      </View>
      <Toggle value={on} onChange={onToggle} accessibilityLabel={title} />
    </Pressable>
  );
}

function BillRow({ label, amount, positive }: { label: string; amount: number; positive?: boolean }) {
  return (
    <View className="flex-row items-center justify-between">
      <AppText variant="body" className="text-muted-foreground">
        {label}
      </AppText>
      <AppText variant="body" className={positive ? undefined : 'text-foreground'} style={positive ? { color: palette.accent.veg } : undefined}>
        {amount < 0 ? '- ' : ''}₹{Math.abs(amount)}
      </AppText>
    </View>
  );
}
```

- [ ] **Step 2: Verify**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors mentioning `on-demand-cart.tsx`.

- [ ] **Step 3: Manual on-device check**

From the kitchen detail screen with items in the cart, tap the cart footer.
Expected: line items with steppers, a slot picker (date chips only in Advance mode,
slot chips in both), a coupon row (best-coupon nudge or manual code entry), wallet/
cashback toggles if balances > 0, a collapsible bill breakdown showing kitchen
discount when the kitchen has an active offer, and "Proceed to Pay →" disabled until
a slot (+ date, for Advance) is picked. Tapping "Proceed to Pay →" once enabled shows
the same payment-deferred alert as Subscription/Bulk.

- [ ] **Step 4: Commit**

```bash
git add src/app/on-demand-cart.tsx
git commit -m "feat: add on-demand cart/checkout screen"
```

---

### Task 13: Wire the home shortcuts row, remove placeholders

**Files:**
- Modify: `src/app/(tabs)/index.tsx`
- Delete: `src/app/daily-order.tsx`
- Delete: `src/app/advance-order.tsx`

- [ ] **Step 1: Update `SHORTCUT_ROUTES`**

In `src/app/(tabs)/index.tsx`, change the `daily`/`advance` targets from the
placeholder routes to the new kitchen list screen, parametrized by mode:

```ts
/** Shortcut tabs that have no in-home feed of their own — selecting one
 * navigates straight to its (placeholder or real) screen instead of
 * swapping the feed body, mirroring how the old More hub's tiles behaved. */
const SHORTCUT_ROUTES: Partial<Record<string, string>> = {
  daily: '/on-demand-kitchens?mode=allDay',
  advance: '/on-demand-kitchens?mode=advance',
  navmool: '/marketplace',
};
```

- [ ] **Step 2: Delete the placeholder routes**

```bash
git rm src/app/daily-order.tsx src/app/advance-order.tsx
```

- [ ] **Step 3: Verify**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors mentioning `(tabs)/index.tsx`. Confirm no other file still
imports `daily-order` / `advance-order` (both were self-contained route files with
no importers per Task-context research, so this should be a clean removal):

```bash
grep -rn "daily-order\|advance-order" src/ || echo "no references found"
```

Expected output: `no references found`.

- [ ] **Step 4: Manual on-device check**

From Home, tap the Daily shortcut — should land on the on-demand kitchen list with
title "Daily Order". Tap the Advance shortcut — should land on the same list screen
with title "Advance Order". Both should no longer show the "coming soon" placeholder.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire home shortcuts to the on-demand kitchen list, remove placeholders"
```

---

### Task 14: Full build verification

**Files:** none (verification-only task)

- [ ] **Step 1: Full type-check**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: zero errors across the whole project.

- [ ] **Step 2: Export check**

Run: `npx expo export --platform android -c`
Expected: exports successfully with no bundling errors.

- [ ] **Step 3: Manual regression pass on other verticals**

On-device, confirm Subscription, Bulk, Dine In, and Navmool shortcuts still behave
exactly as before — this plan only added new files/routes and edited
`SHORTCUT_ROUTES` + `store/index.ts` + `constants.ts` (additive changes), so nothing
else should have changed. Specifically check `initStores()` still boots cleanly (no
crash from the new `useOnDemandCartStore.getState().hydrate()` call on a fresh
install with no persisted on-demand cart).

- [ ] **Step 4: End-to-end manual walkthrough**

Home → Daily shortcut → kitchen list → open a kitchen → toggle to Advance → apply a
veg filter → add 2 different items → open cart → pick a date (Advance) + slot →
apply a coupon (or the best-coupon nudge) → toggle wallet/cashback if available →
expand the bill breakdown and confirm the math (subtotal − kitchen discount − coupon
discount + delivery + packaging + platform + taxes − wallet − cashback = to pay) →
tap Proceed to Pay → confirm the payment-deferred alert. Repeat once more starting
from the Daily shortcut directly (skip the Advance toggle) to confirm the Daily-only
path (today's slots, no date picker) works standalone.

- [ ] **Step 5: Commit (only if any fixes were needed in this task)**

```bash
git add -A
git commit -m "fix: address issues found in full build verification"
```

(Skip this step entirely if nothing needed fixing.)

---

### Task 15: Author the Maestro flow and test-catalogue rows

**Files:**
- Create: `.maestro/flows/on-demand-kitchen-to-cart.yaml`
- Modify: `scripts/generate-test-catalogue.mjs`
- Modify: `.maestro/README.md`
- Modify: `docs/TESTING-WORKFLOW.md`

- [ ] **Step 1: Write the Maestro flow**

Create `.maestro/flows/on-demand-kitchen-to-cart.yaml`, following this repo's
existing flow conventions (no `testID`, select by visible text, `# MANUAL` header
comment since it's past login):

```yaml
appId: com.mealawe.app
---
# MANUAL: requires an authenticated session (see login-otp-flow.yaml) and a
# delivery address resolving to a cluster with showDaily=true, with at least
# one on-demand kitchen serviceable there.
- assertVisible: "Choose your plan"
- tapOn: "Daily"
- tapOn: "View menu"
- assertVisible: "Daily"
- tapOn:
    text: "\\+"
    index: 0
- assertVisible: "item"
- back
- assertVisible: "Choose your plan"
```

- [ ] **Step 2: Add the catalogue rows**

In `scripts/generate-test-catalogue.mjs`, add a new `OnDemand` sheet to
`FEATURE_SHEETS` (after the `Home` sheet's closing bracket, before `Subscription:`):

```js
  OnDemand: [
    ['OD-01', 'On Demand', 'Kitchen list shows loading/empty/populated states', 'Daily shortcut tapped', 'Observe kitchen list screen', 'Skeleton while loading; "Set a delivery location" if no address; "No kitchens here yet" if empty; otherwise a scrollable list of kitchen cards', 'P0'],
    ['OD-02', 'On Demand', 'Kitchen search filters the list client-side', 'Kitchen list populated', 'Type a partial kitchen name in the search box', 'List narrows to matching kitchens only, no network call', 'P1'],
    ['OD-03', 'On Demand', 'Mode toggle re-filters the same menu without refetching', 'On a kitchen detail screen with both Daily and Advance items', 'Tap the Advance capsule, then Daily again', 'Item list changes immediately with no loading flash', 'P0'],
    ['OD-04', 'On Demand', 'Veg/Non-veg/Jain filter narrows the item list', 'Kitchen detail screen open', 'Tap "Veg"', 'Only veg items remain visible; tapping "Veg" again clears the filter', 'P1'],
    ['OD-05', 'On Demand', 'Missed/Coming next/Not available badges replace the stepper', 'Outside the Daily ordering window (or an Advance-only item viewed in Daily mode)', 'View an ineligible item', 'A tinted status badge shows instead of a quantity stepper; item cannot be added', 'P0'],
    ['OD-06', 'On Demand', 'Adding from a different kitchen prompts a clear-cart confirm', 'Cart already has items from kitchen A', 'Open kitchen B and tap "+" on an item', '"Switch kitchen or mode?" dialog appears; confirming clears kitchen A’s lines and adds kitchen B’s item', 'P0'],
    ['OD-07', 'On Demand', 'Advance mode requires both date and slot before checkout', 'On-demand cart has items, mode is Advance', 'Leave date or slot unselected', '"Proceed to Pay →" stays disabled with a "Pick a delivery slot and date" caption', 'P0'],
    ['OD-08', 'On Demand', 'Daily mode requires only a slot (no date picker shown)', 'On-demand cart has items, mode is Daily', 'View the slot picker', 'No date chip row rendered; only slot chips for today', 'P1'],
    ['OD-09', 'On Demand', 'Kitchen discount offer applies before coupon/wallet/cashback', 'Kitchen has an active discountOffer, cart has items', 'Open the bill breakdown', '"Kitchen discount" row appears above coupon/wallet/cashback rows, correctly capped by maxLimit (percentage) or the subtotal (flat)', 'P1'],
    ['OD-10', 'On Demand', 'Proceed to Pay shows the same payment-deferred alert as other carts', 'Date/slot selected, cart has items', 'Tap "Proceed to Pay →"', 'Alert: "Payment (JusPay / Paytm) is the next phase — cart is ready."', 'P0'],
  ],
```

Add one row to `FULL_FLOW` (append after the last existing entry):

```js
  ['E2E-41', 'On Demand', 'Daily shortcut → kitchen → add items → cart ready for checkout', 'Authenticated session, serviceable cluster with showDaily=true and ≥1 on-demand kitchen', 'Home → tap "Daily" → open a kitchen → add 2 items → open cart → pick a slot', '"Proceed to Pay →" enabled; tapping it shows the payment-deferred alert', 'P0', 'on-demand-kitchen-to-cart.yaml (manual)'],
```

- [ ] **Step 3: Regenerate the workbook**

Run:
```bash
npm install --no-save exceljs
node scripts/generate-test-catalogue.mjs
```
Expected output: `Wrote .../docs/TEST-CATALOGUE.xlsx (<N> cases across <M> sheets)`
with no errors, where `<N>` is 11 higher than before this task (10 `OD-xx` rows + 1
`E2E-41` row) and `<M>` is one sheet higher (the new `OnDemand` sheet).

- [ ] **Step 4: Update the Maestro flow index**

In `.maestro/README.md`, add a row to the "Flow index" table (after the last existing
row):

```markdown
| `on-demand-kitchen-to-cart.yaml` | Daily/Advance kitchen → items → cart ready | **Manual** |
```

- [ ] **Step 5: Update the placeholder-features note**

In `docs/TESTING-WORKFLOW.md`, remove the now-inaccurate mention of
`daily-order.tsx`/`advance-order.tsx` being bare placeholders (added in the earlier
home-shortcuts-row work) and note the on-demand feature folder is real:

Change:
```markdown
(`marketplace` has a home shortcuts-row entry point as of the Navmool-shortcut
work — see the `Home` sheet's HOME-05..07 — but its own feature folder is still
a placeholder until the browse/catalog sub-project lands. `daily-order.tsx` and
`advance-order.tsx` are bare "coming soon" screens behind the `showDaily`/
`showAdvance` cluster flags — see HOME-08 — with no feature folder yet.)
```
to:
```markdown
(`marketplace` has a home shortcuts-row entry point as of the Navmool-shortcut
work — see the `Home` sheet's HOME-05..07 — but its own feature folder is still
a placeholder until the browse/catalog sub-project lands. The Daily/Advance
shortcuts now open a real `on-demand` vertical — see the `OnDemand` sheet — not
a placeholder.)
```

- [ ] **Step 6: Commit**

```bash
git add .maestro/flows/on-demand-kitchen-to-cart.yaml scripts/generate-test-catalogue.mjs .maestro/README.md docs/TESTING-WORKFLOW.md docs/TEST-CATALOGUE.xlsx
git commit -m "test: add Maestro flow and catalogue rows for on-demand ordering"
```

---

## Post-plan state

After this plan: the home shortcuts row's Daily and Advance tiles open a real,
cluster-flag-gated on-demand kitchen-ordering vertical — kitchen list, kitchen
detail with a mode toggle and diet filter, grouped item menu with status badges, a
single-kitchen/single-mode cart, and a checkout screen with slot picking, coupon
support, wallet/cashback redemption, and the same payment-deferred placeholder every
other cart in this app currently ships with. Server-side, no schema changes were
needed — every cluster-config field this vertical reads (`onDemandDeliveryCharges`,
`onDemandPlatformCharges`, etc.) already existed on `ClusterConfigVariable`.
Real payment integration (JusPay/Paytm) remains a separate, later effort shared
across all four order-type verticals (Subscription/Bulk/Dine-in/On-demand).

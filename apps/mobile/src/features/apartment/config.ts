import { getConfigVariables } from '@/services/http';

import type { OrderType } from './types';

/**
 * Server-configured Apartment values (`appConfigVariable` rows), Ops-
 * overridable without a release. These only drive DISPLAY — enforcement
 * always happens server-side regardless of what this returns.
 */
export interface ApartmentConfig {
  /** Minutes before a Today slot starts that it stops being orderable. Default 180 (3h). */
  todayCutoffMinutes: number;
  /** Minutes of lead time Advance orders need before the slot start. Default 720 (12h). */
  advanceCutoffMinutes: number;
  /** Wall-clock hour (0-23, server-local) after which a T+1 Advance order is no longer
   * accepted, checked independently of `advanceCutoffMinutes`. Default 22 (10 PM). */
  advanceNextDayCutoffHour: number;
  /** Seconds a kitchen has to accept before Today/Instant auto-transfers. Default 120. */
  acceptanceWindowSeconds: number;
  /** Platform default delivery charge per order type, used when a kitchen hasn't set
   * its own override. Default 30 each. */
  defaultDeliveryChargeByOrderType: Record<OrderType, number>;
  /** Layered GST/platform-charge config: each bucket gets its own % applied to its own
   * amount. All default to 0 rather than guessing a nonzero rate if unset. */
  itemGstPercent: number;
  deliveryGstPercent: number;
  platformCharges: number;
  platformGstPercent: number;
  /** Flat packaging charge + its GST, separate line item from platformCharges. Applies
   * to every order type. */
  packagingCharges: number;
  packagingGstPercent: number;
}

const DEFAULT_CONFIG: ApartmentConfig = {
  todayCutoffMinutes: 180,
  advanceCutoffMinutes: 720,
  advanceNextDayCutoffHour: 22,
  acceptanceWindowSeconds: 120,
  defaultDeliveryChargeByOrderType: { instant: 30, today: 30, advance: 30 },
  itemGstPercent: 0,
  deliveryGstPercent: 0,
  platformCharges: 0,
  platformGstPercent: 0,
  packagingCharges: 0,
  packagingGstPercent: 0,
};

/**
 * Delegates to `getConfigVariables()`, which caches for the rest of the app session and
 * never expires a value automatically — a failed fetch just rejects rather than caching
 * `DEFAULT_CONFIG` as if it were real, so admin changes are picked up on next app open.
 */
export async function loadApartmentConfig(): Promise<ApartmentConfig> {
  const map = await getConfigVariables(
    [
      'APARTMENT_TODAY_CUTOFF_MINUTES',
      'APARTMENT_ADVANCE_CUTOFF_MINUTES',
      'APARTMENT_ADVANCE_NEXT_DAY_CUTOFF_HOUR',
      'APARTMENT_ACCEPTANCE_WINDOW_SECONDS',
      'APARTMENT_DELIVERY_INSTANT_CHARGE',
      'APARTMENT_DELIVERY_TODAYS_CHARGE',
      'APARTMENT_DELIVERY_ADVANCE_CHARGE',
      'ORDER_GST',
      'APARTMENT_DELIVERY_GST_CHARGE',
      'APARTMENT_PLATFORM_GST_CHARGES',
      'APARTMENT_PLATFORM_CHARGES',
      'APARTMENT_PACKAGING_CHARGES',
      'APARTMENT_PACKAGING_GST_CHARGES',
    ],
    'APARTMENT',
  ).catch(() => ({}) as Record<string, unknown>);
  const num = (key: string, fallback: number): number => {
    const v = map[key];
    const n = Number(v);
    return typeof v !== 'undefined' && Number.isFinite(n) && n > 0 ? n : fallback;
  };
  // Hour can validly be 0 (midnight), which `num`'s `n > 0` guard would wrongly reject.
  const hourOf = (key: string, fallback: number): number => {
    const v = map[key];
    const n = Number(v);
    return typeof v !== 'undefined' && Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
  };
  return {
    todayCutoffMinutes: num('APARTMENT_TODAY_CUTOFF_MINUTES', DEFAULT_CONFIG.todayCutoffMinutes),
    advanceCutoffMinutes: num('APARTMENT_ADVANCE_CUTOFF_MINUTES', DEFAULT_CONFIG.advanceCutoffMinutes),
    advanceNextDayCutoffHour: hourOf('APARTMENT_ADVANCE_NEXT_DAY_CUTOFF_HOUR', DEFAULT_CONFIG.advanceNextDayCutoffHour),
    acceptanceWindowSeconds: num('APARTMENT_ACCEPTANCE_WINDOW_SECONDS', DEFAULT_CONFIG.acceptanceWindowSeconds),
    defaultDeliveryChargeByOrderType: {
      instant: num('APARTMENT_DELIVERY_INSTANT_CHARGE', DEFAULT_CONFIG.defaultDeliveryChargeByOrderType.instant),
      today: num('APARTMENT_DELIVERY_TODAYS_CHARGE', DEFAULT_CONFIG.defaultDeliveryChargeByOrderType.today),
      advance: num('APARTMENT_DELIVERY_ADVANCE_CHARGE', DEFAULT_CONFIG.defaultDeliveryChargeByOrderType.advance),
    },
    itemGstPercent: num('ORDER_GST', DEFAULT_CONFIG.itemGstPercent),
    deliveryGstPercent: num('APARTMENT_DELIVERY_GST_CHARGE', DEFAULT_CONFIG.deliveryGstPercent),
    platformCharges: num('APARTMENT_PLATFORM_CHARGES', DEFAULT_CONFIG.platformCharges),
    platformGstPercent: num('APARTMENT_PLATFORM_GST_CHARGES', DEFAULT_CONFIG.platformGstPercent),
    packagingCharges: num('APARTMENT_PACKAGING_CHARGES', DEFAULT_CONFIG.packagingCharges),
    packagingGstPercent: num('APARTMENT_PACKAGING_GST_CHARGES', DEFAULT_CONFIG.packagingGstPercent),
  };
}

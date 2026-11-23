import { decode } from '@mapbox/polyline';

import { ENDPOINTS, http } from '@mealawe/core';

import { normalizeLatLng } from './geo';
import type { DirectionsResult, LatLng } from './types';

/** The per-day FoodOrder doc — the only place `runner`/`deliveryTaskId`/`deliveryVendor` actually live. */
export async function fetchFoodOrder(foodOrderId: string): Promise<Record<string, unknown> | null> {
  try {
    return await http.get<Record<string, unknown>>(`${ENDPOINTS.orders.getFoodOrder}/${foodOrderId}`);
  } catch {
    return null;
  }
}

export interface RunnerContact {
  location: LatLng | null;
  riderPhone: string | null;
  riderName: string | null;
}

/** Live rider location + profile for a self-delivery order, sourced from
 * `RiderShift`/`RiderLocationPing`/`DeliveryPartner` via the order's own
 * `FoodOrder.shiftId` — see the `getShiftLocation` endpoint doc. Null while
 * the order has no shift yet (not picked up) or the shift can't be found. */
export async function fetchShiftLocation(shiftId: string): Promise<RunnerContact | null> {
  try {
    const raw = await http.get<Record<string, unknown>>(`${ENDPOINTS.orders.getShiftLocation}/${shiftId}`);
    if (!raw) return null;
    const rider = (raw.rider as Record<string, unknown>) ?? {};
    return {
      location: normalizeLatLng(raw.currentLocation),
      riderPhone: typeof rider.phoneNo === 'string' ? rider.phoneNo : null,
      riderName: typeof rider.name === 'string' ? rider.name : null,
    };
  } catch {
    return null;
  }
}

/**
 * Runner's current location + contact for an order. Priority order mirrors
 * which delivery path actually owns fresh data for that order: a 3rd-party
 * vendor task (Porter/Shadowfax/Pidge) first, then a Mealawe self-delivery
 * shift (`RiderShift`/`RiderLocationPing` — richer and fresher than the
 * order doc's own thin, order-specific `runner.location` shadow copy), then
 * the order doc itself as a last resort (e.g. before a shift exists yet).
 */
export async function fetchRunnerLocation(
  orderId: string,
  shiftId?: string | null,
  deliveryTaskId?: string | null,
  deliveryVendor?: string | null,
): Promise<RunnerContact> {
  try {
    // Both the task id and its vendor are needed to hit trackDeliveryTask's
    // two-required-param route; missing either falls through.
    if (deliveryTaskId && deliveryVendor) {
      const status = await http.get<Record<string, unknown>>(
        `${ENDPOINTS.orders.trackDeliveryTask}/${deliveryTaskId}/${deliveryVendor}`,
      );
      const runner = status?.runner as Record<string, unknown> | undefined;
      return {
        location: normalizeLatLng(runner?.location),
        riderPhone: typeof runner?.phone_number === 'string' ? (runner.phone_number as string) : null,
        riderName: typeof runner?.name === 'string' ? (runner.name as string) : null,
      };
    }
    if (shiftId) {
      const shift = await fetchShiftLocation(shiftId);
      if (shift) return shift;
    }
    const order = await fetchFoodOrder(orderId);
    const runner = order?.runner as Record<string, unknown> | undefined;
    return {
      location: normalizeLatLng(runner?.location),
      riderPhone: typeof runner?.phone_number === 'string' ? (runner.phone_number as string) : null,
      riderName: typeof runner?.name === 'string' ? (runner.name as string) : null,
    };
  } catch {
    return { location: null, riderPhone: null, riderName: null };
  }
}

/** Route + ETA between the runner and the delivery address, via the backend's Directions proxy. */
export async function fetchDirections(
  origin: LatLng,
  destination: LatLng,
): Promise<DirectionsResult | null> {
  try {
    const raw = await http.get<{
      polyline: string;
      distanceMeters: number;
      durationSeconds: number;
      durationInTrafficSeconds: number;
      etaText: string;
    } | null>(
      `${ENDPOINTS.orders.getDirections}/${origin.lat}/${origin.lng}/${destination.lat}/${destination.lng}`,
    );
    if (!raw?.polyline) return null;
    return {
      polylinePoints: decode(raw.polyline).map(([lat, lng]) => ({ lat, lng })),
      distanceMeters: raw.distanceMeters,
      durationSeconds: raw.durationInTrafficSeconds ?? raw.durationSeconds,
      etaText: raw.etaText,
    };
  } catch {
    return null;
  }
}

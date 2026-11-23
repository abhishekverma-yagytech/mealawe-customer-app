import { create } from 'zustand';

import { fetchDirections, fetchRunnerLocation } from '@mealawe/api';
import { snapToRoute } from '@mealawe/api';
import type { LatLng, TrackingParams } from '@mealawe/api';

/** Runner position: cheap, frequent — the marker should glide, not jump every 30s+. */
const LOCATION_POLL_MS = 7000;
/** Route + ETA: expensive (Directions API), refreshed on a slower cadence. */
const DIRECTIONS_POLL_MS = 30000;

interface TrackingState {
  destination: LatLng | null;
  runnerLocation: LatLng | null;
  /** Rider contact for this order — sourced from whichever path
   * `fetchRunnerLocation` resolved (shift or 3rd-party vendor task). Null
   * until the first successful poll returns one. */
  riderPhone: string | null;
  riderName: string | null;
  routePath: LatLng[];
  etaText: string | null;
  etaSeconds: number | null;
  distanceMeters: number | null;
  status: 'idle' | 'loading' | 'active' | 'error';
  start: (params: TrackingParams) => void;
  /**
   * Stops polling — but only if `orderId` is still the active order. A screen
   * that got superseded by a newer `start()` (e.g. a stacked duplicate route,
   * or a fast remount) must not be able to kill the current screen's timers
   * when its own cleanup runs.
   */
  stop: (orderId: string) => void;
}

let locationTimer: ReturnType<typeof setInterval> | null = null;
let directionsTimer: ReturnType<typeof setInterval> | null = null;
let activeOrderId: string | null = null;

function clearTimers(): void {
  if (locationTimer) clearInterval(locationTimer);
  if (directionsTimer) clearInterval(directionsTimer);
  locationTimer = null;
  directionsTimer = null;
}

export const useTrackingStore = create<TrackingState>((set, get) => ({
  destination: null,
  runnerLocation: null,
  riderPhone: null,
  riderName: null,
  routePath: [],
  etaText: null,
  etaSeconds: null,
  distanceMeters: null,
  status: 'idle',

  start: (params) => {
    clearTimers();
    activeOrderId = params.orderId;
    set({
      destination: params.destination,
      runnerLocation: params.initialRunnerLocation ?? null,
      riderPhone: null,
      riderName: null,
      routePath: [],
      etaText: null,
      etaSeconds: null,
      distanceMeters: null,
      status: 'loading',
    });

    const pollLocation = async () => {
      const result = await fetchRunnerLocation(
        params.orderId,
        params.shiftId,
        params.deliveryTaskId,
        params.deliveryVendor,
      );
      if (activeOrderId !== params.orderId) return;
      const current = get();
      if (current.riderPhone !== result.riderPhone || current.riderName !== result.riderName) {
        set({ riderPhone: result.riderPhone, riderName: result.riderName });
      }
      if (!result.location) return;
      const { routePath } = get();
      const snapped = routePath.length >= 2 ? snapToRoute(result.location, routePath) : result.location;
      set({ runnerLocation: snapped, status: 'active' });
    };

    const pollDirections = async () => {
      const { runnerLocation } = get();
      if (!runnerLocation || activeOrderId !== params.orderId) return;
      const directions = await fetchDirections(runnerLocation, params.destination);
      if (!directions || activeOrderId !== params.orderId) return;
      set({
        routePath: directions.polylinePoints,
        etaText: directions.etaText,
        etaSeconds: directions.durationSeconds,
        distanceMeters: directions.distanceMeters,
      });
    };

    void (async () => {
      await pollLocation();
      await pollDirections();
    })();
    locationTimer = setInterval(pollLocation, LOCATION_POLL_MS);
    directionsTimer = setInterval(pollDirections, DIRECTIONS_POLL_MS);
  },

  stop: (orderId) => {
    if (orderId !== activeOrderId) return;
    activeOrderId = null;
    clearTimers();
    set({ status: 'idle' });
  },
}));

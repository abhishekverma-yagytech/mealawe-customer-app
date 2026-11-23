import { create } from 'zustand';

import type { TrackingParams } from '@mealawe/api';

interface TrackingTarget {
  params: TrackingParams;
  runnerName: string | null;
  runnerPhone: string | null;
}

interface TrackingTargetState {
  target: TrackingTarget | null;
  setTarget: (target: TrackingTarget) => void;
  clear: () => void;
}

/**
 * Hands the resolved tracking target (a specific day's FoodOrder — the
 * subscription parent doc itself never carries runner/deliveryTaskId) from
 * order-detail to the tracking screen, mirroring `useOrderStore`'s
 * select-without-route-params pattern.
 */
export const useTrackingTargetStore = create<TrackingTargetState>((set) => ({
  target: null,
  setTarget: (target) => set({ target }),
  clear: () => set({ target: null }),
}));

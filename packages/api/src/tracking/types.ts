export interface LatLng {
  lat: number;
  lng: number;
}

/** Params handed to the tracking screen (mirrors the Ionic map-route-display inputs). */
export interface TrackingParams {
  orderId: string;
  /** The order's own `FoodOrder.shiftId` — present once a Mealawe rider has picked it up.
   * When set (and no `deliveryTaskId`/`deliveryVendor`), location + rider contact are sourced
   * from `RiderShift`/`RiderLocationPing` via `fetchShiftLocation`, not `runner.location`. */
  shiftId?: string | null;
  deliveryTaskId?: string | null;
  deliveryVendor?: string | null;
  destination: LatLng;
  initialRunnerLocation?: LatLng | null;
}

export interface DirectionsResult {
  polylinePoints: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  etaText: string;
}

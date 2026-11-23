import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  type MapMarker,
  type LatLng as MapLatLng,
} from 'react-native-maps';

import { IconMapPin, IconUtensils } from '@/components/ui/icons';
import { palette } from '@/theme';

import { bearingDegrees } from '../geo';
import type { LatLng } from '../types';
import { MapMarkerBadge } from './MapMarkerBadge';
import { RunnerMarkerIcon } from './RunnerMarkerIcon';

/** Runner marker glides to each new fix over roughly the polling interval instead of jumping. */
const GLIDE_DURATION_MS = 6500;
const EDGE_PADDING = { top: 90, right: 60, bottom: 60, left: 60 };

function toMapLatLng(p: LatLng): MapLatLng {
  return { latitude: p.lat, longitude: p.lng };
}

interface TrackingMapProps {
  destination: LatLng;
  /** Kitchen/pickup point — only rendered while there's no live `runnerLocation`
   * yet, as the "here's the pickup and drop, live position isn't available
   * yet" fallback view. Once a runner fix arrives, the pickup pin drops out
   * in favor of the live rider marker (unchanged existing behavior). */
  pickup?: LatLng | null;
  runnerLocation: LatLng | null;
  routePath: LatLng[];
  height?: number;
}

export const TrackingMap = memo(function TrackingMap({
  destination,
  pickup,
  runnerLocation,
  routePath,
  height = 320,
}: TrackingMapProps) {
  const mapRef = useRef<MapView>(null);
  const markerRef = useRef<MapMarker>(null);
  const hasFitBounds = useRef(false);
  // Guards `animateMarkerToCoordinate` below — react-native-maps' Android
  // implementation drives that glide with a native `ValueAnimator` that
  // keeps ticking independently of React's lifecycle (there's no cancel API
  // for it). Calling it once the native map/marker is gone — either because
  // the map hasn't finished initializing yet, or because this component is
  // already unmounting — leaves the animator updating a torn-down/not-yet-
  // ready marker, which crashes the whole app natively
  // (`ReflectiveProperty.set: null receiver`, unrecoverable from JS since it
  // happens on a later animation frame, outside any JS call stack).
  const [mapReady, setMapReady] = useState(false);
  const isMountedRef = useRef(true);
  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);
  // The Marker's `coordinate` prop only ever drives its *first* render (latched
  // during render, the first time a fix arrives — the React-endorsed alternative
  // to an Effect for "adjust state when a prop changes"); every later fix moves
  // it via `animateMarkerToCoordinate` so React never re-diffs the prop and
  // snaps the marker back mid-glide.
  const [initialRunnerLocation, setInitialRunnerLocation] = useState<LatLng | null>(null);
  if (runnerLocation && !initialRunnerLocation) {
    setInitialRunnerLocation(runnerLocation);
  }

  useEffect(() => {
    if (!mapReady || !isMountedRef.current) return;
    if (!runnerLocation || runnerLocation === initialRunnerLocation) return;
    markerRef.current?.animateMarkerToCoordinate(toMapLatLng(runnerLocation), GLIDE_DURATION_MS);
  }, [mapReady, runnerLocation, initialRunnerLocation]);

  useEffect(() => {
    if (hasFitBounds.current) return;
    // Fit to whichever second point we actually have — the live runner fix
    // once tracking is active, else the static pickup point in fallback mode.
    const other = runnerLocation ?? pickup;
    if (!other) return;
    hasFitBounds.current = true;
    mapRef.current?.fitToCoordinates([toMapLatLng(other), toMapLatLng(destination)], {
      edgePadding: EDGE_PADDING,
      animated: true,
    });
  }, [runnerLocation, pickup, destination]);

  const polylineCoords = useMemo(() => routePath.map(toMapLatLng), [routePath]);
  const destinationLatLng = useMemo(() => toMapLatLng(destination), [destination]);
  const pickupLatLng = useMemo(() => (pickup ? toMapLatLng(pickup) : null), [pickup]);
  const rotation = useMemo(
    () => (runnerLocation ? bearingDegrees(runnerLocation, destination) : 0),
    [runnerLocation, destination],
  );

  return (
    <View style={{ height }} className="overflow-hidden rounded-2xl border border-border">
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        onMapReady={() => setMapReady(true)}
        initialRegion={{
          latitude: (runnerLocation ?? pickup ?? destination).lat,
          longitude: (runnerLocation ?? pickup ?? destination).lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation={false}
        focusable
        showsTraffic
        showsMyLocationButton
        >
        {routePath.length >= 2 && (
          <Polyline
            coordinates={polylineCoords}
            strokeColor="#4986E7"
            strokeWidth={4}
          />
        )}

        {/* Delivery address — blue (`accent.location`), matching the app's own
            rule that green is reserved for CTAs, not informational map pins. */}
        <Marker coordinate={destinationLatLng} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <MapMarkerBadge icon={IconMapPin} color={palette.accent.location} size={40} />
        </Marker>

        {pickup && !initialRunnerLocation && pickupLatLng && (
          <Marker coordinate={pickupLatLng} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <MapMarkerBadge icon={IconUtensils} color={palette.accent.food} size={36} />
          </Marker>
        )}

        {initialRunnerLocation && (
          // `tracksViewChanges` deliberately left at its default (true) here —
          // unlike the destination/pickup markers above, this one's content is
          // genuinely dynamic: `RunnerMarkerIcon` rotates its heading arrow via
          // a plain RN `transform: rotate` on its own View, not react-native-
          // maps' native `Marker.rotation` prop, so react-native-maps must keep
          // re-snapshotting this marker's children to see each new `rotation`
          // value — `tracksViewChanges={false}` would freeze the arrow at
          // whatever heading it had at mount while the bike glyph kept gliding
          // (that part is imperative via `animateMarkerToCoordinate`, so it's
          // unaffected either way).
          <Marker ref={markerRef} coordinate={toMapLatLng(initialRunnerLocation)} anchor={{ x: 0.5, y: 0.5 }}>
            <RunnerMarkerIcon rotation={rotation} />
          </Marker>
        )}
      </MapView>
    </View>
  );
});

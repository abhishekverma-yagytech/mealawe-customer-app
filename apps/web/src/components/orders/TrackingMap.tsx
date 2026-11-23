'use client';

import { useEffect, useRef } from 'react';

import type { LatLng } from '@mealawe/api';

import { ENV } from '@/lib/env';
import { loadMapsCore, loadMarker } from '@/platform/maps';

/** Live delivery map: destination pin, rider marker and route polyline (Google Maps JS). */
export function TrackingMap({ destination, runner, route }: { destination: LatLng; runner: LatLng | null; route: LatLng[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const dest = useRef<google.maps.Marker | null>(null);
  const rider = useRef<google.maps.Marker | null>(null);
  const line = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!ENV.googleMapsApiKey) return;
    let cancelled = false;
    (async () => {
      const [maps, marker] = await Promise.all([loadMapsCore(), loadMarker()]);
      if (cancelled || !maps || !marker || !el.current) return;
      map.current = new maps.Map(el.current, { center: destination, zoom: 15, disableDefaultUI: true, zoomControl: true });
      dest.current = new marker.Marker({ map: map.current, position: destination, title: 'Delivery address' });
      rider.current = new marker.Marker({ map: map.current, position: runner ?? destination, title: 'Delivery partner', label: '🛵', visible: !!runner });
      line.current = new maps.Polyline({ map: map.current, path: route, strokeColor: '#63ab45', strokeWeight: 5 });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (runner) {
      rider.current?.setPosition(runner);
      rider.current?.setVisible(true);
    }
    line.current?.setPath(route);
    if (runner && map.current) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(runner);
      bounds.extend(destination);
      map.current.fitBounds(bounds, 60);
    }
  }, [runner, route, destination]);

  if (!ENV.googleMapsApiKey) return <div className="flex h-72 items-center justify-center rounded-card border border-dashed border-border text-sm text-muted-foreground">Live map unavailable</div>;
  return <div ref={el} role="application" aria-label="Live delivery map" className="h-72 w-full overflow-hidden rounded-card border border-border bg-muted sm:h-96" />;
}

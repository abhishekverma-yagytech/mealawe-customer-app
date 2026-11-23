'use client';

import { LocateFixed } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { Address, GeoPoint } from '@mealawe/api';

import { Button } from '@/components/ui/Button';
import { ENV } from '@/lib/env';
import { addressFromComponents, webLocationProvider } from '@/platform/location';
import { loadGeocoding, loadMapsCore, loadMarker, loadPlaces } from '@/platform/maps';

export type ResolvedPlace = Pick<Address, 'geolocation' | 'location' | 'pincode' | 'city' | 'state'>;
const DEFAULT_CENTER: GeoPoint = { lat: 20.5937, lng: 78.9629 }; // India

/**
 * Address picker: Places autocomplete + draggable pin on a Google map, reverse-geocoded on every move.
 * Without a Maps key it degrades to "use my current location" (GPS) — the form still works.
 */
export function LocationPicker({ initial, onResolved }: { initial: GeoPoint | null; onResolved: (p: ResolvedPlace) => void }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const inputEl = useRef<HTMLInputElement>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [label, setLabel] = useState<string>('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'nokey'>(ENV.googleMapsApiKey ? 'loading' : 'nokey');
  const onResolvedRef = useRef(onResolved);
  useEffect(() => {
    onResolvedRef.current = onResolved;
  });

  const resolve = async (point: GeoPoint, formatted?: string, comps?: google.maps.GeocoderAddressComponent[]) => {
    const parts = formatted && comps ? addressFromComponents(formatted, comps as never) : await webLocationProvider.reverseGeocode(point);
    setLabel(parts.location ?? '');
    onResolvedRef.current({ geolocation: point, location: parts.location ?? 'Selected location', pincode: parts.pincode, city: parts.city, state: parts.state });
  };

  const moveTo = (point: GeoPoint, formatted?: string, comps?: google.maps.GeocoderAddressComponent[]) => {
    markerRef.current?.setPosition(point);
    mapRef.current?.panTo(point);
    void resolve(point, formatted, comps);
  };

  useEffect(() => {
    if (!ENV.googleMapsApiKey) return;
    let cancelled = false;
    (async () => {
      const [maps, marker, places, geocoding] = await Promise.all([loadMapsCore(), loadMarker(), loadPlaces(), loadGeocoding()]);
      if (cancelled || !maps || !marker || !places || !geocoding || !mapEl.current || !inputEl.current) return;
      const center = initial ?? DEFAULT_CENTER;
      const map = new maps.Map(mapEl.current, { center, zoom: initial ? 17 : 5, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy' });
      const pin = new marker.Marker({ map, position: center, draggable: true });
      mapRef.current = map;
      markerRef.current = pin;
      const fromPoint = (p: google.maps.LatLng | null | undefined) => p && moveTo({ lat: p.lat(), lng: p.lng() });
      pin.addListener('dragend', () => fromPoint(pin.getPosition()));
      map.addListener('click', (e: google.maps.MapMouseEvent) => fromPoint(e.latLng));
      const ac = new places.Autocomplete(inputEl.current, { componentRestrictions: { country: 'in' }, fields: ['geometry', 'formatted_address', 'address_components'] });
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        const loc = place.geometry?.location;
        if (loc) moveTo({ lat: loc.lat(), lng: loc.lng() }, place.formatted_address, place.address_components);
      });
      setStatus('ready');
      if (initial) void resolve(initial);
    })().catch(() => !cancelled && setStatus('nokey'));
    return () => {
      cancelled = true;
    };
    // initial is only the starting point; later moves come from the map itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useGps = async () => {
    const p = await webLocationProvider.getGps();
    if (p) moveTo(p);
    else setLabel('Could not get your location — allow location access or search for an address.');
  };

  return (
    <div className="space-y-3">
      {status !== 'nokey' ? (
        <input ref={inputEl} placeholder="Search for your area, street or landmark" aria-label="Search location" className="min-h-11 w-full rounded-card border border-border bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
      ) : null}
      {status !== 'nokey' ? <div ref={mapEl} role="application" aria-label="Map — drag the pin to your exact location" className="h-64 w-full overflow-hidden rounded-card border border-border bg-muted" /> : <p className="rounded-card border border-dashed border-border p-3 text-sm text-muted-foreground">Map search isn&apos;t configured. Use your current location, then add your address details below.</p>}
      <Button type="button" variant="outline" onClick={useGps}><LocateFixed className="size-4" />Use my current location</Button>
      {label ? <p className="text-sm"><span className="font-bold">Selected: </span>{label}</p> : null}
    </div>
  );
}

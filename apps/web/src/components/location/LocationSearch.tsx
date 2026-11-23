'use client';

import { MapPin, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { Address } from '@mealawe/api';
import { useClusterStore } from '@mealawe/state';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { ENV } from '@/lib/env';
import { addressFromComponents } from '@/platform/location';
import { loadGeocoding, loadPlaces } from '@/platform/maps';

interface Suggestion {
  placeId: string;
  primary: string;
  secondary: string;
}

/**
 * "Search a location to check availability" (mobile InlineLocationSearch): Places autocomplete (India),
 * resolve the pick to an address, preview whether it is serviceable, then "Use this".
 */
export function LocationSearch({ onUseAddress }: { onUseAddress: (addr: Address) => void }) {
  const previewServiceable = useClusterStore((s) => s.previewServiceable);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [resolved, setResolved] = useState<Address | null>(null);
  const [serviceable, setServiceable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [unavailable, setUnavailable] = useState(!ENV.googleMapsApiKey);

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  const onChange = (text: string) => {
    setQuery(text);
    setResolved(null);
    setServiceable(null);
    if (debounce.current) clearTimeout(debounce.current);
    if (text.trim().length < 3) return setSuggestions([]);
    debounce.current = setTimeout(async () => {
      const places = await loadPlaces();
      if (!places) return setUnavailable(true);
      token.current ??= new places.AutocompleteSessionToken();
      try {
        const res = await new places.AutocompleteService().getPlacePredictions({ input: text, componentRestrictions: { country: 'in' }, sessionToken: token.current });
        setSuggestions((res.predictions ?? []).map((p) => ({ placeId: p.place_id, primary: p.structured_formatting.main_text, secondary: p.structured_formatting.secondary_text ?? '' })));
      } catch {
        setSuggestions([]);
      }
    }, 300);
  };

  const pick = async (s: Suggestion) => {
    setQuery(s.primary);
    setSuggestions([]);
    setChecking(true);
    token.current = null;
    try {
      const geocoding = await loadGeocoding();
      const res = geocoding ? await new geocoding.Geocoder().geocode({ placeId: s.placeId }) : null;
      const top = res?.results?.[0];
      const loc = top?.geometry.location;
      if (!top || !loc) return;
      const point = { lat: loc.lat(), lng: loc.lng() };
      const parts = addressFromComponents(top.formatted_address, top.address_components as never);
      const addr: Address = { geolocation: point, location: parts.location ?? s.primary, city: parts.city, state: parts.state, pincode: parts.pincode, tagLocation: 'other' };
      setResolved(addr);
      setServiceable(await previewServiceable(point));
    } finally {
      setChecking(false);
    }
  };

  if (unavailable) return <p className="rounded-card border border-dashed border-border p-3 text-sm text-muted-foreground">Location search isn&apos;t configured. Use your current location or a saved address.</p>;

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
        <Search className="size-4 text-muted-foreground" aria-hidden />
        <input value={query} onChange={(e) => onChange(e.target.value)} placeholder="Search area, street, landmark…" aria-label="Search location" className="flex-1 bg-transparent outline-none" />
      </label>
      {suggestions.length > 0 ? (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          {suggestions.map((s) => (
            <li key={s.placeId} className="border-b border-border last:border-0">
              <button onClick={() => void pick(s)} className="flex w-full items-center gap-2 px-3 py-3 text-left hover:bg-muted">
                <MapPin className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0"><span className="block truncate text-sm">{s.primary}</span>{s.secondary ? <span className="block truncate text-xs text-muted-foreground">{s.secondary}</span> : null}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {checking ? <p className="text-xs text-muted-foreground">Checking availability…</p> : null}
      {resolved && serviceable !== null ? (
        <div className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5', serviceable ? 'bg-primary/10' : 'bg-nonveg/10')}>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-bold">{resolved.location}</p>
            <p className={cn('text-xs', serviceable ? 'text-primary-dark' : 'text-nonveg')}>{serviceable ? 'We deliver here' : "We don't deliver here yet"}</p>
          </div>
          {serviceable ? <Button size="sm" onClick={() => onUseAddress(resolved)}>Use this</Button> : null}
        </div>
      ) : null}
    </div>
  );
}

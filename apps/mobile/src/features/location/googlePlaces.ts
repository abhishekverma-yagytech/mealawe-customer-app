import { env } from '@/config';

import type { Address, GeoPoint } from './types';

/**
 * Google Places + Geocoding REST wrappers for the address picker.
 * Mirrors MealaweUserApp's google-map.service (autocomplete → details, and
 * reverse-geocode a dropped pin into formatted address + pincode/city/state).
 *
 * Native-only (RN fetch has no CORS). Key comes from env (restrict it by
 * package name / SHA-1 in the Google Cloud console).
 */
const KEY = env.googleMapsApiKey;
const BASE = 'https://maps.googleapis.com/maps/api';
/** India-scoped, matching the product's delivery region. */
const COUNTRY = 'in';

export interface PlaceSuggestion {
  placeId: string;
  primaryText: string;
  secondaryText: string;
}

/** Resolved location fields (the "where" part of an Address). */
export type ResolvedPlace = Pick<
  Address,
  'geolocation' | 'location' | 'pincode' | 'city' | 'state'
>;

/** Opaque per-search session token (Places billing groups autocomplete+details). */
export function newSessionToken(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** Autocomplete predictions for a query. Empty on error / short input. */
export async function autocomplete(
  input: string,
  sessionToken: string,
): Promise<PlaceSuggestion[]> {
  const query = input.trim();
  if (query.length < 3) {
    return [];
  }
  try {
    const url =
      `${BASE}/place/autocomplete/json?input=${encodeURIComponent(query)}` +
      `&components=country:${COUNTRY}&sessiontoken=${sessionToken}&key=${KEY}`;
    const res = await fetch(url);
    const json = (await res.json()) as {
      status: string;
      predictions?: Array<{
        place_id: string;
        structured_formatting?: { main_text?: string; secondary_text?: string };
        description?: string;
      }>;
    };
    if (json.status !== 'OK' || !json.predictions) {
      return [];
    }
    return json.predictions.map((p) => ({
      placeId: p.place_id,
      primaryText: p.structured_formatting?.main_text ?? p.description ?? '',
      secondaryText: p.structured_formatting?.secondary_text ?? '',
    }));
  } catch {
    return [];
  }
}

/** Resolve a selected prediction to coordinates + address fields. */
export async function placeDetails(
  placeId: string,
  sessionToken: string,
): Promise<ResolvedPlace | null> {
  try {
    const url =
      `${BASE}/place/details/json?place_id=${placeId}` +
      `&fields=geometry,formatted_address,address_components,name` +
      `&sessiontoken=${sessionToken}&key=${KEY}`;
    const res = await fetch(url);
    const json = (await res.json()) as { status: string; result?: GooglePlaceResult };
    if (json.status !== 'OK' || !json.result?.geometry) {
      return null;
    }
    return toResolvedPlace(json.result);
  } catch {
    return null;
  }
}

/** Reverse-geocode a dropped-pin coordinate into address fields. */
export async function reverseGeocodeGoogle(point: GeoPoint): Promise<ResolvedPlace | null> {
  try {
    const url = `${BASE}/geocode/json?latlng=${point.lat},${point.lng}&key=${KEY}`;
    const res = await fetch(url);
    const json = (await res.json()) as { status: string; results?: GooglePlaceResult[] };
    if (json.status !== 'OK' || !json.results?.length) {
      return null;
    }
    // keep the pin's exact coordinates; take address text from the top result
    return { ...toResolvedPlace(json.results[0]), geolocation: point };
  } catch {
    return null;
  }
}

interface GooglePlaceResult {
  formatted_address?: string;
  geometry?: { location: { lat: number; lng: number } };
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
}

function component(result: GooglePlaceResult, type: string): string | undefined {
  return result.address_components?.find((c) => c.types.includes(type))?.long_name;
}

function toResolvedPlace(result: GooglePlaceResult): ResolvedPlace {
  const loc = result.geometry?.location;
  const location = (result.formatted_address ?? '').replace('Unnamed Road, ', '');
  return {
    geolocation: { lat: loc?.lat ?? 0, lng: loc?.lng ?? 0 },
    location: location || 'Selected location',
    pincode: component(result, 'postal_code'),
    state: component(result, 'administrative_area_level_1'),
    city:
      component(result, 'locality') ??
      component(result, 'administrative_area_level_2') ??
      component(result, 'administrative_area_level_3'),
  };
}

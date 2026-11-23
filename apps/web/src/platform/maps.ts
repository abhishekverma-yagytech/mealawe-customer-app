import { Loader } from '@googlemaps/js-api-loader';

import { ENV } from '@/lib/env';

let loader: Loader | null = null;

function getLoader(): Loader | null {
  if (typeof window === 'undefined' || !ENV.googleMapsApiKey) return null;
  loader ??= new Loader({ apiKey: ENV.googleMapsApiKey, version: 'weekly' });
  return loader;
}

/** Geocoder library, or null when no Maps key is configured / on the server. */
export async function loadGeocoding(): Promise<google.maps.GeocodingLibrary | null> {
  return (await getLoader()?.importLibrary('geocoding')) ?? null;
}

/** Places library (Autocomplete), or null when no Maps key is configured / on the server. */
export async function loadPlaces(): Promise<google.maps.PlacesLibrary | null> {
  return (await getLoader()?.importLibrary('places')) ?? null;
}

/** Maps core library (Map, Marker) for the address picker. */
export async function loadMapsCore(): Promise<google.maps.MapsLibrary | null> {
  return (await getLoader()?.importLibrary('maps')) ?? null;
}

/** Marker library (legacy Marker class — works without a Map ID). */
export async function loadMarker(): Promise<google.maps.MarkerLibrary | null> {
  return (await getLoader()?.importLibrary('marker')) ?? null;
}

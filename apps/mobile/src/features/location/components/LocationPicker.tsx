import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { AppText } from '@/components/ui/AppText';
import { IconLocate, IconMapPin, IconSearch } from '@/components/ui/icons';
import { palette } from '@/theme';

import { getGps } from '../geo';
import {
  autocomplete,
  newSessionToken,
  placeDetails,
  reverseGeocodeGoogle,
  type PlaceSuggestion,
  type ResolvedPlace,
} from '../googlePlaces';
import type { GeoPoint } from '../types';

/** Default map center when nothing is known yet (Pune). */
const DEFAULT_CENTER: GeoPoint = { lat: 18.5204, lng: 73.8567 };
const DELTA = { latitudeDelta: 0.012, longitudeDelta: 0.012 };

interface LocationPickerProps {
  initial?: GeoPoint | null;
  height?: number;
  /** Fires whenever the pin settles or a search result is chosen. */
  onResolved: (place: ResolvedPlace) => void;
}

/**
 * Map with a fixed center pin: pan the map and the pin reverse-geocodes to an
 * address; a search field offers Google autocomplete and recenters on select.
 * Mirrors MealaweUserApp's set-location-manually + search-location-manual.
 */
export function LocationPicker({ initial, height = 280, onResolved }: LocationPickerProps) {
  const mapRef = useRef<MapView>(null);
  const sessionRef = useRef(newSessionToken());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When we start with a known point, skip the first auto-settle (the mount
  // effect below resolves it). With no initial point, let the first settle resolve.
  const skipNextSettle = useRef(!!initial);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [resolving, setResolving] = useState(false);

  const start = initial ?? DEFAULT_CENTER;
  const initialRegion: Region = {
    latitude: start.lat,
    longitude: start.lng,
    ...DELTA,
  };

  // Resolve the starting point once so the form has an address without the user
  // having to move the map.
  useEffect(() => {
    if (!initial) {
      return;
    }
    let cancelled = false;
    (async () => {
      setResolving(true);
      const place = await reverseGeocodeGoogle(initial);
      if (!cancelled) {
        setResolving(false);
        if (place) onResolved(place);
      }
    })();
    return () => {
      cancelled = true;
    };
    // resolve only the initial point on mount; later moves go through onRegionChangeComplete
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onRegionChangeComplete(r: Region) {
    if (skipNextSettle.current) {
      skipNextSettle.current = false;
      return;
    }
    setResolving(true);
    const place = await reverseGeocodeGoogle({ lat: r.latitude, lng: r.longitude });
    setResolving(false);
    if (place) {
      onResolved(place);
    }
  }

  function onChangeQuery(text: string) {
    setQuery(text);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSuggestions(await autocomplete(text, sessionRef.current));
    }, 300);
  }

  async function selectSuggestion(s: PlaceSuggestion) {
    setQuery(s.primaryText);
    setSuggestions([]);
    const place = await placeDetails(s.placeId, sessionRef.current);
    sessionRef.current = newSessionToken();
    if (place) {
      skipNextSettle.current = true; // don't re-reverse-geocode the programmatic move
      mapRef.current?.animateToRegion(
        { latitude: place.geolocation.lat, longitude: place.geolocation.lng, ...DELTA },
        500,
      );
      onResolved(place);
    }
  }

  async function recenterOnGps() {
    const point = await getGps();
    if (point) {
      mapRef.current?.animateToRegion(
        { latitude: point.lat, longitude: point.lng, ...DELTA },
        500,
      );
    }
  }

  return (
    <View style={{ height }} className="overflow-hidden rounded-2xl border border-border">
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        onRegionChangeComplete={onRegionChangeComplete}
        showsMyLocationButton={false}
        showsUserLocation
      />

      {/* Fixed center pin — the map moves under it; its tip marks the target. */}
      <View
        pointerEvents="none"
        className="absolute inset-0 items-center justify-center">
        <View style={{ marginBottom: 28 }}>
          <IconMapPin size={36} color={palette.brand.green} strokeWidth={2.5} />
        </View>
      </View>

      {/* Search field + autocomplete dropdown */}
      <View className="absolute inset-x-3 top-3">
        <View className="flex-row items-center gap-2 rounded-2xl bg-white px-4 py-3.5 shadow">
          <IconSearch size={20} color={palette.neutral.gray500} />
          <TextInput
            value={query}
            onChangeText={onChangeQuery}
            placeholder="Search area, street, landmark…"
            placeholderTextColor={palette.neutral.gray500}
            className="flex-1 font-metropolis text-title text-foreground"
            style={{ paddingVertical: 0 }}
            returnKeyType="search"
          />
        </View>

        {suggestions.length > 0 && (
          <View className="mt-1.5 overflow-hidden rounded-2xl bg-white shadow">
            {suggestions.map((s) => (
              <Pressable
                key={s.placeId}
                onPress={() => selectSuggestion(s)}
                className="flex-row items-center gap-2 border-b border-border px-3 py-3 active:bg-muted">
                <IconMapPin size={16} color={palette.neutral.gray500} />
                <View className="flex-1">
                  <AppText variant="bodySm" className="text-foreground" numberOfLines={1}>
                    {s.primaryText}
                  </AppText>
                  {!!s.secondaryText && (
                    <AppText variant="caption" className="text-muted-foreground" numberOfLines={1}>
                      {s.secondaryText}
                    </AppText>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Recenter-on-GPS button */}
      <Pressable
        onPress={recenterOnGps}
        className="absolute bottom-3 right-3 h-11 w-11 items-center justify-center rounded-full bg-white shadow active:opacity-80"
        accessibilityRole="button"
        accessibilityLabel="Use my current location">
        <IconLocate size={20} color={palette.brand.green} />
      </Pressable>

      {resolving && (
        <View className="absolute bottom-3 left-3 flex-row items-center gap-2 rounded-full bg-white px-3 py-1.5 shadow">
          <ActivityIndicator size="small" color={palette.brand.green} />
          <AppText variant="caption" className="text-muted-foreground">
            Locating…
          </AppText>
        </View>
      )}
    </View>
  );
}

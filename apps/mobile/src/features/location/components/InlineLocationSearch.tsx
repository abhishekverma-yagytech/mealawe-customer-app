import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { IconMapPin, IconSearch } from '@/components/ui/icons';
import { resolveApartment, type ResolvedApartment } from '@/features/apartment';
import { useClusterStore } from '@/store';
import { accentTint, palette } from '@/theme';

import { autocomplete, newSessionToken, placeDetails, type PlaceSuggestion } from '../googlePlaces';
import type { Address } from '../types';

interface InlineLocationSearchProps {
  /** Called once the user confirms a serviceable searched location — builds
   * the same ad-hoc `Address` shape `useCurrentLocation()` does (geolocation
   * + formatted label, tag "other"), so this is just that same "use this as
   * my current delivery address" path, reached by search instead of GPS. */
  onUseAddress: (addr: Address) => void;
  /**
   * Overrides the "Checking availability…" caption's color, replacing its
   * default `text-muted-foreground` token. For callers that render this
   * component on a fixed, non-theme-following background — e.g.
   * `LocationGate`'s green backdrop, which stays the same hex in both light
   * and dark scheme — where `text-muted-foreground` flips to a light gray
   * in dark mode and would go unreadable there. Leave unset for callers
   * (e.g. `addresses.tsx`) that sit on the normal theme-following
   * `bg-background`, so the caption keeps tracking the theme correctly.
   */
  checkingLabelColor?: string;
}

/**
 * Inline "search a location to check availability" — a search field +
 * autocomplete dropdown right on the page, no navigation to a separate
 * screen. Resolves to a serviceable/not-serviceable pill with a "Use this"
 * confirm. Same search behavior as `LocationPicker`, minus the map.
 */
export function InlineLocationSearch({ onUseAddress, checkingLabelColor }: InlineLocationSearchProps) {
  const previewServiceable = useClusterStore((s) => s.previewServiceable);
  const sessionRef = useRef(newSessionToken());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [resolved, setResolved] = useState<Address | null>(null);
  const [serviceable, setServiceable] = useState<boolean | null>(null);
  // Only ever populated when `serviceable === false` — same apartment
  // carve-out as AddressForm.tsx's own fallback (this is the OTHER "check
  // availability" surface in the app — LocationGate's first-run search and
  // addresses.tsx's own inline search both render this component instead of
  // AddressForm, so it needs the identical fallback, not a shared one).
  const [apartmentFallback, setApartmentFallback] = useState<ResolvedApartment | null>(null);
  const [checking, setChecking] = useState(false);

  function onChangeQuery(text: string) {
    setQuery(text);
    setResolved(null);
    setServiceable(null);
    setApartmentFallback(null);
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
    setChecking(true);
    const place = await placeDetails(s.placeId, sessionRef.current);
    sessionRef.current = newSessionToken();
    setChecking(false);
    if (!place) {
      return;
    }
    const addr: Address = { ...place, tagLocation: 'other' };
    setResolved(addr);
    setApartmentFallback(null);
    const result = await previewServiceable(place.geolocation);
    setServiceable(result);
    if (result) return; // normally serviceable — no need to also check apartment
    const apartment = await resolveApartment(place.geolocation.lng, place.geolocation.lat).catch(() => null);
    setApartmentFallback(apartment);
  }

  return (
    <View style={{ gap: 8 }}>
      <View className="flex-row items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <IconSearch size={15} color={palette.neutral.gray500} />
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          placeholder="Search area, street, landmark…"
          placeholderTextColor={palette.neutral.gray500}
          className="flex-1 font-metropolis text-body-lg text-foreground"
          style={{ paddingVertical: 0 }}
          returnKeyType="search"
        />
      </View>

      {suggestions.length > 0 ? (
        <View className="overflow-hidden rounded-xl border border-border bg-card">
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
                {s.secondaryText ? (
                  <AppText variant="caption" className="text-muted-foreground" numberOfLines={1}>
                    {s.secondaryText}
                  </AppText>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {checking ? (
        <AppText
          variant="caption"
          className={checkingLabelColor ? '' : 'text-muted-foreground'}
          style={checkingLabelColor ? { color: checkingLabelColor } : undefined}>
          Checking availability…
        </AppText>
      ) : null}

      {resolved && serviceable !== null ? (
        <View
          className="flex-row items-center gap-3 rounded-xl px-3 py-2.5"
          style={{
            backgroundColor: accentTint(
              serviceable ? palette.brand.green : apartmentFallback ? palette.brand.green : palette.status.danger,
              0.1,
            ),
          }}>
          <View className="flex-1">
            <AppText variant="label" className="text-foreground" numberOfLines={1}>
              {resolved.location}
            </AppText>
            <AppText
              variant="caption"
              style={{ color: serviceable || apartmentFallback ? palette.brand.green : palette.status.danger }}>
              {serviceable
                ? 'We deliver here'
                : apartmentFallback
                  ? `Apartment ordering available at ${apartmentFallback.apartmentName ?? 'this complex'}`
                  : "We don't deliver here yet"}
            </AppText>
          </View>
          {serviceable || apartmentFallback ? <Button label="Use this" size="sm" onPress={() => onUseAddress(resolved)} /> : null}
        </View>
      ) : null}
    </View>
  );
}

import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { z } from 'zod';

import { AppText } from '@/components/ui/AppText';
import { IconCheckCircle, IconComplaint, IconMapPin } from '@/components/ui/icons';
import { resolveApartment, type ResolvedApartment } from '@/features/apartment';
import { TextField } from '@/features/auth/components/TextField';
import { useClusterStore } from '@/store';
import { palette } from '@/theme';

import type { ResolvedPlace } from '../googlePlaces';
import type { Address, TagLocation } from '../types';

const TAGS: TagLocation[] = ['home', 'work', 'other'];

const detailSchema = z.object({
  address: z.string().trim().min(3, 'Add a flat / house / street'),
  landmark: z.string().trim().optional(),
});

interface AddressFormProps {
  /** The "where" — supplied by the map picker (coords + area + pincode/city/state). */
  resolved: ResolvedPlace | null;
  /** Existing detail fields when editing. */
  initial?: Partial<Address>;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (address: Address) => void;
}

/**
 * Address detail fields (flat/house, landmark, tag). The area, coordinates, and
 * pincode/city/state come from the map picker (`resolved`), shown here read-only.
 */
export function AddressForm({
  resolved,
  initial,
  submitting = false,
  submitLabel = 'Save address',
  onSubmit,
}: AddressFormProps) {
  const [tag, setTag] = useState<TagLocation>(initial?.tagLocation ?? 'home');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [landmark, setLandmark] = useState(initial?.landmark ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const previewServiceable = useClusterStore((s) => s.previewServiceable);
  // null = not checked yet (no resolved location, or the check is in flight).
  const [serviceable, setServiceable] = useState<boolean | null>(null);
  // Only ever populated when `serviceable === false` — a candidate address
  // that IS normally serviceable never needs an apartment fallback.
  const [apartmentFallback, setApartmentFallback] = useState<ResolvedApartment | null>(null);

  // Check serviceability for whichever location the map/search picker last
  // resolved — read-only (see previewServiceable), never touches the app's
  // actual current-location cluster state. Falls back to the apartment's
  // own, separate geofence when the regular delivery clusters miss —
  // matching the server's own `getNearestApartment`, which is deliberately
  // independent of GeoFencing (an apartment complex can be servicable via
  // its own registered kitchens even outside every regular delivery
  // cluster).
  useEffect(() => {
    if (!resolved) {
      setServiceable(null);
      setApartmentFallback(null);
      return;
    }
    let cancelled = false;
    setServiceable(null);
    setApartmentFallback(null);
    previewServiceable(resolved.geolocation).then((result) => {
      if (cancelled) return;
      setServiceable(result);
      if (result) return; // normally serviceable — no need to also check apartment
      void resolveApartment(resolved.geolocation.lng, resolved.geolocation.lat)
        .then((apartment) => {
          if (!cancelled) setApartmentFallback(apartment);
        })
        .catch(() => {
          // A real request failure — leave `apartmentFallback` at `null`
          // (fail closed). This is a one-shot preview check with no cached
          // "last known good" to fall back to, unlike `resolveApartment`'s
          // own documented contract for the app's actual current-location
          // eligibility store.
        });
    });
    return () => {
      cancelled = true;
    };
  }, [resolved, previewServiceable]);

  function submit() {
    if (!resolved) {
      setErrors({ location: 'Move the map to set your location first' });
      return;
    }
    if (serviceable === false && !apartmentFallback) {
      setErrors({ location: "We don't deliver here yet — pick a different location" });
      return;
    }
    const result = detailSchema.safeParse({ address, landmark });
    if (!result.success) {
      const next: Record<string, string> = {};
      for (const issue of result.error.issues) {
        next[String(issue.path[0])] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    onSubmit({
      ...initial,
      geolocation: resolved.geolocation,
      location: resolved.location,
      pincode: resolved.pincode,
      city: resolved.city,
      state: resolved.state,
      tagLocation: tag,
      address: result.data.address,
      landmark: result.data.landmark || undefined,
    });
  }

  return (
    <View className="gap-4">
      {/* Selected location (from the map) */}
      <View className="flex-row items-start gap-2 rounded-2xl border border-border bg-muted p-3">
        <View className="mt-0.5">
          <IconMapPin size={18} color={palette.brand.green} />
        </View>
        <View className="flex-1">
          <AppText variant="overline" className="text-muted-foreground">
            Selected location
          </AppText>
          <AppText variant="bodySm" className="text-foreground" numberOfLines={2}>
            {resolved?.location ?? 'Move the map to pick your exact location'}
          </AppText>
        </View>
      </View>
      {!!errors.location && (
        <AppText variant="caption" className="-mt-2 text-danger">
          {errors.location}
        </AppText>
      )}
      {serviceable != null && (serviceable || !apartmentFallback) && (
        <View className="-mt-2 flex-row items-center gap-1.5">
          {serviceable ? (
            <IconCheckCircle size={14} color={palette.status.success} />
          ) : (
            <IconComplaint size={14} color={palette.status.danger} />
          )}
          {/* `status.danger`, not `status.warning` — the warning yellow
              (#ffca22) is nearly invisible as text on this card's light
              background (fails WCAG contrast). Matches the red already used
              for the same message in InlineLocationSearch. */}
          <AppText
            variant="caption"
            style={{ color: serviceable ? palette.status.success : palette.status.danger }}>
            {serviceable ? 'We deliver here' : "We don't deliver here yet"}
          </AppText>
        </View>
      )}
      {serviceable === false && apartmentFallback && (
        // The apartment carve-out — neither fully serviceable nor blocked,
        // so an amber/info tone rather than the red/green pair above.
        <View className="-mt-2 flex-row items-start gap-1.5 rounded-xl bg-muted p-2.5">
          <IconMapPin size={14} color={palette.brand.green} />
          <AppText variant="caption" className="flex-1 text-muted-foreground">
            <AppText variant="caption" weight="bold" className="text-foreground">
              {apartmentFallback.apartmentName ?? 'This apartment complex'}
            </AppText>{' '}
            is registered for Apartment ordering — you can go ahead and save this address for ordering.
          </AppText>
        </View>
      )}

      <View className="gap-2">
        <AppText variant="label" className="text-foreground">
          Save as
        </AppText>
        <View className="flex-row gap-2">
          {TAGS.map((t) => {
            const active = t === tag;
            return (
              <Pressable
                key={t}
                onPress={() => setTag(t)}
                className={
                  active
                    ? 'rounded-full border-2 border-primary bg-muted px-4 py-2 active:opacity-80'
                    : 'rounded-full border border-border px-4 py-2 active:opacity-80'
                }
                accessibilityRole="button"
                accessibilityState={{ selected: active }}>
                <AppText variant="label" className={active ? 'text-primary' : 'text-muted-foreground'}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <TextField
        label="Flat / House / Street"
        required
        value={address}
        onChangeText={setAddress}
        placeholder="e.g. B-402, Green Residency"
        error={errors.address}
      />
      <TextField
        label="Landmark (optional)"
        value={landmark}
        onChangeText={setLandmark}
        placeholder="e.g. Near City Mall"
      />
      <Pressable
        onPress={submit}
        disabled={submitting || (serviceable === false && !apartmentFallback)}
        className="mt-2 items-center rounded-2xl bg-primary py-3.5 active:opacity-80 disabled:opacity-60"
        accessibilityRole="button">
        <AppText variant="label" className="text-primary-foreground">
          {submitting ? 'Saving…' : submitLabel}
        </AppText>
      </Pressable>
    </View>
  );
}

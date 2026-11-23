import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconMapPin, IconSearch } from '@/components/ui/icons';
import { palette } from '@/theme';

import { InlineLocationSearch } from './InlineLocationSearch';
import type { Address } from '../types';

interface LocationGateProps {
  gettingLocation: boolean;
  onDetect: () => void;
  /** Optional secondary action (e.g. "Choose a saved address"). */
  onChooseSaved?: () => void;
  /** Optional "search a location to check availability" action — reveals an
   * inline search field right here (no navigation to a separate screen);
   * called once the user confirms a serviceable searched address. */
  onSearch?: (addr: Address) => void;
}

/** One-off screen-specific backdrop (product decision — intentionally does
 * NOT flow through the shared `bg-background` token, so it doesn't repaint
 * the rest of the app). Fixed regardless of light/dark scheme. */
const GATE_BACKGROUND = '#30B34A';
/** Text/icon ink for content sitting directly on `GATE_BACKGROUND`. Pinned
 * to a fixed dark color instead of the `text-foreground` / `text-primary`
 * tokens: those flip to a near-white value in dark mode (and `text-primary`
 * is brand green in both modes), which would go unreadable against this
 * fixed green. `palette.neutral.black` (#042a33) measures ~5.5:1 against
 * `GATE_BACKGROUND` — passes WCAG AA (4.5:1) for normal-size text.
 *
 * Passed down to `InlineLocationSearch`'s `checkingLabelColor` prop below so
 * its "Checking availability…" caption gets the same override when rendered
 * inside this gate — that caption also renders standalone in `addresses.tsx`
 * on the normal theme-following `bg-background`, where the default
 * `text-muted-foreground` must stay untouched, so the override is passed as
 * a prop value rather than imported directly by that component. */
const GATE_INK = palette.neutral.black;

/**
 * Empty/entry state prompting the user to set a delivery location — auto-detect
 * spinner while a GPS fix is in flight, else a "use current location" CTA with an
 * optional saved-address fallback. Mirrors mealaweApp's home location gate.
 */
export function LocationGate({ gettingLocation, onDetect, onChooseSaved, onSearch }: LocationGateProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <View className="items-center gap-3 px-6 py-10" style={{ backgroundColor: GATE_BACKGROUND }}>
      <View className="h-16 w-16 items-center justify-center rounded-full bg-muted">
        {gettingLocation ? (
          <ActivityIndicator color={palette.brand.green} />
        ) : (
          <IconMapPin size={28} color={palette.brand.green} />
        )}
      </View>

      <AppText variant="h3" className="text-center" style={{ color: GATE_INK }}>
        {gettingLocation ? 'Detecting your location…' : 'Set your delivery location'}
      </AppText>
      <AppText variant="body" className="text-center" style={{ color: GATE_INK }}>
        We&apos;ll show kitchens &amp; thalis serving your area.
      </AppText>

      <Pressable
        onPress={onDetect}
        disabled={gettingLocation}
        className="mt-2 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 active:opacity-80 disabled:opacity-60"
        accessibilityRole="button">
        <IconMapPin size={18} color={palette.neutral.white} />
        <AppText variant="label" className="text-primary-foreground">
          Use my current location
        </AppText>
      </Pressable>

      {onSearch && !searchOpen ? (
        <Pressable
          onPress={() => setSearchOpen(true)}
          className="w-full flex-row items-center justify-center gap-2 rounded-2xl border border-border py-3.5 active:opacity-70"
          accessibilityRole="button">
          <IconSearch size={16} color={GATE_INK} />
          <AppText variant="label" style={{ color: GATE_INK }}>
            Search a location to check availability
          </AppText>
        </Pressable>
      ) : null}

      {onSearch && searchOpen ? (
        <View className="w-full">
          <InlineLocationSearch onUseAddress={onSearch} checkingLabelColor={GATE_INK} />
        </View>
      ) : null}

      {onChooseSaved && (
        <Pressable onPress={onChooseSaved} hitSlop={8} className="active:opacity-70">
          <AppText variant="label" style={{ color: GATE_INK }}>
            Choose a saved address
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

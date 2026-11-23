import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { IconMapPin } from '@/components/ui/icons';
import { useLocationStore } from '@/store';
import { accentTint, palette } from '@/theme';

/** Ceiling on how long this step can block the boot flow — GPS/permission
 * stalls must never hang the app on launch. Needs headroom for the real
 * chain this races against: `getGps()`'s own internal cap (6s) plus
 * `reverseGeocode()`'s (4s) — see `features/location/geo.ts`. The previous
 * 4s value was shorter than a realistic cold GPS fix, so this timer usually
 * won the race and routed past the boot gate before `current` was ever set,
 * leaving the address missing (or arriving late/silently once the
 * still-running fetch finally resolved after Home had already mounted). */
const TIMEOUT_MS = 9000;
/** Returning users who already have an address skip the real GPS wait, but
 * still see this step briefly — a consistency/branding beat, same as Swiggy
 * shows it even when location is already known. */
const MIN_DISPLAY_MS_WITH_ADDRESS = 1100;

const RING_SIZE = 96;
const PIN_BADGE_SIZE = 56;
const RING_DURATION_MS = 1400;

function RadarRing({ delayMs, reducedMotion }: { delayMs: number; reducedMotion: boolean }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    const t = setTimeout(() => {
      progress.value = withRepeat(
        withTiming(1, { duration: RING_DURATION_MS, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      );
    }, delayMs);
    return () => clearTimeout(t);
  }, [delayMs, progress, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.45, 0]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 2.4]) }],
  }));

  if (reducedMotion) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: RING_SIZE,
          height: RING_SIZE,
          borderRadius: RING_SIZE / 2,
          backgroundColor: accentTint(palette.neutral.white, 0.9),
        },
        style,
      ]}
    />
  );
}

interface LocationSplashProps {
  /** True when a delivery address is already known — shows a short branded
   * beat instead of forcing a fresh GPS wait for returning users. */
  hasAddress: boolean;
  onDone: () => void;
}

/**
 * Swiggy-style "finding your location" step — the very first screen shown
 * once the native OS splash hands off, on every cold launch, for every user
 * (before routing to login/register/tabs). Surfaces the location fetch
 * that used to happen silently in the background so it reads as
 * intentional rather than hidden. Never blocks longer than `TIMEOUT_MS`;
 * a slow/denied GPS fix still lets the user into the app, where the
 * existing address picker (see `/addresses`, `LocationGate`) covers manual
 * entry — this screen doesn't duplicate that fallback UI.
 */
export function LocationSplash({ hasAddress, onDone }: LocationSplashProps) {
  const reducedMotion = useReducedMotion();
  const useCurrentLocation = useLocationStore((s) => s.useCurrentLocation);
  const pinScale = useSharedValue(reducedMotion ? 1 : 0.6);

  useEffect(() => {
    pinScale.value = reducedMotion ? 1 : withSpring(1, { damping: 12, stiffness: 140 });
  }, [pinScale, reducedMotion]);

  useEffect(() => {
    let cancelled = false;

    if (hasAddress) {
      // Fire-and-forget: re-run the full "get GPS, match within 500m of a
      // saved address, else use the live point itself" flow on every app
      // open — not just the very first one. A returning user's *persisted*
      // `current` is last session's answer, which can be stale the moment
      // they've physically moved (to a different saved address's radius, or
      // away from every saved address entirely); showing it unchanged until
      // some other trigger happens to refresh it reads as "the app didn't
      // notice I moved." Never awaited here — it must not delay this
      // branch's fixed branded-beat timer below.
      void useCurrentLocation();
      // Nothing to fetch — hold the branded beat for its own fixed minimum
      // duration so this screen actually gets a visible frame, instead of
      // racing an async fetch that has no `await` to yield on (which used to
      // resolve on the same tick as mount and clear this timeout before it
      // could ever fire, so returning users never actually saw this screen).
      const timeoutId = setTimeout(() => {
        if (!cancelled) onDone();
      }, MIN_DISPLAY_MS_WITH_ADDRESS);
      return () => {
        cancelled = true;
        clearTimeout(timeoutId);
      };
    }

    // No known address — attempt a real GPS fetch, capped by TIMEOUT_MS so a
    // stalled/denied permission never hangs the boot flow.
    const timeoutId = setTimeout(() => {
      if (!cancelled) onDone();
    }, TIMEOUT_MS);

    async function run() {
      await useCurrentLocation();
      if (!cancelled) {
        clearTimeout(timeoutId);
        onDone();
      }
    }
    void run();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // Runs once on mount — a one-shot boot step, not re-triggered by store updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pinScale.value }],
  }));

  return (
    <View
      className="flex-1 items-center justify-center"
      style={{ backgroundColor: palette.brand.logoGreen }}>
      <StatusBar style="light" />
      <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <RadarRing delayMs={0} reducedMotion={reducedMotion} />
        <RadarRing delayMs={RING_DURATION_MS / 2} reducedMotion={reducedMotion} />
        <Animated.View
          style={[
            {
              width: PIN_BADGE_SIZE,
              height: PIN_BADGE_SIZE,
              borderRadius: PIN_BADGE_SIZE / 2,
              backgroundColor: palette.neutral.white,
              alignItems: 'center',
              justifyContent: 'center',
            },
            pinStyle,
          ]}>
          <IconMapPin size={28} color={palette.brand.logoGreen} />
        </Animated.View>
      </View>

      <AppText variant="h3" weight="black" className="mt-6 text-white">
        Finding your location…
      </AppText>
      <AppText variant="body" className="mt-1 px-10 text-center text-white/85">
        We&apos;ll show kitchens &amp; thalis serving your area
      </AppText>
    </View>
  );
}

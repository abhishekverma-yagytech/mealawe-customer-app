import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * `insets.bottom` isn't as stable as it looks on this screen: the Home
 * feed hides the Android system nav bar on scroll-down (immersive mode —
 * see `(tabs)/index.tsx`), and hiding it shrinks the safe-area inset
 * Android reports. Any bottom-pinned UI that reacts to the LIVE value
 * shifts by however many px the system bar occupies every time that
 * toggles — which is exactly what showed up as two independent bugs (the
 * bottom nav jumping on scroll, and the open-orders/CTA rib drifting in
 * and out of the nav bar) before both were pointed at this ONE shared,
 * latched value instead of each reading `useSafeAreaInsets()` on its own.
 *
 * Latching onto the largest value ever seen keeps every consumer pinned to
 * the "system bar shown" position regardless of the immersive toggle, and
 * — critically — keeps them all in agreement with EACH OTHER, since they
 * share this one hook rather than each computing their own copy.
 */
export function useStableBottomInset(): number {
  const rawInsets = useSafeAreaInsets();
  const [stable, setStable] = useState(rawInsets.bottom);
  useEffect(() => {
    if (rawInsets.bottom > stable) setStable(rawInsets.bottom);
  }, [rawInsets.bottom, stable]);
  return stable;
}

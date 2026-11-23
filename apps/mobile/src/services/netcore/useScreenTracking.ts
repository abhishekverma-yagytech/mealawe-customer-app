import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { setScreenName } from './netcoreClient';

/** Fires Netcore's `screen_view` event every time this screen gains focus —
 * the RN equivalent of the Ionic app's imperative `setScreenName()` call in
 * each page component, but automatic (no call site can forget it) via
 * `useFocusEffect`, which re-fires on every focus (initial mount AND
 * returning via back-navigation), matching how a user actually re-views a
 * screen in a stack-based nav.
 *
 * Pass `null` when the screen has nothing meaningful to report yet — e.g. a
 * bare redirect that renders no UI of its own — so no `screen_view` fires for
 * a frame the user never actually sees. */
export function useScreenTracking(screenName: string | null): void {
  useFocusEffect(
    useCallback(() => {
      if (screenName) setScreenName(screenName);
    }, [screenName]),
  );
}

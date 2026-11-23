import { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * When a cart is empty, "back" should land the user on that cart's own home
 * tab instead of wherever they navigated here from (a menu/configure screen
 * that would just show this same empty cart again). Returns a `goHome`
 * callback for a custom header back arrow — wire it in alongside
 * `gestureEnabled: false` on the screen's `Stack.Screen` options while
 * `isEmpty` to also block iOS's swipe-back gesture (which has no
 * `BackHandler` equivalent — `gestureEnabled` is what covers it there).
 * Only installs the Android hardware-back listener while `isEmpty` is true —
 * a non-empty cart keeps the normal "go back to where you were" behavior.
 */
export function useEmptyCartHomeBack(isEmpty: boolean, tab: string): () => void {
  const router = useRouter();
  const goHome = () => router.replace({ pathname: '/(tabs)', params: { tab } });

  useEffect(() => {
    if (!isEmpty) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goHome();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmpty, tab]);

  return goHome;
}

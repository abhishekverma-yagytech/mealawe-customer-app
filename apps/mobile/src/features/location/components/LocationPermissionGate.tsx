import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, View, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { IconMapPinOff } from '@/components/ui/icons';
import { useAuthStore } from '@/store/authStore';
import { useColors } from '@/theme';

/**
 * Full-screen "location permission is off" blocking overlay — mounted once
 * at the app root (`_layout.tsx`) alongside `BiometricGate`, same pattern:
 * checks live OS permission state on mount and on every foreground resume
 * (so coming back from Settings after granting it clears the gate without
 * an app restart needed), and only while a session exists — never blocks
 * the login flow, only the app once the user is actually in it.
 *
 * No dismiss and no secondary "search a location" fallback on purpose
 * (unlike `LocationGate`) — Continue is the only way through, and it opens
 * this app's OS settings page directly rather than re-showing the in-app
 * permission dialog, since a second `requestForegroundPermissionsAsync`
 * call after a real denial is a no-op on both platforms (iOS never
 * re-prompts once denied; Android usually won't either). If the user backs
 * out of Settings without granting, this reappears the moment they're back
 * — there's no "don't ask again" escape hatch, by design.
 */
export function LocationPermissionGate() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [denied, setDenied] = useState(false);
  const appState = useRef(AppState.currentState);

  const checkPermission = useCallback(async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    setDenied(status !== Location.PermissionStatus.GRANTED);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    void checkPermission();
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const cameToForeground = /inactive|background/.test(appState.current) && next === 'active';
      appState.current = next;
      if (cameToForeground) void checkPermission();
    });
    return () => sub.remove();
  }, [isAuthenticated, checkPermission]);

  if (!isAuthenticated || !denied) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <View style={StyleSheet.absoluteFill} className="bg-black/50" />
      <View className="flex-1 justify-end">
        <View
          className="items-center gap-3 rounded-t-3xl bg-card px-6 pt-8"
          style={{ paddingBottom: insets.bottom + 20 }}>
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <IconMapPinOff size={28} color={colors.foreground} />
          </View>
          <AppText variant="h3" weight="black" className="text-center text-foreground">
            Location permission is off
          </AppText>
          <AppText variant="body" className="text-center text-muted-foreground">
            Please enable location permission for a better delivery experience
          </AppText>
          <View style={{ marginTop: 8, width: '100%' }}>
            <Button label="Continue" block onPress={() => Linking.openSettings()} />
          </View>
        </View>
      </View>
    </View>
  );
}

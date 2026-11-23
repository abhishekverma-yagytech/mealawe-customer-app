import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View, type AppStateStatus } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { IconBiometric } from '@/components/ui/icons';
import { useAuthStore } from '@/store/authStore';
import { palette } from '@/theme';

import { authenticateWithBiometricsAsync } from './biometricAuth';
import { useSecurityStore } from './useSecurityStore';

/**
 * Full-screen biometric lock overlay — mounted once at the app root
 * (`_layout.tsx`). Locks on cold start and on every foreground resume while
 * the setting is on, and only while a session actually exists — never blocks
 * the login flow, since there's nothing to protect there yet.
 */
export function BiometricGate() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const biometricLockEnabled = useSecurityStore((s) => s.biometricLockEnabled);
  const isLocked = useSecurityStore((s) => s.isLocked);
  const lock = useSecurityStore((s) => s.lock);
  const unlock = useSecurityStore((s) => s.unlock);
  const [authenticating, setAuthenticating] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const cameToForeground = /inactive|background/.test(appState.current) && next === 'active';
      appState.current = next;
      if (cameToForeground) lock();
    });
    return () => sub.remove();
  }, [lock]);

  const shouldBlock = isAuthenticated && biometricLockEnabled && isLocked;

  const tryUnlock = useCallback(async () => {
    setAuthenticating(true);
    try {
      const passed = await authenticateWithBiometricsAsync('Unlock Mealawe');
      if (passed) unlock();
    } finally {
      setAuthenticating(false);
    }
  }, [unlock]);

  // Auto-prompt the moment the gate engages, rather than making the user tap
  // "Unlock" first — the button below is the retry path if this prompt is
  // dismissed/cancelled, not the primary way in.
  useEffect(() => {
    if (shouldBlock) {
      void tryUnlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldBlock]);

  if (!shouldBlock) {
    return null;
  }

  return (
    <View
      style={StyleSheet.absoluteFill}
      className="items-center justify-center bg-background px-10"
      pointerEvents="auto">
      <IconBiometric size={48} color={palette.brand.green} />
      <AppText variant="title" className="mt-4 text-foreground">
        Mealawe is locked
      </AppText>
      <AppText variant="bodySm" className="mt-1 text-center text-muted-foreground">
        Unlock with Face ID / Touch ID to continue
      </AppText>
      <View style={{ marginTop: 20 }}>
        <Button label="Unlock" onPress={tryUnlock} loading={authenticating} disabled={authenticating} />
      </View>
    </View>
  );
}

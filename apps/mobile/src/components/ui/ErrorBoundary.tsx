import { View } from 'react-native';

import { AppText } from './AppText';
import { Button } from './Button';
import { IconComplaint } from './icons';
import { useColors } from '@/theme';

interface ErrorBoundaryProps {
  error: Error;
  retry: () => void;
}

/**
 * App-wide crash fallback. Exported as `ErrorBoundary` from `_layout.tsx` —
 * Expo Router's own convention (not a hand-rolled React class component):
 * exporting a component named exactly `ErrorBoundary` from a layout file
 * makes the router wrap that layout's whole subtree in a real error
 * boundary automatically, catching any render-time exception ANYWHERE in
 * the app instead of the default behavior (a hard crash — no boundary
 * existed anywhere in this app before this).
 *
 * `retry()` (from Expo Router) re-mounts the crashed subtree from scratch —
 * for most causes (a bad response shape, a stale cached value, a transient
 * network hiccup surfacing as a thrown error deep in a render) simply
 * trying again resolves it, without forcing a full app restart.
 *
 * No crash-reporting service (Sentry/Crashlytics/etc.) exists in this app
 * yet, so this only logs to console (same `__DEV__`-agnostic convention
 * already used for genuine errors elsewhere, e.g. httpClient.ts) — if one
 * is added later, report `error` here too.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const colors = useColors();
  console.error('[ErrorBoundary] Unhandled render error:', error);

  return (
    <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: colors.background }}>
      <IconComplaint size={40} color={colors.mutedForeground} />
      <AppText variant="h3" className="text-foreground" style={{ marginTop: 14, textAlign: 'center' }}>
        Something went wrong
      </AppText>
      <AppText variant="bodySm" className="text-muted-foreground" style={{ marginTop: 6, textAlign: 'center' }}>
        This screen hit an unexpected error. Your data is safe — try again, or go back and retry from there.
      </AppText>
      <Button label="Try again" onPress={retry} className="mt-5" />
    </View>
  );
}

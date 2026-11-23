import { useEffect } from 'react';
import { Redirect, Stack, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Linking, ScrollView, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { AccentIcon } from '@/components/ui/AccentIcon';
import { IconClock, IconHelp, IconPhone, IconUser } from '@/components/ui/icons';
import {
  useTrackingStore,
  useTrackingTargetStore,
  useOngoingTrackingNotification,
  TrackingMap,
} from '@/features/tracking';
import { ORDER_STEPS } from '@/features/orders';
import { palette, accentTint } from '@/theme';

export default function OrderTrackingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // The ETA pill's tinted background sits on top of `bg-card`, whose luminance
  // flips between light and dark mode — a single fixed text color can't hit
  // WCAG AA (4.5:1) against both, so pick a darker/lighter shade per scheme.
  const isDarkMode = useColorScheme() === 'dark';
  const etaPillTextColor = isDarkMode ? palette.primary[400] : palette.primary[700];
  const target = useTrackingTargetStore((s) => s.target);
  const start = useTrackingStore((s) => s.start);
  const stop = useTrackingStore((s) => s.stop);
  const runnerLocation = useTrackingStore((s) => s.runnerLocation);
  const routePath = useTrackingStore((s) => s.routePath);
  const etaText = useTrackingStore((s) => s.etaText);
  const status = useTrackingStore((s) => s.status);

  useEffect(() => {
    if (!target) return;
    start(target.params);
    return () => stop(target.params.orderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.params.orderId]);

  // This screen has no per-order lifecycle status of its own (only GPS
  // tracking `status`) — it's reached only during the out-for-delivery
  // stage, matching `order-detail.tsx`'s own `isOutForDeliveryStage` gate at
  // `statusStepIndex(...) === 4`. Reuse that fixed step position for the
  // notification's progress bar rather than inventing a new progress model.
  const OUT_FOR_DELIVERY_STEP = 4;
  const trackingProgress = (OUT_FOR_DELIVERY_STEP / (ORDER_STEPS.length - 1)) * 100;

  useOngoingTrackingNotification(target?.params.orderId, etaText, status, target?.runnerPhone, {
    statusText: status === 'loading' ? 'Locating your order…' : 'On the way',
    progress: trackingProgress,
  });

  if (!target) {
    return <Redirect href="/orders" />;
  }

  const activeRunnerLocation = runnerLocation ?? target.params.initialRunnerLocation ?? null;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Track order' }} />
      <StatusBar style="auto" />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 20 + insets.bottom, gap: 14 }}>
        <TrackingMap
          destination={target.params.destination}
          runnerLocation={activeRunnerLocation}
          routePath={routePath}
        />

        <View className="rounded-2xl border border-border bg-card p-4" style={{ gap: 12 }}>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3" style={{ flex: 1 }}>
              <AccentIcon icon={IconClock} tone="info" size={17} tileSize={36} />
              <View className="flex-1">
                <AppText variant="h3" className="text-foreground">
                  {status === 'loading' ? 'Locating your order…' : etaText ? 'On the way' : 'Preparing your order'}
                </AppText>
                <AppText variant="caption" className="text-muted-foreground">
                  {status === 'loading' ? 'Hang tight…' : 'We’ll notify you at every step'}
                </AppText>
              </View>
            </View>
            {etaText ? (
              <View
                className="rounded-xl px-3 py-2"
                style={{ backgroundColor: accentTint(palette.accent.veg, 0.14) }}>
                <AppText variant="label" style={{ color: etaPillTextColor }}>
                  {etaText}
                </AppText>
              </View>
            ) : null}
          </View>

          {target.runnerName ? (
            <View className="flex-row items-center gap-3 border-t border-border pt-3">
              <AccentIcon icon={IconUser} tone="reward" size={19} tileSize={40} />
              <View className="flex-1">
                <AppText variant="caption" className="text-muted-foreground">
                  Delivery partner
                </AppText>
                <AppText variant="body" className="text-foreground">
                  {target.runnerName}
                </AppText>
              </View>
              {target.runnerPhone ? (
                // Direct dial, not masked — no number-masking/virtual-number
                // library is wired up client- or server-side yet (Exotel is
                // provisioned server-side, but only for kitchen-reminder
                // calls, not customer<->rider bridging). Revisit once a
                // masked-calling endpoint exists.
                <Button
                  label="Call"
                  variant="outline"
                  size="sm"
                  leftIcon={<IconPhone size={16} color={palette.brand.green} />}
                  onPress={() => Linking.openURL(`tel:${target.runnerPhone}`).catch(() => {})}
                />
              ) : null}
            </View>
          ) : null}

          <Button
            label="Need help with this order?"
            variant="outline"
            block
            leftIcon={<IconHelp size={18} color={palette.brand.green} />}
            onPress={() => router.push('/help' as Href)}
          />
        </View>
      </ScrollView>
    </View>
  );
}

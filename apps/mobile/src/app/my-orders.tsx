import { Stack, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { AccentIcon } from '@/components/ui/AccentIcon';
import { IconChevronRight } from '@/components/ui/icons';
import { useVisibleOrderModes, type OrderModeKey } from '@/features/home/useVisibleOrderModes';
import { ORDER_HISTORY_CATEGORIES, type OrderHistoryCategoryKey } from '@/features/orders/historyCategories';
import { useScreenTracking } from '@/services/netcore';
import { shadow, useColors } from '@/theme';

/** Maps a history category to the `useVisibleOrderModes` key that gates it —
 * `marketplace` (Navmool) is deliberately absent: Home hides that shortcut
 * unconditionally today (not per-cluster-config, see `(tabs)/index.tsx`'s
 * commented-out Navmool tab), so this hub leaves it always visible too,
 * matching that same status quo rather than inventing new gating for it. */
const GATED_BY: Partial<Record<OrderHistoryCategoryKey, OrderModeKey>> = {
  subscription: 'subscription',
  dineIn: 'dinein',
  onDemand: 'ondemand',
  bulk: 'bulk',
};

/** Hub of every order-history category — mirrors the Ionic app's `my-orders` screen. */
export default function MyOrdersScreen() {
  useScreenTracking('my_orders');

  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const visibleOrderModes = useVisibleOrderModes();

  // Only offer the order-history categories this cluster actually enables —
  // same rules Home's own order-mode tabs use (see `useVisibleOrderModes`),
  // so e.g. a cluster with Bulk turned off doesn't dangle a "Bulk Orders"
  // entry here that Home never even offered placing an order through.
  const visibleCategories = useMemo(
    () => ORDER_HISTORY_CATEGORIES.filter((c) => {
      const gate = GATED_BY[c.key];
      return !gate || visibleOrderModes.has(gate);
    }),
    [visibleOrderModes],
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'My orders' }} />
      <StatusBar style="auto" />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 20 + insets.bottom, gap: 12 }}>
        <AppText variant="body" className="text-muted-foreground">
          Track deliveries, review past orders
        </AppText>

        {visibleCategories.map((category) => {
          const isPrimary = category.key === 'subscription';
          const target = isPrimary ? ('/orders' as Href) : (`/order-history/${category.key}` as Href);
          return (
            <Pressable
              key={category.key}
              onPress={() => router.push(target)}
              accessibilityRole="button"
              style={shadow.card}
              className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3.5 active:opacity-80">
              <AccentIcon icon={category.icon} tone={category.tone} size={20} tileSize={44} />
              <AppText variant="label" className="flex-1 text-foreground">
                {category.title}
              </AppText>
              <IconChevronRight size={18} color={colors.mutedForeground} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

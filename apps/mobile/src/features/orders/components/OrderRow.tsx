import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconChevronRight, IconUtensils } from '@/components/ui/icons';
import { palette, accentTint, shadow, useColors } from '@/theme';

import { statusLabel, statusTone } from '../orderStatus';
import type { OrderSummary } from '../types';

interface OrderRowProps {
  order: OrderSummary;
  /** Shows a "Track" affordance instead of a plain chevron (ongoing orders only). */
  tracked?: boolean;
  /** Categories without a detail screen render read-only — no press feedback, no chevron. */
  interactive?: boolean;
  onPress?: () => void;
}

/** One row in any order list — shared by the subscription list and every category history screen. */
export function OrderRow({ order, tracked, interactive = true, onPress }: OrderRowProps) {
  const colors = useColors();
  const toneColor = palette.accent[statusTone(order.status)];

  return (
    <Pressable
      onPress={interactive ? onPress : undefined}
      disabled={!interactive}
      accessibilityRole={interactive ? 'button' : undefined}
      style={shadow.card}
      className={`rounded-2xl border border-border bg-card p-3 ${interactive ? 'active:opacity-80' : ''}`}>
      <View className="flex-row gap-3">
        <View style={{ width: 64, height: 64, borderRadius: 14, overflow: 'hidden' }}>
          {order.imageUrl ? (
            <Image source={{ uri: order.imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: accentTint(palette.accent.food, 0.14),
              }}>
              <IconUtensils size={22} color={palette.accent.food} />
            </View>
          )}
        </View>
        <View className="flex-1">
          <AppText variant="title" numberOfLines={1} className="text-foreground">
            {order.title}
          </AppText>
          {order.subtitle ? (
            <AppText variant="bodySm" numberOfLines={1} className="text-muted-foreground">
              {order.subtitle}
            </AppText>
          ) : null}
          {order.orderNo ? (
            <AppText variant="caption" numberOfLines={1} className="text-muted-foreground">
              Order #{order.orderNo}
            </AppText>
          ) : null}
          {/* status pill — label carries meaning (not colour-only) */}
          <View
            className="mt-1.5 flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1"
            style={{ backgroundColor: accentTint(toneColor, 0.12) }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: toneColor }} />
            <AppText variant="caption" style={{ color: toneColor }}>
              {statusLabel(order.status)}
            </AppText>
          </View>
        </View>
        <View className="items-end justify-between">
          {order.amount > 0 ? (
            <AppText variant="label" className="text-foreground">
              ₹{order.amount}
            </AppText>
          ) : (
            <View />
          )}
          {tracked ? (
            <View className="flex-row items-center gap-0.5">
              <AppText variant="caption" className="text-primary">
                Track
              </AppText>
              <IconChevronRight size={14} color={palette.brand.green} />
            </View>
          ) : interactive ? (
            <IconChevronRight size={18} color={colors.mutedForeground} />
          ) : (
            <View />
          )}
        </View>
      </View>
    </Pressable>
  );
}

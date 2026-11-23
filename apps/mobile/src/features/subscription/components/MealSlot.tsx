import type { ComponentType } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { IconProps } from '@/components/ui/icons';
import { accentTint, palette, useColors, BORDER_WIDTH, RADIUS } from '@/theme';

interface MealSlotProps {
  label: string;
  time: string;
  tone: string;
  Icon: ComponentType<IconProps>;
  active: boolean;
  onPress: () => void;
  /** Vertical icon-over-text layout for tight multi-tile rows (the
   * Lunch/Dinner/Both trio) — the default horizontal layout needs more width
   * per tile than 3-across leaves, which let text spill outside the card. */
  compact?: boolean;
}

/**
 * One meal-time selection tile (Lunch / Dinner / Both) — a single-select
 * pill, so exactly one is ever active at a time and the user always sees
 * precisely which meal(s) they're getting, rather than inferring it from two
 * independent checkboxes. Lives on the Plan screen (`subscription-plan.tsx`,
 * "Choose your plan" — moved here from the old Configure-screen picker so
 * meal time is decided alongside the package/duration, not after). Breakfast
 * categories render a single always-`active`, non-`compact` tile instead
 * (nothing to choose between, and the full row width to itself).
 */
export function MealSlot({ label, time, tone, Icon, active, onPress, compact = false }: MealSlotProps) {
  const colors = useColors();
  const cardStyle = {
    borderRadius: RADIUS.md,
    borderWidth: active ? BORDER_WIDTH.emphasis : BORDER_WIDTH.hairline,
    borderColor: active ? palette.brand.green : colors.border,
    backgroundColor: active ? accentTint(palette.brand.green, 0.08) : colors.card,
  };

  if (compact) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        className="flex-1 items-center px-1 py-3 active:opacity-80"
        style={[cardStyle, { gap: 6 }]}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            backgroundColor: accentTint(tone),
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon size={15} color={tone} />
        </View>
        <View style={{ width: '100%', alignItems: 'center' }}>
          <AppText variant="label" className="text-foreground" numberOfLines={1}>
            {label}
          </AppText>
          <AppText
            variant="caption"
            className="text-muted-foreground"
            numberOfLines={1}
            style={{ textAlign: 'center' }}>
            {time}
          </AppText>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="flex-1 flex-row items-center gap-3 px-4 py-3.5 active:opacity-80"
      style={cardStyle}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: accentTint(tone),
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Icon size={18} color={tone} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="label" className="text-foreground" numberOfLines={1}>
          {label}
        </AppText>
        <AppText variant="caption" className="text-muted-foreground" numberOfLines={1}>
          {time}
        </AppText>
      </View>
    </Pressable>
  );
}

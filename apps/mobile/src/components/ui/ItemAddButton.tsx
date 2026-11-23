import { Pressable } from 'react-native';

import { palette, shadow, useColors, type AccentTone } from '@/theme';

import { AppText } from './AppText';

interface ItemAddButtonProps {
  /** Accent role — Bulk passes `"plan"`, On Demand passes `"info"` (Order-Mode CTA Rule). */
  tone: AccentTone;
  accessibilityLabel: string;
  onPress: () => void;
}

/**
 * Bordered "ADD" pill shown before an item enters the cart — the first stage
 * of the ADD → `<QuantityStepper>` handoff shared by the Bulk and On-Demand
 * menu item cards. Extracted from the two near-identical inline blocks that
 * used to live in `BulkMenuItemCard`/`OnDemandItemCard` so the two verticals
 * can't drift out of sync.
 */
export function ItemAddButton({ tone, accessibilityLabel, onPress }: ItemAddButtonProps) {
  const colors = useColors();
  const color = palette.accent[tone];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        shadow.card,
        {
          backgroundColor: colors.card,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: color,
          paddingHorizontal: 20,
          paddingVertical: 9,
        },
      ]}
      className="active:opacity-70">
      <AppText variant="label" style={{ color }}>
        ADD
      </AppText>
    </Pressable>
  );
}

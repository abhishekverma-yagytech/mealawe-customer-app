import { Pressable } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { palette, accentTint, useColors, BORDER_WIDTH } from '@/theme';

/** One filter pill — shared by `/orders.tsx`'s status filter and
 * `/order-history/[category].tsx`'s generic version of the same UI. */
export function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="active:opacity-70"
      style={{
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderWidth: BORDER_WIDTH.hairline,
        borderColor: active ? palette.brand.green : colors.border,
        backgroundColor: active ? accentTint(palette.brand.green, 0.1) : colors.card,
      }}>
      <AppText variant="bodySm" style={{ color: active ? palette.brand.green : colors.foreground }}>
        {label}
      </AppText>
    </Pressable>
  );
}

import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { IconCart } from '@/components/ui/icons';
import { palette } from '@/theme';

interface BulkCartFooterProps {
  itemCount: number;
  subTotal: number;
  onPress: () => void;
}

/** Sticky "N items · ₹total · View cart" bar shown once the bulk menu cart is
 * non-empty. Tinted Plan Violet -- Bulk's own tab accent -- per the
 * Order-Mode CTA Rule, not green (green is Subscription's, not every
 * vertical's). */
export function BulkCartFooter({ itemCount, subTotal, onPress }: BulkCartFooterProps) {
  const insets = useSafeAreaInsets();
  if (itemCount === 0) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="absolute inset-x-4 flex-row items-center justify-between rounded-2xl px-5 py-4 active:opacity-90"
      style={{
        bottom: 16 + insets.bottom,
        backgroundColor: palette.accent.plan,
        shadowColor: palette.accent.plan,
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      }}>
      <View className="flex-row items-center gap-2">
        <IconCart size={18} color="#fff" />
        <AppText variant="label" className="text-white">
          {itemCount} item{itemCount > 1 ? 's' : ''} · ₹{subTotal}
        </AppText>
      </View>
      <AppText variant="label" className="text-white">
        View cart →
      </AppText>
    </Pressable>
  );
}

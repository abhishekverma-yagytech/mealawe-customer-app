import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { IconCart } from '@/components/ui/icons';
import { palette } from '@/theme';

interface OnDemandCartFooterProps {
  itemCount: number;
  subTotal: number;
  onPress: () => void;
}

/** Sticky "N items · ₹total · View cart" bar — identical shape to
 * BulkCartFooter, own copy so each vertical's footer stays independently
 * editable. Tinted Delivery Teal -- On-Demand's own tab accent -- per the
 * Order-Mode CTA Rule. */
export function OnDemandCartFooter({ itemCount, subTotal, onPress }: OnDemandCartFooterProps) {
  const insets = useSafeAreaInsets();
  if (itemCount === 0) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="absolute inset-x-4 flex-row items-center justify-between rounded-2xl px-5 py-4 active:opacity-90"
      style={{
        bottom: 16 + insets.bottom,
        backgroundColor: palette.accent.info,
        shadowColor: palette.accent.info,
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

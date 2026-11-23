import { View } from 'react-native';

import { AppText } from './AppText';
import { palette } from '@/theme';
import { formatINR } from '@/utils/currency';

interface BillRowProps {
  label: string;
  amount: number;
  /** Pre-discount amount to show struck through — omit when this line has no discount. */
  original?: number;
  /** Green + a leading "- " — for discount/credit lines that reduce the total. */
  positive?: boolean;
}

/**
 * One line in an itemized bill — label, optional struck-through original,
 * and the amount (or "FREE" when a discounted line nets to zero). Shared by
 * every real bill breakdown in the app (cart checkout, Manage Subscription's
 * Bill popup) so they never drift into two different-looking price tables.
 */
export function BillRow({ label, amount, original, positive }: BillRowProps) {
  const free = original !== undefined && amount === 0 && original > 0;
  return (
    <View className="flex-row items-center justify-between">
      <AppText variant="body" className="text-muted-foreground">
        {label}
      </AppText>
      <View className="flex-row items-center gap-2">
        {original !== undefined && original > amount ? (
          <AppText
            variant="caption"
            className="text-muted-foreground"
            style={{ textDecorationLine: 'line-through' }}
          >
            {formatINR(original)}
          </AppText>
        ) : null}
        {free ? (
          <AppText variant="label" style={{ color: palette.accent.veg }}>
            FREE
          </AppText>
        ) : (
          <AppText
            variant="body"
            className={positive ? undefined : 'text-foreground'}
            style={positive ? { color: palette.accent.veg } : undefined}>
            {positive ? '- ' : ''}
            {formatINR(Math.abs(amount))}
          </AppText>
        )}
      </View>
    </View>
  );
}

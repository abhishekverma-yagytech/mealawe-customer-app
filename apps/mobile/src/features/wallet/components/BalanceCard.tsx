import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Skeleton } from '@/components/ui/Skeleton';
import { IconChevronRight, IconCoins, IconWallet } from '@/components/ui/icons';
import { palette, shadow } from '@/theme';

interface BalanceCardProps {
  kind: 'wallet' | 'cashback';
  /** Formatted amount without the ₹ (e.g. "120.00" or "50"). */
  amount: string | number;
  /** Show a skeleton in place of the amount while balances load. */
  loading?: boolean;
  onPress: () => void;
}

/** Compact tappable balance tile for Wallet / Cashback (used on the profile). */
export function BalanceCard({ kind, amount, loading = false, onPress }: BalanceCardProps) {
  const isWallet = kind === 'wallet';
  const label = isWallet ? 'Mealawe Money' : 'Cashback';
  const Icon = isWallet ? IconWallet : IconCoins;
  const tint = isWallet ? palette.accent.reward : palette.accent.rating;

  return (
    <Pressable
      onPress={onPress}
      style={shadow.card}
      className="flex-1 rounded-2xl border border-border bg-card p-3.5 active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={`${label} balance`}>
      <View className="flex-row items-center justify-between">
        <View
          className="h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: `${tint}22` }}>
          <Icon size={17} color={tint} />
        </View>
        <IconChevronRight size={18} color={palette.neutral.gray400} />
      </View>
      <AppText variant="overline" className="mt-2 text-muted-foreground">
        {label}
      </AppText>
      {loading ? (
        <Skeleton width={64} height={18} style={{ marginTop: 4 }} />
      ) : (
        <AppText variant="label" className="text-foreground">
          ₹{amount}
        </AppText>
      )}
    </Pressable>
  );
}

import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconMinus, IconPlus, IconWallet } from '@/components/ui/icons';
import {
  asArray,
  formatTxnDate,
  isCredit,
  moneyWalletBalanceOf,
  PER_PAGE,
  walletApi,
  type WalletTxn,
} from '@/features/wallet';
import { useScreenTracking } from '@/services/netcore';
import { accentTint, palette } from '@/theme';
import { useAuthStore } from '@/store';

export default function WalletScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  useScreenTracking(profile?._id ? 'wallet' : 'wallet_gate');

  const [balance, setBalance] = useState('0.00');
  const [txns, setTxns] = useState<WalletTxn[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [pageOver, setPageOver] = useState(false);

  const loadHistory = useCallback(
    async (p: number) => {
      if (!profile?._id) return;
      setLoading(true);
      try {
        const raw = await walletApi.getWalletHistory(profile._id, p);
        const rows = asArray<WalletTxn>(raw);
        setTxns((prev) => (p === 1 ? rows : [...prev, ...rows]));
        setPageOver(rows.length < PER_PAGE);
      } catch {
        setPageOver(true);
      } finally {
        setLoading(false);
      }
    },
    [profile?._id],
  );

  useEffect(() => {
    if (!profile?._id) return;
    walletApi
      .getWalletBalance(profile._id)
      .then((res) => {
        const v = moneyWalletBalanceOf(res);
        setBalance(v > 0 ? v.toFixed(2) : '0.00');
      })
      .catch(() => setBalance('0.00'));
    void loadHistory(1);
  }, [profile?._id, loadHistory]);

  function loadMore() {
    const next = page + 1;
    setPage(next);
    void loadHistory(next);
  }

  if (!profile?._id) {
    return <LoginGate router={router} title="Mealawe Money" />;
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Mealawe Money' }} />
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <LinearGradient
          colors={[palette.brand.green, palette.brand.greenDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 20, padding: 20 }}>
          <View className="flex-row items-center gap-2">
            <IconWallet size={18} color="#fff" />
            <AppText variant="label" className="text-white/90">
              Mealawe Money
            </AppText>
          </View>
          <AppText variant="display" className="mt-2 text-white">
            ₹{balance}
          </AppText>
          <AppText variant="bodySm" className="text-white/80">
            Usable on your orders at checkout
          </AppText>
        </LinearGradient>

        <AppText variant="title" className="text-foreground">
          Transactions
        </AppText>

        {txns.length === 0 && !loading && (
          <View className="items-center gap-2 py-6">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-muted">
              <IconWallet size={28} color={palette.brand.green} />
            </View>
            <AppText variant="h3" className="text-center text-foreground">
              No transactions yet
            </AppText>
            <AppText variant="body" className="text-center text-muted-foreground">
              Your Mealawe Money activity will show up here.
            </AppText>
          </View>
        )}

        {txns.map((txn, i) => {
          const credit = isCredit(txn);
          // AccentIcon's tone is reserved for the Modern Fresh accent roles (offer, plan, …) —
          // credit/debit is a status distinction, so tint it from `status` directly instead.
          const directionColor = credit ? palette.status.success : palette.status.danger;
          return (
            <View key={i} className="flex-row items-center gap-3 border-b border-border pb-3">
              <View
                className="h-9 w-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: accentTint(directionColor) }}>
                {credit ? (
                  <IconPlus size={18} color={directionColor} />
                ) : (
                  <IconMinus size={18} color={directionColor} />
                )}
              </View>
              <View className="flex-1 pr-3">
                <AppText variant="label" className="text-foreground" numberOfLines={1}>
                  {txn.remark || (credit ? 'Credited' : 'Debited')}
                </AppText>
                <AppText variant="caption" className="text-muted-foreground">
                  {formatTxnDate(txn.created_at)}
                </AppText>
              </View>
              <AppText variant="title" className={credit ? 'text-success' : 'text-danger'}>
                {credit ? '+' : '−'}₹{txn.transaction_points ?? 0}
              </AppText>
            </View>
          );
        })}

        {loading && <ActivityIndicator color={palette.brand.green} />}

        {!pageOver && txns.length > 0 && !loading && (
          <Pressable
            onPress={loadMore}
            className="items-center rounded-2xl border border-border py-3 active:opacity-80">
            <AppText variant="label" className="text-primary">
              Load more
            </AppText>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function LoginGate({ router, title }: { router: ReturnType<typeof useRouter>; title: string }) {
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title }} />
      <StatusBar style="auto" />
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <AppText variant="h3" className="text-center text-foreground">
          Log in to view your {title}
        </AppText>
        <Pressable
          onPress={() => router.replace('/login')}
          className="rounded-2xl bg-primary px-6 py-3 active:opacity-80">
          <AppText variant="label" className="text-primary-foreground">
            Login
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

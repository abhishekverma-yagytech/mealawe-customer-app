import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { AccentIcon } from '@/components/ui/AccentIcon';
import { IconCoins } from '@/components/ui/icons';
import {
  asArray,
  cashbackBalanceOf,
  formatTxnDate,
  isExpired,
  walletApi,
  type CashbackTxn,
} from '@/features/wallet';
import { useScreenTracking } from '@/services/netcore';
import { mixHex, palette } from '@/theme';
import { useAuthStore } from '@/store';

export default function CashbackScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  useScreenTracking(profile?._id ? 'cashback' : 'cashback_gate');

  const [balance, setBalance] = useState(0);
  const [txns, setTxns] = useState<CashbackTxn[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [pageOver, setPageOver] = useState(false);

  const loadHistory = useCallback(
    async (p: number) => {
      if (!profile?._id) return;
      setLoading(true);
      try {
        const raw = await walletApi.getCashbackHistory(profile._id, p);
        const rows = asArray<CashbackTxn>(raw);
        setTxns((prev) => (p === 1 ? rows : [...prev, ...rows]));
        setPageOver(rows.length === 0);
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
      .getCashbackBalance(profile._id)
      .then((res) => {
        setBalance(Math.round(cashbackBalanceOf(res) * 100) / 100);
      })
      .catch(() => setBalance(0));
    void loadHistory(1);
  }, [profile?._id, loadHistory]);

  function loadMore() {
    const next = page + 1;
    setPage(next);
    void loadHistory(next);
  }

  if (!profile?._id) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ headerShown: true, title: 'Cashback' }} />
        <StatusBar style="auto" />
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <AppText variant="h3" className="text-center text-foreground">
            Log in to view your Cashback
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

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Cashback' }} />
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <LinearGradient
          colors={[
            palette.accent.reward,
            mixHex(palette.accent.reward, palette.brand.teal, 0.5),
            palette.brand.teal,
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 20, padding: 20 }}>
          <View className="flex-row items-center gap-2">
            <IconCoins size={18} color={palette.neutral.white} />
            <AppText variant="label" className="text-white/90">
              Mealawe Cashback
            </AppText>
          </View>
          <AppText variant="display" className="mt-2 text-white">
            ₹{balance}
          </AppText>
          <AppText variant="bodySm" className="text-white/80">
            Redeem on your next order · 1 point = ₹1
          </AppText>
        </LinearGradient>

        <View>
          <AppText variant="title" className="mb-2 text-foreground">
            History
          </AppText>

          {txns.length === 0 && !loading && (
            <AppText variant="body" className="text-muted-foreground">
              No cashback yet — order to start earning.
            </AppText>
          )}

          <View style={{ gap: 16 }}>
            {txns.map((txn, i) => (
              <View key={i} className="flex-row items-center gap-3 border-b border-border pb-3">
                <AccentIcon icon={IconCoins} tone="reward" size={18} tileSize={36} />
                <View className="flex-1">
                  <View className="flex-row items-center justify-between">
                    <AppText
                      variant="label"
                      className="flex-1 pr-3 text-foreground"
                      numberOfLines={1}>
                      {txn.title || txn.remark || 'Cashback'}
                    </AppText>
                    <AppText variant="title" className="text-success">
                      +₹{txn.cashbackPoints ?? 0}
                    </AppText>
                  </View>
                  {!!txn.expiryOn && (
                    <AppText variant="caption" className="text-muted-foreground">
                      {isExpired(txn) ? 'Expired' : 'Expires'} {formatTxnDate(txn.expiryOn)}
                    </AppText>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>

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

import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { FaqAccordion } from '@/components/ui/FaqAccordion';
import { IconCopy, IconGift, IconShare2 } from '@/components/ui/icons';
import { REFERRAL_FAQS, REFERRAL_MIN_ORDER, REFERRAL_REWARD, shareReferral, useReferralCode } from '@/features/referral';
import { useScreenTracking } from '@/services/netcore';
import { palette, shadow, RADIUS } from '@/theme';

const COPIED_RESET_MS = 2000;

// Same share-and-win creative MealaweUserApp's Refer & Earn screen uses
// (assets/banner/Sharenwinbanner.webp) — ported in verbatim, not redrawn.
const REFERRAL_BANNER = require('../assets/images/referral/Sharenwinbanner.webp');
const BANNER_ASPECT_RATIO = 998 / 446;

export default function ReferEarnScreen() {
  useScreenTracking('refer_earn');

  const { code, generating } = useReferralCode();
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Refer & Earn' }} />
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
        <Image
          source={REFERRAL_BANNER}
          style={{ width: '100%', aspectRatio: BANNER_ASPECT_RATIO, borderRadius: RADIUS.lg }}
          contentFit="cover"
        />

        {/* Hero */}
        <View className="gap-2 p-5" style={{ backgroundColor: palette.brand.teal, borderRadius: RADIUS.lg }}>
          <View
            className="h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.16)' }}>
            <IconGift size={22} color="#ffffff" />
          </View>
          <AppText variant="h2" weight="black" className="text-white" style={{ marginTop: 6 }}>
            Invite friends, earn ₹{REFERRAL_REWARD}
          </AppText>
          <AppText variant="body" style={{ color: 'rgba(255,255,255,0.82)' }}>
            When a friend places their first order of ₹{REFERRAL_MIN_ORDER} or more, you both get ₹{REFERRAL_REWARD}{' '}
            cashback. Unlimited invites, no cash exchange.
          </AppText>
        </View>

        {/* Code + share */}
        <View className="gap-3 rounded-2xl border border-border bg-card p-4" style={shadow.card}>
          <AppText variant="label" className="text-foreground">
            Your referral code
          </AppText>
          <Pressable
            onPress={copyCode}
            disabled={!code}
            className="flex-row items-center justify-between rounded-xl bg-muted px-4 py-3.5 active:opacity-80">
            {generating ? (
              <ActivityIndicator color={palette.brand.green} />
            ) : (
              <AppText variant="h3" weight="bold" className="text-foreground">
                {code ?? '—'}
              </AppText>
            )}
            <View className="flex-row items-center gap-1.5">
              <IconCopy size={16} color={palette.brand.green} />
              <AppText variant="label" className="text-primary">
                {copied ? 'Copied!' : 'Copy'}
              </AppText>
            </View>
          </Pressable>
          <Button
            label="Share Now"
            block
            disabled={!code}
            leftIcon={<IconShare2 size={18} color="#ffffff" />}
            onPress={() => code && shareReferral(code)}
          />
        </View>

        {/* FAQ */}
        <AppText variant="title" className="mt-2 text-foreground">
          Frequently asked
        </AppText>
        <FaqAccordion items={REFERRAL_FAQS} />
      </ScrollView>
    </View>
  );
}

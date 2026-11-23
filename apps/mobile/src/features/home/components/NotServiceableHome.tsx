import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { IconArrowRight, IconFeedback, IconHelp, IconMapPin, IconReceipt } from '@/components/ui/icons';
import { ProfileMenuRow } from '@/features/profile/components/ProfileMenuRow';
import { accentTint, palette } from '@/theme';

const HEADLINE_LOCKUP = require('../../../assets/images/not-serviceable/headline.jpg');
const HEADLINE_ASPECT_RATIO = 1872 / 1248;
const HERO_ILLUSTRATION = require('../../../assets/images/not-serviceable/hero.png');
const HERO_ASPECT_RATIO = 2048 / 1152;
const FOOTER_BANNER = require('../../../assets/images/not-serviceable/footer.jpg');
const FOOTER_ASPECT_RATIO = 1872 / 1248;

interface NotServiceableHomeProps {
  addressLabel: string;
  onPressAddress: () => void;
  onOrders: () => void;
  onHelp: () => void;
  onFeedback: () => void;
  /** Forces a fresh GPS fix + saved-address re-match (not just a re-run of
   * cluster detection against a possibly-stale point) — the escape hatch for
   * a user who believes this page is wrong, e.g. their current address's
   * coordinate was stale when it was originally resolved. Also what the
   * "Bring Mealawe Here" CTA re-runs, since there's no separate
   * request-service backend flow yet — re-checking coverage is the closest
   * real action that button name can promise today. */
  onRetry: () => Promise<unknown>;
  /** Fires the moment the CTA is tapped, before `onRetry` runs — lets the
   * caller show an on-tap acknowledgement (e.g. a "Request received!" nudge)
   * from a level that outlives this component. `onRetry` re-runs cluster
   * detection, which flips the parent's `detecting` flag true almost
   * immediately — since that flag gates whether this component renders at
   * all, `onRetry` can unmount `NotServiceableHome` (and anything overlaid
   * on it) within milliseconds of the tap. A nudge rendered *inside* this
   * component was found to get cut off mid-animation for exactly that
   * reason; the caller renders it instead, one level up, where it survives. */
  onRequestSent: () => void;
}

/**
 * Full-page replacement for the home top section + feed while the active
 * address falls outside every serviceable cluster — a focused "we're not
 * here yet" card instead of the normal (unusable) hero/order-mode-tabs/feed.
 * No top address/wallet/profile bar (unlike the regular Home) — the address
 * is surfaced inline in the pill above the CTA instead, with its own
 * "Change" affordance, so this page reads as one single-purpose screen top
 * to bottom, matching the brand reference mock. Copy intentionally echoes
 * `OutsideServiceAreaBanner`'s wording for consistency between the two
 * surfaces.
 */
export function NotServiceableHome({
  addressLabel,
  onPressAddress,
  onOrders,
  onHelp,
  onFeedback,
  onRetry,
  onRequestSent,
}: NotServiceableHomeProps) {
  const insets = useSafeAreaInsets();
  const [retrying, setRetrying] = useState(false);

  async function handleRetry(): Promise<void> {
    onRequestSent();
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 20 }}>
        <View className="gap-3 px-6">
          <Image
            accessibilityLabel="Ghar Ka Khana hasn't reached here yet"
            source={HEADLINE_LOCKUP}
            contentFit="contain"
            style={{ width: '100%', aspectRatio: HEADLINE_ASPECT_RATIO }}
          />
          <AppText variant="body" className="text-center text-muted-foreground">
            We&apos;re not serving your neighbourhood right now, but we&apos;re expanding fast.
          </AppText>
        </View>

        <Image
          source={HERO_ILLUSTRATION}
          contentFit="contain"
          style={{ width: '100%', aspectRatio: HERO_ASPECT_RATIO, marginTop: 8 }}
        />

        <Pressable
          onPress={onPressAddress}
          accessibilityRole="button"
          accessibilityLabel="Change delivery address"
          className="mx-6 mt-6 flex-row items-center gap-2.5 rounded-2xl px-4 py-3.5 active:opacity-80"
          style={{ backgroundColor: accentTint(palette.brand.green, 0.08) }}>
          <IconMapPin size={18} color={palette.brand.green} />
          <AppText variant="bodySm" className="flex-1 text-foreground" numberOfLines={2}>
            {addressLabel}
          </AppText>
          <AppText variant="label" weight="bold" style={{ color: palette.brand.green, textDecorationLine: 'underline' }}>
            Change
          </AppText>
        </Pressable>

        <View className="mx-6 mt-4">
          <Button
            label="Bring Mealawe Here"
            block
            loading={retrying}
            disabled={retrying}
            rightIcon={!retrying ? <IconArrowRight size={18} color="#ffffff" /> : undefined}
            onPress={handleRetry}
          />
        </View>

        <View className="gap-3 px-6 pb-2 pt-10" style={{ gap: 12 }}>
          <ProfileMenuRow icon={IconHelp} label="Help & Support" tone="info" onPress={onHelp} />
        </View>

        <View style={{ marginTop: 28, paddingBottom: insets.bottom }}>
          <Image
            source={FOOTER_BANNER}
            contentFit="cover"
            style={{ width: '100%', aspectRatio: FOOTER_ASPECT_RATIO }}
          />
        </View>
      </ScrollView>
    </View>
  );
}

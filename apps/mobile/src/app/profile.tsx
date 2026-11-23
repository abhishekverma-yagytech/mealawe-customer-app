import Constants from 'expo-constants';
import { Stack, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import type { LucideIcon } from 'lucide-react-native';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toggle } from '@/components/ui/Toggle';
import {
  IconBiometric,
  IconChevronRight,
  IconFeedback,
  IconGift,
  IconHelp,
  IconLeaf,
  IconLogIn,
  IconLogOut,
  IconMapPin,
  IconMoon,
  IconReceipt,
  IconStar,
} from '@/components/ui/icons';
import { authApi } from '@/features/auth';
import { ProfileHeader, ProfileMenuRow, ThemeSheet } from '@/features/profile';
import { REFERRAL_REWARD } from '@/features/referral';
import { openStoreListingForReviewAsync } from '@/features/reviews';
import { useSecurityStore, type BiometricUnavailableReason } from '@/features/security';
import { BalanceCard, useBalances } from '@/features/wallet';
import { setCrashlyticsUser } from '@/services/crashlytics';
import { logout as logoutNetcore, track, useScreenTracking } from '@/services/netcore';
import { unregisterDeviceToken } from '@/services/push';
import { resetCartStores, useAuthStore, useThemeStore, useVegModeStore } from '@/store';
import { palette, shadow, RADIUS, type AccentTone } from '@/theme';

const BIOMETRIC_FAILURE_MESSAGE: Record<BiometricUnavailableReason | 'authentication_failed', string> = {
  no_hardware: 'This device doesn’t support Face ID, Touch ID, or fingerprint unlock.',
  not_enrolled: 'Set up Face ID, Touch ID, or a fingerprint in your device settings first, then try again.',
  authentication_failed: 'Could not verify your biometrics — please try again.',
};

const THEME_LABEL: Record<string, string> = { system: 'System default', light: 'Light', dark: 'Dark' };

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export default function ProfileScreen() {
  useScreenTracking('profile');

  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const clearSession = useAuthStore((s) => s.clearSession);
  const themePreference = useThemeStore((s) => s.preference);
  const vegOnly = useVegModeStore((s) => s.vegOnly);
  const toggleVegOnly = useVegModeStore((s) => s.toggle);
  const biometricLockEnabled = useSecurityStore((s) => s.biometricLockEnabled);
  const setBiometricLockEnabled = useSecurityStore((s) => s.setBiometricLockEnabled);
  const { wallet, cashback, loading: balancesLoading } = useBalances();
  const [signOutVisible, setSignOutVisible] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const themeSheetRef = useRef<BottomSheetModal>(null);
  const signingOutRef = useRef(false);

  const toggleBiometricLock = async (): Promise<void> => {
    if (biometricBusy) return;
    setBiometricBusy(true);
    try {
      const result = await setBiometricLockEnabled(!biometricLockEnabled);
      if (!result.ok) {
        Alert.alert('Could not enable biometric lock', BIOMETRIC_FAILURE_MESSAGE[result.reason]);
      }
    } finally {
      setBiometricBusy(false);
    }
  };

  // Every menu action except "Appearance" (no session needed) and the
  // guest-only "Sign in" row itself needs a session — wraps an action so a
  // guest sees the same "Sign in required" prompt `subscription-detail.tsx`
  // already uses (see its own `choosePlan`), instead of the row silently
  // navigating somewhere that'll just bounce them right back out.
  function guardAuth(action: () => void): () => void {
    return () => {
      if (!isAuthenticated) {
        Alert.alert('Sign in required', 'Please sign in to continue.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign in', onPress: () => router.push('/login') },
        ]);
        return;
      }
      action();
    };
  }

  async function doSignOut() {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setSignOutVisible(false);
    if (profile) {
      track('user_logout', { user_id: profile._id });
      await unregisterDeviceToken(profile._id);
    }
    try {
      await authApi.logout();
    } catch {
      // clear the local session regardless of network errors
    }
    resetCartStores();
    await clearSession();
    setCrashlyticsUser(null);
    logoutNetcore();
    // Clear the whole nav stack so Back can't return to authenticated screens.
    if (router.canDismiss()) {
      router.dismissAll();
    }
    router.replace('/login');
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <ProfileHeader
          profile={profile}
          title="Profile"
          onEdit={guardAuth(() => router.push('/profile-edit'))}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        />

        <View className="gap-3 p-5">
          {/* Wallet + cashback balances */}
          <View className="flex-row gap-3">
            <BalanceCard kind="wallet" amount={wallet} loading={balancesLoading} onPress={guardAuth(() => router.push('/wallet'))} />
            <BalanceCard kind="cashback" amount={cashback} loading={balancesLoading} onPress={guardAuth(() => router.push('/cashback'))} />
          </View>

          {/* Refer & Earn promo — its own card (not a plain menu row) to match
              the emphasis mealaweApp gives its Account-tab refer banner. */}
          <Pressable
            onPress={guardAuth(() => router.push('/refer-earn' as Href))}
            style={[shadow.card, { backgroundColor: palette.brand.teal, borderRadius: RADIUS.lg }]}
            className="flex-row items-center gap-3 p-4 active:opacity-90"
            accessibilityRole="button">
            <View
              className="h-11 w-11 items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(255,255,255,0.16)' }}>
              <IconGift size={22} color="#ffffff" />
            </View>
            <View className="flex-1">
              <AppText variant="label" className="text-white">
                Refer & Earn
              </AppText>
              <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.78)' }}>
                Invite friends, get ₹{REFERRAL_REWARD} cashback each
              </AppText>
            </View>
            <IconChevronRight size={20} color="#ffffff" />
          </Pressable>

          <SectionLabel>Food delivery</SectionLabel>
          <SectionCard>
            <SectionRow
              icon={IconReceipt}
              tone="plan"
              label="My orders"
              sub="Ongoing & past orders"
              onPress={guardAuth(() => router.push('/my-orders' as Href))}
            />
            <SectionRow
              icon={IconMapPin}
              tone="location"
              label="Manage addresses"
              sub="Saved delivery addresses"
              onPress={guardAuth(() => router.push('/addresses'))}
              divider
            />
          </SectionCard>

          <SectionLabel>Support</SectionLabel>
          <SectionCard>
            <SectionRow
              icon={IconHelp}
              tone="info"
              label="Help & support"
              sub="Chat, call, email & FAQs"
              onPress={guardAuth(() => router.push('/help'))}
            />
            <SectionRow
              icon={IconFeedback}
              tone="reward"
              label="Feedback"
              sub="Tell us how we’re doing"
              onPress={guardAuth(() => router.push('/feedback'))}
              divider
            />
            <SectionRow
              icon={IconStar}
              tone="rating"
              label="Rate Mealawe"
              sub="Enjoying the app? Leave us a review"
              onPress={() => {
                void openStoreListingForReviewAsync();
              }}
              divider
            />
          </SectionCard>

          <SectionLabel>Preferences</SectionLabel>
          <SectionCard>
            {/* Pure Veg — commented out for now, not removed.
            <SectionRow
              icon={IconLeaf}
              tone="veg"
              label="Pure Veg"
              onPress={toggleVegOnly}
              right={<Toggle value={vegOnly} onChange={toggleVegOnly} accessibilityLabel="Pure veg only" />}
            />
            */}
            <SectionRow
              icon={IconMoon}
              tone="food"
              label="Appearance"
              sub={THEME_LABEL[themePreference] ?? 'System default'}
              onPress={() => themeSheetRef.current?.present()}
            />
            {/* Biometric lock — commented out for now, not removed.
            <SectionRow
              icon={IconBiometric}
              tone="info"
              label="Biometric lock"
              sub="Require Face ID / Touch ID to open the app"
              onPress={toggleBiometricLock}
              right={
                <Toggle
                  value={biometricLockEnabled}
                  onChange={toggleBiometricLock}
                  disabled={biometricBusy}
                  accessibilityLabel="Biometric lock"
                />
              }
              divider
            />
            */}
          </SectionCard>

          {/* A "Skip" on the login screen never creates a session (see
              `login.tsx`), so `isAuthenticated` staying false IS the guest
              signal — "Sign out" made no sense for a customer who never
              signed in, so this row offers the one thing they can actually
              do: sign in. */}
          {!isAuthenticated && (
            <ProfileMenuRow
              icon={IconLogIn}
              tone="veg"
              label="Sign in"
              sub="Sign in to place orders and save your addresses"
              onPress={() => router.push('/login')}
            />
          )}

          {/* Sign out is a terminal, destructive action — kept off the grouped
              cards above and rendered as a plain text link (iOS convention)
              so it never reads as "just another settings row." */}
          {isAuthenticated && (
            <Pressable
              onPress={() => setSignOutVisible(true)}
              hitSlop={8}
              className="mt-4 flex-row items-center justify-center gap-2 py-2 active:opacity-60"
              accessibilityRole="button">
              <IconLogOut size={18} color={palette.status.danger} />
              <AppText variant="label" className="text-danger">
                Sign out
              </AppText>
            </Pressable>
          )}

          <View className="mt-2 items-center">
            <AppText variant="caption" className="text-muted-foreground">
              v{APP_VERSION}
            </AppText>
          </View>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={signOutVisible}
        icon={IconLogOut}
        destructive
        title="Sign out?"
        message="You’ll need to log in again to place orders."
        confirmLabel="Sign out"
        onConfirm={doSignOut}
        onCancel={() => setSignOutVisible(false)}
      />

      <ThemeSheet ref={themeSheetRef} />
    </View>
  );
}

/** Bold-label section header — spacing does the grouping, no colored stripe. */
function SectionLabel({ children }: { children: string }) {
  return (
    <AppText variant="overline" className="mt-2 text-muted-foreground">
      {children}
    </AppText>
  );
}

/** One shadowed, rounded card per section — wraps its `SectionRow`s so a
 * group reads as a single iOS-style list instead of N separate shadow chips. */
function SectionCard({ children }: { children: ReactNode }) {
  return (
    <View style={[shadow.card, { borderRadius: RADIUS.lg }]} className="overflow-hidden border border-border bg-card">
      {children}
    </View>
  );
}

interface SectionRowProps {
  icon: LucideIcon;
  label: string;
  sub?: string;
  tone?: AccentTone;
  /** Overrides the trailing chevron — e.g. a `Toggle` for an on/off row. */
  right?: ReactNode;
  onPress: () => void;
  /** Draws a top hairline — set on every row after the first in a `SectionCard`. */
  divider?: boolean;
}

/** A `ProfileMenuRow`-equivalent row without its own card chrome, so several can
 * sit inside one `SectionCard` separated by hairlines instead of individual shadows. */
function SectionRow({ icon: Icon, label, sub, tone = 'plan', right, onPress, divider = false }: SectionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3.5 active:opacity-70 ${divider ? 'border-t border-border' : ''}`}
      accessibilityRole="button">
      <AccentIcon icon={Icon} tone={tone} size={20} tileSize={40} />
      <View className="flex-1">
        <AppText variant="label" className="text-foreground">
          {label}
        </AppText>
        {!!sub && (
          <AppText variant="caption" className="text-muted-foreground">
            {sub}
          </AppText>
        )}
      </View>
      {right ?? <IconChevronRight size={20} color={palette.neutral.gray500} />}
    </Pressable>
  );
}

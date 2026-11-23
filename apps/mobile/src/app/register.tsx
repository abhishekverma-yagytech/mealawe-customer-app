import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { IconCheck } from '@/components/ui/icons';
import { authApi } from '@/features/auth';
import { HeroVideoBackground } from '@/features/auth/components/HeroVideoBackground';
import { TextField } from '@/features/auth/components/TextField';
import { useHeroVideoPlayer } from '@/features/auth/hooks/useHeroVideoPlayer';
import { profileSchema, type ProfileForm } from '@/features/auth/schemas';
import { track, updateProfile as updateNetcoreProfile, useScreenTracking } from '@/services/netcore';
import { useAuthStore } from '@/store';
import { palette, shadow } from '@/theme';

const REFERRAL_CHECK_DEBOUNCE_MS = 500;
type ReferralStatus = 'idle' | 'checking' | 'valid' | 'invalid';

export default function RegisterScreen() {
  useScreenTracking('register');

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  // Carried over from `/login`'s own `redirect` param when a brand-new user
  // had to complete their profile before continuing — see `login.tsx`'s
  // `verify()`.
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();

  const [apiError, setApiError] = useState<string | null>(null);
  const [referralStatus, setReferralStatus] = useState<ReferralStatus>('idle');
  const referralTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (referralTimer.current) clearTimeout(referralTimer.current);
  }, []);

  function checkReferralCode(code: string) {
    if (referralTimer.current) clearTimeout(referralTimer.current);
    if (!code) {
      setReferralStatus('idle');
      return;
    }
    setReferralStatus('checking');
    referralTimer.current = setTimeout(async () => {
      try {
        const { referralCodeValid } = await authApi.validateReferral(code);
        setReferralStatus(referralCodeValid ? 'valid' : 'invalid');
      } catch {
        setReferralStatus('idle');
      }
    }, REFERRAL_CHECK_DEBOUNCE_MS);
  }

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: profile?.userName ?? '',
      email: profile?.email ?? '',
      referral: '',
    },
    mode: 'onTouched',
  });

  const { player, hasVideoError, hasSource } = useHeroVideoPlayer();

  const confirm = handleSubmit(async ({ name, email, referral }) => {
    if (!profile?._id) {
      setApiError('Session expired — please log in again.');
      return;
    }
    setApiError(null);
    try {
      const updated = await authApi.updateProfile(profile._id, {
        userName: name,
        email,
        installReferrer: referral && referralStatus === 'valid' ? referral : undefined,
      });
      await setProfile(
        updated && updated._id ? updated : { ...profile, userName: name, email },
      );
      updateNetcoreProfile({ name, email });
      track('user_signup', { mobile: profile.phoneNo });
      router.replace(redirect && redirect.startsWith('/') ? (redirect as Href) : '/(tabs)');
    } catch {
      setApiError('Could not save your details. Please try again.');
    }
  });

  return (
    <View className="flex-1 bg-brand-teal">
      <StatusBar style="light" />
      {/* Hero — flex-1 (not a fixed height) so it absorbs whatever space the
          bottom sheet's own content doesn't need, keeping the sheet pinned
          flush to the bottom — same reasoning as /login's hero. */}
        <View className="flex-1 overflow-hidden bg-brand-green-dark">
          <HeroVideoBackground player={player} hasVideoError={hasVideoError} hasSource={hasSource} />
          <View pointerEvents="none" style={StyleSheet.absoluteFill} className="bg-black/30" />
          <View
            style={{ paddingTop: insets.top + 12 }}
            className="flex-row items-center justify-between px-4">
            <View />
            <Pressable
              onPress={() => router.replace('/(tabs)')}
              className="rounded-full bg-white/25 px-4 py-2 active:opacity-80">
              <AppText variant="label" className="text-white">
                Skip
              </AppText>
            </Pressable>
          </View>
          <View className="mt-auto px-5 pb-4">
            <AppText variant="h2" weight="black" className="text-white">
              Almost there
            </AppText>
            <AppText variant="body" className="text-white/90">
              Tell us a bit about you
            </AppText>
          </View>
        </View>

        {/* Bottom sheet — content-sized, pinned to the bottom by the hero
            above absorbing the leftover space (see its own comment). */}
        <View className="-mt-6 rounded-t-3xl bg-card" style={shadow.sheet}>
          <KeyboardAwareScrollView
            contentContainerStyle={{ padding: 22, paddingBottom: insets.bottom + 24 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bottomOffset={24}>
            <View className="gap-4">
              <Controller
                control={control}
                name="name"
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextField
                    label="Name"
                    required
                    placeholder="Your full name"
                    maxLength={30}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.name?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="email"
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextField
                    label="Email ID"
                    required
                    placeholder="you@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.email?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="referral"
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextField
                    label="Referral code (optional)"
                    placeholder="Enter referral code"
                    autoCapitalize="characters"
                    value={value ?? ''}
                    onChangeText={(t) => {
                      const upper = t.toUpperCase();
                      onChange(upper);
                      checkReferralCode(upper);
                    }}
                    onBlur={onBlur}
                    error={referralStatus === 'invalid' ? 'Invalid referral code' : undefined}
                    trailing={
                      referralStatus === 'checking' ? (
                        <ActivityIndicator size="small" color={palette.brand.green} />
                      ) : referralStatus === 'valid' ? (
                        <IconCheck size={18} color={palette.brand.green} />
                      ) : undefined
                    }
                  />
                )}
              />

              {apiError ? (
                <AppText variant="body" className="text-danger">
                  {apiError}
                </AppText>
              ) : null}

              <Button
                label="Confirm"
                onPress={confirm}
                disabled={isSubmitting}
                loading={isSubmitting}
                block
                className="mt-2"
              />
            </View>
          </KeyboardAwareScrollView>
        </View>
    </View>
  );
}

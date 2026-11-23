import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { authApi } from '@/features/auth';
import { HeroVideoBackground } from '@/features/auth/components/HeroVideoBackground';
import { OtpInput } from '@/features/auth/components/OtpInput';
import { TermsSheet, type TermsSheetHandle } from '@/features/auth/components/TermsSheet';
import { TextField } from '@/features/auth/components/TextField';
import { useHeroVideoPlayer } from '@/features/auth/hooks/useHeroVideoPlayer';
import { phoneSchema, type PhoneForm } from '@/features/auth/schemas';
import { setCrashlyticsUser } from '@/services/crashlytics';
import { identify, useScreenTracking } from '@/services/netcore';
import { verifyOtpAndLogin } from '@mealawe/hooks';
import { registerDeviceToken } from '@/services/push';
import { shadow } from '@/theme';

const RESEND_SECONDS = 30;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong';
}

export default function LoginScreen() {
  useScreenTracking('login');

  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Where to land after a successful login, for callers that sent the user
  // here from mid-flow (e.g. Subscription Detail's "Login" CTA) instead of
  // the default post-login destination — see this screen's own `verify()`.
  // Threaded through to `/register` too when the profile still needs
  // completing, so the redirect survives that extra hop.
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();

  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors, isValid },
  } = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: '' },
    mode: 'onChange',
  });

  const [otp, setOtp] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(true);
  const termsSheetRef = useRef<TermsSheetHandle>(null);

  const { player, hasVideoError, hasSource } = useHeroVideoPlayer();

  const toggleVideo = useCallback(() => {
    if (player.playing) {
      player.pause();
      setVideoPlaying(false);
    } else {
      player.play();
      setVideoPlaying(true);
    }
  }, [player]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const sendOtp = handleSubmit(async ({ phone }) => {
    setLoading(true);
    setApiError(null);
    try {
      await authApi.sendOtp(phone);
      setOtpStep(true);
      setResendIn(RESEND_SECONDS);
    } catch (e) {
      setApiError(`Could not send OTP — ${errorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  });

  const verify = useCallback(async () => {
    if (otp.length !== 6) return;
    const phone = getValues('phone');
    setLoading(true);
    setApiError(null);
    try {
      // Shared flow (packages/hooks/loginFlow): verify -> token first -> profile (with 401 retry) -> next route.
      const { profile, next } = await verifyOtpAndLogin(phone, otp, redirect);
      void registerDeviceToken(profile._id);
      setCrashlyticsUser(profile._id);
      identify(profile.phoneNo);
      if (next.kind === 'redirect') router.replace(next.path as Href);
      else if (next.kind === 'home') router.replace('/(tabs)');
      else if (next.redirect) router.replace({ pathname: '/register', params: { redirect: next.redirect } });
      else router.replace('/register');
    } catch (e) {
      setApiError(`Verification failed — ${errorMessage(e)}`);
      setOtp('');
    } finally {
      setLoading(false);
    }
  }, [otp, getValues, router, redirect]);

  useEffect(() => {
    if (otpStep && otp.length === 6 && !loading) void verify();
  }, [otp, otpStep, loading, verify]);

  const resend = useCallback(async () => {
    if (resendIn > 0) return;
    try {
      await authApi.resendOtp(getValues('phone'));
      setResendIn(RESEND_SECONDS);
      setApiError(null);
    } catch (e) {
      setApiError(`Could not resend OTP — ${errorMessage(e)}`);
    }
  }, [getValues, resendIn]);

  const phoneDisabled = loading || !isValid;
  const otpDisabled = loading || otp.length !== 6;

  return (
    <View className="flex-1 bg-brand-teal">
      <StatusBar style="light" />
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        {/* Hero — looping promo video. flex-1 (not a fixed height) so it
            absorbs whatever space the bottom sheet's own content doesn't
            need, keeping the sheet pinned flush to the bottom instead of
            leaving a bg-brand-teal gap below it on taller screens / shorter
            sheet content (e.g. the phone-entry step). */}
        <View className="flex-1 overflow-hidden bg-brand-green-dark">
          <HeroVideoBackground player={player} hasVideoError={hasVideoError} hasSource={hasSource} />
          <View pointerEvents="none" style={StyleSheet.absoluteFill} className="bg-black/25" />
          <View
            style={{ paddingTop: insets.top + 12 }}
            className="flex-row items-center justify-between px-4">
            {/* pause / play toggle (top-left) */}
            <Pressable
              onPress={toggleVideo}
              hitSlop={10}
              className="h-9 w-9 items-center justify-center rounded-full bg-black/35 active:opacity-70">
              {videoPlaying ? (
                <View className="flex-row gap-1">
                  <View className="h-3.5 w-1 rounded-sm bg-white" />
                  <View className="h-3.5 w-1 rounded-sm bg-white" />
                </View>
              ) : (
                <View style={styles.playTriangle} />
              )}
            </Pressable>

            <Pressable
              onPress={() => router.replace('/(tabs)')}
              className="rounded-full bg-white/25 px-4 py-2 active:opacity-80">
              <AppText variant="label" className="text-white">
                Skip
              </AppText>
            </Pressable>
          </View>
        </View>

        {/* Bottom sheet — content-sized, pinned to the bottom by the hero
            above absorbing the leftover space (see its own comment). */}
        <View
          className="-mt-6 rounded-t-3xl bg-card px-5 pt-7"
          style={[shadow.sheet, { paddingBottom: insets.bottom + 22 }]}>
          {!otpStep ? (
            <View className="gap-5">
              <View className="gap-1">
                <AppText variant="h2" className="text-foreground">
                  Login
                </AppText>
                <AppText variant="body" className="text-muted-foreground">
                  Enter your mobile number to continue
                </AppText>
              </View>

              <Controller
                control={control}
                name="phone"
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextField
                    label="Mobile Number"
                    keyboardType="number-pad"
                    maxLength={10}
                    placeholder="10-digit number"
                    value={value}
                    onChangeText={(t) => onChange(t.replace(/[^0-9]/g, '').slice(0, 10))}
                    onBlur={onBlur}
                    error={errors.phone?.message ?? apiError}
                    leading={
                      <AppText
                        variant="bodyLg"
                        weight="bold"
                        className="border-r border-border pr-2 text-foreground">
                        +91
                      </AppText>
                    }
                  />
                )}
              />

              <Button
                label="Send OTP"
                onPress={sendOtp}
                disabled={phoneDisabled}
                loading={loading}
                block
              />
            </View>
          ) : (
            <View className="gap-5">
              <View className="gap-1">
                <AppText variant="h2" className="text-foreground">
                  Verify OTP
                </AppText>
                <AppText variant="body" className="text-muted-foreground">
                  Sent to +91 {getValues('phone')}
                  {'   '}
                  <AppText
                    variant="body"
                    weight="bold"
                    onPress={() => {
                      setOtpStep(false);
                      setOtp('');
                      setApiError(null);
                    }}
                    className="text-primary">
                    Change
                  </AppText>
                </AppText>
              </View>

              <OtpInput value={otp} onChange={setOtp} />

              {apiError ? (
                <AppText variant="body" className="text-danger">
                  {apiError}
                </AppText>
              ) : null}

              <View className="h-5 flex-row items-center justify-between">
                <AppText variant="body" className="text-muted-foreground">
                  {resendIn > 0 ? `Resend in 00:${String(resendIn).padStart(2, '0')}` : ''}
                </AppText>
                <Pressable onPress={resend} disabled={resendIn > 0}>
                  <AppText
                    variant="body"
                    weight="bold"
                    className={resendIn > 0 ? 'text-muted-foreground' : 'text-primary'}>
                    Resend OTP
                  </AppText>
                </Pressable>
              </View>

              <Button
                label="Verify & Continue"
                onPress={verify}
                disabled={otpDisabled}
                loading={loading}
                block
              />
            </View>
          )}

          <AppText variant="caption" className="mt-5 text-center text-muted-foreground">
            By continuing, you agree to mealawe&apos;s{' '}
            <AppText
              variant="caption"
              weight="bold"
              onPress={() => termsSheetRef.current?.present()}
              className="text-primary">
              terms &amp; conditions
            </AppText>
          </AppText>
        </View>
      </KeyboardAvoidingView>

      <TermsSheet ref={termsSheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 10,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#fff',
    marginLeft: 2,
  },
});

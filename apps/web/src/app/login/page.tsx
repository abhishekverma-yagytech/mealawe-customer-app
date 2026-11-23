'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { authApi } from '@mealawe/api';
import { phoneSchema, type PhoneForm } from '@mealawe/core';
import { safeRedirect, verifyOtpAndLogin } from '@mealawe/hooks';

import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OtpInput } from '@/components/ui/OtpInput';

const RESEND_SECONDS = 30;
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = safeRedirect(params.get('redirect'));
  const notice = params.get('reason') === 'cart' ? 'Please log in to add items to your cart. We’ll bring you right back.' : undefined;
  const { register, handleSubmit, getValues, formState: { errors, isValid } } = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: '' },
    mode: 'onChange',
  });
  const [otp, setOtp] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const sendOtp = handleSubmit(async ({ phone }) => {
    setLoading(true);
    setError(null);
    try {
      await authApi.sendOtp(phone);
      setOtpStep(true);
      setResendIn(RESEND_SECONDS);
    } catch (e) {
      setError(`Could not send OTP — ${msg(e)}`);
    } finally {
      setLoading(false);
    }
  });

  const verify = useCallback(async () => {
    if (otp.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const { next } = await verifyOtpAndLogin(getValues('phone'), otp, redirect);
      if (next.kind === 'redirect') router.replace(next.path);
      else if (next.kind === 'home') router.replace('/home');
      else router.replace(next.redirect ? `/register?redirect=${encodeURIComponent(next.redirect)}` : '/register');
    } catch (e) {
      setError(`Verification failed — ${msg(e)}`);
      setOtp('');
      setLoading(false);
    }
  }, [otp, getValues, redirect, router]);

  useEffect(() => {
    if (otpStep && otp.length === 6 && !loading) void verify();
  }, [otp, otpStep, loading, verify]);

  const resend = async () => {
    if (resendIn > 0) return;
    try {
      await authApi.resendOtp(getValues('phone'));
      setResendIn(RESEND_SECONDS);
      setError(null);
    } catch (e) {
      setError(`Could not resend OTP — ${msg(e)}`);
    }
  };

  return (
    <AuthShell
      notice={notice}
      title={otpStep ? 'Enter the code' : 'Log in or sign up'}
      subtitle={otpStep ? `We sent a 6-digit code to +91 ${getValues('phone')}` : 'Enter your mobile number to continue'}>
      {otpStep ? (
        <div className="space-y-4">
          <OtpInput value={otp} onChange={setOtp} disabled={loading} hasError={!!error} />
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button block disabled={loading || otp.length !== 6} onClick={verify}>
            {loading ? 'Verifying…' : 'Verify'}
          </Button>
          <div className="flex items-center justify-between text-sm">
            <button type="button" className="font-bold text-primary" onClick={() => { setOtpStep(false); setOtp(''); setError(null); }}>
              Change number
            </button>
            <button type="button" disabled={resendIn > 0} onClick={resend} className="font-bold text-primary disabled:text-muted-foreground">
              {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend OTP'}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={sendOtp} className="space-y-4" noValidate>
          <div className="flex items-start gap-2">
            <span className="flex min-h-11 items-center rounded-card border border-border bg-muted px-3 text-sm font-bold">+91</span>
            <Input aria-label="Mobile number" inputMode="numeric" autoComplete="tel-national" maxLength={10} placeholder="10-digit mobile number" error={errors.phone?.message} {...register('phone')} />
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" block disabled={loading || !isValid}>
            {loading ? 'Sending…' : 'Get OTP'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">By continuing you agree to our Terms of Service and Privacy Policy.</p>
        </form>
      )}
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

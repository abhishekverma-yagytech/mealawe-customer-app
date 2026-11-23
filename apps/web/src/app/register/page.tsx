'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import { authApi } from '@mealawe/api';
import { profileSchema, type ProfileForm } from '@mealawe/core';
import { safeRedirect } from '@mealawe/hooks';
import { useAuthStore } from '@mealawe/state';

import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useRequireLogin } from '@/lib/useRequireLogin';

type ReferralStatus = 'idle' | 'checking' | 'valid' | 'invalid';

function RegisterForm() {
  const router = useRouter();
  const redirect = safeRedirect(useSearchParams().get('redirect'));
  const authed = useRequireLogin();
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const [error, setError] = useState<string | null>(null);
  const [referral, setReferral] = useState<ReferralStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: profile?.userName ?? '', email: profile?.email ?? '', referral: '' },
    mode: 'onTouched',
  });

  const checkReferral = (code: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (!code) return setReferral('idle');
    setReferral('checking');
    timer.current = setTimeout(async () => {
      try {
        const { referralCodeValid } = await authApi.validateReferral(code);
        setReferral(referralCodeValid ? 'valid' : 'invalid');
      } catch {
        setReferral('idle');
      }
    }, 500);
  };

  const submit = handleSubmit(async ({ name, email, referral: code }) => {
    if (!profile?._id) return setError('Session expired — please log in again.');
    setError(null);
    try {
      const updated = await authApi.updateProfile(profile._id, {
        userName: name,
        email,
        installReferrer: code && referral === 'valid' ? code : undefined,
      });
      await setProfile(updated && updated._id ? updated : { ...profile, userName: name, email });
      router.replace(redirect ?? '/home');
    } catch {
      setError('Could not save your details. Please try again.');
    }
  });

  const referralField = register('referral');
  if (!authed) return null;
  return (
    <AuthShell title="Almost there" subtitle="Tell us a little about you" skipHref={redirect ?? '/home'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label="Full name" autoComplete="name" error={errors.name?.message} {...register('name')} />
        <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Input
          label="Referral code (optional)"
          autoCapitalize="characters"
          hint={referral === 'checking' ? 'Checking…' : referral === 'valid' ? 'Referral applied' : referral === 'invalid' ? 'That code is not valid' : undefined}
          {...referralField}
          onChange={(e) => {
            void referralField.onChange(e);
            checkReferral(e.target.value.trim());
          }}
        />
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" block disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Continue'}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Camera } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { profileApi, resolveProfileImage } from '@mealawe/api';
import { useAuthStore } from '@mealawe/state';

import { Page, PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Img } from '@/lib/img';
import { useRequireLogin } from '@/lib/useRequireLogin';

const schema = z.object({
  userName: z.string().trim().min(2, 'Please enter a valid name').max(30, 'Name is too long'),
  email: z.string().trim().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email'),
});
type Values = z.infer<typeof schema>;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export default function ProfileEditPage() {
  const router = useRouter();
  const authed = useRequireLogin();
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { userName: profile?.userName ?? '', email: profile?.email ?? '' } });

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return setError('Please choose an image file.');
    if (f.size > MAX_PHOTO_BYTES) return setError('Image must be under 5 MB.');
    setError(null);
    setPhoto({ file: f, preview: URL.createObjectURL(f) });
  };

  const onSubmit = handleSubmit(async (values) => {
    if (!profile?._id) return setError('Session expired — please log in again.');
    setError(null);
    const merged = { ...profile, userName: values.userName, email: values.email };
    try {
      const res = photo
        ? await profileApi.saveProfileWithImage(profile._id, { ...values, registeredPlatform: profile.registeredPlatform as string | undefined }, photo.file)
        : await profileApi.saveProfile(profile._id, merged);
      await setProfile(res ?? merged);
      router.back();
    } catch {
      setError('Could not save your profile. Please try again.');
    }
  });

  if (!authed) return null;
  return (
    <>
      <PageHeader title="Edit profile" />
      <Page narrow>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div className="flex justify-center">
            <button type="button" onClick={() => fileRef.current?.click()} aria-label="Change profile photo" className="relative size-24 overflow-hidden rounded-full bg-primary text-3xl font-black text-white">
              {photo ? <Img src={photo.preview} alt="" className="size-24" /> : profile?.imageUrl ? <Img src={resolveProfileImage(profile.imageUrl)} alt="" className="size-24" /> : <span className="flex size-24 items-center justify-center">{profile?.userName?.[0]?.toUpperCase() ?? '?'}</span>}
              <span className="absolute inset-x-0 bottom-0 flex justify-center bg-black/50 py-1"><Camera className="size-4" /></span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </div>
          <Input label="Full name" autoComplete="name" error={errors.userName?.message} {...register('userName')} />
          <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
          <Input label="Mobile number" value={profile?.phoneNo ? `+91 ${profile.phoneNo}` : ''} disabled readOnly hint="Mobile number can't be changed here." />
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" block size="lg" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save changes'}</Button>
        </form>
      </Page>
    </>
  );
}

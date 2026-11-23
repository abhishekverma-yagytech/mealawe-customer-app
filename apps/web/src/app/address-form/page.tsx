'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import type { Address, GeoPoint, TagLocation } from '@mealawe/api';
import { safeRedirect } from '@mealawe/hooks';
import { useLocationStore } from '@mealawe/state';
import { z } from 'zod';

import { Page, PageHeader } from '@/components/layout/PageHeader';
import { LocationPicker, type ResolvedPlace } from '@/components/location/LocationPicker';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import { useRequireLogin } from '@/lib/useRequireLogin';

const detailSchema = z.object({ address: z.string().trim().min(3, 'Add a flat / house / street'), landmark: z.string().trim().optional() });
const TAGS: TagLocation[] = ['home', 'work', 'other'];

function Content() {
  const router = useRouter();
  const params = useSearchParams();
  const authed = useRequireLogin();
  const returnTo = safeRedirect(params.get('returnTo')) ?? '/addresses';
  const idx = params.get('index');
  const editIndex = idx != null && !Number.isNaN(Number(idx)) ? Number(idx) : null;
  const saved = useLocationStore((s) => s.saved);
  const current = useLocationStore((s) => s.current);
  const addAddress = useLocationStore((s) => s.addAddress);
  const updateAddress = useLocationStore((s) => s.updateAddress);
  const editing = editIndex !== null ? saved[editIndex] : undefined;

  const [resolved, setResolved] = useState<ResolvedPlace | null>(editing ? { geolocation: editing.geolocation, location: editing.location, pincode: editing.pincode, city: editing.city, state: editing.state } : null);
  const [tag, setTag] = useState<TagLocation>(editing?.tagLocation ?? 'home');
  const [address, setAddress] = useState(editing?.address ?? '');
  const [landmark, setLandmark] = useState(editing?.landmark ?? '');
  const [errors, setErrors] = useState<{ address?: string; place?: string }>({});
  const [busy, setBusy] = useState(false);
  const initial: GeoPoint | null = editing?.geolocation ?? current?.geolocation ?? null;

  const submit = async () => {
    const parsed = detailSchema.safeParse({ address, landmark });
    if (!resolved) return setErrors({ place: 'Pick your location on the map or search for it first.' });
    if (!parsed.success) return setErrors({ address: parsed.error.issues[0]?.message });
    setErrors({});
    setBusy(true);
    const addr: Address = { ...(editing ?? {}), geolocation: resolved.geolocation, location: resolved.location, pincode: resolved.pincode, city: resolved.city, state: resolved.state, tagLocation: tag, address: parsed.data.address, landmark: parsed.data.landmark || undefined };
    try {
      if (editIndex !== null) await updateAddress(editIndex, addr);
      else await addAddress(addr);
      router.replace(returnTo);
    } finally {
      setBusy(false);
    }
  };

  if (!authed) return null;
  return (
    <>
      <PageHeader title={editIndex !== null ? 'Edit address' : 'Add address'} />
      <Page narrow>
        <div className="space-y-5">
          <LocationPicker initial={initial} onResolved={(p) => { setResolved(p); setErrors((e) => ({ ...e, place: undefined })); }} />
          {errors.place ? <p role="alert" className="text-sm text-destructive">{errors.place}</p> : null}
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Save as</legend>
            <div className="flex gap-2">
              {TAGS.map((t) => (
                <button type="button" key={t} aria-pressed={tag === t} onClick={() => setTag(t)} className={cn('rounded-full border px-4 py-1.5 text-sm font-bold capitalize', tag === t ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>{t}</button>
              ))}
            </div>
          </fieldset>
          <Input label="Flat / house no. / street" value={address} onChange={(e) => setAddress(e.target.value)} error={errors.address} autoComplete="street-address" />
          <Input label="Landmark (optional)" value={landmark} onChange={(e) => setLandmark(e.target.value)} />
          <Button block size="lg" disabled={busy} onClick={submit}>{busy ? 'Saving…' : editIndex !== null ? 'Update address' : 'Save address'}</Button>
        </div>
      </Page>
    </>
  );
}

export default function AddressFormPage() { return <Suspense><Content /></Suspense>; }

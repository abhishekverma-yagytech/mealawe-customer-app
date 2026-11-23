'use client';

import { LocateFixed, MapPin, Pencil, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { addressLabel, isSameAddress, type Address } from '@mealawe/api';
import { useAuthStore, useLocationStore } from '@mealawe/state';

import { Page, PageHeader } from '@/components/layout/PageHeader';
import { AddressBlock } from '@/components/location/AddressBlock';
import { LocationSearch } from '@/components/location/LocationSearch';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/cn';

/** Delivery address screen — same sections as mobile's /addresses (gate, detect, search, current, saved, add). */
export default function AddressesPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const saved = useLocationStore((s) => s.saved);
  const current = useLocationStore((s) => s.current);
  const getting = useLocationStore((s) => s.gettingLocation);
  const setCurrent = useLocationStore((s) => s.setCurrent);
  const detectGps = useLocationStore((s) => s.useCurrentLocation);
  const removeAddress = useLocationStore((s) => s.removeAddress);
  const [searchOpen, setSearchOpen] = useState(false);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);

  const isCurrent = (a: Address) => isSameAddress(current, a);
  const goBack = () => (window.history.length > 1 ? router.back() : router.replace('/home'));
  const hasAny = saved.length > 0 || current != null;
  const currentIsUnsaved = current != null && !saved.some(isCurrent);
  const addHref = isAuthenticated ? '/address-form' : `/login?redirect=${encodeURIComponent('/address-form')}`;

  const select = async (a: Address) => {
    await setCurrent(a);
    goBack();
  };
  const detect = async () => {
    setGpsMsg(null);
    const a = await detectGps();
    if (a) goBack();
    else setGpsMsg('Location unavailable. Allow location access in your browser, or search / add an address.');
  };

  const detectButton = (
    <Button block variant="outline" size="lg" disabled={getting} onClick={detect} className="border-primary text-primary">
      <LocateFixed className="size-5" />{getting ? 'Detecting…' : 'Use my current location'}
    </Button>
  );

  return (
    <>
      <PageHeader title="Delivery address" />
      <Page narrow>
        {!hasAny ? (
          <div className="mt-6 space-y-5 text-center">
            <MapPin className="mx-auto size-10 text-primary" aria-hidden />
            <div><h2 className="text-xl font-black">Where should we deliver?</h2><p className="mt-1 text-muted-foreground">Share your location or search for an address to see kitchens near you.</p></div>
            {detectButton}
            {gpsMsg ? <p role="alert" className="text-sm text-destructive">{gpsMsg}</p> : null}
            <div className="text-left"><LocationSearch onUseAddress={select} /></div>
          </div>
        ) : (
          <div className="space-y-4">
            {detectButton}
            {gpsMsg ? <p role="alert" className="text-sm text-destructive">{gpsMsg}</p> : null}

            {searchOpen ? (
              <LocationSearch onUseAddress={select} />
            ) : (
              <button onClick={() => setSearchOpen(true)} className="flex w-full items-center gap-2 rounded-card border border-border px-4 py-3.5 text-left font-bold hover:bg-muted">
                <Search className="size-5 text-primary" />Search a location to check availability
              </button>
            )}

            {currentIsUnsaved ? (
              <p className="flex items-start gap-2 px-1 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" /><span className="break-words">Current: {addressLabel(current)}</span></p>
            ) : null}

            {saved.length > 0 ? <h2 className="pt-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Saved addresses</h2> : null}
            <ul className="space-y-3">
              {saved.map((a, i) => (
                <li key={a._id ?? `${a.geolocation.lat},${a.geolocation.lng},${i}`} className={cn('rounded-card border-2 p-4', isCurrent(a) ? 'border-primary bg-primary/5' : 'border-border bg-card')}>
                  <button onClick={() => void select(a)} className="block w-full text-left"><AddressBlock address={a} current={isCurrent(a)} /></button>
                  <div className="mt-3 flex gap-5 pl-7 text-sm font-bold">
                    <Link href={`/address-form?index=${i}`} className="flex items-center gap-1 text-primary"><Pencil className="size-4" />Edit</Link>
                    <button onClick={() => setConfirm(i)} className="flex items-center gap-1 text-destructive"><Trash2 className="size-4" />Delete</button>
                  </div>
                </li>
              ))}
            </ul>

            <Link href={addHref} className="block rounded-card border border-dashed border-border py-3.5 text-center font-bold hover:bg-muted">+ Add new address</Link>
          </div>
        )}

        <Dialog open={confirm !== null} onOpenChange={(o) => { if (!o) { setConfirm(null); setErr(null); } }} title="Delete address" description="Remove this saved address?">
          {err ? <p role="alert" className="mb-3 text-sm text-destructive">{err}</p> : null}
          <div className="flex gap-2">
            <Button variant="outline" block onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" block onClick={async () => { if (confirm === null) return; const e = await removeAddress(confirm); if (e) setErr(e); else setConfirm(null); }}>Delete</Button>
          </div>
        </Dialog>
      </Page>
    </>
  );
}

'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { isSameAddress, type Address } from '@mealawe/api';
import { useClusterStore, useLocationStore } from '@mealawe/state';

import { Button } from '@/components/ui/Button';
import { AddressBlock } from './AddressBlock';
import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/cn';

/** Delivery-address picker (mobile DeliverToSection): select / edit / delete / add, with a cluster check. */
export function DeliverTo({ error, onError }: { error?: string | null; onError?: (m: string | null) => void }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = encodeURIComponent(pathname + (search ? `?${search}` : ''));
  const saved = useLocationStore((s) => s.saved);
  const current = useLocationStore((s) => s.current);
  const setCurrent = useLocationStore((s) => s.setCurrent);
  const removeAddress = useLocationStore((s) => s.removeAddress);
  const clusters = useClusterStore((s) => s.clusters);
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const requiredIds = clusters.map((c) => c.clusterId).filter(Boolean);
  const requiredName = clusters[clusters.length - 1]?.clusterName;

  const choose = async (addr: Address) => {
    if (requiredIds.length > 0) {
      const matched = await useClusterStore.getState().previewClusters(addr.geolocation);
      if (!matched.some((c) => requiredIds.includes(c.clusterId))) {
        onError?.(`This plan is only deliverable in ${requiredName ?? 'your current area'}. Choose another saved address, or add a new one there.`);
        return;
      }
    }
    onError?.(null);
    await setCurrent(addr);
  };

  return (
    <section aria-labelledby="deliver-h" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="deliver-h" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Deliver to</h2>
        <Link href={`/address-form?returnTo=${here}`} className="flex items-center gap-1 text-sm font-bold text-primary"><Plus className="size-4" />Add address</Link>
      </div>
      {saved.length === 0 ? <p className="rounded-card border border-dashed border-border p-4 text-sm text-muted-foreground">No saved addresses yet. Add one to continue.</p> : null}
      <ul className="space-y-2">
        {saved.map((addr, i) => {
          const active = isSameAddress(addr, current);
          return (
            <li key={addr._id ?? i} className={cn('flex items-start gap-2 rounded-card border-2 p-3', active ? 'border-primary bg-primary/5' : 'border-border bg-card')}>
              <button onClick={() => void choose(addr)} aria-pressed={active} className="min-w-0 flex-1 text-left">
                <AddressBlock address={addr} current={active} />
              </button>
              <Link aria-label="Edit address" href={`/address-form?index=${i}&returnTo=${here}`} className="rounded-full p-2 hover:bg-muted"><Pencil className="size-4" /></Link>
              <button aria-label="Delete address" onClick={() => setConfirmIndex(i)} className="rounded-full p-2 hover:bg-muted"><Trash2 className="size-4 text-destructive" /></button>
            </li>
          );
        })}
      </ul>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      <Dialog open={confirmIndex !== null} onOpenChange={(o) => { if (!o) { setConfirmIndex(null); setDeleteError(null); } }} title="Delete address" description="Remove this saved address?">
        {deleteError ? <p role="alert" className="mb-3 text-sm text-destructive">{deleteError}</p> : null}
        <div className="flex gap-2">
          <Button variant="outline" block onClick={() => setConfirmIndex(null)}>Cancel</Button>
          <Button variant="danger" block onClick={async () => { if (confirmIndex === null) return; const err = await removeAddress(confirmIndex); if (err) setDeleteError(err); else setConfirmIndex(null); }}>Delete</Button>
        </div>
      </Dialog>
    </section>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

/** Paginated list shell shared by wallet and cashback history. */
export function TxnList<T>({ load, render, empty, pageSize }: { load: (page: number) => Promise<T[]>; render: (t: T, i: number) => React.ReactNode; empty: string; pageSize: number }) {
  const [rows, setRows] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);

  const first = useCallback(async () => {
    setLoading(true);
    try {
      const r = await load(1);
      setRows(r);
      setMore(r.length >= pageSize);
    } catch {
      setRows([]);
      setMore(false);
    } finally {
      setLoading(false);
    }
  }, [load, pageSize]);
  useEffect(() => void first(), [first]);

  const next = async () => {
    setBusy(true);
    try {
      const r = await load(page + 1);
      setRows((p) => [...p, ...r]);
      setPage(page + 1);
      setMore(r.length >= pageSize);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton className="h-40" />;
  if (rows.length === 0) return <p className="py-6 text-center text-muted-foreground">{empty}</p>;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-card border border-border bg-card">{rows.map((r, i) => <li key={i} className="flex items-center justify-between gap-3 p-3">{render(r, i)}</li>)}</ul>
      {more ? <Button variant="outline" block disabled={busy} onClick={next}>{busy ? 'Loading…' : 'Load more'}</Button> : null}
    </div>
  );
}

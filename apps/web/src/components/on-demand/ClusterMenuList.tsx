'use client';

import { useEffect, useState } from 'react';

import { loadClusterMenu } from '@mealawe/api';
import type { OnDemandKitchen, OnDemandMenuItem } from '@mealawe/core';
import { useClusterStore } from '@mealawe/state';

import { Skeleton } from '@/components/ui/Skeleton';

import { KitchenMenuView } from './KitchenMenuView';

/** Kota-style aggregated cluster menu: one virtual kitchen for the whole cluster. */
export function ClusterMenuList() {
  const clusterKey = useClusterStore((s) => s.clusters.map((c) => c.clusterId).join(','));
  const [data, setData] = useState<{ kitchen: OnDemandKitchen; items: OnDemandMenuItem[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadClusterMenu().then((r) => {
      if (active) {
        setData(r);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [clusterKey]);

  if (loading) return <Skeleton className="h-64" />;
  if (!data) return <p className="text-muted-foreground">The menu isn&apos;t available for your area right now.</p>;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-black">Order on demand</h2>
      <KitchenMenuView kitchen={data.kitchen} items={data.items} initialMode="allDay" />
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';

import { loadNearestKitchens } from '@mealawe/api';
import type { OnDemandKitchen } from '@mealawe/core';
import { useClusterStore } from '@mealawe/state';

import { ClusterMenuList } from '@/components/on-demand/ClusterMenuList';
import { KitchenGrid } from '@/components/on-demand/KitchenGrid';
import { Skeleton } from '@/components/ui/Skeleton';

export function OnDemandHome() {
  const showClusterMenu = useClusterStore((s) => s.showClusterMenu);
  const clusterKey = useClusterStore((s) => s.clusters.map((c) => c.clusterId).join(','));
  const [kitchens, setKitchens] = useState<OnDemandKitchen[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (showClusterMenu) return;
    let active = true;
    setLoading(true);
    loadNearestKitchens('allDay').then((r) => {
      if (active) {
        setKitchens(r);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [showClusterMenu, clusterKey]);

  if (showClusterMenu) return <ClusterMenuList />;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black">Order on demand</h2>
        <p className="text-muted-foreground">Home kitchens cooking near you right now. One meal at a time, no plan needed.</p>
      </div>
      {loading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-52" />)}</div> : <KitchenGrid kitchens={kitchens} mode="allDay" />}
    </div>
  );
}

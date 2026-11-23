import { useMemo } from 'react';

import { useClusterStore } from '@mealawe/state';

export type OrderModeKey = 'subscription' | 'bulk' | 'dinein' | 'ondemand';

/**
 * Which order-mode verticals are actually enabled for the user's current
 * cluster — the single source of truth Home's own order-mode tabs
 * (`(tabs)/index.tsx`'s `orderTabs`) are built from, and the SAME rules
 * "My Orders" (`my-orders.tsx`) filters its category hub by, so a cluster
 * with e.g. `showBulk: false` hides "Bulk" consistently in both places
 * instead of the two screens silently drifting apart.
 *
 * Mirrors `orderTabs`' exact fallback semantics:
 * - `subscription`/`bulk` default visible (`true`) while their flag is still
 *   `null` (not yet resolved) — these are the long-standing verticals, so
 *   they shouldn't flicker hidden during the brief window before the
 *   cluster-config fetch resolves.
 * - `dinein` falls back to a `clusterName` "kota" substring heuristic when
 *   `showDineIn` is `null`, same as before per-cluster config existed.
 * - `ondemand` has no such fallback — `null` reads as "not enabled yet" and
 *   stays hidden until the flag resolves `true`. It's gated by EITHER
 *   `showOndemand` or `showClusterMenu` (Kota's aggregated cluster-menu
 *   flow rides the same slot — Kota's config sets only `showClusterMenu`,
 *   never `showOndemand` — `OnDemandHome` itself picks which body to render
 *   once inside; the entry point/label here doesn't change for Kota, same
 *   as the Ionic reference apps, which use the literal label "On Demand"
 *   for both their separate showOndemand/showClusterMenu tabs too).
 */
export function useVisibleOrderModes(): ReadonlySet<OrderModeKey> {
  const clusters = useClusterStore((s) => s.clusters);
  const showSubscription = useClusterStore((s) => s.showSubscription);
  const showBulk = useClusterStore((s) => s.showBulk);
  const showDineIn = useClusterStore((s) => s.showDineIn);
  const showOndemand = useClusterStore((s) => s.showOndemand);
  const showClusterMenu = useClusterStore((s) => s.showClusterMenu);

  return useMemo(() => {
    const isKota = clusters.some((c) => (c.clusterName ?? '').toLowerCase().includes('kota'));
    const visible = new Set<OrderModeKey>();
    if (showSubscription ?? true) visible.add('subscription');
    if (showBulk ?? true) visible.add('bulk');
    if (showDineIn ?? isKota) visible.add('dinein');
    if (showOndemand === true || showClusterMenu === true) visible.add('ondemand');
    return visible;
  }, [clusters, showSubscription, showBulk, showDineIn, showOndemand, showClusterMenu]);
}

import type { ComponentType } from 'react';

import type { Cluster } from '@/features/location';
import { useClusterStore } from '@/store/clusterStore';
import { IconClose, IconDelivery, IconLeaf, IconPause, IconUser, IconWallet, type IconProps } from '@/components/ui/icons';

/** One "why choose us" tile — icon + short title + short sub-copy. */
export interface Reason {
  icon: ComponentType<IconProps>;
  title: string;
  sub: string;
}

/** Exactly 6 reasons for the dark `ReasonsGrid` tile grid — the default set,
 * used everywhere except Kota's first-tile override below. Pune and every
 * other cluster will eventually get their own full set too; for now they all
 * share this one. */
export const REASONS: readonly Reason[] = [
  {
    icon: IconUser,
    title: 'Verified home cooks',
    sub: 'Every kitchen partner is background-checked and hygiene-verified.',
  },
  {
    icon: IconLeaf,
    title: 'Fresh, cooked daily',
    sub: 'No batch cooking or freezing — your meal is made the same day.',
  },
  {
    icon: IconPause,
    title: 'Pause anytime',
    sub: 'Traveling or fasting? Pause your plan in one tap, no calls needed.',
  },
  {
    icon: IconClose,
    title: 'Skip meals anytime',
    sub: 'Skip a single delivery day without disturbing the rest of your plan.',
  },
  {
    icon: IconWallet,
    title: 'Secure payments',
    sub: 'Every transaction is encrypted and backed by trusted payment gateways.',
  },
  {
    icon: IconDelivery,
    title: 'On-time delivery',
    sub: 'Meals arrive in your chosen window, tracked from kitchen to doorstep.',
  },
];

/** Kota's override for the first tile — its hostel/student audience is away
 * from home, so "tastes like home" lands better than "verified home cooks".
 * Every other tile (and every other cluster) stays on the default `REASONS`
 * set for now. */
const KOTA_FIRST_REASON: Reason = {
  icon: IconUser,
  title: 'Taste Like Home',
  sub: 'Comforting food that feels close to home.',
};

function reasonsForClusters(clusters: readonly Cluster[]): readonly Reason[] {
  const isKota = clusters.some((c) => (c.clusterName ?? '').toLowerCase().includes('kota'));
  return isKota ? [KOTA_FIRST_REASON, ...REASONS.slice(1)] : REASONS;
}

/** Cluster-aware reasons for `ReasonsGrid` — mirrors `useSubscriptionReviews`'s
 * self-contained `useClusterStore` read, so the grid stays prop-less. */
export function useReasons(): readonly Reason[] {
  const clusters = useClusterStore((s) => s.clusters);
  return reasonsForClusters(clusters);
}

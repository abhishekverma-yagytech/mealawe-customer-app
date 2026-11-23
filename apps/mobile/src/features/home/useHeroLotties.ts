import { useEffect, useState } from 'react';

import { useClusterStore } from '@/store/clusterStore';

import { loadHeroLottiesForTab } from './api';
import { HOME_TAB_KEYS, type LottieSource } from './homeLotties';

/** Slides per tab, only for tabs that actually have server-configured slides
 * — a tab absent from this map means "nothing configured yet," so
 * `tabThemeFor` falls back to that tab's bundled local animation. */
export type HeroLottiesByTab = Readonly<Record<string, readonly LottieSource[]>>;

const EMPTY: HeroLottiesByTab = {};

/**
 * Fetches the dashboard-managed hero Lottie slides for every order-mode tab
 * at once (so switching tabs never re-fetches or shows a loading flash),
 * re-fetching when the user's cluster changes. Same "wait out detection
 * before trusting an empty cluster list" guard as `useSubscriptionCatalog`.
 *
 * Never blocks the hero from rendering: it starts at `{}` (every tab falls
 * back to its bundled animation via `tabThemeFor`) and only swaps in server
 * slides once/if the fetch resolves with something — a slow or failed fetch
 * just means the bundled default stays on screen, never a blank hero.
 */
export function useHeroLotties(): HeroLottiesByTab {
  const clusters = useClusterStore((s) => s.clusters);
  const detectingCluster = useClusterStore((s) => s.detecting);
  const clusterKey = clusters.map((c) => c.clusterId).join(',');

  const [slidesByTab, setSlidesByTab] = useState<HeroLottiesByTab>(EMPTY);

  useEffect(() => {
    if (clusters.length === 0 && detectingCluster) {
      return;
    }
    let active = true;
    Promise.all(
      HOME_TAB_KEYS.map(async (tabKey) => [tabKey, await loadHeroLottiesForTab(tabKey)] as const),
    ).then((entries) => {
      if (!active) {
        return;
      }
      const result: Record<string, readonly LottieSource[]> = {};
      for (const [tabKey, slides] of entries) {
        if (slides.length) {
          result[tabKey] = slides;
        }
      }
      setSlidesByTab(result);
    });
    return () => {
      active = false;
    };
  }, [clusterKey, detectingCluster]);

  return slidesByTab;
}

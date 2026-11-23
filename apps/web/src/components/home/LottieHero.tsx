'use client';

import { DotLottieReact, setWasmUrl } from '@lottiefiles/dotlottie-react';
import { useEffect, useState } from 'react';

import { ENDPOINTS, http, imageUri } from '@mealawe/core';
import { useClusterStore } from '@mealawe/state';

import { cn } from '@/lib/cn';
import { ENV } from '@/lib/env';

// Self-hosted player runtime (no third-party CDN request).
setWasmUrl('/lottie/dotlottie-player.wasm');

/** Apartment has one dashboard slot per order type (same keys as mobile's tabTheme). */
export type HeroTab = 'subscription' | 'bulk' | 'dinein' | 'ondemand' | 'apartment_instant' | 'apartment_today' | 'apartment_advance';

interface ServerSlide {
  lottieFile: string;
  order?: number;
}

/** Bundled per-tab animations (same files as the mobile app) used when the dashboard has none configured. */
const FALLBACK: Partial<Record<HeroTab, string>> = {
  subscription: '/lottie/SubscriptionHero.json',
  bulk: '/lottie/BulkHero.json',
  dinein: '/lottie/DineInHero.json',
  ondemand: '/lottie/OnDemandHero.json',
};
const KOTA_SUBSCRIPTION = '/lottie/KotaSubscriptionHero.json';
const ROTATE_MS = 6000;

/**
 * Hero animation band above the search bar. Mirrors mobile's LottieHero: slides come from the dashboard
 * (`/api/getHeroLottiesForTab/:tab?clusterConfigName=`, admin-managed per cluster config); when none are
 * configured the bundled animation for the tab is used (Kota gets its own subscription one). Several slides
 * rotate; reduced-motion users get a still frame.
 */
export function LottieHero({ tab }: { tab: HeroTab }) {
  const clusterKey = useClusterStore((s) => s.clusters.map((c) => c.clusterId).join(','));
  const isKota = useClusterStore((s) => s.clusters.some((c) => (c.clusterName ?? '').toLowerCase().includes('kota')));
  const [server, setServer] = useState<{ tab: HeroTab; key: string; urls: string[] } | null>(null);
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    let active = true;
    const configName = useClusterStore.getState().currentConfigName();
    // The dashboard stores slides per device OS and an OS-specific set replaces the generic one; without a platform only the
    // generic slides come back (1 instead of the 2-3 a phone shows). The server has no 'web' value, so web borrows ENV.heroPlatform.
    const params = new URLSearchParams();
    if (configName) params.set('clusterConfigName', configName);
    params.set('platform', ENV.heroPlatform);
    const query = `?${params.toString()}`;
    http
      .get<ServerSlide[]>(`${ENDPOINTS.home.heroLottiesForTab}/${encodeURIComponent(tab)}${query}`)
      .then((list) => {
        if (!active) return;
        const urls = (Array.isArray(list) ? [...list] : [])
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((s) => imageUri(s.lottieFile))
          .filter((u): u is string => !!u);
        setServer({ tab, key: clusterKey, urls });
      })
      .catch(() => active && setServer({ tab, key: clusterKey, urls: [] }));
    return () => {
      active = false;
    };
  }, [tab, clusterKey]);

  // Apartment has no bundled animation: with nothing configured for the cluster the band is simply not shown.
  const fallback = tab === 'subscription' && isKota ? KOTA_SUBSCRIPTION : FALLBACK[tab];
  // Only trust server slides that belong to the tab/cluster being shown (avoids a flash of the previous tab's slides).
  const fresh = server && server.tab === tab && server.key === clusterKey ? server.urls : null;
  // Wait for the dashboard answer before choosing: otherwise the bundled animation flashes first, then is swapped.
  const sources = fresh === null ? [] : fresh.length > 0 ? fresh : fallback ? [fallback] : [];

  useEffect(() => {
    setIndex(0);
  }, [tab, clusterKey, sources.length]);
  useEffect(() => {
    if (sources.length < 2 || reduced) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % sources.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [sources.length, reduced]);

  const current = sources.length > 0 ? sources[Math.min(index, sources.length - 1)] : null;
  if (fresh !== null && sources.length === 0) return null; // nothing configured for this cluster/tab
  return (
    <section aria-label="Offers" className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-dark via-primary to-primary-dark">
      <div className="h-36 sm:h-48 lg:h-60">
        {current ? <DotLottieReact key={current} src={current} loop autoplay={!reduced} layout={{ fit: 'cover', align: [0.5, 0.5] }} className="h-full w-full" /> : null}
      </div>
      {sources.length > 1 ? (
        <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5" role="tablist" aria-label="Slides">
          {sources.map((_, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === index} aria-label={`Slide ${i + 1}`} onClick={() => setIndex(i)} className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50')} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

'use client';

import { clusterApi, loadGroupedPackages, loadSubscriptionCategories } from '@mealawe/api';
import { http } from '@mealawe/core';
import { resolveApartment, loadApartmentAdvanceMenu, loadApartmentInstantMenu, loadApartmentTodayMenu } from '@/features/apartment/api';
import { useClusterStore, useLocationStore } from '@mealawe/state';
import { useState } from 'react';

import { ENV } from '@/lib/env';

/** Dev diagnostics: (1) API/AES round-trip, (2) cluster data + what the app currently resolved for this browser. */
export default function SmokePage() {
  const [out, setOut] = useState<string>('idle');
  const [info, setInfo] = useState<string>('');

  const run = async () => {
    setOut('running…');
    try {
      const list = await clusterApi.getGeoFencingList();
      setOut(`OK — ${Array.isArray(list) ? list.length : 0} geofenced clusters from ${ENV.apiUrl}`);
    } catch (e) {
      setOut(`FAILED — ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const catalog = async () => {
    setInfo('loading…');
    try {
      const [grouped, cats] = await Promise.all([loadGroupedPackages(), loadSubscriptionCategories()]);
      const keys = Object.keys(grouped);
      const catParams = cats.map((c) => c.param);
      setInfo(
        [
          '— categories from server (name | param | active | bestseller) —',
          ...cats.map((c) => c.name + ' | ' + c.param + ' | active=' + String(c.isActive) + ' | best=' + String(!!c.isBestseller)),
          '',
          '— package groups (key: count) —',
          ...keys.map((k) => k + ': ' + grouped[k].length + (catParams.some((p) => p.toLowerCase() === k.toLowerCase()) ? '' : '   <-- no matching category doc (hidden on home)')),
        ].join('\n'),
      );
    } catch (e) {
      setInfo('FAILED — ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  /** Which categories/packages actually carry an image field (read-only; no writes). */
  const images = async () => {
    setInfo('loading…');
    try {
      const [grouped, cats] = await Promise.all([loadGroupedPackages(), loadSubscriptionCategories()]);
      const lines: string[] = ['— managed categories: tile | detail | showcase —'];
      for (const c of cats) lines.push(`${c.name}: tile=${c.tileImage ? 'yes' : 'NO'} detail=${c.detailImage ? 'yes' : 'NO'} showcase=${c.showcaseImage ? 'yes' : 'NO'}`);
      lines.push('', '— package groups: packages with imageUrl / total —');
      for (const [k, list] of Object.entries(grouped)) lines.push(`${k}: ${list.filter((p) => p.imageUrl && p.imageUrl !== 'undefined').length}/${list.length}  e.g. ${list.find((p) => p.imageUrl)?.imageUrl ?? '-'}`);
      setInfo(lines.join('\n'));
    } catch (e) {
      setInfo('FAILED — ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const apartments = async (use: boolean) => {
    setInfo('loading…');
    try {
      const list = await http.get<{ apartmentName: string; isActive?: boolean; geolocation?: { lat: number; lng: number }; kitchenIds?: string[] }[]>('/api/getAllApartments');
      const showAll = new URLSearchParams(window.location.search).get('all') === '1';
      const rows = (Array.isArray(list) ? list : []).filter((a) => showAll || (a.isActive !== false && a.geolocation));
      if (use && rows[0]) {
        const pick = new URLSearchParams(window.location.search).get('apartment')?.toLowerCase();
        const a = (pick && rows.find((x) => x.apartmentName.toLowerCase().includes(pick))) || [...rows].sort((x, y) => (y.kitchenIds?.length ?? 0) - (x.kitchenIds?.length ?? 0))[0];
        // Diagnostic only: pretend this browser is standing in an apartment complex (?apartment=<name>, else the one with most kitchens).
        useLocationStore.getState().setCurrent({ tagLocation: 'Other', location: a.apartmentName, address: a.apartmentName, geolocation: a.geolocation! } as never);
      }
      setInfo(rows.map((a) => `${a.apartmentName} (active=${String(a.isActive)}) | ${a.geolocation?.lat},${a.geolocation?.lng} | kitchens=${a.kitchenIds?.length ?? 0}`).join('\n') || 'no active apartments');
    } catch (e) {
      setInfo('FAILED — ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const apartmentMenus = async () => {
    setInfo('loading…');
    try {
      const list = await http.get<{ _id: string; apartmentName: string; kitchenIds?: string[] }[]>('/api/getAllApartments');
      const withKitchens = (Array.isArray(list) ? list : []).filter((x) => (x.kitchenIds?.length ?? 0) > 0);
      const lines: string[] = [];
      for (const a of withKitchens) {
        const [t, i, ad] = await Promise.all([loadApartmentTodayMenu(a._id), loadApartmentInstantMenu(a._id), loadApartmentAdvanceMenu(a._id)]);
        lines.push(a.apartmentName + ' (' + a._id + '): today active=' + (t?.meta.totalActive ?? '?') + ' instant active=' + (i?.meta.totalActive ?? '?') + ' advance active=' + (ad?.meta.totalActive ?? '?'));
      }
      setInfo(lines.join('\n'));
    } catch (e) {
      setInfo('FAILED — ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const resolveAt = async () => {
    const q = new URLSearchParams(window.location.search);
    const lat = Number(q.get('lat')), lng = Number(q.get('lng'));
    const cur = useLocationStore.getState().current?.geolocation;
    const useLat = lat || cur?.lat, useLng = lng || cur?.lng;
    setInfo('resolving ' + useLat + ',' + useLng + ' …');
    try {
      const raw = await http.get<unknown>('/api/getNearestApartment/' + useLng + '/' + useLat);
      const resolved = await resolveApartment(useLng as number, useLat as number);
      setInfo('API ' + ENV.apiUrl + ' @ ' + useLat + ',' + useLng + ' | resolved=' + JSON.stringify(resolved) + ' | raw shape=' + (Array.isArray(raw) ? 'array(' + raw.length + ')' : JSON.stringify(raw).slice(0, 300)));
    } catch (e) {
      setInfo('FAILED — ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const heroSlides = async () => {
    setInfo('loading…');
    try {
      const cs = useClusterStore.getState();
      const name = cs.currentConfigName();
      const out: string[] = ['clusters=' + JSON.stringify(cs.clusters.map((c) => [c.clusterName, c.clusterConfigName])), 'configName=' + JSON.stringify(name)];
      for (const tab of ['subscription', 'bulk', 'dinein', 'ondemand']) {
        const base = name ? '?clusterConfigName=' + encodeURIComponent(name) : '?x=1';
        for (const q of [base, base + '&platform=android', base + '&platform=ios']) {
          const list = await http.get<unknown>('/api/getHeroLottiesForTab/' + tab + q);
          out.push(tab + ' ' + (q || '(no config)') + ': ' + JSON.stringify(list));
        }
      }
      setInfo(out.join('\n'));
    } catch (e) {
      setInfo('FAILED — ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const inspect = async () => {
    setInfo('loading…');
    try {
      const list = await clusterApi.getGeoFencingList();
      const rows = (Array.isArray(list) ? list : []).map((c) => `${c.clusterName ?? '?'} | configName=${JSON.stringify(c.clusterConfigName ?? null)} | id=${c.clusterId ? 'yes' : 'NO'} | active=${String(c.active)}`);
      const cs = useClusterStore.getState();
      const loc = useLocationStore.getState().current;
      setInfo(
        [
          '— geofencing clusters (name | clusterConfigName | id | active) —',
          ...rows,
          '',
          '— this browser —',
          `current address: ${loc ? `${loc.location} (${loc.geolocation?.lat?.toFixed?.(4)}, ${loc.geolocation?.lng?.toFixed?.(4)})` : 'none'}`,
          `detected clusters: ${cs.clusters.map((c) => `${c.clusterName}/${JSON.stringify(c.clusterConfigName)}`).join(', ') || 'none'}`,
          `currentConfigName(): ${JSON.stringify(cs.currentConfigName())}`,
          `flags: showSubscription=${cs.showSubscription} showBulk=${cs.showBulk} showDineIn=${cs.showDineIn} showOndemand=${cs.showOndemand} showClusterMenu=${cs.showClusterMenu}`,
        ].join('\n'),
      );
    } catch (e) {
      setInfo(`FAILED — ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">API smoke test</h1>
      <p className="text-sm text-muted-foreground">API: {ENV.apiUrl || '(NEXT_PUBLIC_API_URL not set)'}</p>
      <div className="flex gap-2">
        <button onClick={run} className="rounded-card bg-primary px-4 py-2 font-bold text-primary-foreground">Run</button>
        <button onClick={inspect} className="rounded-card border border-border px-4 py-2 font-bold">Inspect clusters</button>
        <button onClick={catalog} className="rounded-card border border-border px-4 py-2 font-bold">Inspect catalog</button>
        <button onClick={images} className="rounded-card border border-border px-4 py-2 font-bold">Inspect images</button>
        <button onClick={() => apartments(false)} className="rounded-card border border-border px-4 py-2 font-bold">Inspect apartments</button>
        <button onClick={apartmentMenus} className="rounded-card border border-border px-4 py-2 font-bold">Inspect apartment menus</button>
        <button onClick={resolveAt} className="rounded-card border border-border px-4 py-2 font-bold">Resolve apartment at ?lat&amp;lng (or current)</button>
        <button onClick={heroSlides} className="rounded-card border border-border px-4 py-2 font-bold">Inspect hero lotties</button>
        <button onClick={() => apartments(true)} className="rounded-card border border-border px-4 py-2 font-bold">Use first apartment as location</button>
      </div>
      <pre className="whitespace-pre-wrap rounded bg-muted p-3 text-sm" data-testid="smoke-out">{out}</pre>
      {info ? <pre className="whitespace-pre-wrap rounded bg-muted p-3 text-xs" data-testid="smoke-info">{info}</pre> : null}
    </main>
  );
}

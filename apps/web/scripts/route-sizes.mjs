#!/usr/bin/env node
/**
 * First-load JS per App Router route, read from the last `next build` (Turbopack or webpack).
 * Next 16 no longer prints this table, so we rebuild it from the build manifests:
 *   first load = build-manifest `rootMainFiles` (runtime/framework) + the route's `entryJSFiles`
 *                (layouts + page) from `page_client-reference-manifest.js`.
 * The legacy `polyfillFiles` (nomodule, skipped by modern browsers) are left out.
 *
 * Usage (from apps/web, after a build):  node scripts/route-sizes.mjs [--json] [--budget=<kB gzip>]
 * Writes .next/analyze/route-sizes.json. With --budget, exits 1 when any route's gzip first load exceeds it.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, '.next');
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const budgetArg = args.find((a) => a.startsWith('--budget='));
const budgetKb = budgetArg ? Number(budgetArg.split('=')[1]) : null;

const buildManifestPath = join(dist, 'build-manifest.json');
if (!existsSync(buildManifestPath)) {
  console.error('No build found in apps/web/.next. Run `npm run build` (or `npm run analyze`) first.');
  process.exit(1);
}
const buildManifest = JSON.parse(readFileSync(buildManifestPath, 'utf8'));
const rootMainFiles = buildManifest.rootMainFiles ?? [];

const sizeCache = new Map();
function sizeOf(file) {
  if (!sizeCache.has(file)) {
    const path = join(dist, file.replace(/^\/?_next\//, ''));
    const buf = existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
    sizeCache.set(file, { raw: buf.length, gzip: buf.length ? gzipSync(buf, { level: 9 }).length : 0 });
  }
  return sizeCache.get(file);
}
const total = (files) =>
  [...files].reduce((acc, f) => {
    const s = sizeOf(f);
    return { raw: acc.raw + s.raw, gzip: acc.gzip + s.gzip };
  }, { raw: 0, gzip: 0 });

function findManifests(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) findManifests(p, out);
    else if (entry.name === 'page_client-reference-manifest.js') out.push(p);
  }
  return out;
}

const appDir = join(dist, 'server', 'app');
const rows = [];
for (const file of findManifests(appDir)) {
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(file, 'utf8'), sandbox);
  for (const [key, manifest] of Object.entries(sandbox.__RSC_MANIFEST ?? {})) {
    const route = key.replace(/\/page$/, '') || '/';
    if (route.startsWith('/_')) continue; // _not-found, _global-error
    const files = new Set(rootMainFiles);
    if (manifest.entryJSFiles) {
      // Turbopack: per-entry (layouts + page) chunk lists.
      for (const list of Object.values(manifest.entryJSFiles)) list.forEach((f) => files.add(f));
    } else {
      // webpack: no entryJSFiles — collect the sync chunks of every client module, dropping other routes'
      // page/layout chunks (`static/chunks/app/<segments>/page-<hash>.js`) that share this manifest.
      const own = (f) => {
        const m = /static\/chunks\/app\/(?:(.*)\/)?(page|layout)-[^/]+\.js$/.exec(f);
        if (!m) return true;
        const seg = `/${m[1] ?? ''}`.replace(/\/$/, '') || '/';
        return m[2] === 'page' ? seg === route : route === seg || route.startsWith(seg === '/' ? '/' : `${seg}/`);
      };
      for (const mod of Object.values(manifest.clientModules ?? {})) {
        if (mod.async) continue;
        for (const c of mod.chunks ?? []) {
          const f = String(c).replace(/^\/?_next\//, '');
          if (f.endsWith('.js') && own(f)) files.add(f);
        }
      }
    }
    rows.push({ route, files });
  }
}

// "Shared" = files every route loads (runtime + root layout), reported once.
const shared = rows.length ? rows.map((r) => r.files).reduce((acc, set) => new Set([...acc].filter((x) => set.has(x)))) : new Set(rootMainFiles);
const sharedSize = total(shared);
const report = rows
  .map(({ route, files }) => ({
    route,
    firstLoad: total(files),
    routeOnly: total([...files].filter((f) => !shared.has(f))),
  }))
  .sort((a, b) => b.firstLoad.gzip - a.firstLoad.gzip);

mkdirSync(join(dist, 'analyze'), { recursive: true });
writeFileSync(
  join(dist, 'analyze', 'route-sizes.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), shared: { files: [...shared], ...sharedSize }, routes: report }, null, 2),
);

const kb = (n) => (n / 1024).toFixed(1).padStart(7) + ' kB';
if (asJson) {
  console.log(JSON.stringify({ shared: sharedSize, routes: report }, null, 2));
} else {
  const width = Math.max(8, ...report.map((r) => r.route.length));
  console.log(`\nFirst-load JS per route (gzip, level 9) — ${report.length} routes\n`);
  console.log(`${'Route'.padEnd(width)}  ${'First load'.padStart(10)}  ${'Route-only'.padStart(10)}  ${'Raw'.padStart(10)}`);
  console.log('-'.repeat(width + 38));
  for (const r of report) console.log(`${r.route.padEnd(width)}  ${kb(r.firstLoad.gzip)}  ${kb(r.routeOnly.gzip)}  ${kb(r.firstLoad.raw)}`);
  console.log('-'.repeat(width + 38));
  console.log(`${'Shared by all'.padEnd(width)}  ${kb(sharedSize.gzip)}  ${''.padStart(10)}  ${kb(sharedSize.raw)}`);
  console.log(`\nSaved: apps/web/.next/analyze/route-sizes.json`);
  if (existsSync(join(dist, 'analyze', 'client.html'))) console.log('Treemap: apps/web/.next/analyze/client.html (webpack build)');
}

if (budgetKb !== null) {
  const over = report.filter((r) => r.firstLoad.gzip / 1024 > budgetKb);
  if (over.length) {
    console.error(`\n${over.length} route(s) over the ${budgetKb} kB gzip budget: ${over.map((r) => r.route).join(', ')}`);
    process.exit(1);
  }
}

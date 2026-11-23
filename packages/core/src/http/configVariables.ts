import { runtimeCacheInterceptor } from '../runtimeCache';
import { ENDPOINTS } from './endpoints';
import { http } from './httpClient';

interface ConfigVariableRow {
  configName: string;
  configData: unknown;
}

/**
 * Generic `AppConfigVariable` reader — a direct port of the legacy Ionic
 * app's own `ApiMainService.getVariables(variableNames, from)`
 * (`POST /api/getVariables`, same endpoint this hits), including its exact
 * caching contract: results are cached under `` `CONFIG_VARIABLE${from}` ``
 * via `runtimeCacheInterceptor` (../runtimeCache.ts) and, since `ttlMs` is
 * optional and every real legacy call site omits it, live for the rest of
 * the app session by default — an admin's config change takes effect on
 * the NEXT app open, not necessarily mid-session, matching the legacy
 * app's own proven behavior (its cache has no TTL logic actually exercised
 * anywhere in that codebase either).
 *
 * `from` namespaces the cache per caller so two features reading DIFFERENT
 * variable sets never collide under the same key — always pick one unique
 * to what's being fetched. (The legacy app has a real, confirmed bug from
 * getting this wrong in one spot — a `resetCacheData('CONFIG_VARIABLE')`
 * call that doesn't match any `from`-suffixed key it ever actually wrote,
 * so it silently does nothing. Worth remembering if this cache is ever
 * invalidated from elsewhere: use `resetMatchingKeysCacheData
 * ('CONFIG_VARIABLE')` to catch every namespace, not the un-suffixed
 * literal.)
 *
 * This is intentionally GENERIC — not apartment-specific — so any feature
 * needing a small set of `AppConfigVariable` rows can call this directly
 * instead of hand-rolling its own fetch+cache (see
 * `features/apartment/config.ts`'s `loadApartmentConfig` for the first
 * real caller).
 */
export async function getConfigVariables(variableNames: string[], from: string, ttlMs?: number): Promise<Record<string, unknown>> {
  return runtimeCacheInterceptor(
    `CONFIG_VARIABLE${from}`,
    async () => {
      const rows = await http.post<ConfigVariableRow[]>(ENDPOINTS.support.variables, { variableNames });
      const map: Record<string, unknown> = {};
      for (const row of Array.isArray(rows) ? rows : []) {
        if (row?.configName) map[row.configName] = row.configData;
      }
      return map;
    },
    ttlMs,
  );
}

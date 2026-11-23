/**
 * Generic, in-memory "get-or-fetch" cache — a direct port of the legacy
 * Ionic app's own `RuntimeStorageService` + `ApiMainService`'s private
 * `runTimeCacheInterceptor` (MealaweUserApp/src/service/
 * runtime-storage.service.ts + apiService/apiMain.service.ts), which has
 * been the proven, working cache for config reads, kitchen lookups, banner
 * lists, etc. in that app for years. Ported here as its own general-purpose
 * module (not tied to any one feature) so any part of THIS app needing the
 * same "fetch once, reuse for the rest of the session, until told
 * otherwise" pattern can share one implementation, exactly like the legacy
 * app's own singleton.
 *
 * Deliberately matches the legacy semantics exactly, including the one that
 * matters most here: a cache entry has NO expiry by default (`ttlMs`
 * omitted) — nothing in the legacy app ever actually passed its own
 * `time` parameter for a real call site (confirmed by inspection), so in
 * practice every one of its cached values lives for the rest of the app
 * session and only goes away via an explicit `resetCacheData`/
 * `resetMatchingKeysCacheData`/`resetAllCacheData` call (logout, a mutating
 * action, a location change, ...), never a background timer. Giving this
 * app's own config reads a short TTL instead (an earlier attempt here) was
 * a genuine regression relative to that: a transient fetch failure could
 * "freeze" a wrong fallback value in place for the whole TTL window, which
 * is exactly the "settles on 35, randomly shows 30, then 35 again" bug this
 * port fixes by going back to the legacy's own proven default.
 *
 * Cached by PROMISE, not by resolved value — two callers racing for the
 * same key while the first fetch is still in flight share that one request
 * instead of each firing their own (the legacy version has no such
 * de-duplication; this is a deliberate, low-risk improvement on top of it,
 * not a fidelity gap that matters for correctness).
 */
interface CacheEntry<T> {
  promise: Promise<T>;
  expiresAt: number | null; // null = never expires, matches the legacy's `dataSetTime = null`
}

const cacheObj = new Map<string, CacheEntry<unknown>>();

function isValid(entry: CacheEntry<unknown>): boolean {
  return entry.expiresAt === null || entry.expiresAt > Date.now();
}

/**
 * Resolves from cache when `key` has a live (non-expired) entry; otherwise
 * calls `fetchFn()`, caches whatever it resolves to (under `ttlMs` if
 * given, else forever-until-invalidated), and resolves with that.
 *
 * A REJECTED `fetchFn()` is never cached — matches the legacy
 * interceptor's own try/catch (a failed `REQUEST` just rejects, nothing is
 * ever written to `cacheObj` on failure), so the very next call retries for
 * real instead of being stuck serving a poisoned "successful" entry for
 * the rest of the TTL.
 */
export function runtimeCacheInterceptor<T>(key: string, fetchFn: () => Promise<T>, ttlMs?: number): Promise<T> {
  const existing = cacheObj.get(key);
  if (existing && isValid(existing)) return existing.promise as Promise<T>;

  const promise = fetchFn().catch((error: unknown) => {
    cacheObj.delete(key);
    throw error;
  });
  cacheObj.set(key, { promise, expiresAt: ttlMs ? Date.now() + ttlMs : null });
  return promise;
}

/** Exact-key invalidation — mirrors `RuntimeStorageService.resetCacheData`. */
export function resetCacheData(key: string): void {
  cacheObj.delete(key);
}

/** Substring-match invalidation for keys built with a dynamic suffix
 * (an id, a page number, coordinates, ...) — mirrors
 * `RuntimeStorageService.resetMatchingKeysCacheDate`. The legacy app's own
 * name has a typo ("CacheDate" for "CacheData") kept nowhere here — this is
 * a fresh port, not a copy-paste, so it's spelled correctly. */
export function resetMatchingKeysCacheData(keySubstring: string): void {
  for (const key of cacheObj.keys()) {
    if (key.includes(keySubstring)) cacheObj.delete(key);
  }
}

/** Full flush — mirrors `RuntimeStorageService.resetAllCacheData` (called
 * on logout in the legacy app). Not wired into anything automatically here;
 * call it from wherever this app's own logout flow lives if the same
 * behavior is wanted. */
export function resetAllCacheData(): void {
  cacheObj.clear();
}

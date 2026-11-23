import { File, Paths } from 'expo-file-system';

/** Cache keys are server-issued filenames (see callers) — safe already, but
 * strip path separators defensively so a malformed key can never escape
 * `Paths.cache` via `../`. */
function sanitizeKey(key: string): string {
  return key.replace(/[\\/]/g, '_');
}

/** In-flight downloads keyed by cache key, so two callers requesting the
 * same file at once (e.g. two `LottieView`s mounting together) share one
 * download instead of racing duplicate ones. */
const inFlight = new Map<string, Promise<string>>();

/**
 * Downloads `remoteUri` to a stable local file under the OS-managed cache
 * directory the first time it's requested for `cacheKey`; every later call
 * for the same key resolves from disk instead of the network.
 *
 * `Paths.cache` is entirely OS-owned — purged under storage pressure and
 * always removed on app uninstall — so there's nothing to clean up manually
 * for either case. Cache keys should be a value that changes whenever the
 * underlying file's *content* changes (e.g. a server-issued filename from an
 * upload pipeline that mints a fresh name per upload) so a re-upload busts
 * the cache automatically instead of ever serving stale bytes.
 *
 * Throws if the download fails — callers should catch and fall back to
 * `remoteUri` directly (same "best effort, never block rendering" pattern
 * already used across this app's media loading).
 */
export async function getCachedFileUri(remoteUri: string, cacheKey: string): Promise<string> {
  const dest = new File(Paths.cache, sanitizeKey(cacheKey));
  if (dest.exists) {
    return dest.uri;
  }

  const existing = inFlight.get(cacheKey);
  if (existing) {
    return existing;
  }

  const download = (async () => {
    try {
      await File.downloadFileAsync(remoteUri, dest, { idempotent: true });
      return dest.uri;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();
  inFlight.set(cacheKey, download);
  return download;
}

/**
 * Synchronous local-disk check only — never touches the network. Returns the
 * cached file's local `file://` uri if `cacheKey` has already been fully
 * downloaded, `null` otherwise.
 */
export function getCachedFileUriIfPresent(cacheKey: string): string | null {
  const dest = new File(Paths.cache, sanitizeKey(cacheKey));
  return dest.exists ? dest.uri : null;
}

/**
 * Fire-and-forget: downloads `remoteUri` to disk under `cacheKey` if it
 * isn't already cached, without making the caller wait for it. Use this from
 * a render/data-loading path that must return immediately (e.g. rendering
 * the remote uri directly this time) but wants the *next* call to
 * `getCachedFileUriIfPresent` for the same key to hit the disk cache.
 * Failures are swallowed — worst case, the next caller just tries again.
 */
export function warmFileCache(remoteUri: string, cacheKey: string): void {
  const key = sanitizeKey(cacheKey);
  if (inFlight.has(cacheKey) || getCachedFileUriIfPresent(cacheKey)) {
    return;
  }
  const dest = new File(Paths.cache, key);
  const download = (async () => {
    try {
      await File.downloadFileAsync(remoteUri, dest, { idempotent: true });
      return dest.uri;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();
  inFlight.set(cacheKey, download);
}

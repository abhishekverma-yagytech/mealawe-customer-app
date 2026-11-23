import { Platform } from 'react-native';

import { ENDPOINTS, http } from '@/services/http';
import { imageUri } from '@/features/subscription/media';
import { getCachedFileUriIfPresent, warmFileCache } from '@/services/mediaCache';
import { useClusterStore } from '@/store/clusterStore';

import type { LottieSource } from './homeLotties';

/** The `HeroLottieConfig` shape returned by `getHeroLottiesForTab`. */
export interface ServerHeroLottieSlide {
  _id: string;
  tabKey: string;
  lottieFile: string;
  order?: number;
}

/** The user's current cluster CONFIG name, or '' when unresolved — same
 * scoping level `loadSubscriptionCategories` resolves the hero slides'
 * cluster-specific-override-vs-global precedence against, server-side. */
function lastClusterConfigName(): string {
  return useClusterStore.getState().currentConfigName();
}

/**
 * Admin-configured hero Lottie slides for one order-mode tab (`useHeroLotties`
 * fans this out across all 4 tabs). `[]` on error or when nothing is
 * configured yet for this tab/cluster — the caller (`tabThemeFor`) falls back
 * to the bundled local animation, same "empty means fall back" convention as
 * `loadSubscriptionCategories`.
 *
 * The list of slide filenames is always re-fetched from the server (never
 * cached), so a config change (reorder, add, remove) shows up on the next
 * home-screen mount. The animation *bytes* for each slide are cached to
 * local disk keyed by the server's own filename — the upload pipeline mints
 * a fresh filename on every admin upload (`image-handler.js`'s UUID-based S3
 * key), so a genuinely new/changed animation always busts the cache and
 * downloads fresh, while an unchanged filename skips straight to a local
 * disk read instead of the network.
 *
 * Resolution never blocks on a network download: an already-cached slide
 * resolves to its local file instantly, but an uncached one returns the
 * direct CDN url immediately (exactly like before this cache existed —
 * `LottieView` streams it directly) while the download happens in the
 * background via `warmFileCache`. Awaiting the download here would mean one
 * slow/stuck CDN fetch blocks `useHeroLotties`' `Promise.all` across *all*
 * 4 tabs, since it awaits every tab's slide list before showing any of them.
 */
export async function loadHeroLottiesForTab(tabKey: string): Promise<LottieSource[]> {
  const clusterConfigName = lastClusterConfigName();
  const query = clusterConfigName ? `?clusterConfigName=${encodeURIComponent(clusterConfigName)}` : '';
  try {
    const list = await http.get<ServerHeroLottieSlide[]>(
      `${ENDPOINTS.home.heroLottiesForTab}/${encodeURIComponent(tabKey)}${query}`,
    );
    if (!Array.isArray(list)) {
      return [];
    }
    return list
      .map((slide) => resolveLottieSource(slide.lottieFile))
      .filter((source): source is LottieSource => !!source);
  } catch {
    return [];
  }
}

/** Resolves one slide's server filename to its cached local `{uri}` if
 * already downloaded, otherwise the direct CDN `{uri}` while a background
 * download warms the cache for next time (see `loadHeroLottiesForTab`). */
function resolveLottieSource(lottieFile: string): LottieSource | null {
  const remoteUri = imageUri(lottieFile);
  if (!remoteUri) {
    return null;
  }
  const cachedUri = getCachedFileUriIfPresent(lottieFile);
  if (cachedUri) {
    return { uri: toLottieCompatibleUri(cachedUri) };
  }
  warmFileCache(remoteUri, lottieFile);
  return { uri: remoteUri };
}

/**
 * `lottie-react-native`'s Android native code resolves a plain-JSON `{uri}`
 * source via Kotlin's `File(String)` constructor
 * (`LottieAnimationViewPropertyManager.kt`'s `animationURL` handling), which
 * does NOT strip a `file://` scheme prefix — `File("file:///data/...")`
 * doesn't exist as a literal path, so `.exists()` is false and it silently
 * falls through to treating the local path as a network URL to fetch,
 * which fails and renders nothing. Stripping the scheme ourselves for
 * Android only works around it; iOS's `URL(string:)`-based resolution
 * already handles `file://` URIs correctly, so leave it untouched there.
 */
function toLottieCompatibleUri(fileUri: string): string {
  return Platform.OS === 'android' ? fileUri.replace(/^file:\/\//, '') : fileUri;
}

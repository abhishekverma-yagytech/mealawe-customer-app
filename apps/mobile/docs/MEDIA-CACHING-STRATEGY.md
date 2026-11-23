# Media Caching Strategy — Images, Video, Lottie

Status: proposed · Owner: mobile team · Scope: MealaweUserAppRN

## 1. The reported problem

Switching order-mode tabs on the home screen (Subscription / Bulk / Dine In /
On Demand) shows a brief blank/frozen beat before the new tab's hero
animation starts playing.

Root cause, confirmed by reading the actual code path:

1. Every hero Lottie is **100% remote** today. `HOME_HERO_LOTTIES` in
   `src/features/home/homeLotties.ts` is four empty arrays — there is no
   bundled local fallback anymore. `useHeroLotties()` fetches each tab's
   animation URL from the dashboard-managed `HeroLottieConfig` API
   (`src/features/home/api.ts`), and every slide becomes a
   `{ uri: <CDN url> }` source.
2. `LottieHero` is deliberately **remounted on every tab switch** —
   `(tabs)/index.tsx` renders it with `key={activeTab}` on purpose (so the
   carousel index and playback state reset per tab). That's correct for
   playback state, but it also means a brand-new `LottieView` mounts for
   every slide of the new tab, every single time.
3. `lottie-react-native`'s `source={{ uri }}` has no dependable persistent
   disk cache of its own for remote sources — this is a long-standing,
   widely reported gap in the underlying library (airbnb/lottie-ios and
   lottie-android). Nothing in this app's code works around it today.

Net effect: **every tab switch re-downloads and re-parses that tab's
animation file from the CDN**, forever, every session — that download+parse
time is the "milliseconds before loading" the user is seeing. It is not a
one-time cold-start cost; it repeats on every switch.

This is a real, fixable bug, not a platform limitation — see §3.

## 2. Current-state audit

| Media type | Library | Default caching | Used in this app? | Verdict |
|---|---|---|---|---|
| Images | `expo-image` 57.0.3 (24 call sites) | **Disk cache by default** (`cachePolicy: 'disk'`) | Yes, everywhere images render | Already good. Gaps are prefetching + placeholders (§4), not a broken cache. |
| Video | `expo-video` 57.0.1 (1 call site: login hero) | Off by default; native LRU disk cache available via `useCaching: true` on the `VideoSource` (1GB default, persists offline, evicted LRU) | `useHeroVideoPlayer.ts` already hand-rolls a **download-to-local-file** cache for iOS only (see below) | Proven pattern exists in this exact codebase — just not generalized or applied to Android. |
| Lottie (bundled) | `lottie-react-native` 7.3.8, `require()`'d local `.json`/`.lottie` | Instant — ships in the JS bundle/assets | `SplashAnimationOverlay`, `DineInPlanBanner`, `SavingsBanner`, `CouponCelebration` | Fine as-is, no action needed. |
| Lottie (remote/CDN) | same library, `{ uri }` source | **None** — no persistent cache for remote sources | `LottieHero` (all 4 home tabs) | **This is the bug.** |

### The pattern already proven in this codebase

`src/features/auth/hooks/useHeroVideoPlayer.ts` already solves exactly this
class of problem for the login screen's hero video, on iOS:

```ts
const cached = new File(Paths.cache, `hero-login-${video?.videoFile}`);
if (!cached.exists) {
  await File.downloadFileAsync(remoteUri, cached, { idempotent: true });
}
setSource({ uri: cached.uri });
```

Download once to `expo-file-system`'s cache directory, keyed by the server's
own filename; every subsequent read is a local disk hit, not a network
round-trip. This is the right building block — it just needs to be pulled
out into something `LottieHero` (and anything else) can reuse, instead of
staying a one-off inline to the video hook.

## 3. Proposed architecture: one shared file-cache utility

Add `src/services/mediaCache/fileCache.ts`:

```ts
import { File, Paths } from 'expo-file-system';

/**
 * Downloads `remoteUri` to a stable local file the first time it's
 * requested; every later call for the same `cacheKey` resolves instantly
 * from disk. Concurrent calls for the same key share one in-flight download
 * instead of racing multiple downloads of the same file.
 */
export async function getCachedFileUri(remoteUri: string, cacheKey: string): Promise<string> {
  const dest = new File(Paths.cache, cacheKey);
  if (dest.exists) return dest.uri;
  await dedupeInFlight(cacheKey, () => File.downloadFileAsync(remoteUri, dest, { idempotent: true }));
  return dest.uri;
}
```

(`dedupeInFlight` is a small in-memory `Map<string, Promise<...>>` guard —
prevents two `LottieView`s or two tab switches racing the same download.)

This is the exact mechanism `useHeroVideoPlayer` already validated in
production for iOS video — the only new work is generalizing it and pointing
more call sites at it.

### Applying it

- **`LottieHero` / `useHeroLotties`** (the actual bug, and the priority
  fix): prefetch all 4 tabs' animation files to local disk as soon as
  `useHeroLotties()` resolves the URL list — not lazily per tab switch.
  `useHeroLotties` already fetches all 4 tabs' *URLs* up front (see its own
  doc comment: "so switching tabs never re-fetches or shows a loading
  flash") — it just never downloads the animation *bytes* ahead of time.
  Feed `getCachedFileUri()` the resolved URL for each slide, swap `{ uri:
  remoteUri }` for `{ uri: localFileUri }` once cached, and every tab switch
  after the first app-open becomes a local disk read.
- **`useHeroVideoPlayer`**: refactor its inline download logic to call the
  shared utility instead of duplicating it. Also enable `VideoSource.useCaching:
  true` on the Android branch (which currently plays directly from the CDN
  since it doesn't have iOS's Range-request problem) — free bandwidth/replay
  win with a one-line change, no code restructuring needed there.
- **`DineInPlanBanner` / `SavingsBanner` / `CouponCelebration`**: confirm
  whether any of these are (or will become) dashboard/server-configured like
  the hero animations. If so, route them through the same utility
  pre-emptively rather than waiting for the same bug to reappear there.

## 4. Images — tuning, not fixing

`expo-image` already disk-caches by default, so there's no correctness bug
here. Two genuine improvements:

1. **Prefetch predictable next screens.** `Image.prefetch(urls)` (static
   method) warms the cache before the user navigates — e.g. prefetch a
   subscription category's plan-card images as soon as the category list
   loads, or a kitchen's menu-item images as soon as its card is visible in
   a list, so the detail screen's images are already on disk by the time
   it's opened.
2. **Blurhash/thumbhash placeholders.** Not used anywhere today
   (`placeholder` prop). Cheap perceived-speed win for the biggest/slowest
   images (subscription plan hero images, kitchen banners) — needs a
   backend change to generate and store a blurhash string alongside each
   uploaded image (Expo's own docs include a ready-made Express/`sharp`
   snippet for this).

No `cachePolicy` overrides needed generally — `'disk'` (the default) is
correct for nearly everything here. The one exception: tiny, extremely
frequently-re-rendered assets (nav icons, category tile thumbnails) can use
`cachePolicy="memory-disk"` to skip a disk read entirely on rapid re-renders
(e.g. scrolling a list back and forth).

## 5. Video — enable what's already built

- Turn on `useCaching: true` for the Android video source in
  `useHeroVideoPlayer.ts` (see §3).
- Leave iOS on its existing download-first approach — it's solving a real
  protocol problem (no Range-request support server-side), not just a
  performance one, so `useCaching` alone wouldn't fix iOS.
- Track `getCurrentVideoCacheSize()` / call `setVideoCacheSizeAsync()` only
  if this app ever adds more than a couple of cached videos — the 1GB
  default is generous for a single login hero video today.

## 6. Cache lifecycle

- **Size**: Lottie animations are KB-sized JSON/dotLottie files — even
  caching every hero animation for every tab/cluster variant the app has
  ever shown a user stays well under a few MB. No eviction policy needed at
  first; revisit only if usage data says otherwise.
- **Invalidation**: cache key = the server's own filename (already unique
  per upload, same convention `useHeroVideoPlayer` uses today) — a
  re-uploaded animation gets a new filename, so there's never a stale-cache
  problem to solve explicitly.
- **Manual clear**: `expo-file-system`'s `Paths.cache` directory is already
  OS-managed (cleared under storage pressure) — no custom eviction code
  needed for a v1.

## 7. Implementation steps

1. Add `src/services/mediaCache/fileCache.ts` (`getCachedFileUri` + in-flight
   dedupe map). Pure TS, no new dependency — `expo-file-system` is already
   installed.
2. Update `homeLotties.ts`'s `LottieSource` handling / `useHeroLotties.ts` to
   resolve each slide through `getCachedFileUri()` before storing it in
   `slidesByTab` state, so `LottieHero` always receives an already-local (or
   in-flight-caching) URI.
3. Refactor `useHeroVideoPlayer.ts` to call the shared utility instead of its
   inline `File`/`Paths.cache` logic; add `useCaching: true` to the Android
   source branch.
4. Audit `DineInPlanBanner`, `SavingsBanner`, `CouponCelebration` for any
   server-driven sources; route through the same utility if found.
5. (Optional, lower priority) Add `Image.prefetch()` calls at 1-2 of the most
   valuable predictable-navigation points (category list → plan detail,
   kitchen list → kitchen detail).
6. (Optional, lower priority) Backend: generate + store a blurhash string per
   uploaded image; wire `placeholder={{ blurhash }}` into the highest-impact
   `expo-image` call sites.

Steps 1-4 directly fix the reported bug. Steps 5-6 are polish, worth doing
but not blocking.

## 8. Testing / verification

- Cold app open on a fresh install → first tab switch to each of the 4
  order-mode tabs should still show the current (acceptable, one-time)
  network delay; every switch *after* that should be visibly instant.
- Force airplane mode after the first successful app open → tab switches
  should still show each tab's hero animation (proves it's reading from
  local disk, not network).
- Re-upload a hero animation from the admin dashboard for one tab → confirm
  the app picks up the new file (new filename → new cache key → fresh
  download), not the stale cached one.
- Login screen hero video: repeat-visit the login screen on Android after
  first load → should not re-buffer from network (network tab / airplane
  mode check).

## 9. Rollout

No native rebuild required — `expo-file-system`, `expo-image`, and
`expo-video` are already installed dependencies; every change here is
JS/TS. Metro hot-reloads throughout development.

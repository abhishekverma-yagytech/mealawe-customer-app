import LottieView, { type AnimationObject } from 'lottie-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { imageUri } from '@/features/subscription/media';

import { splashApi } from './splashApi';

/** Matches the native launch screen's `expo-splash-screen` plugin config in
 * app.json (`backgroundColor` / `dark.backgroundColor`) — the handoff from
 * native splash to this overlay must be a solid-color match, or the swap
 * flashes. */
export const SPLASH_BACKGROUND = '#30B34A';

/** How long to wait for the splash animation before giving up and revealing
 * the app anyway — a corrupt/undecodable asset must never strand the user on
 * the handoff screen forever. Covers the *entire* overlay lifetime (source
 * resolution + playback combined), not just playback — see the mount-time
 * `useEffect` below, which starts this timer immediately regardless of
 * whether the admin-configured source has resolved yet. */
const SPLASH_ANIMATION_TIMEOUT_MS = 5000;

/** Cap on how long the admin-configured Lottie fetch (dashboard-managed,
 * `splashApi.getActiveSplashLottie`) is allowed to delay the first frame —
 * splash is the single most latency-sensitive screen in the app (the literal
 * first thing shown, before any navigation or auth), so a slow/failed fetch
 * just means playing the bundled animation instead of making the user wait
 * longer for a network round-trip. Deliberately well under
 * SPLASH_ANIMATION_TIMEOUT_MS, so even a full fetch timeout still leaves most
 * of the 5s budget for the animation itself to play. */
const SOURCE_FETCH_TIMEOUT_MS = 1200;

type LottieSourceType = AnimationObject | { uri: string };

/** The original bundled splash animation — kept as the permanent fallback
 * (unlike the home hero carousel or login video, which have since dropped
 * their bundled fallbacks once dashboard data was confirmed reliable) since
 * a broken first-launch impression is a much worse failure mode than a
 * missing carousel slide. */
const BUNDLED_SPLASH_SOURCE: LottieSourceType = require('@/assets/lottie/splash.json');

/** Resolves the admin-configured splash Lottie if it answers within
 * SOURCE_FETCH_TIMEOUT_MS, else the bundled local animation — never blocks
 * longer than the cap, and any fetch/parse error or empty config degrades to
 * the bundled asset exactly like a timeout does. */
async function resolveSplashSource(): Promise<LottieSourceType> {
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), SOURCE_FETCH_TIMEOUT_MS);
  });
  const fetched = await Promise.race([splashApi.getActiveSplashLottie(), timeout]);
  const uri = fetched?.lottieFile ? imageUri(fetched.lottieFile) : undefined;
  return uri ? { uri } : BUNDLED_SPLASH_SOURCE;
}

interface SplashAnimationOverlayProps {
  /** Called once — animation finished, failed to load, or timed out. */
  onFinished: () => void;
}

/**
 * The "handoff" screen shown right after the native (static PNG) launch
 * screen comes down: a full-bleed once-through Lottie animation over the
 * same solid background color, giving the effect of an animated splash
 * without violating Expo's native-splash-is-static-only constraint.
 * Lottie, not a video: this overlay mounts at the app root, overlapping the
 * Stack navigator, right as the native splash's own surface is being torn
 * down — `expo-video`'s `VideoView` needs a hardware `SurfaceView` to bind
 * to a fully-settled window to actually render anything there and silently
 * failed to (even with `surfaceType="textureView"` and deferred
 * `hideAsync()` timing). `lottie-react-native` renders through the normal
 * view hierarchy like any other view, with no such attachment requirement,
 * and is already proven reliable everywhere else in this app (home hero).
 * Unmount this once `onFinished` fires to reveal the real app underneath.
 *
 * The animation itself is admin-configurable (dashboard's "Common App
 * Config" page, `SplashLottieConfig`) — resolved via `resolveSplashSource`
 * above, which always falls back to the bundled local file if nothing's
 * configured or the fetch is slow/fails, so this never looks any different
 * from before until an admin actually uploads a replacement.
 */
export function SplashAnimationOverlay({ onFinished }: SplashAnimationOverlayProps) {
  const [hasError, setHasError] = useState(false);
  const [source, setSource] = useState<LottieSourceType | null>(null);
  const finishedRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  function finishOnce(): void {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinishedRef.current();
  }

  useEffect(() => {
    const timeout = setTimeout(finishOnce, SPLASH_ANIMATION_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let active = true;
    resolveSplashSource().then((resolved) => {
      if (active) setSource(resolved);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, styles.background]}>
      {source && !hasError && (
        <LottieView
          source={source}
          autoPlay
          loop={false}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          onAnimationFinish={finishOnce}
          onAnimationFailure={() => {
            setHasError(true);
            finishOnce();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: SPLASH_BACKGROUND,
  },
});

import { LinearGradient } from 'expo-linear-gradient';
import LottieView from 'lottie-react-native';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { mixHex, palette } from '@/theme';

import { type LottieSource } from '../homeLotties';
import { DEFAULT_TAB_THEME } from '../tabTheme';

interface LottieHeroProps {
  /** Animations to play for the active tab. Empty → gradient only. */
  sources?: LottieSource[];
  /** Gradient accent for the active tab — fades toward the brand's deep teal.
   * Defaults to brand green (today's look). */
  tint?: string;
  /** Hero band height (the header floats over the top of it). */
  height?: number;
  /** How long each slide is shown before auto-advancing (ms). */
  slideDurationMs?: number;
}

/**
 * Extra height each Lottie renders above the visible hero band, so its art
 * can bleed up behind the status bar/header instead of leaving a gap there.
 * The bottom edge always stays flush with the hero's bottom (see
 * `contentContainerStyle` below) — only the top is allowed to float, which is
 * why animations should keep their bottom ~24dp clear (the body sheet's
 * rounded lip overlaps that strip) and treat their top ~90dp as an
 * overlay zone (status bar + the address/profile header row sit on top of it).
 */
const TOP_BLEED = 64;

/**
 * Full-bleed hero background for the home top section: an auto-advancing carousel
 * of Lottie animations over the brand gradient, with story-style progress bars
 * that fill over each slide's duration and then advance to the next (looping).
 * Still thumb-swipeable. Renders the gradient alone until animations are
 * registered in `homeLotties.ts`. Mirrors mealaweApp's hero-behind-the-header.
 */
export function LottieHero({
  sources = DEFAULT_TAB_THEME.lotties,
  tint = palette.brand.green,
  height = 300,
  slideDurationMs = 4000,
}: LottieHeroProps) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const lottieRefs = useRef<(LottieView | null)[]>([]);
  // Tracks which slides' native view has actually finished loading its
  // source — for a server-configured slide this is a *remote* `{ uri }`
  // animation (see `homeLotties.ts`/`useHeroLotties`), so on a cold app open
  // the very first slide's `.play()` call below can otherwise fire before
  // the native view has finished downloading/parsing it and gets silently
  // dropped (nothing crashes, it just never starts) — the hero then sits on
  // frame 0 until something else nudges it. Gating on `onAnimationLoaded`
  // (fired per slide, from `LottieView` below) instead of firing blind on
  // mount fixes that; a bundled/already-cached slide still loads near-
  // instantly so this adds no perceptible delay for the common case.
  const loadedRef = useRef<boolean[]>([]);
  // Bug fix ("hero looks blank/grey instead of the configured animation"): a
  // server-configured slide that fails to load (a malformed/incompatible
  // Lottie file, a network hiccup, ...) previously had no failure handling
  // at all — the native LottieView just sits there empty, opaque, and on
  // TOP of the gradient fallback below, hiding it behind nothing instead of
  // gracefully falling through to it. Tracking failed indices and skipping
  // their LottieView entirely (rendering nothing for that page instead) lets
  // the always-present gradient underneath show through exactly like the
  // "no slides configured" case already does.
  const [failedIndices, setFailedIndices] = useState<Set<number>>(() => new Set());
  const count = sources.length;

  // Every slide used to `autoPlay` unconditionally, so an off-screen slide
  // kept looping in the background the whole time it wasn't visible — by
  // the time the carousel actually reached it, it was however many loops
  // deep, not at frame 0. Now nothing autoplays; only the slide that just
  // became active gets explicitly reset + played (once its source has
  // loaded — see `loadedRef` above), and the one it replaced gets paused,
  // so every slide always starts fresh from its first frame whenever it
  // becomes visible.
  useEffect(() => {
    const active = lottieRefs.current[index];
    if (loadedRef.current[index]) {
      active?.reset();
      active?.play();
    }
    return () => {
      active?.pause();
    };
  }, [index]);

  // Drive the current slide's progress bar and auto-advance to the next slide.
  useEffect(() => {
    if (count <= 1) {
      return;
    }
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: slideDurationMs,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) {
        const next = (index + 1) % count;
        scrollRef.current?.scrollTo({ x: next * width, animated: true });
        setIndex(next);
      }
    });
    return () => anim.stop();
  }, [index, count, width, slideDurationMs, progress]);

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index) {
      setIndex(next); // restarts the progress/advance effect for the new slide
    }
  }

  return (
    <View style={{ height }} className="absolute inset-x-0 top-0 overflow-hidden">
      {/* Gradient base — always present, and the sole visual until a Lottie
          is registered for this tab. Tint → tint-toward-ink → deep teal reads
          well under white, same formula for every tab's accent. */}
      <LinearGradient
        colors={[tint, mixHex(tint, palette.brand.teal, 0.5), palette.brand.teal]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {count > 0 && (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          scrollEventThrottle={16}
          // Explicit width, not just flex-stretch from the parent — this View
          // sits inside the collapsing hero's animated/absolutely-positioned
          // wrapper, where stretch can resolve a frame late or a hair
          // narrower than each page's own declared `width` below. Without
          // this, the ScrollView's own viewport can end up narrower than a
          // page, so the next page peeks in even while sitting on page 1.
          style={{ height, width }}
          contentContainerStyle={{ alignItems: 'flex-end' }}>
          {sources.map((src, i) =>
            failedIndices.has(i) ? (
              // Skips rendering the LottieView entirely once it's confirmed to have
              // failed — an empty page here lets the gradient behind the whole
              // carousel show through instead of an opaque, blank native view.
              <View key={i} style={{ width, height }} />
            ) : (
              <LottieView
                key={i}
                ref={(r) => {
                  lottieRefs.current[i] = r;
                }}
                onAnimationLoaded={() => {
                  loadedRef.current[i] = true;
                  if (i === index) {
                    lottieRefs.current[i]?.reset();
                    lottieRefs.current[i]?.play();
                  }
                }}
                onAnimationFailure={() => {
                  setFailedIndices((prev) => {
                    const next = new Set(prev);
                    next.add(i);
                    return next;
                  });
                }}
                // require()'d `.lottie` assets resolve to a numeric asset id, which
                // the library supports at runtime but doesn't include in its source type.
                source={src as unknown as ComponentProps<typeof LottieView>['source']}
                loop
                // `cover`, not `contain`: the source composition (e.g.
                // home.json is 1170x972, aspect ~1.2) doesn't match the hero
                // frame's own aspect ratio, and never will exactly for every
                // device width. `contain` preserves the source's aspect ratio
                // no matter what box it's given, so it ALWAYS leaves a gap on
                // one axis (width or height, whichever doesn't end up as the
                // constraining dimension on a given device) — that gap is
                // what read as "first page not taking full width." `cover`
                // is the only mode that guarantees zero gaps on either axis;
                // it crops instead, and the crop is what anchors the visible
                // art low (see TOP_BLEED below) rather than centering it.
                resizeMode="cover"
                // Bottom-aligned within the row (see contentContainerStyle) so the
                // bottom edge is always flush with the hero's bottom; the extra
                // TOP_BLEED bleeds upward behind the status bar/header instead.
                style={{ width, height: height }}
              />
            ),
          )}
        </ScrollView>
      )}

      {/* Top scrim so white header text stays legible over bright animation frames. */}
      <LinearGradient
        colors={['rgba(4,42,51,0.45)', 'rgba(4,42,51,0)']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 140 }}
        pointerEvents="none"
      />

      {/* Story-style progress bars — short, centered; the active one fills.
          Sits above the body sheet's rounded lip (which overlaps the hero bottom). */}
      {count > 1 && (
        <View className="absolute inset-x-0 bottom-4 flex-row justify-center gap-1.5">
          {sources.map((_, i) => (
            <View
              key={i}
              className="h-1 w-6 overflow-hidden rounded-full bg-white/30">
              <Animated.View
                style={{
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: '#ffffff',
                  width:
                    i < index
                      ? '100%'
                      : i === index
                        ? progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          })
                        : '0%',
                }}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

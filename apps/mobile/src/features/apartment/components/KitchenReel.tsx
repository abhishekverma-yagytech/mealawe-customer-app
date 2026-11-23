import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
// Use RNGH's ScrollView so horizontal swipe works inside the bottom sheet's own gesture handling.
import { ScrollView } from 'react-native-gesture-handler';

import { AppText } from '@/components/ui/AppText';
import { IconChevronLeft, IconChevronRight, IconPlay, IconUtensils } from '@/components/ui/icons';
import { accentTint, palette } from '@/theme';

interface KitchenReelProps {
  /** Already fully resolved URLs — no URL building here. */
  images: string[];
  videos: string[];
}

type Slide = { kind: 'image'; uri: string } | { kind: 'video'; uri: string } | { kind: 'placeholder' };

const IMAGE_SLIDE_MS = 3000;

/** Auto-advancing image/video carousel below the dish info; videos play to completion, images advance after IMAGE_SLIDE_MS. */
export function KitchenReel({ images, videos }: KitchenReelProps) {
  const slides: Slide[] = [...videos.map((uri): Slide => ({ kind: 'video', uri })), ...images.map((uri): Slide => ({ kind: 'image', uri }))];
  const finalSlides: Slide[] = slides.length > 0 ? slides : [{ kind: 'placeholder' }];

  const { width: windowWidth } = useWindowDimensions();
  // Matches the sheet's 18px horizontal padding so the reel lines up with content below it.
  const reelWidth = windowWidth - 36;
  const reelHeight = Math.round(reelWidth * 0.62);

  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  function goTo(next: number): void {
    // Wraps around instead of stopping at the ends.
    const wrapped = (next + finalSlides.length) % finalSlides.length;
    scrollRef.current?.scrollTo({ x: wrapped * reelWidth, animated: true });
    setIndex(wrapped);
  }

  function onMomentumScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>): void {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / reelWidth));
  }

  const currentKind = finalSlides[index]?.kind;

  // Only auto-advances image/placeholder slides; video slides advance via onEnded instead.
  useEffect(() => {
    if (finalSlides.length <= 1 || currentKind === 'video') return;
    const t = setTimeout(() => goTo(index + 1), IMAGE_SLIDE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, finalSlides.length, currentKind]);

  return (
    <View style={{ marginHorizontal: 18, marginTop: 14, borderRadius: 18, overflow: 'hidden', backgroundColor: '#000' }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={{ width: reelWidth, height: reelHeight }}>
        {finalSlides.map((slide, i) => (
          <View key={i} style={{ width: reelWidth, height: reelHeight }}>
            {slide.kind === 'image' ? (
              <Image source={{ uri: slide.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : slide.kind === 'video' ? (
              <VideoSlide uri={slide.uri} width={reelWidth} height={reelHeight} isActive={i === index} onEnded={() => goTo(i + 1)} />
            ) : (
              // Fixed light tint regardless of theme — intentional, not a dark-mode oversight.
              <View className="h-full w-full items-center justify-center" style={{ backgroundColor: accentTint(palette.accent.food, 0.14) }}>
                <IconUtensils size={32} color={palette.accent.food} />
                <AppText variant="caption" style={{ color: palette.apartment.muted, marginTop: 8 }}>
                  No Photos and Videos yet
                </AppText>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {finalSlides.length > 1 ? (
        <>
          <Pressable
            onPress={() => goTo(index - 1)}
            accessibilityRole="button"
            accessibilityLabel="Previous"
            hitSlop={6}
            style={{ position: 'absolute', left: 8, top: reelHeight / 2 - 16, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center', justifyContent: 'center' }}>
            <IconChevronLeft size={18} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => goTo(index + 1)}
            accessibilityRole="button"
            accessibilityLabel="Next"
            hitSlop={6}
            style={{ position: 'absolute', right: 8, top: reelHeight / 2 - 16, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center', justifyContent: 'center' }}>
            <IconChevronRight size={18} color="#fff" />
          </Pressable>
          <View style={{ position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
            {finalSlides.map((_, i) => (
              <View key={i} style={{ width: i === index ? 14 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? '#fff' : 'rgba(255,255,255,.5)' }} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

/** One video slide. Plays once, muted, autoplaying if active on mount; also has a manual play/pause button. */
function VideoSlide({ uri, width, height, isActive, onEnded }: { uri: string; width: number; height: number; isActive: boolean; onEnded: () => void }) {
  // .play() called inside the setup callback so it fires once the player is actually ready.
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    if (isActive) p.play();
  });
  const [isPlaying, setIsPlaying] = useState(false);
  useEventListener(player, 'playingChange', ({ isPlaying: playing }) => setIsPlaying(playing));
  useEventListener(player, 'playToEnd', onEnded);

  useEffect(() => {
    if (isActive) player.play();
    else player.pause();
  }, [isActive, player]);

  return (
    <Pressable
      onPress={() => (isPlaying ? player.pause() : player.play())}
      style={{ width, height }}
      accessibilityRole="button"
      accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}>
      <VideoView player={player} style={{ width, height }} contentFit="cover" nativeControls={false} />
      {!isPlaying ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,.5)', alignItems: 'center', justifyContent: 'center' }}>
            <IconPlay size={22} color="#fff" fill="#fff" />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

import { Image } from 'expo-image';
import { VideoView, type VideoPlayer } from 'expo-video';
import { StyleSheet } from 'react-native';

const POSTER = require('../../../assets/images/auth/login-hero-poster.jpg');

interface HeroVideoBackgroundProps {
  player: VideoPlayer;
  hasVideoError: boolean;
  /** False before the admin-configured video URL has resolved. */
  hasSource: boolean;
}

/**
 * The poster (the video's own first frame) is a permanent base layer —
 * always rendered, never removed — with the looping video layered on top
 * once its source resolves and starts playing. Since the poster is exactly
 * the video's first frame, playback starting reads as that same static
 * image beginning to move, not a pop from an unrelated placeholder.
 */
export function HeroVideoBackground({ player, hasVideoError, hasSource }: HeroVideoBackgroundProps) {
  return (
    <>
      <Image source={POSTER} contentFit="cover" style={StyleSheet.absoluteFill} />
      {!hasVideoError && hasSource ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
          // iOS-only (silently ignored elsewhere) — nudges the video down
          // slightly within its `cover`-cropped frame, matching the framing
          // Android already gets by default.
          contentPosition={{ dy: 24 }}
        />
      ) : null}
    </>
  );
}

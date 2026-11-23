import { useEventListener } from 'expo';
import { useVideoPlayer, type VideoPlayer, type VideoSource } from 'expo-video';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { imageUri } from '@/features/subscription/media';
import { getCachedFileUri } from '@/services/mediaCache';

import { authApi } from '../authApi';

export interface HeroVideoPlayerState {
  player: VideoPlayer;
  hasVideoError: boolean;
  /** False until the admin-configured video URL has been resolved — no
   * bundled fallback exists anymore, so `HeroVideoBackground` should show
   * its static poster while this is false, same as it does on a real
   * playback error. */
  hasSource: boolean;
}

/**
 * Shared auth-screen hero video (login/register) with a poster fallback on
 * load failure. No bundled local fallback — starts with no source (the
 * `HeroVideoBackground` poster shows until one arrives) and plays the
 * admin-configured video (dashboard-managed, `authApi.getActiveLoginVideo`)
 * once that fetch resolves with one. The original bundled `welcome.mp4` (see
 * `assets/videos/`) is kept on disk so it can be uploaded through the
 * dashboard's Login Video Config form; once a real video is configured
 * there, the bundled file can be deleted too. `useVideoPlayer`
 * re-initializes (and re-runs `setup`) whenever `source` changes.
 */
export function useHeroVideoPlayer(): HeroVideoPlayerState {
  const [hasVideoError, setHasVideoError] = useState(false);
  const [source, setSource] = useState<VideoSource>(null);

  useEffect(() => {
    let active = true;
    authApi.getActiveLoginVideo().then(async (video) => {
      const remoteUri = video?.videoFile ? imageUri(video.videoFile) : undefined;
      if (!active || !remoteUri) {
        return;
      }
      // iOS's AVPlayer (unlike Android's ExoPlayer) needs the server to
      // support HTTP Range requests to stream a remote video at all — this
      // backend doesn't reliably provide that yet, which is why the hero
      // video plays fine on Android but never starts on iOS. Downloading it
      // to a local file first sidesteps the problem entirely: playback then
      // reads from disk, no streaming/ranges involved.
      if (Platform.OS !== 'ios') {
        // Android doesn't have iOS's Range-request problem, so it streams
        // directly — `useCaching` still gets expo-video's own native LRU
        // disk cache for free, so a repeat visit to this screen doesn't
        // re-download the same video from the network.
        setSource({ uri: remoteUri, useCaching: true });
        return;
      }
      try {
        // Cached by the server's own filename, so a newly-uploaded video
        // (different filename) downloads fresh instead of reusing a stale
        // local copy — see `getCachedFileUri`.
        const localUri = await getCachedFileUri(remoteUri, `hero-login-${video?.videoFile}`);
        if (active) {
          setSource({ uri: localUri });
        }
      } catch {
        // Download failed — fall back to the direct remote URL. Won't
        // stream on iOS either, but no worse than before this change.
        if (active) {
          setSource({ uri: remoteUri });
        }
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    if (source) p.play();
  });

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') setHasVideoError(true);
  });

  return { player, hasVideoError, hasSource: source !== null };
}

import {
  canRegisterTrackPlayerPlaybackService,
  getPlatformRuntimeLabel,
  isExpoGo,
} from "../utils/expoRuntime";

/**
 * Headless playback service (Android MusicService / iOS background audio).
 * Remote controls when JS is throttled; queue auto-advance stays native.
 *
 * NEVER top-level-import react-native-track-player — Metro must not load RNTP
 * in Expo Go on Android or iPhone. All access is require()-lazy inside this file.
 */
export default async function PlaybackService() {
  if (isExpoGo() || !canRegisterTrackPlayerPlaybackService()) {
    if (__DEV__ && isExpoGo()) {
      console.info(
        `[HiddenTunes][${getPlatformRuntimeLabel()}] PlaybackService skipped (Expo Go).`
      );
    }

    return;
  }

  const TrackPlayer = require("react-native-track-player").default;
  const { Event, State } = require("react-native-track-player");

  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    void TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    void TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemotePlayPause, () => {
    void (async () => {
      const playbackState = await TrackPlayer.getPlaybackState();
      if (playbackState.state === State.Playing) {
        await TrackPlayer.pause();
        return;
      }

      await TrackPlayer.play();
    })();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    void TrackPlayer.stop();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    void TrackPlayer.skipToNext();
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    void TrackPlayer.skipToPrevious();
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, (event?: { position?: number }) => {
    if (typeof event?.position === "number") {
      void TrackPlayer.seekTo(Math.max(0, event.position));
    }
  });
}

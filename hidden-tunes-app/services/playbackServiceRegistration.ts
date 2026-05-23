import TrackPlayer, { Event, State } from "react-native-track-player";

/**
 * Headless playback service (Android) / background task (iOS).
 * Handles lock-screen and Bluetooth remote controls when the JS thread is throttled.
 * Queue auto-advance is native; this service keeps remotes working in background.
 */
export default async function PlaybackService() {
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

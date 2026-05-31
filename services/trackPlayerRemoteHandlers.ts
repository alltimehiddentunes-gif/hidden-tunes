/**
 * Lock-screen / notification remote controls for react-native-track-player.
 * Used by the headless playback service and the main app bridge (foreground fallback).
 */

type TrackPlayerRuntime = {
  default: {
    play: () => Promise<void>;
    pause: () => Promise<void>;
    stop: () => Promise<void>;
    reset: () => Promise<void>;
    skipToNext: () => Promise<void>;
    skipToPrevious: () => Promise<void>;
    seekTo: (position: number) => Promise<void>;
    getPlaybackState: () => Promise<{ state: number }>;
    getActiveTrack: () => Promise<Record<string, unknown> | null | undefined>;
    addEventListener: (
      event: string,
      listener: (payload?: Record<string, unknown>) => void
    ) => { remove: () => void };
  };
  Event: Record<string, string>;
  State: { Playing: number };
};

function logRemote(event: string, details?: Record<string, unknown>) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log(`[HiddenTunes:TrackPlayer] remote:${event}`, {
    at: Date.now(),
    ...(details || {}),
  });
}

export function registerTrackPlayerRemoteHandlers(
  context: "playback_service" | "main_app" = "playback_service"
): Array<{ remove: () => void }> {
  const module = require("react-native-track-player") as TrackPlayerRuntime;
  const TrackPlayer = module.default;
  const { Event, State } = module;

  if (!TrackPlayer?.addEventListener) {
    logRemote("register_skipped", { context, reason: "TrackPlayer unavailable" });
    return [];
  }

  logRemote("handlers_registered", { context });

  const subscriptions: Array<{ remove: () => void }> = [];

  subscriptions.push(
    TrackPlayer.addEventListener(Event.RemotePlay, () => {
      logRemote("remote_play", { context });
      void TrackPlayer.play();
    })
  );

  subscriptions.push(
    TrackPlayer.addEventListener(Event.RemotePause, () => {
      logRemote("remote_pause", { context });
      void TrackPlayer.pause();
    })
  );

  subscriptions.push(
    TrackPlayer.addEventListener(Event.RemotePlayPause, () => {
      logRemote("remote_play_pause", { context });
      void (async () => {
        const playbackState = await TrackPlayer.getPlaybackState();
        if (playbackState.state === State.Playing) {
          await TrackPlayer.pause();
          return;
        }
        await TrackPlayer.play();
      })();
    })
  );

  subscriptions.push(
    TrackPlayer.addEventListener(Event.RemoteStop, () => {
      logRemote("remote_stop", { context });
      void (async () => {
        await TrackPlayer.stop();
        await TrackPlayer.reset();
      })();
    })
  );

  subscriptions.push(
    TrackPlayer.addEventListener(Event.RemoteNext, () => {
      logRemote("remote_next", { context });
      void TrackPlayer.skipToNext();
    })
  );

  subscriptions.push(
    TrackPlayer.addEventListener(Event.RemotePrevious, () => {
      logRemote("remote_previous", { context });
      void TrackPlayer.skipToPrevious();
    })
  );

  subscriptions.push(
    TrackPlayer.addEventListener(Event.RemoteSeek, (event?: { position?: number }) => {
      logRemote("remote_seek", { context, position: event?.position });
      if (typeof event?.position === "number") {
        void TrackPlayer.seekTo(Math.max(0, event.position));
      }
    })
  );

  subscriptions.push(
    TrackPlayer.addEventListener(Event.RemoteDuck, (event) => {
      logRemote("remote_duck", { context, ...(event || {}) });
      // Do not force-pause on transient duck/interruption events.
      // Lock-screen focus changes were stopping multi-track background sessions.
    })
  );

  return subscriptions;
}

export function unregisterTrackPlayerRemoteHandlers(
  subscriptions: Array<{ remove: () => void }>
) {
  subscriptions.forEach((subscription) => {
    try {
      subscription.remove();
    } catch {
      // ignore
    }
  });
}

/**
 * Lock-screen / notification remote controls for react-native-track-player.
 * Used by the headless playback service and the main app bridge (foreground fallback).
 */

import {
  observeTrackPlayerEvent,
  registerRemoteHandlerContext,
  registerTrackPlayerEventListener,
  unregisterRemoteHandlerContext,
} from "../utils/playbackReliabilityDiagnostics";

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

function logRemote(
  context: string,
  event: string,
  details?: Record<string, unknown>
) {
  observeTrackPlayerEvent(event, `remote:${context}`, details);
}

async function logActiveTrackMetadata(
  context: string,
  TrackPlayer: TrackPlayerRuntime["default"]
) {
  try {
    const track = await TrackPlayer.getActiveTrack();
    if (!track) {
      logRemote(context, "active_track_metadata", { track: null });
      return;
    }

    logRemote(context, "active_track_metadata", {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: track.artwork,
      url: typeof track.url === "string" ? track.url.slice(0, 80) : track.url,
    });
  } catch (error) {
    logRemote(context, "active_track_metadata_error", {
      message: String((error as Error)?.message || error),
    });
  }
}

export function registerTrackPlayerRemoteHandlers(
  context: "playback_service" | "main_app" = "playback_service"
): Array<{ remove: () => void }> {
  const module = require("react-native-track-player") as TrackPlayerRuntime;
  const TrackPlayer = module.default;
  const { Event, State } = module;

  if (!TrackPlayer?.addEventListener) {
    logRemote(context, "register_skipped", { reason: "TrackPlayer unavailable" });
    return [];
  }

  registerRemoteHandlerContext(context);
  logRemote(context, "handlers_registered", {});

  const subscriptions: Array<{ remove: () => void }> = [];

  const attach = (
    eventName: string,
    listener: (payload?: Record<string, unknown>) => void
  ) => {
    registerTrackPlayerEventListener(eventName, `remote:${context}`);
    subscriptions.push(TrackPlayer.addEventListener(eventName, listener));
  };

  attach(Event.RemotePlay, () => {
    logRemote(context, "remote_play", {});
    void TrackPlayer.play().then(() => logActiveTrackMetadata(context, TrackPlayer));
  });

  attach(Event.RemotePause, () => {
    logRemote(context, "remote_pause", {});
    void TrackPlayer.pause();
  });

  attach(Event.RemotePlayPause, () => {
    logRemote(context, "remote_play_pause", {});
    void (async () => {
      const playbackState = await TrackPlayer.getPlaybackState();
      if (playbackState.state === State.Playing) {
        await TrackPlayer.pause();
        return;
      }
      await TrackPlayer.play();
    })();
  });

  attach(Event.RemoteStop, () => {
    logRemote(context, "remote_stop", {});
    void (async () => {
      await TrackPlayer.stop();
      await TrackPlayer.reset();
    })();
  });

  attach(Event.RemoteNext, () => {
    logRemote(context, "remote_next", {});
    void TrackPlayer.skipToNext().then(() =>
      logActiveTrackMetadata(context, TrackPlayer)
    );
  });

  attach(Event.RemotePrevious, () => {
    logRemote(context, "remote_previous", {});
    void TrackPlayer.skipToPrevious().then(() =>
      logActiveTrackMetadata(context, TrackPlayer)
    );
  });

  attach(Event.RemoteSeek, (event?: { position?: number }) => {
    logRemote(context, "remote_seek", { position: event?.position });
    if (typeof event?.position === "number") {
      void TrackPlayer.seekTo(Math.max(0, event.position));
    }
  });

  attach(Event.RemoteDuck, (event) => {
    logRemote(context, "remote_duck", event || {});
    // Do not force-pause on transient duck/interruption events.
    // Lock-screen focus changes were stopping multi-track background sessions.
  });

  return subscriptions;
}

export function unregisterTrackPlayerRemoteHandlers(
  subscriptions: Array<{ remove: () => void }>,
  context?: "playback_service" | "main_app"
) {
  subscriptions.forEach((subscription) => {
    try {
      subscription.remove();
    } catch {
      // ignore
    }
  });

  if (context) {
    unregisterRemoteHandlerContext(context);
  }
}

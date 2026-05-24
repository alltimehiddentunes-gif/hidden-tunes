/**
 * Headless playback-service diagnostics (runs outside main React tree).
 */

import {
  inspectNativeQueueConsistency,
  observePlaybackStateTransition,
  observeTrackPlayerEvent,
  registerTrackPlayerEventListener,
} from "../utils/playbackReliabilityDiagnostics";

type TrackPlayerRuntime = {
  default: {
    getPlaybackState: () => Promise<{ state: number }>;
    getActiveTrackIndex: () => Promise<number | undefined>;
    getActiveTrack: () => Promise<Record<string, unknown> | null | undefined>;
    getQueue: () => Promise<Array<{ id?: string; title?: string; artist?: string }>>;
    addEventListener: (
      event: string,
      listener: (payload?: Record<string, unknown>) => void
    ) => { remove: () => void };
  };
  Event: Record<string, string>;
  State: Record<string, number>;
};

const SERVICE_OWNER = "playback_service";

function logService(event: string, details?: Record<string, unknown>) {
  observeTrackPlayerEvent(event, SERVICE_OWNER, details);
}

async function readServiceQueueSnapshot(TrackPlayer: TrackPlayerRuntime["default"]) {
  const [activeIndex, queue, playbackState, activeTrack] = await Promise.all([
    TrackPlayer.getActiveTrackIndex(),
    TrackPlayer.getQueue(),
    TrackPlayer.getPlaybackState(),
    TrackPlayer.getActiveTrack(),
  ]);

  const queueLength = Array.isArray(queue) ? queue.length : 0;
  const index = typeof activeIndex === "number" ? activeIndex : null;

  return {
    queueLength,
    activeIndex: index,
    activeTrackId:
      activeTrack && typeof activeTrack.id === "string"
        ? String(activeTrack.id)
        : null,
    actualTitle:
      activeTrack && typeof activeTrack.title === "string"
        ? String(activeTrack.title)
        : null,
    actualArtist:
      activeTrack && typeof activeTrack.artist === "string"
        ? String(activeTrack.artist)
        : null,
    queueTrackIds: Array.isArray(queue)
      ? queue.map((track) => String(track.id || "")).filter(Boolean)
      : [],
    playbackState:
      playbackState?.state !== undefined ? String(playbackState.state) : null,
  };
}

async function logQueueSnapshot(
  TrackPlayer: TrackPlayerRuntime["default"],
  label: string
) {
  await inspectNativeQueueConsistency(
    label,
    undefined,
    async () => readServiceQueueSnapshot(TrackPlayer)
  );
}

export function registerTrackPlayerServiceDiagnostics(): Array<{
  remove: () => void;
}> {
  const module = require("react-native-track-player") as TrackPlayerRuntime;
  const TrackPlayer = module.default;
  const { Event } = module;

  if (!TrackPlayer?.addEventListener) {
    logService("diagnostics_skipped", { reason: "TrackPlayer unavailable" });
    return [];
  }

  const subscriptions: Array<{ remove: () => void }> = [];

  const attach = (
    eventName: string,
    listener: (payload?: Record<string, unknown>) => void
  ) => {
    registerTrackPlayerEventListener(eventName, SERVICE_OWNER);
    subscriptions.push(TrackPlayer.addEventListener(eventName, listener));
  };

  attach(Event.PlaybackState, (event) => {
    const nextState =
      event && typeof event.state !== "undefined" ? String(event.state) : "unknown";

    observePlaybackStateTransition(nextState, SERVICE_OWNER, {
      raw: nextState,
    });
    logService("playback_state", event || {});
  });

  attach(Event.PlaybackActiveTrackChanged, (event) => {
    logService("active_track_changed", event || {});
    void logQueueSnapshot(TrackPlayer, "after_active_track_changed");
  });

  attach(Event.PlaybackQueueEnded, (event) => {
    logService("queue_ended", event || {});
    void logQueueSnapshot(TrackPlayer, "after_queue_ended");
  });

  attach(Event.PlaybackError, (event) => {
    logService("playback_error", event || {});
  });

  attach(Event.PlaybackProgressUpdated, (event) => {
    logService("progress_updated", event || {});
  });

  void logQueueSnapshot(TrackPlayer, "service_started");

  return subscriptions;
}

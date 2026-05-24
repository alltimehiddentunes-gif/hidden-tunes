/**
 * Headless playback-service diagnostics (runs outside main React tree).
 */

type TrackPlayerRuntime = {
  default: {
    getPlaybackState: () => Promise<{ state: number }>;
    getActiveTrackIndex: () => Promise<number | undefined>;
    getQueue: () => Promise<unknown[]>;
    addEventListener: (
      event: string,
      listener: (payload?: Record<string, unknown>) => void
    ) => { remove: () => void };
  };
  Event: Record<string, string>;
  State: Record<string, number>;
};

function logService(event: string, details?: Record<string, unknown>) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log(`[HiddenTunes:TrackPlayer] service:${event}`, {
    at: Date.now(),
    ...(details || {}),
  });
}

async function logQueueSnapshot(
  TrackPlayer: TrackPlayerRuntime["default"],
  label: string
) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;

  try {
    const [activeIndex, queue, playbackState] = await Promise.all([
      TrackPlayer.getActiveTrackIndex(),
      TrackPlayer.getQueue(),
      TrackPlayer.getPlaybackState(),
    ]);

    logService(label, {
      activeIndex:
        typeof activeIndex === "number" ? activeIndex : null,
      queueLength: Array.isArray(queue) ? queue.length : 0,
      playbackState: playbackState?.state ?? null,
    });
  } catch (error) {
    logService(`${label}_error`, {
      message: String((error as Error)?.message || error),
    });
  }
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

  subscriptions.push(
    TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
      logService("playback_state", event || {});
    })
  );

  subscriptions.push(
    TrackPlayer.addEventListener(
      Event.PlaybackActiveTrackChanged,
      (event) => {
        logService("active_track_changed", event || {});
        void logQueueSnapshot(TrackPlayer, "after_active_track_changed");
      }
    )
  );

  subscriptions.push(
    TrackPlayer.addEventListener(Event.PlaybackQueueEnded, (event) => {
      logService("queue_ended", event || {});
      void logQueueSnapshot(TrackPlayer, "after_queue_ended");
    })
  );

  subscriptions.push(
    TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
      logService("playback_error", event || {});
    })
  );

  void logQueueSnapshot(TrackPlayer, "service_started");

  return subscriptions;
}

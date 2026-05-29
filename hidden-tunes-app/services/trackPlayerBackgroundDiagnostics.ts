/**
 * Headless playback-service diagnostics (runs outside main React tree).
 *
 * Lock-screen safe: console-only logging. No getQueue/getActiveTrack calls
 * inside native event handlers (those caused B1.1 background crashes).
 */
import { logPlaybackDiagnostic } from "./playbackDiagnostics"; // TEMP_PLAYBACK_DIAGNOSTICS

type TrackPlayerRuntime = {
  default: {
    addEventListener: (
      event: string,
      listener: (payload?: Record<string, unknown>) => void
    ) => { remove: () => void };
  };
  Event: Record<string, string>;
};

function logService(event: string, details?: Record<string, unknown>) {
  // TEMP_PLAYBACK_DIAGNOSTICS
  void logPlaybackDiagnostic(`rntp_service_${event}`, details);

  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log(`[HiddenTunes:TrackPlayer] service:${event}`, {
    at: Date.now(),
    ...(details || {}),
  });
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
    TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event) => {
      logService("active_track_changed", event || {});
    })
  );

  subscriptions.push(
    TrackPlayer.addEventListener(Event.PlaybackQueueEnded, (event) => {
      logService("queue_ended", event || {});
    })
  );

  subscriptions.push(
    TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
      logService("playback_error", event || {});
    })
  );

  logService("service_started", {});

  return subscriptions;
}

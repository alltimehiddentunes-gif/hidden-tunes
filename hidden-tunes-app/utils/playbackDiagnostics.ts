import type { AppStateStatus } from "react-native";

type PlaybackDiagDetails = Record<string, string | number | boolean | undefined>;

export type PlaybackDiagnosticEvent =
  | "tap_to_play_start"
  | "audio_load_start"
  | "audio_load_success"
  | "audio_load_failure"
  | "playback_started"
  | "playback_stalled"
  | "track_finished"
  | "auto_next_attempt"
  | "auto_next_success"
  | "auto_next_failure"
  | "auto_next_skipped"
  | "queue_index_mismatch"
  | "repeat_mode_state"
  | "shuffle_state"
  | "background_state_change"
  | "finish_watchdog_armed"
  | "finish_watchdog_fired"
  | "duplicate_play_ignored";

function shouldLogPlaybackDiagnostics() {
  return typeof __DEV__ === "undefined" || __DEV__;
}

export function logPlaybackDiagnostic(
  event: PlaybackDiagnosticEvent,
  details: PlaybackDiagDetails = {}
) {
  if (!shouldLogPlaybackDiagnostics()) return;

  console.log("[HiddenTunes:playback]", event, {
    at: Date.now(),
    ...details,
  });
}

export function logTapToPlayStart(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("tap_to_play_start", details);
}

export function logAudioLoadStart(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("audio_load_start", details);
}

export function logAudioLoadSuccess(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("audio_load_success", details);
}

export function logAudioLoadFailure(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("audio_load_failure", details);
}

export function logPlaybackStarted(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("playback_started", details);
}

export function logPlaybackStalled(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("playback_stalled", details);
}

export function logTrackFinished(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("track_finished", details);
}

export function logAutoNextAttempt(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("auto_next_attempt", details);
}

export function logAutoNextSuccess(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("auto_next_success", details);
}

export function logAutoNextFailure(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("auto_next_failure", details);
}

export function logAutoNextSkipped(
  reason: string,
  details: PlaybackDiagDetails = {}
) {
  logPlaybackDiagnostic("auto_next_skipped", { reason, ...details });
}

export function logQueueIndexMismatch(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("queue_index_mismatch", details);
}

export function logRepeatModeState(mode: string, details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("repeat_mode_state", { mode, ...details });
}

export function logShuffleState(enabled: boolean, details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("shuffle_state", { enabled, ...details });
}

export function logBackgroundStateChange(
  previousState: AppStateStatus,
  nextState: AppStateStatus,
  details: PlaybackDiagDetails = {}
) {
  logPlaybackDiagnostic("background_state_change", {
    previousState,
    nextState,
    ...details,
  });
}

export function logFinishWatchdogArmed(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("finish_watchdog_armed", details);
}

export function logFinishWatchdogFired(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("finish_watchdog_fired", details);
}

export function logDuplicatePlayIgnored(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("duplicate_play_ignored", details);
}

import type { AppStateStatus } from "react-native";

import {
  isHeavyPerfDiagnosticsEnabled,
  isVerbosePlaybackDiagnosticsEnabled,
} from "./devDiagnostics";
import { logBackgroundPlayback } from "./backgroundPlaybackLogs";

import {
  beginNextTrackTransition,
  beginPauseResumeTiming,
  beginTapToPlayTiming,
  cancelPendingPlaybackTiming,
  completePendingPlaybackTiming,
  recordAudioReloadAttempt,
  recordQueueControl,
  registerActiveTimer,
  unregisterActiveTimer,
} from "./playbackStressDiagnostics";

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
  | "duplicate_play_ignored"
  | "tap_to_player_sync_start"
  | "current_song_before_navigation"
  | "player_navigation_requested"
  | "mini_player_sync_confirmed"
  | "queue_active_track_sync_confirmed"
  | "up_next_sync_confirmed";

function shouldLogPlaybackDiagnostics() {
  return isVerbosePlaybackDiagnosticsEnabled();
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
  beginTapToPlayTiming(
    details.songId ? String(details.songId) : undefined,
    String(details.source || "tap")
  );
  logPlaybackDiagnostic("tap_to_play_start", details);
}

export function logAudioLoadStart(details: PlaybackDiagDetails = {}) {
  recordAudioReloadAttempt(details);
  logPlaybackDiagnostic("audio_load_start", details);
}

export function logAudioLoadSuccess(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("audio_load_success", details);
}

export function logAudioLoadFailure(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("audio_load_failure", details);
}

export function logPlaybackStarted(details: PlaybackDiagDetails = {}) {
  completePendingPlaybackTiming(
    details.songId ? String(details.songId) : undefined,
    details.engine ? String(details.engine) : undefined
  );
  logPlaybackDiagnostic("playback_started", details);
}

export function logPlaybackStalled(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("playback_stalled", details);
}

export function logTrackFinished(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("track_finished", details);
}

export function logAutoNextAttempt(details: PlaybackDiagDetails = {}) {
  const source = String(details.source || "auto_next");

  if (source === "nextSong" || source === "previousSong") {
    beginNextTrackTransition(source);
    recordQueueControl(
      source === "previousSong" ? "previous" : "next",
      Number(details.queueLength || 0),
      details
    );
  }

  logPlaybackDiagnostic("auto_next_attempt", details);
}

export function logAutoNextSuccess(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("auto_next_success", details);
}

export function logAutoNextFailure(details: PlaybackDiagDetails = {}) {
  cancelPendingPlaybackTiming(String(details.reason || "auto_next_failure"));
  logPlaybackDiagnostic("auto_next_failure", details);
}

export function logAutoNextSkipped(
  reason: string,
  details: PlaybackDiagDetails = {}
) {
  cancelPendingPlaybackTiming(reason);
  logPlaybackDiagnostic("auto_next_skipped", { reason, ...details });
}

export function logQueueIndexMismatch(details: PlaybackDiagDetails = {}) {
  logPlaybackDiagnostic("queue_index_mismatch", details);
  logQueuePlaybackEvent("queue_index_mismatch", details);
}

export type QueuePlaybackEvent =
  | "queue_next_start"
  | "queue_next_success"
  | "queue_previous_start"
  | "queue_previous_success"
  | "queue_repeat_one_restart"
  | "queue_end_reached"
  | "queue_index_mismatch";

/** Temporary queue transition diagnostics for Phase 3 validation. */
export function logQueuePlaybackEvent(
  event: QueuePlaybackEvent,
  details: PlaybackDiagDetails = {}
) {
  if (!shouldLogPlaybackDiagnostics()) return;

  console.log(`[HTQueue] ${event}`, {
    at: Date.now(),
    ...details,
  });
}

export function logRepeatModeState(mode: string, details: PlaybackDiagDetails = {}) {
  recordQueueControl("repeat_toggle", Number(details.queueLength || 0), {
    mode,
    ...details,
  });
  logPlaybackDiagnostic("repeat_mode_state", { mode, ...details });
}

export function logShuffleState(enabled: boolean, details: PlaybackDiagDetails = {}) {
  recordQueueControl("shuffle_toggle", Number(details.queueLength || 0), {
    enabled,
    ...details,
  });
  logPlaybackDiagnostic("shuffle_state", { enabled, ...details });
}

export function logBackgroundStateChange(
  previousState: AppStateStatus,
  nextState: AppStateStatus,
  details: PlaybackDiagDetails = {}
) {
  logBackgroundPlayback("app_state_change", {
    previousState,
    nextState,
    ...details,
  });
  logPlaybackDiagnostic("background_state_change", {
    previousState,
    nextState,
    ...details,
  });
}

export function logFinishWatchdogArmed(details: PlaybackDiagDetails = {}) {
  registerActiveTimer("finish_watchdog");
  logPlaybackDiagnostic("finish_watchdog_armed", details);
}

export function logFinishWatchdogFired(details: PlaybackDiagDetails = {}) {
  unregisterActiveTimer("finish_watchdog");
  logPlaybackDiagnostic("finish_watchdog_fired", details);
}

export function logDuplicatePlayIgnored(details: PlaybackDiagDetails = {}) {
  cancelPendingPlaybackTiming("duplicate_play_ignored");
  logPlaybackDiagnostic("duplicate_play_ignored", details);
}

export function logManualQueueSkip(
  direction: "next" | "previous",
  details: PlaybackDiagDetails = {}
) {
  beginNextTrackTransition(direction);
  recordQueueControl(direction, Number(details.queueLength || 0), details);
}

export function logPauseResumeStart(details: PlaybackDiagDetails = {}) {
  beginPauseResumeTiming(String(details.source || "toggle"));
}

export function logPauseResumeComplete(details: PlaybackDiagDetails = {}) {
  completePendingPlaybackTiming(
    undefined,
    details.engine ? String(details.engine) : "hidden_audio"
  );
}

type HTAutoNextDetails = Record<string, string | number | boolean | undefined>;

export function logHTAutoNext(
  tag: "didJustFinish" | "currentIndex" | "queueLength" | "nextIndex" | "reason",
  details: HTAutoNextDetails = {}
) {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return;
  if (!isHeavyPerfDiagnosticsEnabled()) return;

  console.log(`[HTAutoNext] ${tag}`, details);
}

export function logHTLockAutoNext(
  tag: "armed" | "check" | "force-advance" | "clear",
  details: HTAutoNextDetails = {}
) {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return;
  if (!isHeavyPerfDiagnosticsEnabled()) return;

  console.log(`[HTLockAutoNext] ${tag}`, details);
}

export type PlaybackUxSyncEvent =
  | "tap_to_player_sync_start"
  | "current_song_before_navigation"
  | "player_navigation_requested"
  | "mini_player_sync_confirmed"
  | "queue_active_track_sync_confirmed"
  | "up_next_sync_confirmed";

export type MiniPlayerControlEvent =
  | "mini_player_button_pressed"
  | "mini_player_button_action_start"
  | "mini_player_button_action_success"
  | "mini_player_button_action_blocked"
  | "mini_player_touch_area_ready";

export function logMiniPlayerControl(
  event: MiniPlayerControlEvent,
  details: PlaybackDiagDetails = {}
) {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[HiddenTunes:mini-player]", event, {
      at: Date.now(),
      ...details,
    });
  }
}

export function logPlaybackUxSync(
  event: PlaybackUxSyncEvent,
  details: PlaybackDiagDetails = {}
) {
  if (shouldLogPlaybackDiagnostics()) {
    console.log("[HiddenTunes:playback]", event, {
      at: Date.now(),
      ...details,
    });
    return;
  }
}

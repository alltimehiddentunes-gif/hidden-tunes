import { AppStateStatus } from "react-native";

import {
  isHiddenAudioEnabledOnIOS,
  isTrackPlayerFeatureEnabled,
} from "../constants/playbackConfig";
import {
  hiddenAudioBridge,
  isHiddenAudioNativeEngineAvailable,
} from "../src/hidden-audio/hiddenAudioBridge";
import {
  recordBridgeSetProgressInterval,
  recordRemoteHandlersAttached,
} from "../utils/runtimeInstrumentation";
import {
  captureDevStackTrace,
  logBackgroundPlayback,
  logTrackPlayerQueue,
} from "../utils/backgroundPlaybackLogs";
import { supportsNativeTrackPlayer } from "../utils/expoRuntime";
import {
  PlaybackEngineEventHandlers,
  PlaybackEngineProgress,
  PlaybackEngineRepeatMode,
  PlaybackEngineTrack,
} from "./playbackEngineTypes";
import {
  registerTrackPlayerRemoteHandlers,
  unregisterTrackPlayerRemoteHandlers,
} from "./trackPlayerRemoteHandlers";
import {
  ensureTrackPlayerReady,
  fastSkipTrackPlayerToIndex,
  getIntendedTrackPlayerTrackIds,
  getTrackPlayerActiveIndex,
  getTrackPlayerProgress,
  getTrackPlayerQueueSnapshot,
  playTrackPlayerQueue,
  resetTrackPlayerPlayback,
  resolveTrackPlayerPlayIndex,
  trackPlayerQueueIdsMatch,
  setTrackPlayerRepeatMode,
  subscribeTrackPlayerEvents,
  trackPlayerPause,
  trackPlayerPlay,
  trackPlayerSeekTo,
  trackPlayerSetVolume,
  trackPlayerSkipToNext,
  trackPlayerSkipToPrevious,
  trackPlayerStop,
  trackPlayerTogglePlayPause,
  updateTrackPlayerProgressInterval,
} from "./trackPlayerEngine";

export type TrackPlayerSongInput = PlaybackEngineTrack;
export type PlayerRepeatMode = PlaybackEngineRepeatMode;
export type PlaybackProgress = PlaybackEngineProgress;
export type TrackPlayerEventHandlers = PlaybackEngineEventHandlers;
export type PlaybackEngineKind = "expo-av" | "track-player" | "hidden_audio";

let bridgeActive = false;
let hiddenAudioBridgeActive = false;
let mainThreadRemoteSubscriptions: Array<{ remove: () => void }> = [];

function attachMainThreadRemoteHandlers() {
  if (!isTrackPlayerFeatureEnabled() || !supportsNativeTrackPlayer()) return;

  unregisterTrackPlayerRemoteHandlers(mainThreadRemoteSubscriptions);
  mainThreadRemoteSubscriptions = registerTrackPlayerRemoteHandlers("main_app");
  recordRemoteHandlersAttached("main_app", mainThreadRemoteSubscriptions.length);

  logBackgroundPlayback("main_app_remote_handlers_attached");
}

function detachMainThreadRemoteHandlers() {
  unregisterTrackPlayerRemoteHandlers(mainThreadRemoteSubscriptions);
  mainThreadRemoteSubscriptions = [];
}

export function isPlaybackBridgeActive(): boolean {
  return bridgeActive && isTrackPlayerFeatureEnabled();
}

export function isNativeQueuePlaybackEnabled(): boolean {
  return isPlaybackBridgeActive();
}

export async function shouldUseTrackPlayerPlayback(): Promise<boolean> {
  if (!isTrackPlayerFeatureEnabled()) return false;
  if (!supportsNativeTrackPlayer()) return false;
  return ensureTrackPlayerReady();
}

/** Startup-only: initialize RNTP (setupPlayer) without queue or playback side effects. */
export async function prewarmTrackPlayerForStartup(): Promise<boolean> {
  if (!isTrackPlayerFeatureEnabled() || !supportsNativeTrackPlayer()) {
    return false;
  }

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[startup-ready] rntp-prewarm-start");
  }

  try {
    const ready = await ensureTrackPlayerReady();

    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[startup-ready] rntp-prewarm-end", { ready });
    }

    return ready;
  } catch (error) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[startup-ready] rntp-prewarm-error", {
        message: String((error as Error)?.message || error),
      });
    }

    return false;
  }
}

export async function activateTrackPlayerPlayback(options: {
  songs: TrackPlayerSongInput[];
  startIndex: number;
  repeatMode: PlayerRepeatMode;
  volume: number;
  muted: boolean;
  startPositionMillis?: number;
  reason?: string;
}): Promise<number> {
  const playedIndex = await playTrackPlayerQueue({
    ...options,
    reason: options.reason || "activate",
  });
  bridgeActive = true;
  attachMainThreadRemoteHandlers();
  return playedIndex;
}

export async function bridgePlayQueueFromIndex(options: {
  songs: TrackPlayerSongInput[];
  startIndex: number;
  repeatMode: PlayerRepeatMode;
  volume: number;
  muted: boolean;
  startPositionMillis?: number;
  reason?: string;
}): Promise<number> {
  if (!isTrackPlayerFeatureEnabled() || !supportsNativeTrackPlayer()) {
    return Math.max(0, options.startIndex);
  }

  bridgeActive = true;
  attachMainThreadRemoteHandlers();

  const playedIndex = await playTrackPlayerQueue({
    ...options,
    reason: options.reason || "reload_queue",
  });

  logTrackPlayerQueue("reload_queue_from_index", {
    startIndex: options.startIndex,
    playedIndex,
    queueLength: options.songs.length,
    reason: options.reason || "reload_queue",
  });

  return playedIndex;
}

export async function bridgeTrySkipToNext(): Promise<boolean> {
  if (!isPlaybackBridgeActive()) return false;

  const beforeIndex = await getTrackPlayerActiveIndex();
  const advanced = await trackPlayerSkipToNext();
  const afterIndex = await getTrackPlayerActiveIndex();

  logTrackPlayerQueue("bridge_skip_to_next", {
    beforeIndex,
    afterIndex,
    advanced,
  });

  return advanced;
}

export async function deactivateTrackPlayerPlayback(
  reason = "unknown"
): Promise<void> {
  logBackgroundPlayback("deactivate_requested", {
    reason,
    stack: captureDevStackTrace(),
  });

  bridgeActive = false;
  detachMainThreadRemoteHandlers();
  await trackPlayerStop(`deactivate:${reason}`);
  await resetTrackPlayerPlayback(`deactivate:${reason}`);
}

export async function bridgeResetPlayback(reason = "unknown"): Promise<void> {
  await deactivateTrackPlayerPlayback(reason);
}

export async function bridgeSyncRepeatMode(
  mode: PlayerRepeatMode
): Promise<void> {
  if (!isPlaybackBridgeActive()) return;
  await setTrackPlayerRepeatMode(mode);
}

export async function bridgeTogglePlayPause(): Promise<boolean> {
  if (!isPlaybackBridgeActive()) return false;
  return trackPlayerTogglePlayPause();
}

export async function bridgeSeekTo(millis: number): Promise<void> {
  if (!isPlaybackBridgeActive()) return;
  await trackPlayerSeekTo(millis);
}

export async function bridgeSetVolume(
  volume: number,
  muted: boolean
): Promise<void> {
  if (!isPlaybackBridgeActive()) return;
  await trackPlayerSetVolume(volume, muted);
}

export async function bridgeSkipToNext(): Promise<void> {
  if (!isPlaybackBridgeActive()) return;
  await trackPlayerSkipToNext();
}

export async function bridgeSkipToPrevious(): Promise<void> {
  if (!isPlaybackBridgeActive()) return;
  await trackPlayerSkipToPrevious();
}

export async function bridgeGetProgress(): Promise<PlaybackProgress> {
  if (!isPlaybackBridgeActive()) {
    return {
      positionMillis: 0,
      durationMillis: 0,
      isPlaying: false,
    };
  }

  return getTrackPlayerProgress();
}

export async function bridgeGetActiveIndex(): Promise<number | null> {
  if (!isPlaybackBridgeActive()) return null;
  return getTrackPlayerActiveIndex();
}

export async function bridgeGetQueueSnapshot() {
  if (!isPlaybackBridgeActive()) return null;
  return getTrackPlayerQueueSnapshot();
}

export function subscribeBridgeEvents(
  handlers: TrackPlayerEventHandlers
): () => void {
  if (!isTrackPlayerFeatureEnabled() || !supportsNativeTrackPlayer()) {
    return () => {};
  }

  return subscribeTrackPlayerEvents(handlers);
}

const RNTP_PROGRESS_INTERVAL_ACTIVE_S = 1;
const RNTP_PROGRESS_INTERVAL_BACKGROUND_S = 2;

function resolveBridgeProgressIntervalSeconds(appState: AppStateStatus) {
  return appState === "active"
    ? RNTP_PROGRESS_INTERVAL_ACTIVE_S
    : RNTP_PROGRESS_INTERVAL_BACKGROUND_S;
}

export async function bridgeSetProgressInterval(
  appState: AppStateStatus
): Promise<void> {
  if (!isTrackPlayerFeatureEnabled()) return;

  const intervalSeconds = resolveBridgeProgressIntervalSeconds(appState);
  recordBridgeSetProgressInterval(appState, intervalSeconds);
  logBackgroundPlayback("progress_interval_update", {
    appState,
    intervalSeconds,
  });
  await updateTrackPlayerProgressInterval(
    intervalSeconds,
    `bridge_set_progress_interval:${appState}`
  );
}

export async function bridgePlay(): Promise<void> {
  if (!isPlaybackBridgeActive()) return;
  await trackPlayerPlay();
}

export async function bridgePause(): Promise<void> {
  if (!isPlaybackBridgeActive()) return;
  await trackPlayerPause();
}

/** Stop native output immediately without resetting the queue (user tap handoff). */
export async function bridgeInterruptForUserTap(): Promise<void> {
  if (!isTrackPlayerFeatureEnabled() || !supportsNativeTrackPlayer()) return;

  const ready = await ensureTrackPlayerReady();
  if (!ready) return;

  await trackPlayerStop("user_tap_interrupt");
}

/** User tap only: skip to index when native queue already matches JS queue. */
export async function bridgeTryUserTapFastPlay(options: {
  songs: TrackPlayerSongInput[];
  songId: string;
  startIndex: number;
  repeatMode: PlayerRepeatMode;
  volume: number;
  muted: boolean;
  startPositionMillis?: number;
}): Promise<{ playedIndex: number } | null> {
  if (!isTrackPlayerFeatureEnabled() || !supportsNativeTrackPlayer()) {
    return null;
  }

  const ready = await ensureTrackPlayerReady();
  if (!ready) return null;

  const intendedTrackIds = getIntendedTrackPlayerTrackIds(options.songs);
  const snapshot = await getTrackPlayerQueueSnapshot();
  const nativeTrackIds = snapshot?.trackIds ?? [];
  const targetIndex = resolveTrackPlayerPlayIndex(
    options.songs,
    options.songId,
    options.startIndex
  );
  const queueMatch = trackPlayerQueueIdsMatch(nativeTrackIds, intendedTrackIds);

  let reason = "native_queue_match";

  if (!intendedTrackIds.length) {
    reason = "no_playable_tracks";
  } else if (!nativeTrackIds.length) {
    reason = "native_queue_empty";
  } else if (!queueMatch) {
    reason = "native_queue_mismatch";
  }

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[tap-fast-path]", {
      queueMatch,
      targetIndex,
      trackCount: intendedTrackIds.length,
      reason,
    });
  }

  if (!queueMatch || !intendedTrackIds.length) {
    return null;
  }

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[tap-timing] fast-skip-start", {
      targetIndex,
      trackCount: intendedTrackIds.length,
    });
  }

  const playedIndex = await fastSkipTrackPlayerToIndex({
    startIndex: targetIndex,
    repeatMode: options.repeatMode,
    volume: options.volume,
    muted: options.muted,
    startPositionMillis: options.startPositionMillis,
  });

  bridgeActive = true;
  attachMainThreadRemoteHandlers();

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[tap-timing] fast-skip-end", { playedIndex });
  }

  return { playedIndex };
}

export function isHiddenAudioPlaybackActive(): boolean {
  return hiddenAudioBridgeActive && isHiddenAudioEnabledOnIOS();
}

export async function shouldUseHiddenAudioPlayback(): Promise<boolean> {
  if (!isHiddenAudioEnabledOnIOS()) return false;
  return isHiddenAudioNativeEngineAvailable();
}

export async function activateHiddenAudioPlayback(options: {
  url: string;
  title: string;
  artist: string;
  album?: string;
  durationSeconds?: number;
  positionSeconds?: number;
}): Promise<void> {
  await hiddenAudioBridge.load(options.url);
  await hiddenAudioBridge.updateNowPlaying({
    title: options.title,
    artist: options.artist,
    album: options.album || "",
    duration: options.durationSeconds ?? 0,
    position: options.positionSeconds ?? 0,
  });
  await hiddenAudioBridge.play();
  hiddenAudioBridgeActive = true;
}

export async function deactivateHiddenAudioPlayback(
  reason = "unknown"
): Promise<void> {
  if (!hiddenAudioBridgeActive) return;

  logBackgroundPlayback("hidden_audio_deactivate_requested", { reason });

  try {
    await hiddenAudioBridge.stop();
  } catch (error) {
    console.log("[hidden_audio] deactivate error:", error);
  }

  hiddenAudioBridgeActive = false;
}

export async function bridgeHiddenAudioPlay(): Promise<void> {
  if (!isHiddenAudioPlaybackActive()) return;
  await hiddenAudioBridge.play();
}

export async function bridgeHiddenAudioPause(): Promise<void> {
  if (!isHiddenAudioPlaybackActive()) return;
  await hiddenAudioBridge.pause();
}

export async function bridgeHiddenAudioUpdateNowPlaying(options: {
  title: string;
  artist: string;
  album?: string;
  durationSeconds?: number;
  positionSeconds?: number;
}): Promise<void> {
  if (!isHiddenAudioEnabledOnIOS()) return;

  await hiddenAudioBridge.updateNowPlaying({
    title: options.title,
    artist: options.artist,
    album: options.album || "",
    duration: options.durationSeconds ?? 0,
    position: options.positionSeconds ?? 0,
  });
}

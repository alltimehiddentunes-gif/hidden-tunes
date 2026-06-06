import { AppStateStatus, Platform } from "react-native";

import { isHiddenAudioNativePlaybackEnabled } from "../constants/playbackConfig";
import {
  getHiddenAudioNativeSnapshot,
  hiddenAudioBridge,
  updateHiddenAudioRemoteQueueAvailability,
  isHiddenAudioNativeEngineAvailable,
  subscribeHiddenAudioNativeDiagnostics,
  subscribeHiddenAudioPlaybackEnded,
  subscribeHiddenAudioProgressChanged,
  type HiddenAudioNativeDiagnosticEvent,
  type HiddenAudioNativeSnapshot,
  type HiddenAudioPlaybackEndedEvent,
} from "../src/hidden-audio/hiddenAudioBridge";
import { recordBridgeSetProgressInterval } from "../utils/runtimeInstrumentation";
import { logBackgroundPlayback } from "../utils/backgroundPlaybackLogs";
import {
  isUserInitiatedHiddenAudioStopReason,
  logAndRememberLockscreenDiagnostic,
} from "../utils/lockscreenPlaybackDiagnostics";
import { AppState } from "react-native";
import {
  PlaybackEngineEventHandlers,
  PlaybackEngineProgress,
  PlaybackEngineRepeatMode,
  PlaybackEngineTrack,
} from "./playbackEngineTypes";

export type NativeQueueSongInput = PlaybackEngineTrack;
export type PlayerRepeatMode = PlaybackEngineRepeatMode;
export type PlaybackProgress = PlaybackEngineProgress;
export type NativeQueueEventHandlers = PlaybackEngineEventHandlers;
export type PlaybackEngineKind = "hidden_audio";
export type HiddenAudioEndedEvent = HiddenAudioPlaybackEndedEvent;
export type HiddenAudioDiagnosticEvent = HiddenAudioNativeDiagnosticEvent;

type QueueSnapshot = {
  queueLength: number;
  activeIndex: number | null;
  playbackState: string | null;
  trackIds: string[];
};


function snapshotToPlaybackProgress(
  snapshot: HiddenAudioNativeSnapshot
): PlaybackProgress {
  return {
    positionMillis: snapshot.positionMillis,
    durationMillis: snapshot.durationMillis,
    isPlaying: snapshot.isPlaying,
    playbackState: snapshot.playbackState,
  };
}

function androidSnapshotIndicatesLoadedPlayback(
  snapshot: HiddenAudioNativeSnapshot | null | undefined
): boolean {
  if (!snapshot) return false;
  const nativeStatus = String(snapshot.nativeStatus || "").toLowerCase();
  const playbackState = String(snapshot.playbackState || "").toLowerCase();
  if (nativeStatus === "ended" || playbackState === "ended") return false;
  return (
    snapshot.hasLoadedTrack ||
    Boolean(snapshot.activeTrack?.url) ||
    snapshot.isPlaying ||
    playbackState === "playing" ||
    playbackState === "buffering" ||
    playbackState === "ready"
  );
}

let hiddenAudioBridgeActive = false;

function emptyProgress(): PlaybackProgress {
  return {
    positionMillis: 0,
    durationMillis: 0,
    isPlaying: false,
    playbackState: "idle",
  };
}

function emptyQueueSnapshot(): QueueSnapshot {
  return {
    queueLength: 0,
    activeIndex: null,
    playbackState: null,
    trackIds: [],
  };
}

export function isPlaybackBridgeActive(): boolean {
  return isHiddenAudioPlaybackActive();
}

export function isNativeQueuePlaybackEnabled(): boolean {
  return false;
}

export async function shouldUseNativeQueuePlayback(): Promise<boolean> {
  return false;
}

export async function prewarmNativeQueueForStartup(): Promise<boolean> {
  return false;
}

export async function activateNativeQueuePlayback(options: {
  songs: NativeQueueSongInput[];
  startIndex: number;
  repeatMode: PlayerRepeatMode;
  volume: number;
  muted: boolean;
  startPositionMillis?: number;
  reason?: string;
}): Promise<number> {
  return Math.max(0, options.startIndex || 0);
}

export async function bridgePlayQueueFromIndex(options: {
  songs: NativeQueueSongInput[];
  startIndex: number;
  repeatMode: PlayerRepeatMode;
  volume: number;
  muted: boolean;
  startPositionMillis?: number;
  reason?: string;
}): Promise<number> {
  return Math.max(0, options.startIndex || 0);
}

export async function bridgeTrySkipToNext(): Promise<boolean> {
  return false;
}

export async function deactivateNativeQueuePlayback(
  reason = "unknown"
): Promise<void> {
  logBackgroundPlayback("native_queue_deactivate_noop", { reason });
}

export async function bridgeResetPlayback(reason = "unknown"): Promise<void> {
  if (isHiddenAudioPlaybackActive()) {
    await deactivateHiddenAudioPlayback(reason);
  }
}

export async function bridgeSyncRepeatMode(
  _mode: PlayerRepeatMode
): Promise<void> {}

export async function bridgeTogglePlayPause(): Promise<boolean> {
  if (!isHiddenAudioPlaybackActive()) return false;

  const status = await hiddenAudioBridge.getStatus();

  if (status.isPlaying) {
    await hiddenAudioBridge.pause();
    return false;
  }

  await hiddenAudioBridge.play();
  return true;
}

export async function bridgeSeekTo(millis: number): Promise<void> {
  if (!isHiddenAudioPlaybackActive()) return;
  await hiddenAudioBridge.seek(millis);
}

export async function bridgeSetVolume(
  _volume: number,
  _muted: boolean
): Promise<void> {}

export async function bridgeSkipToNext(): Promise<void> {}

export async function bridgeSkipToPrevious(): Promise<void> {}

export async function bridgeGetProgress(): Promise<PlaybackProgress> {
  if (isHiddenAudioPlaybackActive()) {
    return hiddenAudioBridge.getStatus();
  }

  if (Platform.OS === "android" && isHiddenAudioNativePlaybackEnabled()) {
    const snapshot = await getHiddenAudioNativeSnapshot();
    if (androidSnapshotIndicatesLoadedPlayback(snapshot) && snapshot) {
      markHiddenAudioBridgeActive(true);
      return snapshotToPlaybackProgress(snapshot);
    }
  }

  return emptyProgress();
}

export async function bridgeGetActiveIndex(): Promise<number | null> {
  return null;
}

export async function bridgeGetQueueSnapshot(): Promise<QueueSnapshot> {
  return emptyQueueSnapshot();
}

export function subscribeBridgeEvents(
  _handlers: NativeQueueEventHandlers
): () => void {
  return () => {};
}


export function subscribeHiddenAudioProgress(
  handler: (progress: PlaybackProgress) => void
): () => void {
  if (!isHiddenAudioNativePlaybackEnabled()) return () => {};
  if (Platform.OS !== "android") return () => {};
  return subscribeHiddenAudioProgressChanged((status) => {
    handler({
      positionMillis: status.positionMillis,
      durationMillis: status.durationMillis,
      isPlaying: status.isPlaying,
      playbackState: status.playbackState || "idle",
    });
  });
}

export function subscribeHiddenAudioEnded(
  handler: (event: HiddenAudioEndedEvent) => void
): () => void {
  if (!isHiddenAudioNativePlaybackEnabled()) return () => {};
  return subscribeHiddenAudioPlaybackEnded(handler);
}

export function subscribeHiddenAudioDiagnostics(
  handler: (event: HiddenAudioDiagnosticEvent) => void
): () => void {
  if (!isHiddenAudioNativePlaybackEnabled()) return () => {};
  return subscribeHiddenAudioNativeDiagnostics(handler);
}

export async function bridgeSetProgressInterval(
  appState: AppStateStatus
): Promise<void> {
  recordBridgeSetProgressInterval(appState, 0);
}

export async function bridgePlay(): Promise<void> {
  if (!isHiddenAudioPlaybackActive()) return;
  await hiddenAudioBridge.play();
}

export async function bridgePause(): Promise<void> {
  if (!isHiddenAudioPlaybackActive()) return;
  await hiddenAudioBridge.pause();
}

export async function bridgeInterruptForUserTap(): Promise<void> {}

export async function bridgeTryUserTapFastPlay(_options: {
  songs: NativeQueueSongInput[];
  songId: string;
  startIndex: number;
  repeatMode: PlayerRepeatMode;
  volume: number;
  muted: boolean;
  startPositionMillis?: number;
}): Promise<{ playedIndex: number } | null> {
  return null;
}

export function isHiddenAudioPlaybackActive(): boolean {
  return hiddenAudioBridgeActive && isHiddenAudioNativePlaybackEnabled();
}

export function markHiddenAudioBridgeActive(active = true): void {
  hiddenAudioBridgeActive = active;
}

export async function bridgeProbeNativePlayback(): Promise<HiddenAudioNativeSnapshot | null> {
  if (!isHiddenAudioNativePlaybackEnabled()) return null;
  return getHiddenAudioNativeSnapshot();
}

export async function shouldUseHiddenAudioPlayback(): Promise<boolean> {
  if (!isHiddenAudioNativePlaybackEnabled()) return false;
  return isHiddenAudioNativeEngineAvailable();
}

export async function activateHiddenAudioPlayback(options: {
  url: string;
  title: string;
  artist: string;
  album?: string;
  durationSeconds?: number;
  positionSeconds?: number;
  artworkUrl?: string;
}): Promise<void> {
  logAndRememberLockscreenDiagnostic(
    "hidden_audio_load_track_start",
    { title: options.title, artist: options.artist, hasArtwork: Boolean(options.artworkUrl) },
    { lastBridgeEvent: "activate_hidden_audio_playback" }
  );

  await hiddenAudioBridge.updateNowPlaying({
    title: options.title,
    artist: options.artist,
    album: options.album || "",
    duration: options.durationSeconds ?? 0,
    position: options.positionSeconds ?? 0,
    artworkUrl: options.artworkUrl || "",
  });
  await hiddenAudioBridge.load(options.url);
  logAndRememberLockscreenDiagnostic(
    "hidden_audio_load_track_success",
    { title: options.title, artist: options.artist },
    { lastBridgeEvent: "activate_hidden_audio_loaded" }
  );

  const startPositionMs = Math.max(0, Math.round((options.positionSeconds ?? 0) * 1000));
  if (startPositionMs > 0) {
    await hiddenAudioBridge.seek(startPositionMs);
  }

  await hiddenAudioBridge.play();
  hiddenAudioBridgeActive = true;
  logAndRememberLockscreenDiagnostic(
    "hidden_audio_play_confirmed",
    { title: options.title, artist: options.artist },
    { lastBridgeEvent: "activate_hidden_audio_play_confirmed" }
  );
}

export async function deactivateHiddenAudioPlayback(
  reason = "unknown"
): Promise<void> {
  if (!hiddenAudioBridgeActive) return;

  const appState = AppState.currentState;
  const backgrounding = appState === "background" || appState === "inactive";
  if (backgrounding && !isUserInitiatedHiddenAudioStopReason(reason)) {
    logAndRememberLockscreenDiagnostic(
      "hidden_audio_unload_blocked_in_background",
      { reason, appState },
      { lastBridgeEvent: "deactivate_hidden_audio_blocked" }
    );
    logBackgroundPlayback("hidden_audio_deactivate_blocked_background", { reason, appState });
    return;
  }

  logBackgroundPlayback("hidden_audio_deactivate_requested", { reason });
  logAndRememberLockscreenDiagnostic(
    "hidden_audio_stop_called",
    { reason },
    { lastBridgeEvent: "deactivate_hidden_audio_playback" }
  );

  try {
    await hiddenAudioBridge.stop();
  } catch (error) {
    console.log("[hidden_audio] deactivate error:", error);
  }

  hiddenAudioBridgeActive = false;
  logAndRememberLockscreenDiagnostic(
    "hidden_audio_unload_called",
    { reason },
    { lastBridgeEvent: "deactivate_hidden_audio_playback_complete" }
  );
}

export async function bridgeHiddenAudioPlay(): Promise<void> {
  if (!isHiddenAudioPlaybackActive()) return;
  await hiddenAudioBridge.play();
}

export async function bridgeHiddenAudioPause(): Promise<void> {
  if (!isHiddenAudioPlaybackActive()) return;
  await hiddenAudioBridge.pause();
}

export async function bridgeUpdateRemoteQueueAvailability(options: {
  activeIndex: number;
  queueLength: number;
}): Promise<void> {
  if (!isHiddenAudioNativePlaybackEnabled()) return;
  await updateHiddenAudioRemoteQueueAvailability(
    options.activeIndex,
    options.queueLength
  );
}

export async function bridgeHiddenAudioUpdateNowPlaying(options: {
  title: string;
  artist: string;
  album?: string;
  durationSeconds?: number;
  positionSeconds?: number;
  artworkUrl?: string;
}): Promise<void> {
  if (!isHiddenAudioNativePlaybackEnabled()) return;

  await hiddenAudioBridge.updateNowPlaying({
    title: options.title,
    artist: options.artist,
    album: options.album || "",
    duration: options.durationSeconds ?? 0,
    position: options.positionSeconds ?? 0,
    artworkUrl: options.artworkUrl || "",
  });
}
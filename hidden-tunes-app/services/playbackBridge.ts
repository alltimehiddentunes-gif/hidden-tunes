import { AppStateStatus } from "react-native";

import { isTrackPlayerFeatureEnabled } from "../constants/playbackConfig";
import {
  captureDevStackTrace,
  logBackgroundPlayback,
  logTrackPlayerQueue,
} from "../utils/backgroundPlaybackLogs";
import {
  inspectNativeQueueConsistency,
  observePlaybackStateTransition,
  observeProgressUpdate,
} from "../utils/playbackReliabilityDiagnostics";
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
  getTrackPlayerActiveIndex,
  getTrackPlayerProgress,
  getTrackPlayerQueueSnapshot,
  playTrackPlayerQueue,
  readTrackPlayerReliabilitySnapshot,
  resetTrackPlayerPlayback,
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

let bridgeActive = false;
let mainThreadRemoteSubscriptions: Array<{ remove: () => void }> = [];

async function inspectBridgeQueue(
  source: string,
  expected?: {
    queueLength?: number;
    activeIndex?: number;
    trackId?: string | null;
    title?: string | null;
    artist?: string | null;
  }
) {
  await inspectNativeQueueConsistency(
    source,
    expected,
    readTrackPlayerReliabilitySnapshot
  );
}

function attachMainThreadRemoteHandlers() {
  if (!isTrackPlayerFeatureEnabled() || !supportsNativeTrackPlayer()) return;

  unregisterTrackPlayerRemoteHandlers(mainThreadRemoteSubscriptions, "main_app");
  mainThreadRemoteSubscriptions = registerTrackPlayerRemoteHandlers("main_app");

  logBackgroundPlayback("main_app_remote_handlers_attached");
}

function detachMainThreadRemoteHandlers() {
  unregisterTrackPlayerRemoteHandlers(mainThreadRemoteSubscriptions, "main_app");
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

export async function activateTrackPlayerPlayback(options: {
  songs: TrackPlayerSongInput[];
  startIndex: number;
  repeatMode: PlayerRepeatMode;
  volume: number;
  muted: boolean;
  startPositionMillis?: number;
  reason?: string;
}): Promise<number> {
  const expectedTrack = options.songs[options.startIndex];

  const playedIndex = await playTrackPlayerQueue({
    ...options,
    reason: options.reason || "activate",
  });

  bridgeActive = true;
  attachMainThreadRemoteHandlers();

  observePlaybackStateTransition("bridge_activated", "playback_bridge", {
    reason: options.reason || "activate",
    queueLength: options.songs.length,
    playedIndex,
  });

  await inspectBridgeQueue("activate_track_player_playback", {
    queueLength: options.songs.length,
    activeIndex: playedIndex,
    trackId: expectedTrack?.id ? String(expectedTrack.id) : null,
    title: expectedTrack?.title ? String(expectedTrack.title) : null,
    artist: expectedTrack?.artist ? String(expectedTrack.artist) : null,
  });

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

  const expectedTrack = options.songs[options.startIndex];

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

  await inspectBridgeQueue("bridge_play_queue_from_index", {
    queueLength: options.songs.length,
    activeIndex: playedIndex,
    trackId: expectedTrack?.id ? String(expectedTrack.id) : null,
    title: expectedTrack?.title ? String(expectedTrack.title) : null,
    artist: expectedTrack?.artist ? String(expectedTrack.artist) : null,
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

  await inspectBridgeQueue("bridge_try_skip_to_next", {
    activeIndex: afterIndex ?? undefined,
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

  observePlaybackStateTransition("bridge_deactivated", "playback_bridge", {
    reason,
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
  await inspectBridgeQueue("bridge_skip_to_next");
}

export async function bridgeSkipToPrevious(): Promise<void> {
  if (!isPlaybackBridgeActive()) return;
  await trackPlayerSkipToPrevious();
  await inspectBridgeQueue("bridge_skip_to_previous");
}

export async function bridgeGetProgress(): Promise<PlaybackProgress> {
  if (!isPlaybackBridgeActive()) {
    return {
      positionMillis: 0,
      durationMillis: 0,
      isPlaying: false,
    };
  }

  const progress = await getTrackPlayerProgress();
  observeProgressUpdate(progress, "bridge_get_progress");
  return progress;
}

export async function bridgeGetActiveIndex(): Promise<number | null> {
  if (!isPlaybackBridgeActive()) return null;

  const activeIndex = await getTrackPlayerActiveIndex();
  await inspectBridgeQueue("bridge_get_active_index", {
    activeIndex: activeIndex ?? undefined,
  });

  return activeIndex;
}

export async function bridgeGetQueueSnapshot() {
  if (!isPlaybackBridgeActive()) return null;

  const snapshot = await getTrackPlayerQueueSnapshot();
  if (snapshot) {
    await inspectBridgeQueue("bridge_get_queue_snapshot", {
      queueLength: snapshot.queueLength,
      activeIndex: snapshot.activeIndex ?? undefined,
    });
  }

  return snapshot;
}

export function subscribeBridgeEvents(
  handlers: TrackPlayerEventHandlers
): () => void {
  if (!isTrackPlayerFeatureEnabled() || !supportsNativeTrackPlayer()) {
    return () => {};
  }

  return subscribeTrackPlayerEvents(handlers);
}

export async function bridgeSetProgressInterval(
  appState: AppStateStatus
): Promise<void> {
  if (!isTrackPlayerFeatureEnabled()) return;

  const intervalSeconds = appState === "active" ? 0.5 : 1;
  logBackgroundPlayback("progress_interval_update", {
    appState,
    intervalSeconds,
  });
  await updateTrackPlayerProgressInterval(intervalSeconds);
}

export async function bridgePlay(): Promise<void> {
  if (!isPlaybackBridgeActive()) return;
  await trackPlayerPlay();
  observePlaybackStateTransition("playing", "playback_bridge", {
    action: "bridge_play",
  });
}

export async function bridgePause(): Promise<void> {
  if (!isPlaybackBridgeActive()) return;
  await trackPlayerPause();
  observePlaybackStateTransition("paused", "playback_bridge", {
    action: "bridge_pause",
  });
}

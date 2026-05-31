import { Platform } from "react-native";

import { isTrackPlayerFeatureEnabled } from "../constants/playbackConfig";
import {
  recordBridgeSubscriptionCreated,
  recordBridgeSubscriptionDisposed,
  recordConfigureTrackPlayerOptions,
  recordListenerRegister,
  recordListenerUnregister,
  recordUpdateTrackPlayerProgressInterval,
} from "../utils/runtimeInstrumentation";
import {
  captureDevStackTrace,
  logTrackPlayerBg,
  logTrackPlayerQueue,
} from "../utils/backgroundPlaybackLogs";
import { supportsNativeTrackPlayer } from "../utils/expoRuntime";
import {
  PlaybackEngine,
  PlaybackEngineEventHandlers,
  PlaybackEngineProgress,
  PlaybackEngineRepeatMode,
  PlaybackEngineTrack,
} from "./playbackEngineTypes";

export type TrackPlayerSongInput = PlaybackEngineTrack;
export type PlayerRepeatMode = PlaybackEngineRepeatMode;
export type PlaybackProgress = PlaybackEngineProgress;
export type TrackPlayerEventHandlers = PlaybackEngineEventHandlers;

type TrackPlayerModule = typeof import("react-native-track-player");

type TrackPlayerApi = TrackPlayerModule["default"];

type TrackPlayerTrack = {
  id: string;
  url: string;
  title: string;
  artist: string;
  album: string;
  artwork?: string;
  duration?: number;
};

export type TrackPlayerQueueSnapshot = {
  queueLength: number;
  activeIndex: number | null;
  playbackState: string | null;
  trackIds: string[];
};

const APP_DISPLAY_NAME = "Hidden Tunes";
const INVALID_METADATA_PATTERN =
  /sitemap|error|404|not found|html|xml|<!doctype/i;

/** Keep foreground service alive through long lock-screen sessions. */
const ANDROID_STOP_FOREGROUND_GRACE_PERIOD_SECONDS = 3600;

let setupComplete = false;
let optionsConfigured = false;
let lastConfiguredProgressInterval: number | null = null;
let trackPlayerModulePromise: Promise<TrackPlayerModule | null> | null = null;

const MIN_PROGRESS_UPDATE_INTERVAL_S = 0.25;

function isNativeTrackPlayerEnabled() {
  return isTrackPlayerFeatureEnabled() && supportsNativeTrackPlayer();
}

function logTrackPlayer(message: string, details?: Record<string, unknown>) {
  logTrackPlayerBg(message, details as Parameters<typeof logTrackPlayerBg>[1]);
}

export async function getTrackPlayerQueueSnapshot(): Promise<TrackPlayerQueueSnapshot | null> {
  const module = await getTrackPlayerModule();
  const player = await getTrackPlayerApi();
  if (!module || !player) return null;

  try {
    const [queue, activeIndex, playbackState] = await Promise.all([
      player.getQueue(),
      player.getActiveTrackIndex(),
      player.getPlaybackState(),
    ]);

    const trackIds = Array.isArray(queue)
      ? queue
          .map((track) => String((track as { id?: unknown })?.id ?? "").trim())
          .filter((id) => id.length > 0)
      : [];

    return {
      queueLength: trackIds.length,
      activeIndex:
        typeof activeIndex === "number" ? activeIndex : null,
      playbackState:
        playbackState?.state !== undefined
          ? String(playbackState.state)
          : null,
      trackIds,
    };
  } catch (error) {
    logTrackPlayer("queue_snapshot_error", {
      message: String((error as Error)?.message || error),
    });
    return null;
  }
}

async function logQueueSnapshot(label: string) {
  const snapshot = await getTrackPlayerQueueSnapshot();
  if (!snapshot) return;

  logTrackPlayerQueue(label, {
    queueLength: snapshot.queueLength,
    activeIndex: snapshot.activeIndex,
    playbackState: snapshot.playbackState,
  });
}

function buildAndroidPlayerOptions(
  AppKilledPlaybackBehavior: TrackPlayerModule["AppKilledPlaybackBehavior"]
) {
  return {
    appKilledPlaybackBehavior: AppKilledPlaybackBehavior.PausePlayback,
    alwaysPauseOnInterruption: false,
    stopForegroundGracePeriod: ANDROID_STOP_FOREGROUND_GRACE_PERIOD_SECONDS,
  };
}

async function getTrackPlayerModule(): Promise<TrackPlayerModule | null> {
  if (!isNativeTrackPlayerEnabled()) return null;

  if (!trackPlayerModulePromise) {
    trackPlayerModulePromise = import("react-native-track-player").catch((error) => {
      if (__DEV__) {
        console.warn("Track Player lazy import failed:", error);
      }

      return null;
    });
  }

  return trackPlayerModulePromise;
}

async function getTrackPlayerApi(): Promise<TrackPlayerApi | null> {
  const module = await getTrackPlayerModule();
  if (!module?.default) return null;
  return module.default;
}

function sanitizeMetadataText(value: unknown, fallback: string) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  if (/^https?:\/\//i.test(text)) return fallback;
  if (INVALID_METADATA_PATTERN.test(text)) return fallback;
  return text.slice(0, 160);
}

function isLikelyAudioUrl(url: string) {
  const value = url.trim().toLowerCase();
  if (!/^https?:\/\//i.test(value)) return false;
  if (INVALID_METADATA_PATTERN.test(value)) return false;
  if (/\/sitemap|\.xml(\?|$)|\.html?(\?|$)/i.test(value)) return false;
  return true;
}

function isValidArtworkUrl(url: string) {
  const value = url.trim();
  if (!/^https?:\/\//i.test(value)) return false;
  if (INVALID_METADATA_PATTERN.test(value)) return false;
  if (/\/sitemap|\.xml(\?|$)|\.html?(\?|$)/i.test(value)) return false;
  return true;
}

function getSongUrl(song: TrackPlayerSongInput) {
  const candidates = [song.streamUrl, song.url, song.audioUrl, song.audio_url];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed.length > 0 && isLikelyAudioUrl(trimmed)) {
      return trimmed;
    }
  }
  return null;
}

function getArtwork(song: TrackPlayerSongInput) {
  const artwork =
    song.artwork ||
    song.artworkUrl ||
    song.cover ||
    song.coverUrl ||
    song.thumbnail;

  if (typeof artwork !== "string") return undefined;

  const trimmed = artwork.trim();
  return isValidArtworkUrl(trimmed) ? trimmed : undefined;
}

function normalizeDuration(duration: TrackPlayerSongInput["duration"]) {
  if (typeof duration === "number") return duration;

  if (typeof duration === "string") {
    const parsed = Number(duration);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function songToTrack(song: TrackPlayerSongInput): TrackPlayerTrack | null {
  const url = getSongUrl(song);
  if (!url) {
    if (__DEV__) {
      logTrackPlayer("skip_track_missing_audio", {
        id: song.id,
        title: song.title,
      });
    }
    return null;
  }

  const title = sanitizeMetadataText(song.title, "Unknown Song");
  const userName =
    song.user && typeof song.user === "object" && "name" in song.user
      ? (song.user as { name?: string }).name
      : undefined;

  const artist = sanitizeMetadataText(
    song.artist || userName || song.channelTitle,
    "Unknown Artist"
  );
  const album = sanitizeMetadataText(song.album || song.sourceName, APP_DISPLAY_NAME);

  const track: TrackPlayerTrack = {
    id: String(song.id),
    url,
    title,
    artist,
    album,
    artwork: getArtwork(song),
    duration: normalizeDuration(song.duration),
  };

  if (__DEV__) {
    logTrackPlayer("notification_metadata", {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      hasArtwork: Boolean(track.artwork),
      hasAudio: true,
    });
  }

  return track;
}

export function isTrackPlayerRuntimeAvailable(): boolean {
  return isNativeTrackPlayerEnabled();
}

/** False in Expo Go even when USE_NATIVE_TRACK_PLAYER is true. */
export function isTrackPlayerNativeRuntimeSupported(): boolean {
  return supportsNativeTrackPlayer();
}

function normalizeProgressIntervalSeconds(intervalSeconds: number) {
  return Math.max(MIN_PROGRESS_UPDATE_INTERVAL_S, intervalSeconds);
}

async function configureTrackPlayerOptions(
  progressUpdateEventInterval = 1,
  reason = "configure_track_player_options"
): Promise<void> {
  const safeInterval = normalizeProgressIntervalSeconds(progressUpdateEventInterval);

  if (
    optionsConfigured &&
    lastConfiguredProgressInterval !== null &&
    lastConfiguredProgressInterval === safeInterval
  ) {
    return;
  }

  recordConfigureTrackPlayerOptions(safeInterval, reason);

  const module = await getTrackPlayerModule();
  const player = await getTrackPlayerApi();
  if (!module || !player) return;

  const { Capability, AppKilledPlaybackBehavior } = module;

  const options = {
    progressUpdateEventInterval: safeInterval,
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.Stop,
      Capability.SeekTo,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
    ],
    notificationCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.Stop,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
    ],
    compactCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
    ],
    android: buildAndroidPlayerOptions(AppKilledPlaybackBehavior),
  };

  const updateOptions = (player as { updateOptions?: (value: unknown) => Promise<void> })
    .updateOptions;

  try {
    if (typeof updateOptions === "function") {
      await updateOptions.call(player, options);
      lastConfiguredProgressInterval = safeInterval;
      logTrackPlayer("update_options_applied", {
        progressUpdateEventInterval: safeInterval,
        appKilled: AppKilledPlaybackBehavior.PausePlayback,
        alwaysPauseOnInterruption: false,
        stopForegroundGracePeriod: ANDROID_STOP_FOREGROUND_GRACE_PERIOD_SECONDS,
      });
    } else {
      logTrackPlayer("update_options_unavailable", {
        note: "RNTP build has no updateOptions; relying on setupPlayer + playback service",
      });
    }
  } catch (error) {
    if (__DEV__) {
      console.warn("[HiddenTunes:TrackPlayer] updateOptions failed:", error);
    }
  }

  optionsConfigured = true;
}

export async function setupTrackPlayer(): Promise<boolean> {
  const module = await getTrackPlayerModule();
  const player = await getTrackPlayerApi();
  if (!module || !player) return false;

  if (setupComplete) {
    if (!optionsConfigured) {
      await configureTrackPlayerOptions();
    }

    return true;
  }

  try {
    const { AppKilledPlaybackBehavior } = module;

    await player.setupPlayer({
      autoUpdateMetadata: true,
      autoHandleInterruptions: true,
      android: buildAndroidPlayerOptions(AppKilledPlaybackBehavior),
    } as Parameters<typeof player.setupPlayer>[0]);

    await configureTrackPlayerOptions();

    if (Platform.OS === "android") {
      try {
        await player.acquireWakeLock();
        logTrackPlayer("wake_lock_acquired");
      } catch (wakeError) {
        if (__DEV__) {
          console.warn("Track Player wake lock failed:", wakeError);
        }
      }
    }

    setupComplete = true;
    logTrackPlayer("setup_complete");
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn("Track Player setup failed:", error);
    }

    return false;
  }
}

export async function ensureTrackPlayerReady(): Promise<boolean> {
  return setupTrackPlayer();
}

export async function updateTrackPlayerProgressInterval(
  intervalSeconds: number,
  reason = "update_track_player_progress_interval"
): Promise<void> {
  const safeInterval = normalizeProgressIntervalSeconds(intervalSeconds);

  if (
    optionsConfigured &&
    lastConfiguredProgressInterval !== null &&
    lastConfiguredProgressInterval === safeInterval
  ) {
    return;
  }

  recordUpdateTrackPlayerProgressInterval(safeInterval, reason);

  const ready = await setupTrackPlayer();
  if (!ready) return;

  await configureTrackPlayerOptions(safeInterval, reason);
}

export async function resetTrackPlayerPlayback(
  reason = "unknown"
): Promise<void> {
  logTrackPlayer("reset_requested", {
    reason,
    stack: captureDevStackTrace(),
  });

  const player = await getTrackPlayerApi();
  if (!player) return;

  await player.stop();
  await player.reset();

  lastConfiguredProgressInterval = null;
  optionsConfigured = false;

  logTrackPlayer("reset_complete", { reason });
}

export function getIntendedTrackPlayerTrackIds(
  songs: TrackPlayerSongInput[]
): string[] {
  return (songs.map(songToTrack).filter(Boolean) as TrackPlayerTrack[]).map(
    (track) => track.id
  );
}

export function trackPlayerQueueIdsMatch(
  nativeTrackIds: string[],
  intendedTrackIds: string[]
): boolean {
  if (!intendedTrackIds.length || nativeTrackIds.length !== intendedTrackIds.length) {
    return false;
  }

  for (let index = 0; index < intendedTrackIds.length; index += 1) {
    if (String(nativeTrackIds[index]) !== String(intendedTrackIds[index])) {
      return false;
    }
  }

  return true;
}

export function resolveTrackPlayerPlayIndex(
  songs: TrackPlayerSongInput[],
  songId: string,
  fallbackIndex: number
): number {
  const tracks = songs.map(songToTrack).filter(Boolean) as TrackPlayerTrack[];

  if (!tracks.length) return 0;

  const matchedIndex = tracks.findIndex((track) => track.id === String(songId));

  if (matchedIndex >= 0) return matchedIndex;

  return Math.max(0, Math.min(fallbackIndex, tracks.length - 1));
}

export async function fastSkipTrackPlayerToIndex(options: {
  startIndex: number;
  repeatMode: PlayerRepeatMode;
  volume: number;
  muted: boolean;
  startPositionMillis?: number;
}): Promise<number> {
  const ready = await setupTrackPlayer();
  if (!ready) return Math.max(0, options.startIndex);

  const player = await getTrackPlayerApi();
  if (!player) return Math.max(0, options.startIndex);

  const snapshot = await getTrackPlayerQueueSnapshot();
  const queueLength = snapshot?.trackIds.length || 0;

  if (!queueLength) return 0;

  const safeIndex = Math.max(0, Math.min(options.startIndex, queueLength - 1));
  const startPositionSeconds =
    options.startPositionMillis && options.startPositionMillis > 0
      ? options.startPositionMillis / 1000
      : undefined;

  logTrackPlayerQueue("fast_skip_start", {
    startIndex: safeIndex,
    queueLength,
  });

  await player.skip(safeIndex, startPositionSeconds);
  await trackPlayerSetVolume(options.volume, options.muted);
  await setTrackPlayerRepeatMode(options.repeatMode);
  await player.play();

  logTrackPlayerQueue("fast_skip_complete", {
    startIndex: safeIndex,
    queueLength,
  });

  return safeIndex;
}

export async function playTrackPlayerQueue(options: {
  songs: TrackPlayerSongInput[];
  startIndex: number;
  repeatMode: PlayerRepeatMode;
  volume: number;
  muted: boolean;
  startPositionMillis?: number;
  reason?: string;
}): Promise<number> {
  const ready = await setupTrackPlayer();
  if (!ready) return Math.max(0, options.startIndex);

  const player = await getTrackPlayerApi();
  if (!player) return Math.max(0, options.startIndex);

  const tracks = options.songs
    .map(songToTrack)
    .filter(Boolean) as TrackPlayerTrack[];
  if (!tracks.length) return 0;

  const skippedCount = Math.max(0, options.songs.length - tracks.length);
  if (skippedCount > 0) {
    logTrackPlayerQueue("tracks_skipped_missing_audio", {
      requested: options.songs.length,
      loaded: tracks.length,
      skipped: skippedCount,
      reason: options.reason || "load_queue",
    });
  }

  const safeIndex = Math.max(0, Math.min(options.startIndex, tracks.length - 1));
  const startPositionSeconds =
    options.startPositionMillis && options.startPositionMillis > 0
      ? options.startPositionMillis / 1000
      : undefined;

  const loadReason = options.reason || "load_queue";

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[tap-timing] full-reload-trackCount", tracks.length, {
      reason: loadReason,
    });
  }

  logTrackPlayerQueue("load_queue_start", {
    reason: loadReason,
    requested: options.songs.length,
    trackCount: tracks.length,
    startIndex: safeIndex,
  });

  await player.reset();
  await player.add(tracks);
  await player.skip(safeIndex, startPositionSeconds);

  await trackPlayerSetVolume(options.volume, options.muted);
  await setTrackPlayerRepeatMode(options.repeatMode);
  await player.play();

  const active = tracks[safeIndex];
  logTrackPlayerQueue("load_queue_complete", {
    reason: options.reason || "load_queue",
    trackCount: tracks.length,
    startIndex: safeIndex,
    activeTrackId: active?.id ?? null,
  });

  return safeIndex;
}

export async function setTrackPlayerRepeatMode(
  mode: PlayerRepeatMode
): Promise<void> {
  const module = await getTrackPlayerModule();
  const player = await getTrackPlayerApi();
  if (!module || !player) return;

  const repeatMode =
    mode === "one"
      ? module.RepeatMode.Track
      : mode === "all"
        ? module.RepeatMode.Queue
        : module.RepeatMode.Off;

  await player.setRepeatMode(repeatMode);
}

export async function getTrackPlayerProgress(): Promise<PlaybackProgress> {
  const module = await getTrackPlayerModule();
  const player = await getTrackPlayerApi();
  if (!module || !player) {
    return {
      positionMillis: 0,
      durationMillis: 0,
      isPlaying: false,
    };
  }

  const progress = await player.getProgress();
  const playbackState = await player.getPlaybackState();

  return {
    positionMillis: Math.max(0, Math.floor((progress.position || 0) * 1000)),
    durationMillis: Math.max(0, Math.floor((progress.duration || 0) * 1000)),
    isPlaying: playbackState.state === module.State.Playing,
  };
}

export async function getTrackPlayerActiveIndex(): Promise<number | null> {
  const player = await getTrackPlayerApi();
  if (!player) return null;

  const activeTrackIndex = await player.getActiveTrackIndex();
  return typeof activeTrackIndex === "number" ? activeTrackIndex : null;
}

export async function trackPlayerPlay(): Promise<void> {
  const player = await getTrackPlayerApi();
  if (!player) return;

  await player.play();
}

export async function trackPlayerPause(): Promise<void> {
  const player = await getTrackPlayerApi();
  if (!player) return;

  await player.pause();
}

export async function trackPlayerStop(reason = "unknown"): Promise<void> {
  logTrackPlayer("stop_requested", {
    reason,
    stack: captureDevStackTrace(),
  });

  const player = await getTrackPlayerApi();
  if (!player) return;

  await player.stop();
}

export async function trackPlayerTogglePlayPause(): Promise<boolean> {
  const module = await getTrackPlayerModule();
  const player = await getTrackPlayerApi();
  if (!module || !player) return false;

  const playbackState = await player.getPlaybackState();

  if (playbackState.state === module.State.Playing) {
    await player.pause();
    return false;
  }

  await player.play();
  return true;
}

export async function trackPlayerSeekTo(millis: number): Promise<void> {
  const player = await getTrackPlayerApi();
  if (!player) return;

  await player.seekTo(Math.max(0, millis) / 1000);
}

export async function trackPlayerSetVolume(
  volume: number,
  muted: boolean
): Promise<void> {
  const player = await getTrackPlayerApi();
  if (!player) return;

  const safeVolume = muted ? 0 : Math.max(0, Math.min(volume, 1));
  await player.setVolume(safeVolume);
}

export async function trackPlayerSkipToNext(): Promise<boolean> {
  const player = await getTrackPlayerApi();
  if (!player) return false;

  const beforeIndex = await getTrackPlayerActiveIndex();

  try {
    await player.skipToNext();
    const afterIndex = await getTrackPlayerActiveIndex();

    logTrackPlayerQueue("skip_to_next", {
      beforeIndex,
      afterIndex,
      advanced: afterIndex !== null && afterIndex !== beforeIndex,
    });

    return afterIndex !== null && afterIndex !== beforeIndex;
  } catch (error) {
    logTrackPlayerQueue("skip_to_next_failed", {
      beforeIndex,
      message: String((error as Error)?.message || error),
    });
    return false;
  }
}

export async function trackPlayerSkipToPrevious(): Promise<void> {
  const player = await getTrackPlayerApi();
  if (!player) return;

  await player.skipToPrevious();
}

export function subscribeTrackPlayerEvents(
  handlers: TrackPlayerEventHandlers
): () => void {
  if (!isNativeTrackPlayerEnabled()) return () => {};

  const subscriptionInstanceId = `track_player_events_${Date.now()}`;
  recordListenerRegister("track_player_events", subscriptionInstanceId);
  recordBridgeSubscriptionCreated();

  let disposed = false;
  const subscriptions: Array<{ remove: () => void }> = [];

  void (async () => {
    const module = await getTrackPlayerModule();
    const player = await getTrackPlayerApi();
    if (!module || !player || disposed) return;

    const { Event, State } = module;
    let lastKnownPlaying = true;

    const emitActiveTrackChanged = (payload?: {
      index?: number;
      track?: { id?: unknown } | null;
    }) => {
      const index = typeof payload?.index === "number" ? payload.index : undefined;
      if (typeof index !== "number") return;

      const rawTrackId =
        payload?.track && typeof payload.track === "object" && "id" in payload.track
          ? (payload.track as { id?: unknown }).id
          : undefined;
      const trackId =
        typeof rawTrackId === "string" || typeof rawTrackId === "number"
          ? String(rawTrackId)
          : null;

      logTrackPlayerQueue("active_track_changed", {
        index,
        trackId,
      });

      handlers.onActiveTrackChanged?.(index, trackId);
    };

    subscriptions.push(
      player.addEventListener(Event.PlaybackState, (event) => {
        const state =
          event && typeof event === "object" && "state" in event
            ? (event as { state?: unknown }).state
            : undefined;

        if (state === State.Playing) {
          lastKnownPlaying = true;
        } else if (
          state === State.Paused ||
          state === State.Stopped ||
          state === State.Ended
        ) {
          lastKnownPlaying = false;
        }

        logTrackPlayer("playback_state", {
          state: state !== undefined ? String(state) : undefined,
        });
      })
    );

    subscriptions.push(
      player.addEventListener(
        Event.PlaybackProgressUpdated,
        (event: { position?: number; duration?: number }) => {
          const positionSeconds = event?.position ?? 0;
          const durationSeconds = event?.duration ?? 0;
          const positionMillis = Math.max(0, Math.floor(positionSeconds * 1000));
          const durationMillis = Math.max(0, Math.floor(durationSeconds * 1000));

          handlers.onProgress?.({
            positionMillis,
            durationMillis,
            isPlaying: lastKnownPlaying,
          });
        }
      )
    );

    subscriptions.push(
      player.addEventListener(
        Event.PlaybackActiveTrackChanged,
        (event) => {
          const payload = event as { index?: number; track?: { id?: unknown } | null };
          if (typeof payload?.index === "number") {
            lastKnownPlaying = true;
          }
          emitActiveTrackChanged(payload);
        }
      )
    );

    subscriptions.push(
      player.addEventListener(Event.PlaybackQueueEnded, (event) => {
        lastKnownPlaying = false;
        logTrackPlayerQueue("natural_queue_ended", {
          position:
            event && typeof event === "object" && "position" in event
              ? Number((event as { position?: unknown }).position)
              : undefined,
          track:
            event && typeof event === "object" && "track" in event
              ? Number((event as { track?: unknown }).track)
              : undefined,
        });
        handlers.onQueueEnded?.();
      })
    );

    subscriptions.push(
      player.addEventListener(
        Event.PlaybackError,
        (event?: { message?: string; code?: string }) => {
          const message =
            typeof event?.message === "string"
              ? event.message
              : typeof event?.code === "string"
                ? event.code
                : "playback_error";

          logTrackPlayer("playback_error", { message, ...(event || {}) });
          handlers.onPlaybackError?.(message);
        }
      )
    );
  })();

  return () => {
    disposed = true;
    recordListenerUnregister("track_player_events", subscriptionInstanceId);
    recordBridgeSubscriptionDisposed();
    subscriptions.forEach((subscription) => {
      try {
        subscription.remove();
      } catch {
        // ignore
      }
    });
  };
}

export const trackPlayerEngine: PlaybackEngine = {
  id: "track-player",
  capabilities: {
    ownsNativeQueue: true,
    supportsLockScreenAutoNext: true,
    supportsRemoteControls: true,
    supportsExpoGo: false,
  },
  isAvailable: ensureTrackPlayerReady,
  loadQueue: async (options) =>
    playTrackPlayerQueue({
      songs: options.tracks,
      startIndex: options.startIndex,
      repeatMode: options.repeatMode,
      volume: options.volume,
      muted: options.muted,
      startPositionMillis: options.startPositionMillis,
      reason: "engine_load_queue",
    }),
  reset: resetTrackPlayerPlayback,
  play: trackPlayerPlay,
  pause: trackPlayerPause,
  stop: trackPlayerStop,
  togglePlayPause: trackPlayerTogglePlayPause,
  seekTo: trackPlayerSeekTo,
  setVolume: trackPlayerSetVolume,
  setRepeatMode: setTrackPlayerRepeatMode,
  skipToNext: async () => {
    await trackPlayerSkipToNext();
  },
  skipToPrevious: trackPlayerSkipToPrevious,
  getProgress: getTrackPlayerProgress,
  getActiveIndex: getTrackPlayerActiveIndex,
  subscribe: subscribeTrackPlayerEvents,
};

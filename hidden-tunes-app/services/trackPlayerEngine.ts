import { Platform } from "react-native";

import { USE_NATIVE_TRACK_PLAYER } from "../constants/playbackConfig";
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

const APP_DISPLAY_NAME = "Hidden Tunes";
const INVALID_METADATA_PATTERN =
  /sitemap|error|404|not found|html|xml|<!doctype/i;

let setupComplete = false;
let optionsConfigured = false;
let trackPlayerModulePromise: Promise<TrackPlayerModule | null> | null = null;

function isNativeTrackPlayerEnabled() {
  return Boolean(USE_NATIVE_TRACK_PLAYER) && supportsNativeTrackPlayer();
}

function logTrackPlayer(message: string, details?: Record<string, unknown>) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log(`[HiddenTunes:TrackPlayer] ${message}`, details || {});
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

async function configureTrackPlayerOptions(
  progressUpdateEventInterval = 1
): Promise<void> {
  const module = await getTrackPlayerModule();
  const player = await getTrackPlayerApi();
  if (!module || !player) return;

  const { Capability, AppKilledPlaybackBehavior } = module;

  const options = {
    progressUpdateEventInterval,
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
    android: {
      appKilledPlaybackBehavior:
        AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      alwaysPauseOnInterruption: true,
    },
  };

  const updateOptions = (player as { updateOptions?: (value: unknown) => Promise<void> })
    .updateOptions;

  try {
    if (typeof updateOptions === "function") {
      await updateOptions.call(player, options);
      logTrackPlayer("update_options_applied", {
        progressUpdateEventInterval,
        appKilled: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
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
      android: {
        appKilledPlaybackBehavior:
          AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
        alwaysPauseOnInterruption: true,
      },
    } as Parameters<typeof player.setupPlayer>[0]);

    await configureTrackPlayerOptions();

    if (Platform.OS === "android") {
      try {
        await player.acquireWakeLock();
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
  intervalSeconds: number
): Promise<void> {
  const ready = await setupTrackPlayer();
  if (!ready) return;

  await configureTrackPlayerOptions(Math.max(0.25, intervalSeconds));
}

export async function resetTrackPlayerPlayback(): Promise<void> {
  const player = await getTrackPlayerApi();
  if (!player) return;

  await player.stop();
  await player.reset();
}

export async function playTrackPlayerQueue(options: {
  songs: TrackPlayerSongInput[];
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

  const tracks = options.songs.map(songToTrack).filter(Boolean) as TrackPlayerTrack[];
  if (!tracks.length) return 0;

  const safeIndex = Math.max(0, Math.min(options.startIndex, tracks.length - 1));
  const startPositionSeconds =
    options.startPositionMillis && options.startPositionMillis > 0
      ? options.startPositionMillis / 1000
      : undefined;

  await player.reset();
  await player.add(tracks);
  await player.skip(safeIndex, startPositionSeconds);

  await trackPlayerSetVolume(options.volume, options.muted);
  await setTrackPlayerRepeatMode(options.repeatMode);
  await player.play();

  if (__DEV__) {
    const active = tracks[safeIndex];
    logTrackPlayer("queue_started", {
      trackCount: tracks.length,
      startIndex: safeIndex,
      activeTrack: active
        ? {
            id: active.id,
            title: active.title,
            artist: active.artist,
            album: active.album,
          }
        : null,
    });
  }

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

export async function trackPlayerStop(): Promise<void> {
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

export async function trackPlayerSkipToNext(): Promise<void> {
  const player = await getTrackPlayerApi();
  if (!player) return;

  await player.skipToNext();
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

  let disposed = false;
  const subscriptions: Array<{ remove: () => void }> = [];

  void (async () => {
    const module = await getTrackPlayerModule();
    const player = await getTrackPlayerApi();
    if (!module || !player || disposed) return;

    const { Event, State } = module;

    const resolveActiveTrack = async (payload?: { index?: number }) => {
      let index =
        typeof payload?.index === "number" ? payload.index : undefined;

      if (typeof index !== "number") {
        const activeIndex = await player.getActiveTrackIndex();
        index = typeof activeIndex === "number" ? activeIndex : undefined;
      }

      if (typeof index !== "number") return;

      const track = await player.getTrack(index);
      const trackId =
        track && typeof track.id === "string" ? String(track.id) : null;

      handlers.onActiveTrackChanged?.(index, trackId);
    };

    subscriptions.push(
      player.addEventListener(
        Event.PlaybackProgressUpdated,
        (event: { position?: number; duration?: number }) => {
          const positionSeconds = event?.position ?? 0;
          const durationSeconds = event?.duration ?? 0;

          void (async () => {
            let isPlaying = false;

            try {
              const playbackState = await player.getPlaybackState();
              isPlaying = playbackState.state === State.Playing;
            } catch {
              // Player may not be ready yet.
            }

            handlers.onProgress?.({
              positionMillis: Math.max(
                0,
                Math.floor(positionSeconds * 1000)
              ),
              durationMillis: Math.max(
                0,
                Math.floor(durationSeconds * 1000)
              ),
              isPlaying,
            });
          })();
        }
      )
    );

    subscriptions.push(
      player.addEventListener(
        Event.PlaybackActiveTrackChanged,
        (event?: { index?: number }) => {
          void resolveActiveTrack(event);
        }
      )
    );

    subscriptions.push(
      player.addEventListener(Event.PlaybackQueueEnded, () => {
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

          handlers.onPlaybackError?.(message);
        }
      )
    );
  })();

  return () => {
    disposed = true;
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
    }),
  reset: resetTrackPlayerPlayback,
  play: trackPlayerPlay,
  pause: trackPlayerPause,
  stop: trackPlayerStop,
  togglePlayPause: trackPlayerTogglePlayPause,
  seekTo: trackPlayerSeekTo,
  setVolume: trackPlayerSetVolume,
  setRepeatMode: setTrackPlayerRepeatMode,
  skipToNext: trackPlayerSkipToNext,
  skipToPrevious: trackPlayerSkipToPrevious,
  getProgress: getTrackPlayerProgress,
  getActiveIndex: getTrackPlayerActiveIndex,
  subscribe: subscribeTrackPlayerEvents,
};

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

type TrackPlayerTrack = {
  id: string;
  url: string;
  title: string;
  artist?: string;
  album?: string;
  artwork?: string;
  duration?: number;
};

let setupComplete = false;
let optionsConfigured = false;
let trackPlayerModulePromise: Promise<TrackPlayerModule | null> | null = null;

function isNativeTrackPlayerEnabled() {
  return Boolean(USE_NATIVE_TRACK_PLAYER) && supportsNativeTrackPlayer();
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

function getSongUrl(song: TrackPlayerSongInput) {
  const url = song.streamUrl || song.url || song.audioUrl || song.audio_url;
  return typeof url === "string" && url.trim().length > 0 ? url.trim() : null;
}

function getArtwork(song: TrackPlayerSongInput) {
  const artwork =
    song.artwork ||
    song.artworkUrl ||
    song.cover ||
    song.coverUrl ||
    song.thumbnail;

  return typeof artwork === "string" && artwork.trim().length > 0
    ? artwork.trim()
    : undefined;
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
  if (!url) return null;

  return {
    id: String(song.id),
    url,
    title: String(song.title || "Unknown Song"),
    artist: song.artist,
    album: song.album,
    artwork: getArtwork(song),
    duration: normalizeDuration(song.duration),
  };
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
  const TrackPlayer = await getTrackPlayerModule();
  if (!TrackPlayer) return;

  const { Capability, AppKilledPlaybackBehavior } = TrackPlayer;

  await TrackPlayer.default.updateOptions({
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
      Capability.SkipToNext,
      Capability.SkipToPrevious,
    ],
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
      alwaysPauseOnInterruption: false,
    },
  });

  optionsConfigured = true;
}

export async function setupTrackPlayer(): Promise<boolean> {
  const TrackPlayer = await getTrackPlayerModule();
  if (!TrackPlayer) return false;

  if (setupComplete) {
    if (!optionsConfigured) {
      await configureTrackPlayerOptions();
    }

    return true;
  }

  try {
    await TrackPlayer.default.setupPlayer({
      autoUpdateMetadata: true,
      autoHandleInterruptions: true,
    });

    await configureTrackPlayerOptions();

    if (Platform.OS === "android") {
      try {
        await TrackPlayer.default.acquireWakeLock();
      } catch (wakeError) {
        if (__DEV__) {
          console.warn("Track Player wake lock failed:", wakeError);
        }
      }
    }

    setupComplete = true;
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
  const TrackPlayer = await getTrackPlayerModule();
  if (!TrackPlayer) return;

  await TrackPlayer.default.reset();
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

  const TrackPlayer = await getTrackPlayerModule();
  if (!TrackPlayer) return Math.max(0, options.startIndex);

  const tracks = options.songs.map(songToTrack).filter(Boolean) as TrackPlayerTrack[];
  if (!tracks.length) return 0;

  const safeIndex = Math.max(0, Math.min(options.startIndex, tracks.length - 1));
  const startPositionSeconds =
    options.startPositionMillis && options.startPositionMillis > 0
      ? options.startPositionMillis / 1000
      : undefined;

  await TrackPlayer.default.reset();
  await TrackPlayer.default.add(tracks);
  await TrackPlayer.default.skip(safeIndex, startPositionSeconds);

  await trackPlayerSetVolume(options.volume, options.muted);
  await setTrackPlayerRepeatMode(options.repeatMode);
  await TrackPlayer.default.play();

  return safeIndex;
}

export async function setTrackPlayerRepeatMode(
  mode: PlayerRepeatMode
): Promise<void> {
  const TrackPlayer = await getTrackPlayerModule();
  if (!TrackPlayer) return;

  const repeatMode =
    mode === "one"
      ? TrackPlayer.RepeatMode.Track
      : mode === "all"
        ? TrackPlayer.RepeatMode.Queue
        : TrackPlayer.RepeatMode.Off;

  await TrackPlayer.default.setRepeatMode(repeatMode);
}

export async function getTrackPlayerProgress(): Promise<PlaybackProgress> {
  const TrackPlayer = await getTrackPlayerModule();
  if (!TrackPlayer) {
    return {
      positionMillis: 0,
      durationMillis: 0,
      isPlaying: false,
    };
  }

  const progress = await TrackPlayer.default.getProgress();
  const playbackState = await TrackPlayer.default.getPlaybackState();

  return {
    positionMillis: Math.max(0, Math.floor((progress.position || 0) * 1000)),
    durationMillis: Math.max(0, Math.floor((progress.duration || 0) * 1000)),
    isPlaying: playbackState.state === TrackPlayer.State.Playing,
  };
}

export async function getTrackPlayerActiveIndex(): Promise<number | null> {
  const TrackPlayer = await getTrackPlayerModule();
  if (!TrackPlayer) return null;

  const activeTrackIndex = await TrackPlayer.default.getActiveTrackIndex();
  return typeof activeTrackIndex === "number" ? activeTrackIndex : null;
}

export async function trackPlayerPlay(): Promise<void> {
  const TrackPlayer = await getTrackPlayerModule();
  if (!TrackPlayer) return;

  await TrackPlayer.default.play();
}

export async function trackPlayerPause(): Promise<void> {
  const TrackPlayer = await getTrackPlayerModule();
  if (!TrackPlayer) return;

  await TrackPlayer.default.pause();
}

export async function trackPlayerStop(): Promise<void> {
  const TrackPlayer = await getTrackPlayerModule();
  if (!TrackPlayer) return;

  await TrackPlayer.default.stop();
}

export async function trackPlayerTogglePlayPause(): Promise<boolean> {
  const TrackPlayer = await getTrackPlayerModule();
  if (!TrackPlayer) return false;

  const playbackState = await TrackPlayer.default.getPlaybackState();

  if (playbackState.state === TrackPlayer.State.Playing) {
    await TrackPlayer.default.pause();
    return false;
  }

  await TrackPlayer.default.play();
  return true;
}

export async function trackPlayerSeekTo(millis: number): Promise<void> {
  const TrackPlayer = await getTrackPlayerModule();
  if (!TrackPlayer) return;

  await TrackPlayer.default.seekTo(Math.max(0, millis) / 1000);
}

export async function trackPlayerSetVolume(
  volume: number,
  muted: boolean
): Promise<void> {
  const TrackPlayer = await getTrackPlayerModule();
  if (!TrackPlayer) return;

  const safeVolume = muted ? 0 : Math.max(0, Math.min(volume, 1));
  await TrackPlayer.default.setVolume(safeVolume);
}

export async function trackPlayerSkipToNext(): Promise<void> {
  const TrackPlayer = await getTrackPlayerModule();
  if (!TrackPlayer) return;

  await TrackPlayer.default.skipToNext();
}

export async function trackPlayerSkipToPrevious(): Promise<void> {
  const TrackPlayer = await getTrackPlayerModule();
  if (!TrackPlayer) return;

  await TrackPlayer.default.skipToPrevious();
}

export function subscribeTrackPlayerEvents(
  handlers: TrackPlayerEventHandlers
): () => void {
  if (!isNativeTrackPlayerEnabled()) return () => {};

  let disposed = false;
  const subscriptions: Array<{ remove: () => void }> = [];

  void (async () => {
    const TrackPlayer = await getTrackPlayerModule();
    if (!TrackPlayer || disposed) return;

    const { Event, State } = TrackPlayer;

    const resolveActiveTrack = async (payload?: { index?: number }) => {
      let index =
        typeof payload?.index === "number" ? payload.index : undefined;

      if (typeof index !== "number") {
        const activeIndex = await TrackPlayer.default.getActiveTrackIndex();
        index = typeof activeIndex === "number" ? activeIndex : undefined;
      }

      if (typeof index !== "number") return;

      const track = await TrackPlayer.default.getTrack(index);
      const trackId =
        track && typeof track.id === "string" ? String(track.id) : null;

      handlers.onActiveTrackChanged?.(index, trackId);
    };

    subscriptions.push(
      TrackPlayer.default.addEventListener(
        Event.PlaybackProgressUpdated,
        (event: { position?: number; duration?: number }) => {
          const positionSeconds = event?.position ?? 0;
          const durationSeconds = event?.duration ?? 0;

          void (async () => {
            let isPlaying = false;

            try {
              const playbackState =
                await TrackPlayer.default.getPlaybackState();
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
      TrackPlayer.default.addEventListener(
        Event.PlaybackActiveTrackChanged,
        (event?: { index?: number }) => {
          void resolveActiveTrack(event);
        }
      )
    );

    subscriptions.push(
      TrackPlayer.default.addEventListener(Event.PlaybackQueueEnded, () => {
        handlers.onQueueEnded?.();
      })
    );

    subscriptions.push(
      TrackPlayer.default.addEventListener(
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

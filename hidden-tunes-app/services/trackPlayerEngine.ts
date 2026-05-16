import { Platform } from "react-native";
import TrackPlayer, {
  AppKilledPlaybackMode,
  Capability,
  Event,
  RepeatMode,
  State,
  type Track,
} from "react-native-track-player";

import { isTrackPlayerFeatureEnabled } from "../constants/playbackConfig";
import { normalizeArtworkUrl } from "../utils/artwork";

export type TrackPlayerSongInput = {
  id: string;
  title: string;
  artist?: string;
  streamUrl?: string;
  url?: string;
  audioUrl?: string;
  audio_url?: string;
  audio?: { uri: string } | number;
  coverUrl?: string;
  artworkUrl?: string;
  thumbnail?: string;
  artwork?: string;
};

export type PlayerRepeatMode = "off" | "one" | "all";

export type PlaybackProgress = {
  positionMillis: number;
  durationMillis: number;
  isPlaying: boolean;
};

let setupPromise: Promise<boolean> | null = null;
let setupComplete = false;

function getPlayableUrl(song: TrackPlayerSongInput): string | null {
  const possible =
    song.streamUrl ||
    song.url ||
    song.audioUrl ||
    song.audio_url ||
    (typeof song.audio === "object" && song.audio?.uri ? song.audio.uri : null);

  if (typeof possible !== "string") return null;

  const clean = possible.trim();
  return clean.length > 0 ? clean : null;
}

function mapRepeatMode(mode: PlayerRepeatMode): RepeatMode {
  if (mode === "one") return RepeatMode.Track;
  if (mode === "all") return RepeatMode.Queue;
  return RepeatMode.Off;
}

export function songToTrack(song: TrackPlayerSongInput): Track | null {
  const url = getPlayableUrl(song);
  if (!url) return null;

  const artist = song.artist || "Unknown Artist";
  const artwork = normalizeArtworkUrl(
    song.artworkUrl ||
      song.coverUrl ||
      song.thumbnail ||
      song.artwork
  );

  return {
    id: song.id,
    url,
    title: song.title || "Unknown Song",
    artist,
    artwork,
  };
}

export function isTrackPlayerRuntimeAvailable(): boolean {
  return isTrackPlayerFeatureEnabled();
}

export async function ensureTrackPlayerReady(): Promise<boolean> {
  if (!isTrackPlayerFeatureEnabled()) return false;
  if (setupComplete) return true;

  if (!setupPromise) {
    setupPromise = (async () => {
      try {
        await TrackPlayer.setupPlayer({
          autoHandleInterruptions: true,
          autoUpdateMetadata: true,
        });

        await TrackPlayer.updateOptions({
          progressUpdateEventInterval: 1,
          android: {
            appKilledPlaybackMode: AppKilledPlaybackMode.ContinuePlayback,
          },
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.Stop,
            Capability.SeekTo,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ],
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
          ],
          notificationCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.Stop,
            Capability.SeekTo,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ],
        });

        setupComplete = true;
        return true;
      } catch (error) {
        console.log("TrackPlayer setup error:", error);
        setupPromise = null;
        return false;
      }
    })();
  }

  return setupPromise;
}

export async function resetTrackPlayerPlayback(): Promise<void> {
  if (!setupComplete) return;

  try {
    await TrackPlayer.reset();
  } catch (error) {
    console.log("TrackPlayer reset error:", error);
  }
}

export async function playTrackPlayerQueue(options: {
  songs: TrackPlayerSongInput[];
  startIndex: number;
  repeatMode: PlayerRepeatMode;
  volume: number;
  muted: boolean;
  startPositionMillis?: number;
}): Promise<number> {
  const tracks = options.songs
    .map((song) => songToTrack(song))
    .filter((track): track is Track => track !== null);

  if (!tracks.length) {
    throw new Error("No playable tracks for TrackPlayer queue.");
  }

  const safeIndex = Math.max(0, Math.min(options.startIndex, tracks.length - 1));

  await TrackPlayer.reset();
  await TrackPlayer.add(tracks);
  await TrackPlayer.setRepeatMode(mapRepeatMode(options.repeatMode));

  const startSeconds = Math.max(0, (options.startPositionMillis || 0) / 1000);

  await TrackPlayer.skip(safeIndex, startSeconds > 0 ? startSeconds : undefined);
  await TrackPlayer.setVolume(options.muted ? 0 : options.volume);
  await TrackPlayer.play();

  return safeIndex;
}

export async function setTrackPlayerRepeatMode(
  mode: PlayerRepeatMode
): Promise<void> {
  if (!setupComplete) return;

  await TrackPlayer.setRepeatMode(mapRepeatMode(mode));
}

export async function getTrackPlayerProgress(): Promise<PlaybackProgress> {
  const progress = await TrackPlayer.getProgress();
  const state = await TrackPlayer.getPlaybackState();

  return {
    positionMillis: Math.max(0, Math.round((progress.position || 0) * 1000)),
    durationMillis: Math.max(0, Math.round((progress.duration || 0) * 1000)),
    isPlaying: state.state === State.Playing,
  };
}

export async function getTrackPlayerActiveIndex(): Promise<number | null> {
  const index = await TrackPlayer.getActiveTrackIndex();
  return typeof index === "number" ? index : null;
}

export async function trackPlayerTogglePlayPause(): Promise<boolean> {
  const state = await TrackPlayer.getPlaybackState();

  if (state.state === State.Playing) {
    await TrackPlayer.pause();
    return false;
  }

  await TrackPlayer.play();
  return true;
}

export async function trackPlayerSeekTo(millis: number): Promise<void> {
  await TrackPlayer.seekTo(Math.max(0, millis) / 1000);
}

export async function trackPlayerSetVolume(
  volume: number,
  muted: boolean
): Promise<void> {
  await TrackPlayer.setVolume(muted ? 0 : volume);
}

export async function trackPlayerSkipToNext(): Promise<void> {
  await TrackPlayer.skipToNext();
}

export async function trackPlayerSkipToPrevious(): Promise<void> {
  await TrackPlayer.skipToPrevious();
}

export type TrackPlayerEventHandlers = {
  onProgress?: (progress: PlaybackProgress) => void;
  onActiveTrackChanged?: (index: number | null, trackId: string | null) => void;
  onQueueEnded?: () => void;
  onPlaybackError?: (message: string) => void;
};

export function subscribeTrackPlayerEvents(
  handlers: TrackPlayerEventHandlers
): () => void {
  const subscriptions = [
    TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (event) => {
      handlers.onProgress?.({
        positionMillis: Math.max(0, Math.round((event.position || 0) * 1000)),
        durationMillis: Math.max(0, Math.round((event.duration || 0) * 1000)),
        isPlaying: true,
      });
    }),
    TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event) => {
      const index = typeof event.index === "number" ? event.index : null;
      const trackId = event.track?.id ? String(event.track.id) : null;
      handlers.onActiveTrackChanged?.(index, trackId);
    }),
    TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
      handlers.onQueueEnded?.();
    }),
    TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
      const message =
        typeof event.message === "string"
          ? event.message
          : "TrackPlayer playback error";

      handlers.onPlaybackError?.(message);
    }),
    TrackPlayer.addEventListener(Event.PlaybackState, async () => {
      try {
        handlers.onProgress?.(await getTrackPlayerProgress());
      } catch {}
    }),
  ];

  if (Platform.OS === "android") {
    subscriptions.push(
      TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
        if (event.paused) {
          await TrackPlayer.pause();
        } else if (event.permanent) {
          await TrackPlayer.stop();
        } else {
          await TrackPlayer.setVolume(event.ducked ? 0.25 : 1);
        }
      })
    );
  }

  return () => {
    subscriptions.forEach((subscription) => subscription.remove());
  };
}

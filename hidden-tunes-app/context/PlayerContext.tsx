import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus, InteractionManager } from "react-native";

import HiddenAudio, {
  HiddenAudioStatus,
  isHiddenAudioNativeEngineAvailable,
  subscribeHiddenAudioNativeDiagnostics,
  subscribeHiddenAudioPlaybackEnded,
  subscribeHiddenAudioProgressChanged,
  subscribeHiddenAudioStateChanged,
} from "../modules/HiddenAudio";

import { BackendYouTubeTrack } from "../services/youtubeBackend";

import {
  buildPersonalRadioQueue,
  buildRelatedRadioQueue,
  extendRadioQueue,
  loadRadioQueue,
  RadioTrack,
  saveRadioQueue,
} from "../services/radioEngine";

import {
  addToRecentlyPlayed,
  loadRecentlyPlayed,
  RecentlyPlayedTrack,
} from "../services/recentlyPlayedEngine";

import {
  addToSmartQueue,
  getRelatedTracks,
  getSmartQueue,
  scheduleSaveSmartQueue,
} from "../services/smartQueue";
import { isTvPlayerOpen } from "../services/tv/tvPlaybackActivity";
import { isTrackPlayerFeatureEnabled } from "../constants/playbackConfig";
import { supportsNativeTrackPlayer } from "../utils/expoRuntime";
import {
  activateTrackPlayerPlayback,
  bridgeGetActiveIndex,
  bridgeGetProgress,
  bridgeInterruptForUserTap,
  bridgePlayQueueFromIndex,
  bridgePlay,
  bridgeResetPlayback,
  bridgeSeekTo,
  bridgeSetProgressInterval,
  bridgeSetVolume,
  bridgeSkipToNext,
  bridgeSkipToPrevious,
  bridgeSyncRepeatMode,
  bridgeTogglePlayPause,
  bridgeTrySkipToNext,
  bridgeTryUserTapFastPlay,
  shouldUseTrackPlayerPlayback,
  subscribeBridgeEvents,
} from "../services/playbackBridge";
import { getArtworkValue } from "../utils/artwork";
import { isBoundedQueuePlayback } from "../utils/playbackMode";
import { scheduleStartupTask } from "../utils/startupScheduler";
import {
  recordAppStateTransition,
  recordApplyProgressUpdateIntervalCall,
  recordConfigureAudioCall,
  recordListenerRegister,
  recordListenerUnregister,
  recordBackgroundChurnSkipped,
  recordPlaybackProgressUpdate as recordRuntimePlaybackProgressUpdate,
  recordPlaybackReactStateUpdate,
  recordQueuePersistWrite,
} from "../utils/runtimeInstrumentation";
import {
  getActiveLyricLine,
  getBestLyricsPayload,
  parseLrc,
  resolveLyricsDisplay,
  toSyncedLyricLines,
} from "../utils/lyrics";
import {
  logPlayerContextDev,
  logPlayerContextError,
} from "../utils/playerContextLogs";
import {
  logAudioLoadFailure,
  logAudioLoadStart,
  logAudioLoadSuccess,
  logAutoNextAttempt,
  logAutoNextFailure,
  logAutoNextSkipped,
  logAutoNextSuccess,
  logBackgroundStateChange,
  logDuplicatePlayIgnored,
  logFinishWatchdogArmed,
  logFinishWatchdogFired,
  logHTAutoNext,
  logHTLockAutoNext,
  logManualQueueSkip,
  logPauseResumeComplete,
  logPauseResumeStart,
  logPlaybackStarted,
  logPlaybackStalled,
  logQueueIndexMismatch,
  logRepeatModeState,
  logShuffleState,
  logTapToPlayStart,
  logTrackFinished,
} from "../utils/playbackDiagnostics";
import {
  recordQueueControl,
  updateActiveQueueLength,
} from "../utils/playbackStressDiagnostics";
import {
  rebuildQueueFromAvailableContext,
  repairQueueIndexForSong,
  shouldIgnoreDuplicatePlayRequest,
} from "../utils/playbackGuards";
import {
  areSongQueuesEqual,
  recordPlaybackProgressUpdate,
  recordQueueReferenceChange,
} from "../utils/playbackRenderDiagnostics";
import { markPlaybackRestoreComplete } from "../utils/startupDiagnostics";
import { useCpuContextProbe } from "../utils/cpuIdleProfiling";
import {
  NowPlayingStoreSync,
  PlayerActionsContext,
  PlayerProgressContext,
  PlayerStateContext,
} from "./playerContextSlices";

export type SyncedLyricLine = {
  time: number;
  text: string;
};

export type AppSong = {
  id: string;
  title: string;
  artist?: string;
  user?: { name?: string };
  channelTitle?: string;
  cover?: any;
  coverUrl?: string;
  cover_url?: string;
  thumbnail?: string;
  artwork?: string;
  artworkUrl?: string;
  artwork_url?: string;
  image?: any;
  imageUrl?: string;
  image_url?: string;
  albumCover?: string;
  album_cover?: string;
  audio?: any;
  url?: string;
  streamUrl?: string;
  audioUrl?: string;
  audio_url?: string;
  source?: string;
  sourceName?: string;
  type?: "local" | "audius" | "archive" | "youtube_video" | "r2" | string;
  isOnline?: boolean;
  videoId?: string;
  album?: string;
  albumId?: string;
  artistId?: string;
  genre?: string;
  mood?: string;
  duration?: number | string;
  lyrics?: string;
  syncedLyrics?: string;
  synced_lyrics?: string;
  lrc?: string;
  parsedLyrics?: SyncedLyricLine[];
};

type RepeatMode = "off" | "one" | "all";
type ActiveQueueMode =
  | "standard"
  | "youtube"
  | "radio"
  | "smart"
  | "live_stream"
  | "podcast";

export type PlayerContextType = {
  currentSong: AppSong | null;
  isPlaying: boolean;
  isLoading: boolean;
  positionMillis: number;
  durationMillis: number;
  position: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  smartAutoplayEnabled: boolean;

  currentLyrics: string;
  currentSyncedLyrics: SyncedLyricLine[];
  currentLyricLine: SyncedLyricLine | null;

  songs: AppSong[];
  onlineSongs: AppSong[];
  activeQueue: AppSong[];
  activeQueueIndex: number;
  activeQueueMode: ActiveQueueMode;

  favorites: AppSong[];
  recentlyPlayed: RecentlyPlayedTrack[];

  youtubeQueue: BackendYouTubeTrack[];
  youtubeQueueIndex: number;

  radioQueue: RadioTrack[];
  radioMode: boolean;
  radioIndex: number;

  playSong: (
    song: AppSong,
    queue?: AppSong[],
    index?: number,
    queueMode?: ActiveQueueMode
  ) => Promise<void>;
  playQueue: (
    queue: AppSong[],
    startIndex?: number,
    priorInterruptDone?: boolean,
    queueMode?: ActiveQueueMode
  ) => Promise<void>;
  playAudiusTrack: (song: AppSong) => Promise<void>;
  playYouTubeQueue: (
    tracks: BackendYouTubeTrack[],
    startIndex?: number
  ) => Promise<void>;

  startRadio: (seedTrack: AppSong) => Promise<void>;
  startPersonalRadio: () => Promise<void>;
  playNextRadioTrack: () => Promise<boolean>;
  stopRadio: () => Promise<void>;

  togglePlayPause: () => Promise<void>;
  stopPlayback: () => Promise<void>;
  nextSong: () => Promise<void>;
  previousSong: () => Promise<void>;
  replayCurrentTrack: () => Promise<void>;
  seekRelative: (offsetMillis: number) => Promise<void>;
  seekTo: (millis: number) => Promise<void>;
  setVolume: (value: number) => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleShuffle: () => void;
  toggleRepeatMode: () => void;
  toggleSmartAutoplay: () => Promise<void>;
  toggleFavorite: (song: AppSong) => Promise<void>;
  isFavorite: (song: AppSong | null) => boolean;
  clearActiveQueue: () => Promise<void>;
  preloadIdlePlayableTrack: (
    song: AppSong,
    options?: { source?: string }
  ) => Promise<void>;
};

const CURRENT_SONG_KEY = "hidden_tunes_current_song";
const FAVORITES_KEY = "hidden_tunes_favorites";
const YOUTUBE_QUEUE_KEY = "hidden_tunes_youtube_queue";
const YOUTUBE_QUEUE_INDEX_KEY = "hidden_tunes_youtube_queue_index";
const POSITION_KEY = "hidden_tunes_position";
const RADIO_MODE_KEY = "hidden_tunes_radio_mode";
const RADIO_INDEX_KEY = "hidden_tunes_radio_index";
const REPEAT_MODE_KEY = "hidden_tunes_repeat_mode";
const SHUFFLE_KEY = "hidden_tunes_shuffle";
const VOLUME_KEY = "hidden_tunes_volume";
const MUTED_KEY = "hidden_tunes_muted";
const SMART_AUTOPLAY_KEY = "hidden_tunes_smart_autoplay";

const ACTIVE_QUEUE_KEY = "hidden_tunes_active_queue";
const ACTIVE_QUEUE_INDEX_KEY = "hidden_tunes_active_queue_index";
const ACTIVE_QUEUE_MODE_KEY = "hidden_tunes_active_queue_mode";

function yieldToNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

const PLAYBACK_UPDATE_INTERVAL_MS = 2500;
const PLAYBACK_UPDATE_INTERVAL_BACKGROUND_MS = 4000;
const POSITION_STATE_UPDATE_MIN_MS = 2000;
const POSITION_STATE_UPDATE_BACKGROUND_MS = 2000;
const POSITION_SAVE_INTERVAL_MS = 15000;
const POSITION_SAVE_DISTANCE_MS = 8000;
const POSITION_PERSIST_DEBOUNCE_MS = 1500;
const ACTIVE_QUEUE_PERSIST_DEBOUNCE_MS = 600;
const DURATION_UPDATE_THRESHOLD_MS = 1500;
const TRACK_END_THRESHOLD_MS = 750;
const MIN_DURATION_FOR_POSITION_FINISH_MS = 4000;
const PRELOAD_BEFORE_END_MS = 15000;
const FINISH_DEBOUNCE_MS = 1500;
const FINISH_WATCHDOG_GRACE_MS = 650;
const FINISH_WATCHDOG_MIN_DELAY_MS = 350;
const FINISH_WATCHDOG_MAX_DELAY_MS = 30000;
const LOCK_SCREEN_END_WINDOW_MS = 1500;
const LOCK_FINISH_GRACE_MS = 900;
const LOCK_END_CHECK_DELAY_MS = 400;

function isBackgroundAppState(state: AppStateStatus) {
  return state === "background" || state === "inactive";
}

function getProgressUpdateIntervalMs(state: AppStateStatus) {
  return isBackgroundAppState(state)
    ? PLAYBACK_UPDATE_INTERVAL_BACKGROUND_MS
    : PLAYBACK_UPDATE_INTERVAL_MS;
}

function getPositionStateUpdateMinMs(state: AppStateStatus) {
  return isBackgroundAppState(state)
    ? POSITION_STATE_UPDATE_BACKGROUND_MS
    : POSITION_STATE_UPDATE_MIN_MS;
}

function parseSyncedLyrics(input?: string | null): SyncedLyricLine[] {
  return toSyncedLyricLines(parseLrc(input || ""));
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const hiddenAudioLoadedRef = useRef(false);
  const hiddenAudioPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const lastHiddenAudioPollPlayingRef = useRef(false);
  const isChangingTrackRef = useRef(false);
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const inFlightPlaySongIdRef = useRef<string | null>(null);
  const queueTransitionRef = useRef(false);
  const queueTransitionTailRef = useRef(Promise.resolve());
  const autoAdvanceRef = useRef(false);
  const lastFinishEventRef = useRef({
    songId: "",
    handledAt: 0,
  });
  type LoadAndPlayOptions = {
    /** Direct user tap — pause/stop current audio before loading the next track. */
    userInitiated?: boolean;
    /** Set when playSong/playQueue already ran interrupt for this tap. */
    userInterruptDone?: boolean;
  };

  const loadAndPlayRef = useRef<
    ((song: AppSong, options?: LoadAndPlayOptions) => Promise<void>) | null
  >(null);
  const extendQueueWithSmartTracksRef = useRef<(() => Promise<boolean>) | null>(
    null
  );
  const unloadPromiseRef = useRef<Promise<void> | null>(null);
  const lastPositionSaveRef = useRef(0);
  const lastSavedPositionRef = useRef(0);
  const lastPositionStateUpdateRef = useRef(0);
  const lastDurationStateUpdateRef = useRef(0);
  const lastActiveQueuePersistRef = useRef("");
  const positionPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const pendingPositionMillisRef = useRef<number | null>(null);
  const activeQueuePersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const pendingActiveQueuePersistRef = useRef<{
    queue: AppSong[];
    index: number;
    mode: ActiveQueueMode;
  } | null>(null);
  const lastCurrentSongPersistRef = useRef("");
  const storageValueCacheRef = useRef<Record<string, string>>({});
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const preloadedUrlRef = useRef<string | null>(null);
  const preloadedSongIdRef = useRef<string | null>(null);
  const preloadInFlightRef = useRef(false);
  const pendingSmartExtendRef = useRef(false);
  const trackPlayerActiveRef = useRef(false);
  const handleTrackFinishedRef = useRef<(() => Promise<void>) | null>(null);
  const finishWatchdogTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const finishWatchdogSongIdRef = useRef("");
  const finishWatchdogFireAtRef = useRef(0);
  const lockScreenEndCheckRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const armFinishWatchdogRef = useRef<
    ((position: number, duration: number, playing: boolean) => void) | null
  >(null);

  const positionMillisRef = useRef(0);
  const durationMillisRef = useRef(0);
  const isPlayingRef = useRef(false);

  const currentSongRef = useRef<AppSong | null>(null);
  const repeatModeRef = useRef<RepeatMode>("off");
  const volumeRef = useRef(1);
  const isMutedRef = useRef(false);
  const shuffleRef = useRef(false);
  const smartAutoplayEnabledRef = useRef(true);

  const activeQueueRef = useRef<AppSong[]>([]);
  const activeQueueIndexRef = useRef(0);
  const activeQueueModeRef = useRef<ActiveQueueMode>("standard");

  const youtubeQueueRef = useRef<BackendYouTubeTrack[]>([]);
  const youtubeQueueIndexRef = useRef(0);

  const radioQueueRef = useRef<RadioTrack[]>([]);
  const radioModeRef = useRef(false);
  const radioIndexRef = useRef(0);

  const [currentSong, setCurrentSong] = useState<AppSong | null>(null);
  const [isPlaying, setIsPlayingState] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [positionMillis, setPositionMillisState] = useState(0);
  const [durationMillis, setDurationMillisState] = useState(0);

  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [smartAutoplayEnabled, setSmartAutoplayEnabled] = useState(true);

  const [songs] = useState<AppSong[]>([]);
  const [activeQueue, setActiveQueue] = useState<AppSong[]>([]);
  const [activeQueueIndex, setActiveQueueIndex] = useState(0);
  const [activeQueueMode, setActiveQueueMode] =
    useState<ActiveQueueMode>("standard");

  const [favorites, setFavorites] = useState<AppSong[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentlyPlayedTrack[]>([]);

  const [youtubeQueue, setYouTubeQueue] = useState<BackendYouTubeTrack[]>([]);
  const [youtubeQueueIndex, setYouTubeQueueIndex] = useState(0);

  const [radioQueue, setRadioQueue] = useState<RadioTrack[]>([]);
  const [radioMode, setRadioMode] = useState(false);
  const [radioIndex, setRadioIndex] = useState(0);

  const setPositionMillis = useCallback((value: number) => {
    positionMillisRef.current = value;
    recordPlaybackProgressUpdate();
    setPositionMillisState(value);
  }, []);

  const setDurationMillis = useCallback((value: number) => {
    durationMillisRef.current = value;
    setDurationMillisState(value);
  }, []);

  const setIsPlaying = useCallback((value: boolean) => {
    isPlayingRef.current = value;
    setIsPlayingState(value);
  }, []);

  const setStoredValueIfChanged = useCallback(
    async (key: string, value: string) => {
      if (storageValueCacheRef.current[key] === value) return;

      storageValueCacheRef.current[key] = value;
      await AsyncStorage.setItem(key, value);
    },
    []
  );

  const removeStoredValues = useCallback(async (keys: string[]) => {
    for (const key of keys) {
      delete storageValueCacheRef.current[key];
    }

    await AsyncStorage.multiRemove(keys);
  }, []);

  const writePlaybackPosition = useCallback(async (millis: number) => {
    const safeMillis = Math.max(0, Math.floor(millis || 0));
    const serialized = String(safeMillis);

    if (storageValueCacheRef.current[POSITION_KEY] === serialized) {
      return;
    }

    try {
      lastSavedPositionRef.current = safeMillis;
      storageValueCacheRef.current[POSITION_KEY] = serialized;
      await AsyncStorage.setItem(POSITION_KEY, serialized);
    } catch (error) {
      logPlayerContextError("Save playback position error:", error);
    }
  }, []);

  const savePlaybackPosition = useCallback(
    (millis: number, options?: { immediate?: boolean }) => {
      pendingPositionMillisRef.current = millis;

      if (options?.immediate) {
        if (positionPersistTimerRef.current) {
          clearTimeout(positionPersistTimerRef.current);
          positionPersistTimerRef.current = null;
        }

        pendingPositionMillisRef.current = null;
        void writePlaybackPosition(millis);
        return;
      }

      if (positionPersistTimerRef.current) {
        clearTimeout(positionPersistTimerRef.current);
      }

      positionPersistTimerRef.current = setTimeout(() => {
        positionPersistTimerRef.current = null;
        const pending = pendingPositionMillisRef.current;
        pendingPositionMillisRef.current = null;

        if (pending === null) return;

        void writePlaybackPosition(pending);
      }, POSITION_PERSIST_DEBOUNCE_MS);
    },
    [writePlaybackPosition]
  );

  const sanitizeYouTubeVideoId = useCallback((value: any) => {
    const text = String(value || "").replace("youtube-", "").trim();

    if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;

    const match = text.match(/[a-zA-Z0-9_-]{11}/);
    return match ? match[0] : text;
  }, []);

  const isYouTubeSong = useCallback((song?: AppSong | null) => {
    return (
      song?.type === "youtube_video" ||
      song?.sourceName === "YouTube" ||
      song?.source === "youtube" ||
      Boolean(song?.videoId)
    );
  }, []);

  const resolveQueueModeForSong = useCallback(
    (song: AppSong, override?: ActiveQueueMode): ActiveQueueMode => {
      if (override) return override;
      if (song.source === "radio" || song.type === "live_stream") {
        return "live_stream";
      }
      if (song.source === "podcast" || song.type === "podcast") {
        return "standard";
      }
      return "standard";
    },
    []
  );

  const isLiveStreamSong = useCallback((song?: AppSong | null) => {
    return (
      song?.source === "radio" ||
      song?.type === "live_stream" ||
      activeQueueModeRef.current === "live_stream"
    );
  }, []);

  const shouldOfferSmartQueueExtend = useCallback(() => {
    if (!smartAutoplayEnabledRef.current) return false;
    return !isBoundedQueuePlayback(currentSongRef.current);
  }, []);

  const getPlayableUri = useCallback((song: AppSong) => {
    const possible =
      song.streamUrl ||
      song.url ||
      song.audioUrl ||
      song.audio_url ||
      (song as any).previewUrl;

    if (typeof possible !== "string") return null;

    const clean = possible.trim();
    return clean.length > 0 ? clean : null;
  }, []);

  const normalizeDuration = useCallback((value: AppSong["duration"]) => {
    if (typeof value === "number") return value;

    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }, []);

  const makeSafeSongId = useCallback(
    (song: AppSong) => {
      if (song.videoId) return sanitizeYouTubeVideoId(song.videoId);

      if (isYouTubeSong(song)) return sanitizeYouTubeVideoId(song.id);

      return String(
        song.id ||
          `${song.title || "track"}-${
            song.artist || song.channelTitle || "artist"
          }`
      )
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
    },
    [sanitizeYouTubeVideoId, isYouTubeSong]
  );

  const normalizeSong = useCallback(
    (song: AppSong): AppSong => {
      const artist =
        song.artist ||
        song.user?.name ||
        song.channelTitle ||
        song.sourceName ||
        "Unknown Artist";

      const image = getArtworkValue(song);
      const imageUri = typeof image === "string" ? image : undefined;
      const normalizedId = makeSafeSongId(song);
      const youtube = isYouTubeSong(song);
      const playableUrl = getPlayableUri(song);

      const normalizedType = youtube
        ? "youtube_video"
        : song.type || (playableUrl ? "r2" : "local");

      const syncedLyrics =
        song.syncedLyrics || song.synced_lyrics || song.lrc || undefined;

      return {
        ...song,
        id: normalizedId,
        videoId: youtube ? normalizedId : song.videoId,
        title: song.title || "Unknown Song",
        artist,
        user: song.user || { name: artist },
        channelTitle: song.channelTitle || artist,
        cover: image,
        thumbnail: song.thumbnail || imageUri,
        artwork: song.artwork || imageUri,
        coverUrl: song.coverUrl || song.cover_url || imageUri,
        cover_url: song.cover_url || song.coverUrl || imageUri,
        artworkUrl: song.artworkUrl || song.artwork_url || imageUri,
        artwork_url: song.artwork_url || song.artworkUrl || imageUri,
        image: song.image || image,
        imageUrl: song.imageUrl || song.image_url || imageUri,
        image_url: song.image_url || song.imageUrl || imageUri,
        albumCover: song.albumCover || song.album_cover || imageUri,
        album_cover: song.album_cover || song.albumCover || imageUri,
        streamUrl: youtube ? undefined : playableUrl || undefined,
        url: youtube ? undefined : playableUrl || undefined,
        sourceName: youtube
          ? "YouTube"
          : song.sourceName || song.source || "Hidden Tunes",
        source: youtube ? "youtube" : song.source || "hidden-tunes",
        type: normalizedType,
        isOnline: song.isOnline ?? Boolean(playableUrl),
        album: song.album,
        albumId: song.albumId,
        artistId: song.artistId,
        genre: song.genre,
        mood: song.mood,
        duration: normalizeDuration(song.duration),
        lyrics: song.lyrics || "",
        syncedLyrics,
        synced_lyrics: syncedLyrics,
        lrc: song.lrc || syncedLyrics,
        parsedLyrics: song.parsedLyrics || parseSyncedLyrics(syncedLyrics),
      };
    },
    [makeSafeSongId, isYouTubeSong, getPlayableUri, normalizeDuration]
  );

  const normalizeYouTubeTrack = useCallback(
    (track: Partial<BackendYouTubeTrack>): BackendYouTubeTrack => {
      const realVideoId = sanitizeYouTubeVideoId(track.videoId || track.id);

      const artist = String(track.artist || track.channelTitle || "YouTube");
      const thumbnail = String(
        track.thumbnail ||
          track.artwork ||
          track.cover ||
          `https://img.youtube.com/vi/${realVideoId}/hqdefault.jpg`
      );

      return {
        id: `youtube-${realVideoId}`,
        videoId: realVideoId,
        title: String(track.title || "YouTube Music"),
        artist,
        channelTitle: String(track.channelTitle || artist),
        thumbnail,
        artwork: thumbnail,
        cover: thumbnail,
        sourceName: "YouTube",
        source: "youtube",
        type: "youtube_video",
        isYouTube: true,
        isOnline: true,
        duration: track.duration,
        url: track.url,
        streamUrl: track.streamUrl,
      };
    },
    [sanitizeYouTubeVideoId]
  );

  const currentLyrics = currentSong?.lyrics || "";

  const currentLyricsDisplay = useMemo(() => {
    const payload = getBestLyricsPayload({
      synced_lrc:
        currentSong?.syncedLyrics ||
        currentSong?.synced_lyrics ||
        currentSong?.lrc,
      plain_lyrics: currentLyrics,
    });

    return resolveLyricsDisplay(payload.synced, payload.plain);
  }, [
    currentLyrics,
    currentSong?.lrc,
    currentSong?.syncedLyrics,
    currentSong?.synced_lyrics,
  ]);

  const currentSyncedLyrics = useMemo(() => {
    if (currentSong?.parsedLyrics?.length) {
      return currentSong.parsedLyrics;
    }

    if (currentLyricsDisplay.mode === "synced") {
      return toSyncedLyricLines(currentLyricsDisplay.lines);
    }

    return parseSyncedLyrics(
      currentSong?.syncedLyrics ||
        currentSong?.synced_lyrics ||
        currentSong?.lrc
    );
  }, [
    currentLyricsDisplay.lines,
    currentLyricsDisplay.mode,
    currentSong?.lrc,
    currentSong?.parsedLyrics,
    currentSong?.syncedLyrics,
    currentSong?.synced_lyrics,
  ]);

  const currentLyricLine = useMemo(() => {
    const active = getActiveLyricLine(
      currentLyricsDisplay.lines,
      positionMillis,
      currentLyricsDisplay.mode
    );

    return active ? { time: active.timeMs, text: active.text } : null;
  }, [
    currentLyricsDisplay.lines,
    currentLyricsDisplay.mode,
    positionMillis,
  ]);

  const onlineSongs: AppSong[] = useMemo(() => {
    return youtubeQueue.map((track) => {
      const normalized = normalizeYouTubeTrack(track);

      return {
        id: normalized.videoId,
        videoId: normalized.videoId,
        title: normalized.title,
        artist: normalized.artist || normalized.channelTitle || "YouTube",
        user: {
          name: normalized.artist || normalized.channelTitle || "YouTube",
        },
        channelTitle: normalized.channelTitle,
        thumbnail: normalized.thumbnail,
        cover: normalized.thumbnail,
        artwork: normalized.thumbnail,
        sourceName: "YouTube",
        source: "youtube",
        type: "youtube_video",
        isOnline: true,
      };
    });
  }, [youtubeQueue, normalizeYouTubeTrack]);

  const configureAudio = useCallback(async (reason = "unspecified") => {
    recordConfigureAudioCall(reason);
  }, []);

  const stopHiddenAudioPolling = useCallback(() => {
    if (hiddenAudioPollIntervalRef.current) {
      clearInterval(hiddenAudioPollIntervalRef.current);
      hiddenAudioPollIntervalRef.current = null;
    }
  }, []);

  const resolveHiddenAudioUrl = useCallback(
    (song: AppSong): string | null => {
      const audio = song.audio;

      if (typeof audio === "string") {
        const trimmed = audio.trim();
        if (trimmed.length > 0) return trimmed;
      }

      if (
        audio &&
        typeof audio === "object" &&
        "uri" in audio &&
        typeof (audio as { uri?: unknown }).uri === "string"
      ) {
        const uri = String((audio as { uri: string }).uri).trim();
        if (uri.length > 0) return uri;
      }

      return getPlayableUri(song);
    },
    [getPlayableUri]
  );

  const clearPreloadedSound = useCallback(async () => {
    preloadedUrlRef.current = null;
    preloadedSongIdRef.current = null;
    preloadInFlightRef.current = false;
  }, []);

  const unloadCurrentSound = useCallback(async () => {
    if (trackPlayerActiveRef.current) {
      trackPlayerActiveRef.current = false;
      await bridgeResetPlayback("unload_current_sound");
      return;
    }

    if (unloadPromiseRef.current) {
      await unloadPromiseRef.current;
      return;
    }

    if (!hiddenAudioLoadedRef.current) return;

    unloadPromiseRef.current = (async () => {
      try {
        stopHiddenAudioPolling();
        await HiddenAudio.pause();
      } catch (error) {
        logPlayerContextError("Unload HiddenAudio error:", error);
      } finally {
        hiddenAudioLoadedRef.current = false;
        unloadPromiseRef.current = null;
      }
    })();

    await unloadPromiseRef.current;
  }, [stopHiddenAudioPolling]);

  const saveCurrentSong = useCallback(
    async (song: AppSong) => {
      if (isYouTubeSong(song)) return;

      try {
        const serialized = JSON.stringify(song);

        if (lastCurrentSongPersistRef.current === serialized) return;

        lastCurrentSongPersistRef.current = serialized;
        await setStoredValueIfChanged(CURRENT_SONG_KEY, serialized);
      } catch (error) {
        logPlayerContextError("Save current song error:", error);
      }
    },
    [isYouTubeSong, setStoredValueIfChanged]
  );

  const saveRecentlyPlayed = useCallback(async (song: AppSong) => {
    try {
      const updated = await addToRecentlyPlayed(song);
      setRecentlyPlayed(updated);
    } catch (error) {
      logPlayerContextError("Add recently played error:", error);
    }
  }, []);

  const savePlaybackSideEffects = useCallback(
    (song: AppSong) => {
      void saveCurrentSong(song);
      void saveRecentlyPlayed(song);
      void addToSmartQueue(song as any).catch((error) => {
        logPlayerContextError("Add smart queue error:", error);
      });
    },
    [saveCurrentSong, saveRecentlyPlayed]
  );

  const writeActiveQueuePersist = useCallback(
    async (queue: AppSong[], index: number, mode: ActiveQueueMode) => {
      try {
        const normalizedQueue = queue.map(normalizeSong);
        const serializedQueue = JSON.stringify(normalizedQueue);
        const persistKey = `${serializedQueue}|${index}|${mode}`;

        if (lastActiveQueuePersistRef.current === persistKey) return;

        lastActiveQueuePersistRef.current = persistKey;
        recordQueuePersistWrite(normalizedQueue.length, "persist_active_queue");

        await AsyncStorage.multiSet([
          [ACTIVE_QUEUE_KEY, serializedQueue],
          [ACTIVE_QUEUE_INDEX_KEY, String(index)],
          [ACTIVE_QUEUE_MODE_KEY, mode],
        ]);

        storageValueCacheRef.current[ACTIVE_QUEUE_KEY] = serializedQueue;
        storageValueCacheRef.current[ACTIVE_QUEUE_INDEX_KEY] = String(index);
        storageValueCacheRef.current[ACTIVE_QUEUE_MODE_KEY] = mode;
      } catch (error) {
        logPlayerContextError("Persist active queue error:", error);
      }
    },
    [normalizeSong]
  );

  const persistActiveQueue = useCallback(
    (queue: AppSong[], index: number, mode: ActiveQueueMode) => {
      pendingActiveQueuePersistRef.current = { queue, index, mode };

      if (activeQueuePersistTimerRef.current) {
        clearTimeout(activeQueuePersistTimerRef.current);
      }

      activeQueuePersistTimerRef.current = setTimeout(() => {
        activeQueuePersistTimerRef.current = null;
        const pending = pendingActiveQueuePersistRef.current;
        pendingActiveQueuePersistRef.current = null;

        if (!pending) return;

        void writeActiveQueuePersist(
          pending.queue,
          pending.index,
          pending.mode
        );
      }, ACTIVE_QUEUE_PERSIST_DEBOUNCE_MS);
    },
    [writeActiveQueuePersist]
  );

  const syncActiveQueue = useCallback(
    async (queue: AppSong[], index: number, mode: ActiveQueueMode) => {
      const normalizedQueue = queue
        .map(normalizeSong)
        .filter((song) => !isYouTubeSong(song));

      if (!normalizedQueue.length) return;

      const safeIndex = Math.max(0, Math.min(index, normalizedQueue.length - 1));

      setActiveQueue((previousQueue) => {
        const changed = !areSongQueuesEqual(previousQueue, normalizedQueue);
        recordQueueReferenceChange("activeQueue", changed);
        return changed ? normalizedQueue : previousQueue;
      });
      setActiveQueueIndex(safeIndex);
      setActiveQueueMode(mode);

      activeQueueRef.current = normalizedQueue;
      activeQueueIndexRef.current = safeIndex;
      activeQueueModeRef.current = mode;
      updateActiveQueueLength(normalizedQueue.length);

      setTimeout(() => {
        void persistActiveQueue(normalizedQueue, safeIndex, mode);
        scheduleSaveSmartQueue(normalizedQueue as any);
      }, 0);
    },
    [normalizeSong, isYouTubeSong, persistActiveQueue]
  );

  const persistYouTubeQueue = useCallback(
    async (queue: BackendYouTubeTrack[], index: number) => {
      try {
        const normalizedQueue = queue.map(normalizeYouTubeTrack);

        await AsyncStorage.multiSet([
          [YOUTUBE_QUEUE_KEY, JSON.stringify(normalizedQueue)],
          [YOUTUBE_QUEUE_INDEX_KEY, String(index)],
        ]);
      } catch (error) {
        logPlayerContextError("Persist YouTube queue error:", error);
      }
    },
    [normalizeYouTubeTrack]
  );

  const persistRadioState = useCallback(
    async (queue: RadioTrack[], index: number, enabled: boolean) => {
      try {
        await saveRadioQueue(queue);
        await AsyncStorage.multiSet([
          [RADIO_INDEX_KEY, String(index)],
          [RADIO_MODE_KEY, String(enabled)],
        ]);
      } catch (error) {
        logPlayerContextError("Persist radio state error:", error);
      }
    },
    []
  );

  const getNextQueueIndex = useCallback(
    (currentIndex: number, queueLength: number) => {
      if (queueLength <= 0) return -1;

      if (shuffleRef.current && queueLength > 1) {
        let randomIndex = currentIndex;

        while (randomIndex === currentIndex) {
          randomIndex = Math.floor(Math.random() * queueLength);
        }

        return randomIndex;
      }

      const nextIndex = currentIndex + 1;

      if (nextIndex >= queueLength) {
        return repeatModeRef.current === "all" ? 0 : -1;
      }

      return nextIndex;
    },
    []
  );

  const getPreviousQueueIndex = useCallback(
    (currentIndex: number, queueLength: number) => {
      if (queueLength <= 0) return -1;

      const previousIndex = currentIndex - 1;

      if (previousIndex < 0) {
        return repeatModeRef.current === "all" ? queueLength - 1 : 0;
      }

      return previousIndex;
    },
    []
  );

  const getActiveQueuePlaybackState = useCallback(() => {
    const queue = activeQueueRef.current.filter((song) => !isYouTubeSong(song));
    const currentId = currentSongRef.current?.id;
    const currentIndex = currentId
      ? queue.findIndex((song) => song.id === currentId)
      : -1;
    const storedIndex = activeQueueIndexRef.current;

    if (
      queue.length &&
      currentIndex >= 0 &&
      storedIndex >= 0 &&
      storedIndex < queue.length &&
      currentIndex !== storedIndex
    ) {
      logQueueIndexMismatch({
        songId: currentId,
        currentIndex,
        storedIndex,
        queueLength: queue.length,
      });
    }

    const safeIndex =
      currentIndex >= 0
        ? currentIndex
        : Math.max(
            0,
            Math.min(storedIndex, Math.max(queue.length - 1, 0))
          );

    if (currentIndex >= 0 && safeIndex !== storedIndex) {
      activeQueueIndexRef.current = safeIndex;
    }

    return {
      queue,
      safeIndex,
    };
  }, [isYouTubeSong]);

  const runQueueTransition = useCallback(async (transition: () => Promise<void>) => {
    const transitionTask = queueTransitionTailRef.current
      .catch(() => undefined)
      .then(async () => {
        queueTransitionRef.current = true;

        try {
          await transition();
        } finally {
          queueTransitionRef.current = false;
        }
      });

    queueTransitionTailRef.current = transitionTask.catch((error) => {
      logPlayerContextError("Queue transition error:", error);
    });

    await transitionTask;
  }, []);

  const getUpcomingSong = useCallback((): AppSong | null => {
    const { queue, safeIndex } = getActiveQueuePlaybackState();

    if (!queue.length || repeatModeRef.current === "one") return null;

    const nextIndex = getNextQueueIndex(safeIndex, queue.length);

    if (nextIndex < 0) return null;

    return normalizeSong(queue[nextIndex]);
  }, [getActiveQueuePlaybackState, getNextQueueIndex, normalizeSong]);

  const syncStateFromTrackPlayerIndex = useCallback(
    (index: number, runSideEffects = true) => {
      const { queue } = getActiveQueuePlaybackState();

      if (!queue.length || index < 0 || index >= queue.length) return;

      const song = normalizeSong(queue[index]);

      setCurrentSong(song);
      currentSongRef.current = song;
      setActiveQueueIndex(index);
      activeQueueIndexRef.current = index;

      if (runSideEffects) {
        savePlaybackSideEffects(song);
      }
    },
    [getActiveQueuePlaybackState, normalizeSong, savePlaybackSideEffects]
  );

  const preloadUpcomingTrack = useCallback(
    async (upcomingSong: AppSong) => {
      if (trackPlayerActiveRef.current) return;
      if (preloadInFlightRef.current) return;
      if (preloadedSongIdRef.current === upcomingSong.id) return;

      const playableUrl = resolveHiddenAudioUrl(upcomingSong);

      if (!playableUrl) return;

      preloadInFlightRef.current = true;

      try {
        await clearPreloadedSound();
        preloadedUrlRef.current = playableUrl;
        preloadedSongIdRef.current = upcomingSong.id;
      } catch (error) {
        logPlayerContextError("Preload upcoming track error:", error);
      } finally {
        preloadInFlightRef.current = false;
      }
    },
    [clearPreloadedSound, resolveHiddenAudioUrl]
  );

  const consumePreloadedUrl = useCallback((songId: string) => {
    if (preloadedSongIdRef.current !== songId || !preloadedUrlRef.current) {
      return null;
    }

    logPlayerContextDev("[audio-preload] preload-hit", { songId });

    const url = preloadedUrlRef.current;
    preloadedUrlRef.current = null;
    preloadedSongIdRef.current = null;
    preloadInFlightRef.current = false;

    return url;
  }, []);

  const preloadIdlePlayableTrack = useCallback(
    async (song: AppSong, options?: { source?: string }) => {
      const source = options?.source || "idle";

      const logSkip = (reason: string) => {
        logPlayerContextDev("[audio-preload] preload-skip", {
          reason,
          source,
          songId: song?.id,
        });
      };

      if (trackPlayerActiveRef.current) {
        logSkip("native_queue_active");
        return;
      }

      if (preloadInFlightRef.current) {
        logSkip("preload_in_flight");
        return;
      }

      if (isChangingTrackRef.current || inFlightPlaySongIdRef.current) {
        logSkip("playback_loading");
        return;
      }

      if (hiddenAudioLoadedRef.current && isPlayingRef.current) {
        logSkip("already_playing");
        return;
      }

      const normalizedSong = normalizeSong(song);

      if (isYouTubeSong(normalizedSong)) {
        logSkip("youtube_track");
        return;
      }

      const playableUri = getPlayableUri(normalizedSong);

      if (!playableUri && !normalizedSong.audio) {
        logSkip("invalid_url");
        return;
      }

      if (
        currentSongRef.current?.id === normalizedSong.id &&
        hiddenAudioLoadedRef.current
      ) {
        logSkip("already_current");
        return;
      }

      if (preloadedSongIdRef.current === normalizedSong.id) {
        logSkip("already_preloaded");
        return;
      }

      logPlayerContextDev("[audio-preload] preload-start", {
        songId: normalizedSong.id,
        source,
      });

      await preloadUpcomingTrack(normalizedSong);
    },
    [
      getPlayableUri,
      isYouTubeSong,
      normalizeSong,
      preloadUpcomingTrack,
    ]
  );

  const clearFinishWatchdog = useCallback((reason = "unspecified") => {
    if (finishWatchdogTimeoutRef.current) {
      clearTimeout(finishWatchdogTimeoutRef.current);
      finishWatchdogTimeoutRef.current = null;
    }

    if (lockScreenEndCheckRef.current) {
      clearTimeout(lockScreenEndCheckRef.current);
      lockScreenEndCheckRef.current = null;
    }

    finishWatchdogSongIdRef.current = "";
    finishWatchdogFireAtRef.current = 0;
    logHTLockAutoNext("clear", { reason });
  }, []);

  const interruptCurrentPlaybackForUserTap = useCallback(
    async (targetSongId?: string) => {
      logPlayerContextDev("[tap-interrupt]", {
        trackPlayerActive: trackPlayerActiveRef.current,
        hasHiddenAudioLoaded: hiddenAudioLoadedRef.current,
        hasPreloadedUrl: Boolean(preloadedUrlRef.current),
        currentSongId: currentSongRef.current?.id || null,
        targetSongId: targetSongId || null,
        nativeEnabled:
          isTrackPlayerFeatureEnabled() && supportsNativeTrackPlayer(),
      });

      clearFinishWatchdog("user_tap_interrupt");

      if (isTrackPlayerFeatureEnabled() && supportsNativeTrackPlayer()) {
        try {
          await bridgeInterruptForUserTap();
        } catch (error) {
          logPlayerContextError("Interrupt TrackPlayer playback error:", error);
        }
      }

      const preservePreloadForTap =
        Boolean(targetSongId) &&
        targetSongId === preloadedSongIdRef.current &&
        Boolean(preloadedUrlRef.current);

      if (preservePreloadForTap) {
        logPlayerContextDev("[audio-preload] preload-preserved-for-tap", {
          songId: targetSongId,
        });
      } else if (preloadedUrlRef.current) {
        try {
          await clearPreloadedSound();
        } catch (error) {
          logPlayerContextError("Interrupt preloaded sound error:", error);
        }
      }

      if (hiddenAudioLoadedRef.current) {
        try {
          stopHiddenAudioPolling();
          await HiddenAudio.pause();
        } catch (error) {
          logPlayerContextError("Interrupt HiddenAudio playback error:", error);
        } finally {
          hiddenAudioLoadedRef.current = false;
        }
      }

      isPlayingRef.current = false;
      setIsPlaying(false);
    },
    [
      clearFinishWatchdog,
      clearPreloadedSound,
      setIsPlaying,
      stopHiddenAudioPolling,
    ]
  );

  const advanceTrackPlayerQueueFromJs = useCallback(
    async (source: string) => {
      if (!trackPlayerActiveRef.current) return;
      if (isChangingTrackRef.current || autoAdvanceRef.current) {
        logAutoNextSkipped("already_advancing", { source });
        return;
      }

      autoAdvanceRef.current = true;

      try {
        await runQueueTransition(async () => {
          const { queue, safeIndex: currentIndex } = getActiveQueuePlaybackState();

          if (!queue.length) {
            logAutoNextSkipped("queue_empty", { source });
            return;
          }

          const nextIndex = getNextQueueIndex(currentIndex, queue.length);

          if (nextIndex === -1) {
            if (!shouldOfferSmartQueueExtend()) {
              logAutoNextSkipped("queue_ended_smart_autoplay_disabled", {
                queueLength: queue.length,
                source,
              });
              setIsPlaying(false);
              return;
            }

            if (isBackgroundAppState(appStateRef.current)) {
              logAutoNextSkipped("background_pending_smart_extend", {
                queueLength: queue.length,
                source,
              });
              pendingSmartExtendRef.current = true;
              setIsPlaying(false);
              return;
            }

            const extended = await extendQueueWithSmartTracksRef.current?.();

            if (!extended) {
              logAutoNextFailure({
                reason: "smart_extend_failed",
                queueLength: queue.length,
              });
              setIsPlaying(false);
            } else {
              logAutoNextSuccess({ reason: "smart_extend", queueLength: queue.length });
            }

            return;
          }

          const playedIndex = await bridgePlayQueueFromIndex({
            songs: queue,
            startIndex: nextIndex,
            repeatMode: repeatModeRef.current,
            volume: volumeRef.current,
            muted: isMutedRef.current,
            reason: source,
          });

          trackPlayerActiveRef.current = true;
          syncStateFromTrackPlayerIndex(playedIndex);
          void persistActiveQueue(queue, playedIndex, activeQueueModeRef.current);
          void removeStoredValues([POSITION_KEY]);
          logAutoNextSuccess({
            reason: source,
            nextIndex: playedIndex,
            queueLength: queue.length,
          });
        });
      } catch (error) {
        logPlayerContextError("TrackPlayer queue advance error:", error);
        logAutoNextFailure({ reason: "track_player_queue_advance_error", source });
      } finally {
        autoAdvanceRef.current = false;
        clearFinishWatchdog("native_queue_advance");
      }
    },
    [
      clearFinishWatchdog,
      getActiveQueuePlaybackState,
      getNextQueueIndex,
      persistActiveQueue,
      removeStoredValues,
      runQueueTransition,
      setIsPlaying,
      syncStateFromTrackPlayerIndex,
      shouldOfferSmartQueueExtend,
    ]
  );

  const nextSong = useCallback(async () => {
    const { queue } = getActiveQueuePlaybackState();

    logAutoNextAttempt({
      source: "nextSong",
      repeatMode: repeatModeRef.current,
      shuffle: shuffleRef.current,
      queueLength: queue.length,
    });

    if (trackPlayerActiveRef.current) {
      await runQueueTransition(async () => {
        const { queue, safeIndex: currentIndex } = getActiveQueuePlaybackState();

        if (!queue.length) {
          logAutoNextSkipped("queue_empty", { source: "nextSong_track_player" });
          return;
        }

        const nextIndex = getNextQueueIndex(currentIndex, queue.length);

        if (nextIndex === -1) {
          if (!shouldOfferSmartQueueExtend()) {
            logAutoNextSkipped("queue_ended_smart_autoplay_disabled", {
              queueLength: queue.length,
            });
            setIsPlaying(false);
            return;
          }

          if (isBackgroundAppState(appStateRef.current)) {
            logAutoNextSkipped("background_pending_smart_extend", {
              queueLength: queue.length,
            });
            pendingSmartExtendRef.current = true;
            setIsPlaying(false);
            return;
          }

          const extended = await extendQueueWithSmartTracksRef.current?.();

          if (!extended) {
            logAutoNextFailure({
              reason: "smart_extend_failed",
              queueLength: queue.length,
            });
            setIsPlaying(false);
          } else {
            logAutoNextSuccess({ reason: "smart_extend", queueLength: queue.length });
          }

          return;
        }

        try {
          const advanced = await bridgeTrySkipToNext();

          if (advanced) {
            syncStateFromTrackPlayerIndex(nextIndex);
            void persistActiveQueue(queue, nextIndex, activeQueueModeRef.current);
            void removeStoredValues([POSITION_KEY]);
            return;
          }

          await advanceTrackPlayerQueueFromJs("next_song_reload");
        } catch (error) {
          logPlayerContextError("TrackPlayer next error:", error);
          logAutoNextFailure({ reason: "track_player_next_error" });
        }
      });

      return;
    }

    await runQueueTransition(async () => {
      const { queue, safeIndex: currentIndex } = getActiveQueuePlaybackState();

      if (!queue.length) {
        logAutoNextSkipped("queue_empty", { source: "nextSong_hidden_audio" });
        return;
      }

      const nextIndex = getNextQueueIndex(
        currentIndex,
        queue.length
      );

      if (nextIndex === -1) {
        logHTAutoNext("reason", {
          reason: "no-next",
          currentIndex,
          queueLength: queue.length,
          nextIndex: -1,
        });

        if (!shouldOfferSmartQueueExtend()) {
          logAutoNextSkipped("queue_ended_smart_autoplay_disabled", {
            queueLength: queue.length,
            repeatMode: repeatModeRef.current,
          });
          setIsPlaying(false);
          return;
        }

        if (isBackgroundAppState(appStateRef.current)) {
          logAutoNextSkipped("background_pending_smart_extend", {
            queueLength: queue.length,
          });
          pendingSmartExtendRef.current = true;
          setIsPlaying(false);
          return;
        }

        const extended = await extendQueueWithSmartTracksRef.current?.();

        if (!extended) {
          logAutoNextFailure({
            reason: "smart_extend_failed",
            queueLength: queue.length,
          });
          setIsPlaying(false);
        } else {
          logAutoNextSuccess({ reason: "smart_extend", queueLength: queue.length });
        }

        return;
      }

      const safeIndex = Math.max(0, Math.min(nextIndex, queue.length - 1));
      const song = normalizeSong(queue[safeIndex]);

      logHTAutoNext("currentIndex", { currentIndex });
      logHTAutoNext("queueLength", { queueLength: queue.length });
      logHTAutoNext("nextIndex", { nextIndex: safeIndex, nextSongId: song.id });

      setActiveQueueIndex(safeIndex);
      activeQueueIndexRef.current = safeIndex;

      await loadAndPlayRef.current?.(song);
      logAutoNextSuccess({
        nextSongId: song.id,
        nextIndex: safeIndex,
        shuffle: shuffleRef.current,
        repeatMode: repeatModeRef.current,
      });

      void persistActiveQueue(queue, safeIndex, activeQueueModeRef.current);
      void removeStoredValues([POSITION_KEY]);
    });
  }, [
    runQueueTransition,
    getActiveQueuePlaybackState,
    getNextQueueIndex,
    setIsPlaying,
    normalizeSong,
    persistActiveQueue,
    removeStoredValues,
    syncStateFromTrackPlayerIndex,
    advanceTrackPlayerQueueFromJs,
    shouldOfferSmartQueueExtend,
  ]);

  const handleTrackFinished = useCallback(async () => {
    logTrackFinished({
      songId: currentSongRef.current?.id,
      repeatMode: repeatModeRef.current,
    });

    try {
      if (isLiveStreamSong(currentSongRef.current)) {
        logAutoNextSkipped("live_stream", {
          songId: currentSongRef.current?.id,
        });
        return;
      }

      if (repeatModeRef.current === "one") {
        logAutoNextSkipped("repeat_one", {
          songId: currentSongRef.current?.id,
        });

        if (hiddenAudioLoadedRef.current) {
          await HiddenAudio.seek(0);
          await HiddenAudio.play();
          setIsPlaying(true);
          logAutoNextSuccess({ reason: "repeat_one_restart" });
        } else {
          logAutoNextFailure({ reason: "repeat_one_sound_unloaded" });
        }

        return;
      }

      await nextSong();
    } finally {
      void removeStoredValues([POSITION_KEY]);
      clearFinishWatchdog("track_finished");
      autoAdvanceRef.current = false;
    }
  }, [
    nextSong,
    removeStoredValues,
    setIsPlaying,
    clearFinishWatchdog,
    isLiveStreamSong,
  ]);

  handleTrackFinishedRef.current = handleTrackFinished;

  const scheduleTrackAdvance = useCallback(() => {
    const { queue, safeIndex } = getActiveQueuePlaybackState();
    const nextIndex = getNextQueueIndex(safeIndex, queue.length);

    if (isChangingTrackRef.current || autoAdvanceRef.current) {
      logAutoNextSkipped(
        isChangingTrackRef.current ? "already_changing_track" : "already_advancing",
        { songId: currentSongRef.current?.id }
      );
      logHTAutoNext("reason", {
        reason: isChangingTrackRef.current
          ? "guard-blocked-changing-track"
          : "guard-blocked-already-advancing",
        currentIndex: safeIndex,
        queueLength: queue.length,
        nextIndex,
      });
      return;
    }

    if (!hiddenAudioLoadedRef.current && !trackPlayerActiveRef.current) {
      logAutoNextSkipped("sound_unloaded", { songId: currentSongRef.current?.id });
      logHTAutoNext("reason", {
        reason: "paused-no-sound",
        currentIndex: safeIndex,
        queueLength: queue.length,
        nextIndex,
      });
      return;
    }

    logAutoNextAttempt({
      source: "scheduleTrackAdvance",
      songId: currentSongRef.current?.id,
      repeatMode: repeatModeRef.current,
      shuffle: shuffleRef.current,
    });

    logHTAutoNext("currentIndex", { currentIndex: safeIndex });
    logHTAutoNext("queueLength", { queueLength: queue.length });
    logHTAutoNext("nextIndex", { nextIndex });

    clearFinishWatchdog("schedule_advance");

    const songId = currentSongRef.current?.id || "";
    const now = Date.now();

    if (
      lastFinishEventRef.current.songId === songId &&
      now - lastFinishEventRef.current.handledAt < FINISH_DEBOUNCE_MS
    ) {
      logHTAutoNext("reason", {
        reason: "guard-blocked-debounce",
        songId,
        currentIndex: safeIndex,
        queueLength: queue.length,
        nextIndex,
      });
      return;
    }

    lastFinishEventRef.current = {
      songId,
      handledAt: now,
    };
    autoAdvanceRef.current = true;

    setTimeout(() => {
      void handleTrackFinishedRef.current?.();
    }, 0);
  }, [getActiveQueuePlaybackState, getNextQueueIndex, clearFinishWatchdog]);

  const runLockScreenEndCheck = useCallback(
    async (sourceDuration?: number) => {
      if (trackPlayerActiveRef.current) return;

      const songId = currentSongRef.current?.id || "";
      logHTLockAutoNext("check", {
        songId,
        source: sourceDuration ? "watchdog" : "end-check",
      });

      if (
        !hiddenAudioLoadedRef.current ||
        isChangingTrackRef.current ||
        autoAdvanceRef.current
      ) {
        return;
      }

      try {
        const status = await HiddenAudio.getStatus();

        if (currentSongRef.current?.id !== songId) {
          return;
        }

        const statusPosition = status.position || 0;
        const statusDuration = status.duration || sourceDuration || 0;
        const nearEnd =
          statusDuration >= MIN_DURATION_FOR_POSITION_FINISH_MS &&
          statusPosition >= statusDuration - LOCK_SCREEN_END_WINDOW_MS;

        if (!status.isPlaying && nearEnd) {
          logHTLockAutoNext("force-advance", {
            songId,
            position: statusPosition,
            duration: statusDuration,
            didJustFinish: false,
          });
          scheduleTrackAdvance();
          return;
        }

        if (
          status.isPlaying &&
          statusDuration >= MIN_DURATION_FOR_POSITION_FINISH_MS &&
          statusPosition >= statusDuration - LOCK_SCREEN_END_WINDOW_MS
        ) {
          armFinishWatchdogRef.current?.(
            statusPosition,
            statusDuration,
            true
          );
        }
      } catch (error) {
        logPlayerContextError("Lock screen end check error:", error);
      }
    },
    [scheduleTrackAdvance]
  );

  const scheduleLockScreenEndCheck = useCallback(
    (delayMs: number) => {
      if (lockScreenEndCheckRef.current) return;

      lockScreenEndCheckRef.current = setTimeout(() => {
        lockScreenEndCheckRef.current = null;
        void runLockScreenEndCheck();
      }, delayMs);
    },
    [runLockScreenEndCheck]
  );

  const armFinishWatchdog = useCallback(
    (position: number, duration: number, playing: boolean) => {
      if (trackPlayerActiveRef.current) return;

      if (
        repeatModeRef.current === "one" ||
        duration < MIN_DURATION_FOR_POSITION_FINISH_MS
      ) {
        clearFinishWatchdog("repeat_or_short_track");
        return;
      }

      const songId = currentSongRef.current?.id || "";
      if (!songId) {
        clearFinishWatchdog("missing_song");
        return;
      }

      const withinEndWindow =
        position > 0 && position >= duration - LOCK_SCREEN_END_WINDOW_MS;

      if (!playing) {
        if (withinEndWindow) {
          logHTLockAutoNext("armed", {
            songId,
            mode: "ended-near-end",
            position,
            duration,
          });
          scheduleLockScreenEndCheck(LOCK_END_CHECK_DELAY_MS);
        } else {
          clearFinishWatchdog("paused_before_end_window");
        }
        return;
      }

      if (!withinEndWindow) {
        clearFinishWatchdog("outside_end_window");
        return;
      }

      const remainingMs = Math.max(0, duration - position);
      const delay = Math.max(
        FINISH_WATCHDOG_MIN_DELAY_MS,
        Math.min(remainingMs + LOCK_FINISH_GRACE_MS, 15000)
      );
      const fireAt = Date.now() + delay;

      if (
        finishWatchdogTimeoutRef.current &&
        finishWatchdogSongIdRef.current === songId &&
        finishWatchdogFireAtRef.current > 0 &&
        fireAt >= finishWatchdogFireAtRef.current - 250
      ) {
        return;
      }

      if (finishWatchdogTimeoutRef.current) {
        clearTimeout(finishWatchdogTimeoutRef.current);
      }

      finishWatchdogSongIdRef.current = songId;
      finishWatchdogFireAtRef.current = fireAt;

      logHTLockAutoNext("armed", {
        songId,
        delayMs: delay,
        position,
        duration,
        background: isBackgroundAppState(appStateRef.current),
      });

      logFinishWatchdogArmed({
        songId,
        delayMs: delay,
        position,
        duration,
      });

      finishWatchdogTimeoutRef.current = setTimeout(() => {
        finishWatchdogTimeoutRef.current = null;
        finishWatchdogFireAtRef.current = 0;
        void runLockScreenEndCheck(duration);
      }, delay);
    },
    [clearFinishWatchdog, runLockScreenEndCheck, scheduleLockScreenEndCheck]
  );

  armFinishWatchdogRef.current = armFinishWatchdog;

  const flushPendingSmartExtend = useCallback(async () => {
    if (!pendingSmartExtendRef.current) return;

    pendingSmartExtendRef.current = false;

    if (!shouldOfferSmartQueueExtend()) return;

    const { queue, safeIndex } = getActiveQueuePlaybackState();

    if (!queue.length) return;

    if (getNextQueueIndex(safeIndex, queue.length) >= 0) {
      if (trackPlayerActiveRef.current) {
        await advanceTrackPlayerQueueFromJs("pending_smart_extend");
        return;
      }

      await scheduleTrackAdvance();
      return;
    }

    const extended = await extendQueueWithSmartTracksRef.current?.();

    if (!extended) {
      setIsPlaying(false);
    }
  }, [
    getActiveQueuePlaybackState,
    getNextQueueIndex,
    scheduleTrackAdvance,
    advanceTrackPlayerQueueFromJs,
    setIsPlaying,
  ]);

  const catchUpPlaybackIfEnded = useCallback(async () => {
    if (trackPlayerActiveRef.current) {
      return;
    }

    if (
      !hiddenAudioLoadedRef.current ||
      isChangingTrackRef.current ||
      autoAdvanceRef.current
    ) {
      return;
    }

    try {
      const status = await HiddenAudio.getStatus();

      const position = status.position || 0;
      const duration = status.duration || 0;

      const nearEndWhilePaused =
        repeatModeRef.current !== "one" &&
        duration >= MIN_DURATION_FOR_POSITION_FINISH_MS &&
        position >= duration - TRACK_END_THRESHOLD_MS &&
        !status.isPlaying;

      if (nearEndWhilePaused) {
        scheduleTrackAdvance();
      }
    } catch (error) {
      logPlayerContextError("Catch up playback error:", error);
    }
  }, [scheduleTrackAdvance]);

  const applyHiddenAudioStatus = useCallback(
    async (status: HiddenAudioStatus) => {
      if (trackPlayerActiveRef.current) return;

      recordRuntimePlaybackProgressUpdate("hidden_audio", appStateRef.current);

      const nextPosition = status.position || 0;
      const nextDuration = status.duration || 0;
      const nextIsPlaying = status.isPlaying || false;
      const previousPosition = positionMillisRef.current;
      const now = Date.now();
      const positionStateMinMs = getPositionStateUpdateMinMs(
        appStateRef.current
      );

      positionMillisRef.current = nextPosition;

      if (
        nextIsPlaying &&
        (now - lastPositionStateUpdateRef.current >= positionStateMinMs ||
          Math.abs(nextPosition - previousPosition) > 1800)
      ) {
        lastPositionStateUpdateRef.current = now;
        recordPlaybackProgressUpdate();
        recordPlaybackReactStateUpdate("position");
        setPositionMillisState(nextPosition);
      } else if (
        !nextIsPlaying &&
        Math.abs(nextPosition - previousPosition) > 1800
      ) {
        lastPositionStateUpdateRef.current = now;
        recordPlaybackReactStateUpdate("position");
        setPositionMillisState(nextPosition);
      }

      if (
        nextDuration > 0 &&
        Math.abs(nextDuration - durationMillisRef.current) >=
          DURATION_UPDATE_THRESHOLD_MS
      ) {
        durationMillisRef.current = nextDuration;
        recordPlaybackReactStateUpdate("duration");
        setDurationMillisState(nextDuration);
      }

      if (nextIsPlaying !== isPlayingRef.current) {
        isPlayingRef.current = nextIsPlaying;
        recordPlaybackReactStateUpdate("is_playing");
        setIsPlayingState(nextIsPlaying);
      }

      armFinishWatchdog(nextPosition, nextDuration, nextIsPlaying);

      const didJustFinish =
        nextDuration >= MIN_DURATION_FOR_POSITION_FINISH_MS &&
        lastHiddenAudioPollPlayingRef.current &&
        !nextIsPlaying &&
        (nextPosition >= nextDuration - TRACK_END_THRESHOLD_MS ||
          previousPosition >= nextDuration - TRACK_END_THRESHOLD_MS);

      lastHiddenAudioPollPlayingRef.current = nextIsPlaying;

      if (didJustFinish && !isChangingTrackRef.current) {
        const { queue, safeIndex } = getActiveQueuePlaybackState();
        const nextIndex = getNextQueueIndex(safeIndex, queue.length);

        logHTAutoNext("didJustFinish", {
          songId: currentSongRef.current?.id,
          currentIndex: safeIndex,
          queueLength: queue.length,
          nextIndex,
        });
        scheduleTrackAdvance();
        return;
      }

      const nearTrackEnd =
        repeatModeRef.current !== "one" &&
        !isChangingTrackRef.current &&
        nextDuration >= MIN_DURATION_FOR_POSITION_FINISH_MS &&
        nextPosition > 0 &&
        nextPosition >= nextDuration - TRACK_END_THRESHOLD_MS;

      const playbackEndedWhileNearEnd =
        nearTrackEnd &&
        !nextIsPlaying &&
        (previousPosition >= nextDuration - LOCK_SCREEN_END_WINDOW_MS ||
          nextPosition >= nextDuration - TRACK_END_THRESHOLD_MS);

      if (playbackEndedWhileNearEnd) {
        logPlaybackStalled({
          songId: currentSongRef.current?.id,
          position: nextPosition,
          duration: nextDuration,
        });
        scheduleTrackAdvance();
      } else if (
        nextIsPlaying &&
        nextDuration >= MIN_DURATION_FOR_POSITION_FINISH_MS &&
        nextPosition >= nextDuration - PRELOAD_BEFORE_END_MS &&
        nextPosition < nextDuration - TRACK_END_THRESHOLD_MS
      ) {
        const upcomingSong = getUpcomingSong();

        if (upcomingSong) {
          void preloadUpcomingTrack(upcomingSong);
        }
      }

      if (
        !isTvPlayerOpen() &&
        now - lastPositionSaveRef.current > POSITION_SAVE_INTERVAL_MS &&
        Math.abs(nextPosition - lastSavedPositionRef.current) >=
          POSITION_SAVE_DISTANCE_MS
      ) {
        lastPositionSaveRef.current = now;
        void savePlaybackPosition(nextPosition);
      }
    },
    [
      scheduleTrackAdvance,
      armFinishWatchdog,
      getActiveQueuePlaybackState,
      getNextQueueIndex,
      getUpcomingSong,
      preloadUpcomingTrack,
      savePlaybackPosition,
    ]
  );

  const startHiddenAudioPolling = useCallback(() => {
    stopHiddenAudioPolling();

    if (!isPlayingRef.current) {
      return;
    }

    const poll = async () => {
      if (isTvPlayerOpen()) return;
      if (!hiddenAudioLoadedRef.current || trackPlayerActiveRef.current) {
        return;
      }
      if (!isPlayingRef.current) {
        return;
      }

      try {
        const status = await HiddenAudio.getStatus();
        await applyHiddenAudioStatus(status);
      } catch (error) {
        logPlayerContextError("HiddenAudio status poll error:", error);
      }
    };

    void poll();

    hiddenAudioPollIntervalRef.current = setInterval(() => {
      void poll();
    }, getProgressUpdateIntervalMs(appStateRef.current));
  }, [applyHiddenAudioStatus, stopHiddenAudioPolling]);

  useEffect(() => {
    if (!isHiddenAudioNativeEngineAvailable()) return undefined;

    const listenerId = `hidden_audio_native_${Date.now()}`;
    recordListenerRegister("hidden_audio_native_events", listenerId);

    const unsubscribeProgressChanged = subscribeHiddenAudioProgressChanged(
      (status) => {
        if (!hiddenAudioLoadedRef.current || trackPlayerActiveRef.current) return;
        if (isTvPlayerOpen()) return;
        void applyHiddenAudioStatus(status);
      }
    );

    const unsubscribeState = subscribeHiddenAudioStateChanged(() => {});
    const unsubscribeDiagnostics = subscribeHiddenAudioNativeDiagnostics(() => {});

    const unsubscribePlaybackEnded = subscribeHiddenAudioPlaybackEnded(() => {
      if (!hiddenAudioLoadedRef.current || trackPlayerActiveRef.current) return;
      scheduleTrackAdvance();
    });

    return () => {
      recordListenerUnregister("hidden_audio_native_events", listenerId);
      unsubscribeProgressChanged();
      unsubscribeState();
      unsubscribeDiagnostics();
      unsubscribePlaybackEnded();
    };
  }, [applyHiddenAudioStatus, scheduleTrackAdvance]);

  const applyProgressUpdateInterval = useCallback(async (reason = "unspecified") => {
    recordApplyProgressUpdateIntervalCall(reason);

    if (trackPlayerActiveRef.current) {
      await bridgeSetProgressInterval(appStateRef.current);
      return;
    }

    if (hiddenAudioLoadedRef.current) {
      startHiddenAudioPolling();
    }
  }, [startHiddenAudioPolling]);

  const loadAndPlay = useCallback(
    async (song: AppSong, options?: LoadAndPlayOptions) => {
      let requestId = 0;

      try {
        const normalizedSong = normalizeSong(song);

        if (
          shouldIgnoreDuplicatePlayRequest(
            normalizedSong.id,
            inFlightPlaySongIdRef.current,
            isChangingTrackRef.current,
            true
          )
        ) {
          logDuplicatePlayIgnored({
            songId: normalizedSong.id,
            source: "loadAndPlay",
          });
          return;
        }

        if (options?.userInitiated && !options?.userInterruptDone) {
          await interruptCurrentPlaybackForUserTap(normalizedSong.id);
        }

        requestId = loadRequestIdRef.current + 1;
        loadRequestIdRef.current = requestId;
        inFlightPlaySongIdRef.current = normalizedSong.id;

        logAudioLoadStart({
          songId: normalizedSong.id,
          requestId,
        });

        autoAdvanceRef.current = false;
        clearFinishWatchdog("load_and_play");

        if (lastFinishEventRef.current.songId !== normalizedSong.id) {
          lastFinishEventRef.current = { songId: "", handledAt: 0 };
        }

        if (isYouTubeSong(normalizedSong)) {
          logPlayerContextDev(
            "Blocked native YouTube playback. Use /youtube-player WebView instead."
          );
          setIsPlaying(false);
          setIsLoading(false);
          return;
        }

        isChangingTrackRef.current = true;
        setIsLoading(true);

        const shouldRestorePosition =
          currentSongRef.current?.id === normalizedSong.id;

        const useNativeQueue = await shouldUseTrackPlayerPlayback();

        if (useNativeQueue) {
          try {
            const { queue } = getActiveQueuePlaybackState();

            if (!queue.length) {
              setIsPlaying(false);
              return;
            }

            const requestedIndex = queue.findIndex(
              (item) => item.id === normalizedSong.id
            );
            const fallbackIndex =
              requestedIndex >= 0
                ? requestedIndex
                : Math.max(
                    0,
                    Math.min(activeQueueIndexRef.current, queue.length - 1)
                  );

            let startPositionMillis = 0;

            if (shouldRestorePosition) {
              try {
                const savedPosition = await AsyncStorage.getItem(POSITION_KEY);
                const millis = Number(savedPosition);

                if (!Number.isNaN(millis) && millis > 0) {
                  startPositionMillis = millis;
                }
              } catch (error) {
                logPlayerContextError("Restore TrackPlayer position error:", error);
              }
            }

            if (
              preloadedSongIdRef.current &&
              preloadedSongIdRef.current !== normalizedSong.id
            ) {
              await clearPreloadedSound();
            }

            let playedIndex = fallbackIndex;

            if (options?.userInitiated) {
              const fastResult = await bridgeTryUserTapFastPlay({
                songs: queue,
                songId: normalizedSong.id,
                startIndex: fallbackIndex,
                repeatMode: repeatModeRef.current,
                volume: volumeRef.current,
                muted: isMutedRef.current,
                startPositionMillis,
              });

              if (fastResult) {
                playedIndex = fastResult.playedIndex;
              } else {
                await unloadCurrentSound();

                if (
                  loadRequestIdRef.current !== requestId ||
                  !isMountedRef.current
                ) {
                  return;
                }

                playedIndex = await activateTrackPlayerPlayback({
                  songs: queue,
                  startIndex: fallbackIndex,
                  repeatMode: repeatModeRef.current,
                  volume: volumeRef.current,
                  muted: isMutedRef.current,
                  startPositionMillis,
                  reason: "user_tap_full_reload",
                });
              }
            } else {
              await unloadCurrentSound();

              if (
                loadRequestIdRef.current !== requestId ||
                !isMountedRef.current
              ) {
                return;
              }

              playedIndex = await activateTrackPlayerPlayback({
                songs: queue,
                startIndex: fallbackIndex,
                repeatMode: repeatModeRef.current,
                volume: volumeRef.current,
                muted: isMutedRef.current,
                startPositionMillis,
              });
            }

            if (loadRequestIdRef.current !== requestId || !isMountedRef.current) {
              return;
            }

            trackPlayerActiveRef.current = true;
            syncStateFromTrackPlayerIndex(playedIndex);
            logAudioLoadSuccess({
              songId: normalizedSong.id,
              requestId,
              engine: "track_player",
            });
            logPlaybackStarted({
              songId: normalizedSong.id,
              requestId,
              engine: "track_player",
            });

            const progress = await bridgeGetProgress();
            setPositionMillis(progress.positionMillis);
            setDurationMillis(progress.durationMillis);
            setIsPlaying(progress.isPlaying);
            await bridgeSetProgressInterval(appStateRef.current);
            void removeStoredValues([POSITION_KEY]);
            setTimeout(() => {
              savePlaybackSideEffects(normalizedSong);
            }, 0);
          } catch (error) {
            logPlayerContextError("TrackPlayer load and play error:", error);
            logAudioLoadFailure({
              songId: normalizedSong.id,
              reason: String((error as Error)?.message || "track_player_load_error"),
              engine: "track_player",
            });
            trackPlayerActiveRef.current = false;
            setIsPlaying(false);
          } finally {
            if (isMountedRef.current) {
              setIsLoading(false);
            }

            if (loadRequestIdRef.current === requestId) {
              isChangingTrackRef.current = false;
              if (inFlightPlaySongIdRef.current === normalizedSong.id) {
                inFlightPlaySongIdRef.current = null;
              }
            }
          }

          return;
        }

        void configureAudio("load_and_play_hidden_audio");

        setCurrentSong(normalizedSong);
        currentSongRef.current = normalizedSong;
        setIsPlaying(true);
        setPositionMillis(0);
        setDurationMillis(0);
        lastHiddenAudioPollPlayingRef.current = false;

        if (
          preloadedSongIdRef.current &&
          preloadedSongIdRef.current !== normalizedSong.id
        ) {
          await clearPreloadedSound();
        }

        await unloadCurrentSound();

        if (loadRequestIdRef.current !== requestId || !isMountedRef.current) {
          return;
        }

        const usedPreloadedUrl = Boolean(
          preloadedSongIdRef.current === normalizedSong.id &&
            preloadedUrlRef.current
        );
        const audioUrl =
          consumePreloadedUrl(normalizedSong.id) ||
          resolveHiddenAudioUrl(normalizedSong);

        logPlayerContextDev("[playback-resolve]", {
          songId: normalizedSong.id,
          title: normalizedSong.title,
          resolvedUrl: audioUrl ? audioUrl.slice(0, 120) : null,
          engine: "hidden_audio",
          hiddenAudioNativeAvailable: isHiddenAudioNativeEngineAvailable(),
        });

        if (!audioUrl) {
          logPlayerContextError(
            "Missing audio source:",
            JSON.stringify(normalizedSong, null, 2)
          );
          logAudioLoadFailure({
            songId: normalizedSong.id,
            reason: "missing_audio_source",
          });
          setIsPlaying(false);
          setIsLoading(false);
          return;
        }

        try {
          await HiddenAudio.load(audioUrl, normalizedSong);
        } catch (loadError) {
          logPlayerContextDev("[playback-error]", {
            songId: normalizedSong.id,
            engine: "hidden_audio",
            message: String((loadError as Error)?.message || loadError),
          });
          logAudioLoadFailure({
            songId: normalizedSong.id,
            reason: String(
              (loadError as Error)?.message || "hidden_audio_load_error"
            ),
          });
          setIsPlaying(false);
          setIsLoading(false);
          return;
        }

        if (loadRequestIdRef.current !== requestId || !isMountedRef.current) {
          try {
            await HiddenAudio.pause();
          } catch {}
          return;
        }

        hiddenAudioLoadedRef.current = true;

        logAudioLoadSuccess({
          songId: normalizedSong.id,
          requestId,
          preloaded: usedPreloadedUrl,
        });

        try {
          const savedPosition = await AsyncStorage.getItem(POSITION_KEY);

          if (savedPosition && shouldRestorePosition) {
            const millis = Number(savedPosition);

            if (!Number.isNaN(millis) && millis > 0) {
              await HiddenAudio.seek(millis);
              positionMillisRef.current = millis;
              setPositionMillisState(millis);
            }
          }
        } catch (error) {
          logPlayerContextError("Restore playback position error:", error);
        }

        if (loadRequestIdRef.current !== requestId || !isMountedRef.current) {
          try {
            stopHiddenAudioPolling();
            await HiddenAudio.pause();
          } catch {}
          hiddenAudioLoadedRef.current = false;
          return;
        }

        await HiddenAudio.play();
        lastHiddenAudioPollPlayingRef.current = true;

        if (loadRequestIdRef.current !== requestId || !isMountedRef.current) {
          return;
        }

        setIsPlaying(true);
        logPlaybackStarted({
          songId: normalizedSong.id,
          requestId,
        });
        setTimeout(() => {
          savePlaybackSideEffects(normalizedSong);
        }, 0);
        await applyProgressUpdateInterval("load_and_play_hidden_audio");
      } catch (error) {
        logPlayerContextError("Load and play error:", error);
        logAudioLoadFailure({
          songId: song?.id,
          reason: String((error as Error)?.message || "load_and_play_error"),
        });
        setIsPlaying(false);
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }

        if (loadRequestIdRef.current === requestId) {
          isChangingTrackRef.current = false;
          if (inFlightPlaySongIdRef.current === song?.id) {
            inFlightPlaySongIdRef.current = null;
          }
        }
      }
    },
    [
      normalizeSong,
      isYouTubeSong,
      clearPreloadedSound,
      interruptCurrentPlaybackForUserTap,
      bridgeTryUserTapFastPlay,
      unloadCurrentSound,
      getActiveQueuePlaybackState,
      resolveHiddenAudioUrl,
      consumePreloadedUrl,
      stopHiddenAudioPolling,
      applyProgressUpdateInterval,
      syncStateFromTrackPlayerIndex,
      setIsPlaying,
      setPositionMillis,
      setDurationMillis,
      savePlaybackSideEffects,
      removeStoredValues,
      configureAudio,
      clearFinishWatchdog,
    ]
  );

  const playQueueAtIndex = useCallback(
    async (index: number) => {
      let queue = activeQueueRef.current.filter((song) => !isYouTubeSong(song));
      const currentSong = currentSongRef.current
        ? normalizeSong(currentSongRef.current)
        : null;

      if (!queue.length && currentSong) {
        const rebuilt = rebuildQueueFromAvailableContext(
          currentSong,
          queue,
          currentSong
        );

        queue = rebuilt.queue;
        await syncActiveQueue(queue, 0, activeQueueModeRef.current);
      }

      if (!queue.length) {
        logAutoNextSkipped("queue_empty", { source: "playQueueAtIndex" });
        return;
      }

      const requestedIndex = Math.max(0, Math.min(index, queue.length - 1));
      const targetSong = normalizeSong(queue[requestedIndex]);
      const repaired = repairQueueIndexForSong(
        queue,
        targetSong.id,
        requestedIndex
      );

      if (repaired.repaired) {
        logQueueIndexMismatch({
          songId: targetSong.id,
          requestedIndex,
          resolvedIndex: repaired.index,
          reason: repaired.reason,
        });
      }

      const safeIndex = repaired.index;
      const song = normalizeSong(queue[safeIndex]);

      setActiveQueueIndex(safeIndex);
      activeQueueIndexRef.current = safeIndex;

      void persistActiveQueue(queue, safeIndex, activeQueueModeRef.current);
      void removeStoredValues([POSITION_KEY]);

      await loadAndPlay(song, { userInitiated: true });
    },
    [
      isYouTubeSong,
      normalizeSong,
      persistActiveQueue,
      removeStoredValues,
      loadAndPlay,
      syncActiveQueue,
    ]
  );

  loadAndPlayRef.current = (song, options) => loadAndPlay(song, options);

  const extendQueueWithSmartTracks = useCallback(async () => {
    try {
      if (!shouldOfferSmartQueueExtend()) return false;

      const current = currentSongRef.current;
      if (!current) return false;
      if (isBoundedQueuePlayback(current)) return false;

      const memory = await getSmartQueue();
      const currentQueue = activeQueueRef.current.filter(
        (song) => !isYouTubeSong(song)
      );

      const combinedLibrary = [...currentQueue, ...(memory as any[])]
        .map(normalizeSong)
        .filter((song) => !isYouTubeSong(song));

      const related = await getRelatedTracks(current as any, combinedLibrary as any);
      const existingIds = new Set(currentQueue.map((song) => song.id));

      const freshRelated = related
        .map((song: any) => normalizeSong(song))
        .filter((song) => !existingIds.has(song.id))
        .filter((song) => Boolean(getPlayableUri(song)))
        .slice(0, 12);

      if (!freshRelated.length) return false;

      const updatedQueue = [...currentQueue, ...freshRelated];
      const nextIndex = currentQueue.length;

      await syncActiveQueue(updatedQueue, nextIndex, "smart");
      await removeStoredValues([POSITION_KEY]);
      await loadAndPlay(updatedQueue[nextIndex]);

      return true;
    } catch (error) {
      logPlayerContextError("Smart autoplay extend error:", error);
      return false;
    }
  }, [
    isYouTubeSong,
    normalizeSong,
    getPlayableUri,
    syncActiveQueue,
    removeStoredValues,
    loadAndPlay,
    shouldOfferSmartQueueExtend,
  ]);

  extendQueueWithSmartTracksRef.current = extendQueueWithSmartTracks;

  const previousSong = useCallback(async () => {
    const { queue: previousQueue } = getActiveQueuePlaybackState();

    logManualQueueSkip("previous", { queueLength: previousQueue.length });

    if (trackPlayerActiveRef.current) {
      await runQueueTransition(async () => {
        try {
          await bridgeSkipToPrevious();
          const activeIndex = await bridgeGetActiveIndex();

          if (activeIndex !== null) {
            const { queue } = getActiveQueuePlaybackState();
            syncStateFromTrackPlayerIndex(activeIndex);
            void persistActiveQueue(
              queue,
              activeIndex,
              activeQueueModeRef.current
            );
            void removeStoredValues([POSITION_KEY]);
          }
        } catch (error) {
          logPlayerContextError("TrackPlayer previous error:", error);
        }
      });

      return;
    }

    await runQueueTransition(async () => {
      const { queue, safeIndex: currentIndex } = getActiveQueuePlaybackState();

      if (!queue.length) return;

      const previousIndex = getPreviousQueueIndex(
        currentIndex,
        queue.length
      );

      if (previousIndex === -1) return;

      await playQueueAtIndex(previousIndex);
    });
  }, [
    runQueueTransition,
    getActiveQueuePlaybackState,
    getPreviousQueueIndex,
    playQueueAtIndex,
    syncStateFromTrackPlayerIndex,
    persistActiveQueue,
    removeStoredValues,
  ]);

  const playQueue = useCallback(
    async (
      queue: AppSong[],
      startIndex = 0,
      priorInterruptDone = false,
      queueMode?: ActiveQueueMode
    ) => {
      const nativeQueue = queue
        .map(normalizeSong)
        .filter((song) => !isYouTubeSong(song));

      if (!nativeQueue.length) return;

      const requestedIndex = Math.max(0, Math.min(startIndex, nativeQueue.length - 1));
      const targetSong = nativeQueue[requestedIndex];
      const repaired = repairQueueIndexForSong(
        nativeQueue,
        targetSong.id,
        requestedIndex
      );

      if (repaired.repaired) {
        logQueueIndexMismatch({
          songId: targetSong.id,
          requestedIndex,
          resolvedIndex: repaired.index,
          reason: repaired.reason,
        });
      }

      const safeIndex = repaired.index;

      setRadioMode(false);
      radioModeRef.current = false;
      void setStoredValueIfChanged(RADIO_MODE_KEY, "false");

      const resolvedMode = resolveQueueModeForSong(
        nativeQueue[safeIndex],
        queueMode
      );

      void syncActiveQueue(nativeQueue, safeIndex, resolvedMode);
      void removeStoredValues([POSITION_KEY]);

      const selectedSong = nativeQueue[safeIndex];
      let interruptDone = priorInterruptDone;

      if (currentSongRef.current?.id !== selectedSong.id) {
        if (!interruptDone) {
          await interruptCurrentPlaybackForUserTap(selectedSong.id);
        }

        interruptDone = true;
        setCurrentSong(selectedSong);
        currentSongRef.current = selectedSong;
        setIsLoading(true);
      }

      if (
        currentSongRef.current?.id === selectedSong.id &&
        hiddenAudioLoadedRef.current
      ) {
        try {
          const status = await HiddenAudio.getStatus();

          if (!status.isPlaying) {
            await HiddenAudio.play();
            lastHiddenAudioPollPlayingRef.current = true;
          }

          setIsPlaying(true);
          void applyProgressUpdateInterval("play_queue_resume");
          savePlaybackSideEffects(selectedSong);
          return;
        } catch {}
      }

      await loadAndPlay(selectedSong, {
        userInitiated: true,
        userInterruptDone: interruptDone,
      });
    },
    [
      normalizeSong,
      isYouTubeSong,
      setStoredValueIfChanged,
      syncActiveQueue,
      removeStoredValues,
      interruptCurrentPlaybackForUserTap,
      loadAndPlay,
      applyProgressUpdateInterval,
      setIsPlaying,
      savePlaybackSideEffects,
      resolveQueueModeForSong,
    ]
  );

  const playSong = useCallback(
    async (
      song: AppSong,
      queue?: AppSong[],
      index?: number,
      queueMode?: ActiveQueueMode
    ) => {
      const normalizedSong = normalizeSong(song);

      logTapToPlayStart({
        songId: normalizedSong.id,
        hasQueue: Boolean(queue?.length),
        requestedIndex: index,
      });

      const switchingToNewSong = currentSongRef.current?.id !== normalizedSong.id;

      if (switchingToNewSong) {
        await interruptCurrentPlaybackForUserTap(normalizedSong.id);
      }

      if (switchingToNewSong) {
        setCurrentSong(normalizedSong);
        currentSongRef.current = normalizedSong;
        setIsLoading(true);
        setIsPlaying(true);
      }

      if (isYouTubeSong(normalizedSong)) {
        logPlayerContextDev(
          "Blocked playSong for YouTube. Route to /youtube-player instead."
        );
        return;
      }

      if (
        shouldIgnoreDuplicatePlayRequest(
          normalizedSong.id,
          inFlightPlaySongIdRef.current,
          isChangingTrackRef.current,
          true
        )
      ) {
        logDuplicatePlayIgnored({
          songId: normalizedSong.id,
          source: "playSong",
        });
        return;
      }

      if (queue?.length) {
        const nativeQueue = queue
          .map(normalizeSong)
          .filter((item) => !isYouTubeSong(item));

        const repaired = repairQueueIndexForSong(
          nativeQueue,
          normalizedSong.id,
          index
        );

        if (repaired.repaired) {
          logQueueIndexMismatch({
            songId: normalizedSong.id,
            requestedIndex: index,
            resolvedIndex: repaired.index,
            reason: repaired.reason,
          });
        }

        recordQueueControl("play_song", nativeQueue.length, {
          songId: normalizedSong.id,
        });
        await playQueue(
          nativeQueue,
          repaired.index,
          switchingToNewSong,
          queueMode || resolveQueueModeForSong(normalizedSong)
        );
        return;
      }

      if (
        currentSongRef.current?.id === normalizedSong.id &&
        hiddenAudioLoadedRef.current
      ) {
        try {
          const status = await HiddenAudio.getStatus();

          if (!status.isPlaying) {
            await HiddenAudio.play();
            lastHiddenAudioPollPlayingRef.current = true;
          }

          setIsPlaying(true);
          void applyProgressUpdateInterval("play_song_resume");
          savePlaybackSideEffects(normalizedSong);
          return;
        } catch {}
      }

      let existingQueue = activeQueueRef.current.filter(
        (item) => !isYouTubeSong(item)
      );

      const rebuilt = rebuildQueueFromAvailableContext(
        normalizedSong,
        existingQueue,
        currentSongRef.current
      );

      if (rebuilt.rebuilt) {
        existingQueue = rebuilt.queue;
        logQueueIndexMismatch({
          songId: normalizedSong.id,
          reason: rebuilt.reason,
          queueLength: existingQueue.length,
        });
      }

      const repaired = repairQueueIndexForSong(
        existingQueue,
        normalizedSong.id,
        activeQueueIndexRef.current
      );

      if (repaired.repaired) {
        logQueueIndexMismatch({
          songId: normalizedSong.id,
          resolvedIndex: repaired.index,
          reason: repaired.reason,
        });
      }

      const existingIndex = repaired.index;

      if (existingQueue.length) {
        if (rebuilt.rebuilt) {
          await syncActiveQueue(
            existingQueue,
            existingIndex,
            activeQueueModeRef.current
          );
        } else {
          setActiveQueueIndex(existingIndex);
          activeQueueIndexRef.current = existingIndex;
          setTimeout(() => {
            void persistActiveQueue(
              existingQueue,
              existingIndex,
              activeQueueModeRef.current
            );
          }, 0);
        }
      } else {
        void syncActiveQueue(
          [normalizedSong],
          0,
          resolveQueueModeForSong(normalizedSong, queueMode)
        );
      }

      void removeStoredValues([POSITION_KEY]);
      await loadAndPlay(normalizedSong, {
        userInitiated: true,
        userInterruptDone: switchingToNewSong,
      });
    },
    [
      normalizeSong,
      isYouTubeSong,
      playQueue,
      persistActiveQueue,
      syncActiveQueue,
      removeStoredValues,
      interruptCurrentPlaybackForUserTap,
      loadAndPlay,
      applyProgressUpdateInterval,
      setIsPlaying,
      savePlaybackSideEffects,
      resolveQueueModeForSong,
    ]
  );

  const playAudiusTrack = useCallback(
    async (song: AppSong) => {
      const normalizedSong = normalizeSong(song);

      if (isYouTubeSong(normalizedSong)) {
        logPlayerContextDev(
          "Blocked playAudiusTrack for YouTube. Use /youtube-player WebView instead."
        );
        setIsPlaying(false);
        setIsLoading(false);
        return;
      }

      await loadAndPlay(
        {
          ...normalizedSong,
          type: normalizedSong.type || "audius",
          isOnline: true,
        },
        { userInitiated: true }
      );
    },
    [normalizeSong, isYouTubeSong, setIsPlaying, loadAndPlay]
  );

  const playYouTubeQueue = useCallback(
    async (tracks: BackendYouTubeTrack[], startIndex = 0) => {
      if (!tracks.length) return;

      const normalizedTracks = tracks.map(normalizeYouTubeTrack);
      const safeIndex = Math.max(
        0,
        Math.min(startIndex, normalizedTracks.length - 1)
      );

      setRadioMode(false);
      radioModeRef.current = false;
      await setStoredValueIfChanged(RADIO_MODE_KEY, "false");

      setYouTubeQueue(normalizedTracks);
      setYouTubeQueueIndex(safeIndex);
      youtubeQueueRef.current = normalizedTracks;
      youtubeQueueIndexRef.current = safeIndex;

      await persistYouTubeQueue(normalizedTracks, safeIndex);
    },
    [normalizeYouTubeTrack, setStoredValueIfChanged, persistYouTubeQueue]
  );

  const playRadioAtIndex = useCallback(
    async (index: number) => {
      const queue = radioQueueRef.current;

      if (!queue.length) return false;

      const safeIndex = Math.max(0, Math.min(index, queue.length - 1));

      setRadioIndex(safeIndex);
      radioIndexRef.current = safeIndex;

      await persistRadioState(queue, safeIndex, true);

      return true;
    },
    [persistRadioState]
  );

  const startRadio = useCallback(
    async (seedTrack: AppSong) => {
      try {
        setIsLoading(true);

        const queue = await buildRelatedRadioQueue({
          title: seedTrack.title,
          artist: seedTrack.artist || seedTrack.channelTitle,
          channelTitle: seedTrack.channelTitle,
        });

        setRadioMode(true);
        radioModeRef.current = true;

        setRadioQueue(queue);
        radioQueueRef.current = queue;

        setRadioIndex(0);
        radioIndexRef.current = 0;

        await persistRadioState(queue, 0, true);
      } catch (error) {
        logPlayerContextError("Start radio error:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [persistRadioState]
  );

  const startPersonalRadio = useCallback(async () => {
    try {
      setIsLoading(true);

      const queue = await buildPersonalRadioQueue();

      setRadioMode(true);
      radioModeRef.current = true;

      setRadioQueue(queue);
      radioQueueRef.current = queue;

      setRadioIndex(0);
      radioIndexRef.current = 0;

      await persistRadioState(queue, 0, true);
    } catch (error) {
      logPlayerContextError("Start personal radio error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [persistRadioState]);

  const playNextRadioTrack = useCallback(async () => {
    try {
      if (!radioModeRef.current) return false;

      let queue = radioQueueRef.current;
      const nextIndex = radioIndexRef.current + 1;

      if (queue.length === 0) return false;

      if (nextIndex >= queue.length - 2) {
        const seedTrack = queue[queue.length - 1];

        queue = await extendRadioQueue(queue, seedTrack);

        setRadioQueue(queue);
        radioQueueRef.current = queue;

        await persistRadioState(queue, radioIndexRef.current, true);
      }

      if (nextIndex < queue.length) {
        return await playRadioAtIndex(nextIndex);
      }

      return false;
    } catch (error) {
      logPlayerContextError("Play next radio error:", error);
      return false;
    }
  }, [persistRadioState, playRadioAtIndex]);

  const stopRadio = useCallback(async () => {
    setRadioMode(false);
    radioModeRef.current = false;

    setRadioIndex(0);
    radioIndexRef.current = 0;

    await AsyncStorage.multiSet([
      [RADIO_MODE_KEY, "false"],
      [RADIO_INDEX_KEY, "0"],
    ]);
  }, []);

  const stopPlayback = useCallback(async () => {
    try {
      stopHiddenAudioPolling();
      isChangingTrackRef.current = true;
      pendingSmartExtendRef.current = false;
      clearFinishWatchdog("stop_playback");

      loadRequestIdRef.current += 1;
      inFlightPlaySongIdRef.current = null;
      trackPlayerActiveRef.current = false;
      await clearPreloadedSound();
      await unloadCurrentSound();

      setIsPlaying(false);
      setIsLoading(false);
      setPositionMillis(0);
      setDurationMillis(0);

      currentSongRef.current = null;
      setCurrentSong(null);

      lastCurrentSongPersistRef.current = "";
      await removeStoredValues([CURRENT_SONG_KEY, POSITION_KEY]);
    } catch (error) {
      logPlayerContextError("Stop playback error:", error);
    } finally {
      isChangingTrackRef.current = false;
    }
  }, [
    clearPreloadedSound,
    unloadCurrentSound,
    setIsPlaying,
    setPositionMillis,
    setDurationMillis,
    removeStoredValues,
    clearFinishWatchdog,
    stopHiddenAudioPolling,
  ]);

  const togglePlayPause = useCallback(async () => {
    logPauseResumeStart({ source: "toggle_play_pause" });

    const song = currentSongRef.current;
    const liveStream = isLiveStreamSong(song);

    if (trackPlayerActiveRef.current) {
      if (isChangingTrackRef.current) return;

      if (liveStream) {
        const progress = await bridgeGetProgress();

        if (!progress.isPlaying && song) {
          await loadAndPlay(normalizeSong(song), { userInitiated: true });
          logPauseResumeComplete({ engine: "track_player_live_reconnect" });
          return;
        }
      }

      const playing = await bridgeTogglePlayPause();
      setIsPlaying(playing);
      logPauseResumeComplete({ engine: "track_player" });
      return;
    }

    if (isChangingTrackRef.current) return;

    if (!hiddenAudioLoadedRef.current) {
      const restoredSong = currentSongRef.current;

      if (restoredSong) {
        await loadAndPlay(restoredSong);
      }

      logPauseResumeComplete({ engine: "hidden_audio_restore" });
      return;
    }

    if (liveStream && song) {
      const status = await HiddenAudio.getStatus();

      if (status.isPlaying) {
        clearFinishWatchdog("pause");
        await HiddenAudio.pause();
        lastHiddenAudioPollPlayingRef.current = false;
        stopHiddenAudioPolling();
        setIsPlaying(false);
      } else {
        await loadAndPlay(normalizeSong(song), { userInitiated: true });
      }

      logPauseResumeComplete({ engine: "hidden_audio_live_reconnect" });
      return;
    }

    const status = await HiddenAudio.getStatus();

    if (status.isPlaying) {
      clearFinishWatchdog("pause");
      await HiddenAudio.pause();
      lastHiddenAudioPollPlayingRef.current = false;
      stopHiddenAudioPolling();
      setIsPlaying(false);
    } else {
      await HiddenAudio.play();
      lastHiddenAudioPollPlayingRef.current = true;
      setIsPlaying(true);
      void applyProgressUpdateInterval("toggle_play_resume");
    }

    logPauseResumeComplete({ engine: "hidden_audio" });
  }, [
    loadAndPlay,
    setIsPlaying,
    clearFinishWatchdog,
    isLiveStreamSong,
    normalizeSong,
    stopHiddenAudioPolling,
    applyProgressUpdateInterval,
  ]);

  const seekTo = useCallback(
    async (millis: number) => {
      if (isLiveStreamSong(currentSongRef.current)) return;

      const safeMillis = Math.max(0, Math.floor(millis || 0));

      if (trackPlayerActiveRef.current) {
        await bridgeSeekTo(safeMillis);
        setPositionMillis(safeMillis);
        await savePlaybackPosition(safeMillis);
        return;
      }

      if (!hiddenAudioLoadedRef.current) return;

      clearFinishWatchdog("seek");
      await HiddenAudio.seek(safeMillis);
      setPositionMillis(safeMillis);
      positionMillisRef.current = safeMillis;

      await savePlaybackPosition(safeMillis);
    },
    [setPositionMillis, savePlaybackPosition, clearFinishWatchdog, isLiveStreamSong]
  );

  const seekRelative = useCallback(
    async (offsetMillis: number) => {
      if (isLiveStreamSong(currentSongRef.current)) return;

      const duration = durationMillisRef.current;
      const nextPosition = Math.max(
        0,
        Math.min(
          positionMillisRef.current + offsetMillis,
          duration > 0 ? duration : Number.MAX_SAFE_INTEGER
        )
      );

      await seekTo(nextPosition);
    },
    [isLiveStreamSong, seekTo]
  );

  const replayCurrentTrack = useCallback(async () => {
    const song = currentSongRef.current;
    if (!song) return;

    if (isLiveStreamSong(song)) {
      await loadAndPlay(normalizeSong(song), { userInitiated: true });
      return;
    }

    if (trackPlayerActiveRef.current) {
      await bridgeSeekTo(0);
      setPositionMillis(0);
      positionMillisRef.current = 0;
      await bridgePlay();
      setIsPlaying(true);
      await savePlaybackPosition(0, { immediate: true });
      return;
    }

    if (!hiddenAudioLoadedRef.current) {
      await loadAndPlay(normalizeSong(song), { userInitiated: true });
      return;
    }

    clearFinishWatchdog("replay");
    await HiddenAudio.seek(0);
    setPositionMillis(0);
    positionMillisRef.current = 0;
    await HiddenAudio.play();
    lastHiddenAudioPollPlayingRef.current = true;
    setIsPlaying(true);
    await savePlaybackPosition(0, { immediate: true });
  }, [
    clearFinishWatchdog,
    isLiveStreamSong,
    loadAndPlay,
    normalizeSong,
    savePlaybackPosition,
    setIsPlaying,
    setPositionMillis,
  ]);

  const setVolume = useCallback(async (value: number) => {
    const safeValue = Math.max(0, Math.min(value, 1));

    setVolumeState(safeValue);
    volumeRef.current = safeValue;

    await setStoredValueIfChanged(VOLUME_KEY, String(safeValue));

    if (trackPlayerActiveRef.current) {
      await bridgeSetVolume(safeValue, isMutedRef.current);
      return;
    }

    // HiddenAudio has no volume API; volume state is persisted for RNTP / UI only.
  }, [setStoredValueIfChanged]);

  const toggleMute = useCallback(async () => {
    const nextMuted = !isMutedRef.current;

    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted;

    await setStoredValueIfChanged(MUTED_KEY, String(nextMuted));

    if (trackPlayerActiveRef.current) {
      await bridgeSetVolume(volumeRef.current, nextMuted);
      return;
    }

    // HiddenAudio has no volume API; mute state is persisted for RNTP / UI only.
  }, [setStoredValueIfChanged]);

  const toggleShuffle = useCallback(() => {
    setShuffle((prev) => {
      const next = !prev;
      shuffleRef.current = next;
      setStoredValueIfChanged(SHUFFLE_KEY, String(next));
      logShuffleState(next, {
        previous: prev,
        queueLength: activeQueueRef.current.length,
      });
      return next;
    });
  }, [setStoredValueIfChanged]);

  const toggleRepeatMode = useCallback(() => {
    setRepeatMode((prev) => {
      const next: RepeatMode =
        prev === "off" ? "one" : prev === "one" ? "all" : "off";

      repeatModeRef.current = next;
      setStoredValueIfChanged(REPEAT_MODE_KEY, next);
      void bridgeSyncRepeatMode(next);
      logRepeatModeState(next, {
        previous: prev,
        queueLength: activeQueueRef.current.length,
      });

      return next;
    });
  }, [setStoredValueIfChanged]);

  const toggleSmartAutoplay = useCallback(async () => {
    const next = !smartAutoplayEnabledRef.current;

    smartAutoplayEnabledRef.current = next;
    setSmartAutoplayEnabled(next);

    await setStoredValueIfChanged(SMART_AUTOPLAY_KEY, String(next));
  }, [setStoredValueIfChanged]);

  const toggleFavorite = useCallback(
    async (song: AppSong) => {
      if (!song?.id) return;

      const normalizedSong = normalizeSong(song);
      const exists = favorites.some((item) => item.id === normalizedSong.id);

      const updated = exists
        ? favorites.filter((item) => item.id !== normalizedSong.id)
        : [normalizedSong, ...favorites];

      setFavorites(updated);
      await setStoredValueIfChanged(FAVORITES_KEY, JSON.stringify(updated));
    },
    [favorites, normalizeSong, setStoredValueIfChanged]
  );

  const isFavorite = useCallback(
    (song: AppSong | null) => {
      if (!song?.id) return false;

      const normalizedId = makeSafeSongId(song);
      return favorites.some((item) => item.id === normalizedId);
    },
    [favorites, makeSafeSongId]
  );

  const clearActiveQueue = useCallback(async () => {
    setActiveQueue([]);
    setActiveQueueIndex(0);
    setActiveQueueMode("standard");

    activeQueueRef.current = [];
    activeQueueIndexRef.current = 0;
    activeQueueModeRef.current = "standard";

    await removeStoredValues([
      ACTIVE_QUEUE_KEY,
      ACTIVE_QUEUE_INDEX_KEY,
      ACTIVE_QUEUE_MODE_KEY,
    ]);
  }, [removeStoredValues]);

  const restoreSavedDataLight = useCallback(async () => {
    logPlayerContextDev("[startup-ready] restore-light-start");

    try {
      const [
        savedSong,
        savedPosition,
        savedRepeatMode,
        savedShuffle,
        savedVolume,
        savedMuted,
        savedSmartAutoplay,
      ] = await Promise.all([
        AsyncStorage.getItem(CURRENT_SONG_KEY),
        AsyncStorage.getItem(POSITION_KEY),
        AsyncStorage.getItem(REPEAT_MODE_KEY),
        AsyncStorage.getItem(SHUFFLE_KEY),
        AsyncStorage.getItem(VOLUME_KEY),
        AsyncStorage.getItem(MUTED_KEY),
        AsyncStorage.getItem(SMART_AUTOPLAY_KEY),
      ]);

      const smartEnabled = savedSmartAutoplay !== "false";
      setSmartAutoplayEnabled(smartEnabled);
      smartAutoplayEnabledRef.current = smartEnabled;

      if (savedSong) {
        const parsedSong = normalizeSong(JSON.parse(savedSong));

        if (!isYouTubeSong(parsedSong)) {
          setCurrentSong(parsedSong);
          currentSongRef.current = parsedSong;
        }
      }

      if (savedPosition) {
        const millis = Number(savedPosition);
        if (!Number.isNaN(millis)) {
          positionMillisRef.current = millis;
          lastSavedPositionRef.current = millis;
          setPositionMillisState(millis);
        }
      }

      if (
        savedRepeatMode === "off" ||
        savedRepeatMode === "one" ||
        savedRepeatMode === "all"
      ) {
        setRepeatMode(savedRepeatMode);
        repeatModeRef.current = savedRepeatMode;
      }

      if (savedShuffle === "true") {
        setShuffle(true);
        shuffleRef.current = true;
      }

      if (savedVolume) {
        const parsedVolume = Number(savedVolume);
        if (!Number.isNaN(parsedVolume)) {
          setVolumeState(parsedVolume);
          volumeRef.current = parsedVolume;
        }
      }

      if (savedMuted === "true") {
        setIsMuted(true);
        isMutedRef.current = true;
      }
    } catch (error) {
      logPlayerContextError("Restore player data (light) error:", error);
    } finally {
      logPlayerContextDev("[startup-ready] restore-light-end");
    }
  }, [normalizeSong, isYouTubeSong]);

  const restoreSavedDataHeavy = useCallback(async () => {
    logPlayerContextDev("[startup-ready] restore-heavy-start");

    try {
      const [
        savedFavorites,
        savedQueue,
        savedIndex,
        savedRadioMode,
        savedRadioIndex,
        savedActiveQueue,
        savedActiveQueueIndex,
        savedActiveQueueMode,
      ] = await Promise.all([
        AsyncStorage.getItem(FAVORITES_KEY),
        AsyncStorage.getItem(YOUTUBE_QUEUE_KEY),
        AsyncStorage.getItem(YOUTUBE_QUEUE_INDEX_KEY),
        AsyncStorage.getItem(RADIO_MODE_KEY),
        AsyncStorage.getItem(RADIO_INDEX_KEY),
        AsyncStorage.getItem(ACTIVE_QUEUE_KEY),
        AsyncStorage.getItem(ACTIVE_QUEUE_INDEX_KEY),
        AsyncStorage.getItem(ACTIVE_QUEUE_MODE_KEY),
      ]);

      const [savedRadioQueue, upgradedRecent] = await Promise.all([
        loadRadioQueue(),
        loadRecentlyPlayed(),
      ]);

      if (savedFavorites) {
        const parsedFavorites = JSON.parse(savedFavorites);
        if (Array.isArray(parsedFavorites)) {
          setFavorites(parsedFavorites.map(normalizeSong));
        }
      }

      await yieldToNextFrame();

      if (savedQueue) {
        const parsedQueue = JSON.parse(savedQueue);
        if (Array.isArray(parsedQueue)) {
          const normalizedQueue = parsedQueue.map(normalizeYouTubeTrack);
          setYouTubeQueue(normalizedQueue);
          youtubeQueueRef.current = normalizedQueue;
        }
      }

      if (savedIndex) {
        const parsedIndex = Number(savedIndex);
        if (!Number.isNaN(parsedIndex)) {
          setYouTubeQueueIndex(parsedIndex);
          youtubeQueueIndexRef.current = parsedIndex;
        }
      }

      if (savedRadioQueue.length > 0) {
        setRadioQueue(savedRadioQueue);
        radioQueueRef.current = savedRadioQueue;
      }

      if (savedRadioMode === "true") {
        setRadioMode(true);
        radioModeRef.current = true;
      }

      if (savedRadioIndex) {
        const parsedRadioIndex = Number(savedRadioIndex);
        if (!Number.isNaN(parsedRadioIndex)) {
          setRadioIndex(parsedRadioIndex);
          radioIndexRef.current = parsedRadioIndex;
        }
      }

      await yieldToNextFrame();

      if (savedActiveQueue) {
        const parsedActiveQueue = JSON.parse(savedActiveQueue);

        if (Array.isArray(parsedActiveQueue)) {
          const normalizedQueue = parsedActiveQueue
            .map(normalizeSong)
            .filter((song) => !isYouTubeSong(song));

          const parsedActiveIndex = Number(savedActiveQueueIndex || 0);
          const safeMode: ActiveQueueMode =
            savedActiveQueueMode === "radio" ||
            savedActiveQueueMode === "standard" ||
            savedActiveQueueMode === "smart" ||
            savedActiveQueueMode === "live_stream" ||
            savedActiveQueueMode === "podcast"
              ? savedActiveQueueMode
              : "standard";

          if (normalizedQueue.length > 0) {
            const safeIndex = Number.isNaN(parsedActiveIndex)
              ? 0
              : Math.max(
                  0,
                  Math.min(parsedActiveIndex, normalizedQueue.length - 1)
                );

            setActiveQueue(normalizedQueue);
            activeQueueRef.current = normalizedQueue;

            setActiveQueueIndex(safeIndex);
            activeQueueIndexRef.current = safeIndex;

            setActiveQueueMode(safeMode);
            activeQueueModeRef.current = safeMode;
          }
        }
      }

      await yieldToNextFrame();

      setRecentlyPlayed(upgradedRecent);
    } catch (error) {
      logPlayerContextError("Restore player data (heavy) error:", error);
    } finally {
      markPlaybackRestoreComplete();
      logPlayerContextDev("[startup-ready] restore-heavy-end");
    }
  }, [normalizeSong, isYouTubeSong, normalizeYouTubeTrack]);

  useEffect(() => {
    if (!isTrackPlayerFeatureEnabled()) return;

    const bridgeListenerId = `bridge_events_${Date.now()}`;
    recordListenerRegister("player_bridge_events", bridgeListenerId);

    const unsubscribeBridgeEvents = subscribeBridgeEvents({
      onProgress: (progress) => {
        if (!trackPlayerActiveRef.current) return;

        recordRuntimePlaybackProgressUpdate("track_player", appStateRef.current);

        const now = Date.now();
        const previousPosition = positionMillisRef.current;

        positionMillisRef.current = progress.positionMillis;

        const positionStateMinMs = getPositionStateUpdateMinMs(
          appStateRef.current
        );

        if (
          now - lastPositionStateUpdateRef.current >= positionStateMinMs ||
          Math.abs(progress.positionMillis - previousPosition) > 1800
        ) {
          lastPositionStateUpdateRef.current = now;
          recordPlaybackProgressUpdate();
          recordPlaybackReactStateUpdate("position");
          setPositionMillisState(progress.positionMillis);
        }

        if (progress.durationMillis > 0) {
          if (
            Math.abs(progress.durationMillis - durationMillisRef.current) >=
            DURATION_UPDATE_THRESHOLD_MS
          ) {
            durationMillisRef.current = progress.durationMillis;
            lastDurationStateUpdateRef.current = now;
            recordPlaybackReactStateUpdate("duration");
            setDurationMillisState(progress.durationMillis);
          }
        }

        if (progress.isPlaying !== isPlayingRef.current) {
          isPlayingRef.current = progress.isPlaying;
          recordPlaybackReactStateUpdate("is_playing");
          setIsPlayingState(progress.isPlaying);
        }

        if (
          !isTvPlayerOpen() &&
          now - lastPositionSaveRef.current > POSITION_SAVE_INTERVAL_MS &&
          Math.abs(progress.positionMillis - lastSavedPositionRef.current) >=
            POSITION_SAVE_DISTANCE_MS
        ) {
          lastPositionSaveRef.current = now;
          void savePlaybackPosition(progress.positionMillis);
        }

      },
      onActiveTrackChanged: (index) => {
        if (!trackPlayerActiveRef.current || index === null) return;
        if (isChangingTrackRef.current) return;

        syncStateFromTrackPlayerIndex(index);
        autoAdvanceRef.current = false;
        isPlayingRef.current = true;
        setIsPlayingState(true);

        const { queue } = getActiveQueuePlaybackState();
        void persistActiveQueue(queue, index, activeQueueModeRef.current);
        void removeStoredValues([POSITION_KEY]);
      },
      onQueueEnded: () => {
        if (!trackPlayerActiveRef.current) return;
        if (repeatModeRef.current !== "off") return;

        void advanceTrackPlayerQueueFromJs("native_queue_ended");
      },
      onPlaybackError: (message) => {
        logPlayerContextError("TrackPlayer playback error:", message);
      },
    });

    return () => {
      recordListenerUnregister("player_bridge_events", bridgeListenerId);
      unsubscribeBridgeEvents();
    };
  }, [
    savePlaybackPosition,
    syncStateFromTrackPlayerIndex,
    getActiveQueuePlaybackState,
    persistActiveQueue,
    removeStoredValues,
    advanceTrackPlayerQueueFromJs,
  ]);

  useEffect(() => {
    isMountedRef.current = true;

    configureAudio("player_mount");

    const cancelRestoreLightTask = scheduleStartupTask(
      "background",
      "player_restore_saved_data_light",
      async () => {
        await restoreSavedDataLight();
      }
    );

    const cancelRestoreHeavyTask = scheduleStartupTask(
      "deferred",
      "player_restore_saved_data_heavy",
      async () => {
        await restoreSavedDataHeavy();
      }
    );

    return () => {
      cancelRestoreLightTask();
      cancelRestoreHeavyTask();
      isMountedRef.current = false;
      loadRequestIdRef.current += 1;
      clearFinishWatchdog();
      if (positionPersistTimerRef.current) {
        clearTimeout(positionPersistTimerRef.current);
        positionPersistTimerRef.current = null;
      }
      if (activeQueuePersistTimerRef.current) {
        clearTimeout(activeQueuePersistTimerRef.current);
        activeQueuePersistTimerRef.current = null;
      }
      stopHiddenAudioPolling();
      unloadCurrentSound();
    };
  }, [
    configureAudio,
    restoreSavedDataLight,
    restoreSavedDataHeavy,
    unloadCurrentSound,
    stopHiddenAudioPolling,
    clearFinishWatchdog,
  ]);

  useEffect(() => {
    const appStateListenerId = `app_state_${Date.now()}`;
    recordListenerRegister("app_state", appStateListenerId);

    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      recordAppStateTransition(previousState, nextState);

      logBackgroundStateChange(previousState, nextState, {
        songId: currentSongRef.current?.id,
        isPlaying: isPlayingRef.current,
      });

      // iOS lock often goes active -> inactive -> background. Re-applying audio mode on
      // inactive disrupts the shared AVAudioSession and can stop RNTP/HiddenAudio mid-song.
      if (nextState === "inactive" && previousState === "active") {
        savePlaybackPosition(positionMillisRef.current, { immediate: true });
      }

      if (nextState === "background" && previousState !== "background") {
        savePlaybackPosition(positionMillisRef.current, { immediate: true });

        // RNTP is already playing — avoid audio session / updateOptions churn on lock.
        if (trackPlayerActiveRef.current && isPlayingRef.current) {
          recordBackgroundChurnSkipped("rntp_active_playing");
          return;
        }

        configureAudio("app_state_background");
        void applyProgressUpdateInterval("app_state_background");

        if (isPlayingRef.current && hiddenAudioLoadedRef.current) {
          armFinishWatchdog(
            positionMillisRef.current,
            durationMillisRef.current,
            true
          );
          void catchUpPlaybackIfEnded();
        }
      }

      if (nextState === "active") {
        configureAudio("app_state_active");
        void applyProgressUpdateInterval("app_state_active");
        void catchUpPlaybackIfEnded();
        void flushPendingSmartExtend();
      }
    });

    return () => {
      subscription.remove();
      recordListenerUnregister("app_state", appStateListenerId);
    };
  }, [
    configureAudio,
    savePlaybackPosition,
    applyProgressUpdateInterval,
    armFinishWatchdog,
    catchUpPlaybackIfEnded,
    flushPendingSmartExtend,
  ]);

  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    shuffleRef.current = shuffle;
  }, [shuffle]);

  useEffect(() => {
    smartAutoplayEnabledRef.current = smartAutoplayEnabled;
  }, [smartAutoplayEnabled]);

  useEffect(() => {
    activeQueueRef.current = activeQueue;
  }, [activeQueue]);

  useEffect(() => {
    activeQueueIndexRef.current = activeQueueIndex;
  }, [activeQueueIndex]);

  useEffect(() => {
    activeQueueModeRef.current = activeQueueMode;
  }, [activeQueueMode]);

  useEffect(() => {
    youtubeQueueRef.current = youtubeQueue;
  }, [youtubeQueue]);

  useEffect(() => {
    youtubeQueueIndexRef.current = youtubeQueueIndex;
  }, [youtubeQueueIndex]);

  useEffect(() => {
    radioQueueRef.current = radioQueue;
  }, [radioQueue]);

  useEffect(() => {
    radioModeRef.current = radioMode;
  }, [radioMode]);

  useEffect(() => {
    radioIndexRef.current = radioIndex;
  }, [radioIndex]);

  const actionsValue = useMemo(
    () => ({
      playSong,
      playQueue,
      playAudiusTrack,
      playYouTubeQueue,
      startRadio,
      startPersonalRadio,
      playNextRadioTrack,
      stopRadio,
      togglePlayPause,
      stopPlayback,
      nextSong,
      previousSong,
      replayCurrentTrack,
      seekRelative,
      seekTo,
      setVolume,
      toggleMute,
      toggleShuffle,
      toggleRepeatMode,
      toggleSmartAutoplay,
      toggleFavorite,
      isFavorite,
      clearActiveQueue,
      preloadIdlePlayableTrack,
    }),
    [
      playSong,
      playQueue,
      playAudiusTrack,
      playYouTubeQueue,
      startRadio,
      startPersonalRadio,
      playNextRadioTrack,
      stopRadio,
      togglePlayPause,
      stopPlayback,
      nextSong,
      previousSong,
      replayCurrentTrack,
      seekRelative,
      seekTo,
      setVolume,
      toggleMute,
      toggleShuffle,
      toggleRepeatMode,
      toggleSmartAutoplay,
      toggleFavorite,
      isFavorite,
      clearActiveQueue,
      preloadIdlePlayableTrack,
    ]
  );

  const stateValue = useMemo(
    () => ({
      currentSong,
      isPlaying,
      isLoading,
      volume,
      isMuted,
      shuffle,
      repeatMode,
      smartAutoplayEnabled,
      currentLyrics,
      currentSyncedLyrics,
      songs,
      onlineSongs,
      activeQueue,
      activeQueueIndex,
      activeQueueMode,
      favorites,
      recentlyPlayed,
      youtubeQueue,
      youtubeQueueIndex,
      radioQueue,
      radioMode,
      radioIndex,
    }),
    [
      currentSong,
      isPlaying,
      isLoading,
      volume,
      isMuted,
      shuffle,
      repeatMode,
      smartAutoplayEnabled,
      currentLyrics,
      currentSyncedLyrics,
      songs,
      onlineSongs,
      activeQueue,
      activeQueueIndex,
      activeQueueMode,
      favorites,
      recentlyPlayed,
      youtubeQueue,
      youtubeQueueIndex,
      radioQueue,
      radioMode,
      radioIndex,
    ]
  );

  const progressValue = useMemo(
    () => ({
      positionMillis,
      durationMillis,
      position: positionMillis,
      duration: durationMillis,
      currentLyricLine,
    }),
    [positionMillis, durationMillis, currentLyricLine]
  );

  useCpuContextProbe(
    "PlayerState",
    `${currentSong?.id || "none"}:${isPlaying ? 1 : 0}:${isLoading ? 1 : 0}`
  );
  useCpuContextProbe(
    "PlayerProgress",
    `${Math.floor(positionMillis / 5000)}:${Math.floor(durationMillis / 1000)}`
  );

  return (
    <PlayerActionsContext.Provider value={actionsValue}>
      <PlayerStateContext.Provider value={stateValue}>
        <PlayerProgressContext.Provider value={progressValue}>
          <NowPlayingStoreSync />
          {children}
        </PlayerProgressContext.Provider>
      </PlayerStateContext.Provider>
    </PlayerActionsContext.Provider>
  );
}

export {
  usePlayer,
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerProgress,
  usePlayerState,
  useStablePlayerAction,
  useTrackPlaybackStatus,
} from "./playerContextSlices";

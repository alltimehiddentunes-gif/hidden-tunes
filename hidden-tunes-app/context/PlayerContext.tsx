import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Audio,
  AVPlaybackStatus,
  InterruptionModeAndroid,
  InterruptionModeIOS,
} from "expo-av";
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus, InteractionManager } from "react-native";

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
  saveSmartQueue,
} from "../services/smartQueue";
import { isTrackPlayerFeatureEnabled } from "../constants/playbackConfig";
import {
  activateTrackPlayerPlayback,
  bridgeGetActiveIndex,
  bridgeGetProgress,
  bridgeResetPlayback,
  bridgeSeekTo,
  bridgeSetProgressInterval,
  bridgeSetVolume,
  bridgeSkipToNext,
  bridgeSkipToPrevious,
  bridgeSyncRepeatMode,
  bridgeTogglePlayPause,
  shouldUseTrackPlayerPlayback,
  subscribeBridgeEvents,
} from "../services/playbackBridge";
import { getArtworkValue } from "../utils/artwork";
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
  logPlaybackStarted,
  logPlaybackStalled,
  logQueueIndexMismatch,
  logRepeatModeState,
  logShuffleState,
  logTapToPlayStart,
  logTrackFinished,
} from "../utils/playbackDiagnostics";
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
import {
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
type ActiveQueueMode = "standard" | "youtube" | "radio" | "smart";

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

  playSong: (song: AppSong, queue?: AppSong[], index?: number) => Promise<void>;
  playQueue: (queue: AppSong[], startIndex?: number) => Promise<void>;
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
  seekTo: (millis: number) => Promise<void>;
  setVolume: (value: number) => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleShuffle: () => void;
  toggleRepeatMode: () => void;
  toggleSmartAutoplay: () => Promise<void>;
  toggleFavorite: (song: AppSong) => Promise<void>;
  isFavorite: (song: AppSong | null) => boolean;
  clearActiveQueue: () => Promise<void>;
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

const PLAYBACK_UPDATE_INTERVAL_MS = 2000;
const PLAYBACK_UPDATE_INTERVAL_BACKGROUND_MS = 2000;
const POSITION_STATE_UPDATE_MIN_MS = 2000;
const POSITION_STATE_UPDATE_BACKGROUND_MS = 2000;
const POSITION_SAVE_INTERVAL_MS = 12000;
const POSITION_SAVE_DISTANCE_MS = 5000;
const DURATION_UPDATE_THRESHOLD_MS = 1500;
const TRACK_END_THRESHOLD_MS = 750;
const MIN_DURATION_FOR_POSITION_FINISH_MS = 4000;
const PRELOAD_BEFORE_END_MS = 15000;
const FINISH_DEBOUNCE_MS = 1500;
const FINISH_WATCHDOG_GRACE_MS = 650;
const FINISH_WATCHDOG_MIN_DELAY_MS = 350;
const FINISH_WATCHDOG_MAX_DELAY_MS = 30000;

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
  if (!input || typeof input !== "string") return [];

  return input
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/);
      if (!match) return null;

      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ? Number(match[3].padEnd(3, "0")) : 0;
      const text = match[4]?.trim() || "";

      if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;

      return {
        time: minutes * 60 * 1000 + seconds * 1000 + fraction,
        text,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a!.time - b!.time) as SyncedLyricLine[];
}

function getCurrentLyricLine(
  lines: SyncedLyricLine[],
  positionMillis: number
): SyncedLyricLine | null {
  if (!lines.length) return null;

  let current: SyncedLyricLine | null = null;

  for (const line of lines) {
    if (line.time <= positionMillis + 150) current = line;
    else break;
  }

  return current;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const isChangingTrackRef = useRef(false);
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const inFlightPlaySongIdRef = useRef<string | null>(null);
  const queueTransitionRef = useRef(false);
  const autoAdvanceRef = useRef(false);
  const lastFinishEventRef = useRef({
    songId: "",
    handledAt: 0,
  });
  const loadAndPlayRef = useRef<((song: AppSong) => Promise<void>) | null>(
    null
  );
  const extendQueueWithSmartTracksRef = useRef<(() => Promise<boolean>) | null>(
    null
  );
  const unloadPromiseRef = useRef<Promise<void> | null>(null);
  const lastPositionSaveRef = useRef(0);
  const lastSavedPositionRef = useRef(0);
  const lastPositionStateUpdateRef = useRef(0);
  const lastActiveQueuePersistRef = useRef("");
  const lastCurrentSongPersistRef = useRef("");
  const storageValueCacheRef = useRef<Record<string, string>>({});
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const preloadedSoundRef = useRef<Audio.Sound | null>(null);
  const preloadedSongIdRef = useRef<string | null>(null);
  const preloadInFlightRef = useRef(false);
  const pendingSmartExtendRef = useRef(false);
  const trackPlayerActiveRef = useRef(false);
  const handleTrackFinishedRef = useRef<(() => Promise<void>) | null>(null);
  const finishWatchdogTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const finishWatchdogSongIdRef = useRef("");

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

  const savePlaybackPosition = useCallback(async (millis: number) => {
    const safeMillis = Math.max(0, Math.floor(millis || 0));

    try {
      lastSavedPositionRef.current = safeMillis;
      storageValueCacheRef.current[POSITION_KEY] = String(safeMillis);
      await AsyncStorage.setItem(POSITION_KEY, String(safeMillis));
    } catch (error) {
      console.log("Save playback position error:", error);
    }
  }, []);

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

  const currentSyncedLyrics = useMemo(() => {
    return (
      currentSong?.parsedLyrics ||
      parseSyncedLyrics(
        currentSong?.syncedLyrics ||
          currentSong?.synced_lyrics ||
          currentSong?.lrc
      )
    );
  }, [
    currentSong?.parsedLyrics,
    currentSong?.syncedLyrics,
    currentSong?.synced_lyrics,
    currentSong?.lrc,
  ]);

  const currentLyricLine = useMemo(() => {
    return getCurrentLyricLine(currentSyncedLyrics, positionMillis);
  }, [currentSyncedLyrics, positionMillis]);

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

  const configureAudio = useCallback(async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
    } catch (error) {
      console.log("Configure audio error:", error);
    }
  }, []);

  const clearPreloadedSound = useCallback(async () => {
    const preloaded = preloadedSoundRef.current;
    preloadedSoundRef.current = null;
    preloadedSongIdRef.current = null;
    preloadInFlightRef.current = false;

    if (!preloaded) return;

    try {
      preloaded.setOnPlaybackStatusUpdate(null);

      try {
        await preloaded.stopAsync();
      } catch {}

      await preloaded.unloadAsync();
    } catch (error) {
      console.log("Clear preloaded sound error:", error);
    }
  }, []);

  const unloadCurrentSound = useCallback(async () => {
    if (trackPlayerActiveRef.current) {
      trackPlayerActiveRef.current = false;
      await bridgeResetPlayback();
      return;
    }

    if (unloadPromiseRef.current) {
      await unloadPromiseRef.current;
      return;
    }

    const sound = soundRef.current;
    soundRef.current = null;

    if (!sound) return;

    unloadPromiseRef.current = (async () => {
      try {
        sound.setOnPlaybackStatusUpdate(null);

        try {
          await sound.stopAsync();
        } catch {}

        await sound.unloadAsync();
      } catch (error) {
        console.log("Unload sound error:", error);
      } finally {
        unloadPromiseRef.current = null;
      }
    })();

    await unloadPromiseRef.current;
  }, []);

  const applyProgressUpdateInterval = useCallback(async () => {
    if (trackPlayerActiveRef.current) {
      await bridgeSetProgressInterval(appStateRef.current);
      return;
    }

    const sound = soundRef.current;
    if (!sound) return;

    try {
      await sound.setStatusAsync({
        progressUpdateIntervalMillis: getProgressUpdateIntervalMs(
          appStateRef.current
        ),
      });
    } catch (error) {
      console.log("Apply progress update interval error:", error);
    }
  }, []);

  const saveCurrentSong = useCallback(
    async (song: AppSong) => {
      if (isYouTubeSong(song)) return;

      try {
        const serialized = JSON.stringify(song);

        if (lastCurrentSongPersistRef.current === serialized) return;

        lastCurrentSongPersistRef.current = serialized;
        await setStoredValueIfChanged(CURRENT_SONG_KEY, serialized);
      } catch (error) {
        console.log("Save current song error:", error);
      }
    },
    [isYouTubeSong, setStoredValueIfChanged]
  );

  const saveRecentlyPlayed = useCallback(async (song: AppSong) => {
    try {
      const updated = await addToRecentlyPlayed(song);
      setRecentlyPlayed(updated);
    } catch (error) {
      console.log("Add recently played error:", error);
    }
  }, []);

  const savePlaybackSideEffects = useCallback(
    (song: AppSong) => {
      void saveCurrentSong(song);
      void saveRecentlyPlayed(song);
      void addToSmartQueue(song as any).catch((error) => {
        console.log("Add smart queue error:", error);
      });
    },
    [saveCurrentSong, saveRecentlyPlayed]
  );

  const persistActiveQueue = useCallback(
    async (queue: AppSong[], index: number, mode: ActiveQueueMode) => {
      try {
        const normalizedQueue = queue.map(normalizeSong);
        const serializedQueue = JSON.stringify(normalizedQueue);
        const persistKey = `${serializedQueue}|${index}|${mode}`;

        if (lastActiveQueuePersistRef.current === persistKey) return;

        lastActiveQueuePersistRef.current = persistKey;

        await AsyncStorage.multiSet([
          [ACTIVE_QUEUE_KEY, serializedQueue],
          [ACTIVE_QUEUE_INDEX_KEY, String(index)],
          [ACTIVE_QUEUE_MODE_KEY, mode],
        ]);

        storageValueCacheRef.current[ACTIVE_QUEUE_KEY] = serializedQueue;
        storageValueCacheRef.current[ACTIVE_QUEUE_INDEX_KEY] = String(index);
        storageValueCacheRef.current[ACTIVE_QUEUE_MODE_KEY] = mode;
      } catch (error) {
        console.log("Persist active queue error:", error);
      }
    },
    [normalizeSong]
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

      await persistActiveQueue(normalizedQueue, safeIndex, mode);
      await saveSmartQueue(normalizedQueue as any);
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
        console.log("Persist YouTube queue error:", error);
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
        console.log("Persist radio state error:", error);
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
    if (queueTransitionRef.current) return;

    queueTransitionRef.current = true;

    try {
      await transition();
    } finally {
      queueTransitionRef.current = false;
    }
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

      const playableUri = getPlayableUri(upcomingSong);

      if (!playableUri && !upcomingSong.audio) return;

      preloadInFlightRef.current = true;

      try {
        await clearPreloadedSound();

        const source = upcomingSong.audio
          ? upcomingSong.audio
          : { uri: playableUri! };

        const { sound } = await Audio.Sound.createAsync(source, {
          shouldPlay: false,
          volume: 0,
        });

        if (preloadedSoundRef.current) {
          try {
            await sound.unloadAsync();
          } catch {}

          return;
        }

        preloadedSoundRef.current = sound;
        preloadedSongIdRef.current = upcomingSong.id;
      } catch (error) {
        console.log("Preload upcoming track error:", error);
      } finally {
        preloadInFlightRef.current = false;
      }
    },
    [clearPreloadedSound, getPlayableUri]
  );

  const takePreloadedSound = useCallback(async (songId: string) => {
    if (preloadedSongIdRef.current !== songId || !preloadedSoundRef.current) {
      return null;
    }

    const sound = preloadedSoundRef.current;
    preloadedSoundRef.current = null;
    preloadedSongIdRef.current = null;
    preloadInFlightRef.current = false;

    return sound;
  }, []);

  const clearFinishWatchdog = useCallback(() => {
    if (finishWatchdogTimeoutRef.current) {
      clearTimeout(finishWatchdogTimeoutRef.current);
      finishWatchdogTimeoutRef.current = null;
    }

    finishWatchdogSongIdRef.current = "";
  }, []);

  const nextSong = useCallback(async () => {
    logAutoNextAttempt({
      source: "nextSong",
      repeatMode: repeatModeRef.current,
      shuffle: shuffleRef.current,
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
          if (!smartAutoplayEnabledRef.current) {
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
          await bridgeSkipToNext();
          const activeIndex = await bridgeGetActiveIndex();

          if (activeIndex !== null) {
            syncStateFromTrackPlayerIndex(activeIndex);
            void persistActiveQueue(queue, activeIndex, activeQueueModeRef.current);
            void removeStoredValues([POSITION_KEY]);
          }
        } catch (error) {
          console.log("TrackPlayer next error:", error);
          logAutoNextFailure({ reason: "track_player_next_error" });
        }
      });

      return;
    }

    await runQueueTransition(async () => {
      const { queue, safeIndex: currentIndex } = getActiveQueuePlaybackState();

      if (!queue.length) {
        logAutoNextSkipped("queue_empty", { source: "nextSong_expo_av" });
        return;
      }

      const nextIndex = getNextQueueIndex(
        currentIndex,
        queue.length
      );

      if (nextIndex === -1) {
        if (!smartAutoplayEnabledRef.current) {
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
  ]);

  const handleTrackFinished = useCallback(async () => {
    logTrackFinished({
      songId: currentSongRef.current?.id,
      repeatMode: repeatModeRef.current,
    });

    try {
      if (repeatModeRef.current === "one") {
        logAutoNextSkipped("repeat_one", {
          songId: currentSongRef.current?.id,
        });

        const activeSound = soundRef.current;

        if (activeSound) {
          await activeSound.setPositionAsync(0);
          await activeSound.playAsync();
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
      clearFinishWatchdog();
      autoAdvanceRef.current = false;
    }
  }, [nextSong, removeStoredValues, setIsPlaying, clearFinishWatchdog]);

  handleTrackFinishedRef.current = handleTrackFinished;

  const scheduleTrackAdvance = useCallback(() => {
    if (isChangingTrackRef.current || autoAdvanceRef.current) {
      logAutoNextSkipped(
        isChangingTrackRef.current ? "already_changing_track" : "already_advancing",
        { songId: currentSongRef.current?.id }
      );
      return;
    }

    if (!soundRef.current && !trackPlayerActiveRef.current) {
      logAutoNextSkipped("sound_unloaded", { songId: currentSongRef.current?.id });
      return;
    }

    logAutoNextAttempt({
      source: "scheduleTrackAdvance",
      songId: currentSongRef.current?.id,
      repeatMode: repeatModeRef.current,
      shuffle: shuffleRef.current,
    });

    if (finishWatchdogTimeoutRef.current) {
      clearTimeout(finishWatchdogTimeoutRef.current);
      finishWatchdogTimeoutRef.current = null;
    }

    finishWatchdogSongIdRef.current = "";

    const songId = currentSongRef.current?.id || "";
    const now = Date.now();

    if (
      lastFinishEventRef.current.songId === songId &&
      now - lastFinishEventRef.current.handledAt < FINISH_DEBOUNCE_MS
    ) {
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
  }, []);

  const armFinishWatchdog = useCallback(
    (position: number, duration: number, playing: boolean) => {
      if (trackPlayerActiveRef.current) return;

      if (
        !playing ||
        repeatModeRef.current === "one" ||
        duration < MIN_DURATION_FOR_POSITION_FINISH_MS ||
        position <= 0 ||
        position >= duration
      ) {
        clearFinishWatchdog();
        return;
      }

      const songId = currentSongRef.current?.id || "";
      if (!songId) {
        clearFinishWatchdog();
        return;
      }

      const remainingMs = duration - position;
      const delay = Math.max(
        FINISH_WATCHDOG_MIN_DELAY_MS,
        Math.min(
          remainingMs + FINISH_WATCHDOG_GRACE_MS,
          FINISH_WATCHDOG_MAX_DELAY_MS
        )
      );

      if (finishWatchdogTimeoutRef.current) {
        clearTimeout(finishWatchdogTimeoutRef.current);
      }

      finishWatchdogSongIdRef.current = songId;
      logFinishWatchdogArmed({
        songId,
        delayMs: delay,
        position,
        duration,
      });

      finishWatchdogTimeoutRef.current = setTimeout(() => {
        finishWatchdogTimeoutRef.current = null;

        if (finishWatchdogSongIdRef.current !== currentSongRef.current?.id) {
          return;
        }

        const sound = soundRef.current;
        if (!sound || isChangingTrackRef.current || autoAdvanceRef.current) {
          logAutoNextSkipped(
            !sound ? "sound_unloaded" : "already_changing_or_advancing",
            { source: "finish_watchdog" }
          );
          return;
        }

        logFinishWatchdogFired({
          songId: currentSongRef.current?.id,
        });

        void sound
          .getStatusAsync()
          .then((status) => {
            if (
              !status.isLoaded ||
              finishWatchdogSongIdRef.current !== currentSongRef.current?.id
            ) {
              return;
            }

            const statusPosition = status.positionMillis || 0;
            const statusDuration = status.durationMillis || duration;
            const nearEnd =
              statusDuration >= MIN_DURATION_FOR_POSITION_FINISH_MS &&
              statusPosition >= statusDuration - TRACK_END_THRESHOLD_MS;

            if (status.didJustFinish || (!status.isPlaying && nearEnd)) {
              scheduleTrackAdvance();
              return;
            }

            if (status.isPlaying && nearEnd) {
              armFinishWatchdog(statusPosition, statusDuration, true);
              return;
            }

            armFinishWatchdog(statusPosition, statusDuration, status.isPlaying);
          })
          .catch((error) => {
            console.log("Finish watchdog error:", error);
          });
      }, delay);
    },
    [clearFinishWatchdog, scheduleTrackAdvance]
  );

  const flushPendingSmartExtend = useCallback(async () => {
    if (!pendingSmartExtendRef.current) return;

    pendingSmartExtendRef.current = false;

    if (!smartAutoplayEnabledRef.current) return;

    const { queue, safeIndex } = getActiveQueuePlaybackState();

    if (!queue.length) return;

    if (getNextQueueIndex(safeIndex, queue.length) >= 0) {
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
    setIsPlaying,
  ]);

  const catchUpPlaybackIfEnded = useCallback(async () => {
    if (trackPlayerActiveRef.current) {
      try {
        const progress = await bridgeGetProgress();

        if (
          repeatModeRef.current !== "one" &&
          progress.durationMillis >= MIN_DURATION_FOR_POSITION_FINISH_MS &&
          progress.positionMillis >=
            progress.durationMillis - TRACK_END_THRESHOLD_MS
        ) {
          scheduleTrackAdvance();
        }
      } catch (error) {
        console.log("TrackPlayer catch up error:", error);
      }

      return;
    }

    const sound = soundRef.current;

    if (!sound || isChangingTrackRef.current || autoAdvanceRef.current) return;

    try {
      const status = await sound.getStatusAsync();

      if (!status.isLoaded) return;

      const position = status.positionMillis || 0;
      const duration = status.durationMillis || 0;

      if (status.didJustFinish) {
        scheduleTrackAdvance();
        return;
      }

      if (
        repeatModeRef.current !== "one" &&
        duration >= MIN_DURATION_FOR_POSITION_FINISH_MS &&
        position >= duration - TRACK_END_THRESHOLD_MS
      ) {
        scheduleTrackAdvance();
      }
    } catch (error) {
      console.log("Catch up playback error:", error);
    }
  }, [scheduleTrackAdvance]);

  const handlePlaybackStatusUpdate = useCallback(
    async (status: AVPlaybackStatus) => {
      if (trackPlayerActiveRef.current) return;
      if (!status.isLoaded) return;

      const nextPosition = status.positionMillis || 0;
      const nextDuration = status.durationMillis || 0;
      const nextIsPlaying = status.isPlaying || false;
      const previousPosition = positionMillisRef.current;
      const now = Date.now();
      const positionStateMinMs = getPositionStateUpdateMinMs(
        appStateRef.current
      );

      positionMillisRef.current = nextPosition;

      if (
        now - lastPositionStateUpdateRef.current >= positionStateMinMs ||
        Math.abs(nextPosition - previousPosition) > 1800
      ) {
        lastPositionStateUpdateRef.current = now;
        recordPlaybackProgressUpdate();
        setPositionMillisState(nextPosition);
      }

      if (
        nextDuration > 0 &&
        Math.abs(nextDuration - durationMillisRef.current) >=
          DURATION_UPDATE_THRESHOLD_MS
      ) {
        durationMillisRef.current = nextDuration;
        setDurationMillisState(nextDuration);
      }

      if (nextIsPlaying !== isPlayingRef.current) {
        isPlayingRef.current = nextIsPlaying;
        setIsPlayingState(nextIsPlaying);
      }

      armFinishWatchdog(nextPosition, nextDuration, nextIsPlaying);

      if (status.didJustFinish && !isChangingTrackRef.current) {
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
        previousPosition >= nextDuration - TRACK_END_THRESHOLD_MS * 2;

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
        now - lastPositionSaveRef.current > POSITION_SAVE_INTERVAL_MS &&
        Math.abs(nextPosition - lastSavedPositionRef.current) >=
          POSITION_SAVE_DISTANCE_MS
      ) {
        lastPositionSaveRef.current = now;
        await savePlaybackPosition(nextPosition);
      }
    },
    [
      scheduleTrackAdvance,
      armFinishWatchdog,
      getUpcomingSong,
      preloadUpcomingTrack,
      savePlaybackPosition,
    ]
  );

  const loadAndPlay = useCallback(
    async (song: AppSong) => {
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

        requestId = loadRequestIdRef.current + 1;
        loadRequestIdRef.current = requestId;
        inFlightPlaySongIdRef.current = normalizedSong.id;

        logAudioLoadStart({
          songId: normalizedSong.id,
          requestId,
        });

        autoAdvanceRef.current = false;
        clearFinishWatchdog();

        if (isYouTubeSong(normalizedSong)) {
          console.log(
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

            let playIndex = queue.findIndex((item) => item.id === normalizedSong.id);

            if (playIndex < 0) {
              playIndex = Math.max(
                0,
                Math.min(activeQueueIndexRef.current, queue.length - 1)
              );
            }

            let startPositionMillis = 0;

            if (shouldRestorePosition) {
              try {
                const savedPosition = await AsyncStorage.getItem(POSITION_KEY);
                const millis = Number(savedPosition);

                if (!Number.isNaN(millis) && millis > 0) {
                  startPositionMillis = millis;
                }
              } catch (error) {
                console.log("Restore TrackPlayer position error:", error);
              }
            }

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

            const playedIndex = await activateTrackPlayerPlayback({
              songs: queue,
              startIndex: playIndex,
              repeatMode: repeatModeRef.current,
              volume: volumeRef.current,
              muted: isMutedRef.current,
              startPositionMillis,
            });

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
          } catch (error) {
            console.log("TrackPlayer load and play error:", error);
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

        void configureAudio();

        setCurrentSong(normalizedSong);
        currentSongRef.current = normalizedSong;
        setIsPlaying(true);
        setPositionMillis(0);
        setDurationMillis(0);

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

        const playableUri = getPlayableUri(normalizedSong);

        const source = normalizedSong.audio
          ? normalizedSong.audio
          : playableUri
          ? { uri: playableUri }
          : null;

        if (!source) {
          console.log(
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

        const progressUpdateIntervalMillis = getProgressUpdateIntervalMs(
          appStateRef.current
        );
        let sound = await takePreloadedSound(normalizedSong.id);

        if (sound) {
          sound.setOnPlaybackStatusUpdate(handlePlaybackStatusUpdate);
          await sound.setStatusAsync({
            progressUpdateIntervalMillis,
            volume: isMutedRef.current ? 0 : volumeRef.current,
          });
          await sound.playAsync();
        } else {
          const created = await Audio.Sound.createAsync(
            source,
            {
              shouldPlay: true,
              volume: isMutedRef.current ? 0 : volumeRef.current,
              progressUpdateIntervalMillis,
            },
            handlePlaybackStatusUpdate
          );
          sound = created.sound;
        }

        if (loadRequestIdRef.current !== requestId || !isMountedRef.current) {
          sound.setOnPlaybackStatusUpdate(null);

          try {
            await sound.stopAsync();
          } catch {}

          await sound.unloadAsync();
          return;
        }

        soundRef.current = sound;
        logAudioLoadSuccess({
          songId: normalizedSong.id,
          requestId,
          preloaded: preloadedSongIdRef.current === normalizedSong.id,
        });

        try {
          const savedPosition = await AsyncStorage.getItem(POSITION_KEY);

          if (savedPosition && shouldRestorePosition) {
            const millis = Number(savedPosition);

            if (!Number.isNaN(millis) && millis > 0) {
              await sound.setPositionAsync(millis);
              positionMillisRef.current = millis;
              setPositionMillisState(millis);
            }
          }
        } catch (error) {
          console.log("Restore playback position error:", error);
        }

        if (loadRequestIdRef.current !== requestId || !isMountedRef.current) {
          return;
        }

        setIsPlaying(true);
        logPlaybackStarted({
          songId: normalizedSong.id,
          requestId,
        });
        savePlaybackSideEffects(normalizedSong);
        await applyProgressUpdateInterval();
      } catch (error) {
        console.log("Load and play error:", error);
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
      unloadCurrentSound,
      getActiveQueuePlaybackState,
      getPlayableUri,
      handlePlaybackStatusUpdate,
      takePreloadedSound,
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

      await loadAndPlay(song);
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

  loadAndPlayRef.current = loadAndPlay;

  const extendQueueWithSmartTracks = useCallback(async () => {
    try {
      if (!smartAutoplayEnabledRef.current) return false;

      const current = currentSongRef.current;
      if (!current) return false;

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
      console.log("Smart autoplay extend error:", error);
      return false;
    }
  }, [
    isYouTubeSong,
    normalizeSong,
    getPlayableUri,
    syncActiveQueue,
    removeStoredValues,
    loadAndPlay,
  ]);

  extendQueueWithSmartTracksRef.current = extendQueueWithSmartTracks;

  const previousSong = useCallback(async () => {
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
          console.log("TrackPlayer previous error:", error);
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
    async (queue: AppSong[], startIndex = 0) => {
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

      void syncActiveQueue(nativeQueue, safeIndex, "standard");
      void removeStoredValues([POSITION_KEY]);

      const selectedSong = nativeQueue[safeIndex];
      const currentLoadedSound = soundRef.current;

      if (currentSongRef.current?.id === selectedSong.id && currentLoadedSound) {
        try {
          const status = await currentLoadedSound.getStatusAsync();

          if (status.isLoaded) {
            if (!status.isPlaying) {
              await currentLoadedSound.playAsync();
            }

            setIsPlaying(true);
            savePlaybackSideEffects(selectedSong);
            return;
          }
        } catch {}
      }

      await loadAndPlay(selectedSong);
    },
    [
      normalizeSong,
      isYouTubeSong,
      setStoredValueIfChanged,
      syncActiveQueue,
      removeStoredValues,
      loadAndPlay,
      setIsPlaying,
      savePlaybackSideEffects,
    ]
  );

  const playSong = useCallback(
    async (song: AppSong, queue?: AppSong[], index?: number) => {
      const normalizedSong = normalizeSong(song);

      logTapToPlayStart({
        songId: normalizedSong.id,
        hasQueue: Boolean(queue?.length),
        requestedIndex: index,
      });

      if (isYouTubeSong(normalizedSong)) {
        console.log("Blocked playSong for YouTube. Route to /youtube-player instead.");
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

        await playQueue(nativeQueue, repaired.index);
        return;
      }

      const currentLoadedSound = soundRef.current;

      if (currentSongRef.current?.id === normalizedSong.id && currentLoadedSound) {
        try {
          const status = await currentLoadedSound.getStatusAsync();

          if (status.isLoaded) {
            if (!status.isPlaying) {
              await currentLoadedSound.playAsync();
            }

            setIsPlaying(true);
            savePlaybackSideEffects(normalizedSong);
            return;
          }
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
          void persistActiveQueue(
            existingQueue,
            existingIndex,
            activeQueueModeRef.current
          );
        }
      } else {
        void syncActiveQueue([normalizedSong], 0, "standard");
      }

      void removeStoredValues([POSITION_KEY]);
      await loadAndPlay(normalizedSong);
    },
    [
      normalizeSong,
      isYouTubeSong,
      playQueue,
      persistActiveQueue,
      syncActiveQueue,
      removeStoredValues,
      loadAndPlay,
      setIsPlaying,
      savePlaybackSideEffects,
    ]
  );

  const playAudiusTrack = useCallback(
    async (song: AppSong) => {
      const normalizedSong = normalizeSong(song);

      if (isYouTubeSong(normalizedSong)) {
        console.log(
          "Blocked playAudiusTrack for YouTube. Use /youtube-player WebView instead."
        );
        setIsPlaying(false);
        setIsLoading(false);
        return;
      }

      await loadAndPlay({
        ...normalizedSong,
        type: normalizedSong.type || "audius",
        isOnline: true,
      });
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
        console.log("Start radio error:", error);
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
      console.log("Start personal radio error:", error);
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
      console.log("Play next radio error:", error);
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
      isChangingTrackRef.current = true;
      pendingSmartExtendRef.current = false;
      clearFinishWatchdog();

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
      console.log("Stop playback error:", error);
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
  ]);

  const togglePlayPause = useCallback(async () => {
    if (trackPlayerActiveRef.current) {
      if (isChangingTrackRef.current) return;

      const playing = await bridgeTogglePlayPause();
      setIsPlaying(playing);
      return;
    }

    const sound = soundRef.current;

    if (isChangingTrackRef.current) return;

    if (!sound) {
      const restoredSong = currentSongRef.current;

      if (restoredSong) {
        await loadAndPlay(restoredSong);
      }

      return;
    }

    const status = await sound.getStatusAsync();

    if (!status.isLoaded) {
      const restoredSong = currentSongRef.current;

      if (restoredSong) {
        await loadAndPlay(restoredSong);
      }

      return;
    }

    if (status.isPlaying) {
      await sound.pauseAsync();
      setIsPlaying(false);
    } else {
      await sound.playAsync();
      setIsPlaying(true);
    }
  }, [loadAndPlay, setIsPlaying]);

  const seekTo = useCallback(
    async (millis: number) => {
      const safeMillis = Math.max(0, Math.floor(millis || 0));

      if (trackPlayerActiveRef.current) {
        await bridgeSeekTo(safeMillis);
        setPositionMillis(safeMillis);
        await savePlaybackPosition(safeMillis);
        return;
      }

      if (!soundRef.current) return;

      await soundRef.current.setPositionAsync(safeMillis);
      setPositionMillis(safeMillis);

      await savePlaybackPosition(safeMillis);
    },
    [setPositionMillis, savePlaybackPosition]
  );

  const setVolume = useCallback(async (value: number) => {
    const safeValue = Math.max(0, Math.min(value, 1));

    setVolumeState(safeValue);
    volumeRef.current = safeValue;

    await setStoredValueIfChanged(VOLUME_KEY, String(safeValue));

    if (trackPlayerActiveRef.current) {
      await bridgeSetVolume(safeValue, isMutedRef.current);
      return;
    }

    if (!isMutedRef.current && soundRef.current) {
      await soundRef.current.setVolumeAsync(safeValue);
    }
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

    if (soundRef.current) {
      await soundRef.current.setVolumeAsync(nextMuted ? 0 : volumeRef.current);
    }
  }, [setStoredValueIfChanged]);

  const toggleShuffle = useCallback(() => {
    setShuffle((prev) => {
      const next = !prev;
      shuffleRef.current = next;
      setStoredValueIfChanged(SHUFFLE_KEY, String(next));
      logShuffleState(next, { previous: prev });
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
      logRepeatModeState(next, { previous: prev });

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

  const restoreSavedData = useCallback(async () => {
    try {
      const [
        savedSong,
        savedFavorites,
        savedQueue,
        savedIndex,
        savedPosition,
        savedRadioMode,
        savedRadioIndex,
        savedRepeatMode,
        savedShuffle,
        savedVolume,
        savedMuted,
        savedActiveQueue,
        savedActiveQueueIndex,
        savedActiveQueueMode,
        savedSmartAutoplay,
      ] = await Promise.all([
        AsyncStorage.getItem(CURRENT_SONG_KEY),
        AsyncStorage.getItem(FAVORITES_KEY),
        AsyncStorage.getItem(YOUTUBE_QUEUE_KEY),
        AsyncStorage.getItem(YOUTUBE_QUEUE_INDEX_KEY),
        AsyncStorage.getItem(POSITION_KEY),
        AsyncStorage.getItem(RADIO_MODE_KEY),
        AsyncStorage.getItem(RADIO_INDEX_KEY),
        AsyncStorage.getItem(REPEAT_MODE_KEY),
        AsyncStorage.getItem(SHUFFLE_KEY),
        AsyncStorage.getItem(VOLUME_KEY),
        AsyncStorage.getItem(MUTED_KEY),
        AsyncStorage.getItem(ACTIVE_QUEUE_KEY),
        AsyncStorage.getItem(ACTIVE_QUEUE_INDEX_KEY),
        AsyncStorage.getItem(ACTIVE_QUEUE_MODE_KEY),
        AsyncStorage.getItem(SMART_AUTOPLAY_KEY),
      ]);

      const [savedRadioQueue, upgradedRecent] = await Promise.all([
        loadRadioQueue(),
        loadRecentlyPlayed(),
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

      if (savedFavorites) {
        const parsedFavorites = JSON.parse(savedFavorites);
        if (Array.isArray(parsedFavorites)) {
          setFavorites(parsedFavorites.map(normalizeSong));
        }
      }

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
            savedActiveQueueMode === "smart"
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

      setRecentlyPlayed(upgradedRecent);
    } catch (error) {
      console.log("Restore player data error:", error);
    }
  }, [normalizeSong, isYouTubeSong, normalizeYouTubeTrack]);

  useEffect(() => {
    if (!isTrackPlayerFeatureEnabled()) return;

    return subscribeBridgeEvents({
      onProgress: (progress) => {
        if (!trackPlayerActiveRef.current) return;

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
          setPositionMillisState(progress.positionMillis);
        }

        if (progress.durationMillis > 0) {
          durationMillisRef.current = progress.durationMillis;
          setDurationMillisState(progress.durationMillis);
        }

        if (progress.isPlaying !== isPlayingRef.current) {
          isPlayingRef.current = progress.isPlaying;
          setIsPlayingState(progress.isPlaying);
        }

        if (
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

        const { queue } = getActiveQueuePlaybackState();
        void persistActiveQueue(queue, index, activeQueueModeRef.current);
        void removeStoredValues([POSITION_KEY]);
      },
      onQueueEnded: () => {
        if (!trackPlayerActiveRef.current) return;
        if (repeatModeRef.current !== "off") return;

        scheduleTrackAdvance();
      },
      onPlaybackError: (message) => {
        console.log("TrackPlayer playback error:", message);
      },
    });
  }, [
    savePlaybackPosition,
    syncStateFromTrackPlayerIndex,
    getActiveQueuePlaybackState,
    persistActiveQueue,
    removeStoredValues,
    scheduleTrackAdvance,
  ]);

  useEffect(() => {
    isMountedRef.current = true;

    configureAudio();

    const restoreTask = InteractionManager.runAfterInteractions(() => {
      void restoreSavedData();
    });

    return () => {
      restoreTask.cancel();
      isMountedRef.current = false;
      loadRequestIdRef.current += 1;
      clearFinishWatchdog();
      unloadCurrentSound();
    };
  }, [configureAudio, restoreSavedData, unloadCurrentSound, clearFinishWatchdog]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      logBackgroundStateChange(previousState, nextState, {
        songId: currentSongRef.current?.id,
        isPlaying: isPlayingRef.current,
      });

      if (
        previousState === "active" &&
        isBackgroundAppState(nextState)
      ) {
        configureAudio();
        savePlaybackPosition(positionMillisRef.current);
        void applyProgressUpdateInterval();
      }

      if (nextState === "active") {
        configureAudio();
        void applyProgressUpdateInterval();
        void catchUpPlaybackIfEnded();
        void flushPendingSmartExtend();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [
    configureAudio,
    savePlaybackPosition,
    applyProgressUpdateInterval,
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
      seekTo,
      setVolume,
      toggleMute,
      toggleShuffle,
      toggleRepeatMode,
      toggleSmartAutoplay,
      toggleFavorite,
      isFavorite,
      clearActiveQueue,
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
      seekTo,
      setVolume,
      toggleMute,
      toggleShuffle,
      toggleRepeatMode,
      toggleSmartAutoplay,
      toggleFavorite,
      isFavorite,
      clearActiveQueue,
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

  return (
    <PlayerActionsContext.Provider value={actionsValue}>
      <PlayerStateContext.Provider value={stateValue}>
        <PlayerProgressContext.Provider value={progressValue}>
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

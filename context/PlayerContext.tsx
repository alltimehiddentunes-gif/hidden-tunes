import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { router } from "expo-router";
import { AppState, AppStateStatus, InteractionManager, Platform } from "react-native";

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
  getSmartQueue,
  saveSmartQueue,
} from "../services/smartQueue";
import { getCachedHiddenTunesCatalog } from "../services/hiddenTunes";
import { resolveAndroidAutoMediaId } from "../services/androidAutoCatalogSync";
import { syncAndroidAutoCatalogFromDerived } from "../services/androidAutoCatalogBridge";
import {
  isHiddenAudioEnabledOnIOS,
  isHiddenAudioNativePlaybackEnabled,
} from "../constants/playbackConfig";
import {
  activateHiddenAudioPlayback,
  bridgeGetProgress,
  bridgeHiddenAudioPause,
  bridgeHiddenAudioPlay,
  bridgeHiddenAudioUpdateNowPlaying,
  bridgeUpdateRemoteQueueAvailability,
  bridgeProbeNativePlayback,
  bridgeSeekTo,
  bridgeSyncRepeatMode,
  deactivateHiddenAudioPlayback,
  markHiddenAudioBridgeActive,
  shouldUseHiddenAudioPlayback,
  subscribeHiddenAudioDiagnostics,
  subscribeHiddenAudioEnded,
  subscribeHiddenAudioProgress,
} from "../services/playbackBridge";
import type { PlaybackProgress } from "../services/playbackBridge";
import type { HiddenAudioNativeSnapshot } from "../src/hidden-audio/hiddenAudioBridge";
import { getArtworkValue } from "../utils/artwork";
import { scheduleStartupTask } from "../utils/startupScheduler";
import {
  recordAppStateTransition,
  recordApplyProgressUpdateIntervalCall,
  recordConfigureAudioCall,
  recordListenerRegister,
  recordListenerUnregister,
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
  logQueuePlaybackEvent,
  logRepeatModeState,
  logShuffleState,
  logTapToPlayStart,
  logPlaybackUxSync,
  logTrackFinished,
} from "../utils/playbackDiagnostics";
import { logPlaybackCritical } from "../utils/playbackCriticalLogs";
import {
  getLockscreenDiagnosticSnapshot,
  isUserInitiatedHiddenAudioStopReason,
  logAndRememberLockscreenDiagnostic,
  logLockscreenPlaybackDiagnostic,
  rememberLockscreenDiagnostic,
} from "../utils/lockscreenPlaybackDiagnostics";
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
  buildContextualPlaybackQueue,
  logContextualQueueBuilt,
} from "../utils/playbackQueueBuilders";
import {
  areSongQueuesEqual,
  recordPlaybackProgressUpdate,
  recordQueueReferenceChange,
} from "../utils/playbackRenderDiagnostics";
import { logPerformanceStorageWriteThrottled } from "../utils/performanceLogs";
import { markPlaybackRestoreComplete } from "../utils/startupDiagnostics";
import { createKeyedTapGuard } from "../utils/tapGuard";
import {
  advanceEmotionalQueue as advanceEmotionalQueueState,
  getEmotionalQueueSnapshot,
  hasMoreEmotionalQueueTracks,
  refreshEmotionalQueueForTrack,
  setEmotionalQueue as setEmotionalQueueState,
  subscribeEmotionalQueue,
} from "../state/emotionalQueueController";
import type { Track } from "../types/music";
import {
  appSongToTrack,
  trackToAppSong,
} from "../utils/emotionalQueueTrackBridge";
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
type ActiveQueueMode = "standard" | "youtube" | "radio" | "smart";

export type PlaybackQueueContext = {
  source:
    | "album"
    | "artist"
    | "genre"
    | "mood"
    | "search"
    | "home_rail"
    | "queue"
    | "playlist"
    | "radio"
    | "recently_added"
    | "because_you_listened"
    | "smart_queue"
    | "full_catalog"
    | "android_auto"
    | "queue"
    | "unknown";
  label?: string;
  albumId?: string;
  albumTitle?: string;
  artistId?: string;
  artistName?: string;
  genre?: string;
  mood?: string;
  searchQuery?: string;
  railId?: string;
};

type LegacyPlaybackStatus = {
  isLoaded: boolean;
  positionMillis?: number;
  durationMillis?: number;
  isPlaying?: boolean;
  didJustFinish?: boolean;
};

type LegacySound = {
  setOnPlaybackStatusUpdate: (handler: ((status: LegacyPlaybackStatus) => void) | null) => void;
  stopAsync: () => Promise<void>;
  unloadAsync: () => Promise<void>;
  setStatusAsync: (status: Record<string, unknown>) => Promise<void>;
  getStatusAsync: () => Promise<LegacyPlaybackStatus>;
  setPositionAsync: (millis: number) => Promise<void>;
  playAsync: () => Promise<void>;
  pauseAsync: () => Promise<void>;
  setVolumeAsync: (volume: number) => Promise<void>;
};

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
  activeQueueContext: PlaybackQueueContext;
  upcomingSong: AppSong | null;

  favorites: AppSong[];
  recentlyPlayed: RecentlyPlayedTrack[];

  youtubeQueue: BackendYouTubeTrack[];
  youtubeQueueIndex: number;

  radioQueue: RadioTrack[];
  radioMode: boolean;
  radioIndex: number;

  emotionalQueue: Track[];
  queueIndex: number;
  setEmotionalQueue: (tracks: Track[]) => void;
  advanceEmotionalQueue: () => Track | null;

  playSong: (
    song: AppSong,
    queue?: AppSong[],
    index?: number,
    queueContext?: PlaybackQueueContext
  ) => Promise<void>;
  playQueue: (
    queue: AppSong[],
    startIndex?: number,
    priorInterruptDone?: boolean,
    queueContext?: PlaybackQueueContext
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
const PLAYBACK_WAS_PLAYING_KEY = "hidden_tunes_playback_was_playing";
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
const ACTIVE_QUEUE_CONTEXT_KEY = "hidden_tunes_active_queue_context";

function yieldToNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

const PLAYBACK_UPDATE_INTERVAL_MS = 2000;
const PLAYBACK_UPDATE_INTERVAL_BACKGROUND_MS = 5000;
const POSITION_STATE_UPDATE_MIN_MS = 2000;
const POSITION_STATE_UPDATE_BACKGROUND_MS = 5000;
const POSITION_SAVE_INTERVAL_MS = 12000;
const POSITION_SAVE_INTERVAL_BACKGROUND_MS = 30000;
const POSITION_SAVE_DISTANCE_MS = 5000;
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
const PLAYBACK_START_DEFERRED_WORK_DELAY_MS = 450;
const PLAYER_CONTEXT_DEBUG_LOGS = false;

function logPlayerContextDebug(...args: unknown[]) {
  if (!__DEV__ || !PLAYER_CONTEXT_DEBUG_LOGS) return;
  console.log(...args);
}

const DEFAULT_QUEUE_CONTEXT: PlaybackQueueContext = { source: "unknown" };

function cleanContextValue(value: unknown) {
  const clean = String(value || "").trim();
  return clean || undefined;
}

function normalizePlaybackQueueContext(
  context?: PlaybackQueueContext | null,
  fallbackSource: PlaybackQueueContext["source"] = "unknown"
): PlaybackQueueContext {
  if (!context) return { source: fallbackSource };

  return {
    source: context.source || fallbackSource,
    label: cleanContextValue(context.label),
    albumId: cleanContextValue(context.albumId),
    albumTitle: cleanContextValue(context.albumTitle),
    artistId: cleanContextValue(context.artistId),
    artistName: cleanContextValue(context.artistName),
    genre: cleanContextValue(context.genre),
    mood: cleanContextValue(context.mood),
    searchQuery: cleanContextValue(context.searchQuery),
    railId: cleanContextValue(context.railId),
  };
}

function contextMatchesSong(song: AppSong, context: PlaybackQueueContext) {
  const artist = String(song.artist || song.user?.name || "").toLowerCase();
  const genre = String(song.genre || "").toLowerCase();
  const mood = String(song.mood || "").toLowerCase();
  const album = String(song.album || "").toLowerCase();
  const artistName = String(context.artistName || "").toLowerCase();
  const genreName = String(context.genre || "").toLowerCase();
  const moodName = String(context.mood || "").toLowerCase();
  const albumTitle = String(context.albumTitle || "").toLowerCase();

  const albumId = String(song.albumId || "").toLowerCase();
  const contextAlbumId = String(context.albumId || "").toLowerCase();

  if (context.source === "album" && contextAlbumId && albumId && albumId === contextAlbumId) {
    return true;
  }
  if (context.source === "album" && albumTitle && album === albumTitle) return true;
  if (context.source === "artist" && artistName && artist === artistName) return true;
  if (context.source === "genre" && genreName && genre === genreName) return true;
  if (context.source === "mood" && moodName && mood.includes(moodName)) return true;

  return Boolean(
    (artistName && artist === artistName) ||
      (genreName && genre === genreName) ||
      (moodName && mood.includes(moodName))
  );
}

function nativeSnapshotIsEnded(
  snapshot: HiddenAudioNativeSnapshot | null | undefined
) {
  if (!snapshot) return false;

  const nativeStatus = String(snapshot.nativeStatus || "").toLowerCase();
  const playbackState = String(snapshot.playbackState || "").toLowerCase();
  return nativeStatus === "ended" || playbackState === "ended";
}

function nativeSnapshotIndicatesLoadedPlayback(
  snapshot: HiddenAudioNativeSnapshot | null | undefined
) {
  if (!snapshot || nativeSnapshotIsEnded(snapshot)) return false;
  return (
    snapshot.hasLoadedTrack ||
    Boolean(snapshot.activeTrack?.url) ||
    snapshot.isPlaying ||
    snapshot.playbackState === "playing" ||
    snapshot.playbackState === "buffering" ||
    snapshot.playbackState === "ready"
  );
}

type SmartContinuationScore = {
  score: number;
  reason: string;
};

function scoreSmartContinuationCandidate(
  song: AppSong,
  current: AppSong,
  context: PlaybackQueueContext,
  index: number
): SmartContinuationScore {
  if (song.id === current.id) {
    return { score: -1, reason: "same_song" };
  }

  const orderBias = Math.max(0, 500 - index);
  const artist = String(song.artist || song.user?.name || "").toLowerCase();
  const genre = String(song.genre || "").toLowerCase();
  const mood = String(song.mood || "").toLowerCase();
  const album = String(song.album || "").toLowerCase();
  const currentArtist = String(current.artist || current.user?.name || "").toLowerCase();
  const currentGenre = String(current.genre || "").toLowerCase();
  const currentMood = String(current.mood || "").toLowerCase();
  const currentAlbum = String(current.album || "").toLowerCase();
  const contextArtist = String(context.artistName || "").toLowerCase();
  const contextGenre = String(context.genre || "").toLowerCase();
  const contextMood = String(context.mood || "").toLowerCase();
  const contextAlbum = String(context.albumTitle || "").toLowerCase();

  const sameAlbumId =
    Boolean(context.albumId && song.albumId && context.albumId === song.albumId) ||
    Boolean(current.albumId && song.albumId && current.albumId === song.albumId);
  const sameAlbumTitle =
    Boolean(contextAlbum && album && album === contextAlbum) ||
    Boolean(currentAlbum && album && album === currentAlbum);

  if (context.source === "album" && (sameAlbumId || sameAlbumTitle)) {
    return { score: 100000 + orderBias, reason: "same_album" };
  }
  if (sameAlbumId || sameAlbumTitle) {
    return { score: 95000 + orderBias, reason: "same_album" };
  }

  if (
    (context.source === "artist" || context.source === "album") &&
    contextArtist &&
    artist === contextArtist
  ) {
    return { score: 80000 + orderBias, reason: "same_artist" };
  }
  if (currentArtist && artist === currentArtist) {
    return { score: 75000 + orderBias, reason: "same_artist" };
  }

  if (
    (context.source === "genre" ||
      context.source === "artist" ||
      context.source === "album" ||
      context.source === "mood") &&
    contextGenre &&
    genre === contextGenre
  ) {
    return { score: 60000 + orderBias, reason: "same_genre" };
  }
  if (currentGenre && genre === currentGenre) {
    return { score: 55000 + orderBias, reason: "same_genre" };
  }

  if (
    (context.source === "mood" || context.source === "genre" || context.source === "home_rail") &&
    contextMood &&
    mood &&
    mood.includes(contextMood)
  ) {
    return { score: 50000 + orderBias, reason: "same_mood_room" };
  }
  if (currentMood && mood && mood.includes(currentMood)) {
    return { score: 48000 + orderBias, reason: "same_mood_room" };
  }

  if (
    (context.source === "home_rail" || context.source === "radio" || context.source === "playlist") &&
    context.railId
  ) {
    return { score: 40000 + orderBias, reason: "same_rail_station" };
  }

  if (context.source === "search" && (contextArtist || contextGenre)) {
    if (contextArtist && artist === contextArtist) {
      return { score: 35000 + orderBias, reason: "search_artist_match" };
    }
    if (contextGenre && genre === contextGenre) {
      return { score: 34000 + orderBias, reason: "search_genre_match" };
    }
  }

  if (context.source === "recently_added") {
    return { score: 1000 + orderBias, reason: "recently_added_fallback" };
  }
  if (context.source === "full_catalog") {
    return { score: 100 + orderBias, reason: "full_catalog_fallback" };
  }

  return { score: 50 + orderBias, reason: "catalog_fallback" };
}

function rankContinuationCandidate(
  song: AppSong,
  current: AppSong,
  context: PlaybackQueueContext,
  index: number
) {
  return scoreSmartContinuationCandidate(song, current, context, index).score;
}

function isBackgroundAppState(state: AppStateStatus) {
  return state === "background" || state === "inactive";
}


function shouldSkipNativeActiveIndexOverwrite(
  jsQueueIndex: number,
  nativeActiveIndex: number,
  jsQueueLength: number,
  nativeQueueLength = 0
) {
  return nativeQueueLength === 1 && jsQueueLength > 1 && nativeActiveIndex !== jsQueueIndex;
}

function shouldBlockJsPlaybackStateClear(
  appState: AppStateStatus,
  source: string,
  options?: { userInitiated?: boolean }
) {
  if (Platform.OS !== "ios") return false;
  if (options?.userInitiated || isUserInitiatedHiddenAudioStopReason(source)) {
    return false;
  }
  return isBackgroundAppState(appState);
}


function getProgressUpdateIntervalMs(state: AppStateStatus) {
  return isBackgroundAppState(state)
    ? PLAYBACK_UPDATE_INTERVAL_BACKGROUND_MS
    : PLAYBACK_UPDATE_INTERVAL_MS;
}

function getPositionSaveIntervalMs(state: AppStateStatus) {
  return isBackgroundAppState(state)
    ? POSITION_SAVE_INTERVAL_BACKGROUND_MS
    : POSITION_SAVE_INTERVAL_MS;
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
  const soundRef = useRef<LegacySound | null>(null);
  const isChangingTrackRef = useRef(false);
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const inFlightPlaySongIdRef = useRef<string | null>(null);
  const queueControlTapGuardRef = useRef(createKeyedTapGuard(420));
  const loadingRecoveryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueTransitionRef = useRef(false);
  const queueTransitionTailRef = useRef(Promise.resolve());
  const lastAutoAdvanceRequestRef = useRef({ songId: "", requestedAt: 0 });
  const autoAdvanceRef = useRef(false);
  const skipEmotionalQueueRefreshRef = useRef(false);
  const lastFinishEventRef = useRef({
    songId: "",
    handledAt: 0,
  });
  type LoadAndPlayOptions = {
    /** Direct user tap - pause/stop current audio before loading the next track. */
    userInitiated?: boolean;
    /** Set when playSong/playQueue already ran interrupt for this tap. */
    userInterruptDone?: boolean;
  };

  const loadAndPlayRef = useRef<
    ((song: AppSong, options?: LoadAndPlayOptions) => Promise<void>) | null
  >(null);
  const tryAdvanceViaEmotionalQueueRef = useRef<() => Promise<boolean>>(
    async () => false
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
  const preloadedSoundRef = useRef<LegacySound | null>(null);
  const preloadedSongIdRef = useRef<string | null>(null);
  const preloadInFlightRef = useRef(false);
  const pendingSmartExtendRef = useRef(false);
  const hiddenAudioActiveRef = useRef(false);
  const lastLockscreenProgressDiagnosticRef = useRef(0);
  const lastNativePlaybackStateRef = useRef("");
  const lastUnexpectedPlaybackStopRef = useRef({ songId: "", at: 0 });
  const backgroundNearEndStallCountRef = useRef(0);
  const backgroundAdvanceFromNativeEndRef = useRef(false);
  const backgroundWatchTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const intentionalPauseRef = useRef({ at: 0, reason: "" });
  const foregroundResyncInFlightRef = useRef(false);
  const lastPlayerOpenRequestRef = useRef({ songId: "", at: 0 });
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
  const isLoadingRef = useRef(false);

  const currentSongRef = useRef<AppSong | null>(null);
  const repeatModeRef = useRef<RepeatMode>("off");
  const volumeRef = useRef(1);
  const isMutedRef = useRef(false);
  const shuffleRef = useRef(false);
  const smartAutoplayEnabledRef = useRef(true);

  const activeQueueRef = useRef<AppSong[]>([]);
  const activeQueueIndexRef = useRef(0);
  const activeQueueModeRef = useRef<ActiveQueueMode>("standard");
  const activeQueueContextRef = useRef<PlaybackQueueContext>(DEFAULT_QUEUE_CONTEXT);

  const youtubeQueueRef = useRef<BackendYouTubeTrack[]>([]);
  const youtubeQueueIndexRef = useRef(0);

  const radioQueueRef = useRef<RadioTrack[]>([]);
  const radioModeRef = useRef(false);
  const radioIndexRef = useRef(0);

  const [currentSong, setCurrentSong] = useState<AppSong | null>(null);
  const [isPlaying, setIsPlayingState] = useState(false);
  const [isLoading, setIsLoadingState] = useState(false);

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
  const [activeQueueContext, setActiveQueueContext] =
    useState<PlaybackQueueContext>(DEFAULT_QUEUE_CONTEXT);

  const emotionalQueueSnapshot = useSyncExternalStore(
    subscribeEmotionalQueue,
    getEmotionalQueueSnapshot,
    getEmotionalQueueSnapshot
  );

  const setEmotionalQueue = useCallback((tracks: Track[]) => {
    setEmotionalQueueState(tracks);
  }, []);

  const advanceEmotionalQueue = useCallback(() => {
    return advanceEmotionalQueueState();
  }, []);

  const [favorites, setFavorites] = useState<AppSong[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentlyPlayedTrack[]>([]);

  const [youtubeQueue, setYouTubeQueue] = useState<BackendYouTubeTrack[]>([]);
  const [youtubeQueueIndex, setYouTubeQueueIndex] = useState(0);

  const [radioQueue, setRadioQueue] = useState<RadioTrack[]>([]);
  const [radioMode, setRadioMode] = useState(false);
  const [radioIndex, setRadioIndex] = useState(0);

  const setPositionMillis = useCallback((value: number) => {
    const safeValue = Math.max(0, Math.floor(value || 0));
    if (positionMillisRef.current === safeValue) return;

    positionMillisRef.current = safeValue;
    recordPlaybackProgressUpdate();
    setPositionMillisState(safeValue);
  }, []);

  const setDurationMillis = useCallback((value: number) => {
    const safeValue = Math.max(0, Math.floor(value || 0));
    if (durationMillisRef.current === safeValue) return;

    durationMillisRef.current = safeValue;
    setDurationMillisState(safeValue);
  }, []);

  const setIsPlaying = useCallback((value: boolean) => {
    if (
      !value &&
      isBackgroundAppState(appStateRef.current) &&
      (currentSongRef.current || activeQueueRef.current.length > 0)
    ) {
      markHiddenAudioBridgeActive(true);
      hiddenAudioActiveRef.current = true;
      logLockscreenPlaybackDiagnostic("blocked_inactive_hidden_audio_false", {
        source: "setIsPlaying",
        appState: appStateRef.current,
        songId: currentSongRef.current?.id || null,
        queueLength: activeQueueRef.current.length,
        previousIsPlaying: isPlayingRef.current,
      });
      return;
    }

    if (isPlayingRef.current === value) return;

    isPlayingRef.current = value;
    if (value) {
      storageValueCacheRef.current[PLAYBACK_WAS_PLAYING_KEY] = "true";
      void AsyncStorage.setItem(PLAYBACK_WAS_PLAYING_KEY, "true").catch(() => undefined);
    }
    setIsPlayingState(value);
  }, []);

  const setIsLoading = useCallback((value: boolean) => {
    isLoadingRef.current = value;
    setIsLoadingState((previous) => {
      if (previous === value) return previous;
      return value;
    });
  }, []);

  const intentionalPauseCooldownRemainingMs = useCallback(() => {
    const markedAt = intentionalPauseRef.current.at;
    if (!markedAt) return 0;
    return Math.max(0, 8000 - (Date.now() - markedAt));
  }, []);

  const hasRecentIntentionalPause = useCallback(() => {
    return intentionalPauseCooldownRemainingMs() > 0;
  }, [intentionalPauseCooldownRemainingMs]);

  const markIntentionalPause = useCallback((reason: string) => {
    intentionalPauseRef.current = { at: Date.now(), reason };
    logLockscreenPlaybackDiagnostic("intentional_pause_marked", {
      reason,
      cooldownMs: 8000,
      songId: currentSongRef.current?.id || null,
      appState: appStateRef.current,
    });
  }, []);

  const clearIntentionalPause = useCallback((reason: "play" | "new_track") => {
    const previous = intentionalPauseRef.current;
    if (!previous.at) return;
    intentionalPauseRef.current = { at: 0, reason: "" };
    logLockscreenPlaybackDiagnostic(
      reason === "new_track"
        ? "intentional_pause_cleared_by_new_track"
        : "intentional_pause_cleared_by_play",
      {
        reason,
        previousReason: previous.reason,
        songId: currentSongRef.current?.id || null,
        appState: appStateRef.current,
      }
    );
  }, []);

  const clearLoadingRecoveryTimeout = useCallback(() => {
    if (!loadingRecoveryTimeoutRef.current) return;
    clearTimeout(loadingRecoveryTimeoutRef.current);
    loadingRecoveryTimeoutRef.current = null;
  }, []);

  const armLoadingRecoveryTimeout = useCallback(
    (requestId: number, songId: string) => {
      clearLoadingRecoveryTimeout();
      loadingRecoveryTimeoutRef.current = setTimeout(() => {
        if (loadRequestIdRef.current !== requestId) {
          logPlayerContextDebug("playback_recovery_stale_request_ignored", {
            requestId,
            songId,
            latestRequestId: loadRequestIdRef.current,
          });
          return;
        }

        const clearLoadingAfterTimeout = async () => {
          if (hiddenAudioActiveRef.current || isHiddenAudioNativePlaybackEnabled()) {
            try {
              if (isHiddenAudioNativePlaybackEnabled()) {
                const snapshot = await bridgeProbeNativePlayback();
                if (nativeSnapshotIndicatesLoadedPlayback(snapshot) && snapshot?.isPlaying) {
                  markHiddenAudioBridgeActive(true);
                  hiddenAudioActiveRef.current = true;
                  logPlayerContextDebug("playback_recovery_loading_cleared_skipped", {
                    requestId,
                    songId,
                    reason: "loading_timeout_native_still_playing",
                    playbackState: snapshot.playbackState,
                  });
                  isChangingTrackRef.current = false;
                  inFlightPlaySongIdRef.current = null;
                  setIsLoading(false);
                  return;
                }
              }
              const progress = await bridgeGetProgress();
              if (progress.isPlaying || progress.playbackState === "buffering") {
                logPlayerContextDebug("playback_recovery_loading_cleared_skipped", {
                  requestId,
                  songId,
                  reason: "loading_timeout_hidden_audio_still_playing",
                  playbackState: progress.playbackState,
                });
                isChangingTrackRef.current = false;
                inFlightPlaySongIdRef.current = null;
                setIsLoading(false);
                return;
              }
            } catch {
              // fall through to clear
            }
          }

          logPlayerContextDebug("playback_recovery_loading_cleared", {
            requestId,
            songId,
            reason: "loading_timeout",
          });
          isChangingTrackRef.current = false;
          inFlightPlaySongIdRef.current = null;
          setIsLoading(false);
          setIsPlaying(false);
        };

        void clearLoadingAfterTimeout();
      }, 15000);
    },
    [clearLoadingRecoveryTimeout, setIsLoading, setIsPlaying]
  );


  const syncNativeRemoteQueueAvailability = useCallback(async () => {
    if (!isHiddenAudioEnabledOnIOS()) return;

    const queue = activeQueueRef.current;
    const safeIndex = activeQueueIndexRef.current;
    if (!queue.length) return;

    try {
      await bridgeUpdateRemoteQueueAvailability({
        activeIndex: safeIndex,
        queueLength: queue.length,
      });
      logLockscreenPlaybackDiagnostic("remote_queue_availability_synced", {
        activeIndex: safeIndex,
        queueLength: queue.length,
      });
    } catch (error) {
      logLockscreenPlaybackDiagnostic("remote_queue_availability_sync_failed", {
        message: String(error),
        activeIndex: safeIndex,
        queueLength: queue.length,
      });
    }
  }, []);


  const applyHiddenAudioProgressToUi = useCallback(
    (progress: PlaybackProgress, source: string) => {
      if (!hiddenAudioActiveRef.current && !isHiddenAudioNativePlaybackEnabled()) {
        return;
      }

      if (!hiddenAudioActiveRef.current) {
        markHiddenAudioBridgeActive(true);
        hiddenAudioActiveRef.current = true;
      }

      const now = Date.now();
      const previousPosition = positionMillisRef.current;

      if (progress.positionMillis > 0 || progress.isPlaying) {
        positionMillisRef.current = progress.positionMillis;
        const positionStateMinMs = getPositionStateUpdateMinMs(appStateRef.current);
        if (
          now - lastPositionStateUpdateRef.current >= positionStateMinMs ||
          Math.abs(progress.positionMillis - previousPosition) > 250
        ) {
          lastPositionStateUpdateRef.current = now;
          recordPlaybackProgressUpdate();
          recordPlaybackReactStateUpdate("position");
          setPositionMillisState(progress.positionMillis);
        }
      }

      if (progress.durationMillis > 0) {
        if (
          Math.abs(progress.durationMillis - durationMillisRef.current) >=
            DURATION_UPDATE_THRESHOLD_MS ||
          durationMillisRef.current <= 0
        ) {
          durationMillisRef.current = progress.durationMillis;
          recordPlaybackReactStateUpdate("duration");
          setDurationMillisState(progress.durationMillis);
        }
      }

      if (progress.isPlaying !== isPlayingRef.current) {
        isPlayingRef.current = progress.isPlaying;
        recordPlaybackReactStateUpdate("is_playing");
        setIsPlayingState(progress.isPlaying);
      }

      logPlayerContextDebug("hidden_audio_progress_event_applied", {
        source,
        positionMillis: progress.positionMillis,
        durationMillis: progress.durationMillis,
        isPlaying: progress.isPlaying,
        playbackState: progress.playbackState,
      });
    },
    []
  );

  const syncHiddenAudioState = useCallback(
    async (reason: string) => {
      logPlayerContextDebug("hidden_audio_state_sync_start", { reason });

      try {
        if (isHiddenAudioNativePlaybackEnabled()) {
          const snapshot = await bridgeProbeNativePlayback();
          if (nativeSnapshotIndicatesLoadedPlayback(snapshot)) {
            markHiddenAudioBridgeActive(true);
            hiddenAudioActiveRef.current = true;
          }
        }

        const progress = await bridgeGetProgress();

        setPositionMillis(progress.positionMillis);

        if (progress.durationMillis > 0) {
          setDurationMillis(progress.durationMillis);
        }

        const playbackStateLower = String(progress.playbackState || "").toLowerCase();
        const backgrounding = isBackgroundAppState(appStateRef.current);
        const allowPauseSync =
          !backgrounding ||
          progress.isPlaying ||
          playbackStateLower === "paused" ||
          playbackStateLower === "ended";
        if (allowPauseSync || progress.isPlaying) {
          setIsPlaying(progress.isPlaying);
        } else if (backgrounding) {
          logLockscreenPlaybackDiagnostic("js_state_clear_blocked_background", {
            source: `sync_hidden_audio_state:${reason}`,
            playbackState: progress.playbackState,
            songId: currentSongRef.current?.id || null,
          });
        }
        logPlayerContextDebug("hidden_audio_state_sync_success", { reason, progress });
        return progress;
      } catch (error) {
        logPlayerContextDebug("hidden_audio_state_sync_failed", { reason, error });
        return null;
      }
    },
    [setDurationMillis, setIsPlaying, setPositionMillis]
  );

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
    const serialized = String(safeMillis);

    if (storageValueCacheRef.current[POSITION_KEY] === serialized) {
      logPerformanceStorageWriteThrottled("playback_position", {
        reason: "unchanged",
        millis: safeMillis,
      });
      return;
    }

    try {
      lastSavedPositionRef.current = safeMillis;
      storageValueCacheRef.current[POSITION_KEY] = serialized;
      await AsyncStorage.setItem(POSITION_KEY, serialized);
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

  const getSongDurationSeconds = useCallback(
    (song: AppSong) => {
      const duration = normalizeDuration(song.duration);

      if (!duration || !Number.isFinite(duration)) return 0;

      return duration > 10000 ? duration / 1000 : duration;
    },
    [normalizeDuration]
  );

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


  const reconcileHiddenAudioActiveState = useCallback(
    async (source: string) => {
      if (!isHiddenAudioNativePlaybackEnabled()) {
        return hiddenAudioActiveRef.current;
      }

      if (hiddenAudioActiveRef.current && currentSongRef.current) {
        return true;
      }

      const hasAndroidPlayableSession =
        Platform.OS !== "android" ||
        Boolean(currentSongRef.current && getPlayableUri(currentSongRef.current)) ||
        isPlayingRef.current;

      if (
        hasAndroidPlayableSession &&
        (currentSongRef.current || activeQueueRef.current.length > 0 || isPlayingRef.current)
      ) {
        if (!hiddenAudioActiveRef.current) {
          markHiddenAudioBridgeActive(true);
          hiddenAudioActiveRef.current = true;
          logLockscreenPlaybackDiagnostic(
            "blocked_hidden_audio_active_false_while_saved_session_exists",
            {
              source,
              songId: currentSongRef.current?.id || null,
              queueLength: activeQueueRef.current.length,
              isPlaying: isPlayingRef.current,
            }
          );
        }
        return true;
      }

      try {
        const savedSong = await AsyncStorage.getItem(CURRENT_SONG_KEY);
        if (savedSong) {
          if (!hiddenAudioActiveRef.current) {
            markHiddenAudioBridgeActive(true);
            hiddenAudioActiveRef.current = true;
            logLockscreenPlaybackDiagnostic(
              "blocked_hidden_audio_active_false_while_saved_session_exists",
              {
                source,
                songId: null,
                queueLength: activeQueueRef.current.length,
                savedSession: true,
              }
            );
          }
          return true;
        }
      } catch {
        // ignore storage read errors
      }

      try {
        const snapshot = await bridgeProbeNativePlayback();
        if (nativeSnapshotIndicatesLoadedPlayback(snapshot)) {
          markHiddenAudioBridgeActive(true);
          hiddenAudioActiveRef.current = true;
          return true;
        }
      } catch {
        // ignore native probe errors
      }

      return hiddenAudioActiveRef.current;
    },
    []
  );

  const hydrateJsPlaybackSessionFromStorage = useCallback(async () => {
    try {
      const [
        savedSong,
        savedQueue,
        savedIndex,
        savedMode,
        savedContext,
        savedPosition,
        savedWasPlaying,
      ] = await Promise.all([
        AsyncStorage.getItem(CURRENT_SONG_KEY),
        AsyncStorage.getItem(ACTIVE_QUEUE_KEY),
        AsyncStorage.getItem(ACTIVE_QUEUE_INDEX_KEY),
        AsyncStorage.getItem(ACTIVE_QUEUE_MODE_KEY),
        AsyncStorage.getItem(ACTIVE_QUEUE_CONTEXT_KEY),
        AsyncStorage.getItem(POSITION_KEY),
        AsyncStorage.getItem(PLAYBACK_WAS_PLAYING_KEY),
      ]);

      let hydrated = false;

      if (savedSong) {
        const restoredSong = normalizeSong(JSON.parse(savedSong));
        if (!isYouTubeSong(restoredSong) && getPlayableUri(restoredSong)) {
          currentSongRef.current = restoredSong;
          setCurrentSong(restoredSong);
          hydrated = true;
        }
      }

      let restoredQueue = activeQueueRef.current;
      if (savedQueue) {
        const parsedQueue = JSON.parse(savedQueue);
        if (Array.isArray(parsedQueue)) {
          const normalizedQueue = parsedQueue
            .map(normalizeSong)
            .filter((song: AppSong) => !isYouTubeSong(song) && Boolean(getPlayableUri(song)));
          if (normalizedQueue.length > 0) {
            restoredQueue = normalizedQueue;
            activeQueueRef.current = normalizedQueue;
            setActiveQueue(normalizedQueue);
            hydrated = true;
          }
        }
      }

      if (restoredQueue.length > 0) {
        const parsedIndex = Number(savedIndex || 0);
        const restoredIndex = Number.isNaN(parsedIndex)
          ? Math.max(
              0,
              restoredQueue.findIndex((song) => song.id === currentSongRef.current?.id)
            )
          : Math.max(0, Math.min(parsedIndex, restoredQueue.length - 1));
        activeQueueIndexRef.current = restoredIndex;
        setActiveQueueIndex(restoredIndex);

        if (
          Platform.OS === "android" &&
          !currentSongRef.current &&
          restoredQueue[restoredIndex] &&
          getPlayableUri(restoredQueue[restoredIndex])
        ) {
          const recoveredSong = restoredQueue[restoredIndex];
          currentSongRef.current = recoveredSong;
          setCurrentSong(recoveredSong);
          hydrated = true;
          logLockscreenPlaybackDiagnostic("android_recovered_current_song_from_queue", {
            songId: recoveredSong.id,
            queueIndex: restoredIndex,
            queueLength: restoredQueue.length,
          });
        } else if (
          Platform.OS === "android" &&
          !currentSongRef.current &&
          restoredQueue.length > 0
        ) {
          await AsyncStorage.multiRemove([
            CURRENT_SONG_KEY,
            PLAYBACK_WAS_PLAYING_KEY,
          ]);
          delete storageValueCacheRef.current[CURRENT_SONG_KEY];
          delete storageValueCacheRef.current[PLAYBACK_WAS_PLAYING_KEY];
          logLockscreenPlaybackDiagnostic("android_cleared_invalid_saved_session", {
            queueLength: restoredQueue.length,
            queueIndex: restoredIndex,
          });
        }

        const mode: ActiveQueueMode =
          savedMode === "youtube" ||
          savedMode === "radio" ||
          savedMode === "smart" ||
          savedMode === "standard"
            ? savedMode
            : activeQueueModeRef.current;
        activeQueueModeRef.current = mode;
        setActiveQueueMode(mode);

        if (savedContext) {
          try {
            const context = normalizePlaybackQueueContext(JSON.parse(savedContext));
            activeQueueContextRef.current = context;
            setActiveQueueContext(context);
          } catch {
            // keep existing context
          }
        }
      }

      if (savedPosition) {
        const parsedPosition = Number(savedPosition);
        if (!Number.isNaN(parsedPosition) && parsedPosition >= 0) {
          positionMillisRef.current = parsedPosition;
          lastSavedPositionRef.current = parsedPosition;
          setPositionMillis(parsedPosition);
          hydrated = true;
        }
      }

      if (
        savedWasPlaying === "true" &&
        currentSongRef.current &&
        getPlayableUri(currentSongRef.current)
      ) {
        markHiddenAudioBridgeActive(true);
        hiddenAudioActiveRef.current = true;
        setIsPlaying(true);
        hydrated = true;
        logLockscreenPlaybackDiagnostic("foreground_saved_session_hydrated_before_probe", {
          songId: currentSongRef.current?.id || null,
          queueLength: activeQueueRef.current.length,
          queueIndex: activeQueueIndexRef.current,
          isPlaying: true,
        });
      }

      return hydrated;
    } catch (error) {
      logLockscreenPlaybackDiagnostic("foreground_restore_queue_context_failed", {
        source: "hydrate_js_session",
        message: String((error as Error)?.message || error),
      });
      return false;
    }
  }, [
    getPlayableUri,
    isYouTubeSong,
    normalizeSong,
    setActiveQueue,
    setActiveQueueContext,
    setActiveQueueIndex,
    setActiveQueueMode,
    setCurrentSong,
    setIsPlaying,
    setPositionMillis,
  ]);

  const restoreForegroundFromSavedSession = useCallback(
    async (reason: string) => {
      logLockscreenPlaybackDiagnostic("foreground_restore_from_saved_session_attempt", {
        reason,
        currentSongId: currentSongRef.current?.id || null,
        queueLength: activeQueueRef.current.length,
        positionMillis: positionMillisRef.current,
      });

      try {
        const hydrated = await hydrateJsPlaybackSessionFromStorage();
        const restoredSong = currentSongRef.current;
        const restoredQueue = activeQueueRef.current;

        if (!hydrated || !restoredSong || restoredQueue.length === 0) {
          logLockscreenPlaybackDiagnostic("foreground_restore_skipped_no_native_track", {
            reason: hydrated ? "saved_queue_missing" : "saved_current_song_missing",
            songId: restoredSong?.id || null,
          });
          return false;
        }

        const durationSeconds = getSongDurationSeconds(restoredSong);
        if (durationSeconds > 0) {
          const durationMillis = Math.round(durationSeconds * 1000);
          durationMillisRef.current = durationMillis;
          setDurationMillis(durationMillis);
        }

        const snapshot = await bridgeProbeNativePlayback();
        const nativeAlive = nativeSnapshotIndicatesLoadedPlayback(snapshot);

        if (nativeAlive && snapshot) {
          markHiddenAudioBridgeActive(true);
          hiddenAudioActiveRef.current = true;
          setPositionMillis(snapshot.positionMillis);
          if (snapshot.durationMillis > 0) {
            setDurationMillis(snapshot.durationMillis);
          }
          setIsPlaying(snapshot.isPlaying);
          void syncNativeRemoteQueueAvailability();
          logLockscreenPlaybackDiagnostic("foreground_restore_skipped_because_native_alive", {
            reason,
            songId: restoredSong.id || null,
            queueLength: restoredQueue.length,
            queueIndex: activeQueueIndexRef.current,
            nativeStatus: snapshot.nativeStatus,
            isPlaying: snapshot.isPlaying,
          });
          logLockscreenPlaybackDiagnostic("foreground_preserved_existing_session", {
            source: "saved_session_native_alive",
            songId: restoredSong.id || null,
            queueLength: restoredQueue.length,
          });
          logLockscreenPlaybackDiagnostic("foreground_restore_from_saved_session_success", {
            songId: restoredSong.id || null,
            queueLength: restoredQueue.length,
            queueIndex: activeQueueIndexRef.current,
            positionMillis: snapshot.positionMillis,
            preservedNative: true,
          });
          return true;
        }

        logLockscreenPlaybackDiagnostic("native_idle_but_saved_track_exists", {
          songId: restoredSong.id || null,
          title: restoredSong.title || null,
          queueLength: restoredQueue.length,
          queueIndex: activeQueueIndexRef.current,
          positionMillis: positionMillisRef.current,
        });

        await loadAndPlayRef.current?.(restoredSong);

        logLockscreenPlaybackDiagnostic("foreground_restore_from_saved_session_success", {
          songId: restoredSong.id || null,
          queueLength: restoredQueue.length,
          queueIndex: activeQueueIndexRef.current,
          positionMillis: positionMillisRef.current,
          preservedNative: false,
        });
        return true;
      } catch (error) {
        logLockscreenPlaybackDiagnostic("foreground_restore_skipped_no_native_track", {
          reason: "saved_session_restore_failed",
          message: String((error as Error)?.message || error),
        });
        return false;
      }
    },
    [
      hydrateJsPlaybackSessionFromStorage,
      getSongDurationSeconds,
      setDurationMillis,
      setIsPlaying,
      setPositionMillis,
      syncNativeRemoteQueueAvailability,
      clearIntentionalPause,
      markIntentionalPause,
    ]
  );

  const resyncForegroundHiddenAudioState = useCallback(async () => {
    if (!isHiddenAudioNativePlaybackEnabled()) {
      logLockscreenPlaybackDiagnostic("foreground_sync_complete", {
        skipped: true,
        reason: "not_ios_hidden_audio",
      });
      return;
    }

    if (foregroundResyncInFlightRef.current) {
      logLockscreenPlaybackDiagnostic("foreground_sync_complete", {
        skipped: true,
        reason: "resync_already_in_flight",
        songId: currentSongRef.current?.id || null,
        queueLength: activeQueueRef.current.length,
      });
      return;
    }

    foregroundResyncInFlightRef.current = true;

    try {
      const hadJsSession =
        Boolean(currentSongRef.current) && activeQueueRef.current.length > 0;

      if (!hadJsSession) {
        const hydrated = await hydrateJsPlaybackSessionFromStorage();
        if (hydrated) {
          logLockscreenPlaybackDiagnostic("skipped_null_foreground_state_due_to_saved_session", {
            source: "foreground_sync",
            songId: currentSongRef.current?.id || null,
            queueLength: activeQueueRef.current.length,
            queueIndex: activeQueueIndexRef.current,
          });
          logLockscreenPlaybackDiagnostic(
            "foreground_saved_session_hydrated_before_probe",
            {
              songId: currentSongRef.current?.id || null,
              queueLength: activeQueueRef.current.length,
              queueIndex: activeQueueIndexRef.current,
              positionMillis: positionMillisRef.current,
            }
          );
          logLockscreenPlaybackDiagnostic("foreground_preserved_existing_session", {
            source: "hydrate_before_native_probe",
            songId: currentSongRef.current?.id || null,
            queueLength: activeQueueRef.current.length,
            queueIndex: activeQueueIndexRef.current,
          });
        }
      }

      await reconcileHiddenAudioActiveState("foreground_sync");

      logLockscreenPlaybackDiagnostic("foreground_sync_start", {
        hiddenAudioActive: hiddenAudioActiveRef.current,
        songId: currentSongRef.current?.id || null,
        isPlaying: isPlayingRef.current,
        positionMillis: positionMillisRef.current,
        queueLength: activeQueueRef.current.length,
        queueIndex: activeQueueIndexRef.current,
      });

      logLockscreenPlaybackDiagnostic("native_status_probe_start", {
        source: "foreground",
        hiddenAudioActive: hiddenAudioActiveRef.current,
        songId: currentSongRef.current?.id || null,
        queueLength: activeQueueRef.current.length,
      });
      const snapshot = await bridgeProbeNativePlayback();

      logLockscreenPlaybackDiagnostic("native_status_probe_result", {
        source: "foreground",
        snapshotAvailable: Boolean(snapshot),
        nativeStatus: snapshot?.nativeStatus || null,
        hasLoadedTrack: snapshot?.hasLoadedTrack ?? null,
        isPlaying: snapshot?.isPlaying ?? null,
        playbackState: snapshot?.playbackState || null,
        activeTrackUrl: snapshot?.activeTrack?.url ? "present" : "missing",
      });

      if (!snapshot) {
        const restored = await restoreForegroundFromSavedSession("snapshot_unavailable");
        logLockscreenPlaybackDiagnostic("foreground_sync_complete", {
          restored,
          reason: restored ? "saved_session_restored" : "snapshot_unavailable",
        });
        return;
      }

      logLockscreenPlaybackDiagnostic("foreground_native_status", {
        nativeStatus: snapshot.nativeStatus,
        hasLoadedTrack: snapshot.hasLoadedTrack,
        isPlaying: snapshot.isPlaying,
        playbackState: snapshot.playbackState,
        activeTrackId: snapshot.activeTrack?.id || null,
        activeTrackUrl: snapshot.activeTrack?.url ? "present" : "missing",
        activeIndex: snapshot.activeIndex,
        positionMillis: snapshot.positionMillis,
        durationMillis: snapshot.durationMillis,
      });

      const nativeRetainsPlayableTrack =
        snapshot.hasLoadedTrack ||
        Boolean(snapshot.activeTrack?.url) ||
        snapshot.isPlaying ||
        snapshot.playbackState === "playing" ||
        snapshot.playbackState === "buffering" ||
        snapshot.playbackState === "ready";

      if (
        nativeRetainsPlayableTrack &&
        currentSongRef.current &&
        activeQueueRef.current.length > 0
      ) {
        markHiddenAudioBridgeActive(true);
        hiddenAudioActiveRef.current = true;
        setPositionMillis(snapshot.positionMillis);
        if (snapshot.durationMillis > 0) {
          setDurationMillis(snapshot.durationMillis);
        }
        setIsPlaying(snapshot.isPlaying);
        void syncNativeRemoteQueueAvailability();
        logLockscreenPlaybackDiagnostic("foreground_preserved_existing_session", {
          source: "js_session_with_native_alive",
          songId: currentSongRef.current?.id || null,
          queueLength: activeQueueRef.current.length,
          queueIndex: activeQueueIndexRef.current,
        });
        logLockscreenPlaybackDiagnostic("foreground_restore_skipped_because_native_alive", {
          songId: currentSongRef.current?.id || null,
          nativeStatus: snapshot.nativeStatus,
          isPlaying: snapshot.isPlaying,
          queueLength: activeQueueRef.current.length,
        });
        logLockscreenPlaybackDiagnostic("foreground_sync_complete", {
          restored: true,
          preserved: true,
          hiddenAudioActive: hiddenAudioActiveRef.current,
          isPlaying: snapshot.isPlaying,
          songId: currentSongRef.current?.id || null,
          queueLength: activeQueueRef.current.length,
        });
        return;
      }

      if (!nativeRetainsPlayableTrack) {
        if (currentSongRef.current || activeQueueRef.current.length > 0) {
          logLockscreenPlaybackDiagnostic("native_idle_but_js_session_exists", {
            nativeStatus: snapshot.nativeStatus,
            hasLoadedTrack: snapshot.hasLoadedTrack,
            songId: currentSongRef.current?.id || null,
            queueLength: activeQueueRef.current.length,
          });
        }
        logLockscreenPlaybackDiagnostic("native_player_missing_on_foreground", {
          nativeStatus: snapshot.nativeStatus,
          hasLoadedTrack: snapshot.hasLoadedTrack,
          isPlaying: snapshot.isPlaying,
          playbackState: snapshot.playbackState,
          activeTrackUrl: snapshot.activeTrack?.url ? "present" : "missing",
        });
        logLockscreenPlaybackDiagnostic("queue_restore_failed", {
          reason: "no_native_track",
          queueLength: activeQueueRef.current.length,
        });
        const restored = await restoreForegroundFromSavedSession("native_idle_or_missing_track");
        if (!restored) {
          logLockscreenPlaybackDiagnostic("foreground_restore_skipped_no_native_track", {
            nativeStatus: snapshot.nativeStatus,
            hasLoadedTrack: snapshot.hasLoadedTrack,
            isPlaying: snapshot.isPlaying,
            playbackState: snapshot.playbackState,
          });
        }
        logLockscreenPlaybackDiagnostic("foreground_sync_complete", {
          restored,
          reason: restored ? "saved_session_restored" : "no_native_track",
        });
        return;
      }

      if (
        !hiddenAudioActiveRef.current ||
        !currentSongRef.current ||
        isPlayingRef.current !== snapshot.isPlaying
      ) {
        logLockscreenPlaybackDiagnostic("foreground_prevented_false_reset", {
          hiddenAudioActive: hiddenAudioActiveRef.current,
          songId: currentSongRef.current?.id || null,
          jsIsPlaying: isPlayingRef.current,
          nativeIsPlaying: snapshot.isPlaying,
          nativeStatus: snapshot.nativeStatus,
          playbackState: snapshot.playbackState,
        });
      }

      markHiddenAudioBridgeActive(true);
      hiddenAudioActiveRef.current = true;

      setPositionMillis(snapshot.positionMillis);
      if (snapshot.durationMillis > 0) {
        setDurationMillis(snapshot.durationMillis);
      }
      setIsPlaying(snapshot.isPlaying);

      const nativeUrl = snapshot.activeTrack?.url || "";
      const queue = activeQueueRef.current;
      let restoredSong = currentSongRef.current;

      if (!restoredSong && nativeUrl) {
        restoredSong =
          queue.find((candidate) => getPlayableUri(candidate) === nativeUrl) ||
          null;
      }

      if (!restoredSong) {
        try {
          const savedSong = await AsyncStorage.getItem(CURRENT_SONG_KEY);
          if (savedSong) {
            const parsedSong = normalizeSong(JSON.parse(savedSong));
            if (!isYouTubeSong(parsedSong)) {
              restoredSong = parsedSong;
            }
          }
        } catch (error) {
          logLockscreenPlaybackDiagnostic("foreground_restore_saved_song_failed", {
            message: String((error as Error)?.message || error),
          });
        }
      }

      if (
        !restoredSong &&
        snapshot.activeIndex >= 0 &&
        snapshot.activeIndex < queue.length
      ) {
        const indexedSong = queue[snapshot.activeIndex];
        if (!nativeUrl || getPlayableUri(indexedSong) === nativeUrl) {
          restoredSong = indexedSong;
        }
      }

      if (!restoredSong && snapshot.activeTrack) {
        restoredSong = normalizeSong({
          id: snapshot.activeTrack.id,
          title: snapshot.activeTrack.title,
          artist: snapshot.activeTrack.artist,
          album: snapshot.activeTrack.album,
          streamUrl: snapshot.activeTrack.url,
          duration: snapshot.activeTrack.durationSeconds,
          source: "hidden-tunes",
          sourceName: "Hidden Tunes",
          type: "r2",
        } as AppSong);
      }

      if (activeQueueRef.current.length === 0) {
        try {
          const savedQueue = await AsyncStorage.getItem(ACTIVE_QUEUE_KEY);
          const savedIndex = await AsyncStorage.getItem(ACTIVE_QUEUE_INDEX_KEY);
          const savedContext = await AsyncStorage.getItem(ACTIVE_QUEUE_CONTEXT_KEY);
          if (savedQueue) {
            const parsedQueue = JSON.parse(savedQueue)
              .map(normalizeSong)
              .filter((song: AppSong) => !isYouTubeSong(song));
            if (parsedQueue.length > 0) {
              activeQueueRef.current = parsedQueue;
              setActiveQueue(parsedQueue);
              const parsedIndex = Number(savedIndex || 0);
              const safeIndex = Number.isNaN(parsedIndex)
                ? 0
                : Math.max(0, Math.min(parsedIndex, parsedQueue.length - 1));
              activeQueueIndexRef.current = safeIndex;
              setActiveQueueIndex(safeIndex);
            }
          }
          if (savedContext && activeQueueContextRef.current.source === "unknown") {
            activeQueueContextRef.current = normalizePlaybackQueueContext(
              JSON.parse(savedContext)
            );
            setActiveQueueContext(activeQueueContextRef.current);
          }
        } catch (error) {
          logLockscreenPlaybackDiagnostic("queue_restore_failed", {
            reason: "queue_context_parse",
            message: String((error as Error)?.message || error),
          });
          logLockscreenPlaybackDiagnostic("foreground_restore_queue_context_failed", {
            message: String((error as Error)?.message || error),
          });
        }
      }

      if (restoredSong) {
        const normalizedSong = normalizeSong(restoredSong);
        currentSongRef.current = normalizedSong;
        setCurrentSong(normalizedSong);

        if (activeQueueRef.current.length === 0) {
          activeQueueRef.current = [normalizedSong];
          setActiveQueue([normalizedSong]);
          activeQueueIndexRef.current = 0;
          setActiveQueueIndex(0);
        } else if (
          snapshot.activeIndex >= 0 &&
          snapshot.activeIndex < activeQueueRef.current.length
        ) {
          const savedQueueIndex = activeQueueIndexRef.current;
          if (
            shouldSkipNativeActiveIndexOverwrite(
              savedQueueIndex,
              snapshot.activeIndex,
              activeQueueRef.current.length,
              (snapshot as any).nativeQueueLength || 1
            )
          ) {
            logLockscreenPlaybackDiagnostic(
              "preserved_js_queue_index_single_native_track",
              {
                savedQueueIndex,
                nativeActiveIndex: snapshot.activeIndex,
                nativeQueueLength: (snapshot as any).nativeQueueLength || 1,
                queueLength: activeQueueRef.current.length,
                songId: normalizedSong.id || null,
              }
            );
            logLockscreenPlaybackDiagnostic(
              "foreground_queue_index_preserved_from_saved_session",
              {
                queueIndex: savedQueueIndex,
                nativeActiveIndex: snapshot.activeIndex,
                queueLength: activeQueueRef.current.length,
              }
            );
          } else {
            activeQueueIndexRef.current = snapshot.activeIndex;
            setActiveQueueIndex(snapshot.activeIndex);
          }
        }

        logLockscreenPlaybackDiagnostic("queue_restore_success", {
              queueLength: activeQueueRef.current.length,
              activeIndex: activeQueueIndexRef.current,
            });
          logLockscreenPlaybackDiagnostic("foreground_restore_success", {
          songId: normalizedSong.id || null,
          title: normalizedSong.title || null,
          isPlaying: snapshot.isPlaying,
          positionMillis: snapshot.positionMillis,
          queueLength: activeQueueRef.current.length,
          queueIndex: activeQueueIndexRef.current,
        });
      } else {
        logLockscreenPlaybackDiagnostic("foreground_restore_skipped_no_native_track", {
          nativeStatus: snapshot.nativeStatus,
          hasLoadedTrack: snapshot.hasLoadedTrack,
          isPlaying: snapshot.isPlaying,
          playbackState: snapshot.playbackState,
          reason: "unable_to_resolve_current_song",
        });
      }

      logLockscreenPlaybackDiagnostic("foreground_sync_complete", {
        restored: Boolean(restoredSong),
        hiddenAudioActive: hiddenAudioActiveRef.current,
        isPlaying: snapshot.isPlaying,
        songId: currentSongRef.current?.id || null,
      });
    } catch (error) {
      logLockscreenPlaybackDiagnostic("foreground_sync_complete", {
        restored: false,
        reason: "sync_error",
        message: String((error as Error)?.message || error),
      });
    } finally {
      foregroundResyncInFlightRef.current = false;
    }
  }, [
    getPlayableUri,
    hydrateJsPlaybackSessionFromStorage,
    reconcileHiddenAudioActiveState,
    normalizeSong,
    isYouTubeSong,
    restoreForegroundFromSavedSession,
    setActiveQueue,
    setActiveQueueIndex,
    setActiveQueueContext,
    setCurrentSong,
    setDurationMillis,
    setIsPlaying,
    setPositionMillis,
    syncNativeRemoteQueueAvailability,
  ]);


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

  const unloadCurrentSound = useCallback(async (reason = "unload_current_sound") => {
    if (hiddenAudioActiveRef.current || isHiddenAudioNativePlaybackEnabled()) {
      let nativeSnapshot: HiddenAudioNativeSnapshot | null = null;
      if (isHiddenAudioNativePlaybackEnabled()) {
        try {
          nativeSnapshot = await bridgeProbeNativePlayback();
        } catch {
          nativeSnapshot = null;
        }
      }

      const nativeRetainsPlayback = nativeSnapshotIndicatesLoadedPlayback(nativeSnapshot);
      const backgrounding = isBackgroundAppState(appStateRef.current);
      const userInitiatedStop = isUserInitiatedHiddenAudioStopReason(reason);
      const shouldPreserveHiddenAudio =
        nativeRetainsPlayback ||
        (backgrounding &&
          Boolean(currentSongRef.current) &&
          !userInitiatedStop) ||
        (backgrounding &&
          Boolean(currentSongRef.current) &&
          (isPlayingRef.current || nativeRetainsPlayback));

      if (shouldPreserveHiddenAudio) {
        if (nativeRetainsPlayback) {
          markHiddenAudioBridgeActive(true);
          hiddenAudioActiveRef.current = true;
          logLockscreenPlaybackDiagnostic("foreground_prevented_false_reset", {
            reason,
            phase: "unload_preserve_native",
            songId: currentSongRef.current?.id || null,
            nativeStatus: nativeSnapshot?.nativeStatus || null,
          });
        } else if (backgrounding && currentSongRef.current && !userInitiatedStop) {
          logLockscreenPlaybackDiagnostic("hidden_audio_unload_blocked_in_background", {
            reason,
            appState: appStateRef.current,
            songId: currentSongRef.current?.id || null,
          });
        } else if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[hidden_audio_lock] preserve_on_background_cleanup", {
            reason,
            appState: appStateRef.current,
            songId: currentSongRef.current?.id || null,
          });
        }
        return;
      }

      if (
        shouldBlockJsPlaybackStateClear(appStateRef.current, reason) &&
        (Boolean(currentSongRef.current) || activeQueueRef.current.length > 0)
      ) {
        logLockscreenPlaybackDiagnostic("js_state_clear_source_detected", {
          source: reason,
          phase: "unload_deactivate_hidden_audio",
          songId: currentSongRef.current?.id || null,
          queueLength: activeQueueRef.current.length,
        });
        logLockscreenPlaybackDiagnostic("js_state_clear_blocked_background", {
          source: reason,
          phase: "unload_deactivate_hidden_audio",
          songId: currentSongRef.current?.id || null,
          queueLength: activeQueueRef.current.length,
        });
        return;
      }

      if (
        shouldBlockJsPlaybackStateClear(appStateRef.current, reason) &&
        (Boolean(currentSongRef.current) || activeQueueRef.current.length > 0)
      ) {
        logLockscreenPlaybackDiagnostic("js_state_clear_source_detected", {
          source: reason,
          phase: "hidden_audio_active_false_blocked",
          songId: currentSongRef.current?.id || null,
          queueLength: activeQueueRef.current.length,
        });
        logLockscreenPlaybackDiagnostic("blocked_hidden_audio_active_false_while_saved_session_exists", {
          source: reason,
          songId: currentSongRef.current?.id || null,
          queueLength: activeQueueRef.current.length,
        });
        return;
      }

      hiddenAudioActiveRef.current = false;
      await deactivateHiddenAudioPlayback(reason);
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

  const applyProgressUpdateInterval = useCallback(async (reason = "unspecified") => {
    recordApplyProgressUpdateIntervalCall(reason);


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

  const deferPlaybackStartWork = useCallback(
    (label: string, work: () => void | Promise<void>) => {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        logPlayerContextDebug("persistence_deferred", { label });
      }

      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => {
          try {
            void Promise.resolve(work()).catch((error) => {
              console.log("Deferred playback start work error:", label, error);
            });
          } catch (error) {
            console.log("Deferred playback start work error:", label, error);
          }
        }, PLAYBACK_START_DEFERRED_WORK_DELAY_MS);
      });
    },
    []
  );

  const deferPlaybackSideEffects = useCallback(
    (song: AppSong, label = "playback_side_effects") => {
      deferPlaybackStartWork(label, () => {
        savePlaybackSideEffects(song);
      });
    },
    [deferPlaybackStartWork, savePlaybackSideEffects]
  );

  const persistActiveQueue = useCallback(
    async (
      queue: AppSong[],
      index: number,
      mode: ActiveQueueMode,
      context: PlaybackQueueContext = activeQueueContextRef.current
    ) => {
      try {
        const normalizedQueue = queue.map(normalizeSong);
        const serializedQueue = JSON.stringify(normalizedQueue);
        const normalizedContext = normalizePlaybackQueueContext(context);
        const serializedContext = JSON.stringify(normalizedContext);
        const persistKey = `${serializedQueue}|${index}|${mode}|${serializedContext}`;

        if (lastActiveQueuePersistRef.current === persistKey) return;

        lastActiveQueuePersistRef.current = persistKey;
        recordQueuePersistWrite(normalizedQueue.length, "persist_active_queue");

        await AsyncStorage.multiSet([
          [ACTIVE_QUEUE_KEY, serializedQueue],
          [ACTIVE_QUEUE_INDEX_KEY, String(index)],
          [ACTIVE_QUEUE_MODE_KEY, mode],
          [ACTIVE_QUEUE_CONTEXT_KEY, serializedContext],
        ]);

        storageValueCacheRef.current[ACTIVE_QUEUE_KEY] = serializedQueue;
        storageValueCacheRef.current[ACTIVE_QUEUE_INDEX_KEY] = String(index);
        storageValueCacheRef.current[ACTIVE_QUEUE_MODE_KEY] = mode;
        storageValueCacheRef.current[ACTIVE_QUEUE_CONTEXT_KEY] = serializedContext;
      } catch (error) {
        console.log("Persist active queue error:", error);
      }
    },
    [normalizeSong]
  );

  const persistActiveQueueDeferred = useCallback(
    (
      queue: AppSong[],
      index: number,
      mode: ActiveQueueMode,
      context: PlaybackQueueContext = activeQueueContextRef.current,
      label = "active_queue"
    ) => {
      deferPlaybackStartWork(label, () => {
        void persistActiveQueue(queue, index, mode, context);
      });
    },
    [deferPlaybackStartWork, persistActiveQueue]
  );

  const openPlayerForPlayableTap = useCallback((song: AppSong, source: string) => {
    const now = Date.now();
    const songId = String(song?.id || "");
    const lastOpen = lastPlayerOpenRequestRef.current;

    if (lastOpen.songId === songId && now - lastOpen.at < 1000) return;

    lastPlayerOpenRequestRef.current = { songId, at: now };
    logLockscreenPlaybackDiagnostic("playable_tap_player_open_requested", {
      source,
      songId,
      title: song?.title || "",
      queueIndex: activeQueueIndexRef.current,
      queueLength: activeQueueRef.current.length,
      contextSource: activeQueueContextRef.current.source,
    });

    try {
      router.push("/player" as never);
      logLockscreenPlaybackDiagnostic("playable_tap_player_open_success", {
        source,
        songId,
      });
    } catch (error) {
      logLockscreenPlaybackDiagnostic("playable_tap_player_open_error", {
        source,
        songId,
        message: String(error),
      });
    }
  }, []);

  const primePlaybackTapUi = useCallback(
    (
      song: AppSong,
      source: string,
      options?: {
        queueIndex?: number;
        openPlayer?: boolean;
      }
    ) => {
      const normalizedSong = normalizeSong(song);
      const openPlayer = options?.openPlayer !== false;

      logPlaybackUxSync("tap_to_player_sync_start", {
        songId: normalizedSong.id,
        source,
        queueIndex: options?.queueIndex ?? activeQueueIndexRef.current,
        queueLength: activeQueueRef.current.length,
      });

      currentSongRef.current = normalizedSong;
      setCurrentSong(normalizedSong);

      if (
        typeof options?.queueIndex === "number" &&
        activeQueueRef.current.length > 0
      ) {
        const safeIndex = Math.max(
          0,
          Math.min(options.queueIndex, activeQueueRef.current.length - 1)
        );
        activeQueueIndexRef.current = safeIndex;
        setActiveQueueIndex(safeIndex);
      }

      logPlaybackUxSync("current_song_before_navigation", {
        songId: normalizedSong.id,
        title: normalizedSong.title || "",
        source,
        queueIndex: activeQueueIndexRef.current,
      });

      setIsLoading(true);
      setIsPlaying(false);

      if (openPlayer) {
        logPlaybackUxSync("player_navigation_requested", {
          songId: normalizedSong.id,
          source,
        });
        openPlayerForPlayableTap(normalizedSong, source);
      }
    },
    [normalizeSong, openPlayerForPlayableTap, setIsLoading, setIsPlaying]
  );


  const resolvePlaybackQueue = useCallback(
    (
      song: AppSong,
      context: PlaybackQueueContext,
      providedQueue?: AppSong[],
      requestedIndex?: number
    ) => {
      const normalizedSong = normalizeSong(song);
      const normalizedContext = normalizePlaybackQueueContext(context);

      logLockscreenPlaybackDiagnostic("queue_build_start", {
        queue_context_source: normalizedContext.source,
        provided_length: providedQueue?.length ?? 0,
        song_id: normalizedSong.id,
        requested_index: requestedIndex ?? null,
      });

      const built = buildContextualPlaybackQueue({
        song: normalizedSong,
        context: normalizedContext,
        providedQueue: (providedQueue || []).map(normalizeSong),
        requestedIndex,
      });

      const nativeQueue = (built.queue as AppSong[])
        .map((item) => normalizeSong(item))
        .filter((item) => !isYouTubeSong(item));

      const safeIndex = Math.max(
        0,
        Math.min(built.activeIndex, Math.max(nativeQueue.length - 1, 0))
      );

      logContextualQueueBuilt(
        logLockscreenPlaybackDiagnostic,
        normalizedContext,
        {
          ...built,
          queue: nativeQueue,
          activeIndex: safeIndex,
        },
        normalizedSong.id
      );

      return {
        queue: nativeQueue,
        index: safeIndex,
        context: normalizedContext,
      };
    },
    [normalizeSong, isYouTubeSong]
  );

  const syncActiveQueue = useCallback(
    async (
      queue: AppSong[],
      index: number,
      mode: ActiveQueueMode,
      context: PlaybackQueueContext = DEFAULT_QUEUE_CONTEXT
    ) => {
      const normalizedQueue = queue
        .map(normalizeSong)
        .filter((song) => !isYouTubeSong(song));

      if (!normalizedQueue.length) return;

      const safeIndex = Math.max(0, Math.min(index, normalizedQueue.length - 1));
      const normalizedContext = normalizePlaybackQueueContext(context);

      setActiveQueue((previousQueue) => {
        const changed = !areSongQueuesEqual(previousQueue, normalizedQueue);
        recordQueueReferenceChange("activeQueue", changed);
        return changed ? normalizedQueue : previousQueue;
      });
      setActiveQueueIndex(safeIndex);
      setActiveQueueMode(mode);
      setActiveQueueContext(normalizedContext);

      activeQueueRef.current = normalizedQueue;
      activeQueueIndexRef.current = safeIndex;
      activeQueueModeRef.current = mode;
      activeQueueContextRef.current = normalizedContext;
      updateActiveQueueLength(normalizedQueue.length);

      logLockscreenPlaybackDiagnostic("queue_context_set", normalizedContext);
      logLockscreenPlaybackDiagnostic("active_queue_updated", {
        queueLength: normalizedQueue.length,
        activeIndex: safeIndex,
        mode,
        contextSource: normalizedContext.source,
      });
      logLockscreenPlaybackDiagnostic("active_queue_snapshot", {
        queueLength: normalizedQueue.length,
        activeIndex: safeIndex,
        trackIds: normalizedQueue.slice(0, 20).map((song) => song.id).join(","),
      });

      deferPlaybackStartWork("active_queue_and_smart_queue", () => {
        void persistActiveQueue(normalizedQueue, safeIndex, mode, normalizedContext);
        void saveSmartQueue(normalizedQueue as any);
      });

      void syncNativeRemoteQueueAvailability();
    },
    [normalizeSong, isYouTubeSong, persistActiveQueue, deferPlaybackStartWork, syncNativeRemoteQueueAvailability]
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
      if (queueLength <= 0) {
        logPlayerContextDebug("queue_invalid_index_prevented", { currentIndex, queueLength });
        return -1;
      }

      const safeCurrentIndex = Math.max(0, Math.min(currentIndex, queueLength - 1));

      if (shuffleRef.current && queueLength > 1) {
        let randomIndex = safeCurrentIndex;
        let attempts = 0;

        while (randomIndex === safeCurrentIndex && attempts < 8) {
          randomIndex = Math.floor(Math.random() * queueLength);
          attempts += 1;
        }

        const safeRandomIndex = Math.max(0, Math.min(randomIndex, queueLength - 1));
        if (safeRandomIndex < 0 || safeRandomIndex >= queueLength) {
          logPlayerContextDebug("queue_invalid_index_prevented", {
            currentIndex,
            queueLength,
            randomIndex,
          });
          return -1;
        }

        return safeRandomIndex;
      }

      const nextIndex = safeCurrentIndex + 1;

      if (nextIndex >= queueLength) {
        return repeatModeRef.current === "all" ? 0 : -1;
      }

      return nextIndex;
    },
    []
  );

  const getPreviousQueueIndex = useCallback(
    (currentIndex: number, queueLength: number) => {
      if (queueLength <= 0) {
        logPlayerContextDebug("queue_invalid_index_prevented", { currentIndex, queueLength });
        return -1;
      }

      const safeCurrentIndex = Math.max(0, Math.min(currentIndex, queueLength - 1));
      const previousIndex = safeCurrentIndex - 1;

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

  const runQueueTransition = useCallback(
    async (transition: () => Promise<void>, options?: { dropIfLocked?: boolean }) => {
      if (queueTransitionRef.current && options?.dropIfLocked) {
        logPlayerContextDebug("queue_transition_locked", {
          reason: "drop_rapid_manual_transition",
        });
        return;
      }

      const transitionTask = queueTransitionTailRef.current
        .catch(() => undefined)
        .then(async () => {
          queueTransitionRef.current = true;
          console.log("queue_transition_locked");

          try {
            await transition();
          } finally {
            queueTransitionRef.current = false;
            logPlayerContextDebug("queue_transition_released");
          }
        });

      queueTransitionTailRef.current = transitionTask.catch((error) => {
        console.log("Queue transition error:", error);
      });

      await transitionTask;
    },
    []
  );

  const getUpcomingSong = useCallback((): AppSong | null => {
    const { queue, safeIndex } = getActiveQueuePlaybackState();

    if (!queue.length || repeatModeRef.current === "one") return null;

    const nextIndex = getNextQueueIndex(safeIndex, queue.length);

    if (nextIndex < 0) return null;

    return normalizeSong(queue[nextIndex]);
  }, [getActiveQueuePlaybackState, getNextQueueIndex, normalizeSong]);

  const preloadUpcomingTrack = useCallback(
    async (upcomingSong: AppSong) => {
      if (hiddenAudioActiveRef.current) return;
      if (preloadInFlightRef.current) return;
      if (preloadedSongIdRef.current === upcomingSong.id) return;

      const playableUri = getPlayableUri(upcomingSong);

      if (!playableUri && !upcomingSong.audio) return;

      preloadInFlightRef.current = true;

      try {
        await clearPreloadedSound();
      } catch (error) {
        console.log("Preload upcoming track cleanup error:", error);
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

    if (typeof __DEV__ !== "undefined" && __DEV__) {
      logPlayerContextDebug("[audio-preload] preload-hit", { songId });
    }

    const sound = preloadedSoundRef.current;
    preloadedSoundRef.current = null;
    preloadedSongIdRef.current = null;
    preloadInFlightRef.current = false;

    return sound;
  }, []);

  const preloadIdlePlayableTrack = useCallback(
    async (song: AppSong, options?: { source?: string }) => {
      const source = options?.source || "idle";

      const logSkip = (reason: string) => {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          logPlayerContextDebug("[audio-preload] preload-skip", {
            reason,
            source,
            songId: song?.id,
          });
        }
      };

      if (hiddenAudioActiveRef.current) {
        logSkip("hidden_audio_active");
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

      if (soundRef.current && isPlayingRef.current) {
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
        soundRef.current
      ) {
        logSkip("already_current");
        return;
      }

      if (preloadedSongIdRef.current === normalizedSong.id) {
        logSkip("already_preloaded");
        return;
      }

      if (typeof __DEV__ !== "undefined" && __DEV__) {
        logPlayerContextDebug("[audio-preload] preload-start", {
          songId: normalizedSong.id,
          source,
        });
      }

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
      const sound = soundRef.current;

      if (typeof __DEV__ !== "undefined" && __DEV__) {
        logPlayerContextDebug("[tap-interrupt]", {
          hasCurrentSound: Boolean(sound),
          hasPreloadedSound: Boolean(preloadedSoundRef.current),
          currentSongId: currentSongRef.current?.id || null,
          targetSongId: targetSongId || null,
        });
      }

      clearFinishWatchdog("user_tap_interrupt");

      if (hiddenAudioActiveRef.current) {
        try {
          hiddenAudioActiveRef.current = false;
          await deactivateHiddenAudioPlayback("user_tap_interrupt");
        } catch (error) {
          console.log("Interrupt hidden_audio playback error:", error);
        }
      }


      const preservePreloadForTap =
        Boolean(targetSongId) &&
        targetSongId === preloadedSongIdRef.current &&
        Boolean(preloadedSoundRef.current);

      if (preservePreloadForTap) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          logPlayerContextDebug("[audio-preload] preload-preserved-for-tap", {
            songId: targetSongId,
          });
        }
      } else if (preloadedSoundRef.current) {
        try {
          await clearPreloadedSound();
        } catch (error) {
          console.log("Interrupt preloaded sound error:", error);
        }
      }

      if (sound) {
        try {
          const status = await sound.getStatusAsync();

          if (status.isLoaded) {
            sound.setOnPlaybackStatusUpdate(null);

            try {
              await sound.stopAsync();
            } catch {}

            try {
              await sound.unloadAsync();
            } catch {}
          }
        } catch (error) {
          console.log("Interrupt legacy playback error:", error);
        } finally {
          if (soundRef.current === sound) {
            soundRef.current = null;
          }
        }
      }

      setIsPlaying(false);
    },
    [clearFinishWatchdog, clearPreloadedSound, clearIntentionalPause, markIntentionalPause, setIsPlaying]
  );

  const nextSong = useCallback(async (options?: { source?: "remote" | "app" }) => {
    if (options?.source !== "remote" && !queueControlTapGuardRef.current("next_song")) return;
    logLockscreenPlaybackDiagnostic("app_next_pressed", {
      songId: currentSongRef.current?.id || null,
      queueIndex: activeQueueIndexRef.current,
      queueLength: activeQueueRef.current.length,
    });
    const { queue } = getActiveQueuePlaybackState();

    logQueuePlaybackEvent("queue_next_start", {
      queueLength: queue.length,
      songId: currentSongRef.current?.id,
      queueIndex: activeQueueIndexRef.current,
    });

    logAutoNextAttempt({
      source: "nextSong",
      repeatMode: repeatModeRef.current,
      shuffle: shuffleRef.current,
      queueLength: queue.length,
    });

    await runQueueTransition(async () => {
      const { queue, safeIndex: currentIndex } = getActiveQueuePlaybackState();

      if (!queue.length) {
        logLockscreenPlaybackDiagnostic("auto_next_advance_blocked", {
          reason: "queue_empty",
          source: "nextSong",
        });
        logAutoNextSkipped("queue_empty", { source: "nextSong_native_audio" });
        return;
      }

      const nextIndex = getNextQueueIndex(
        currentIndex,
        queue.length
      );

      if (nextIndex === -1) {
        logQueuePlaybackEvent("queue_end_reached", {
          currentIndex,
          queueLength: queue.length,
          repeatMode: repeatModeRef.current,
        });

        logHTAutoNext("reason", {
          reason: "no-next",
          currentIndex,
          queueLength: queue.length,
          nextIndex: -1,
        });

        if (!smartAutoplayEnabledRef.current) {
          logAutoNextSkipped("queue_ended_smart_autoplay_disabled", {
            queueLength: queue.length,
            repeatMode: repeatModeRef.current,
          });
          setIsPlaying(false);
          setPositionMillis(0);
          setDurationMillis(0);
          return;
        }

        if (isBackgroundAppState(appStateRef.current)) {
          logAutoNextSkipped("background_pending_smart_extend", {
            queueLength: queue.length,
          });
          pendingSmartExtendRef.current = true;
          setIsPlaying(false);
          setPositionMillis(0);
          setDurationMillis(0);
          return;
        }

        const extended = await extendQueueWithSmartTracksRef.current?.();

        if (!extended && await tryAdvanceViaEmotionalQueueRef.current()) {
          logAutoNextSuccess({ reason: "emotional_queue_after_context_exhausted", queueLength: queue.length });
          return;
        }

        if (!extended) {
          logAutoNextFailure({
            reason: "smart_extend_failed",
            queueLength: queue.length,
          });
          setIsPlaying(false);
          setPositionMillis(0);
          setDurationMillis(0);
        } else {
          logAutoNextSuccess({ reason: "smart_extend", queueLength: queue.length });
        }

        return;
      }

      const safeIndex = Math.max(0, Math.min(nextIndex, queue.length - 1));
      const song = normalizeSong(queue[safeIndex]);
      logLockscreenPlaybackDiagnostic("auto_next_advance_start", {
        nextIndex: safeIndex,
        nextSongId: song.id,
        queueLength: queue.length,
      });

      logHTAutoNext("currentIndex", { currentIndex });
      logHTAutoNext("queueLength", { queueLength: queue.length });
      logHTAutoNext("nextIndex", { nextIndex: safeIndex, nextSongId: song.id });

      setActiveQueueIndex(safeIndex);
      activeQueueIndexRef.current = safeIndex;

      await removeStoredValues([POSITION_KEY]);
      logLockscreenPlaybackDiagnostic("auto_next_position_cleared_before_load", {
        nextSongId: song.id,
        nextIndex: safeIndex,
        queueLength: queue.length,
      });

      await loadAndPlayRef.current?.(song);
      logAutoNextSuccess({
        nextSongId: song.id,
        nextIndex: safeIndex,
        shuffle: shuffleRef.current,
        repeatMode: repeatModeRef.current,
      });
      logQueuePlaybackEvent("queue_next_success", {
        nextSongId: song.id,
        nextIndex: safeIndex,
        queueLength: queue.length,
      });
      logLockscreenPlaybackDiagnostic("auto_next_advance_success", {
        nextSongId: song.id,
        nextIndex: safeIndex,
        queueLength: queue.length,
      });

      persistActiveQueueDeferred(
        queue,
        safeIndex,
        activeQueueModeRef.current,
        activeQueueContextRef.current,
        "queue_index_persist"
      );
    }, { dropIfLocked: true });
  }, [
    runQueueTransition,
    getActiveQueuePlaybackState,
    getNextQueueIndex,
    setIsPlaying,
    normalizeSong,
    persistActiveQueueDeferred,
    removeStoredValues,
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

        logQueuePlaybackEvent("queue_repeat_one_restart", {
          songId: currentSongRef.current?.id,
          engine: hiddenAudioActiveRef.current ? "hidden_audio" : "legacy",
        });

        if (hiddenAudioActiveRef.current) {
          clearFinishWatchdog("repeat_one");
          void removeStoredValues([POSITION_KEY]);
          await bridgeSeekTo(0);
          setPositionMillis(0);
          await bridgeHiddenAudioPlay();
          const progress = await bridgeGetProgress();
          setIsPlaying(progress.isPlaying);
          if (progress.durationMillis > 0) {
            setDurationMillis(progress.durationMillis);
          }
          logAutoNextSuccess({ reason: "repeat_one_restart_hidden_audio" });
        } else {
          const activeSound = soundRef.current;

          if (activeSound) {
            await activeSound.setPositionAsync(0);
            await activeSound.playAsync();
            logPlayerContextDebug("hidden_audio_fake_play_prevented", {
              reason: "legacy_playback_not_state_source",
            });
            setIsPlaying(false);
            logAutoNextSuccess({ reason: "repeat_one_restart" });
          } else {
            logAutoNextFailure({ reason: "repeat_one_sound_unloaded" });
          }
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
    setPositionMillis,
    setDurationMillis,
    clearLoadingRecoveryTimeout,
    clearFinishWatchdog,
  ]);

  handleTrackFinishedRef.current = handleTrackFinished;

  const scheduleTrackAdvance = useCallback(() => {
    const { queue, safeIndex } = getActiveQueuePlaybackState();
    const nextIndex = getNextQueueIndex(safeIndex, queue.length);
    const backgroundNativeEndAdvance =
      hiddenAudioActiveRef.current &&
      isBackgroundAppState(appStateRef.current) &&
      backgroundAdvanceFromNativeEndRef.current;

    const naturalBackgroundQueueEnd =
      hiddenAudioActiveRef.current &&
      isBackgroundAppState(appStateRef.current) &&
      nextIndex === -1 &&
      repeatModeRef.current === "off";

    if (
      naturalBackgroundQueueEnd &&
      !backgroundAdvanceFromNativeEndRef.current
    ) {
      logLockscreenPlaybackDiagnostic("schedule_track_advance_no_next_track", {
        source: "scheduleTrackAdvance",
        songId: currentSongRef.current?.id || null,
        queueLength: queue.length,
        currentIndex: safeIndex,
        nextIndex,
        repeatMode: repeatModeRef.current,
      });
      logLockscreenPlaybackDiagnostic("background_queue_ended_naturally", {
        songId: currentSongRef.current?.id || null,
        queueLength: queue.length,
        currentIndex: safeIndex,
        repeatMode: repeatModeRef.current,
        smartAutoplayEnabled: smartAutoplayEnabledRef.current,
      });
      logLockscreenPlaybackDiagnostic("background_unexpected_stop_suppressed_queue_end", {
        source: "scheduleTrackAdvance_blocked_background",
        songId: currentSongRef.current?.id || null,
        appState: appStateRef.current,
      });

      if (!smartAutoplayEnabledRef.current) {
        return;
      }
    }

    if (
      hiddenAudioActiveRef.current &&
      isBackgroundAppState(appStateRef.current) &&
      !backgroundAdvanceFromNativeEndRef.current
    ) {
      logLockscreenPlaybackDiagnostic("background_unexpected_stop_detected", {
        source: "scheduleTrackAdvance_blocked_background",
        songId: currentSongRef.current?.id || null,
        appState: appStateRef.current,
      });
      logLockscreenPlaybackDiagnostic("background_stop_source_detected", {
        source: "js_poll_or_catchup",
        songId: currentSongRef.current?.id || null,
      });
      return;
    }
    backgroundAdvanceFromNativeEndRef.current = false;

    if (backgroundNativeEndAdvance && nextIndex === -1 && repeatModeRef.current === "off") {
      logLockscreenPlaybackDiagnostic("schedule_track_advance_no_next_track", {
        source: "scheduleTrackAdvance",
        songId: currentSongRef.current?.id || null,
        queueLength: queue.length,
        currentIndex: safeIndex,
        nextIndex,
        repeatMode: repeatModeRef.current,
      });
      logLockscreenPlaybackDiagnostic("background_queue_ended_naturally", {
        songId: currentSongRef.current?.id || null,
        queueLength: queue.length,
        currentIndex: safeIndex,
        smartAutoplayEnabled: smartAutoplayEnabledRef.current,
      });
    }

    if (backgroundNativeEndAdvance && nextIndex !== -1) {
      logLockscreenPlaybackDiagnostic("background_auto_next_load_allowed", {
        songId: currentSongRef.current?.id || null,
        queueLength: queue.length,
        currentIndex: safeIndex,
        nextIndex,
      });
    }

    if (isChangingTrackRef.current || autoAdvanceRef.current) {
      logPlayerContextDebug("queue_duplicate_advance_prevented", {
        reason: isChangingTrackRef.current ? "changing_track" : "already_advancing",
        songId: currentSongRef.current?.id || "",
      });
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

    if (!soundRef.current && !hiddenAudioActiveRef.current) {
      logAutoNextSkipped("sound_unloaded", { songId: currentSongRef.current?.id });
      logHTAutoNext("reason", {
        reason: "paused-no-sound",
        currentIndex: safeIndex,
        queueLength: queue.length,
        nextIndex,
      });
      return;
    }

    logLockscreenPlaybackDiagnostic("auto_next_event_received", {
      source: "scheduleTrackAdvance",
      songId: currentSongRef.current?.id || null,
      queueLength: queue.length,
      currentIndex: safeIndex,
      nextIndex,
    });

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

    if (
      lastAutoAdvanceRequestRef.current.songId === songId &&
      now - lastAutoAdvanceRequestRef.current.requestedAt < FINISH_DEBOUNCE_MS
    ) {
      logPlayerContextDebug("queue_duplicate_advance_prevented", {
        reason: "duplicate_auto_advance_request",
        songId,
      });
      return;
    }

    lastAutoAdvanceRequestRef.current = { songId, requestedAt: now };
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

      const songId = currentSongRef.current?.id || "";
      logHTLockAutoNext("check", {
        songId,
        source: sourceDuration ? "watchdog" : "end-check",
      });

      const sound = soundRef.current;
      if (!sound || isChangingTrackRef.current || autoAdvanceRef.current) {
        return;
      }

      try {
        const status = await sound.getStatusAsync();

        if (!status.isLoaded || currentSongRef.current?.id !== songId) {
          return;
        }

        const statusPosition = status.positionMillis || 0;
        const statusDuration = status.durationMillis || sourceDuration || 0;
        const nearEnd =
          statusDuration >= MIN_DURATION_FOR_POSITION_FINISH_MS &&
          statusPosition >= statusDuration - LOCK_SCREEN_END_WINDOW_MS;

        if (status.didJustFinish || (!status.isPlaying && nearEnd)) {
          logHTLockAutoNext("force-advance", {
            songId,
            position: statusPosition,
            duration: statusDuration,
            didJustFinish: Boolean(status.didJustFinish),
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
        console.log("Lock screen end check error:", error);
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
      if (hiddenAudioActiveRef.current) return;

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

    if (!smartAutoplayEnabledRef.current) return;

    const { queue, safeIndex } = getActiveQueuePlaybackState();

    if (!queue.length) return;

    if (getNextQueueIndex(safeIndex, queue.length) >= 0) {

      await scheduleTrackAdvance();
      return;
    }

    const extended = await extendQueueWithSmartTracksRef.current?.();

    if (!extended) {
      if (isHiddenAudioNativePlaybackEnabled()) {
        try {
          const snapshot = await bridgeProbeNativePlayback();
          if (nativeSnapshotIndicatesLoadedPlayback(snapshot) && snapshot?.isPlaying) {
            logLockscreenPlaybackDiagnostic("foreground_prevented_false_reset", {
              phase: "smart_extend_skip_stop",
              nativeStatus: snapshot.nativeStatus,
              songId: currentSongRef.current?.id || null,
            });
            return;
          }
        } catch {
          // fall through
        }
      }
      setIsPlaying(false);
    }
  }, [
    getActiveQueuePlaybackState,
    getNextQueueIndex,
    scheduleTrackAdvance,
    setIsPlaying,
  ]);

  const catchUpPlaybackIfEnded = useCallback(async () => {
    if (hiddenAudioActiveRef.current) {
      if (isChangingTrackRef.current || autoAdvanceRef.current) return;

      try {
        const progress = await bridgeGetProgress();
        const position = progress.positionMillis || 0;
        const duration = progress.durationMillis || 0;

        const nativeEnded =
          repeatModeRef.current !== "one" &&
          String(progress.playbackState || "").toLowerCase() === "ended";
        const nearEndWhilePaused =
          repeatModeRef.current !== "one" &&
          duration >= MIN_DURATION_FOR_POSITION_FINISH_MS &&
          position >= duration - TRACK_END_THRESHOLD_MS &&
          !progress.isPlaying;
        if (nativeEnded || nearEndWhilePaused) {
          scheduleTrackAdvance();
        }
      } catch (error) {
        console.log("Catch up hidden_audio playback error:", error);
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

      const nearEndWhilePaused =
        repeatModeRef.current !== "one" &&
        duration >= MIN_DURATION_FOR_POSITION_FINISH_MS &&
        position >= duration - TRACK_END_THRESHOLD_MS &&
        !status.isPlaying;

      if (nearEndWhilePaused) {
        scheduleTrackAdvance();
      }
    } catch (error) {
      console.log("Catch up playback error:", error);
    }
  }, [scheduleTrackAdvance]);

  const handlePlaybackStatusUpdate = useCallback(
    async (status: LegacyPlaybackStatus) => {
      if (hiddenAudioActiveRef.current) return;
      if (!status.isLoaded) return;

      recordRuntimePlaybackProgressUpdate("hidden_audio", appStateRef.current);

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

      if (status.didJustFinish && !isChangingTrackRef.current) {
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
        now - lastPositionSaveRef.current >
          getPositionSaveIntervalMs(appStateRef.current) &&
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
      getActiveQueuePlaybackState,
      getNextQueueIndex,
      getUpcomingSong,
      preloadUpcomingTrack,
      savePlaybackPosition,
    ]
  );

  const loadAndPlay = useCallback(
    async (song: AppSong, options?: LoadAndPlayOptions) => {
      let requestId = 0;

      try {
        const normalizedSong = normalizeSong(song);
        const recoveryQueueSnapshot = activeQueueRef.current.slice();
        const recoveryQueueIndexSnapshot = activeQueueIndexRef.current;
        const recoveryQueueModeSnapshot = activeQueueModeRef.current;
        const recoverySongSnapshot = currentSongRef.current;
        const recoveryPositionSnapshot = positionMillisRef.current;
        const recoveryDurationSnapshot = durationMillisRef.current;

        const restorePreviousPlaybackState = (reason: string) => {
          logPlayerContextDebug("playback_recovery_restore_previous", {
            reason,
            failedSongId: normalizedSong.id,
            previousSongId: recoverySongSnapshot?.id || null,
          });

          const safeQueueIndex = recoveryQueueSnapshot.length
            ? Math.max(
                0,
                Math.min(recoveryQueueIndexSnapshot, recoveryQueueSnapshot.length - 1)
              )
            : 0;

          setCurrentSong(recoverySongSnapshot);
          currentSongRef.current = recoverySongSnapshot;
          setActiveQueue(recoveryQueueSnapshot);
          activeQueueRef.current = recoveryQueueSnapshot;
          setActiveQueueIndex(safeQueueIndex);
          activeQueueIndexRef.current = safeQueueIndex;
          setActiveQueueMode(recoveryQueueModeSnapshot);
          activeQueueModeRef.current = recoveryQueueModeSnapshot;
          setPositionMillis(recoveryPositionSnapshot);
          setDurationMillis(recoveryDurationSnapshot);
        };

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
        armLoadingRecoveryTimeout(requestId, normalizedSong.id);

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
          console.log(
            "Blocked native YouTube playback. Use /youtube-player WebView instead."
          );
          setIsPlaying(false);
          setIsLoading(false);
          return;
        }

        if (recoverySongSnapshot?.id !== normalizedSong.id || autoAdvanceRef.current) {
          clearIntentionalPause("new_track");
        }

        setCurrentSong(normalizedSong);
        currentSongRef.current = normalizedSong;
        logLockscreenPlaybackDiagnostic("current_song_state_set", {
          songId: normalizedSong.id,
          title: normalizedSong.title,
          requestId,
          userInitiated: Boolean(options?.userInitiated),
        });

        if (options?.userInitiated) {
          openPlayerForPlayableTap(normalizedSong, "load_and_play");
        }

        if (
          !skipEmotionalQueueRefreshRef.current &&
          !radioModeRef.current
        ) {
          deferPlaybackStartWork("emotional_queue_refresh", () =>
            refreshEmotionalQueueForTrack(appSongToTrack(normalizedSong), 20).then(() => undefined)
          );
        }

        isChangingTrackRef.current = true;
        setIsLoading(true);

        const shouldRestorePosition =
          currentSongRef.current?.id === normalizedSong.id;

        const useHiddenAudio = await shouldUseHiddenAudioPlayback();
        const selectedPlayableUri = getPlayableUri(normalizedSong);
        logPlaybackCritical("playback_engine_selected", {
          songId: normalizedSong.id,
          platform: Platform.OS,
          engine: useHiddenAudio ? "hidden_audio" : "unavailable",
          hasPlayableUri: Boolean(selectedPlayableUri),
        });

        if (useHiddenAudio) {
          try {
            const playableUri = selectedPlayableUri;

            if (!playableUri) {
              logPlayerContextDebug("playback_recovery_invalid_url", {
                songId: normalizedSong.id,
              });
              logAudioLoadFailure({
                songId: normalizedSong.id,
                reason: "missing_audio_source",
                engine: "hidden_audio",
              });
              restorePreviousPlaybackState("missing_audio_source");
              setIsPlaying(false);
              return;
            }

            if (
              loadRequestIdRef.current !== requestId ||
              !isMountedRef.current
            ) {
              logPlayerContextDebug("playback_recovery_stale_request_ignored", {
                songId: normalizedSong.id,
                requestId,
                latestRequestId: loadRequestIdRef.current,
              });
              return;
            }

            logPlayerContextDebug("current_song_state_set", {
              songId: normalizedSong.id,
              requestId,
            });

            let preserveNativePlayback = false;
            if (isHiddenAudioNativePlaybackEnabled()) {
              try {
                const existingSnapshot = await bridgeProbeNativePlayback();
                const nativeEnded = nativeSnapshotIsEnded(existingSnapshot);
                const requestedSameTrack =
                  existingSnapshot?.activeTrack?.url === playableUri ||
                  recoverySongSnapshot?.id === normalizedSong.id;
                const sameTrackLoaded =
                  !nativeEnded &&
                  nativeSnapshotIndicatesLoadedPlayback(existingSnapshot) &&
                  requestedSameTrack;
                preserveNativePlayback = Boolean(sameTrackLoaded && existingSnapshot?.isPlaying);

                if (nativeEnded) {
                  logLockscreenPlaybackDiagnostic("preserve_native_skipped_because_ended", {
                    source: "load_and_play_same_track",
                    songId: normalizedSong.id,
                    previousSongId: recoverySongSnapshot?.id || null,
                    nativeStatus: existingSnapshot?.nativeStatus || null,
                    playbackState: existingSnapshot?.playbackState || null,
                  });
                  if (recoverySongSnapshot?.id !== normalizedSong.id) {
                    logLockscreenPlaybackDiagnostic("auto_next_native_ended_requires_reload", {
                      songId: normalizedSong.id,
                      previousSongId: recoverySongSnapshot?.id || null,
                      nativeStatus: existingSnapshot?.nativeStatus || null,
                      playbackState: existingSnapshot?.playbackState || null,
                    });
                  }
                }

                if (preserveNativePlayback) {
                  logLockscreenPlaybackDiagnostic("foreground_restore_skipped_because_native_alive", {
                    source: "load_and_play_same_track",
                    songId: normalizedSong.id,
                    nativeStatus: existingSnapshot?.nativeStatus || null,
                  });
                  markHiddenAudioBridgeActive(true);
                  hiddenAudioActiveRef.current = true;
                }
              } catch {
                preserveNativePlayback = false;
              }
            }

            if (!preserveNativePlayback) {
              setIsPlaying(false);
              setPositionMillis(0);
              positionMillisRef.current = 0;
              setDurationMillis(0);
              durationMillisRef.current = 0;
            }

            if (
              preloadedSongIdRef.current &&
              preloadedSongIdRef.current !== normalizedSong.id
            ) {
              await clearPreloadedSound();
            }

            if (!preserveNativePlayback) {
              await unloadCurrentSound("load_and_play_replace_track");
            }

            if (
              loadRequestIdRef.current !== requestId ||
              !isMountedRef.current
            ) {
              logPlayerContextDebug("playback_recovery_stale_request_ignored", {
                songId: normalizedSong.id,
                requestId,
                latestRequestId: loadRequestIdRef.current,
              });
              return;
            }

            let startPositionSeconds = 0;

            if (shouldRestorePosition) {
              try {
                const savedPosition = await AsyncStorage.getItem(POSITION_KEY);
                const millis = Number(savedPosition);

                if (!Number.isNaN(millis) && millis > 0) {
                  startPositionSeconds = millis / 1000;
                }
              } catch (error) {
                console.log("Restore hidden_audio position error:", error);
              }
            }

            const durationSeconds = getSongDurationSeconds(normalizedSong);
            const artworkUrl = typeof getArtworkValue(normalizedSong) === "string"
              ? String(getArtworkValue(normalizedSong))
              : "";

            if (preserveNativePlayback) {
              currentSongRef.current = normalizedSong;
              setCurrentSong(normalizedSong);
              await syncNativeRemoteQueueAvailability();
              const statusAfterPreserve = await syncHiddenAudioState(
                "load_and_play_preserve_native"
              );
              logLockscreenPlaybackDiagnostic("foreground_preserved_existing_session", {
                source: "load_and_play_preserve_native",
                songId: normalizedSong.id,
                isPlaying: statusAfterPreserve?.isPlaying ?? null,
              });
              logAudioLoadSuccess({
                songId: normalizedSong.id,
                requestId,
                engine: "hidden_audio",
              });
              deferPlaybackSideEffects(normalizedSong, "load_and_play_side_effects");
              return;
            }

            await bridgeHiddenAudioUpdateNowPlaying({
              title: normalizedSong.title || "Unknown Song",
              artist: normalizedSong.artist || "Unknown Artist",
              album: normalizedSong.album || "",
              durationSeconds,
              positionSeconds: startPositionSeconds,
              artworkUrl,
            });

            logPlayerContextDebug("hidden_audio_play_start", {
              songId: normalizedSong.id,
              requestId,
            });

            if (autoAdvanceRef.current && isBackgroundAppState(appStateRef.current)) {
              logLockscreenPlaybackDiagnostic("background_auto_next_native_reload_start", {
                songId: normalizedSong.id,
                requestId,
                appState: appStateRef.current,
              });
            }

            logPlaybackCritical("hidden_audio_load_start", {
              songId: normalizedSong.id,
              platform: Platform.OS,
              hasPlayableUri: Boolean(playableUri),
            });

            await activateHiddenAudioPlayback({
              url: playableUri,
              title: normalizedSong.title || "Unknown Song",
              artist: normalizedSong.artist || "Unknown Artist",
              album: normalizedSong.album || "",
              durationSeconds,
              positionSeconds: startPositionSeconds,
              artworkUrl,
            });

            if (
              loadRequestIdRef.current !== requestId ||
              !isMountedRef.current
            ) {
              return;
            }

            hiddenAudioActiveRef.current = true;
            await syncNativeRemoteQueueAvailability();

            const startPositionMillis = Math.round(startPositionSeconds * 1000);
            const statusAfterPlay = await syncHiddenAudioState("load_and_play_after_play");
            logPlayerContextDebug("hidden_audio_status_after_play", statusAfterPlay);

            if (statusAfterPlay) {
              const resolvedPositionMillis =
                statusAfterPlay.positionMillis > 0
                  ? statusAfterPlay.positionMillis
                  : startPositionMillis;
              const resolvedDurationMillis =
                statusAfterPlay.durationMillis > 0
                  ? statusAfterPlay.durationMillis
                  : Math.round(durationSeconds * 1000);

              setPositionMillis(resolvedPositionMillis);
              if (resolvedDurationMillis > 0) {
                setDurationMillis(resolvedDurationMillis);
              }
              setIsPlaying(statusAfterPlay.isPlaying);

              if (!statusAfterPlay.isPlaying) {
                logPlaybackCritical("hidden_audio_play_failure", {
                  songId: normalizedSong.id,
                  platform: Platform.OS,
                  reason: "native_status_not_playing_after_play",
                  playbackState: statusAfterPlay.playbackState || null,
                });
                logPlayerContextDebug("hidden_audio_fake_play_prevented", {
                  songId: normalizedSong.id,
                  reason: "native_status_not_playing_after_play",
                });
              } else {
                logPlaybackCritical("hidden_audio_play_success", {
                  songId: normalizedSong.id,
                  platform: Platform.OS,
                  playbackState: statusAfterPlay.playbackState || null,
                });
              }
            } else {
              logPlaybackCritical("hidden_audio_play_failure", {
                songId: normalizedSong.id,
                platform: Platform.OS,
                reason: "native_status_unavailable_after_play",
              });
              logPlayerContextDebug("hidden_audio_fake_play_prevented", {
                songId: normalizedSong.id,
                reason: "native_status_unavailable_after_play",
              });
              setIsPlaying(false);
            }

            logAudioLoadSuccess({
              songId: normalizedSong.id,
              requestId,
              engine: "hidden_audio",
            });
            logPlaybackStarted({
              songId: normalizedSong.id,
              requestId,
              engine: "hidden_audio",
            });
            if (autoAdvanceRef.current && isBackgroundAppState(appStateRef.current)) {
              logLockscreenPlaybackDiagnostic("background_auto_next_play_confirmed", {
                songId: normalizedSong.id,
                requestId,
                appState: appStateRef.current,
              });
            }
            logPlayerContextDebug("ui_unblocked_after_play", {
              songId: normalizedSong.id,
              requestId,
            });

            void removeStoredValues([POSITION_KEY]);
            deferPlaybackSideEffects(normalizedSong, "load_and_play_side_effects");
          } catch (error) {
            logPlayerContextDebug("hidden_audio_play_failed", error);
            console.log("Hidden audio load and play error:", error);
            logAudioLoadFailure({
              songId: normalizedSong.id,
              reason: String(
                (error as Error)?.message || "hidden_audio_load_error"
              ),
              engine: "hidden_audio",
            });
            hiddenAudioActiveRef.current = false;
            logPlayerContextDebug("playback_recovery_load_failed", {
              songId: normalizedSong.id,
              requestId,
              error: String((error as Error)?.message || error),
            });
            restorePreviousPlaybackState("hidden_audio_load_play_failed");
            setIsPlaying(false);
          } finally {
            if (loadRequestIdRef.current === requestId) {
              clearLoadingRecoveryTimeout();
              isChangingTrackRef.current = false;
              if (inFlightPlaySongIdRef.current === normalizedSong.id) {
                inFlightPlaySongIdRef.current = null;
              }
              if (isMountedRef.current) {
                logPlayerContextDebug("playback_recovery_loading_cleared", {
                  requestId,
                  songId: normalizedSong.id,
                  reason: "hidden_audio_complete",
                });
                setIsLoading(false);
              }
            } else {
              logPlayerContextDebug("playback_recovery_stale_request_ignored", {
                requestId,
                songId: normalizedSong.id,
                latestRequestId: loadRequestIdRef.current,
              });
            }
          }

          return;
        }

        void configureAudio("load_and_play_native_audio");

        logAudioLoadFailure({
          songId: normalizedSong.id,
          reason: "native_audio_engine_unavailable",
        });
        logPlayerContextDebug("playback_recovery_load_failed", {
          songId: normalizedSong.id,
          requestId,
          reason: "native_audio_engine_unavailable",
        });
        restorePreviousPlaybackState("native_audio_engine_unavailable");
        setIsPlaying(false);
        return;
        await applyProgressUpdateInterval("load_and_play_native_audio");
      } catch (error) {
        console.log("Load and play error:", error);
        logAudioLoadFailure({
          songId: song?.id,
          reason: String((error as Error)?.message || "load_and_play_error"),
        });
        setIsPlaying(false);
      } finally {
        if (loadRequestIdRef.current === requestId) {
          clearLoadingRecoveryTimeout();
          isChangingTrackRef.current = false;
          if (inFlightPlaySongIdRef.current === song?.id) {
            inFlightPlaySongIdRef.current = null;
          }
          if (isMountedRef.current) {
            logPlayerContextDebug("playback_recovery_loading_cleared", {
              requestId,
              songId: song?.id,
              reason: "load_and_play_complete",
            });
            setIsLoading(false);
          }
        } else {
          logPlayerContextDebug("playback_recovery_stale_request_ignored", {
            requestId,
            songId: song?.id,
            latestRequestId: loadRequestIdRef.current,
          });
        }
      }
    },
    [
      normalizeSong,
      isYouTubeSong,
      clearPreloadedSound,
      interruptCurrentPlaybackForUserTap,
      unloadCurrentSound,
      getActiveQueuePlaybackState,
      getPlayableUri,
      getSongDurationSeconds,
      handlePlaybackStatusUpdate,
      takePreloadedSound,
      applyProgressUpdateInterval,
        setIsPlaying,
      setPositionMillis,
      setDurationMillis,
      deferPlaybackSideEffects,
      deferPlaybackStartWork,
      openPlayerForPlayableTap,
      removeStoredValues,
      configureAudio,
      clearLoadingRecoveryTimeout,
      clearFinishWatchdog,
      clearIntentionalPause,
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

      persistActiveQueueDeferred(
        queue,
        safeIndex,
        activeQueueModeRef.current,
        activeQueueContextRef.current,
        "queue_index_persist"
      );
      void removeStoredValues([POSITION_KEY]);

      await loadAndPlay(song, { userInitiated: true });
    },
    [
      isYouTubeSong,
      normalizeSong,
      persistActiveQueueDeferred,
      removeStoredValues,
      loadAndPlay,
      syncActiveQueue,
    ]
  );

  loadAndPlayRef.current = (song, options) => loadAndPlay(song, options);

  tryAdvanceViaEmotionalQueueRef.current = async () => {
    if (radioModeRef.current) {
      return false;
    }

    const current = currentSongRef.current;

    if (!current || isYouTubeSong(current)) {
      return false;
    }

    if (!hasMoreEmotionalQueueTracks()) {
      return false;
    }

    const nextTrack = advanceEmotionalQueueState();

    if (!nextTrack) {
      return false;
    }

    skipEmotionalQueueRefreshRef.current = true;

    try {
      await loadAndPlayRef.current?.(trackToAppSong(nextTrack), {
        userInitiated: false,
      });
      return true;
    } finally {
      skipEmotionalQueueRefreshRef.current = false;
    }
  };

  const extendQueueWithSmartTracks = useCallback(async () => {
    try {
      logLockscreenPlaybackDiagnostic("smart_continuation_requested", {
        queueLength: activeQueueRef.current.length,
        queueIndex: activeQueueIndexRef.current,
        contextSource: activeQueueContextRef.current.source,
      });

      const { queue: smartQueue, safeIndex: smartIndex } = getActiveQueuePlaybackState();
      if (getNextQueueIndex(smartIndex, smartQueue.length) >= 0) {
        logLockscreenPlaybackDiagnostic("smart_continuation_skipped_queue_not_exhausted", {
          queueLength: smartQueue.length,
          queueIndex: smartIndex,
        });
        return false;
      }

      if (!smartAutoplayEnabledRef.current) return false;

      const current = currentSongRef.current;
      if (!current) return false;

      const context = activeQueueContextRef.current;
      const memory = await getSmartQueue();
      const currentQueue = activeQueueRef.current.filter(
        (song) => !isYouTubeSong(song)
      );

      const catalogSongs = (getCachedHiddenTunesCatalog()?.songs || [])
        .map((song) => normalizeSong(song as AppSong))
        .filter((song) => !isYouTubeSong(song));

      const combinedLibrary = [...currentQueue, ...catalogSongs, ...(memory as any[])]
        .map((song) => normalizeSong(song))
        .filter((song) => !isYouTubeSong(song));

      const existingIds = new Set(currentQueue.map((song) => song.id));

      logLockscreenPlaybackDiagnostic("smart_queue_candidate_pool", {
        poolSize: combinedLibrary.length,
        queueLength: currentQueue.length,
        catalogSize: catalogSongs.length,
        memorySize: memory.length,
        contextSource: context.source,
        currentSongId: current.id,
      });

      const scoredCandidates = combinedLibrary
        .map((song, index) => ({
          song,
          ...scoreSmartContinuationCandidate(song, current, context, index),
        }))
        .filter((entry) => entry.score > 0)
        .filter((entry) => entry.song.id !== current.id)
        .filter((entry) => !existingIds.has(entry.song.id))
        .filter((entry) => Boolean(getPlayableUri(entry.song)))
        .sort((left, right) => right.score - left.score);

      const seen = new Set<string>();
      const freshRelated = scoredCandidates
        .filter((entry) => {
          if (seen.has(entry.song.id)) return false;
          seen.add(entry.song.id);
          return true;
        })
        .slice(0, 12)
        .map((entry) => entry.song);

      if (!freshRelated.length) {
        logLockscreenPlaybackDiagnostic("smart_queue_fallback_used", {
          reason: "no_scored_candidates",
          contextSource: context.source,
        });
        return false;
      }

      const topPick = scoredCandidates[0];
      const selectionReason = topPick?.reason || "catalog_fallback";
      const usedFallback =
        selectionReason.includes("fallback") || selectionReason === "catalog_fallback";

      logLockscreenPlaybackDiagnostic("smart_queue_selected", {
        nextSongId: freshRelated[0]?.id || null,
        nextTitle: freshRelated[0]?.title || null,
        added: freshRelated.length,
        score: topPick?.score || 0,
      });
      logLockscreenPlaybackDiagnostic("smart_queue_reason", {
        reason: selectionReason,
        contextSource: context.source,
        currentSongId: current.id,
      });
      if (usedFallback) {
        logLockscreenPlaybackDiagnostic("smart_queue_fallback_used", {
          reason: selectionReason,
          contextSource: context.source,
        });
      }

      const updatedQueue = [...currentQueue, ...freshRelated];
      const nextIndex = currentQueue.length;
      const nextContext = normalizePlaybackQueueContext(
        {
          ...context,
          source: context.source === "unknown" ? "smart_queue" : context.source,
          label: context.label || "Smart continuation",
        },
        "smart_queue"
      );

      await syncActiveQueue(updatedQueue, nextIndex, "smart", nextContext);
      await removeStoredValues([POSITION_KEY]);
      logLockscreenPlaybackDiagnostic("smart_continuation_used", {
        added: freshRelated.length,
        nextSongId: updatedQueue[nextIndex]?.id,
        previousQueueLength: currentQueue.length,
        reason: selectionReason,
      });
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
    getActiveQueuePlaybackState,
    getNextQueueIndex,
    syncActiveQueue,
    removeStoredValues,
    loadAndPlay,
  ]);

  extendQueueWithSmartTracksRef.current = extendQueueWithSmartTracks;

  const previousSong = useCallback(async (options?: { source?: "remote" | "app" }) => {
    if (options?.source !== "remote" && !queueControlTapGuardRef.current("previous_song")) return;
    logLockscreenPlaybackDiagnostic("app_previous_pressed", {
      songId: currentSongRef.current?.id || null,
      queueIndex: activeQueueIndexRef.current,
      queueLength: activeQueueRef.current.length,
    });
    const { queue: previousQueue } = getActiveQueuePlaybackState();

    logQueuePlaybackEvent("queue_previous_start", {
      queueLength: previousQueue.length,
      songId: currentSongRef.current?.id,
      queueIndex: activeQueueIndexRef.current,
    });

    logManualQueueSkip("previous", { queueLength: previousQueue.length });

    await runQueueTransition(async () => {
      const { queue, safeIndex: currentIndex } = getActiveQueuePlaybackState();

      if (!queue.length) return;

      const previousIndex = getPreviousQueueIndex(
        currentIndex,
        queue.length
      );

      if (previousIndex === -1) return;

      if (previousIndex === currentIndex) {
        logQueuePlaybackEvent("queue_previous_success", {
          action: "restart_current",
          songId: currentSongRef.current?.id,
          queueIndex: currentIndex,
        });

        clearFinishWatchdog("previous_restart");
        void removeStoredValues([POSITION_KEY]);
        await bridgeSeekTo(0);
        setPositionMillis(0);

        if (hiddenAudioActiveRef.current) {
          await bridgeHiddenAudioPlay();
          const progress = await bridgeGetProgress();
          setIsPlaying(progress.isPlaying);
          if (progress.durationMillis > 0) {
            setDurationMillis(progress.durationMillis);
          }
        } else {
          logPlayerContextDebug("hidden_audio_fake_play_prevented", {
              reason: "legacy_playback_not_state_source",
            });
            setIsPlaying(false);
        }

        return;
      }

      await playQueueAtIndex(previousIndex);

      logQueuePlaybackEvent("queue_previous_success", {
        action: "play_index",
        previousIndex,
        songId: queue[previousIndex]?.id,
      });
    }, { dropIfLocked: true });
  }, [
    runQueueTransition,
    getActiveQueuePlaybackState,
    getPreviousQueueIndex,
    playQueueAtIndex,
    removeStoredValues,
    setIsPlaying,
    setPositionMillis,
    setDurationMillis,
    clearLoadingRecoveryTimeout,
    clearFinishWatchdog,
  ]);

  const playQueue = useCallback(
    async (
      queue: AppSong[],
      startIndex = 0,
      priorInterruptDone = false,
      queueContext: PlaybackQueueContext = DEFAULT_QUEUE_CONTEXT
    ) => {
      logLockscreenPlaybackDiagnostic("playable_tap_received", {
        source: "playQueue",
        queueLength: queue.length,
        requestedIndex: startIndex,
        contextSource: queueContext.source,
      });

      const seedSong = normalizeSong(
        queue[Math.max(0, Math.min(startIndex, queue.length - 1))] || queue[0]
      );
      const resolved = resolvePlaybackQueue(
        seedSong,
        queueContext,
        queue,
        startIndex
      );
      const nativeQueue = resolved.queue;
      if (!nativeQueue.length) return;

      const safeIndex = resolved.index;
      const normalizedContext = resolved.context;

      logLockscreenPlaybackDiagnostic("playable_tap_queue_built", {
        source: "playQueue",
        queueLength: nativeQueue.length,
        queueIndex: safeIndex,
        contextSource: normalizedContext.source,
        songId: nativeQueue[safeIndex]?.id,
      });

      const selectedSong = nativeQueue[safeIndex];
      const selectedNormalized = normalizeSong(selectedSong);
      const previousSongId = currentSongRef.current?.id || "";
      const switchingToNewSong = previousSongId !== selectedNormalized.id;

      currentSongRef.current = selectedNormalized;
      setCurrentSong(selectedNormalized);
      activeQueueRef.current = nativeQueue;
      setActiveQueue(nativeQueue);
      activeQueueIndexRef.current = safeIndex;
      setActiveQueueIndex(safeIndex);
      activeQueueModeRef.current = "standard";
      setActiveQueueMode("standard");
      activeQueueContextRef.current = normalizedContext;
      setActiveQueueContext(normalizedContext);

      if (switchingToNewSong) {
        logPlayerContextDebug("hidden_audio_fake_play_prevented", {
          songId: selectedNormalized.id,
          reason: "queue_waiting_for_native_load",
        });
        setIsLoading(true);
        setIsPlaying(false);
        openPlayerForPlayableTap(selectedNormalized, "play_queue_prime");
      }

      setRadioMode(false);
      radioModeRef.current = false;
      void setStoredValueIfChanged(RADIO_MODE_KEY, "false");

      void syncActiveQueue(nativeQueue, safeIndex, "standard", normalizedContext);
      void removeStoredValues([POSITION_KEY]);

      let interruptDone = priorInterruptDone;

      if (switchingToNewSong) {
        if (!interruptDone) {
          await interruptCurrentPlaybackForUserTap(selectedNormalized.id);
        }

        interruptDone = true;
      }

      const currentLoadedSound = soundRef.current;

      if (
        hiddenAudioActiveRef.current &&
        currentSongRef.current?.id === selectedSong.id
      ) {
        try {
          if (!isPlayingRef.current) {
            await bridgeHiddenAudioPlay();
          }

          const resumeProgress = await bridgeGetProgress();
          setPositionMillis(resumeProgress.positionMillis);
          if (resumeProgress.durationMillis > 0) {
            setDurationMillis(resumeProgress.durationMillis);
          }
          setIsPlaying(resumeProgress.isPlaying);
          deferPlaybackSideEffects(selectedSong, "play_queue_resume_side_effects");
          return;
        } catch (error) {
          console.log("Hidden audio playQueue resume error:", error);
        }
      }

      if (currentSongRef.current?.id === selectedSong.id && currentLoadedSound) {
        try {
          const status = await currentLoadedSound.getStatusAsync();

          if (status.isLoaded) {
            if (!status.isPlaying) {
              await currentLoadedSound.playAsync();
            }

            logPlayerContextDebug("hidden_audio_fake_play_prevented", {
              reason: "legacy_playback_not_state_source",
            });
            setIsPlaying(false);
            deferPlaybackSideEffects(selectedSong, "play_queue_legacy_resume_side_effects");
            return;
          }
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
      resolvePlaybackQueue,
      syncActiveQueue,
      removeStoredValues,
      interruptCurrentPlaybackForUserTap,
      loadAndPlay,
      openPlayerForPlayableTap,
      setIsPlaying,
      deferPlaybackSideEffects,
    ]
  );

  const playSong = useCallback(
    async (
      song: AppSong,
      queue?: AppSong[],
      index?: number,
      queueContext: PlaybackQueueContext = DEFAULT_QUEUE_CONTEXT
    ) => {
      const normalizedSong = normalizeSong(song);

      logTapToPlayStart({
        songId: normalizedSong.id,
        hasQueue: Boolean(queue?.length),
        requestedIndex: index,
      });
      logLockscreenPlaybackDiagnostic("playable_tap_received", {
        source: "playSong",
        songId: normalizedSong.id,
        hasQueue: Boolean(queue?.length),
        requestedIndex: index,
        contextSource: queueContext.source,
      });
      if (!queue?.length || queueContext.source === "unknown") {
        logLockscreenPlaybackDiagnostic("play_song_context_missing", {
          songId: normalizedSong.id,
          hasQueue: Boolean(queue?.length),
          contextSource: queueContext.source,
        });
      }
      rememberLockscreenDiagnostic(
        "lastUserAction",
        `play_song:${normalizedSong.id}`
      );

      const switchingToNewSong = currentSongRef.current?.id !== normalizedSong.id;
      const requestedQueueIndex =
        typeof index === "number" ? index : activeQueueIndexRef.current;
      const isSameTrackAndIndex =
        currentSongRef.current?.id === normalizedSong.id &&
        requestedQueueIndex === activeQueueIndexRef.current;

      if (switchingToNewSong) {
        primePlaybackTapUi(normalizedSong, "play_song", {
          queueIndex: requestedQueueIndex,
        });
        await interruptCurrentPlaybackForUserTap(normalizedSong.id);
      } else if (!isSameTrackAndIndex) {
        primePlaybackTapUi(normalizedSong, "play_song_queue_jump", {
          queueIndex: requestedQueueIndex,
        });
      }

      if (switchingToNewSong || !isSameTrackAndIndex) {
        logPlayerContextDebug("hidden_audio_fake_play_prevented", {
          songId: normalizedSong.id,
          reason: "tap_waiting_for_native_load",
        });
        setIsLoading(true);
        setIsPlaying(false);
      }

      if (isYouTubeSong(normalizedSong)) {
        logPlayerContextDebug("Blocked playSong for YouTube. Route to /youtube-player instead.");
        setIsPlaying(false);
        setIsLoading(false);
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
        setIsLoading(false);
        setIsPlaying(false);
        return;
      }

      if (!switchingToNewSong && isSameTrackAndIndex) {
        const currentLoadedSound = soundRef.current;

        if (
          hiddenAudioActiveRef.current &&
          currentSongRef.current?.id === normalizedSong.id
        ) {
          try {
            if (!isPlayingRef.current) {
              await bridgeHiddenAudioPlay();
            }

            const resumeProgress = await bridgeGetProgress();
            setPositionMillis(resumeProgress.positionMillis);
            if (resumeProgress.durationMillis > 0) {
              setDurationMillis(resumeProgress.durationMillis);
            }
            setIsPlaying(resumeProgress.isPlaying);
            deferPlaybackSideEffects(normalizedSong, "play_song_resume_side_effects");
            return;
          } catch (error) {
            console.log("Hidden audio playSong resume error:", error);
          }
        }

        if (currentSongRef.current?.id === normalizedSong.id && currentLoadedSound) {
          try {
            const status = await currentLoadedSound.getStatusAsync();

            if (status.isLoaded) {
              if (!status.isPlaying) {
                await currentLoadedSound.playAsync();
              }

              logPlayerContextDebug("hidden_audio_fake_play_prevented", {
                reason: "legacy_playback_not_state_source",
              });
              setIsPlaying(false);
              deferPlaybackSideEffects(normalizedSong, "play_song_legacy_resume_side_effects");
              return;
            }
          } catch {}
        }
      }

      const resolved = resolvePlaybackQueue(
        normalizedSong,
        queueContext,
        queue?.length ? queue : activeQueueRef.current,
        queue?.length ? index : activeQueueIndexRef.current
      );

      if (!resolved.queue.length) {
        setIsLoading(false);
        setIsPlaying(false);
        return;
      }

      recordQueueControl("play_song", resolved.queue.length, {
        songId: normalizedSong.id,
      });
      logLockscreenPlaybackDiagnostic("playable_tap_queue_built", {
        source: "playSong",
        songId: normalizedSong.id,
        queueLength: resolved.queue.length,
        queueIndex: resolved.index,
        contextSource: resolved.context.source,
      });
      await playQueue(
        resolved.queue,
        resolved.index,
        switchingToNewSong,
        resolved.context
      );
    },
    [
      normalizeSong,
      isYouTubeSong,
      playQueue,
      resolvePlaybackQueue,
      persistActiveQueueDeferred,
      syncActiveQueue,
      removeStoredValues,
      interruptCurrentPlaybackForUserTap,
      loadAndPlay,
      setIsPlaying,
      deferPlaybackSideEffects,
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

      const playableSong = {
        ...normalizedSong,
        type: normalizedSong.type || "audius",
        isOnline: true,
      };

      await playSong(playableSong, [playableSong], 0, {
        source: "search",
        label: "External audio",
        artistName: playableSong.artist,
        genre: playableSong.genre,
        mood: playableSong.mood,
      });
    },
    [normalizeSong, isYouTubeSong, setIsPlaying, playSong]
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
      clearFinishWatchdog("stop_playback");

      loadRequestIdRef.current += 1;
      inFlightPlaySongIdRef.current = null;
      await clearPreloadedSound();
      await unloadCurrentSound("stop_playback");

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
    clearLoadingRecoveryTimeout,
    clearFinishWatchdog,
  ]);

  const togglePlayPause = useCallback(async () => {
    if (!queueControlTapGuardRef.current("toggle_play_pause")) return;
    logPauseResumeStart({ source: "toggle_play_pause" });

    if (hiddenAudioActiveRef.current) {
      if (isChangingTrackRef.current) return;

      try {
        if (isPlayingRef.current) {
          clearFinishWatchdog("pause");
          markIntentionalPause("user_pause");
          await bridgeHiddenAudioPause();
          const positionSeconds = positionMillisRef.current / 1000;
          const song = currentSongRef.current;

          if (song) {
            await bridgeHiddenAudioUpdateNowPlaying({
              title: song.title || "Unknown Song",
              artist: song.artist || "Unknown Artist",
              album: song.album || "",
              durationSeconds: getSongDurationSeconds(song),
              positionSeconds,
              artworkUrl: typeof getArtworkValue(song) === "string" ? String(getArtworkValue(song)) : "",
            });
          }

          setIsPlaying(false);
          setPositionMillis(0);
          setDurationMillis(0);
        } else {
          clearIntentionalPause("play");
          await bridgeHiddenAudioPlay();
        }

        await syncHiddenAudioState("toggle_play_pause");

        logPauseResumeComplete({ engine: "hidden_audio" });
      } catch (error) {
        console.log("Hidden audio toggle play/pause error:", error);
      }

      return;
    }


    const sound = soundRef.current;

    if (isChangingTrackRef.current) return;

    if (!sound) {
      const restoredSong = currentSongRef.current;

      if (restoredSong) {
        await loadAndPlay(restoredSong);
      }

      logPauseResumeComplete({ engine: "native_audio_restore" });
      return;
    }

    const status = await sound.getStatusAsync();

    if (!status.isLoaded) {
      const restoredSong = currentSongRef.current;

      if (restoredSong) {
        await loadAndPlay(restoredSong);
      }

      logPauseResumeComplete({ engine: "native_audio_reload" });
      return;
    }

    if (status.isPlaying) {
      clearFinishWatchdog("pause");
      await sound.pauseAsync();
      setIsPlaying(false);
    } else {
      await sound.playAsync();
      logPlayerContextDebug("hidden_audio_fake_play_prevented", {
              reason: "legacy_playback_not_state_source",
            });
            setIsPlaying(false);
    }

    logPauseResumeComplete({ engine: "native_audio" });
  }, [loadAndPlay, setIsPlaying, clearFinishWatchdog, getSongDurationSeconds]);

  const seekTo = useCallback(
    async (millis: number) => {
      const safeMillis = Math.max(0, Math.floor(millis || 0));

      if (hiddenAudioActiveRef.current) {
        clearFinishWatchdog("seek");
        await bridgeSeekTo(safeMillis);
        const progress = await syncHiddenAudioState("seek");
        const confirmedMillis = progress?.positionMillis || safeMillis;
        setPositionMillis(confirmedMillis);
        await savePlaybackPosition(confirmedMillis);
        return;
      }

      if (!soundRef.current) return;

      clearFinishWatchdog("seek");
      await soundRef.current.setPositionAsync(safeMillis);
      setPositionMillis(safeMillis);
      positionMillisRef.current = safeMillis;

      await savePlaybackPosition(safeMillis);
    },
    [setPositionMillis, savePlaybackPosition, clearFinishWatchdog]
  );

  const setVolume = useCallback(async (value: number) => {
    const safeValue = Math.max(0, Math.min(value, 1));

    setVolumeState(safeValue);
    volumeRef.current = safeValue;

    await setStoredValueIfChanged(VOLUME_KEY, String(safeValue));


    if (!isMutedRef.current && soundRef.current) {
      await soundRef.current.setVolumeAsync(safeValue);
    }
  }, [setStoredValueIfChanged]);

  const toggleMute = useCallback(async () => {
    const nextMuted = !isMutedRef.current;

    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted;

    await setStoredValueIfChanged(MUTED_KEY, String(nextMuted));


    if (soundRef.current) {
      await soundRef.current.setVolumeAsync(nextMuted ? 0 : volumeRef.current);
    }
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
    if (shouldBlockJsPlaybackStateClear(appStateRef.current, "clear_active_queue")) {
      logLockscreenPlaybackDiagnostic("js_state_clear_source_detected", {
        source: "clear_active_queue",
        songId: currentSongRef.current?.id || null,
        queueLength: activeQueueRef.current.length,
      });
      logLockscreenPlaybackDiagnostic("js_state_clear_blocked_background", {
        source: "clear_active_queue",
        songId: currentSongRef.current?.id || null,
        queueLength: activeQueueRef.current.length,
      });
      return;
    }

    setActiveQueue([]);
    setActiveQueueIndex(0);
    setActiveQueueMode("standard");
    setActiveQueueContext(DEFAULT_QUEUE_CONTEXT);

    activeQueueRef.current = [];
    activeQueueIndexRef.current = 0;
    activeQueueModeRef.current = "standard";
    activeQueueContextRef.current = DEFAULT_QUEUE_CONTEXT;

    await removeStoredValues([
      ACTIVE_QUEUE_KEY,
      ACTIVE_QUEUE_INDEX_KEY,
      ACTIVE_QUEUE_MODE_KEY,
      ACTIVE_QUEUE_CONTEXT_KEY,
    ]);
  }, [removeStoredValues]);

  const restoreSavedDataLight = useCallback(async () => {
    logPlayerContextDebug("[startup-ready] restore-light-start");

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

      if (isHiddenAudioNativePlaybackEnabled()) {
        const [savedActiveQueue, savedActiveQueueIndex, savedActiveQueueMode, savedActiveQueueContext] =
          await Promise.all([
            AsyncStorage.getItem(ACTIVE_QUEUE_KEY),
            AsyncStorage.getItem(ACTIVE_QUEUE_INDEX_KEY),
            AsyncStorage.getItem(ACTIVE_QUEUE_MODE_KEY),
            AsyncStorage.getItem(ACTIVE_QUEUE_CONTEXT_KEY),
          ]);

        if (savedActiveQueue) {
          const parsedActiveQueue = JSON.parse(savedActiveQueue);
          if (Array.isArray(parsedActiveQueue)) {
            const normalizedQueue = parsedActiveQueue
              .map(normalizeSong)
              .filter((song) => !isYouTubeSong(song));
            if (normalizedQueue.length > 0) {
              setActiveQueue(normalizedQueue);
              activeQueueRef.current = normalizedQueue;
              const parsedIndex = Number(savedActiveQueueIndex || 0);
              const safeIndex = Number.isNaN(parsedIndex)
                ? 0
                : Math.max(0, Math.min(parsedIndex, normalizedQueue.length - 1));
              setActiveQueueIndex(safeIndex);
              activeQueueIndexRef.current = safeIndex;
              const safeMode: ActiveQueueMode =
                savedActiveQueueMode === "radio" ||
                savedActiveQueueMode === "standard" ||
                savedActiveQueueMode === "smart"
                  ? savedActiveQueueMode
                  : "standard";
              setActiveQueueMode(safeMode);
              activeQueueModeRef.current = safeMode;
              if (savedActiveQueueContext) {
                try {
                  const context = normalizePlaybackQueueContext(
                    JSON.parse(savedActiveQueueContext)
                  );
                  setActiveQueueContext(context);
                  activeQueueContextRef.current = context;
                } catch {}
              }
            }
          }
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
      console.log("Restore player data (light) error:", error);
    } finally {
      logPlayerContextDebug("[startup-ready] restore-light-end");
    }
  }, [normalizeSong, isYouTubeSong]);

  const restoreSavedDataHeavy = useCallback(async () => {
    logPlayerContextDebug("[startup-ready] restore-heavy-start");

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
        savedActiveQueueContext,
      ] = await Promise.all([
        AsyncStorage.getItem(FAVORITES_KEY),
        AsyncStorage.getItem(YOUTUBE_QUEUE_KEY),
        AsyncStorage.getItem(YOUTUBE_QUEUE_INDEX_KEY),
        AsyncStorage.getItem(RADIO_MODE_KEY),
        AsyncStorage.getItem(RADIO_INDEX_KEY),
        AsyncStorage.getItem(ACTIVE_QUEUE_KEY),
        AsyncStorage.getItem(ACTIVE_QUEUE_INDEX_KEY),
        AsyncStorage.getItem(ACTIVE_QUEUE_MODE_KEY),
        AsyncStorage.getItem(ACTIVE_QUEUE_CONTEXT_KEY),
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
            savedActiveQueueMode === "smart"
              ? savedActiveQueueMode
              : "standard";

          if (normalizedQueue.length > 0) {
            let safeContext = DEFAULT_QUEUE_CONTEXT;
            if (savedActiveQueueContext) {
              try {
                safeContext = normalizePlaybackQueueContext(JSON.parse(savedActiveQueueContext));
              } catch {}
            }

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

            setActiveQueueContext(safeContext);
            activeQueueContextRef.current = safeContext;
          }
        }
      }

      await yieldToNextFrame();

      setRecentlyPlayed(upgradedRecent);
    } catch (error) {
      console.log("Restore player data (heavy) error:", error);
    } finally {
      markPlaybackRestoreComplete();
      logPlayerContextDebug("[startup-ready] restore-heavy-end");
    }
  }, [normalizeSong, isYouTubeSong, normalizeYouTubeTrack]);

  useEffect(() => {
    let cancelled = false;

    const pollHiddenAudioProgress = async () => {
      if (cancelled) return;

      if (
        isBackgroundAppState(appStateRef.current) &&
        !isPlayingRef.current &&
        !isLoadingRef.current &&
        !hiddenAudioActiveRef.current
      ) {
        return;
      }

      if (!hiddenAudioActiveRef.current) {
        if (isHiddenAudioNativePlaybackEnabled()) {
          const snapshot = await bridgeProbeNativePlayback();
          if (!nativeSnapshotIndicatesLoadedPlayback(snapshot)) {
            return;
          }
          markHiddenAudioBridgeActive(true);
          hiddenAudioActiveRef.current = true;
        } else {
          return;
        }
      }

      try {
        const progress = await bridgeGetProgress();
        if (cancelled || !hiddenAudioActiveRef.current) return;

        const now = Date.now();
        const previousPosition = positionMillisRef.current;
        const wasPlaying = isPlayingRef.current;
        positionMillisRef.current = progress.positionMillis;

        const playbackState = String(progress.playbackState || "unknown");
        if (playbackState !== lastNativePlaybackStateRef.current) {
          lastNativePlaybackStateRef.current = playbackState;
          logAndRememberLockscreenDiagnostic(
            "native_playback_state_changed",
            {
              playbackState,
              appState: appStateRef.current,
              isPlaying: progress.isPlaying,
              position: progress.positionMillis,
              duration: progress.durationMillis,
            },
            { lastNativeEvent: `native_playback_state_changed:${playbackState}` }
          );
        }

        if (progress.isPlaying) {
          const positionSeconds = progress.positionMillis / 1000;
          const progressDiagnosticIntervalMs = isBackgroundAppState(appStateRef.current)
            ? 15000
            : 5000;

          if (now - lastLockscreenProgressDiagnosticRef.current >= progressDiagnosticIntervalMs) {
            lastLockscreenProgressDiagnosticRef.current = now;
            logLockscreenPlaybackDiagnostic("native_playback_is_playing", {
              appState: appStateRef.current,
              isPlaying: progress.isPlaying,
              playbackState,
            });
            logLockscreenPlaybackDiagnostic("native_playback_position", {
              appState: appStateRef.current,
              position: progress.positionMillis,
              positionSeconds,
              songId: currentSongRef.current?.id || null,
            });
            logLockscreenPlaybackDiagnostic("native_playback_duration", {
              appState: appStateRef.current,
              duration: progress.durationMillis,
              durationSeconds: progress.durationMillis / 1000,
              songId: currentSongRef.current?.id || null,
            });
          }
        }

        const remainingMillis = progress.durationMillis - progress.positionMillis;
        const nearTrackEnd =
          progress.durationMillis > 0 &&
          remainingMillis <= TRACK_END_THRESHOLD_MS + LOCK_SCREEN_END_WINDOW_MS;
        const stoppedUnexpectedly =
          hiddenAudioActiveRef.current &&
          wasPlaying &&
          !progress.isPlaying &&
          !isChangingTrackRef.current &&
          !autoAdvanceRef.current &&
          !nearTrackEnd;

        if (stoppedUnexpectedly) {
          const currentSong = currentSongRef.current;
          const lastStop = lastUnexpectedPlaybackStopRef.current;
          if (
            currentSong &&
            (lastStop.songId !== currentSong.id || now - lastStop.at > 5000)
          ) {
            lastUnexpectedPlaybackStopRef.current = { songId: currentSong.id, at: now };
            logLockscreenPlaybackDiagnostic("unexpected_playback_stop_detected", {
              appState: appStateRef.current,
              currentSongId: currentSong.id,
              currentSongTitle: currentSong.title,
              position: progress.positionMillis,
              duration: progress.durationMillis,
              isPlaying: progress.isPlaying,
              isLoading: isLoadingRef.current,
              queueIndex: activeQueueIndexRef.current,
              queueLength: activeQueueRef.current.length,
              playbackState,
              ...getLockscreenDiagnosticSnapshot(),
            });
          }
        }

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

        if (
          progress.durationMillis > 0 &&
          Math.abs(progress.durationMillis - durationMillisRef.current) >=
            DURATION_UPDATE_THRESHOLD_MS
        ) {
          durationMillisRef.current = progress.durationMillis;
          recordPlaybackReactStateUpdate("duration");
          setDurationMillisState(progress.durationMillis);
        }

        if (progress.isPlaying !== isPlayingRef.current) {
          const backgrounding = isBackgroundAppState(appStateRef.current);
          const playbackStateLower = String(progress.playbackState || "").toLowerCase();
          const allowBackgroundPauseSync =
            !backgrounding ||
            progress.isPlaying ||
            playbackStateLower === "ended" ||
            playbackStateLower === "paused";
          if (allowBackgroundPauseSync) {
            isPlayingRef.current = progress.isPlaying;
            recordPlaybackReactStateUpdate("is_playing");
            setIsPlayingState(progress.isPlaying);
          }
        }

        if (
          !isChangingTrackRef.current &&
          !autoAdvanceRef.current &&
          progress.durationMillis >= MIN_DURATION_FOR_POSITION_FINISH_MS
        ) {
          const nearTrackEnd =
            repeatModeRef.current !== "one" &&
            progress.positionMillis > 0 &&
            progress.positionMillis >=
              progress.durationMillis - TRACK_END_THRESHOLD_MS;

          const nativeEnded = String(progress.playbackState || "").toLowerCase() === "ended";
          const playbackEndedWhileNearEnd =
            nearTrackEnd &&
            !progress.isPlaying &&
            (previousPosition >=
              progress.durationMillis - LOCK_SCREEN_END_WINDOW_MS ||
              progress.positionMillis >=
                progress.durationMillis - TRACK_END_THRESHOLD_MS);
          const backgrounding = isBackgroundAppState(appStateRef.current);
          if (backgrounding && (nativeEnded || playbackEndedWhileNearEnd)) {
            backgroundNearEndStallCountRef.current += 1;
          } else if (!backgrounding) {
            backgroundNearEndStallCountRef.current = 0;
          }

          const confirmedBackgroundEnd =
            backgrounding &&
            backgroundNearEndStallCountRef.current >= 2 &&
            (nativeEnded || playbackEndedWhileNearEnd);
          const confirmedForegroundEnd =
            !backgrounding && (nativeEnded || playbackEndedWhileNearEnd);

          if (confirmedBackgroundEnd || confirmedForegroundEnd) {
            backgroundNearEndStallCountRef.current = 0;
            scheduleTrackAdvance();
          }
        }

        if (
          now - lastPositionSaveRef.current >
          getPositionSaveIntervalMs(appStateRef.current) &&
          Math.abs(progress.positionMillis - lastSavedPositionRef.current) >=
            POSITION_SAVE_DISTANCE_MS
        ) {
          lastPositionSaveRef.current = now;
          void savePlaybackPosition(progress.positionMillis);
        }
      } catch (error) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("Hidden audio progress poll error:", error);
        }
      }
    };

    const timer = setInterval(() => {
      void pollHiddenAudioProgress();
    }, getProgressUpdateIntervalMs(appStateRef.current));

    void pollHiddenAudioProgress();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [savePlaybackPosition, scheduleTrackAdvance]);

  const handleIosRemoteLockscreenCommand = useCallback(
    async (command: string, data: Record<string, unknown> = {}) => {
      const normalizedCommand = String(command || "").toLowerCase();
      if (!normalizedCommand) return;

      logLockscreenPlaybackDiagnostic("remote_command_received", {
        command: normalizedCommand,
        ...data,
      });
      logLockscreenPlaybackDiagnostic("remote_command_dispatched_to_js", {
        command: normalizedCommand,
        ...data,
      });
      logLockscreenPlaybackDiagnostic("remote_command_js_handler_start", {
        command: normalizedCommand,
        ...data,
      });

      try {
        switch (normalizedCommand) {
          case "play": {
            logLockscreenPlaybackDiagnostic("remote_play_received", data);
            clearIntentionalPause("play");
            if (Platform.OS === "android" && isHiddenAudioNativePlaybackEnabled()) {
              await bridgeHiddenAudioPlay();
              isPlayingRef.current = true;
              setIsPlaying(true);
            } else {
              isPlayingRef.current = true;
              setIsPlaying(true);
              await syncHiddenAudioState("remote_play");
            }
            logLockscreenPlaybackDiagnostic("remote_command_native_action_success", {
              command: "play",
            });
            break;
          }
          case "pause": {
            logLockscreenPlaybackDiagnostic("remote_pause_received", data);
            markIntentionalPause("remote_pause");
            if (Platform.OS === "android" && isHiddenAudioNativePlaybackEnabled()) {
              await bridgeHiddenAudioPause();
            }
            isPlayingRef.current = false;
            setIsPlayingState(false);
            logLockscreenPlaybackDiagnostic("remote_command_native_action_success", {
              command: "pause",
            });
            break;
          }
          case "play_from_media_id": {
            const mediaId = String((data as Record<string, unknown>).mediaId || "");
            const catalog = getCachedHiddenTunesCatalog();
            if (!mediaId || !catalog) {
              logLockscreenPlaybackDiagnostic("remote_command_no_queue_available", {
                ...data,
                mediaId,
              });
              break;
            }
            const resolved = resolveAndroidAutoMediaId(catalog, mediaId);
            if (!resolved) {
              logLockscreenPlaybackDiagnostic("remote_command_no_queue_available", {
                ...data,
                mediaId,
              });
              break;
            }
            await playSong(resolved.song, resolved.queue, 0, {
              source: "android_auto",
              label: "Android Auto",
            });
            logLockscreenPlaybackDiagnostic("remote_command_native_action_success", {
              command: "play_from_media_id",
              mediaId,
            });
            break;
          }
          case "next": {
            logLockscreenPlaybackDiagnostic("remote_next_received", data);
            const { queue } = getActiveQueuePlaybackState();
            if (!queue.length) {
              logLockscreenPlaybackDiagnostic("remote_command_no_queue_available", data);
              return;
            }
            await nextSong({ source: "remote" });
            await syncNativeRemoteQueueAvailability();
            break;
          }
          case "previous": {
            logLockscreenPlaybackDiagnostic("remote_previous_received", data);
            const { queue: previousQueue } = getActiveQueuePlaybackState();
            if (!previousQueue.length) {
              logLockscreenPlaybackDiagnostic("remote_command_no_queue_available", data);
              return;
            }
            await previousSong({ source: "remote" });
            await syncNativeRemoteQueueAvailability();
            break;
          }
          default:
            return;
        }

        logLockscreenPlaybackDiagnostic("remote_command_js_handler_success", {
          command: normalizedCommand,
          ...data,
        });
      } catch (error) {
        logLockscreenPlaybackDiagnostic("remote_command_js_handler_failed", {
          command: normalizedCommand,
          message: String(error),
          ...data,
        });
      }
    },
    [
      getActiveQueuePlaybackState,
      nextSong,
      previousSong,
      setIsPlaying,
      syncHiddenAudioState,
      syncNativeRemoteQueueAvailability,
    ]
  );


  useEffect(() => {
    if (Platform.OS !== "android" || !isHiddenAudioNativePlaybackEnabled()) return;
    void syncAndroidAutoCatalogFromDerived();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android" || !isHiddenAudioNativePlaybackEnabled()) {
      return;
    }

    return subscribeHiddenAudioProgress((progress) => {
      applyHiddenAudioProgressToUi(progress, "android_hidden_audio_progress_event");
    });
  }, [applyHiddenAudioProgressToUi]);

  useEffect(() => {
    return subscribeHiddenAudioDiagnostics((event) => {
      const nativeEventName = String(event.eventName || "native_playback_state_changed");
      const data = event.data || {};
      const eventName = (() => {
        switch (nativeEventName) {
          case "hidden_audio_native_playing_confirmed":
            return "native_playback_is_playing";
          case "hidden_audio_time_control_status":
          case "hidden_audio_player_rate_changed":
            return "native_playback_state_changed";
          case "hidden_audio_playback_buffer_empty":
          case "hidden_audio_playback_likely_to_keep_up":
          case "hidden_audio_loaded_time_ranges":
            return "native_playback_buffer_status";
          case "hidden_audio_audio_interruption_began":
            return "ios_audio_session_interruption_began";
          case "hidden_audio_audio_interruption_ended":
            return "ios_audio_session_interruption_ended";
          case "hidden_audio_route_changed":
            return "ios_audio_session_route_changed";
          case "hidden_audio_silence_secondary_audio_hint":
            return "ios_audio_session_silence_secondary_audio_hint";
          case "hidden_audio_remote_play_received":
            return "remote_play_received";
          case "hidden_audio_remote_pause_received":
            return "remote_pause_received";
          case "hidden_audio_remote_next_received":
            return "remote_next_received";
          case "hidden_audio_remote_previous_received":
            return "remote_previous_received";
          default:
            return nativeEventName;
        }
      })();

      const remember = nativeEventName.includes("interruption") ||
        nativeEventName.includes("route") ||
        nativeEventName.includes("silence")
        ? { lastAudioFocusOrInterruption: nativeEventName }
        : { lastNativeEvent: nativeEventName };

      if (nativeEventName.includes("remote_")) {
        logAndRememberLockscreenDiagnostic("ios_remote_command_received", data, {
          lastRemoteCommand: nativeEventName,
        });
      }

      if (eventName === "remote_pause_received") {
        markIntentionalPause("remote_pause");
      } else if (eventName === "remote_play_received") {
        clearIntentionalPause("play");
      }

      if (
        nativeEventName === "ios_remote_command_received" ||
        nativeEventName === "android_remote_command_received"
      ) {
        const command = String((data as Record<string, unknown>).command || "");
        void handleIosRemoteLockscreenCommand(command, data as Record<string, unknown>);
      }

      if (nativeEventName === "hidden_audio_remote_command_result") {
        const success = Boolean((data as Record<string, unknown>).success);
        logAndRememberLockscreenDiagnostic(
          success ? "remote_command_handled_success" : "remote_command_handled_error",
          data,
          { lastBridgeEvent: success ? "remote_command_handled_success" : "remote_command_handled_error" }
        );
      }

      logAndRememberLockscreenDiagnostic(eventName, data, remember);
    });
  }, [handleIosRemoteLockscreenCommand]);

  useEffect(() => {
    return subscribeHiddenAudioEnded((event) => {
      logLockscreenPlaybackDiagnostic("hidden_audio_js_end_event_received", {
        hiddenAudioActive: hiddenAudioActiveRef.current,
        songId: currentSongRef.current?.id || null,
        queueIndex: activeQueueIndexRef.current,
        queueLength: activeQueueRef.current.length,
        repeatMode: repeatModeRef.current,
        index: typeof event.index === "number" ? event.index : null,
        positionSeconds: event.positionSeconds ?? null,
        durationSeconds: event.durationSeconds ?? null,
      });

      if (!hiddenAudioActiveRef.current) {
        logAutoNextSkipped("hidden_audio_end_event_inactive", {
          songId: currentSongRef.current?.id,
        });
        return;
      }

      backgroundAdvanceFromNativeEndRef.current = true;
      if (repeatModeRef.current === "one") {
        scheduleTrackAdvance();
        return;
      }

      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[hidden_audio_lock] native_playback_ended", {
          songId: currentSongRef.current?.id || null,
          event,
        });
      }

      scheduleTrackAdvance();
    });
  }, [scheduleTrackAdvance]);

  useEffect(() => {
    isMountedRef.current = true;

    let cancelled = false;
    let cancelRestoreLightTask: () => void = () => {};
    let cancelRestoreHeavyTask: () => void = () => {};

    void (async () => {
      if (cancelled) return;

      if (isHiddenAudioNativePlaybackEnabled()) {
        const hydrated = await hydrateJsPlaybackSessionFromStorage();
        if (hydrated) {
          logLockscreenPlaybackDiagnostic(
            "foreground_saved_session_hydrated_before_probe",
            {
              source: "player_mount",
              songId: currentSongRef.current?.id || null,
              queueLength: activeQueueRef.current.length,
              queueIndex: activeQueueIndexRef.current,
            }
          );
        }
        await reconcileHiddenAudioActiveState("player_mount");
      }

      configureAudio("player_mount");

      cancelRestoreLightTask = scheduleStartupTask(
        "background",
        "player_restore_saved_data_light",
        async () => {
          await restoreSavedDataLight();
          if (isHiddenAudioNativePlaybackEnabled()) {
            await resyncForegroundHiddenAudioState();
          }
        }
      );

      cancelRestoreHeavyTask = scheduleStartupTask(
        "deferred",
        "player_restore_saved_data_heavy",
        async () => {
          await restoreSavedDataHeavy();
        }
      );
    })();

    return () => {
      cancelled = true;
      cancelRestoreLightTask();
      cancelRestoreHeavyTask();
      isMountedRef.current = false;
      loadRequestIdRef.current += 1;
      clearFinishWatchdog();

      const hasPlaybackSession =
        Boolean(currentSongRef.current) || activeQueueRef.current.length > 0;
      if (
        Platform.OS === "ios" &&
        (isBackgroundAppState(appStateRef.current) || hasPlaybackSession)
      ) {
        logLockscreenPlaybackDiagnostic("js_state_clear_source_detected", {
          source: "player_mount_cleanup",
          appState: appStateRef.current,
          songId: currentSongRef.current?.id || null,
          queueLength: activeQueueRef.current.length,
        });
        logLockscreenPlaybackDiagnostic("js_state_clear_blocked_background", {
          source: "player_mount_cleanup",
          appState: appStateRef.current,
          songId: currentSongRef.current?.id || null,
          queueLength: activeQueueRef.current.length,
        });
        return;
      }

      void unloadCurrentSound("player_unmount");
    };
  }, [
    configureAudio,
    hydrateJsPlaybackSessionFromStorage,
    reconcileHiddenAudioActiveState,
    restoreSavedDataLight,
    restoreSavedDataHeavy,
    unloadCurrentSound,
    clearLoadingRecoveryTimeout,
    clearFinishWatchdog,
    resyncForegroundHiddenAudioState,
  ]);

  useEffect(() => {
    void (async () => {
      if (isHiddenAudioNativePlaybackEnabled()) {
        if (!currentSongRef.current || activeQueueRef.current.length === 0) {
          const hydrated = await hydrateJsPlaybackSessionFromStorage();
          if (hydrated) {
            logLockscreenPlaybackDiagnostic(
              "foreground_saved_session_loaded_before_native_probe",
              {
                source: "ios_background_audio_config_checked",
                songId: currentSongRef.current?.id || null,
                queueLength: activeQueueRef.current.length,
                queueIndex: activeQueueIndexRef.current,
              }
            );
          }
        }
        const backgroundish = isBackgroundAppState(appStateRef.current);
        const hasSavedOrLiveSession =
          Boolean(currentSongRef.current) ||
          activeQueueRef.current.length > 0 ||
          isPlayingRef.current ||
          Boolean(await AsyncStorage.getItem(CURRENT_SONG_KEY));

        if (backgroundish && hasSavedOrLiveSession) {
          markHiddenAudioBridgeActive(true);
          hiddenAudioActiveRef.current = true;
          logLockscreenPlaybackDiagnostic("blocked_inactive_hidden_audio_false", {
            source: "ios_background_audio_config_checked",
            appState: appStateRef.current,
            songId: currentSongRef.current?.id || null,
            queueLength: activeQueueRef.current.length,
            isPlaying: isPlayingRef.current,
          });
        } else if (!backgroundish) {
          await reconcileHiddenAudioActiveState("ios_background_audio_config_checked");
        }
      }

      logLockscreenPlaybackDiagnostic("ios_background_audio_config_checked", {
        platform: Platform.OS,
        hiddenAudioActive: hiddenAudioActiveRef.current,
        appState: appStateRef.current,
        songId: currentSongRef.current?.id || null,
        queueLength: activeQueueRef.current.length,
        queueIndex: activeQueueIndexRef.current,
      });

      if (
        currentSongRef.current ||
        activeQueueRef.current.length > 0 ||
        hiddenAudioActiveRef.current
      ) {
        logLockscreenPlaybackDiagnostic("ios_background_audio_config_check_preserved_state", {
          songId: currentSongRef.current?.id || null,
          queueLength: activeQueueRef.current.length,
          queueIndex: activeQueueIndexRef.current,
          hiddenAudioActive: hiddenAudioActiveRef.current,
          appState: appStateRef.current,
        });
      }
    })();
  }, [hydrateJsPlaybackSessionFromStorage, reconcileHiddenAudioActiveState]);

  useEffect(() => {
    const appStateListenerId = `app_state_${Date.now()}`;
    recordListenerRegister("app_state", appStateListenerId);

    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      recordAppStateTransition(previousState, nextState);

      logAndRememberLockscreenDiagnostic(
        "app_state_changed",
        { previousState, nextState, songId: currentSongRef.current?.id || null },
        { lastBridgeEvent: `app_state_changed:${nextState}` }
      );

      if (nextState === "background" && previousState !== "background") {
        logLockscreenPlaybackDiagnostic("app_background_entered", {
          previousState,
          songId: currentSongRef.current?.id || null,
          isPlaying: isPlayingRef.current,
        });
      }

      if (nextState === "active" && previousState !== "active") {
        logLockscreenPlaybackDiagnostic("app_foreground_entered", {
          previousState,
          songId: currentSongRef.current?.id || null,
          isPlaying: isPlayingRef.current,
        });
      }

      logBackgroundStateChange(previousState, nextState, {
        songId: currentSongRef.current?.id,
        isPlaying: isPlayingRef.current,
      });

      // iOS lock often goes active -> inactive -> background. Re-applying audio mode on
      // inactive disrupts the shared AVAudioSession and can stop native playback mid-song.
      if (nextState === "inactive" && previousState === "active") {
        void savePlaybackPosition(positionMillisRef.current);
        void reconcileHiddenAudioActiveState("app_state_inactive");
      }

      if (nextState === "background" && previousState !== "background") {
        void savePlaybackPosition(positionMillisRef.current);

        backgroundWatchTimersRef.current.forEach((timer) => clearTimeout(timer));
        backgroundWatchTimersRef.current = [];
        if (hiddenAudioActiveRef.current && currentSongRef.current) {
          logLockscreenPlaybackDiagnostic("background_20s_watch_start", {
            songId: currentSongRef.current?.id || null,
          });
          backgroundWatchTimersRef.current.push(
            setTimeout(() => {
              void bridgeProbeNativePlayback().then((snapshot) => {
                logLockscreenPlaybackDiagnostic("background_20s_watch_alive", {
                  songId: currentSongRef.current?.id || null,
                  nativeStatus: snapshot?.nativeStatus || null,
                  isPlaying: snapshot?.isPlaying ?? null,
                  hasLoadedTrack: snapshot?.hasLoadedTrack ?? null,
                });
              });
            }, 20000)
          );
          backgroundWatchTimersRef.current.push(
            setTimeout(() => {
              void bridgeProbeNativePlayback().then((snapshot) => {
                logLockscreenPlaybackDiagnostic("background_30s_watch_alive", {
                  songId: currentSongRef.current?.id || null,
                  nativeStatus: snapshot?.nativeStatus || null,
                  isPlaying: snapshot?.isPlaying ?? null,
                  hasLoadedTrack: snapshot?.hasLoadedTrack ?? null,
                });
                if (
                  snapshot &&
                  !snapshot.isPlaying &&
                  nativeSnapshotIndicatesLoadedPlayback(snapshot) &&
                  isBackgroundAppState(appStateRef.current)
                ) {
                  if (hasRecentIntentionalPause()) {
                    logLockscreenPlaybackDiagnostic("background_recovery_skipped_intentional_pause", {
                      reason: "background_30s_watch",
                      pauseReason: intentionalPauseRef.current.reason,
                      cooldownRemainingMs: intentionalPauseCooldownRemainingMs(),
                      songId: currentSongRef.current?.id || null,
                    });
                    return;
                  }
                  logLockscreenPlaybackDiagnostic("background_unexpected_stop_detected", {
                    songId: currentSongRef.current?.id || null,
                    nativeStatus: snapshot.nativeStatus,
                    playbackState: snapshot.playbackState,
                  });
                  logLockscreenPlaybackDiagnostic("background_recovery_allowed_no_intentional_pause", {
                    reason: "background_30s_watch",
                    songId: currentSongRef.current?.id || null,
                  });
                  void bridgeHiddenAudioPlay().catch(() => undefined);
                }
              });
            }, 30000)
          );
        }

        configureAudio("app_state_background");
        void applyProgressUpdateInterval("app_state_background");

        if (hiddenAudioActiveRef.current && isPlayingRef.current) {
          if (hasRecentIntentionalPause()) {
            logLockscreenPlaybackDiagnostic("background_recovery_skipped_intentional_pause", {
              reason: "app_state_background_reassert",
              pauseReason: intentionalPauseRef.current.reason,
              cooldownRemainingMs: intentionalPauseCooldownRemainingMs(),
              songId: currentSongRef.current?.id || null,
            });
            return;
          }
          logLockscreenPlaybackDiagnostic("background_recovery_allowed_no_intentional_pause", {
            reason: "app_state_background_reassert",
            songId: currentSongRef.current?.id || null,
          });
          logLockscreenPlaybackDiagnostic("ios_background_reassert_playback", {
            songId: currentSongRef.current?.id || null,
            positionMillis: positionMillisRef.current,
          });

          void bridgeHiddenAudioPlay()
            .then(() => syncHiddenAudioState("app_state_background_hidden_audio"))
            .then(() => {
              logLockscreenPlaybackDiagnostic("native_status_probe_start", {
                source: "background",
                songId: currentSongRef.current?.id || null,
              });
              return bridgeProbeNativePlayback();
            })
            .then((snapshot) => {
              logLockscreenPlaybackDiagnostic("native_status_probe_result", {
                source: "background",
                snapshotAvailable: Boolean(snapshot),
                nativeStatus: snapshot?.nativeStatus || null,
                hasLoadedTrack: snapshot?.hasLoadedTrack ?? null,
                isPlaying: snapshot?.isPlaying ?? null,
                playbackState: snapshot?.playbackState || null,
                activeTrackUrl: snapshot?.activeTrack?.url ? "present" : "missing",
              });
              if (nativeSnapshotIndicatesLoadedPlayback(snapshot)) {
                logLockscreenPlaybackDiagnostic("native_player_retained_after_lock", {
                  songId: currentSongRef.current?.id || null,
                  nativeStatus: snapshot?.nativeStatus || null,
                  isPlaying: snapshot?.isPlaying ?? null,
                  playbackState: snapshot?.playbackState || null,
                });
              } else {
                logLockscreenPlaybackDiagnostic("native_player_missing_after_lock", {
                  songId: currentSongRef.current?.id || null,
                  nativeStatus: snapshot?.nativeStatus || null,
                  hasLoadedTrack: snapshot?.hasLoadedTrack ?? null,
                });
              }
            })
            .catch((error) => {
              logLockscreenPlaybackDiagnostic("ios_background_reassert_failed", {
                songId: currentSongRef.current?.id || null,
                message: String((error as Error)?.message || error),
              });
            });
          return;
        }

        if (isPlayingRef.current && soundRef.current) {
          armFinishWatchdog(
            positionMillisRef.current,
            durationMillisRef.current,
            true
          );
          void catchUpPlaybackIfEnded();
        }
      }

      if (nextState === "active") {
        backgroundWatchTimersRef.current.forEach((timer) => clearTimeout(timer));
        backgroundWatchTimersRef.current = [];
        configureAudio("app_state_active");
        void applyProgressUpdateInterval("app_state_active");
        void (async () => {
          if (isHiddenAudioNativePlaybackEnabled()) {
            if (!currentSongRef.current || activeQueueRef.current.length === 0) {
              const hydrated = await hydrateJsPlaybackSessionFromStorage();
              if (hydrated) {
                logLockscreenPlaybackDiagnostic(
                  "foreground_saved_session_loaded_before_native_probe",
                  {
                    source: "app_state_active",
                    songId: currentSongRef.current?.id || null,
                    queueLength: activeQueueRef.current.length,
                    queueIndex: activeQueueIndexRef.current,
                  }
                );
              }
            }
            await reconcileHiddenAudioActiveState("app_state_active");
          }
          await resyncForegroundHiddenAudioState();
        })();
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
    hydrateJsPlaybackSessionFromStorage,
    reconcileHiddenAudioActiveState,
    syncHiddenAudioState,
    resyncForegroundHiddenAudioState,
    hasRecentIntentionalPause,
    intentionalPauseCooldownRemainingMs,
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
    activeQueueContextRef.current = activeQueueContext;
  }, [activeQueueContext]);

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
      preloadIdlePlayableTrack,
      setEmotionalQueue,
      advanceEmotionalQueue,
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
      preloadIdlePlayableTrack,
      setEmotionalQueue,
      advanceEmotionalQueue,
    ]
  );


  const upcomingSong = useMemo(() => {
    const queue = activeQueue.filter((song) => !isYouTubeSong(song));

    if (!queue.length || activeQueueIndex < 0) {
      return null;
    }

    const nextIndex = activeQueueIndex + 1;

    if (nextIndex < 0 || nextIndex >= queue.length) {
      return null;
    }

    return normalizeSong(queue[nextIndex]);
  }, [activeQueue, activeQueueIndex, isYouTubeSong, normalizeSong]);

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
      activeQueueContext,
      upcomingSong,
      favorites,
      recentlyPlayed,
      youtubeQueue,
      youtubeQueueIndex,
      radioQueue,
      radioMode,
      radioIndex,
      emotionalQueue: emotionalQueueSnapshot.emotionalQueue,
      queueIndex: emotionalQueueSnapshot.queueIndex,
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
      activeQueueContext,
      upcomingSong,
      favorites,
      recentlyPlayed,
      youtubeQueue,
      youtubeQueueIndex,
      radioQueue,
      radioMode,
      radioIndex,
      emotionalQueueSnapshot.emotionalQueue,
      emotionalQueueSnapshot.queueIndex,
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

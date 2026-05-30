import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { BackendYouTubeTrack } from "../services/youtubeBackend";
import { RadioTrack } from "../services/radioEngine";
import {
  addToRecentlyPlayed,
  loadRecentlyPlayed,
  RecentlyPlayedTrack,
} from "../services/recentlyPlayedEngine";
import {
  HiddenAudioController,
  HIDDEN_AUDIO_NOT_IMPLEMENTED_MESSAGE,
  type HiddenAudioEvent,
  type HiddenAudioState,
  type HiddenAudioTrack,
} from "../services/hiddenAudio/HiddenAudioController";
import {
  getActiveLyricLine,
  getBestLyricsPayload,
  parseLrc,
  resolveLyricsDisplay,
  toSyncedLyricLines,
} from "../utils/lyrics";
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
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
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
  playQueue: (
    queue: AppSong[],
    startIndex?: number,
    priorInterruptDone?: boolean
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

const FAVORITES_KEY = "hidden_tunes_favorites";
const SMART_AUTOPLAY_KEY = "hidden_tunes_smart_autoplay";

const idleAudioState: HiddenAudioState = {
  status: "idle",
  activeTrack: null,
  queue: {
    tracks: [],
    activeIndex: -1,
  },
  error: null,
};

function toHiddenAudioTrack(song: AppSong): HiddenAudioTrack {
  return {
    id: String(song.id),
    url:
      String(
        song.url ||
          song.streamUrl ||
          song.audioUrl ||
          song.audio_url ||
          ""
      ),
    title: song.title,
    artist: song.artist || song.user?.name || song.channelTitle,
    album: song.album,
    artworkUrl:
      song.artworkUrl ||
      song.artwork ||
      song.coverUrl ||
      song.cover_url ||
      song.cover ||
      song.thumbnail,
    durationSeconds:
      typeof song.durationSeconds === "number"
        ? song.durationSeconds
        : typeof song.duration === "number"
          ? song.duration
          : undefined,
    metadata: song.metadata as HiddenAudioTrack["metadata"],
  };
}

function fromHiddenAudioTrack(track: HiddenAudioTrack | null): AppSong | null {
  if (!track) return null;
  return {
    ...track,
    id: String(track.id),
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.artworkUrl,
    artworkUrl: track.artworkUrl,
    duration: track.durationSeconds,
    durationSeconds: track.durationSeconds,
  };
}

function cloneQueue(tracks: HiddenAudioTrack[]): AppSong[] {
  return tracks.map(fromHiddenAudioTrack).filter(Boolean) as AppSong[];
}

function isLoadingStatus(status: HiddenAudioState["status"]) {
  return status === "loading" || status === "buffering";
}

function normalizeSeekSeconds(value: number) {
  if (!Number.isFinite(value)) return 0;
  return value > 1000 ? value / 1000 : value;
}

async function safeStorageGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function safeStorageSet(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Non-audio persistence must never block playback.
  }
}

function logHiddenAudioError(command: string, error: unknown) {
  const message = String((error as Error)?.message || error);
  if (message === HIDDEN_AUDIO_NOT_IMPLEMENTED_MESSAGE) return;
  console.warn(`[HiddenAudio] ${command} failed:`, error);
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [audioState, setAudioState] = useState<HiddenAudioState>(idleAudioState);
  const [positionSeconds, setPositionSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [smartAutoplayEnabled, setSmartAutoplayEnabled] = useState(false);
  const [favorites, setFavorites] = useState<AppSong[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentlyPlayedTrack[]>([]);
  const [youtubeQueue, setYoutubeQueue] = useState<BackendYouTubeTrack[]>([]);
  const [youtubeQueueIndex, setYoutubeQueueIndex] = useState(-1);
  const [radioQueue, setRadioQueue] = useState<RadioTrack[]>([]);
  const [radioMode, setRadioMode] = useState(false);
  const [radioIndex, setRadioIndex] = useState(-1);

  const applyAudioState = useCallback((state: HiddenAudioState) => {
    setAudioState({
      ...state,
      queue: {
        activeIndex: state.queue.activeIndex,
        tracks: [...state.queue.tracks],
      },
    });
  }, []);

  const refreshSnapshot = useCallback(async () => {
    try {
      const [nextState, nextProgress] = await Promise.all([
        HiddenAudioController.getState(),
        HiddenAudioController.getProgress(),
      ]);
      applyAudioState(nextState);
      setPositionSeconds(nextProgress.positionSeconds);
      setDurationSeconds(nextProgress.durationSeconds);
    } catch (error) {
      logHiddenAudioError("refreshSnapshot", error);
    }
  }, [applyAudioState]);

  useEffect(() => {
    void refreshSnapshot();

    const unsubscribe = HiddenAudioController.subscribe((event: HiddenAudioEvent) => {
      if (event.type === "state") {
        applyAudioState(event.state);
        return;
      }
      if (event.type === "progress") {
        setPositionSeconds(event.progress.positionSeconds);
        setDurationSeconds(event.progress.durationSeconds);
        return;
      }
      if (event.type === "track_changed") {
        setAudioState((current) => ({
          ...current,
          activeTrack: event.track,
          queue: {
            ...current.queue,
            activeIndex: event.index,
          },
        }));
        return;
      }
      if (event.type === "diagnostic") {
        return;
      }
      setAudioState((current) => ({
        ...current,
        status: "error",
        error: event.message,
      }));
    });

    return unsubscribe;
  }, [applyAudioState, refreshSnapshot]);

  useEffect(() => {
    void safeStorageGet<AppSong[]>(FAVORITES_KEY, []).then(setFavorites);
    void safeStorageGet<boolean>(SMART_AUTOPLAY_KEY, false).then(
      setSmartAutoplayEnabled
    );
    void loadRecentlyPlayed().then(setRecentlyPlayed).catch(() => {});
  }, []);

  const runCommand = useCallback(
    async (command: string, action: () => Promise<void>) => {
      setAudioState((current) => ({
        ...current,
        status: command === "pause" ? current.status : "loading",
      }));

      try {
        await action();
        await refreshSnapshot();
      } catch (error) {
        logHiddenAudioError(command, error);
        setAudioState((current) => ({
          ...current,
          status: current.status === "loading" ? "idle" : current.status,
          error: String((error as Error)?.message || error),
        }));
      }
    },
    [refreshSnapshot]
  );

  const playSong = useCallback(
    async (song: AppSong, queue?: AppSong[], index = 0) => {
      const nextQueue = queue?.length ? queue : [song];
      const safeIndex = Math.max(0, Math.min(index, nextQueue.length - 1));
      const hiddenQueue = nextQueue.map(toHiddenAudioTrack);

      await runCommand("playSong", async () => {
        await HiddenAudioController.loadQueue(hiddenQueue, safeIndex);
        await HiddenAudioController.play();
      });

      setRecentlyPlayed((current) => {
        void addToRecentlyPlayed(song);
        return [song as RecentlyPlayedTrack, ...current.filter((item) => item.id !== song.id)].slice(0, 40);
      });
    },
    [runCommand]
  );

  const playQueue = useCallback(
    async (queue: AppSong[], startIndex = 0) => {
      if (!queue.length) return;
      const safeIndex = Math.max(0, Math.min(startIndex, queue.length - 1));
      await runCommand("playQueue", async () => {
        await HiddenAudioController.loadQueue(queue.map(toHiddenAudioTrack), safeIndex);
        await HiddenAudioController.play();
      });
    },
    [runCommand]
  );

  const playAudiusTrack = useCallback((song: AppSong) => playSong(song), [playSong]);

  const playYouTubeQueue = useCallback(
    async (tracks: BackendYouTubeTrack[], startIndex = 0) => {
      setYoutubeQueue(tracks);
      setYoutubeQueueIndex(startIndex);
    },
    []
  );

  const startRadio = useCallback(
    async (seedTrack: AppSong) => {
      setRadioMode(true);
      setRadioQueue([seedTrack as RadioTrack]);
      setRadioIndex(0);
      await playSong(seedTrack);
    },
    [playSong]
  );

  const startPersonalRadio = useCallback(async () => {
    setRadioMode(true);
  }, []);

  const playNextRadioTrack = useCallback(async () => false, []);

  const stopRadio = useCallback(async () => {
    setRadioMode(false);
    setRadioQueue([]);
    setRadioIndex(-1);
  }, []);

  const pause = useCallback(
    () => runCommand("pause", () => HiddenAudioController.pause()),
    [runCommand]
  );

  const resume = useCallback(
    () => runCommand("resume", () => HiddenAudioController.resume()),
    [runCommand]
  );

  const togglePlayPause = useCallback(async () => {
    if (audioState.status === "playing") {
      await pause();
      return;
    }
    await resume();
  }, [audioState.status, pause, resume]);

  const stopPlayback = useCallback(
    () => runCommand("stopPlayback", () => HiddenAudioController.stop()),
    [runCommand]
  );

  const seekTo = useCallback(
    (millis: number) =>
      runCommand("seekTo", () =>
        HiddenAudioController.seekTo(normalizeSeekSeconds(millis))
      ),
    [runCommand]
  );

  const nextSong = useCallback(
    () => runCommand("nextSong", () => HiddenAudioController.next()),
    [runCommand]
  );

  const previousSong = useCallback(
    () => runCommand("previousSong", () => HiddenAudioController.previous()),
    [runCommand]
  );

  const setVolume = useCallback(async (value: number) => {
    setVolumeState(Math.max(0, Math.min(1, value)));
  }, []);

  const toggleMute = useCallback(async () => {
    setIsMuted((current) => !current);
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((current) => !current);
  }, []);

  const toggleRepeatMode = useCallback(() => {
    setRepeatMode((current) =>
      current === "off" ? "all" : current === "all" ? "one" : "off"
    );
  }, []);

  const toggleSmartAutoplay = useCallback(async () => {
    setSmartAutoplayEnabled((current) => {
      const next = !current;
      void safeStorageSet(SMART_AUTOPLAY_KEY, next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback(async (song: AppSong) => {
    setFavorites((current) => {
      const exists = current.some((item) => item.id === song.id);
      const next = exists
        ? current.filter((item) => item.id !== song.id)
        : [song, ...current];
      void safeStorageSet(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (song: AppSong | null) =>
      Boolean(song && favorites.some((item) => item.id === song.id)),
    [favorites]
  );

  const clearActiveQueue = useCallback(async () => {
    setAudioState((current) => ({
      ...current,
      activeTrack: null,
      queue: {
        tracks: [],
        activeIndex: -1,
      },
    }));
    setPositionSeconds(0);
    setDurationSeconds(0);
  }, []);

  const preloadIdlePlayableTrack = useCallback(async () => {
    // Hidden Audio owns native loading. Idle preloading is intentionally disabled.
  }, []);

  const currentSong = useMemo(
    () => fromHiddenAudioTrack(audioState.activeTrack),
    [audioState.activeTrack]
  );
  const activeQueue = useMemo(
    () => cloneQueue(audioState.queue.tracks),
    [audioState.queue.tracks]
  );
  const positionMillis = Math.max(0, Math.floor(positionSeconds * 1000));
  const durationMillis = Math.max(0, Math.floor(durationSeconds * 1000));
  const lyricsPayload = useMemo(
    () => getBestLyricsPayload(currentSong),
    [currentSong]
  );
  const lyricsDisplay = useMemo(
    () => resolveLyricsDisplay(lyricsPayload.synced, lyricsPayload.plain),
    [lyricsPayload.plain, lyricsPayload.synced]
  );
  const currentLyrics = lyricsPayload.plain || lyricsDisplay.lines.map((line) => line.text).join("\n");
  const currentSyncedLyrics = useMemo(() => {
    if (currentSong?.parsedLyrics?.length) return currentSong.parsedLyrics;
    return toSyncedLyricLines(parseLrc(lyricsPayload.synced));
  }, [currentSong, lyricsPayload.synced]);
  const currentLyricLine = useMemo(() => {
    const active = getActiveLyricLine(
      lyricsDisplay.lines,
      positionMillis,
      lyricsDisplay.mode
    );
    return active ? { time: active.timeMs, text: active.text } : null;
  }, [lyricsDisplay.lines, lyricsDisplay.mode, positionMillis]);

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
    }),
    [
      clearActiveQueue,
      isFavorite,
      nextSong,
      playAudiusTrack,
      playNextRadioTrack,
      playQueue,
      playSong,
      playYouTubeQueue,
      preloadIdlePlayableTrack,
      previousSong,
      seekTo,
      setVolume,
      startPersonalRadio,
      startRadio,
      stopPlayback,
      stopRadio,
      toggleFavorite,
      toggleMute,
      togglePlayPause,
      toggleRepeatMode,
      toggleShuffle,
      toggleSmartAutoplay,
    ]
  );

  const stateValue = useMemo(
    () => ({
      currentSong,
      isPlaying: audioState.status === "playing",
      isLoading: isLoadingStatus(audioState.status),
      volume,
      isMuted,
      shuffle,
      repeatMode,
      smartAutoplayEnabled,
      currentLyrics,
      currentSyncedLyrics,
      songs: [],
      onlineSongs: [],
      activeQueue,
      activeQueueIndex: audioState.queue.activeIndex,
      activeQueueMode: "standard" as ActiveQueueMode,
      favorites,
      recentlyPlayed,
      youtubeQueue,
      youtubeQueueIndex,
      radioQueue,
      radioMode,
      radioIndex,
    }),
    [
      activeQueue,
      audioState.queue.activeIndex,
      audioState.status,
      currentLyrics,
      currentSong,
      currentSyncedLyrics,
      favorites,
      isMuted,
      radioIndex,
      radioMode,
      radioQueue,
      recentlyPlayed,
      repeatMode,
      shuffle,
      smartAutoplayEnabled,
      volume,
      youtubeQueue,
      youtubeQueueIndex,
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
    [currentLyricLine, durationMillis, positionMillis]
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

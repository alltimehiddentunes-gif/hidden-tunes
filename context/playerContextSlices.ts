import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import {
  buildPlayerFeedSnapshot,
  setPlayerFeedSnapshot,
} from "../utils/playerFeedStore";
import { trackPlaybackSubscriberRender } from "../utils/playbackRenderDiagnostics";
import {
  getNowPlayingSnapshot,
  setNowPlayingSnapshot,
  subscribeNowPlaying,
} from "../utils/nowPlayingStore";
import { markMetroRender } from "../utils/metroRenderProbe";

import type { AppSong, PlayerContextType, SyncedLyricLine } from "./PlayerContext";

export type PlayerActionsContextValue = Pick<
  PlayerContextType,
  | "playSong"
  | "playQueue"
  | "playAudiusTrack"
  | "playYouTubeQueue"
  | "startRadio"
  | "startPersonalRadio"
  | "playNextRadioTrack"
  | "stopRadio"
  | "togglePlayPause"
  | "stopPlayback"
  | "nextSong"
  | "previousSong"
  | "seekTo"
  | "setVolume"
  | "toggleMute"
  | "toggleShuffle"
  | "toggleRepeatMode"
  | "toggleSmartAutoplay"
  | "toggleFavorite"
  | "isFavorite"
  | "clearActiveQueue"
  | "enrichActiveQueueIfCurrent"
  | "preloadIdlePlayableTrack"
  | "setEmotionalQueue"
  | "advanceEmotionalQueue"
>;

export type PlayerStateContextValue = Pick<
  PlayerContextType,
  | "currentSong"
  | "isPlaying"
  | "isLoading"
  | "volume"
  | "isMuted"
  | "shuffle"
  | "repeatMode"
  | "smartAutoplayEnabled"
  | "currentLyrics"
  | "currentSyncedLyrics"
  | "songs"
  | "onlineSongs"
  | "activeQueue"
  | "activeQueueIndex"
  | "activeQueueMode"
  | "activeQueueContext"
  | "upcomingSong"
  | "favorites"
  | "recentlyPlayed"
  | "youtubeQueue"
  | "youtubeQueueIndex"
  | "radioQueue"
  | "radioMode"
  | "radioIndex"
  | "emotionalQueue"
  | "queueIndex"
>;

export type PlayerProgressContextValue = {
  positionMillis: number;
  durationMillis: number;
  position: number;
  duration: number;
  currentLyricLine: SyncedLyricLine | null;
};

export const PlayerActionsContext = createContext<
  PlayerActionsContextValue | undefined
>(undefined);

export const PlayerStateContext = createContext<
  PlayerStateContextValue | undefined
>(undefined);

export const PlayerProgressContext = createContext<
  PlayerProgressContextValue | undefined
>(undefined);

function usePlaybackRenderProbe(subscriber: string) {
  useEffect(() => {
    trackPlaybackSubscriberRender(subscriber);
  });
}

function usePlayerActionsContext(): PlayerActionsContextValue {
  const context = useContext(PlayerActionsContext);

  if (!context) {
    throw new Error("usePlayerActions must be used inside PlayerProvider");
  }

  return context;
}

function usePlayerStateContext(): PlayerStateContextValue {
  const context = useContext(PlayerStateContext);

  if (!context) {
    throw new Error("usePlayerState must be used inside PlayerProvider");
  }

  return context;
}

function usePlayerProgressContext(): PlayerProgressContextValue {
  const context = useContext(PlayerProgressContext);

  if (!context) {
    throw new Error("usePlayerProgress must be used inside PlayerProvider");
  }

  return context;
}

export function NowPlayingStoreSync() {
  const state = useContext(PlayerStateContext);
  const currentSongId = String(state?.currentSong?.id || "");
  const isPlaying = Boolean(state?.isPlaying);
  const isLoading = Boolean(state?.isLoading);
  const previousRef = useRef({ currentSongId, isLoading });

  useEffect(() => {
    setNowPlayingSnapshot({ currentSongId, isPlaying });
  }, [currentSongId, isPlaying]);

  useEffect(() => {
    const count = (globalThis as typeof globalThis & {
      __htCountIos217?: (kind: "trackWrites" | "bufferWrites") => void;
    }).__htCountIos217;
    if (previousRef.current.currentSongId !== currentSongId) count?.("trackWrites");
    if (previousRef.current.isLoading !== isLoading) count?.("bufferWrites");
    previousRef.current = { currentSongId, isLoading };
  }, [currentSongId, isLoading]);

  return null;
}

export function PlayerFeedStoreSync() {
  const state = useContext(PlayerStateContext);
  const previousQueueRef = useRef(state?.activeQueue);

  useEffect(() => {
    if (!state) return;
    if (previousQueueRef.current !== state.activeQueue) {
      (globalThis as typeof globalThis & { __htCountIos217?: (kind: "queueWrites") => void })
        .__htCountIos217?.("queueWrites");
      previousQueueRef.current = state.activeQueue;
    }

    setPlayerFeedSnapshot(
      buildPlayerFeedSnapshot({
        recentlyPlayed: state.recentlyPlayed,
        favorites: state.favorites,
        activeQueue: state.activeQueue,
        currentSong: state.currentSong,
      })
    );
  }, [
    state?.recentlyPlayed,
    state?.favorites,
    state?.activeQueue,
    state?.currentSong,
  ]);

  return null;
}

export function usePlayerActions(): PlayerActionsContextValue {
  markMetroRender("actionsConsumer");
  const context = usePlayerActionsContext();
  usePlaybackRenderProbe("usePlayerActions");
  return context;
}

export function usePlayerState(): PlayerStateContextValue {
  markMetroRender("stateConsumer");
  const context = usePlayerStateContext();
  usePlaybackRenderProbe("usePlayerState");
  return context;
}

export function usePlayerProgress(): PlayerProgressContextValue {
  markMetroRender("progressConsumer");
  const context = usePlayerProgressContext();
  usePlaybackRenderProbe("usePlayerProgress");
  return context;
}

export function usePlayerNowPlaying() {
  const { currentSong, isPlaying, isLoading } = usePlayerState();
  const currentSongId = currentSong?.id ?? null;

  return useMemo(
    () => ({
      currentSong,
      currentSongId,
      isPlaying,
      isLoading,
    }),
    [currentSong, currentSongId, isPlaying, isLoading]
  );
}

export function useTrackPlaybackStatus(trackId: string) {
  const normalizedTrackId = String(trackId || "");
  const snapshot = useSyncExternalStore(
    subscribeNowPlaying,
    getNowPlayingSnapshot,
    getNowPlayingSnapshot
  );
  markMetroRender(normalizedTrackId && snapshot.currentSongId === normalizedTrackId ? "trackStatusActive" : "trackStatusInactive");

  return useMemo(() => {
    const isActive = snapshot.currentSongId === normalizedTrackId;

    return {
      isActive,
      isPlaying: isActive && snapshot.isPlaying,
    };
  }, [normalizedTrackId, snapshot.currentSongId, snapshot.isPlaying]);
}

export function usePlayer(): PlayerContextType {
  const actions = usePlayerActionsContext();
  const state = usePlayerStateContext();
  const progress = usePlayerProgressContext();

  return useMemo(
    () => ({
      ...actions,
      ...state,
      ...progress,
    }),
    [actions, progress, state]
  );
}

export function useStablePlayerAction<T extends keyof PlayerActionsContextValue>(
  actionName: T
): PlayerActionsContextValue[T] {
  const actions = usePlayerActions();
  const actionRef = useRef(actions[actionName]);

  actionRef.current = actions[actionName];

  return actionRef.current;
}

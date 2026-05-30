import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  HiddenAudioController,
  HIDDEN_AUDIO_NOT_IMPLEMENTED_MESSAGE,
  type HiddenAudioEvent,
  type HiddenAudioState,
  type HiddenAudioTrack,
} from "../services/hiddenAudio/HiddenAudioController";
import { logPlaybackDiagnostic } from "../services/playbackDiagnostics";

export type PlayerContextV2Song = HiddenAudioTrack & {
  artwork?: string;
  cover?: string;
  streamUrl?: string;
  audioUrl?: string;
  audio_url?: string;
  duration?: string | number;
  [key: string]: unknown;
};

export type PlayerContextV2Value = {
  currentSong: PlayerContextV2Song | null;
  isPlaying: boolean;
  isLoading: boolean;
  queue: PlayerContextV2Song[];
  currentIndex: number;
  activeQueue: PlayerContextV2Song[];
  activeQueueIndex: number;
  activeQueueMode: "standard";
  progress: number;
  duration: number;
  positionMillis: number;
  durationMillis: number;
  playSong: (
    song: PlayerContextV2Song,
    queue?: PlayerContextV2Song[],
    index?: number
  ) => Promise<void>;
  playQueue: (queue: PlayerContextV2Song[], startIndex?: number) => Promise<void>;
  clearActiveQueue: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  nextSong: () => Promise<void>;
  previousSong: () => Promise<void>;
  stopPlayback: () => Promise<void>;
};

const PlayerContextV2 = createContext<PlayerContextV2Value | null>(null);

const idleHiddenAudioState: HiddenAudioState = {
  status: "idle",
  activeTrack: null,
  queue: {
    tracks: [],
    activeIndex: -1,
  },
  error: null,
};

function isLoadingStatus(status: HiddenAudioState["status"]) {
  return status === "loading" || status === "buffering";
}

function toHiddenAudioTrack(song: PlayerContextV2Song): HiddenAudioTrack {
  return {
    id: song.id,
    url:
      song.url ||
      song.streamUrl ||
      song.audioUrl ||
      song.audio_url ||
      "",
    title: song.title,
    artist: song.artist,
    album: song.album,
    artworkUrl: song.artworkUrl || song.artwork || song.cover,
    durationSeconds:
      typeof song.durationSeconds === "number"
        ? song.durationSeconds
        : typeof song.duration === "number"
          ? song.duration
          : undefined,
    metadata: song.metadata,
  };
}

function fromHiddenAudioTrack(
  track: HiddenAudioTrack | null
): PlayerContextV2Song | null {
  if (!track) return null;

  return {
    ...track,
    artwork: track.artworkUrl,
    duration: track.durationSeconds,
  };
}

function cloneQueue(tracks: HiddenAudioTrack[]): PlayerContextV2Song[] {
  return tracks
    .map((track) => fromHiddenAudioTrack(track))
    .filter(Boolean) as PlayerContextV2Song[];
}

function logPlayerContextV2Error(
  command: string,
  error: unknown,
  extra?: Record<string, unknown>
) {
  const message = String((error as Error)?.message || error);

  // TEMP_PLAYBACK_DIAGNOSTICS
  void logPlaybackDiagnostic("player_context_v2_command_error", {
    command,
    message,
    nativeMissing: message === HIDDEN_AUDIO_NOT_IMPLEMENTED_MESSAGE,
    ...(extra || {}),
  });
}

export function PlayerProviderV2({ children }: { children: ReactNode }) {
  const [audioState, setAudioState] =
    useState<HiddenAudioState>(idleHiddenAudioState);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const applyAudioState = useCallback((state: HiddenAudioState) => {
    setAudioState({
      ...state,
      queue: {
        activeIndex: state.queue.activeIndex,
        tracks: [...state.queue.tracks],
      },
    });
  }, []);

  const refreshSnapshot = useCallback(async (source = "manual") => {
    try {
      const [nextState, nextProgress] = await Promise.all([
        HiddenAudioController.getState(),
        HiddenAudioController.getProgress(),
      ]);

      applyAudioState(nextState);
      setProgress(nextProgress.positionSeconds);
      setDuration(nextProgress.durationSeconds);
    } catch (error) {
      logPlayerContextV2Error("refreshSnapshot", error, { source });
      setAudioState((current) => ({
        ...current,
        status: "idle",
        error: String((error as Error)?.message || error),
      }));
      setProgress(0);
      setDuration(0);
    }
  }, [applyAudioState]);

  useEffect(() => {
    void refreshSnapshot("provider_mount");

    const unsubscribe = HiddenAudioController.subscribe(
      (event: HiddenAudioEvent) => {
        if (event.type === "state") {
          applyAudioState(event.state);
          return;
        }

        if (event.type === "progress") {
          setProgress(event.progress.positionSeconds);
          setDuration(event.progress.durationSeconds);
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
      }
    );

    return unsubscribe;
  }, [applyAudioState, refreshSnapshot]);

  const runCommand = useCallback(
    async (command: string, action: () => Promise<void>) => {
      setAudioState((current) => ({
        ...current,
        status: command === "pause" ? current.status : "loading",
      }));

      try {
        await action();
        await refreshSnapshot(command);
      } catch (error) {
        logPlayerContextV2Error(command, error);
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
    async (
      song: PlayerContextV2Song,
      nextQueue?: PlayerContextV2Song[],
      index = 0
    ) => {
      const hiddenTrack = toHiddenAudioTrack(song);
      const hiddenQueue = (nextQueue || []).map(toHiddenAudioTrack);

      await runCommand("playSong", async () => {
        if (hiddenQueue.length > 0) {
          await HiddenAudioController.loadQueue(hiddenQueue, index);
          await HiddenAudioController.play();
          return;
        }

        await HiddenAudioController.loadTrack(hiddenTrack);
        await HiddenAudioController.play();
      });
    },
    [runCommand]
  );

  const playQueue = useCallback(
    async (nextQueue: PlayerContextV2Song[], startIndex = 0) => {
      const hiddenQueue = nextQueue.map(toHiddenAudioTrack);

      await runCommand("playQueue", async () => {
        await HiddenAudioController.loadQueue(hiddenQueue, startIndex);
        await HiddenAudioController.play();
      });
    },
    [runCommand]
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
    setProgress(0);
    setDuration(0);
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

  const seekTo = useCallback(
    (seconds: number) =>
      runCommand("seekTo", () =>
        HiddenAudioController.seekTo(Math.max(0, seconds || 0))
      ),
    [runCommand]
  );

  const next = useCallback(
    () => runCommand("next", () => HiddenAudioController.next()),
    [runCommand]
  );

  const previous = useCallback(
    () => runCommand("previous", () => HiddenAudioController.previous()),
    [runCommand]
  );

  const stopPlayback = useCallback(
    () => runCommand("stopPlayback", () => HiddenAudioController.stop()),
    [runCommand]
  );

  const value = useMemo<PlayerContextV2Value>(
    () => {
      const queue = cloneQueue(audioState.queue.tracks);

      return {
        currentSong: fromHiddenAudioTrack(audioState.activeTrack),
        isPlaying: audioState.status === "playing",
        isLoading: isLoadingStatus(audioState.status),
        queue,
        currentIndex: audioState.queue.activeIndex,
        activeQueue: queue,
        activeQueueIndex: audioState.queue.activeIndex,
        activeQueueMode: "standard",
        progress,
        duration,
        positionMillis: Math.max(0, Math.floor(progress * 1000)),
        durationMillis: Math.max(0, Math.floor(duration * 1000)),
        playSong,
        playQueue,
        clearActiveQueue,
        pause,
        resume,
        togglePlayPause,
        seekTo,
        next,
        previous,
        nextSong: next,
        previousSong: previous,
        stopPlayback,
      };
    },
    [
      audioState,
      clearActiveQueue,
      duration,
      next,
      pause,
      playSong,
      playQueue,
      previous,
      progress,
      resume,
      seekTo,
      stopPlayback,
      togglePlayPause,
    ]
  );

  return (
    <PlayerContextV2.Provider value={value}>
      {children}
    </PlayerContextV2.Provider>
  );
}

export function usePlayerV2(): PlayerContextV2Value {
  const context = useContext(PlayerContextV2);
  if (!context) {
    throw new Error("usePlayerV2 must be used inside PlayerProviderV2");
  }
  return context;
}

export { PlayerContextV2 };

import ActiveWorldRouteSync from "./ActiveWorldRouteSync";
import DebugModeGesture from "./DebugModeGesture";
import { memo, useEffect, useRef } from "react";

import PlayerScreenDebugOverlay from "../screens/PlayerScreenDebugOverlay";

import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerProgress,
} from "../context/PlayerContext";
import { loadHydratedCatalogOnce } from "../state/catalogFetchLayer";
import {
  disableRemoteMediaControls,
  enableRemoteMediaControls,
  isRemoteMediaControlsAvailable,
  syncRemoteMediaSession,
} from "../services/remoteMediaControls";
import { syncRemoteMediaSessionOrdered } from "../utils/remoteMediaSessionLayer";

const LOCKSCREEN_POSITION_SYNC_MS = 8000;

function RemoteMediaControlsBridge() {
  const { currentSong, isPlaying, isLoading } = usePlayerNowPlaying();
  const { positionMillis, durationMillis } = usePlayerProgress();
  const { togglePlayPause, nextSong, previousSong, stopPlayback } =
    usePlayerActions();

  const isPlayingRef = useRef(isPlaying);
  const togglePlayPauseRef = useRef(togglePlayPause);
  const nextSongRef = useRef(nextSong);
  const previousSongRef = useRef(previousSong);
  const stopPlaybackRef = useRef(stopPlayback);
  const latestSongIdRef = useRef(String(currentSong?.id ?? ""));
  const currentSongRef = useRef(currentSong);
  const isLoadingRef = useRef(isLoading);
  const positionMillisRef = useRef(positionMillis);
  const durationMillisRef = useRef(durationMillis);
  const lastPositionSyncAtRef = useRef(0);

  isPlayingRef.current = isPlaying;
  togglePlayPauseRef.current = togglePlayPause;
  nextSongRef.current = nextSong;
  previousSongRef.current = previousSong;
  stopPlaybackRef.current = stopPlayback;
  latestSongIdRef.current = String(currentSong?.id ?? "");
  currentSongRef.current = currentSong;
  isLoadingRef.current = isLoading;
  positionMillisRef.current = positionMillis;
  durationMillisRef.current = durationMillis;

  useEffect(() => {
    void loadHydratedCatalogOnce();
  }, []);

  useEffect(() => {
    if (!isRemoteMediaControlsAvailable()) return;

    let cancelled = false;

    void enableRemoteMediaControls({
      onPlay: async () => {
        if (!isPlayingRef.current) {
          await togglePlayPauseRef.current();
        }
      },
      onPause: async () => {
        if (isPlayingRef.current) {
          await togglePlayPauseRef.current();
        }
      },
      onNext: async () => {
        await nextSongRef.current();
      },
      onPrevious: async () => {
        await previousSongRef.current();
      },
      onStop: async () => {
        await stopPlaybackRef.current();
      },
    }).then((enabled: boolean) => {
      if (!enabled || cancelled) return;
    });

    return () => {
      cancelled = true;
      void disableRemoteMediaControls();
    };
  }, []);

  const syncSession = (forcePosition = false) => {
    if (!isRemoteMediaControlsAvailable()) return;

    const now = Date.now();
    if (
      !forcePosition &&
      now - lastPositionSyncAtRef.current < LOCKSCREEN_POSITION_SYNC_MS
    ) {
      return;
    }

    lastPositionSyncAtRef.current = now;

    const snapshot = {
      song: currentSongRef.current,
      isPlaying: isPlayingRef.current,
      isLoading: isLoadingRef.current,
      positionMillis: positionMillisRef.current,
      durationMillis: durationMillisRef.current,
    };

    void syncRemoteMediaSessionOrdered(snapshot, async (nextSnapshot) => {
      const activeSongId = latestSongIdRef.current;
      const snapshotSongId = String(nextSnapshot.song?.id ?? "");

      if (activeSongId && snapshotSongId && activeSongId !== snapshotSongId) {
        return;
      }

      await syncRemoteMediaSession(nextSnapshot);
    });
  };

  useEffect(() => {
    syncSession(true);
  }, [currentSong?.id, isPlaying, isLoading]);

  useEffect(() => {
    if (!isPlaying || !isRemoteMediaControlsAvailable()) return;

    const timer = setInterval(() => {
      syncSession(false);
    }, LOCKSCREEN_POSITION_SYNC_MS);

    return () => clearInterval(timer);
  }, [currentSong?.id, isPlaying]);

  return (
    <>
      <ActiveWorldRouteSync />
      {__DEV__ ? <DebugModeGesture /> : null}
      {__DEV__ ? <PlayerScreenDebugOverlay /> : null}
    </>
  );
}

export default memo(RemoteMediaControlsBridge);

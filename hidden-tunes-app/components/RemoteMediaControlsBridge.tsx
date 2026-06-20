import { memo, useEffect, useRef } from "react";

import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerProgress,
} from "../context/PlayerContext";
import { isTrackPlayerFeatureEnabled } from "../constants/playbackConfig";
import {
  disableRemoteMediaControls,
  enableRemoteMediaControls,
  isRemoteMediaControlsAvailable,
  syncRemoteMediaSession,
} from "../services/remoteMediaControls";

const REMOTE_MEDIA_POSITION_SYNC_MIN_MS = 5000;
const REMOTE_MEDIA_POSITION_DELTA_SEC = 5;

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
  const lastRemoteSyncRef = useRef({
    songId: "",
    isPlaying: false,
    isLoading: false,
    positionSec: -1,
    at: 0,
  });

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    togglePlayPauseRef.current = togglePlayPause;
    nextSongRef.current = nextSong;
    previousSongRef.current = previousSong;
    stopPlaybackRef.current = stopPlayback;
  }, [isPlaying, togglePlayPause, nextSong, previousSong, stopPlayback]);

  useEffect(() => {
    if (!isRemoteMediaControlsAvailable()) return;
    if (isTrackPlayerFeatureEnabled()) return;

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

  useEffect(() => {
    if (!isRemoteMediaControlsAvailable()) return;
    if (isTrackPlayerFeatureEnabled()) return;

    const songId = currentSong?.id || "";
    const positionSec = Math.max(0, Math.round(positionMillis / 1000));
    const now = Date.now();
    const last = lastRemoteSyncRef.current;

    const metadataChanged =
      songId !== last.songId ||
      isPlaying !== last.isPlaying ||
      isLoading !== last.isLoading;
    const positionChanged =
      Math.abs(positionSec - last.positionSec) >=
      REMOTE_MEDIA_POSITION_DELTA_SEC;
    const timeElapsed = now - last.at >= REMOTE_MEDIA_POSITION_SYNC_MIN_MS;

    if (!metadataChanged && !positionChanged && !timeElapsed) {
      return;
    }

    lastRemoteSyncRef.current = {
      songId,
      isPlaying,
      isLoading,
      positionSec,
      at: now,
    };

    void syncRemoteMediaSession({
      song: currentSong,
      isPlaying,
      isLoading,
      positionMillis,
      durationMillis,
    });
  }, [
    currentSong,
    currentSong?.id,
    isPlaying,
    isLoading,
    positionMillis,
    durationMillis,
  ]);

  return null;
}

export default memo(RemoteMediaControlsBridge);

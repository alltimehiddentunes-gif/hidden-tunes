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

  isPlayingRef.current = isPlaying;
  togglePlayPauseRef.current = togglePlayPause;
  nextSongRef.current = nextSong;
  previousSongRef.current = previousSong;
  stopPlaybackRef.current = stopPlayback;

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

import ActiveWorldRouteSync from "./ActiveWorldRouteSync";
import DebugModeGesture from "./DebugModeGesture";
import { memo, useEffect, useRef } from "react";

import PlayerScreenDebugOverlay from "../screens/PlayerScreenDebugOverlay";

import {
  usePlayerActions,
  usePlayerNowPlaying,
} from "../context/PlayerContext";
import { useTvPlayback } from "../context/TvPlaybackContext";
import {
  getActivePlaybackOwner,
  getPlaybackHandoffGeneration,
} from "../services/playback/PlaybackHandoffCoordinator";
import { bridgeGetProgress } from "../services/playbackBridge";
import { loadHydratedCatalogOnce } from "../state/catalogFetchLayer";
import {
  clearRemoteMediaPresentedState,
  disableRemoteMediaControls,
  enableRemoteMediaControls,
  isRemoteMediaControlsAvailable,
  syncRemoteMediaSession,
} from "../services/remoteMediaControls";
import {
  logTvMediaSessionDiag,
  summarizeTvMetadataForDiag,
} from "../services/tv/tvMediaSessionDiagnostics";
import { FALLBACK_ARTWORK } from "../utils/artwork";
import { buildTvNowPlayingMetadata } from "../services/tv/tvNowPlayingMetadata";
import {
  clearTvPresentedNowPlaying,
  publishTvPresentedNowPlaying,
  updateTvPresentedPlaybackState,
} from "../services/tv/tvPresentedNowPlaying";
import { syncRemoteMediaSessionOrdered } from "../utils/remoteMediaSessionLayer";

const LOCKSCREEN_POSITION_SYNC_MS = 8000;

function isSharedAudioRemoteOwner() {
  return getActivePlaybackOwner() === "shared-audio";
}

function isTvRemoteOwner() {
  return getActivePlaybackOwner() === "tv";
}

function RemoteMediaControlsBridge() {
  const { currentSong, isPlaying, isLoading } = usePlayerNowPlaying();
  const { togglePlayPause, nextSong, previousSong, stopPlayback } =
    usePlayerActions();
  const {
    currentTvChannel,
    isTvPlaying,
    tvQueue,
    nextTvChannel,
    previousTvChannel,
    stopTv,
    toggleTvPlayback,
  } = useTvPlayback();

  const isPlayingRef = useRef(isPlaying);
  const togglePlayPauseRef = useRef(togglePlayPause);
  const nextSongRef = useRef(nextSong);
  const previousSongRef = useRef(previousSong);
  const stopPlaybackRef = useRef(stopPlayback);
  const latestSongIdRef = useRef(String(currentSong?.id ?? ""));
  const currentSongRef = useRef(currentSong);
  const isLoadingRef = useRef(isLoading);
  const lastPositionSyncAtRef = useRef(0);

  const isTvPlayingRef = useRef(isTvPlaying);
  const currentTvChannelRef = useRef(currentTvChannel);
  const tvQueueRef = useRef(tvQueue);
  const nextTvChannelRef = useRef(nextTvChannel);
  const previousTvChannelRef = useRef(previousTvChannel);
  const stopTvRef = useRef(stopTv);
  const toggleTvPlaybackRef = useRef(toggleTvPlayback);
  const lastTvPresentedKeyRef = useRef("");

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    togglePlayPauseRef.current = togglePlayPause;
    nextSongRef.current = nextSong;
    previousSongRef.current = previousSong;
    stopPlaybackRef.current = stopPlayback;
    latestSongIdRef.current = String(currentSong?.id ?? "");
    currentSongRef.current = currentSong;
    isLoadingRef.current = isLoading;

    isTvPlayingRef.current = isTvPlaying;
    currentTvChannelRef.current = currentTvChannel;
    tvQueueRef.current = tvQueue;
    nextTvChannelRef.current = nextTvChannel;
    previousTvChannelRef.current = previousTvChannel;
    stopTvRef.current = stopTv;
    toggleTvPlaybackRef.current = toggleTvPlayback;
  }, [
    currentSong,
    currentTvChannel,
    isLoading,
    isPlaying,
    isTvPlaying,
    nextSong,
    nextTvChannel,
    previousSong,
    previousTvChannel,
    stopPlayback,
    stopTv,
    togglePlayPause,
    toggleTvPlayback,
    tvQueue,
  ]);

  useEffect(() => {
    void loadHydratedCatalogOnce();
  }, []);

  useEffect(() => {
    if (!isRemoteMediaControlsAvailable()) return;

    let cancelled = false;

    void enableRemoteMediaControls({
      onPlay: async () => {
        if (isTvRemoteOwner()) {
          logTvMediaSessionDiag("tv_remote_play_received", { path: "remote_media" });
          if (!isTvPlayingRef.current) {
            toggleTvPlaybackRef.current();
          }
          return;
        }
        if (!isSharedAudioRemoteOwner()) return;
        if (!isPlayingRef.current) {
          await togglePlayPauseRef.current();
        }
      },
      onPause: async () => {
        if (isTvRemoteOwner()) {
          logTvMediaSessionDiag("tv_remote_pause_received", { path: "remote_media" });
          if (isTvPlayingRef.current) {
            toggleTvPlaybackRef.current();
          }
          return;
        }
        if (!isSharedAudioRemoteOwner()) return;
        if (isPlayingRef.current) {
          await togglePlayPauseRef.current();
        }
      },
      onNext: async () => {
        if (isTvRemoteOwner()) {
          if ((tvQueueRef.current?.length || 0) < 2) return;
          logTvMediaSessionDiag("tv_remote_next_received", { path: "remote_media" });
          nextTvChannelRef.current();
          return;
        }
        if (!isSharedAudioRemoteOwner()) return;
        await nextSongRef.current();
      },
      onPrevious: async () => {
        if (isTvRemoteOwner()) {
          if ((tvQueueRef.current?.length || 0) < 2) return;
          logTvMediaSessionDiag("tv_remote_previous_received", {
            path: "remote_media",
          });
          previousTvChannelRef.current();
          return;
        }
        if (!isSharedAudioRemoteOwner()) return;
        await previousSongRef.current();
      },
      onStop: async () => {
        if (isTvRemoteOwner()) {
          logTvMediaSessionDiag("tv_remote_stop_received", { path: "remote_media" });
          stopTvRef.current();
          return;
        }
        if (!isSharedAudioRemoteOwner()) return;
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

  const syncTvPresentedNative = async (force = false) => {
    if (!isTvRemoteOwner()) return;
    const channel = currentTvChannelRef.current;
    const metadata = buildTvNowPlayingMetadata(channel);
    if (!metadata) return;

    logTvMediaSessionDiag("tv_metadata_created", summarizeTvMetadataForDiag(metadata));

    const queueLen = tvQueueRef.current?.length || 0;
    const hasNav = queueLen > 1;
    const key = `${metadata.id}|${metadata.title}|${metadata.artist}|${metadata.artworkUri}|${isTvPlayingRef.current}|${hasNav}`;
    if (!force && key === lastTvPresentedKeyRef.current) {
      await updateTvPresentedPlaybackState({
        isPlaying: isTvPlayingRef.current,
        hasNext: hasNav,
        hasPrevious: hasNav,
      });
      return;
    }
    lastTvPresentedKeyRef.current = key;
    await publishTvPresentedNowPlaying({
      metadata: {
        ...metadata,
        artworkUri: metadata.artworkUri || FALLBACK_ARTWORK,
      },
      isPlaying: isTvPlayingRef.current,
      hasNext: hasNav,
      hasPrevious: hasNav,
    });
  };

  const syncSession = async (forcePosition = false) => {
    const owner = getActivePlaybackOwner();

    // TV owns the system media session — publish channel metadata, not stale audio.
    if (owner === "tv") {
      const channel = currentTvChannelRef.current;
      const metadata = buildTvNowPlayingMetadata(channel);
      if (!metadata) {
        await clearRemoteMediaPresentedState("tv_no_channel");
        return;
      }

      logTvMediaSessionDiag("tv_owner_claimed", {
        channelId: metadata.id,
        title: metadata.title,
      });

      await syncTvPresentedNative(forcePosition);

      if (!isRemoteMediaControlsAvailable()) return;

      const presented = {
        id: metadata.id,
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        artworkUri: metadata.artworkUri || FALLBACK_ARTWORK,
        isLive: true as const,
      };

      const snapshot = {
        song: null,
        presented,
        isPlaying: isTvPlayingRef.current,
        isLoading: false,
        positionMillis: 0,
        durationMillis: 0,
      };

      const syncGeneration = getPlaybackHandoffGeneration();
      void syncRemoteMediaSessionOrdered(snapshot, async (nextSnapshot) => {
        if (getActivePlaybackOwner() !== "tv") {
          logTvMediaSessionDiag("tv_metadata_replaced_by_other", {
            activeOwner: getActivePlaybackOwner(),
          });
          return;
        }
        if (getPlaybackHandoffGeneration() !== syncGeneration) return;
        await syncRemoteMediaSession(nextSnapshot);
        logTvMediaSessionDiag("tv_metadata_published", {
          path: "remote_media",
          title: nextSnapshot.presented?.title,
          isPlaying: nextSnapshot.isPlaying,
        });
      });
      return;
    }

    if (!isRemoteMediaControlsAvailable()) {
      if (owner !== "shared-audio") {
        lastTvPresentedKeyRef.current = "";
        await clearTvPresentedNowPlaying("non_audio_owner");
      }
      return;
    }

    // Non-audio / non-TV owners: wipe RemoteMedia so previous titles cannot linger.
    if (!isSharedAudioRemoteOwner() || !currentSongRef.current) {
      lastTvPresentedKeyRef.current = "";
      if (!isSharedAudioRemoteOwner()) {
        await clearTvPresentedNowPlaying("non_audio_owner");
      }
      await clearRemoteMediaPresentedState(
        !isSharedAudioRemoteOwner() ? "non_audio_owner" : "no_current_song"
      );
      return;
    }

    const now = Date.now();
    if (
      !forcePosition &&
      now - lastPositionSyncAtRef.current < LOCKSCREEN_POSITION_SYNC_MS
    ) {
      return;
    }

    lastPositionSyncAtRef.current = now;

    let positionMillis = 0;
    let durationMillis = 0;
    try {
      const progress = await bridgeGetProgress();
      positionMillis = Math.max(0, Math.floor(progress.positionMillis || 0));
      durationMillis = Math.max(0, Math.floor(progress.durationMillis || 0));
    } catch {
      // Fall back to zero position if native progress is briefly unavailable.
    }

    const snapshot = {
      song: currentSongRef.current,
      presented: null,
      isPlaying: isPlayingRef.current,
      isLoading: isLoadingRef.current,
      positionMillis,
      durationMillis,
    };

    const syncGeneration = getPlaybackHandoffGeneration();

    void syncRemoteMediaSessionOrdered(snapshot, async (nextSnapshot) => {
      if (!isSharedAudioRemoteOwner()) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[HTRemoteMedia] metadata_publish_rejected", {
            reason: "owner_changed",
            generation: syncGeneration,
            activeOwner: getActivePlaybackOwner(),
            ts: Date.now(),
          });
        }
        return;
      }
      if (getPlaybackHandoffGeneration() !== syncGeneration) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[HTRemoteMedia] metadata_publish_rejected", {
            reason: "stale_generation",
            generation: syncGeneration,
            ts: Date.now(),
          });
        }
        return;
      }

      const activeSongId = latestSongIdRef.current;
      const snapshotSongId = String(nextSnapshot.song?.id ?? "");

      // Reject in-flight publishes after ownership/stop cleared the active song.
      if (!activeSongId && snapshotSongId) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[HTRemoteMedia] metadata_publish_rejected", {
            reason: "stale_song_after_clear",
            snapshotSongId,
            ts: Date.now(),
          });
        }
        return;
      }

      if (activeSongId && snapshotSongId && activeSongId !== snapshotSongId) {
        return;
      }

      await syncRemoteMediaSession(nextSnapshot);
    });
  };

  useEffect(() => {
    void syncSession(true);
    // syncSession reads latest values via refs; re-run on media identity/state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentSong?.id,
    isPlaying,
    isLoading,
    currentTvChannel?.id,
    currentTvChannel?.title,
    isTvPlaying,
    tvQueue.length,
  ]);

  useEffect(() => {
    if (!isPlaying || !isRemoteMediaControlsAvailable()) return;
    if (!isSharedAudioRemoteOwner()) return;

    const timer = setInterval(() => {
      void syncSession(false);
    }, LOCKSCREEN_POSITION_SYNC_MS);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong?.id, isPlaying]);

  // Keep HiddenAudio presented playback rate in sync while TV owns (iOS/CarPlay).
  useEffect(() => {
    if (!isTvRemoteOwner()) return;
    void syncTvPresentedNative(false);
  }, [isTvPlaying, currentTvChannel?.id, tvQueue.length]);

  return (
    <>
      <ActiveWorldRouteSync />
      {__DEV__ ? <DebugModeGesture /> : null}
      {__DEV__ ? <PlayerScreenDebugOverlay /> : null}
    </>
  );
}

export default memo(RemoteMediaControlsBridge);

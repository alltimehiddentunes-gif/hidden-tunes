import { useEffect, useRef } from "react";

import {
  usePlayerActions,
  usePlayerNowPlaying,
  usePlayerProgress,
  usePlayerState,
} from "@/context/PlayerContext";
import { saveMotivationProgress } from "@/services/motivationProgress";
import {
  isMotivationItemAppSong,
  isMotivationQueueContext,
  parseMotivationItemSongId,
} from "@/utils/motivationPlaybackAdapter";
import {
  MotivationPlaybackController,
  motivationSongNeedsResolve,
} from "@/utils/MotivationPlaybackController";

const SAVE_INTERVAL_MS = 7000;
const COMPLETION_PERCENT = 92;
const COMPLETION_REMAINING_MS = 20_000;

export function useMotivationPlaybackBinding() {
  const { playSong } = usePlayerActions();
  const { currentSong } = usePlayerNowPlaying();
  const { position } = usePlayerProgress();
  const { activeQueueContext, activeQueue, activeQueueIndex } = usePlayerState();

  const currentSongRef = useRef(currentSong);
  const positionRef = useRef(position);
  const activeQueueRef = useRef(activeQueue);
  const activeQueueIndexRef = useRef(activeQueueIndex);
  const lastSavedAtRef = useRef(0);
  const resolvingRef = useRef<string | null>(null);

  currentSongRef.current = currentSong;
  positionRef.current = position;
  activeQueueRef.current = activeQueue;
  activeQueueIndexRef.current = activeQueueIndex;

  useEffect(() => {
    MotivationPlaybackController.bindPlayerActions({
      playSong,
      getCurrentSongId: () => currentSongRef.current?.id || null,
      getActiveQueue: () => activeQueueRef.current || [],
      getActiveQueueIndex: () => activeQueueIndexRef.current || 0,
    });
    return () => MotivationPlaybackController.bindPlayerActions(null);
  }, [playSong]);

  // MiniPlayer next/prev may land on metadata-only queue entries — resolve on demand.
  useEffect(() => {
    if (!isMotivationItemAppSong(currentSong)) return;
    if (!isMotivationQueueContext(activeQueueContext)) return;
    if (!motivationSongNeedsResolve(currentSong)) return;
    const songId = currentSong?.id || null;
    if (!songId || resolvingRef.current === songId) return;
    resolvingRef.current = songId;
    void MotivationPlaybackController.resolveCurrentIfNeeded(songId)
      .catch((error) => {
        if (__DEV__) {
          console.warn("[motivation] resolve-on-demand failed", {
            songId,
            sessionKind: "motivation",
            operation: "resolveCurrentIfNeeded",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      })
      .finally(() => {
        if (resolvingRef.current === songId) resolvingRef.current = null;
      });
  }, [activeQueueContext, currentSong, currentSong?.id, currentSong?.streamUrl, currentSong?.url]);

  useEffect(() => {
    const session = MotivationPlaybackController.getSession();
    if (!session) return;
    if (!isMotivationItemAppSong(currentSong)) return;
    if (!isMotivationQueueContext(activeQueueContext)) return;

    const itemId = parseMotivationItemSongId(currentSong?.id);
    if (!itemId) return;

    const now = Date.now();
    if (now - lastSavedAtRef.current < SAVE_INTERVAL_MS) return;
    lastSavedAtRef.current = now;

    const matched = session.loadedItems.find((item) => item.id === itemId);
    const durationMillis = matched?.duration_seconds
      ? matched.duration_seconds * 1000
      : null;
    const positionMillis = Math.max(0, Math.floor(position || 0));
    const completion =
      durationMillis && durationMillis > 0
        ? Math.round((positionMillis / durationMillis) * 100)
        : 0;
    const completed =
      Boolean(durationMillis && durationMillis > 45_000) &&
      (completion >= COMPLETION_PERCENT ||
        (durationMillis != null && durationMillis - positionMillis <= COMPLETION_REMAINING_MS));

    void saveMotivationProgress({
      itemId,
      programId: session.programId,
      programTitle: session.program.title,
      programArtwork: session.program.artwork_url || null,
      categorySlug: session.contextSlug || session.program.category_slug || null,
      itemTitle: currentSong?.title || matched?.title || null,
      positionMillis,
      durationMillis,
      completionPercentage: completion,
      completed,
      updatedAt: now,
    });
  }, [activeQueueContext, currentSong?.id, currentSong?.title, position]);
}

export function useMotivationPlayback() {
  const { currentSong } = usePlayerNowPlaying();
  return {
    isMotivationMode: isMotivationItemAppSong(currentSong),
    session: MotivationPlaybackController.getSession(),
    nextItem: () => MotivationPlaybackController.nextItem(),
    previousItem: () => MotivationPlaybackController.previousItem(),
  };
}

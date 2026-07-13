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
import { MotivationPlaybackController } from "@/utils/MotivationPlaybackController";

const SAVE_INTERVAL_MS = 7000;

export function useMotivationPlaybackBinding() {
  const { playSong } = usePlayerActions();
  const { currentSong } = usePlayerNowPlaying();
  const { position } = usePlayerProgress();
  const { activeQueueContext } = usePlayerState();

  const currentSongRef = useRef(currentSong);
  const positionRef = useRef(position);
  currentSongRef.current = currentSong;
  positionRef.current = position;

  useEffect(() => {
    MotivationPlaybackController.bindPlayerActions({
      playSong,
      getCurrentSongId: () => currentSongRef.current?.id || null,
    });
    return () => MotivationPlaybackController.bindPlayerActions(null);
  }, [playSong]);

  useEffect(() => {
    const session = MotivationPlaybackController.getSession();
    if (!session) return;
    if (!isMotivationItemAppSong(currentSong)) return;
    if (!isMotivationQueueContext(activeQueueContext)) return;

    const itemId = parseMotivationItemSongId(currentSong?.id);
    if (!itemId) return;

    const durationMillis = session.loadedItems.find((item) => item.id === itemId)?.duration_seconds
      ? (session.loadedItems.find((item) => item.id === itemId)?.duration_seconds || 0) * 1000
      : null;
    const positionMillis = Math.max(0, Math.floor(position || 0));
    const completion =
      durationMillis && durationMillis > 0
        ? Math.round((positionMillis / durationMillis) * 100)
        : 0;
    const completed =
      Boolean(durationMillis && durationMillis > 60_000) &&
      (completion >= 90 ||
        (durationMillis != null && durationMillis - positionMillis <= 30_000));

    void saveMotivationProgress({
      itemId,
      programId: session.programId,
      programTitle: session.program.title,
      programArtwork: session.program.artwork_url || null,
      categorySlug: session.contextSlug || session.program.category_slug || null,
      itemTitle: currentSong?.title || null,
      positionMillis,
      durationMillis,
      completionPercentage: completion,
      completed,
      updatedAt: Date.now(),
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

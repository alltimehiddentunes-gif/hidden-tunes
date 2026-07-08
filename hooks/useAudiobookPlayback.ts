import { useEffect, useRef } from "react";

import {
  usePlayerActions,
  usePlayerProgress,
  usePlayerState,
} from "../context/PlayerContext";
import type { AudiobookChapter } from "../types/audiobooks";
import { parseAudiobookChapterSongId } from "../utils/audiobookPlaybackAdapter";
import { saveAudiobookProgress } from "../services/audiobookProgress";

const SAVE_INTERVAL_MS = 4000;

type UseAudiobookProgressTrackerArgs = {
  bookId?: string | null;
  chapters?: AudiobookChapter[];
  enabled?: boolean;
};

export function useAudiobookProgressTracker({
  bookId,
  chapters = [],
  enabled = true,
}: UseAudiobookProgressTrackerArgs) {
  const { currentSong } = usePlayerState();
  const { position } = usePlayerProgress();
  const lastSavedAtRef = useRef(0);
  const chaptersRef = useRef(chapters);

  useEffect(() => {
    chaptersRef.current = chapters;
  }, [chapters]);

  useEffect(() => {
    if (!enabled || !bookId) return;

    const chapterId = parseAudiobookChapterSongId(currentSong?.id);
    if (!chapterId) return;

    const chapter = chaptersRef.current.find((item) => item.id === chapterId);
    const now = Date.now();
    if (now - lastSavedAtRef.current < SAVE_INTERVAL_MS) return;

    lastSavedAtRef.current = now;
    void saveAudiobookProgress({
      bookId,
      chapterId,
      chapterNumber: chapter?.chapter_number ?? null,
      chapterTitle: chapter?.title || currentSong?.title || null,
      positionMillis: Math.max(0, Math.floor(position || 0)),
      updatedAt: now,
    });
  }, [bookId, currentSong?.id, currentSong?.title, enabled, position]);
}

export function useAudiobookPlaybackActions() {
  const { playSong, seekTo } = usePlayerActions();
  return { playSong, seekTo };
}

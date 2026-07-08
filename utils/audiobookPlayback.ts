import type { AppSong } from "../context/PlayerContext";
import type {
  AudiobookChapterPlayItem,
  AudiobookItem,
} from "../types/audiobooks";
import {
  buildAudiobookChapterAppSongs,
  isPlayableAudiobookChapterAudioUrl,
} from "./audiobookPlaybackAdapter";

const AUDIOBOOK_QUEUE_CONTEXT = { source: "unknown" as const, label: "Audiobooks" };

type PlaySongFn = (
  song: AppSong,
  queue?: AppSong[],
  index?: number,
  queueContext?: typeof AUDIOBOOK_QUEUE_CONTEXT,
  queueMode?: "standard"
) => Promise<void>;

type SeekToFn = (millis: number) => Promise<void>;

export type PlayAudiobookChapterQueueArgs = {
  book: AudiobookItem;
  chapters: AudiobookChapterPlayItem[];
  startChapterId: string;
  playSong: PlaySongFn;
  seekTo?: SeekToFn;
  startPositionMillis?: number;
};

export async function playAudiobookChapterQueue({
  book,
  chapters,
  startChapterId,
  playSong,
  seekTo,
  startPositionMillis = 0,
}: PlayAudiobookChapterQueueArgs) {
  const playableChapters = chapters.filter(
    (chapter) =>
      Boolean(chapter.audio_url?.trim()) &&
      isPlayableAudiobookChapterAudioUrl(chapter.audio_url)
  );

  if (!playableChapters.length) {
    return { ok: false as const, error: "This chapter is unavailable" };
  }

  const songs = buildAudiobookChapterAppSongs(book, playableChapters);
  if (!songs.length) {
    return { ok: false as const, error: "This chapter is unavailable" };
  }

  const resolvedIndex = playableChapters.findIndex(
    (chapter) => chapter.id === startChapterId
  );
  const safeIndex = Math.max(
    0,
    Math.min(resolvedIndex >= 0 ? resolvedIndex : 0, songs.length - 1)
  );

  try {
    await playSong(
      songs[safeIndex],
      songs,
      safeIndex,
      { ...AUDIOBOOK_QUEUE_CONTEXT, label: book.title || "Audiobooks" },
      "standard"
    );

    const resumeMs = Math.max(0, Math.floor(startPositionMillis || 0));
    if (resumeMs > 0 && seekTo) {
      await seekTo(resumeMs);
    }

    return {
      ok: true as const,
      chapter: playableChapters[safeIndex],
      song: songs[safeIndex],
    };
  } catch (error) {
    return {
      ok: false as const,
      error: String((error as Error)?.message || "This chapter is unavailable"),
    };
  }
}

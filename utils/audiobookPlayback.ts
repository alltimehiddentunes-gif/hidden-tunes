import type { AppSong } from "../context/PlayerContext";
import type {
  AudiobookChapterPlayItem,
  AudiobookItem,
} from "../types/audiobooks";
import { orderAudiobookChapters } from "./audiobookOrdering";
import {
  buildAudiobookChapterAppSongs,
  buildAudiobookQueueContext,
  isPlayableAudiobookChapterAudioUrl,
} from "./audiobookPlaybackAdapter";
import { logContentPerfQueueBuild } from "./contentPerformanceDiagnostics";

type AudiobookQueueContext = ReturnType<typeof buildAudiobookQueueContext>;

type PlaySongFn = (
  song: AppSong,
  queue?: AppSong[],
  index?: number,
  queueContext?: AudiobookQueueContext,
  queueMode?: "standard"
) => Promise<void>;

type SeekToFn = (millis: number) => Promise<void>;
export const AUDIOBOOK_INITIAL_QUEUE_LIMIT = 40;

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
  // A true full-tail queue requires a backend continuation endpoint. Keep native
  // queue construction bounded while preserving Auto Next within this window.
  const playableChapters = orderAudiobookChapters(
    chapters.filter(
      (chapter) =>
        Boolean(chapter.audio_url?.trim()) &&
        isPlayableAudiobookChapterAudioUrl(chapter.audio_url)
    )
  ).slice(0, AUDIOBOOK_INITIAL_QUEUE_LIMIT);

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

  const queueContext = buildAudiobookQueueContext(book);
  logContentPerfQueueBuild("audiobook", "playback", songs.length);

  try {
    await playSong(songs[safeIndex], songs, safeIndex, queueContext, "standard");

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

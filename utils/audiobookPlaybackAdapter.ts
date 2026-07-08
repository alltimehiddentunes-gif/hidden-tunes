import type { AppSong } from "../context/PlayerContext";
import type {
  AudiobookChapterPlayItem,
  AudiobookItem,
} from "../types/audiobooks";
import { isPlayablePodcastAudioUrl } from "./podcastPlaybackAdapter";

export const AUDIOBOOK_CHAPTER_SONG_PREFIX = "audiobook-chapter-";

export function audiobookChapterSongId(chapterId: string) {
  return `${AUDIOBOOK_CHAPTER_SONG_PREFIX}${chapterId}`;
}

export function parseAudiobookChapterSongId(songId?: string | null) {
  const clean = String(songId || "");
  if (!clean.startsWith(AUDIOBOOK_CHAPTER_SONG_PREFIX)) return null;
  return clean.slice(AUDIOBOOK_CHAPTER_SONG_PREFIX.length) || null;
}

export function isAudiobookChapterAppSong(song?: AppSong | null) {
  return Boolean(parseAudiobookChapterSongId(song?.id));
}

export function isPlayableAudiobookChapterAudioUrl(url: string) {
  return isPlayablePodcastAudioUrl(url);
}

export function audiobookChapterToAppSong(
  book: AudiobookItem,
  chapter: AudiobookChapterPlayItem
): AppSong {
  const artist =
    book.author_name || book.narrator_name || book.publisher || "Hidden Tunes Audiobooks";
  const artwork = book.cover_url || "";

  return {
    id: audiobookChapterSongId(chapter.id),
    title: chapter.title || `Chapter ${chapter.chapter_number || ""}`.trim(),
    artist,
    album: book.title,
    user: { name: artist },
    channelTitle: book.title,
    artworkUrl: artwork,
    coverUrl: artwork,
    thumbnail: artwork,
    artwork,
    streamUrl: chapter.audio_url,
    url: chapter.audio_url,
    audioUrl: chapter.audio_url,
    duration: chapter.duration_seconds || chapter.file?.duration_seconds || undefined,
    genre: "Audiobook",
    mood: book.category_slug || "Audiobooks",
    source: "hidden-tunes",
    sourceName: "Audiobook",
    type: "r2",
    isOnline: true,
  };
}

export function buildAudiobookChapterAppSongs(
  book: AudiobookItem,
  chapters: AudiobookChapterPlayItem[]
) {
  return chapters
    .filter(
      (chapter) =>
        Boolean(chapter.audio_url?.trim()) &&
        isPlayableAudiobookChapterAudioUrl(chapter.audio_url)
    )
    .map((chapter) => audiobookChapterToAppSong(book, chapter));
}

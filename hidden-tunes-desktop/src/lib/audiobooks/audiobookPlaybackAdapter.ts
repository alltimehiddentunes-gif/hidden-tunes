import type { ApiSong } from '../api'
import type {
  AudiobookBookMeta,
  AudiobookChapterMeta,
  AudiobookChapterPlayItem,
} from './types'

export const AUDIOBOOK_SONG_ID_PREFIX = 'audiobook-'
const AUDIOBOOK_ID_SEPARATOR = '--'

export function audiobookChapterSongId(bookId: string, chapterId: string) {
  return `${AUDIOBOOK_SONG_ID_PREFIX}${bookId}${AUDIOBOOK_ID_SEPARATOR}${chapterId}`
}

export function parseAudiobookSongId(songId: string): { bookId: string; chapterId: string } | null {
  if (!songId.startsWith(AUDIOBOOK_SONG_ID_PREFIX)) return null
  const payload = songId.slice(AUDIOBOOK_SONG_ID_PREFIX.length)
  const separatorIndex = payload.indexOf(AUDIOBOOK_ID_SEPARATOR)
  if (separatorIndex <= 0) return null
  const bookId = payload.slice(0, separatorIndex).trim()
  const chapterId = payload.slice(separatorIndex + AUDIOBOOK_ID_SEPARATOR.length).trim()
  if (!bookId || !chapterId) return null
  return { bookId, chapterId }
}

export function isAudiobookQueueSong(song: ApiSong | null | undefined) {
  return Boolean(song?.id?.startsWith(AUDIOBOOK_SONG_ID_PREFIX))
}

export function audiobookChapterToApiSong(
  chapter: AudiobookChapterMeta | AudiobookChapterPlayItem,
  book: AudiobookBookMeta,
  audioUrl: string | null = null,
): ApiSong {
  const resolvedAudio =
    audioUrl?.trim().startsWith('http')
      ? audioUrl.trim()
      : 'audioUrl' in chapter && chapter.audioUrl?.startsWith('http')
        ? chapter.audioUrl
        : null

  return {
    id: audiobookChapterSongId(book.id, chapter.id),
    title: chapter.title,
    artist: book.authorName ?? 'Unknown Author',
    artistId: null,
    album: book.title,
    albumId: book.id,
    genre: book.categorySlug ?? book.categories[0] ?? null,
    mood: null,
    tags: [
      'audiobook',
      book.narratorName ? `narrator:${book.narratorName}` : '',
    ].filter(Boolean),
    description: chapter.description ?? book.description,
    artwork: book.coverUrl,
    previewUrl: resolvedAudio,
    audioUrl: resolvedAudio,
    highQualityUrl: null,
    durationSeconds: chapter.durationSeconds,
    createdAt: chapter.publishedAt ?? book.publishedAt,
  }
}

export function buildAudiobookQueueSongs(
  book: AudiobookBookMeta,
  chapters: Array<AudiobookChapterMeta | AudiobookChapterPlayItem>,
  includeResolvedUrls = false,
) {
  return chapters.map((chapter) => {
    const url =
      includeResolvedUrls && 'audioUrl' in chapter && chapter.audioUrl?.startsWith('http')
        ? chapter.audioUrl
        : null
    return audiobookChapterToApiSong(chapter, book, url)
  })
}

export function patchAudiobookChapterWithPlayUrl(
  song: ApiSong,
  play: { audioUrl: string; durationSeconds?: number | null },
): ApiSong {
  const normalizedAudio = play.audioUrl.trim().startsWith('http') ? play.audioUrl.trim() : null
  if (!normalizedAudio) return song

  return {
    ...song,
    audioUrl: normalizedAudio,
    previewUrl: normalizedAudio,
    durationSeconds:
      play.durationSeconds != null && play.durationSeconds > 0
        ? play.durationSeconds
        : song.durationSeconds,
  }
}

export function patchAudiobookQueueWithResolvedChapters(
  queue: ApiSong[],
  book: AudiobookBookMeta,
  resolvedChapters: AudiobookChapterPlayItem[],
  startIndex: number,
): ApiSong[] {
  if (resolvedChapters.length === 0) return queue
  const resolvedSongs = buildAudiobookQueueSongs(book, resolvedChapters, true)
  const next = [...queue]
  for (let index = 0; index < resolvedSongs.length; index += 1) {
    const targetIndex = startIndex + index
    if (targetIndex >= next.length) {
      next.push(resolvedSongs[index])
    } else {
      next[targetIndex] = resolvedSongs[index]
    }
  }
  return next
}

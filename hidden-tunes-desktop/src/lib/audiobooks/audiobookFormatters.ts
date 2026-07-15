import type { AudiobookBookMeta, AudiobookChapterMeta } from './types'

export function formatAudiobookDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return '—'
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes} min`
}

export function formatAudiobookBookSubtitle(book: AudiobookBookMeta): string {
  const parts: string[] = []
  if (book.authorName) parts.push(book.authorName)
  if (book.narratorName && book.narratorName !== book.authorName) {
    parts.push(`Narrated by ${book.narratorName}`)
  }
  if (book.chapterCount > 0) {
    parts.push(`${book.chapterCount} ${book.chapterCount === 1 ? 'chapter' : 'chapters'}`)
  }
  if (book.durationSeconds) parts.push(formatAudiobookDuration(book.durationSeconds))
  return parts.join(' · ') || 'Audiobook'
}

export function formatAudiobookChapterMetaLine(chapter: AudiobookChapterMeta): string {
  const parts: string[] = []
  if (chapter.chapterNumber != null) parts.push(`Ch. ${chapter.chapterNumber}`)
  if (chapter.durationSeconds) parts.push(formatAudiobookDuration(chapter.durationSeconds))
  return parts.join(' · ') || 'Chapter'
}

export function audiobookCategoryLabel(slug: string | null | undefined): string {
  if (!slug) return 'Audiobooks'
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

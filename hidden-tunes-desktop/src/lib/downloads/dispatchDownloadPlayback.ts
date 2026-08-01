import type { ApiSong } from '../api'
import { audiobookChapterSongId } from '../audiobooks/audiobookPlaybackAdapter'
import { podcastEpisodeSongId } from '../podcasts/podcastPlaybackAdapter'
import type { DesktopDownloadItem } from './types'

export type OfflinePlaybackSong = ApiSong & {
  offlineDownloadId?: string
}

function metaString(item: DesktopDownloadItem, key: string) {
  const value = item.metadata?.[key]
  return typeof value === 'string' ? value : null
}

/**
 * Map a completed download + local protocol URL into the existing queue song shape
 * so family adapters / mutex ownership stay intact.
 */
export function downloadItemToQueueSong(
  item: DesktopDownloadItem,
  localUrl: string,
): OfflinePlaybackSong {
  const showTitle = item.subtitle || metaString(item, 'showTitle') || 'Podcast'
  const bookTitle = item.subtitle || metaString(item, 'bookTitle') || 'Audiobook'

  switch (item.type) {
    case 'podcast_episode':
      return {
        id: podcastEpisodeSongId(item.id),
        title: item.title,
        artist: showTitle,
        artistId: null,
        album: showTitle,
        albumId: item.showId || item.parentId || null,
        genre: 'Podcast',
        mood: null,
        tags: ['offline', 'podcast'],
        description: null,
        artwork: item.artwork ?? null,
        previewUrl: localUrl,
        audioUrl: localUrl,
        highQualityUrl: null,
        durationSeconds: item.duration ?? null,
        createdAt: item.createdAt,
        offlineDownloadId: item.downloadId,
      }
    case 'audiobook_chapter': {
      const bookId = item.bookId || item.parentId || item.id
      const chapterId = item.chapterId || item.id
      return {
        id: audiobookChapterSongId(bookId, chapterId),
        title: item.title,
        artist: bookTitle,
        artistId: null,
        album: bookTitle,
        albumId: bookId,
        genre: 'Audiobook',
        mood: null,
        tags: ['offline', 'audiobook'],
        description: null,
        artwork: item.artwork ?? null,
        previewUrl: localUrl,
        audioUrl: localUrl,
        highQualityUrl: null,
        durationSeconds: item.duration ?? null,
        createdAt: item.createdAt,
        offlineDownloadId: item.downloadId,
      }
    }
    case 'motivational': {
      const programId = item.parentId || 'program'
      const sessionId = item.id
      return {
        id: `motivation-${programId}--${sessionId}`,
        title: item.title,
        artist: item.subtitle || 'Motivational',
        artistId: null,
        album: item.subtitle || 'Motivational',
        albumId: programId,
        genre: 'Motivational',
        mood: null,
        tags: ['offline', 'motivational'],
        description: null,
        artwork: item.artwork ?? null,
        previewUrl: localUrl,
        audioUrl: localUrl,
        highQualityUrl: null,
        durationSeconds: item.duration ?? null,
        createdAt: item.createdAt,
        offlineDownloadId: item.downloadId,
      }
    }
    case 'lecture': {
      const seriesId = item.seriesId || item.parentId || 'series'
      const sessionId = item.chapterId || item.id
      return {
        id: `lecture-${seriesId}--${sessionId}`,
        title: item.title,
        artist: item.subtitle || 'Lecture',
        artistId: null,
        album: item.subtitle || 'Lecture',
        albumId: seriesId,
        genre: item.metadata?.categorySlug
          ? String(item.metadata.categorySlug)
          : 'Lecture',
        mood: null,
        tags: ['offline', 'lecture'],
        description: null,
        artwork: item.artwork ?? null,
        previewUrl: localUrl,
        audioUrl: localUrl,
        highQualityUrl: null,
        durationSeconds: item.duration ?? null,
        createdAt: item.createdAt,
        offlineDownloadId: item.downloadId,
      }
    }
    case 'song':
    default:
      return {
        id: item.id,
        title: item.title,
        artist: item.subtitle || 'Unknown Artist',
        artistId: null,
        album: metaString(item, 'album') ?? '',
        albumId: null,
        genre: null,
        mood: null,
        tags: ['offline', 'song'],
        description: null,
        artwork: item.artwork ?? null,
        previewUrl: localUrl,
        audioUrl: localUrl,
        highQualityUrl: null,
        durationSeconds: item.duration ?? null,
        createdAt: item.createdAt,
        offlineDownloadId: item.downloadId,
      }
  }
}

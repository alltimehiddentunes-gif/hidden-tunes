import type { ApiSong } from '../api'
import { audiobookChapterSongId } from '../audiobooks/audiobookPlaybackAdapter'
import { podcastEpisodeSongId } from '../podcasts/podcastPlaybackAdapter'
import type { DesktopPlaylistItem } from './types'

/**
 * Convert a typed playlist item into a queue song for the existing playback owner.
 * Does not invent URLs for remote families — resolvers fill them on play.
 */
export function playlistItemToQueueSong(
  item: DesktopPlaylistItem,
  catalogSong?: ApiSong | null,
): ApiSong {
  switch (item.type) {
    case 'song': {
      if (catalogSong && catalogSong.id === item.id) {
        return catalogSong
      }
      return {
        id: item.id,
        title: item.title,
        artist: item.artist || item.subtitle || 'Unknown Artist',
        artistId: null,
        album: item.album ?? null,
        albumId: null,
        genre: null,
        mood: null,
        tags: ['playlist', 'song'],
        description: null,
        artwork: item.artwork ?? null,
        previewUrl: null,
        audioUrl: null,
        highQualityUrl: null,
        durationSeconds: item.duration ?? null,
        createdAt: item.addedAt,
      }
    }
    case 'podcast_episode':
      return {
        id: podcastEpisodeSongId(item.id),
        title: item.title,
        artist: item.showTitle || item.subtitle || 'Podcast',
        artistId: null,
        album: item.showTitle || item.subtitle || 'Podcast',
        albumId: item.showId || item.parentId || null,
        genre: 'Podcast',
        mood: null,
        tags: ['playlist', 'podcast'],
        description: null,
        artwork: item.artwork ?? null,
        previewUrl: null,
        audioUrl: null,
        highQualityUrl: null,
        durationSeconds: item.duration ?? null,
        createdAt: item.addedAt,
      }
    case 'audiobook_chapter': {
      const bookId = item.bookId || item.parentId || item.id
      const chapterId = item.chapterId || item.id
      return {
        id: audiobookChapterSongId(bookId, chapterId),
        title: item.title,
        artist: item.bookTitle || item.subtitle || 'Audiobook',
        artistId: null,
        album: item.bookTitle || item.subtitle || 'Audiobook',
        albumId: bookId,
        genre: 'Audiobook',
        mood: null,
        tags: ['playlist', 'audiobook'],
        description: null,
        artwork: item.artwork ?? null,
        previewUrl: null,
        audioUrl: null,
        highQualityUrl: null,
        durationSeconds: item.duration ?? null,
        createdAt: item.addedAt,
      }
    }
    case 'motivational': {
      const programId = item.programId || item.parentId || 'program'
      return {
        id: `motivation-${programId}--${item.id}`,
        title: item.title,
        artist: item.subtitle || 'Motivational',
        artistId: null,
        album: item.subtitle || 'Motivational',
        albumId: programId,
        genre: 'Motivational',
        mood: null,
        tags: ['playlist', 'motivational'],
        description: null,
        artwork: item.artwork ?? null,
        previewUrl: null,
        audioUrl: null,
        highQualityUrl: null,
        durationSeconds: item.duration ?? null,
        createdAt: item.addedAt,
      }
    }
    case 'lecture': {
      const seriesId = item.seriesId || item.parentId || 'series'
      return {
        id: `lecture-${seriesId}--${item.id}`,
        title: item.title,
        artist: item.subtitle || 'Lecture',
        artistId: null,
        album: item.subtitle || 'Lecture',
        albumId: seriesId,
        genre: 'Lecture',
        mood: null,
        tags: ['playlist', 'lecture'],
        description: null,
        artwork: item.artwork ?? null,
        previewUrl: null,
        audioUrl: null,
        highQualityUrl: null,
        durationSeconds: item.duration ?? null,
        createdAt: item.addedAt,
      }
    }
    default: {
      const _exhaustive: never = item
      return _exhaustive
    }
  }
}

export function playlistItemsToQueue(
  items: DesktopPlaylistItem[],
  songsById?: Map<string, ApiSong>,
): ApiSong[] {
  return items.map((item) =>
    playlistItemToQueueSong(
      item,
      item.type === 'song' ? songsById?.get(item.id) ?? null : null,
    ),
  )
}

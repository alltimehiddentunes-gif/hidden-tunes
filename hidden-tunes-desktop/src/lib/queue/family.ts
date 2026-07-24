import type { ApiSong } from '../api'
import {
  audiobookChapterSongId,
  isAudiobookQueueSong,
  parseAudiobookSongId,
} from '../audiobooks/audiobookPlaybackAdapter'
import {
  isLectureQueueSong,
  lectureSessionSongId,
  parseLectureSongId,
} from '../lectures/lecturePlaybackAdapter'
import {
  isMotivationalQueueSong,
  motivationalSessionSongId,
  parseMotivationalSongId,
} from '../motivationals/motivationalPlaybackAdapter'
import {
  extractPodcastEpisodeId,
  isPodcastQueueSong,
  podcastEpisodeSongId,
} from '../podcasts/podcastPlaybackAdapter'
import {
  extractRadioStationId,
  isRadioQueueSong,
  radioStationSongId,
} from '../radio/radioPlaybackAdapter'
import { isSportsQueueSong } from '../sports/sportsPlaybackAdapter'
import { isTvQueueSong } from '../tv/tvPlaybackAdapter'
import { newQueueId } from './identity'
import type { DesktopQueueItem, DesktopQueueItemType } from './types'
import { isDesktopQueueItemType } from './types'

export type ApiSongToQueueItemExtras = {
  localDownloadId?: string | null
  isMature?: boolean
  contentRating?: string | null
  addedAt?: string
  metadata?: Record<string, unknown> | null
}

type OfflinePlaybackSong = ApiSong & { offlineDownloadId?: string }

function nowIso() {
  return new Date().toISOString()
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function songHasOfflineTag(song: ApiSong, extras?: ApiSongToQueueItemExtras): boolean {
  const offlineDownloadId =
    extras?.localDownloadId
    ?? (song as OfflinePlaybackSong).offlineDownloadId
  if (offlineDownloadId) return true
  if (song.tags?.some((tag) => tag === 'offline' || tag === 'download')) return true
  const url = `${song.audioUrl || ''} ${song.previewUrl || ''}`
  return url.includes('ht-download://')
}

/**
 * Infer audio-queue family from an ApiSong.
 * TV / Sports are video session owners — not part of the typed audio queue.
 */
export function inferQueueItemType(
  song: ApiSong | null | undefined,
  extras?: ApiSongToQueueItemExtras,
): DesktopQueueItemType | null {
  if (!song?.id) return null
  if (isTvQueueSong(song) || isSportsQueueSong(song)) return null

  if (songHasOfflineTag(song, extras)) return 'offline_audio'
  if (isRadioQueueSong(song)) return 'radio'
  if (isPodcastQueueSong(song)) return 'podcast_episode'
  if (isAudiobookQueueSong(song)) return 'audiobook_chapter'
  if (isMotivationalQueueSong(song)) return 'motivational'
  if (isLectureQueueSong(song)) return 'lecture'
  return 'song'
}

/** Original family for offline presentation (before offline_audio remap). */
export function inferOriginalFamilyType(
  song: ApiSong,
): Exclude<DesktopQueueItemType, 'offline_audio'> {
  if (isRadioQueueSong(song)) return 'radio'
  if (isPodcastQueueSong(song)) return 'podcast_episode'
  if (isAudiobookQueueSong(song)) return 'audiobook_chapter'
  if (isMotivationalQueueSong(song)) return 'motivational'
  if (isLectureQueueSong(song)) return 'lecture'
  return 'song'
}

function buildBaseApiSong(
  item: DesktopQueueItem,
  songId: string,
  album: string | null,
  albumId: string | null,
  tags: string[],
): ApiSong {
  return {
    id: songId,
    title: item.title,
    artist: item.artist || item.subtitle || 'Unknown',
    artistId: null,
    album: album || item.subtitle || item.title,
    albumId,
    genre: null,
    mood: null,
    tags,
    description: null,
    artwork: item.artwork ?? null,
    // No permanent resolved remote URLs — callers resolve at play time.
    previewUrl: null,
    audioUrl: null,
    highQualityUrl: null,
    durationSeconds: item.duration ?? null,
    createdAt: item.addedAt ?? null,
  }
}

/**
 * Map a typed queue item to the existing ApiSong queue shape.
 * Never embeds permanent remote stream URLs.
 * Offline: preserves original family presentation via metadata.originalType;
 * `ht-download://` is attached only at play time by the caller.
 */
export function queueItemToApiSong(item: DesktopQueueItem): ApiSong {
  const originalType =
    item.type === 'offline_audio'
      && isDesktopQueueItemType(item.metadata?.originalType)
      && item.metadata?.originalType !== 'offline_audio'
      ? (item.metadata.originalType as Exclude<DesktopQueueItemType, 'offline_audio'>)
      : item.type === 'offline_audio'
        ? 'song'
        : item.type

  const presentationType = item.type === 'offline_audio' ? originalType : item.type
  let song: ApiSong

  switch (presentationType) {
    case 'radio':
      song = buildBaseApiSong(item, radioStationSongId(item.id), 'Live Radio', null, ['radio'])
      song = { ...song, durationSeconds: null }
      break
    case 'podcast_episode':
      song = buildBaseApiSong(
        item,
        podcastEpisodeSongId(item.episodeId || item.id),
        item.showTitle || item.subtitle || 'Podcast',
        item.parentId ?? null,
        ['podcast'],
      )
      break
    case 'audiobook_chapter': {
      const bookId = item.parentId || ''
      const chapterId = item.chapterId || item.id
      const songId =
        bookId && chapterId
          ? audiobookChapterSongId(bookId, chapterId)
          : `audiobook-${item.id}`
      song = buildBaseApiSong(
        item,
        songId,
        item.bookTitle || item.subtitle || 'Audiobook',
        bookId || null,
        ['audiobook'],
      )
      break
    }
    case 'motivational': {
      const programId = item.parentId || 'program'
      song = buildBaseApiSong(
        item,
        motivationalSessionSongId(programId, item.id),
        item.seriesTitle || item.subtitle || 'Motivational',
        programId,
        ['motivational'],
      )
      break
    }
    case 'lecture': {
      const seriesId = item.parentId || 'series'
      song = buildBaseApiSong(
        item,
        lectureSessionSongId(seriesId, item.id),
        item.seriesTitle || item.subtitle || 'Lecture',
        seriesId,
        ['lecture'],
      )
      break
    }
    case 'song':
    default:
      song = buildBaseApiSong(item, item.id, item.subtitle ?? null, item.parentId ?? null, ['song'])
      break
  }

  if (item.type === 'offline_audio') {
    const tags = new Set([...(song.tags || []), 'offline'])
    song = { ...song, tags: [...tags], audioUrl: null, previewUrl: null }
    if (item.localDownloadId) {
      return Object.assign(song, { offlineDownloadId: item.localDownloadId })
    }
  }

  return song
}

/**
 * Infer a typed queue item from an ApiSong.
 * Returns null for TV / Sports (session video owners) and unclassifiable rows.
 */
export function apiSongToQueueItem(
  song: ApiSong,
  extras?: ApiSongToQueueItemExtras,
): DesktopQueueItem | null {
  if (!song?.id?.trim() || !song.title?.trim()) return null
  if (isTvQueueSong(song) || isSportsQueueSong(song)) return null

  const offline = songHasOfflineTag(song, extras)
  const originalType = inferOriginalFamilyType(song)
  const type: DesktopQueueItemType = offline ? 'offline_audio' : originalType

  const localDownloadId =
    trimOrNull(extras?.localDownloadId)
    ?? trimOrNull((song as OfflinePlaybackSong).offlineDownloadId)

  const base: DesktopQueueItem = {
    queueId: newQueueId(),
    type,
    id: song.id.trim(),
    title: song.title.trim(),
    addedAt:
      extras?.addedAt && Number.isFinite(Date.parse(extras.addedAt))
        ? extras.addedAt
        : nowIso(),
    artist: trimOrNull(song.artist),
    subtitle: trimOrNull(song.artist) || trimOrNull(song.album),
    artwork: trimOrNull(song.artwork),
    duration: typeof song.durationSeconds === 'number' ? song.durationSeconds : null,
    parentId: trimOrNull(song.albumId),
    localDownloadId,
    isLive: originalType === 'radio',
    isMature: extras?.isMature === true,
    contentRating: trimOrNull(extras?.contentRating),
    metadata: extras?.metadata ?? null,
  }

  if (originalType === 'radio') {
    const stationId = extractRadioStationId(song.id) || song.id.replace(/^radio-/, '')
    base.id = stationId
    base.isLive = true
    base.duration = null
    base.subtitle = trimOrNull(song.artist) || 'Live radio'
  } else if (originalType === 'podcast_episode') {
    const episodeId = extractPodcastEpisodeId(song.id) || song.id.replace(/^podcast-/, '')
    base.id = episodeId
    base.episodeId = episodeId
    base.parentId = trimOrNull(song.albumId)
    base.showTitle = trimOrNull(song.album) || trimOrNull(song.artist)
    base.subtitle = base.showTitle
  } else if (originalType === 'audiobook_chapter') {
    const parsed = parseAudiobookSongId(song.id)
    base.id = parsed?.chapterId || song.id
    base.chapterId = parsed?.chapterId || null
    base.parentId = parsed?.bookId || trimOrNull(song.albumId)
    base.bookTitle = trimOrNull(song.album)
    base.subtitle = base.bookTitle
  } else if (originalType === 'motivational') {
    const parsed = parseMotivationalSongId(song.id)
    base.id = parsed?.sessionId || song.id
    base.parentId = parsed?.programId || trimOrNull(song.albumId)
    base.seriesTitle = trimOrNull(song.album)
    base.subtitle = base.seriesTitle
  } else if (originalType === 'lecture') {
    const parsed = parseLectureSongId(song.id)
    base.id = parsed?.sessionId || song.id
    base.parentId = parsed?.seriesId || trimOrNull(song.albumId)
    base.seriesTitle = trimOrNull(song.album)
    base.subtitle = base.seriesTitle
  } else {
    base.id = song.id.trim()
  }

  if (type === 'offline_audio') {
    base.metadata = {
      ...(base.metadata || {}),
      originalType,
    }
    base.isLive = false
  }

  return base
}

/**
 * Seek policy for the shared queue track.
 * Live radio / TV / sports are not seekable; finite media with duration support is.
 */
export function canSeekQueueTrack(song: ApiSong | null | undefined): boolean {
  if (!song) return false
  if (isRadioQueueSong(song) || isTvQueueSong(song) || isSportsQueueSong(song)) return false
  return true
}

export function familyLabelForSong(song: ApiSong | null | undefined): string {
  if (!song) return 'Item'
  if (isTvQueueSong(song)) return 'TV'
  if (isSportsQueueSong(song)) return 'Sports'
  const type = inferQueueItemType(song)
  switch (type) {
    case 'radio':
      return 'Radio'
    case 'podcast_episode':
      return 'Podcast'
    case 'audiobook_chapter':
      return 'Audiobook'
    case 'motivational':
      return 'Motivational'
    case 'lecture':
      return 'Lecture'
    case 'offline_audio':
      return 'Offline'
    case 'song':
    default:
      return 'Music'
  }
}

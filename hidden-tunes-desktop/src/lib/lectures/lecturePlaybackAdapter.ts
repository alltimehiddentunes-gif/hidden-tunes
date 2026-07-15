import type { ApiSong } from '../api'
import type { LectureItem, LectureSeries } from './types'

export const LECTURE_SONG_ID_PREFIX = 'lecture-'
const LECTURE_ID_SEPARATOR = '--'

export function lectureSessionSongId(seriesId: string, sessionId: string) {
  return `${LECTURE_SONG_ID_PREFIX}${seriesId}${LECTURE_ID_SEPARATOR}${sessionId}`
}

export function parseLectureSongId(songId: string): { seriesId: string; sessionId: string } | null {
  if (!songId.startsWith(LECTURE_SONG_ID_PREFIX)) return null
  const payload = songId.slice(LECTURE_SONG_ID_PREFIX.length)
  const separatorIndex = payload.indexOf(LECTURE_ID_SEPARATOR)
  if (separatorIndex <= 0) return null
  const seriesId = payload.slice(0, separatorIndex).trim()
  const sessionId = payload.slice(separatorIndex + LECTURE_ID_SEPARATOR.length).trim()
  if (!seriesId || !sessionId) return null
  return { seriesId, sessionId }
}

export function isLectureQueueSong(song: ApiSong | null | undefined) {
  return Boolean(song?.id?.startsWith(LECTURE_SONG_ID_PREFIX))
}

export function isLectureVideoSong(song: ApiSong | null | undefined) {
  return Boolean(
    isLectureQueueSong(song)
    && song?.tags?.some((tag) => tag === 'lecture-video'),
  )
}

function lectureTagsForMediaType(mediaType?: string | null) {
  const tags = ['lecture']
  if (String(mediaType || '').trim().toLowerCase() === 'video') {
    tags.push('lecture-video')
  }
  return tags
}

export function lectureSessionToApiSong(
  session: LectureItem,
  series: LectureSeries,
  playbackUrl: string | null = null,
): ApiSong {
  const resolvedUrl = playbackUrl?.trim().startsWith('http') ? playbackUrl.trim() : null
  const speakerLabel =
    session.speaker?.name
    ?? series.speaker?.name
    ?? series.institution?.name
    ?? 'Educator'

  return {
    id: lectureSessionSongId(series.id, session.id),
    title: session.title,
    artist: speakerLabel,
    artistId: null,
    album: series.title,
    albumId: series.id,
    genre: series.category?.slug ?? session.category?.slug ?? session.subject,
    mood: series.subject,
    tags: lectureTagsForMediaType(session.mediaType),
    description: session.description ?? series.description,
    artwork: session.artworkUrl ?? series.artworkUrl,
    previewUrl: resolvedUrl,
    audioUrl: resolvedUrl,
    highQualityUrl: null,
    durationSeconds: session.durationSeconds ?? series.totalDurationSeconds,
    createdAt: session.publishedAt ?? series.publishedAt,
  }
}

export function buildLectureQueueSongs(series: LectureSeries, sessions: LectureItem[]) {
  return sessions.map((session) => lectureSessionToApiSong(session, series))
}

export function patchLectureSessionWithPlayUrl(
  song: ApiSong,
  play: {
    playbackUrl: string
    durationSeconds?: number | null
    mediaType?: string | null
  },
): ApiSong {
  const normalizedUrl = play.playbackUrl.trim().startsWith('http') ? play.playbackUrl.trim() : null
  if (!normalizedUrl) return song

  return {
    ...song,
    audioUrl: normalizedUrl,
    previewUrl: normalizedUrl,
    tags: lectureTagsForMediaType(play.mediaType),
    durationSeconds:
      play.durationSeconds != null && play.durationSeconds > 0
        ? play.durationSeconds
        : song.durationSeconds,
  }
}

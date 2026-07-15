import type { ApiSong } from '../api'
import type {
  MotivationalProgramMeta,
  MotivationalSessionMeta,
} from './types'

export const MOTIVATIONAL_SONG_ID_PREFIX = 'motivation-'
const MOTIVATIONAL_ID_SEPARATOR = '--'

export function motivationalSessionSongId(programId: string, sessionId: string) {
  return `${MOTIVATIONAL_SONG_ID_PREFIX}${programId}${MOTIVATIONAL_ID_SEPARATOR}${sessionId}`
}

export function parseMotivationalSongId(songId: string): { programId: string; sessionId: string } | null {
  if (!songId.startsWith(MOTIVATIONAL_SONG_ID_PREFIX)) return null
  const payload = songId.slice(MOTIVATIONAL_SONG_ID_PREFIX.length)
  const separatorIndex = payload.indexOf(MOTIVATIONAL_ID_SEPARATOR)
  if (separatorIndex <= 0) return null
  const programId = payload.slice(0, separatorIndex).trim()
  const sessionId = payload.slice(separatorIndex + MOTIVATIONAL_ID_SEPARATOR.length).trim()
  if (!programId || !sessionId) return null
  return { programId, sessionId }
}

export function isMotivationalQueueSong(song: ApiSong | null | undefined) {
  return Boolean(song?.id?.startsWith(MOTIVATIONAL_SONG_ID_PREFIX))
}

export function isMotivationalVideoSong(song: ApiSong | null | undefined) {
  return Boolean(
    isMotivationalQueueSong(song)
    && song?.tags?.some((tag) => tag === 'motivational-video' || tag === 'motivational-stream'),
  )
}

function motivationalTagsForMediaType(mediaType?: string | null) {
  const tags = ['motivational']
  const cleaned = String(mediaType || '').trim().toLowerCase()
  if (cleaned === 'video' || cleaned === 'stream') tags.push('motivational-video')
  return tags
}

export function motivationalSessionToApiSong(
  session: MotivationalSessionMeta,
  program: MotivationalProgramMeta,
  audioUrl: string | null = null,
): ApiSong {
  const resolvedAudio = audioUrl?.trim().startsWith('http') ? audioUrl.trim() : null
  const programId = program.id
  const genre = program.categorySlug ?? session.categorySlug ?? session.category

  return {
    id: motivationalSessionSongId(programId, session.id),
    title: session.title,
    artist: session.speakerName ?? program.subtitle ?? 'Motivational speaker',
    artistId: null,
    album: program.title,
    albumId: programId,
    genre,
    mood: null,
    tags: motivationalTagsForMediaType(session.mediaType),
    description: session.description ?? program.description,
    artwork: session.artworkUrl ?? program.artworkUrl,
    previewUrl: resolvedAudio,
    audioUrl: resolvedAudio,
    highQualityUrl: null,
    durationSeconds: session.durationSeconds,
    createdAt: session.publishedAt ?? program.publishedAt,
  }
}

export function buildMotivationalQueueSongs(
  program: MotivationalProgramMeta,
  sessions: MotivationalSessionMeta[],
  includeResolvedUrls = false,
  resolvedUrlBySessionId?: Map<string, string>,
) {
  return sessions.map((session) => {
    const resolved =
      includeResolvedUrls
        ? resolvedUrlBySessionId?.get(session.id) ?? null
        : null
    return motivationalSessionToApiSong(session, program, resolved)
  })
}

export function patchMotivationalSessionWithPlayUrl(
  song: ApiSong,
  play: {
    audioUrl: string
    durationSeconds?: number | null
    mediaType?: string | null
  },
): ApiSong {
  const normalizedAudio = play.audioUrl.trim().startsWith('http') ? play.audioUrl.trim() : null
  if (!normalizedAudio) return song

  const tags = motivationalTagsForMediaType(play.mediaType)

  return {
    ...song,
    audioUrl: normalizedAudio,
    previewUrl: normalizedAudio,
    tags,
    durationSeconds:
      play.durationSeconds != null && play.durationSeconds > 0
        ? play.durationSeconds
        : song.durationSeconds,
  }
}

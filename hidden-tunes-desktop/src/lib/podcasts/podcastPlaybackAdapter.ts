import type { ApiSong } from '../api'
import type { PodcastEpisodeMeta, PodcastQueueContextMeta, PodcastShowMeta } from './types'

export const PODCAST_SONG_ID_PREFIX = 'podcast-'

export function podcastEpisodeSongId(episodeId: string) {
  return `${PODCAST_SONG_ID_PREFIX}${episodeId}`
}

export function extractPodcastEpisodeId(songId: string): string | null {
  if (!songId.startsWith(PODCAST_SONG_ID_PREFIX)) return null
  const episodeId = songId.slice(PODCAST_SONG_ID_PREFIX.length).trim()
  return episodeId || null
}

export function isPodcastQueueSong(song: ApiSong | null | undefined) {
  return Boolean(song?.id?.startsWith(PODCAST_SONG_ID_PREFIX))
}

export function buildPodcastQueueContextMeta(
  episode: PodcastEpisodeMeta,
  show?: PodcastShowMeta | null,
): PodcastQueueContextMeta {
  const showTitle = episode.showTitle ?? show?.title ?? 'Podcast'
  return {
    mediaType: 'podcast',
    episodeId: episode.id,
    showId: episode.showId || show?.id || '',
    showTitle,
    publishedAt: episode.publishedAt,
  }
}

function formatEpisodeSubtitle(episode: PodcastEpisodeMeta, show?: PodcastShowMeta | null) {
  return episode.showTitle ?? show?.title ?? (episode.showId || 'Podcast')
}

export function podcastEpisodeToApiSong(
  episode: PodcastEpisodeMeta,
  show?: PodcastShowMeta | null,
  audioUrl: string | null = null,
): ApiSong {
  const showTitle = formatEpisodeSubtitle(episode, show)
  const normalizedAudio = audioUrl?.trim().startsWith('http') ? audioUrl.trim() : null
  const artwork = episode.artworkUrl ?? show?.artworkUrl ?? null
  const genre = show?.primaryCategory ?? show?.categories[0] ?? null

  return {
    id: podcastEpisodeSongId(episode.id),
    title: episode.title,
    artist: showTitle,
    artistId: null,
    album: showTitle,
    albumId: episode.showId || show?.id || null,
    genre,
    mood: null,
    tags: show?.categories ?? [],
    description: episode.description,
    artwork,
    previewUrl: normalizedAudio,
    audioUrl: normalizedAudio,
    highQualityUrl: null,
    durationSeconds: episode.durationSeconds,
    createdAt: episode.publishedAt,
  }
}

export function buildPodcastQueueSongs(
  episodes: PodcastEpisodeMeta[],
  showById?: Map<string, PodcastShowMeta>,
) {
  return episodes.map((episode) => {
    const show = showById?.get(episode.showId)
    return podcastEpisodeToApiSong(episode, show)
  })
}

export function patchPodcastEpisodeWithPlayUrl(
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

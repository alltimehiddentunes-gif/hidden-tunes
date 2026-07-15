import type { ApiSong } from '../api'
import type { TvChannelMeta } from './types'

export const TV_SONG_ID_PREFIX = 'tv-'

export function tvChannelSongId(channelId: string) {
  return `${TV_SONG_ID_PREFIX}${channelId}`
}

export function extractTvChannelId(songId: string): string | null {
  if (!songId.startsWith(TV_SONG_ID_PREFIX)) return null
  const channelId = songId.slice(TV_SONG_ID_PREFIX.length).trim()
  return channelId || null
}

export function isTvQueueSong(song: ApiSong | null | undefined) {
  return Boolean(song?.id?.startsWith(TV_SONG_ID_PREFIX))
}

function formatChannelSubtitle(channel: TvChannelMeta) {
  const parts = [
    channel.country,
    channel.language,
    channel.categories[0],
  ].filter(Boolean)
  return parts.join(' · ') || 'Live TV'
}

export function tvChannelToApiSong(
  channel: TvChannelMeta,
  streamUrl: string | null = null,
): ApiSong {
  const subtitle = formatChannelSubtitle(channel)
  const normalizedStream = streamUrl?.trim().startsWith('http') ? streamUrl.trim() : null
  const displayTitle = channel.channelName
    ? channel.title !== channel.channelName
      ? channel.title
      : channel.channelName
    : channel.title

  return {
    id: tvChannelSongId(channel.id),
    title: displayTitle,
    artist: channel.channelName ?? subtitle,
    artistId: null,
    album: 'Live TV',
    albumId: null,
    genre: channel.categories[0] ?? 'TV',
    mood: null,
    tags: [...channel.tags, ...channel.categories],
    description: channel.description,
    artwork: channel.artworkUrl,
    previewUrl: normalizedStream,
    audioUrl: normalizedStream,
    highQualityUrl: null,
    durationSeconds: null,
    createdAt: null,
  }
}

export function buildTvQueueSongs(channels: TvChannelMeta[]) {
  return channels.map((channel) => tvChannelToApiSong(channel))
}

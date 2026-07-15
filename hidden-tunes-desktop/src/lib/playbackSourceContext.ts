import type { QueueContext, QueueSeedType } from './desktopPlayback/types'
import { QUEUE_CONTEXT_LABELS } from './playerQueueDisplay'

export type PlaybackSourceRoute =
  | { type: 'album'; albumId: string }
  | { type: 'artist'; artistId: string }
  | { type: 'mood'; moodId: string }
  | { type: 'search'; query: string }
  | { type: 'playlist'; title: string }
  | null

export type PlaybackSourceDisplay = {
  prefix: string
  title: string
  route: PlaybackSourceRoute
}

function normalizeTitle(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function resolvePlaybackSourceDisplay(input: {
  queueContext: QueueContext
  queueTitle: string | null | undefined
  queueSeedType: QueueSeedType
  trackAlbum: string | null | undefined
  trackAlbumId: string | null | undefined
  trackArtist: string | null | undefined
  trackArtistId: string | null | undefined
  searchQuery?: string | null
}): PlaybackSourceDisplay {
  const queueTitle = normalizeTitle(input.queueTitle)
  const albumTitle = normalizeTitle(input.trackAlbum) ?? queueTitle
  const artistTitle = normalizeTitle(input.trackArtist)

  switch (input.queueContext) {
    case 'album':
      return {
        prefix: 'Playing from Album',
        title: queueTitle ?? albumTitle ?? 'Unknown Album',
        route: input.trackAlbumId
          ? { type: 'album', albumId: input.trackAlbumId }
          : null,
      }
    case 'artist':
      return {
        prefix: 'Playing from Artist',
        title: queueTitle ?? artistTitle ?? 'Unknown Artist',
        route: input.trackArtistId
          ? { type: 'artist', artistId: input.trackArtistId }
          : null,
      }
    case 'mood':
      return {
        prefix: 'Playing from Emotional World',
        title: queueTitle ?? 'Mood mix',
        route: null,
      }
    case 'discover':
      return {
        prefix: 'Playing from Search',
        title: input.searchQuery?.trim()
          ? `"${input.searchQuery.trim()}"`
          : queueTitle ?? 'Search results',
        route: input.searchQuery?.trim()
          ? { type: 'search', query: input.searchQuery.trim() }
          : null,
      }
    case 'home':
      return {
        prefix: 'Playing from Home',
        title: queueTitle ?? 'Home selection',
        route: null,
      }
    case 'manual': {
      const manualTitle = queueTitle ?? 'Manual Queue'
      const looksLikePlaylist = manualTitle.toLowerCase().includes('playlist')
        || manualTitle.toLowerCase().includes('liked')
        || manualTitle.toLowerCase().includes('recent')
      return {
        prefix: looksLikePlaylist ? 'Playing from Playlist' : 'Playing from Queue',
        title: manualTitle,
        route: looksLikePlaylist ? { type: 'playlist', title: manualTitle } : null,
      }
    }
    default:
      return {
        prefix: 'Playing from',
        title: queueTitle ?? QUEUE_CONTEXT_LABELS[input.queueContext] ?? 'Music',
        route: null,
      }
  }
}

export function resolveAutoNextBasis(
  queueContext: QueueContext,
  queueSeedType: QueueSeedType,
): string {
  if (queueSeedType === 'album' || queueContext === 'album') {
    return 'Same album · Artist affinity · Genre'
  }
  if (queueContext === 'manual' && queueSeedType === 'manual') {
    return 'Same playlist · Artist affinity · Genre'
  }
  if (queueSeedType === 'artist' || queueContext === 'artist') {
    return 'Same artist · Related artists · Genre'
  }
  if (queueSeedType === 'mood' || queueContext === 'mood') {
    return 'Same mood · Emotional world · Genre'
  }
  if (queueContext === 'discover') {
    return 'Similar music · Genre · Artist affinity'
  }
  return 'Similar music · Same mood · Genre'
}

import type { ApiAlbum, ApiArtist, ApiSong } from '../api'
import { sortAlbumsList, sortSongsList } from '../api'
import type { CatalogIndexes } from '../catalogIndexes'
import { inferSongGenre } from '../catalogIndexes'
import { buildEmotionalLanes } from '../emotionalDiscovery'
import type { MusicHistoryEntry } from '../home/musicProgressStorage'
import {
  buildMusicHeroContent,
  buildPersonalMixes,
  formatGenreLabel,
  type MusicHeroContent,
  type MusicPersonalMix,
} from '../home/musicHomeSections'
import { EDITORIAL_PLAYLIST_SPECS } from '../home/editorialPlaylists'

export type MusicNewReleaseCard = {
  id: string
  title: string
  artist: string
  artworkUrl: string | null
  kind: 'album' | 'song'
  song: ApiSong
  queue: ApiSong[]
  queueTitle: string
  albumId?: string
}

export type MusicChartCard = {
  id: string
  title: string
  subtitle: string
  tracks: ApiSong[]
  accent: 'violet' | 'cyan' | 'gold' | 'rose' | 'mint' | 'sunset'
}

export type MusicMoodCard = {
  id: string
  label: string
  subtitle: string
  tracks: ApiSong[]
  mood: 'violet' | 'cyan' | 'rose' | 'mint'
}

export type MusicGenreTile = {
  id: string
  label: string
  count: number
  artworkUrl: string | null
}

const CHART_GENRE_IDS = [
  'pop',
  'hip-hop',
  'afrobeats',
  'jazz',
  'gospel',
  'country',
  'r&b',
  'rock',
  'dance',
  'latin',
  'reggae',
  'amapiano',
] as const

const CHART_ACCENTS: MusicChartCard['accent'][] = [
  'violet',
  'cyan',
  'gold',
  'rose',
  'mint',
  'sunset',
]

export function buildMusicDiscoverHero(
  songs: ApiSong[],
  albums: ApiAlbum[],
  artists: ApiArtist[],
  indexes: CatalogIndexes,
  continueListening: Parameters<typeof buildMusicHeroContent>[4],
  history: MusicHistoryEntry[],
): MusicHeroContent | null {
  return buildMusicHeroContent(songs, albums, artists, indexes, continueListening, history)
}

export function buildMusicMix(
  songs: ApiSong[],
  artists: ApiArtist[],
  indexes: CatalogIndexes,
  history: MusicHistoryEntry[],
): MusicPersonalMix | null {
  const mixes = buildPersonalMixes(songs, artists, indexes, history)
  return mixes[0] ?? null
}

export function buildNewReleaseCards(
  songs: ApiSong[],
  albums: ApiAlbum[],
  indexes: CatalogIndexes,
  limit = 12,
): MusicNewReleaseCard[] {
  const cards: MusicNewReleaseCard[] = []
  const seen = new Set<string>()

  for (const album of sortAlbumsList(albums, 'latest')) {
    const tracks =
      indexes.songsByAlbumId.get(album.id)
      ?? indexes.songsByAlbumName.get(album.title.trim().toLowerCase())
      ?? []
    const queue = sortSongsList([...tracks], 'latest').slice(0, 12)
    if (queue.length === 0) continue
    const key = `album-${album.id}`
    if (seen.has(key)) continue
    seen.add(key)
    const artistName = album.artistId
      ? indexes.artistNames.get(album.artistId) ?? queue[0].artist
      : queue[0].artist
    cards.push({
      id: key,
      title: album.title,
      artist: artistName,
      artworkUrl: album.artwork ?? queue[0].artwork,
      kind: 'album',
      song: queue[0],
      queue,
      queueTitle: album.title,
      albumId: album.id,
    })
    if (cards.length >= limit) return cards
  }

  for (const song of sortSongsList(songs, 'latest')) {
    const key = `song-${song.id}`
    if (seen.has(key)) continue
    seen.add(key)
    cards.push({
      id: key,
      title: song.title,
      artist: song.artist,
      artworkUrl: song.artwork,
      kind: 'song',
      song,
      queue: [song],
      queueTitle: song.title,
    })
    if (cards.length >= limit) return cards
  }

  return cards
}

export function buildPopularChartCards(
  songs: ApiSong[],
  indexes: CatalogIndexes,
  limit = 6,
): MusicChartCard[] {
  const cards: MusicChartCard[] = []

  const globalTracks = sortSongsList(songs, 'latest').slice(0, 20)
  if (globalTracks.length >= 4) {
    cards.push({
      id: 'popular-global',
      title: 'Popular on Hidden Tunes',
      subtitle: 'Recently added across your catalog',
      tracks: globalTracks,
      accent: 'violet',
    })
  }

  let accentIndex = 1
  for (const genreId of CHART_GENRE_IDS) {
    if (cards.length >= limit) break
    const genreTracks = (indexes.songsByGenre.get(genreId) ?? []).slice(0, 20)
    if (genreTracks.length < 4) continue
    cards.push({
      id: `popular-${genreId}`,
      title: formatGenreLabel(genreId),
      subtitle: 'Most played in this genre',
      tracks: sortSongsList(genreTracks, 'latest').slice(0, 20),
      accent: CHART_ACCENTS[accentIndex % CHART_ACCENTS.length],
    })
    accentIndex += 1
  }

  return cards.slice(0, limit)
}

export function buildMoodVibeCards(songs: ApiSong[], limit = 8): MusicMoodCard[] {
  const lanes = buildEmotionalLanes(songs)
  const moodMap: Record<string, MusicMoodCard['mood']> = {
    'calm-drift': 'mint',
    'late-night': 'violet',
    heartfelt: 'rose',
    'focus-flow': 'cyan',
    'electric-pulse': 'cyan',
    'cinematic-weight': 'violet',
  }

  const labelOverrides: Record<string, string> = {
    'calm-drift': 'Chill',
    'late-night': 'Late Night',
    heartfelt: 'Romance',
    'focus-flow': 'Focus',
    'electric-pulse': 'Energy',
    'cinematic-weight': 'Reflection',
  }

  return lanes.slice(0, limit).map((lane) => {
    const tracks = lane.songIds
      .map((id) => songs.find((song) => song.id === id))
      .filter((entry): entry is ApiSong => Boolean(entry))
      .slice(0, 16)
    return {
      id: lane.id,
      label: labelOverrides[lane.id] ?? lane.label,
      subtitle: lane.subtitle,
      tracks,
      mood: moodMap[lane.id] ?? lane.mood,
    }
  }).filter((card) => card.tracks.length >= 3)
}

export function buildGenreTiles(
  indexes: CatalogIndexes,
  history: MusicHistoryEntry[],
  limit = 14,
): MusicGenreTile[] {
  const preferred = new Map<string, number>()
  for (const entry of history) {
    const song = indexes.songsById.get(entry.songId)
    if (!song) continue
    const genre = inferSongGenre(song)
    preferred.set(genre, (preferred.get(genre) ?? 0) + 2)
  }

  const tiles: Array<MusicGenreTile & { weight: number }> = []
  for (const [genre, genreSongs] of indexes.songsByGenre.entries()) {
    if (genreSongs.length < 3) continue
    const artworkUrl = genreSongs.find((song) => song.artwork)?.artwork ?? null
    tiles.push({
      id: genre,
      label: formatGenreLabel(genre),
      count: genreSongs.length,
      artworkUrl,
      weight: (preferred.get(genre) ?? 0) + Math.min(genreSongs.length, 40),
    })
  }

  return tiles
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map(({ id, label, count, artworkUrl }) => ({ id, label, count, artworkUrl }))
}

export function resolvePlaylistCount() {
  return EDITORIAL_PLAYLIST_SPECS.length
}

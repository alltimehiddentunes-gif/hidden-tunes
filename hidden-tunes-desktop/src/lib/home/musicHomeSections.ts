import type { ApiAlbum, ApiArtist, ApiSong } from '../api'
import { sortAlbumsList, sortArtistsList, sortSongsList } from '../api'
import type { CatalogIndexes } from '../catalogIndexes'
import { inferSongGenre, resolveSongsForArtist } from '../catalogIndexes'
import { buildEmotionalLanes } from '../emotionalDiscovery'
import type { MusicHistoryEntry, MusicProgressEntry } from './musicProgressStorage'
import {
  EDITORIAL_PLAYLIST_SPECS,
  resolveEditorialPlaylistTracks,
} from './editorialPlaylists'

export type MusicHeroContent = {
  title: string
  subtitle: string
  artworkUrl: string | null
  song: ApiSong
  queue: ApiSong[]
  queueTitle: string
  secondaryLabel: string | null
  secondaryType: 'album' | 'artist' | null
  secondaryId: string | null
}

export type MusicPersonalMix = {
  id: string
  title: string
  subtitle: string
  tracks: ApiSong[]
}

export type MusicGenreCard = {
  id: string
  label: string
  count: number
  artworkUrl: string | null
}

const GENRE_LABELS: Record<string, string> = {
  'hidden-tunes': 'Hidden Tunes',
  country: 'Country',
  jazz: 'Jazz',
  acoustic: 'Acoustic',
  gospel: 'Gospel',
  amapiano: 'Amapiano',
  pop: 'Pop',
  ambient: 'Ambient',
  love: 'Love & Soul',
}

export function formatGenreLabel(genreId: string) {
  const normalized = genreId.trim().toLowerCase()
  if (GENRE_LABELS[normalized]) return GENRE_LABELS[normalized]
  return normalized
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function resolveSongFromHistory(
  entry: { songId: string },
  songsById: Map<string, ApiSong>,
) {
  return songsById.get(entry.songId) ?? null
}

export function buildMusicHeroContent(
  songs: ApiSong[],
  albums: ApiAlbum[],
  artists: ApiArtist[],
  indexes: CatalogIndexes,
  continueListening: MusicProgressEntry[],
  history: MusicHistoryEntry[],
): MusicHeroContent | null {
  if (songs.length === 0) return null

  const songsById = indexes.songsById
  const continueEntry = continueListening[0]
  if (continueEntry) {
    const song = resolveSongFromHistory(continueEntry, songsById)
    if (song) {
      return {
        title: song.title,
        subtitle: `Pick up with ${song.artist}`,
        artworkUrl: song.artwork,
        song,
        queue: [song],
        queueTitle: 'Continue Listening',
        secondaryLabel: song.album ?? null,
        secondaryType: song.albumId ? 'album' : null,
        secondaryId: song.albumId,
      }
    }
  }

  const recentArtist = pickTopArtistFromHistory(history, artists, indexes)
  if (recentArtist) {
    const artistSongs = resolveSongsForArtist(
      recentArtist,
      indexes.songsByArtistId,
      indexes.songsByArtistName,
    ).slice(0, 12)
    if (artistSongs.length > 0) {
      return {
        title: recentArtist.name,
        subtitle: 'More from an artist in your catalog',
        artworkUrl: recentArtist.artwork,
        song: artistSongs[0],
        queue: artistSongs,
        queueTitle: `More from ${recentArtist.name}`,
        secondaryLabel: 'View artist',
        secondaryType: 'artist',
        secondaryId: recentArtist.id,
      }
    }
  }

  for (const spec of EDITORIAL_PLAYLIST_SPECS) {
    const tracks = resolveEditorialPlaylistTracks(songs, spec.sceneId).slice(0, 12)
    if (tracks.length >= 4) {
      return {
        title: spec.title,
        subtitle: spec.description,
        artworkUrl: tracks[0]?.artwork ?? null,
        song: tracks[0],
        queue: tracks,
        queueTitle: spec.title,
        secondaryLabel: null,
        secondaryType: null,
        secondaryId: null,
      }
    }
  }

  const latestAlbums = sortAlbumsList(albums, 'latest')
  for (const album of latestAlbums) {
    const tracks =
      indexes.songsByAlbumId.get(album.id)
      ?? indexes.songsByAlbumName.get(album.title.trim().toLowerCase())
      ?? []
    const queue = sortSongsList([...tracks], 'latest').slice(0, 12)
    if (queue.length > 0) {
      const artistName = album.artistId
        ? indexes.artistNames.get(album.artistId) ?? queue[0].artist
        : queue[0].artist
      return {
        title: album.title,
        subtitle: `Fresh release · ${artistName}`,
        artworkUrl: album.artwork ?? queue[0].artwork,
        song: queue[0],
        queue,
        queueTitle: album.title,
        secondaryLabel: 'View album',
        secondaryType: 'album',
        secondaryId: album.id,
      }
    }
  }

  const latestSongs = sortSongsList(songs, 'latest')
  const song = latestSongs[0]
  if (!song) return null
  return {
    title: song.title,
    subtitle: song.artist,
    artworkUrl: song.artwork,
    song,
    queue: latestSongs.slice(0, 12),
    queueTitle: 'Recently added',
    secondaryLabel: song.artist,
    secondaryType: song.artistId ? 'artist' : null,
    secondaryId: song.artistId,
  }
}

function pickTopArtistFromHistory(
  history: MusicHistoryEntry[],
  artists: ApiArtist[],
  indexes: CatalogIndexes,
) {
  const counts = new Map<string, number>()
  for (const entry of history) {
    const song = indexes.songsById.get(entry.songId)
    const artistKey = song?.artistId ?? song?.artist.toLowerCase()
    if (!artistKey) continue
    counts.set(artistKey, (counts.get(artistKey) ?? 0) + 1)
  }

  if (counts.size === 0) {
    return sortArtistsList(artists, 'tracks')[0] ?? null
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const topKey = sorted[0]?.[0]
  if (!topKey) return null

  return (
    artists.find((artist) => artist.id === topKey || artist.name.toLowerCase() === topKey)
    ?? null
  )
}

export function buildPersonalMixes(
  songs: ApiSong[],
  artists: ApiArtist[],
  indexes: CatalogIndexes,
  history: MusicHistoryEntry[],
): MusicPersonalMix[] {
  const mixes: MusicPersonalMix[] = []
  const songsById = indexes.songsById

  const topArtist = pickTopArtistFromHistory(history, artists, indexes)
  if (topArtist) {
    const tracks = resolveSongsForArtist(
      topArtist,
      indexes.songsByArtistId,
      indexes.songsByArtistName,
    ).slice(0, 16)
    if (tracks.length >= 3) {
      mixes.push({
        id: `artist-${topArtist.id}`,
        title: `More from ${topArtist.name}`,
        subtitle: 'Based on your recent listening',
        tracks,
      })
    }
  }

  const recentSongIds = history.slice(0, 8).map((entry) => entry.songId)
  const recentTracks = recentSongIds
    .map((id) => songsById.get(id))
    .filter((entry): entry is ApiSong => Boolean(entry))
  if (recentTracks.length >= 3) {
    mixes.push({
      id: 'recent-favourites',
      title: 'Return to your recent favourites',
      subtitle: 'Songs you played lately',
      tracks: recentTracks,
    })
  }

  const genreCounts = new Map<string, number>()
  for (const entry of history) {
    const song = songsById.get(entry.songId)
    if (!song) continue
    const genre = inferSongGenre(song)
    genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1)
  }
  const topGenre = [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topGenre) {
    const genreTracks = (indexes.songsByGenre.get(topGenre[0]) ?? []).slice(0, 16)
    if (genreTracks.length >= 4) {
      mixes.push({
        id: `genre-${topGenre[0]}`,
        title: `Your ${formatGenreLabel(topGenre[0])} mix`,
        subtitle: 'Built from your most-played genres',
        tracks: genreTracks,
      })
    }
  }

  if (mixes.length === 0 && songs.length >= 6) {
    const fallback = sortSongsList(songs, 'latest').slice(0, 12)
    mixes.push({
      id: 'catalog-starter',
      title: 'Made for your listening',
      subtitle: 'A starting mix from your catalog',
      tracks: fallback,
    })
  }

  return mixes.slice(0, 3)
}

export function buildGenreDiscoveryCards(
  indexes: CatalogIndexes,
  history: MusicHistoryEntry[],
  limit = 12,
): MusicGenreCard[] {
  const preferred = new Map<string, number>()
  for (const entry of history) {
    const song = indexes.songsById.get(entry.songId)
    if (!song) continue
    const genre = inferSongGenre(song)
    preferred.set(genre, (preferred.get(genre) ?? 0) + 2)
  }

  const cards: MusicGenreCard[] = []
  for (const [genre, genreSongs] of indexes.songsByGenre.entries()) {
    if (genreSongs.length < 3) continue
    const weight = (preferred.get(genre) ?? 0) + Math.min(genreSongs.length, 40)
    const artworkUrl = genreSongs.find((song) => song.artwork)?.artwork ?? null
    cards.push({
      id: genre,
      label: formatGenreLabel(genre),
      count: genreSongs.length,
      artworkUrl,
      weight,
    } as MusicGenreCard & { weight: number })
  }

  return cards
    .sort((a, b) => (b as MusicGenreCard & { weight: number }).weight - (a as MusicGenreCard & { weight: number }).weight)
    .slice(0, limit)
    .map(({ id, label, count, artworkUrl }) => ({ id, label, count, artworkUrl }))
}

export function buildHiddenGemSongs(
  songs: ApiSong[],
  history: MusicHistoryEntry[],
  limit = 12,
) {
  const played = new Set(history.map((entry) => entry.songId))
  return sortSongsList(
    songs.filter((song) => !played.has(song.id) && Boolean(song.artwork)),
    'latest',
  ).slice(0, limit)
}

export function buildEmotionalWorldCards(songs: ApiSong[], limit = 8) {
  return buildEmotionalLanes(songs)
    .filter((lane) => lane.trackCount >= 3)
    .slice(0, limit)
}

export function resolveRecentlyPlayedSongs(
  history: MusicHistoryEntry[],
  songsById: Map<string, ApiSong>,
  limit = 16,
) {
  return history
    .map((entry) => songsById.get(entry.songId))
    .filter((song): song is ApiSong => Boolean(song))
    .slice(0, limit)
}

export function resolveContinueSongs(
  entries: MusicProgressEntry[],
  songsById: Map<string, ApiSong>,
  limit = 8,
) {
  return entries
    .map((entry) => {
      const song = songsById.get(entry.songId)
      if (!song) return null
      return { entry, song }
    })
    .filter((row): row is { entry: MusicProgressEntry; song: ApiSong } => Boolean(row))
    .slice(0, limit)
}

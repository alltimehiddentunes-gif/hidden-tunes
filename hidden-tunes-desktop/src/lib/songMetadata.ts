import type { ApiArtist, ApiSong, SongAudioVersions } from './api'
import {
  mergeAudioVersions,
  selectInstantPlayableUrl,
  type PlayableUrlInput,
} from './audioVersions'
import { logCatalogSearch } from './catalogDiagnostics'
/**
 * Metadata-first catalog entry for search and browse.
 * Playback URLs are optional hints — resolved only when the user taps Play.
 * Future: replace bulk build with `/api/catalog/metadata` pagination.
 */
export type CatalogMetadataRecord = {
  id: string
  title: string
  artist: string
  artistId: string | null
  album: string
  albumId: string | null
  genre: string | null
  mood: string | null
  tags: string[]
  description: string | null
  artwork: string | null
  durationSeconds: number | null
  createdAt: string | null
  searchText: string
  previewUrl: string | null
  audioUrl: string | null
  highQualityUrl: string | null
  audioVersions?: SongAudioVersions
}

export type CatalogMetadataIndex = {
  entries: CatalogMetadataRecord[]
  byId: Map<string, CatalogMetadataRecord>
  searchTextById: Map<string, string>
}

export type CatalogSearchMode = 'default' | 'lightweight' | 'full'

export type CatalogSearchResult = {
  records: CatalogMetadataRecord[]
  skipped: boolean
  mode: CatalogSearchMode
}

export function normalizeSearchText(value: string | null | undefined): string {
  if (value == null) return ''
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ')
}

function enrichSongForCatalog(base: ApiSong, artist?: ApiArtist): ApiSong {
  if (!artist) return base
  return {
    ...base,
    artist: base.artist || artist.name,
    artistId: base.artistId || artist.id,
  }
}

function mergeSongRecord(existing: ApiSong | undefined, incoming: ApiSong): ApiSong {
  if (!existing) return incoming
  return {
    ...existing,
    ...incoming,
    title: incoming.title || existing.title,
    artist: incoming.artist || existing.artist,
    artistId: incoming.artistId || existing.artistId,
    album: incoming.album || existing.album,
    albumId: incoming.albumId || existing.albumId,
    genre: incoming.genre || existing.genre,
    mood: incoming.mood || existing.mood,
    tags: incoming.tags.length > 0 ? incoming.tags : existing.tags,
    description: incoming.description || existing.description,
    artwork: incoming.artwork || existing.artwork,
    previewUrl: incoming.previewUrl || existing.previewUrl,
    audioUrl: incoming.audioUrl || existing.audioUrl,
    highQualityUrl: incoming.highQualityUrl || existing.highQualityUrl,
    audioVersions: mergeAudioVersions(existing.audioVersions, incoming.audioVersions),
    durationSeconds: incoming.durationSeconds ?? existing.durationSeconds,
    createdAt: incoming.createdAt || existing.createdAt,
  }
}

export function mergeCatalogSongsForSearch(songs: ApiSong[], artists: ApiArtist[]): ApiSong[] {
  const byId = new Map<string, ApiSong>()

  for (const song of songs) {
    byId.set(song.id, song)
  }

  for (const artist of artists) {
    for (const track of artist.tracks) {
      const enriched = enrichSongForCatalog(track, artist)
      byId.set(track.id, mergeSongRecord(byId.get(track.id), enriched))
    }
  }

  return [...byId.values()]
}

export function buildSongSearchableText(song: ApiSong): string {
  return normalizeSearchText(
    [
      song.title,
      song.artist,
      song.album,
      song.genre,
      song.mood,
      ...song.tags,
      song.description,
    ]
      .filter(Boolean)
      .join(' '),
  )
}

export function apiSongToMetadataRecord(song: ApiSong): CatalogMetadataRecord {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    artistId: song.artistId,
    album: song.album,
    albumId: song.albumId,
    genre: song.genre,
    mood: song.mood,
    tags: song.tags,
    description: song.description,
    artwork: song.artwork,
    durationSeconds: song.durationSeconds,
    createdAt: song.createdAt,
    searchText: buildSongSearchableText(song),
    previewUrl: song.previewUrl,
    audioUrl: song.audioUrl,
    highQualityUrl: song.highQualityUrl,
    audioVersions: song.audioVersions,
  }
}

/** Convert metadata to ApiSong for the existing playback path (URLs resolved on tap). */
export function metadataRecordToApiSong(record: CatalogMetadataRecord): ApiSong {
  return {
    id: record.id,
    title: record.title,
    artist: record.artist,
    artistId: record.artistId,
    album: record.album,
    albumId: record.albumId,
    genre: record.genre,
    mood: record.mood,
    tags: record.tags,
    description: record.description,
    artwork: record.artwork,
    durationSeconds: record.durationSeconds,
    createdAt: record.createdAt,
    previewUrl: record.previewUrl,
    audioUrl: record.audioUrl,
    highQualityUrl: record.highQualityUrl,
    audioVersions: record.audioVersions,
  }
}

export function metadataRecordsToApiSongs(records: CatalogMetadataRecord[]): ApiSong[] {
  return records.map(metadataRecordToApiSong)
}

export function buildCatalogMetadataIndex(songs: ApiSong[]): CatalogMetadataIndex {
  const entries = songs.map(apiSongToMetadataRecord)
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const searchTextById = new Map(entries.map((entry) => [entry.id, entry.searchText]))
  return { entries, byId, searchTextById }
}

function compareSearchRank(
  record: CatalogMetadataRecord,
  query: string,
): number {
  const title = normalizeSearchText(record.title)
  const artist = normalizeSearchText(record.artist)
  const album = normalizeSearchText(record.album)

  if (title === query || artist === query) return 0
  if (title.startsWith(query)) return 1
  if (artist.startsWith(query)) return 2
  if (album.startsWith(query)) return 3
  if (title.includes(query)) return 4
  if (artist.includes(query)) return 5
  if (album.includes(query)) return 6
  if (record.searchText.includes(query)) return 7
  return 8
}

function sortSearchMatches(
  matches: CatalogMetadataRecord[],
  query: string,
): CatalogMetadataRecord[] {
  return [...matches].sort((a, b) => {
    const rankDiff = compareSearchRank(a, query) - compareSearchRank(b, query)
    if (rankDiff !== 0) return rankDiff

    const bTime = Date.parse(b.createdAt || '') || 0
    const aTime = Date.parse(a.createdAt || '') || 0
    if (aTime !== bTime) return bTime - aTime
    return a.title.localeCompare(b.title)
  })
}

export function sortMetadataRecords(
  records: CatalogMetadataRecord[],
  sort: 'latest' | 'az',
): CatalogMetadataRecord[] {
  const list = [...records]
  if (sort === 'az') {
    return list.sort((a, b) => a.title.localeCompare(b.title))
  }
  return list.sort((a, b) => {
    const bTime = Date.parse(b.createdAt || '') || 0
    const aTime = Date.parse(a.createdAt || '') || 0
    return bTime - aTime
  })
}

function defaultSearchResults(
  index: CatalogMetadataIndex,
  limit: number,
): CatalogMetadataRecord[] {
  const sorted = [...index.entries].sort((a, b) => {
    const bTime = Date.parse(b.createdAt || '') || 0
    const aTime = Date.parse(a.createdAt || '') || 0
    if (aTime !== bTime) return bTime - aTime
    return a.title.localeCompare(b.title)
  })
  return sorted.slice(0, limit)
}

export function searchCatalogSongs({
  index,
  query,
  limit = 240,
}: {
  index: CatalogMetadataIndex
  query: string
  limit?: number
}): CatalogSearchResult {
  const started = performance.now()
  const normalizedQuery = normalizeSearchText(query)

  if (!normalizedQuery) {
    const records = defaultSearchResults(index, limit)
    logCatalogSearch({
      queryLength: 0,
      resultCount: records.length,
      durationMs: Math.round(performance.now() - started),
      capped: index.entries.length > limit,
      skipped: false,
      mode: 'default',
    })
    return { records, skipped: false, mode: 'default' }
  }

  if (normalizedQuery.length === 1) {
    const matches: CatalogMetadataRecord[] = []
    const lightweightLimit = Math.min(limit, 80)

    for (const entry of index.entries) {
      const title = normalizeSearchText(entry.title)
      const artist = normalizeSearchText(entry.artist)
      if (title.includes(normalizedQuery) || artist.includes(normalizedQuery)) {
        matches.push(entry)
        if (matches.length >= lightweightLimit) break
      }
    }

    const records = sortSearchMatches(matches, normalizedQuery).slice(0, lightweightLimit)

    logCatalogSearch({
      queryLength: 1,
      resultCount: records.length,
      durationMs: Math.round(performance.now() - started),
      capped: records.length >= lightweightLimit,
      skipped: false,
      mode: 'lightweight',
    })
    return { records, skipped: false, mode: 'lightweight' }
  }

  const matches: CatalogMetadataRecord[] = []
  for (const entry of index.entries) {
    if (entry.searchText.includes(normalizedQuery)) {
      matches.push(entry)
      if (matches.length >= limit) break
    }
  }

  const records = sortSearchMatches(matches, normalizedQuery).slice(0, limit)

  logCatalogSearch({
    queryLength: normalizedQuery.length,
    resultCount: records.length,
    durationMs: Math.round(performance.now() - started),
    capped: matches.length >= limit,
    skipped: false,
    mode: 'full',
  })

  return { records, skipped: false, mode: 'full' }
}

export function resolveInstantPlayUrl(song: PlayableUrlInput): string | null {
  return selectInstantPlayableUrl(song)?.url ?? null
}

export function resolveUpgradePlayUrl(
  song: PlayableUrlInput & { highQualityUrl?: string | null },
  currentUrl: string | null,
): string | null {
  const upgrade =
    song.audioVersions?.highQuality?.url ?? song.highQualityUrl ?? song.audioUrl
  if (!upgrade || upgrade === currentUrl) return null
  return upgrade
}

export function buildSearchMetadataIndex(
  songs: ApiSong[],
  artists: ApiArtist[],
): CatalogMetadataIndex {
  return buildCatalogMetadataIndex(mergeCatalogSongsForSearch(songs, artists))
}

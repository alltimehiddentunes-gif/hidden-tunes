import type {
  DesktopLibraryItem,
  DesktopLibraryItemType,
  LibraryMigrationCounts,
  LibraryStoreV2,
} from './types'
import { DESKTOP_LIBRARY_ITEM_TYPES, LEGACY_LIBRARY_SOURCE_KEYS } from './types'
import { libraryItemKey } from './identity'
import {
  buildLectureLibraryItem,
  buildSongLibraryItemFromId,
  buildTvLibraryItemFromFavorite,
} from './builders'

function emptyCounts(): LibraryMigrationCounts {
  return { read: 0, migrated: 0, deduplicated: 0, rejected: 0, ambiguous: 0 }
}

function isType(value: unknown): value is DesktopLibraryItemType {
  return typeof value === 'string' && (DESKTOP_LIBRARY_ITEM_TYPES as readonly string[]).includes(value)
}

function readRaw(key: string): unknown {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Normalize a stored library item. Rejects malformed rows.
 * Never infers type from URL/title/ID shape.
 */
export function normalizeLibraryItem(raw: unknown): DesktopLibraryItem | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const title = typeof record.title === 'string' ? record.title.trim() : ''
  const type = record.type
  if (!id || !title || !isType(type)) return null

  const addedAt =
    typeof record.addedAt === 'string' && Number.isFinite(Date.parse(record.addedAt))
      ? record.addedAt
      : new Date(0).toISOString()

  const base = {
    id,
    type,
    title,
    addedAt,
    subtitle: typeof record.subtitle === 'string' ? record.subtitle : null,
    artwork: typeof record.artwork === 'string' ? record.artwork : null,
    source: typeof record.source === 'string' ? record.source : null,
    category: typeof record.category === 'string' ? record.category : null,
    duration:
      typeof record.duration === 'number' && Number.isFinite(record.duration)
        ? record.duration
        : null,
    metadata:
      record.metadata && typeof record.metadata === 'object'
        ? (record.metadata as Record<string, unknown>)
        : null,
  }

  switch (type) {
    case 'song':
      return {
        ...base,
        type: 'song',
        artist: typeof record.artist === 'string' ? record.artist : null,
        album: typeof record.album === 'string' ? record.album : null,
      }
    case 'radio':
      return {
        ...base,
        type: 'radio',
        country: typeof record.country === 'string' ? record.country : null,
        playId: typeof record.playId === 'string' ? record.playId : id,
        isMature: record.isMature === true,
        contentRating: typeof record.contentRating === 'string' ? record.contentRating : null,
      }
    case 'podcast_show':
      return {
        ...base,
        type: 'podcast_show',
        showTitle: typeof record.showTitle === 'string' ? record.showTitle : title,
        hostName: typeof record.hostName === 'string' ? record.hostName : null,
      }
    case 'podcast_episode':
      return {
        ...base,
        type: 'podcast_episode',
        showId: typeof record.showId === 'string' ? record.showId : null,
        showTitle: typeof record.showTitle === 'string' ? record.showTitle : null,
        playId: typeof record.playId === 'string' ? record.playId : id,
      }
    case 'audiobook':
      return {
        ...base,
        type: 'audiobook',
        author: typeof record.author === 'string' ? record.author : null,
        narrator: typeof record.narrator === 'string' ? record.narrator : null,
      }
    case 'tv':
      return {
        ...base,
        type: 'tv',
        channelName: typeof record.channelName === 'string' ? record.channelName : null,
      }
    case 'motivational':
      return {
        ...base,
        type: 'motivational',
        speaker: typeof record.speaker === 'string' ? record.speaker : null,
      }
    case 'lecture':
      return {
        ...base,
        type: 'lecture',
        speaker: typeof record.speaker === 'string' ? record.speaker : null,
      }
    case 'sports':
      return { ...base, type: 'sports' }
    case 'legacy_unknown':
      return {
        ...base,
        type: 'legacy_unknown',
        legacyKey: typeof record.legacyKey === 'string' ? record.legacyKey : null,
      }
    default:
      return null
  }
}

function migrateMusicLikes(counts: LibraryMigrationCounts): DesktopLibraryItem[] {
  const raw = readRaw(LEGACY_LIBRARY_SOURCE_KEYS.musicLikes)
  if (!Array.isArray(raw)) return []
  const out: DesktopLibraryItem[] = []
  for (const row of raw) {
    counts.read += 1
    if (!row || typeof row !== 'object') {
      counts.rejected += 1
      continue
    }
    const record = row as Record<string, unknown>
    const songId = typeof record.songId === 'string' ? record.songId.trim() : ''
    if (!songId) {
      counts.rejected += 1
      continue
    }
    // Never treat prefixed non-music queue IDs as songs.
    if (
      songId.startsWith('radio-')
      || songId.startsWith('podcast-')
      || songId.startsWith('tv-')
      || songId.startsWith('audiobook-')
      || songId.startsWith('lecture-')
      || songId.startsWith('motivation-')
      || songId.startsWith('motivational:')
    ) {
      counts.ambiguous += 1
      out.push({
        type: 'legacy_unknown',
        id: songId,
        title: 'Legacy saved item',
        addedAt:
          typeof record.likedAt === 'string' && Number.isFinite(Date.parse(record.likedAt))
            ? record.likedAt
            : new Date(0).toISOString(),
        legacyKey: LEGACY_LIBRARY_SOURCE_KEYS.musicLikes,
        source: 'legacy',
      })
      continue
    }
    out.push(buildSongLibraryItemFromId(songId, typeof record.likedAt === 'string' ? record.likedAt : undefined))
    counts.migrated += 1
  }
  return out
}

function migrateTvFavorites(counts: LibraryMigrationCounts): DesktopLibraryItem[] {
  const raw = readRaw(LEGACY_LIBRARY_SOURCE_KEYS.tvFavorites)
  if (!Array.isArray(raw)) return []
  const out: DesktopLibraryItem[] = []
  for (const row of raw) {
    counts.read += 1
    if (!row || typeof row !== 'object') {
      counts.rejected += 1
      continue
    }
    const record = row as Record<string, unknown>
    const channelId = typeof record.channelId === 'string' ? record.channelId.trim() : ''
    if (!channelId) {
      counts.rejected += 1
      continue
    }
    out.push(
      buildTvLibraryItemFromFavorite(
        channelId,
        typeof record.savedAt === 'string' ? record.savedAt : undefined,
      ),
    )
    counts.migrated += 1
  }
  return out
}

function migrateLecturesSaved(counts: LibraryMigrationCounts): DesktopLibraryItem[] {
  const raw = readRaw(LEGACY_LIBRARY_SOURCE_KEYS.lecturesSaved)
  if (!Array.isArray(raw)) return []
  const out: DesktopLibraryItem[] = []
  for (const row of raw) {
    counts.read += 1
    if (!row || typeof row !== 'object') {
      counts.rejected += 1
      continue
    }
    const record = row as Record<string, unknown>
    const seriesId = typeof record.seriesId === 'string' ? record.seriesId.trim() : ''
    const seriesTitle = typeof record.seriesTitle === 'string' ? record.seriesTitle.trim() : ''
    if (!seriesId || !seriesTitle) {
      counts.rejected += 1
      continue
    }
    out.push(
      buildLectureLibraryItem({
        seriesId,
        seriesTitle,
        speakerName: typeof record.speakerName === 'string' ? record.speakerName : null,
        artworkUrl:
          typeof record.artworkUrl === 'string' && record.artworkUrl.startsWith('http')
            ? record.artworkUrl
            : null,
        categorySlug: typeof record.categorySlug === 'string' ? record.categorySlug : null,
        savedAt:
          typeof record.savedAt === 'string' && Number.isFinite(Date.parse(record.savedAt))
            ? record.savedAt
            : new Date(0).toISOString(),
      }),
    )
    counts.migrated += 1
  }
  return out
}

function dedupeItems(
  items: DesktopLibraryItem[],
  counts: LibraryMigrationCounts,
): DesktopLibraryItem[] {
  const seen = new Map<string, DesktopLibraryItem>()
  for (const item of items) {
    const key = libraryItemKey(item)
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, item)
      continue
    }
    counts.deduplicated += 1
    // Prefer richer / newer metadata.
    const keepNewer = Date.parse(item.addedAt) >= Date.parse(existing.addedAt)
    const richer =
      (item.artwork ? 1 : 0) + (item.subtitle ? 1 : 0) + (item.title !== 'Liked song' && item.title !== 'TV channel' ? 1 : 0)
    const existingRicher =
      (existing.artwork ? 1 : 0) + (existing.subtitle ? 1 : 0) + (existing.title !== 'Liked song' && existing.title !== 'TV channel' ? 1 : 0)
    if (richer > existingRicher || (richer === existingRicher && keepNewer)) {
      seen.set(key, item)
    }
  }
  return Array.from(seen.values()).sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt))
}

/**
 * Build a v2 store from legacy family keys. Does not delete legacy data.
 * Safe to call repeatedly — caller must gate with migration flag.
 */
export function migrateLegacyLibrarySources(): {
  store: LibraryStoreV2
  counts: LibraryMigrationCounts
} {
  const counts = emptyCounts()
  const merged = [
    ...migrateMusicLikes(counts),
    ...migrateTvFavorites(counts),
    ...migrateLecturesSaved(counts),
  ]
  const items = dedupeItems(merged, counts)
  return {
    store: {
      version: 2,
      migratedAt: new Date().toISOString(),
      items,
      migration: { ...counts },
    },
    counts,
  }
}

export function parseLibraryStoreV2(raw: unknown): LibraryStoreV2 | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (record.version !== 2) return null
  if (!Array.isArray(record.items)) return null
  const items: DesktopLibraryItem[] = []
  for (const row of record.items) {
    const item = normalizeLibraryItem(row)
    if (item) items.push(item)
  }
  return {
    version: 2,
    migratedAt: typeof record.migratedAt === 'string' ? record.migratedAt : null,
    items,
    migration:
      record.migration && typeof record.migration === 'object'
        ? (record.migration as LibraryMigrationCounts)
        : null,
  }
}

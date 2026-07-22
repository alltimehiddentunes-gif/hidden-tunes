import type {
  ContinueListeningItem,
  DesktopHistoryItem,
  HistoryItemType,
  HistoryStoreV1,
} from './types'
import {
  HISTORY_MAX_ENTRIES,
  HISTORY_MIGRATION_FLAG_KEY,
  HISTORY_SCHEMA_VERSION,
  HISTORY_STORAGE_KEY,
  historyItemKey,
  isHistoryItemType,
} from './types'

const listeners = new Set<() => void>()
let cachedStore: HistoryStoreV1 | null = null

function nowIso() {
  return new Date().toISOString()
}

function readRaw(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeRaw(key: string, value: string) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

export function normalizeHistoryItem(raw: unknown): DesktopHistoryItem | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  if (!id || !title || !isHistoryItemType(row.type)) return null
  const playedAt =
    typeof row.playedAt === 'string' && Number.isFinite(Date.parse(row.playedAt))
      ? row.playedAt
      : nowIso()

  // Live Radio must never keep a continuous position.
  const positionSeconds =
    row.type === 'radio' || row.type === 'tv'
      ? null
      : typeof row.positionSeconds === 'number' && Number.isFinite(row.positionSeconds)
        ? Math.max(0, row.positionSeconds)
        : null

  return {
    id,
    type: row.type,
    title,
    playedAt,
    subtitle: typeof row.subtitle === 'string' ? row.subtitle : null,
    artwork: typeof row.artwork === 'string' ? row.artwork : null,
    durationSeconds: typeof row.durationSeconds === 'number' ? row.durationSeconds : null,
    positionSeconds,
    completed: row.completed === true,
    parentId: typeof row.parentId === 'string' ? row.parentId : null,
    isMature: row.isMature === true,
    contentRating: typeof row.contentRating === 'string' ? row.contentRating : null,
    metadata: row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : null,
  }
}

export function parseHistoryStore(raw: unknown): HistoryStoreV1 | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (row.version !== HISTORY_SCHEMA_VERSION || !Array.isArray(row.items)) return null
  const items = row.items.map(normalizeHistoryItem).filter(Boolean) as DesktopHistoryItem[]
  return {
    version: HISTORY_SCHEMA_VERSION,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : nowIso(),
    items: items.slice(0, HISTORY_MAX_ENTRIES),
  }
}

function emptyStore(): HistoryStoreV1 {
  return { version: HISTORY_SCHEMA_VERSION, updatedAt: nowIso(), items: [] }
}

function readLegacyJson<T>(key: string): T | null {
  try {
    const raw = readRaw(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function migrateLegacySources(): DesktopHistoryItem[] {
  const items: DesktopHistoryItem[] = []
  const seen = new Set<string>()

  const push = (item: DesktopHistoryItem | null) => {
    if (!item) return
    const key = historyItemKey(item)
    if (seen.has(key)) return
    seen.add(key)
    items.push(item)
  }

  const music = readLegacyJson<Array<Record<string, unknown>>>('ht-desktop:music-history') || []
  if (Array.isArray(music)) {
    for (const row of music) {
      push(
        normalizeHistoryItem({
          type: 'song',
          id: row.songId,
          title: row.title,
          subtitle: row.artist,
          artwork: row.artworkUrl,
          durationSeconds: row.durationSeconds,
          completed: row.completed,
          playedAt: row.playedAt,
        }),
      )
    }
  }

  const podcasts = readLegacyJson<Array<Record<string, unknown>>>('ht-desktop:podcast-history') || []
  if (Array.isArray(podcasts)) {
    for (const row of podcasts) {
      push(
        normalizeHistoryItem({
          type: 'podcast_episode',
          id: row.episodeId,
          title: row.title,
          subtitle: row.showTitle,
          artwork: row.artworkUrl,
          durationSeconds: row.durationSeconds,
          positionSeconds: row.positionSeconds,
          completed: row.completed,
          parentId: row.showId,
          playedAt: row.playedAt || row.lastPlayedAt,
        }),
      )
    }
  }

  const audiobooks = readLegacyJson<Array<Record<string, unknown>>>('ht-desktop:audiobook-history') || []
  if (Array.isArray(audiobooks)) {
    for (const row of audiobooks) {
      push(
        normalizeHistoryItem({
          type: 'audiobook_chapter',
          id: row.chapterId || row.id,
          title: row.title || row.chapterTitle,
          subtitle: row.bookTitle,
          artwork: row.artworkUrl,
          durationSeconds: row.durationSeconds,
          positionSeconds: row.positionSeconds,
          completed: row.completed,
          parentId: row.bookId,
          playedAt: row.playedAt || row.lastPlayedAt,
          metadata: { bookId: row.bookId, chapterId: row.chapterId },
        }),
      )
    }
  }

  const motivationals = readLegacyJson<Array<Record<string, unknown>>>('ht-desktop:motivationals-history') || []
  if (Array.isArray(motivationals)) {
    for (const row of motivationals) {
      push(
        normalizeHistoryItem({
          type: 'motivational',
          id: row.sessionId || row.id,
          title: row.title || row.sessionTitle,
          subtitle: row.programTitle,
          artwork: row.artworkUrl,
          durationSeconds: row.durationSeconds,
          positionSeconds: row.positionSeconds,
          completed: row.completed,
          parentId: row.programId,
          playedAt: row.playedAt || row.lastPlayedAt,
          metadata: { programId: row.programId, sessionId: row.sessionId },
        }),
      )
    }
  }

  const lectures = readLegacyJson<Array<Record<string, unknown>>>('ht-desktop:lectures-history') || []
  if (Array.isArray(lectures)) {
    for (const row of lectures) {
      push(
        normalizeHistoryItem({
          type: 'lecture',
          id: row.sessionId || row.lessonId || row.id,
          title: row.title || row.sessionTitle,
          subtitle: row.seriesTitle,
          artwork: row.artworkUrl,
          durationSeconds: row.durationSeconds,
          positionSeconds: row.positionSeconds,
          completed: row.completed,
          parentId: row.seriesId,
          playedAt: row.playedAt || row.lastPlayedAt,
          metadata: { seriesId: row.seriesId, sessionId: row.sessionId },
        }),
      )
    }
  }

  const tv = readLegacyJson<Array<Record<string, unknown>>>('ht-desktop:tv-recently-watched') || []
  if (Array.isArray(tv)) {
    for (const row of tv) {
      push(
        normalizeHistoryItem({
          type: 'tv',
          id: row.channelId,
          title: row.title || row.channelName || 'TV',
          subtitle: row.channelName,
          artwork: row.artworkUrl,
          playedAt: row.watchedAt,
          positionSeconds: null,
        }),
      )
    }
  }

  items.sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt))
  return items.slice(0, HISTORY_MAX_ENTRIES)
}

function readStore(): HistoryStoreV1 {
  const raw = readRaw(HISTORY_STORAGE_KEY)
  if (raw) {
    try {
      const parsed = parseHistoryStore(JSON.parse(raw))
      if (parsed) return parsed
    } catch {
      // fall through
    }
  }

  if (readRaw(HISTORY_MIGRATION_FLAG_KEY) !== '1') {
    const migrated = migrateLegacySources()
    const store: HistoryStoreV1 = {
      version: HISTORY_SCHEMA_VERSION,
      updatedAt: nowIso(),
      items: migrated,
    }
    writeRaw(HISTORY_STORAGE_KEY, JSON.stringify(store))
    writeRaw(HISTORY_MIGRATION_FLAG_KEY, '1')
    return store
  }

  return emptyStore()
}

function persist(store: HistoryStoreV1) {
  const next: HistoryStoreV1 = {
    version: HISTORY_SCHEMA_VERSION,
    updatedAt: nowIso(),
    items: store.items.slice(0, HISTORY_MAX_ENTRIES),
  }
  writeRaw(HISTORY_STORAGE_KEY, JSON.stringify(next))
  cachedStore = next
  for (const listener of listeners) listener()
}

export function getHistoryStore(): HistoryStoreV1 {
  if (!cachedStore) cachedStore = readStore()
  return cachedStore
}

export function subscribeDesktopHistory(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function listHistory(filter: HistoryItemType | 'all' = 'all'): DesktopHistoryItem[] {
  const items = getHistoryStore().items
  if (filter === 'all') return items.slice()
  return items.filter((item) => item.type === filter)
}

export function recordDesktopHistory(input: Omit<DesktopHistoryItem, 'playedAt'> & { playedAt?: string }) {
  const normalized = normalizeHistoryItem({
    ...input,
    playedAt: input.playedAt || nowIso(),
  })
  if (!normalized) return null

  const store = readStore()
  const key = historyItemKey(normalized)
  const filtered = store.items.filter((entry) => historyItemKey(entry) !== key)
  const nextItems = [normalized, ...filtered].slice(0, HISTORY_MAX_ENTRIES)
  persist({ ...store, items: nextItems })
  return normalized
}

export function removeHistoryItem(type: HistoryItemType, id: string) {
  const store = readStore()
  const key = `${type}:${id.trim()}`
  const items = store.items.filter((entry) => historyItemKey(entry) !== key)
  if (items.length === store.items.length) return false
  persist({ ...store, items })
  return true
}

export function clearHistoryByType(type: HistoryItemType) {
  const store = readStore()
  persist({ ...store, items: store.items.filter((entry) => entry.type !== type) })
}

export function clearAllHistory() {
  persist(emptyStore())
}

/**
 * Continue listening from unified history incomplete finite media.
 * Radio/TV never appear here.
 */
export function listContinueListening(limit = 24): ContinueListeningItem[] {
  return getHistoryStore()
    .items
    .filter((item) => {
      if (item.type === 'radio' || item.type === 'tv') return false
      if (item.completed) return false
      const position = item.positionSeconds ?? 0
      return position >= 15
    })
    .slice(0, limit)
    .map((item) => ({
      ...item,
      resumePositionSeconds: item.positionSeconds || 0,
    }))
}

export function filterHistoryForDisplay(
  items: DesktopHistoryItem[],
  options?: { includeMature?: boolean; type?: HistoryItemType | 'all' },
) {
  const includeMature = options?.includeMature === true
  const type = options?.type ?? 'all'
  return items.filter((item) => {
    if (type !== 'all' && item.type !== type) return false
    if (!includeMature && item.type === 'radio' && item.isMature === true) return false
    return true
  })
}

export function __resetHistoryCacheForTests() {
  cachedStore = null
}

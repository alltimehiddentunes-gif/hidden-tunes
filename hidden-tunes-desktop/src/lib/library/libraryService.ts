import type {
  DesktopLibraryItem,
  DesktopLibraryItemType,
  DesktopLibrarySnapshot,
  LibraryMigrationCounts,
  LibraryStoreV2,
} from './types'
import { LIBRARY_MIGRATION_FLAG_KEY, LIBRARY_STORAGE_KEY } from './types'
import { libraryItemIdentity, libraryItemKey } from './identity'
import { migrateLegacyLibrarySources, normalizeLibraryItem, parseLibraryStoreV2 } from './migration'

const listeners = new Set<() => void>()
let cachedSnapshot: DesktopLibrarySnapshot | null = null
let lastMigrationCounts: LibraryMigrationCounts | null = null

function emptyCountByType(): Record<DesktopLibraryItemType, number> {
  return {
    song: 0,
    radio: 0,
    podcast_show: 0,
    podcast_episode: 0,
    audiobook: 0,
    tv: 0,
    motivational: 0,
    lecture: 0,
    sports: 0,
    legacy_unknown: 0,
  }
}

function readRawKey(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeRawKey(key: string, value: string) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, value)
  } catch {
    // Quota / privacy mode
  }
}

function isMigrationDone(): boolean {
  return readRawKey(LIBRARY_MIGRATION_FLAG_KEY) === '1'
}

function markMigrationDone() {
  writeRawKey(LIBRARY_MIGRATION_FLAG_KEY, '1')
}

function writeStore(store: LibraryStoreV2) {
  writeRawKey(LIBRARY_STORAGE_KEY, JSON.stringify(store))
}

function readStore(): LibraryStoreV2 {
  const raw = readRawKey(LIBRARY_STORAGE_KEY)
  if (raw) {
    try {
      const parsed = parseLibraryStoreV2(JSON.parse(raw))
      if (parsed) return parsed
    } catch {
      // fall through to migrate / empty
    }
  }

  if (!isMigrationDone()) {
    const { store, counts } = migrateLegacyLibrarySources()
    lastMigrationCounts = counts
    writeStore(store)
    markMigrationDone()
    return store
  }

  return {
    version: 2,
    migratedAt: null,
    items: [],
    migration: null,
  }
}

function buildSnapshot(store: LibraryStoreV2): DesktopLibrarySnapshot {
  const byIdentity = new Map<string, DesktopLibraryItem>()
  const countByType = emptyCountByType()
  for (const item of store.items) {
    byIdentity.set(libraryItemKey(item), item)
    countByType[item.type] += 1
  }
  return {
    items: store.items.slice(),
    byIdentity,
    countByType,
    migrationStatus: {
      completed: isMigrationDone() || Boolean(store.migratedAt),
      migratedAt: store.migratedAt,
      counts: store.migration ?? lastMigrationCounts,
    },
  }
}

function notify() {
  cachedSnapshot = buildSnapshot(readStore())
  for (const listener of listeners) listener()
}

function persistItems(items: DesktopLibraryItem[], migrationMeta?: LibraryStoreV2['migration']) {
  const existing = readStore()
  const store: LibraryStoreV2 = {
    version: 2,
    migratedAt: existing.migratedAt ?? new Date().toISOString(),
    items,
    migration: migrationMeta ?? existing.migration ?? lastMigrationCounts,
  }
  writeStore(store)
  notify()
}

/** Ensure migration has run once. Idempotent. */
export function ensureLibraryMigrated(): LibraryMigrationCounts | null {
  const snapshot = getDesktopLibrarySnapshot()
  return snapshot.migrationStatus.counts
}

export function getDesktopLibrarySnapshot(): DesktopLibrarySnapshot {
  if (!cachedSnapshot) cachedSnapshot = buildSnapshot(readStore())
  return cachedSnapshot
}

export function subscribeDesktopLibrary(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getLibraryItems(): DesktopLibraryItem[] {
  return getDesktopLibrarySnapshot().items
}

export function getItemsByType(type: DesktopLibraryItemType): DesktopLibraryItem[] {
  return getDesktopLibrarySnapshot().items.filter((item) => item.type === type)
}

export function isFavorite(type: DesktopLibraryItemType, id: string): boolean {
  const cleaned = id.trim()
  if (!cleaned) return false
  return getDesktopLibrarySnapshot().byIdentity.has(libraryItemIdentity(type, cleaned))
}

export function addFavorite(item: DesktopLibraryItem): void {
  const normalized = normalizeLibraryItem(item)
  if (!normalized) return
  const key = libraryItemKey(normalized)
  const current = getDesktopLibrarySnapshot().items.filter((entry) => libraryItemKey(entry) !== key)
  persistItems([normalized, ...current])
}

export function removeFavorite(type: DesktopLibraryItemType, id: string): void {
  const cleaned = id.trim()
  if (!cleaned) return
  const key = libraryItemIdentity(type, cleaned)
  const current = getDesktopLibrarySnapshot().items.filter((entry) => libraryItemKey(entry) !== key)
  persistItems(current)
}

export function toggleFavorite(item: DesktopLibraryItem): boolean {
  const normalized = normalizeLibraryItem(item)
  if (!normalized) return false
  if (isFavorite(normalized.type, normalized.id)) {
    removeFavorite(normalized.type, normalized.id)
    return false
  }
  addFavorite(normalized)
  return true
}

export function clearType(type: DesktopLibraryItemType): void {
  const current = getDesktopLibrarySnapshot().items.filter((entry) => entry.type !== type)
  persistItems(current)
}

export function getLastMigrationCounts(): LibraryMigrationCounts | null {
  return getDesktopLibrarySnapshot().migrationStatus.counts
}

/** Test helper — reset in-memory cache (does not clear localStorage). */
export function __resetDesktopLibraryCacheForTests() {
  cachedSnapshot = null
  lastMigrationCounts = null
}

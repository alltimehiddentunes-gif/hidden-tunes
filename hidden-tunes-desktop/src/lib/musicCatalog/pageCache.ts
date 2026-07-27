import {
  MUSIC_CATALOG_CACHE_MAX_BYTES,
  MUSIC_CATALOG_CACHE_MAX_ENTRIES,
  MUSIC_CATALOG_CACHE_TTL_MS,
  MUSIC_CATALOG_CACHE_VERSION,
} from './types'

const INDEX_KEY = `ht-desktop:music-catalog-pages:v${MUSIC_CATALOG_CACHE_VERSION}:index`

type CacheIndexEntry = {
  key: string
  bytes: number
  updatedAt: number
}

type CacheEnvelope<T> = {
  version: number
  key: string
  savedAt: number
  payload: T
}

function storageAvailable() {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

function readIndex(): CacheIndexEntry[] {
  if (!storageAvailable()) return []
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const record = entry as Record<string, unknown>
        if (typeof record.key !== 'string') return null
        return {
          key: record.key,
          bytes: typeof record.bytes === 'number' ? record.bytes : 0,
          updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0,
        } satisfies CacheIndexEntry
      })
      .filter((entry): entry is CacheIndexEntry => Boolean(entry))
  } catch {
    return []
  }
}

function writeIndex(entries: CacheIndexEntry[]) {
  if (!storageAvailable()) return
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(entries))
  } catch {
    // Quota / private mode — ignore.
  }
}

function entryStorageKey(requestKey: string) {
  return `ht-desktop:music-catalog-page:v${MUSIC_CATALOG_CACHE_VERSION}:${requestKey}`
}

function evictIfNeeded(entries: CacheIndexEntry[]) {
  const next = [...entries].sort((a, b) => a.updatedAt - b.updatedAt)
  let totalBytes = next.reduce((sum, entry) => sum + entry.bytes, 0)

  while (
    next.length > MUSIC_CATALOG_CACHE_MAX_ENTRIES
    || totalBytes > MUSIC_CATALOG_CACHE_MAX_BYTES
  ) {
    const oldest = next.shift()
    if (!oldest) break
    totalBytes -= oldest.bytes
    try {
      localStorage.removeItem(entryStorageKey(oldest.key))
    } catch {
      // ignore
    }
  }

  return next
}

export function readMusicCatalogPageCache<T>(requestKey: string): {
  payload: T
  stale: boolean
  savedAt: number
} | null {
  if (!storageAvailable()) return null
  try {
    const raw = localStorage.getItem(entryStorageKey(requestKey))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEnvelope<T>
    if (!parsed || parsed.version !== MUSIC_CATALOG_CACHE_VERSION) {
      localStorage.removeItem(entryStorageKey(requestKey))
      return null
    }
    if (!parsed.payload || typeof parsed.savedAt !== 'number') {
      localStorage.removeItem(entryStorageKey(requestKey))
      return null
    }
    const age = Date.now() - parsed.savedAt
    return {
      payload: parsed.payload,
      stale: age > MUSIC_CATALOG_CACHE_TTL_MS,
      savedAt: parsed.savedAt,
    }
  } catch {
    try {
      localStorage.removeItem(entryStorageKey(requestKey))
    } catch {
      // ignore
    }
    return null
  }
}

export function writeMusicCatalogPageCache<T>(requestKey: string, payload: T) {
  if (!storageAvailable()) return
  // Never cache empty successful-looking payloads for search — caller decides.
  const envelope: CacheEnvelope<T> = {
    version: MUSIC_CATALOG_CACHE_VERSION,
    key: requestKey,
    savedAt: Date.now(),
    payload,
  }
  let serialized: string
  try {
    serialized = JSON.stringify(envelope)
  } catch {
    return
  }
  const bytes = serialized.length
  try {
    localStorage.setItem(entryStorageKey(requestKey), serialized)
  } catch {
    // Try eviction then once more.
    const index = evictIfNeeded(readIndex())
    writeIndex(index)
    try {
      localStorage.setItem(entryStorageKey(requestKey), serialized)
    } catch {
      return
    }
  }

  const without = readIndex().filter((entry) => entry.key !== requestKey)
  without.push({ key: requestKey, bytes, updatedAt: Date.now() })
  writeIndex(evictIfNeeded(without))
}

export function clearMusicCatalogPageCache() {
  if (!storageAvailable()) return
  const index = readIndex()
  for (const entry of index) {
    try {
      localStorage.removeItem(entryStorageKey(entry.key))
    } catch {
      // ignore
    }
  }
  try {
    localStorage.removeItem(INDEX_KEY)
  } catch {
    // ignore
  }
  // Drop legacy unbounded bundle cache key.
  try {
    localStorage.removeItem('ht-desktop:catalog-cache')
  } catch {
    // ignore
  }
}

export function getMusicCatalogCacheStats() {
  const index = readIndex()
  return {
    entries: index.length,
    bytes: index.reduce((sum, entry) => sum + entry.bytes, 0),
    maxEntries: MUSIC_CATALOG_CACHE_MAX_ENTRIES,
    maxBytes: MUSIC_CATALOG_CACHE_MAX_BYTES,
    ttlMs: MUSIC_CATALOG_CACHE_TTL_MS,
  }
}

const TV_FAVORITES_KEY = 'ht-desktop:tv-favorites'
const TV_HISTORY_KEY = 'ht-desktop:tv-recently-watched'
const TV_MAX_FAVORITES = 120
const TV_MAX_HISTORY = 40

export type TvFavoriteEntry = {
  channelId: string
  savedAt: string
}

export type TvHistoryEntry = {
  channelId: string
  title: string
  channelName: string | null
  artworkUrl: string | null
  watchedAt: string
}

function readJsonArray<T>(key: string): T[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function writeJsonArray<T>(key: string, value: T[]) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage failures.
  }
}

export function loadTvFavorites(): TvFavoriteEntry[] {
  return readJsonArray<TvFavoriteEntry>(TV_FAVORITES_KEY)
}

export function isTvFavorite(channelId: string): boolean {
  const id = channelId.trim()
  if (!id) return false
  return loadTvFavorites().some((entry) => entry.channelId === id)
}

export function toggleTvFavorite(channelId: string): boolean {
  const id = channelId.trim()
  if (!id) return false

  const current = loadTvFavorites()
  const exists = current.some((entry) => entry.channelId === id)
  if (exists) {
    writeJsonArray(
      TV_FAVORITES_KEY,
      current.filter((entry) => entry.channelId !== id),
    )
    return false
  }

  writeJsonArray(TV_FAVORITES_KEY, [
    { channelId: id, savedAt: new Date().toISOString() },
    ...current,
  ].slice(0, TV_MAX_FAVORITES))
  return true
}

export function recordTvHistory(entry: Omit<TvHistoryEntry, 'watchedAt'>) {
  const channelId = entry.channelId.trim()
  if (!channelId) return

  const current = readJsonArray<TvHistoryEntry>(TV_HISTORY_KEY).filter(
    (item) => item.channelId !== channelId,
  )

  writeJsonArray(TV_HISTORY_KEY, [
    {
      ...entry,
      watchedAt: new Date().toISOString(),
    },
    ...current,
  ].slice(0, TV_MAX_HISTORY))
}

export function loadTvHistory(): TvHistoryEntry[] {
  return readJsonArray<TvHistoryEntry>(TV_HISTORY_KEY)
}

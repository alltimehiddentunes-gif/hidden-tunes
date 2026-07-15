/** Local liked-song IDs for desktop (per-device; not cloud-synced). */

export const MUSIC_LIKES_STORAGE_KEY = 'music-likes'

export type MusicLikeEntry = {
  songId: string
  likedAt: string
}

export type MusicLikesSnapshot = {
  likedSongIds: string[]
  likedAtById: Record<string, string>
}

const listeners = new Set<() => void>()
let cachedSnapshot: MusicLikesSnapshot | null = null

function readJsonStore<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback
    const raw = localStorage.getItem(`ht-desktop:${key}`)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJsonStore<T>(key: string, value: T) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(`ht-desktop:${key}`, JSON.stringify(value))
  } catch {
    // Quota or privacy mode — ignore safely.
  }
}

function normalizeLikeEntry(row: unknown): MusicLikeEntry | null {
  if (!row || typeof row !== 'object') return null
  const record = row as Record<string, unknown>
  const songId = typeof record.songId === 'string' ? record.songId.trim() : ''
  if (!songId) return null
  const likedAt =
    typeof record.likedAt === 'string' && Number.isFinite(Date.parse(record.likedAt))
      ? record.likedAt
      : new Date(0).toISOString()
  return { songId, likedAt }
}

function listLikeEntries(): MusicLikeEntry[] {
  const store = readJsonStore<MusicLikeEntry[]>(MUSIC_LIKES_STORAGE_KEY, [])
  if (!Array.isArray(store)) return []
  const seen = new Set<string>()
  const entries: MusicLikeEntry[] = []
  for (const row of store) {
    const entry = normalizeLikeEntry(row)
    if (!entry || seen.has(entry.songId)) continue
    seen.add(entry.songId)
    entries.push(entry)
  }
  return entries.sort((a, b) => Date.parse(b.likedAt) - Date.parse(a.likedAt))
}

function buildSnapshot(): MusicLikesSnapshot {
  const entries = listLikeEntries()
  const likedAtById: Record<string, string> = {}
  for (const entry of entries) {
    likedAtById[entry.songId] = entry.likedAt
  }
  return {
    likedSongIds: entries.map((entry) => entry.songId),
    likedAtById,
  }
}

function notify() {
  cachedSnapshot = buildSnapshot()
  for (const listener of listeners) listener()
}

export function getMusicLikesSnapshot(): MusicLikesSnapshot {
  if (!cachedSnapshot) cachedSnapshot = buildSnapshot()
  return cachedSnapshot
}

export function subscribeMusicLikes(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function isSongLiked(songId: string | null | undefined): boolean {
  if (!songId) return false
  return getMusicLikesSnapshot().likedAtById[songId] != null
}

export function likeSong(songId: string): void {
  const cleaned = songId.trim()
  if (!cleaned) return
  const entries = listLikeEntries().filter((entry) => entry.songId !== cleaned)
  entries.unshift({ songId: cleaned, likedAt: new Date().toISOString() })
  writeJsonStore(MUSIC_LIKES_STORAGE_KEY, entries)
  notify()
}

export function unlikeSong(songId: string): void {
  const cleaned = songId.trim()
  if (!cleaned) return
  const entries = listLikeEntries().filter((entry) => entry.songId !== cleaned)
  writeJsonStore(MUSIC_LIKES_STORAGE_KEY, entries)
  notify()
}

export function toggleSongLiked(songId: string): boolean {
  if (isSongLiked(songId)) {
    unlikeSong(songId)
    return false
  }
  likeSong(songId)
  return true
}

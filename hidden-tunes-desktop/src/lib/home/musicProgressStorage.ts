import type { ApiSong } from '../api'
import { isMusicCatalogSong } from './isMusicCatalogSong'

export const MUSIC_PROGRESS_STORAGE_KEY = 'music-progress'
export const MUSIC_HISTORY_STORAGE_KEY = 'music-history'

export const MUSIC_PROGRESS_THROTTLE_MS = 12_000
export const MUSIC_MIN_CONTINUE_SECONDS = 20
export const MUSIC_COMPLETION_RATIO = 0.92
export const MUSIC_COMPLETION_TAIL_SECONDS = 25
export const MUSIC_MAX_HISTORY_ENTRIES = 40
export const MUSIC_MAX_CONTINUE_ENTRIES = 8

export type MusicProgressEntry = {
  songId: string
  title: string
  artist: string
  album: string | null
  artworkUrl: string | null
  positionSeconds: number
  durationSeconds: number | null
  lastPlayedAt: string
  updatedAt: string
  completed: boolean
}

export type MusicHistoryEntry = {
  songId: string
  title: string
  artist: string
  album: string | null
  artworkUrl: string | null
  durationSeconds: number | null
  playedAt: string
  completed: boolean
}

export type MusicLocalSnapshot = {
  continueListening: MusicProgressEntry[]
  recentlyPlayed: MusicHistoryEntry[]
}

const listeners = new Set<() => void>()
let cachedLocalSnapshot: MusicLocalSnapshot | null = null

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

function snapshotSignature(snapshot: MusicLocalSnapshot) {
  const continueSig = snapshot.continueListening
    .map((entry) => `${entry.songId}:${entry.positionSeconds}:${entry.updatedAt}`)
    .join('|')
  const recentSig = snapshot.recentlyPlayed
    .map((entry) => `${entry.songId}:${entry.playedAt}`)
    .join('|')
  return `${continueSig}::${recentSig}`
}

function buildMusicLocalSnapshot(): MusicLocalSnapshot {
  return {
    continueListening: listMusicContinueListening(),
    recentlyPlayed: listMusicRecentlyPlayed(),
  }
}

function refreshMusicLocalSnapshot(): MusicLocalSnapshot {
  const next = buildMusicLocalSnapshot()
  if (cachedLocalSnapshot && snapshotSignature(cachedLocalSnapshot) === snapshotSignature(next)) {
    return cachedLocalSnapshot
  }
  cachedLocalSnapshot = next
  return cachedLocalSnapshot
}

export function getMusicLocalSnapshot(): MusicLocalSnapshot {
  if (!cachedLocalSnapshot) {
    cachedLocalSnapshot = buildMusicLocalSnapshot()
  }
  return cachedLocalSnapshot
}

export function subscribeMusicLocalState(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notifyMusicLocalState() {
  const previous = cachedLocalSnapshot
  const next = refreshMusicLocalSnapshot()
  if (previous === next) return
  listeners.forEach((listener) => listener())
}

export function isMusicTrackCompleted(
  positionSeconds: number,
  durationSeconds: number | null,
) {
  if (!Number.isFinite(positionSeconds) || positionSeconds <= 0) return false
  if (!durationSeconds || durationSeconds <= 0) return false
  const remaining = durationSeconds - positionSeconds
  return positionSeconds / durationSeconds >= MUSIC_COMPLETION_RATIO
    || remaining <= MUSIC_COMPLETION_TAIL_SECONDS
}

export function shouldAppearInMusicContinueListening(
  positionSeconds: number,
  durationSeconds: number | null,
  completed: boolean,
) {
  if (completed) return false
  if (positionSeconds < MUSIC_MIN_CONTINUE_SECONDS) return false
  if (durationSeconds && durationSeconds > 0) {
    return !isMusicTrackCompleted(positionSeconds, durationSeconds)
  }
  return true
}

function normalizeProgressEntry(raw: unknown): MusicProgressEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const songId = typeof record.songId === 'string' ? record.songId.trim() : ''
  const title = typeof record.title === 'string' ? record.title.trim() : ''
  if (!songId || !title) return null

  const positionSeconds = Number.isFinite(Number(record.positionSeconds))
    ? Math.max(0, Number(record.positionSeconds))
    : 0
  const durationSeconds = Number.isFinite(Number(record.durationSeconds))
    ? Math.max(0, Number(record.durationSeconds))
    : null

  return {
    songId,
    title,
    artist: typeof record.artist === 'string' ? record.artist : 'Unknown artist',
    album: typeof record.album === 'string' ? record.album : null,
    artworkUrl:
      typeof record.artworkUrl === 'string' && record.artworkUrl.startsWith('http')
        ? record.artworkUrl
        : null,
    positionSeconds,
    durationSeconds,
    lastPlayedAt:
      typeof record.lastPlayedAt === 'string' ? record.lastPlayedAt : new Date().toISOString(),
    updatedAt:
      typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
    completed: record.completed === true,
  }
}

function normalizeHistoryEntry(raw: unknown): MusicHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const songId = typeof record.songId === 'string' ? record.songId.trim() : ''
  const title = typeof record.title === 'string' ? record.title.trim() : ''
  if (!songId || !title) return null

  return {
    songId,
    title,
    artist: typeof record.artist === 'string' ? record.artist : 'Unknown artist',
    album: typeof record.album === 'string' ? record.album : null,
    artworkUrl:
      typeof record.artworkUrl === 'string' && record.artworkUrl.startsWith('http')
        ? record.artworkUrl
        : null,
    durationSeconds: Number.isFinite(Number(record.durationSeconds))
      ? Math.max(0, Number(record.durationSeconds))
      : null,
    playedAt: typeof record.playedAt === 'string' ? record.playedAt : new Date().toISOString(),
    completed: record.completed === true,
  }
}

export function buildMusicProgressEntryFromSong(
  song: ApiSong,
  positionSeconds: number,
  durationSeconds: number | null,
  completed: boolean,
): MusicProgressEntry | null {
  if (!isMusicCatalogSong(song)) return null
  return {
    songId: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album ?? null,
    artworkUrl: song.artwork,
    positionSeconds: Math.max(0, positionSeconds),
    durationSeconds,
    lastPlayedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completed,
  }
}

export function progressEntryToHistoryEntry(entry: MusicProgressEntry): MusicHistoryEntry {
  return {
    songId: entry.songId,
    title: entry.title,
    artist: entry.artist,
    album: entry.album,
    artworkUrl: entry.artworkUrl,
    durationSeconds: entry.durationSeconds,
    playedAt: entry.updatedAt,
    completed: entry.completed,
  }
}

type MusicProgressStore = Record<string, MusicProgressEntry>

export function upsertMusicProgress(entry: MusicProgressEntry) {
  const store = readJsonStore<MusicProgressStore>(MUSIC_PROGRESS_STORAGE_KEY, {})
  store[entry.songId] = entry
  writeJsonStore(MUSIC_PROGRESS_STORAGE_KEY, store)
  notifyMusicLocalState()
}

export function removeMusicProgress(songId: string) {
  const store = readJsonStore<MusicProgressStore>(MUSIC_PROGRESS_STORAGE_KEY, {})
  if (!(songId in store)) return
  delete store[songId]
  writeJsonStore(MUSIC_PROGRESS_STORAGE_KEY, store)
  notifyMusicLocalState()
}

export function recordMusicHistory(entry: MusicHistoryEntry) {
  const history = readJsonStore<MusicHistoryEntry[]>(MUSIC_HISTORY_STORAGE_KEY, [])
    .map((row) => normalizeHistoryEntry(row))
    .filter((row): row is MusicHistoryEntry => Boolean(row))

  const next = [
    entry,
    ...history.filter((row) => row.songId !== entry.songId),
  ].slice(0, MUSIC_MAX_HISTORY_ENTRIES)

  writeJsonStore(MUSIC_HISTORY_STORAGE_KEY, next)
  notifyMusicLocalState()
}

export function listMusicContinueListening(limit = MUSIC_MAX_CONTINUE_ENTRIES) {
  const store = readJsonStore<MusicProgressStore>(MUSIC_PROGRESS_STORAGE_KEY, {})
  return Object.values(store)
    .map((row) => normalizeProgressEntry(row))
    .filter((entry): entry is MusicProgressEntry => Boolean(entry))
    .filter((entry) =>
      shouldAppearInMusicContinueListening(
        entry.positionSeconds,
        entry.durationSeconds,
        entry.completed,
      ),
    )
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit)
}

export function listMusicRecentlyPlayed(limit = 20) {
  return readJsonStore<MusicHistoryEntry[]>(MUSIC_HISTORY_STORAGE_KEY, [])
    .map((row) => normalizeHistoryEntry(row))
    .filter((entry): entry is MusicHistoryEntry => Boolean(entry))
    .sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt))
    .slice(0, limit)
}

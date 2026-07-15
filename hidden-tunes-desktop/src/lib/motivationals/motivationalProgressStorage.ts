import type { ApiSong } from '../api'
import {
  isMotivationalQueueSong,
  parseMotivationalSongId,
} from './motivationalPlaybackAdapter'

export const MOTIVATIONAL_PROGRESS_STORAGE_KEY = 'motivationals-progress'
export const MOTIVATIONAL_HISTORY_STORAGE_KEY = 'motivationals-history'

export const MOTIVATIONAL_PROGRESS_THROTTLE_MS = 12_000
export const MOTIVATIONAL_MIN_CONTINUE_SECONDS = 30
export const MOTIVATIONAL_COMPLETION_RATIO = 0.95
export const MOTIVATIONAL_COMPLETION_TAIL_SECONDS = 30
export const MOTIVATIONAL_PREVIOUS_RESTART_SECONDS = 8
export const MOTIVATIONAL_MAX_HISTORY_ENTRIES = 75
export const MOTIVATIONAL_MAX_CONTINUE_ENTRIES = 8
export const MOTIVATIONAL_MAX_RECENT_ENTRIES = 12

export function isMotivationalSessionCompleted(
  positionSeconds: number,
  durationSeconds: number | null,
) {
  if (!Number.isFinite(positionSeconds) || positionSeconds <= 0) return false
  if (!durationSeconds || durationSeconds <= 0) return false
  const remaining = durationSeconds - positionSeconds
  return positionSeconds / durationSeconds >= MOTIVATIONAL_COMPLETION_RATIO
    || remaining <= MOTIVATIONAL_COMPLETION_TAIL_SECONDS
}

export function shouldAppearInMotivationalContinueListening(
  positionSeconds: number,
  durationSeconds: number | null,
  completed: boolean,
) {
  if (completed) return false
  if (positionSeconds < MOTIVATIONAL_MIN_CONTINUE_SECONDS) return false
  if (durationSeconds && durationSeconds > 0) {
    return !isMotivationalSessionCompleted(positionSeconds, durationSeconds)
  }
  return true
}

export type MotivationalProgressEntry = {
  programId: string
  sessionId: string
  programTitle: string
  sessionTitle: string
  speakerName: string | null
  artworkUrl: string | null
  sessionNumber: number | null
  sessionCount: number | null
  positionSeconds: number
  durationSeconds: number | null
  lastPlayedAt: string
  updatedAt: string
  completed: boolean
}

export type MotivationalHistoryEntry = {
  programId: string
  sessionId: string
  programTitle: string
  sessionTitle: string
  speakerName: string | null
  artworkUrl: string | null
  sessionNumber: number | null
  durationSeconds: number | null
  playedAt: string
  completed: boolean
}

const listeners = new Set<() => void>()

export type MotivationalLocalSnapshot = {
  continueListening: MotivationalProgressEntry[]
  recentlyPlayed: MotivationalHistoryEntry[]
}

let cachedLocalSnapshot: MotivationalLocalSnapshot | null = null

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
    // Ignore storage failures.
  }
}

function notifyMotivationalLocalState() {
  cachedLocalSnapshot = null
  listeners.forEach((listener) => listener())
}

export function subscribeMotivationalLocalState(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getMotivationalLocalSnapshot(): MotivationalLocalSnapshot {
  if (!cachedLocalSnapshot) {
    cachedLocalSnapshot = {
      continueListening: listMotivationalContinueListening(),
      recentlyPlayed: listMotivationalRecentlyPlayed(),
    }
  }
  return cachedLocalSnapshot
}

type MotivationalProgressStore = Record<string, MotivationalProgressEntry>

function normalizeProgressEntry(raw: unknown): MotivationalProgressEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const programId = typeof record.programId === 'string' ? record.programId.trim() : ''
  const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''
  const programTitle = typeof record.programTitle === 'string' ? record.programTitle.trim() : ''
  const sessionTitle = typeof record.sessionTitle === 'string' ? record.sessionTitle.trim() : ''
  if (!programId || !sessionId || !programTitle || !sessionTitle) return null

  return {
    programId,
    sessionId,
    programTitle,
    sessionTitle,
    speakerName: typeof record.speakerName === 'string' ? record.speakerName : null,
    artworkUrl:
      typeof record.artworkUrl === 'string' && record.artworkUrl.startsWith('http')
        ? record.artworkUrl
        : null,
    sessionNumber: Number.isFinite(Number(record.sessionNumber))
      ? Number(record.sessionNumber)
      : null,
    sessionCount: Number.isFinite(Number(record.sessionCount))
      ? Number(record.sessionCount)
      : null,
    positionSeconds: Number.isFinite(Number(record.positionSeconds))
      ? Math.max(0, Number(record.positionSeconds))
      : 0,
    durationSeconds: Number.isFinite(Number(record.durationSeconds))
      ? Math.max(0, Number(record.durationSeconds))
      : null,
    lastPlayedAt:
      typeof record.lastPlayedAt === 'string' ? record.lastPlayedAt : new Date().toISOString(),
    updatedAt:
      typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
    completed: record.completed === true,
  }
}

function normalizeHistoryEntry(raw: unknown): MotivationalHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const programId = typeof record.programId === 'string' ? record.programId.trim() : ''
  const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''
  const programTitle = typeof record.programTitle === 'string' ? record.programTitle.trim() : ''
  const sessionTitle = typeof record.sessionTitle === 'string' ? record.sessionTitle.trim() : ''
  if (!programId || !sessionId || !programTitle || !sessionTitle) return null

  return {
    programId,
    sessionId,
    programTitle,
    sessionTitle,
    speakerName: typeof record.speakerName === 'string' ? record.speakerName : null,
    artworkUrl:
      typeof record.artworkUrl === 'string' && record.artworkUrl.startsWith('http')
        ? record.artworkUrl
        : null,
    sessionNumber: Number.isFinite(Number(record.sessionNumber))
      ? Number(record.sessionNumber)
      : null,
    durationSeconds: Number.isFinite(Number(record.durationSeconds))
      ? Math.max(0, Number(record.durationSeconds))
      : null,
    playedAt: typeof record.playedAt === 'string' ? record.playedAt : new Date().toISOString(),
    completed: record.completed === true,
  }
}

function readProgressStore(): MotivationalProgressStore {
  const raw = readJsonStore<unknown>(MOTIVATIONAL_PROGRESS_STORAGE_KEY, {})
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const store: MotivationalProgressStore = {}
  for (const [key, value] of Object.entries(raw)) {
    const entry = normalizeProgressEntry(value)
    if (entry) store[key] = entry
  }
  return store
}

function writeProgressStore(store: MotivationalProgressStore) {
  writeJsonStore(MOTIVATIONAL_PROGRESS_STORAGE_KEY, store)
  notifyMotivationalLocalState()
}

function readHistoryStore(): MotivationalHistoryEntry[] {
  const raw = readJsonStore<unknown>(MOTIVATIONAL_HISTORY_STORAGE_KEY, [])
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => normalizeHistoryEntry(entry))
    .filter((entry): entry is MotivationalHistoryEntry => Boolean(entry))
    .slice(0, MOTIVATIONAL_MAX_HISTORY_ENTRIES)
}

function writeHistoryStore(entries: MotivationalHistoryEntry[]) {
  writeJsonStore(MOTIVATIONAL_HISTORY_STORAGE_KEY, entries.slice(0, MOTIVATIONAL_MAX_HISTORY_ENTRIES))
  notifyMotivationalLocalState()
}

export function buildMotivationalProgressEntryFromSong(
  song: ApiSong,
  positionSeconds: number,
  durationSeconds: number,
  completed = false,
  sessionNumber: number | null = null,
  sessionCount: number | null = null,
): MotivationalProgressEntry | null {
  if (!isMotivationalQueueSong(song)) return null
  const ids = parseMotivationalSongId(song.id)
  if (!ids) return null

  const now = new Date().toISOString()
  const safeDuration =
    durationSeconds > 0 ? durationSeconds : song.durationSeconds ?? null

  return {
    programId: ids.programId,
    sessionId: ids.sessionId,
    programTitle: song.album || 'Motivational program',
    sessionTitle: song.title,
    speakerName: song.artist || null,
    artworkUrl: song.artwork,
    sessionNumber,
    sessionCount,
    positionSeconds: Math.max(0, positionSeconds),
    durationSeconds: safeDuration,
    lastPlayedAt: now,
    updatedAt: now,
    completed,
  }
}

export function upsertMotivationalProgress(entry: MotivationalProgressEntry) {
  const store = readProgressStore()
  store[entry.programId] = entry
  writeProgressStore(store)
}

export function removeMotivationalProgress(programId: string) {
  const store = readProgressStore()
  delete store[programId]
  writeProgressStore(store)
}

export function getMotivationalProgress(programId: string) {
  return readProgressStore()[programId] ?? null
}

export function getMotivationalSessionProgress(programId: string, sessionId: string) {
  const entry = getMotivationalProgress(programId)
  if (!entry || entry.sessionId !== sessionId) return null
  return entry
}

export function listMotivationalContinueListening(limit = MOTIVATIONAL_MAX_CONTINUE_ENTRIES) {
  return Object.values(readProgressStore())
    .filter((entry) =>
      shouldAppearInMotivationalContinueListening(
        entry.positionSeconds,
        entry.durationSeconds,
        entry.completed,
      ),
    )
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit)
}

export function listMotivationalRecentlyPlayed(limit = MOTIVATIONAL_MAX_RECENT_ENTRIES) {
  return readHistoryStore()
    .sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt))
    .slice(0, limit)
}

export function recordMotivationalHistory(entry: MotivationalHistoryEntry) {
  const existing = readHistoryStore().filter(
    (item) => !(item.programId === entry.programId && item.sessionId === entry.sessionId),
  )
  writeHistoryStore([entry, ...existing])
}

export function progressEntryToHistoryEntry(entry: MotivationalProgressEntry): MotivationalHistoryEntry {
  return {
    programId: entry.programId,
    sessionId: entry.sessionId,
    programTitle: entry.programTitle,
    sessionTitle: entry.sessionTitle,
    speakerName: entry.speakerName,
    artworkUrl: entry.artworkUrl,
    sessionNumber: entry.sessionNumber,
    durationSeconds: entry.durationSeconds,
    playedAt: entry.lastPlayedAt,
    completed: entry.completed,
  }
}

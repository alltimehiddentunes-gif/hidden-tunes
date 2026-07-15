import type { ApiSong } from '../api'
import {
  isLectureQueueSong,
  parseLectureSongId,
} from './lecturePlaybackAdapter'

export const LECTURE_PROGRESS_STORAGE_KEY = 'lectures-progress'
export const LECTURE_HISTORY_STORAGE_KEY = 'lectures-history'
export const LECTURE_SAVED_STORAGE_KEY = 'lectures-saved'

export const LECTURE_PROGRESS_THROTTLE_MS = 12_000
export const LECTURE_MIN_CONTINUE_SECONDS = 30
export const LECTURE_COMPLETION_RATIO = 0.95
export const LECTURE_COMPLETION_TAIL_SECONDS = 30
export const LECTURE_PREVIOUS_RESTART_SECONDS = 8
export const LECTURE_MAX_HISTORY_ENTRIES = 75
export const LECTURE_MAX_CONTINUE_ENTRIES = 8
export const LECTURE_MAX_RECENT_ENTRIES = 12
export const LECTURE_MAX_SAVED_ENTRIES = 50

export function isLectureSessionCompleted(
  positionSeconds: number,
  durationSeconds: number | null,
) {
  if (!Number.isFinite(positionSeconds) || positionSeconds <= 0) return false
  if (!durationSeconds || durationSeconds <= 0) return false
  const remaining = durationSeconds - positionSeconds
  return positionSeconds / durationSeconds >= LECTURE_COMPLETION_RATIO
    || remaining <= LECTURE_COMPLETION_TAIL_SECONDS
}

export function shouldAppearInLectureContinueLearning(
  positionSeconds: number,
  durationSeconds: number | null,
  completed: boolean,
) {
  if (completed) return false
  if (positionSeconds < LECTURE_MIN_CONTINUE_SECONDS) return false
  if (durationSeconds && durationSeconds > 0) {
    return !isLectureSessionCompleted(positionSeconds, durationSeconds)
  }
  return true
}

export type LectureProgressEntry = {
  seriesId: string
  sessionId: string
  seriesTitle: string
  sessionTitle: string
  speakerName: string | null
  artworkUrl: string | null
  sessionNumber: number | null
  sessionCount: number | null
  categorySlug: string | null
  positionSeconds: number
  durationSeconds: number | null
  lastPlayedAt: string
  updatedAt: string
  completed: boolean
}

export type LectureHistoryEntry = {
  seriesId: string
  sessionId: string
  seriesTitle: string
  sessionTitle: string
  speakerName: string | null
  artworkUrl: string | null
  sessionNumber: number | null
  durationSeconds: number | null
  playedAt: string
  completed: boolean
}

export type LectureSavedEntry = {
  seriesId: string
  seriesTitle: string
  speakerName: string | null
  artworkUrl: string | null
  categorySlug: string | null
  savedAt: string
}

const listeners = new Set<() => void>()

export type LectureLocalSnapshot = {
  continueLearning: LectureProgressEntry[]
  recentlyPlayed: LectureHistoryEntry[]
  savedSeries: LectureSavedEntry[]
}

let cachedLocalSnapshot: LectureLocalSnapshot | null = null

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

function notifyLectureLocalState() {
  cachedLocalSnapshot = null
  listeners.forEach((listener) => listener())
}

export function subscribeLectureLocalState(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getLectureLocalSnapshot(): LectureLocalSnapshot {
  if (!cachedLocalSnapshot) {
    cachedLocalSnapshot = {
      continueLearning: listLectureContinueLearning(),
      recentlyPlayed: listLectureRecentlyPlayed(),
      savedSeries: listSavedLectureSeries(),
    }
  }
  return cachedLocalSnapshot
}

type LectureProgressStore = Record<string, LectureProgressEntry>

function normalizeProgressEntry(raw: unknown): LectureProgressEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const seriesId = typeof record.seriesId === 'string' ? record.seriesId.trim() : ''
  const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''
  const seriesTitle = typeof record.seriesTitle === 'string' ? record.seriesTitle.trim() : ''
  const sessionTitle = typeof record.sessionTitle === 'string' ? record.sessionTitle.trim() : ''
  if (!seriesId || !sessionId || !seriesTitle || !sessionTitle) return null

  return {
    seriesId,
    sessionId,
    seriesTitle,
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
    categorySlug: typeof record.categorySlug === 'string' ? record.categorySlug : null,
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

function normalizeHistoryEntry(raw: unknown): LectureHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const seriesId = typeof record.seriesId === 'string' ? record.seriesId.trim() : ''
  const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''
  const seriesTitle = typeof record.seriesTitle === 'string' ? record.seriesTitle.trim() : ''
  const sessionTitle = typeof record.sessionTitle === 'string' ? record.sessionTitle.trim() : ''
  if (!seriesId || !sessionId || !seriesTitle || !sessionTitle) return null

  return {
    seriesId,
    sessionId,
    seriesTitle,
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

function normalizeSavedEntry(raw: unknown): LectureSavedEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const seriesId = typeof record.seriesId === 'string' ? record.seriesId.trim() : ''
  const seriesTitle = typeof record.seriesTitle === 'string' ? record.seriesTitle.trim() : ''
  if (!seriesId || !seriesTitle) return null

  return {
    seriesId,
    seriesTitle,
    speakerName: typeof record.speakerName === 'string' ? record.speakerName : null,
    artworkUrl:
      typeof record.artworkUrl === 'string' && record.artworkUrl.startsWith('http')
        ? record.artworkUrl
        : null,
    categorySlug: typeof record.categorySlug === 'string' ? record.categorySlug : null,
    savedAt: typeof record.savedAt === 'string' ? record.savedAt : new Date().toISOString(),
  }
}

function readProgressStore(): LectureProgressStore {
  const raw = readJsonStore<unknown>(LECTURE_PROGRESS_STORAGE_KEY, {})
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const store: LectureProgressStore = {}
  for (const [, value] of Object.entries(raw)) {
    const entry = normalizeProgressEntry(value)
    if (entry) store[entry.seriesId] = entry
  }
  return store
}

function writeProgressStore(store: LectureProgressStore) {
  writeJsonStore(LECTURE_PROGRESS_STORAGE_KEY, store)
  notifyLectureLocalState()
}

function readHistoryStore(): LectureHistoryEntry[] {
  const raw = readJsonStore<unknown>(LECTURE_HISTORY_STORAGE_KEY, [])
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => normalizeHistoryEntry(entry))
    .filter((entry): entry is LectureHistoryEntry => Boolean(entry))
    .slice(0, LECTURE_MAX_HISTORY_ENTRIES)
}

function writeHistoryStore(entries: LectureHistoryEntry[]) {
  writeJsonStore(LECTURE_HISTORY_STORAGE_KEY, entries.slice(0, LECTURE_MAX_HISTORY_ENTRIES))
  notifyLectureLocalState()
}

function readSavedStore(): LectureSavedEntry[] {
  const raw = readJsonStore<unknown>(LECTURE_SAVED_STORAGE_KEY, [])
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => normalizeSavedEntry(entry))
    .filter((entry): entry is LectureSavedEntry => Boolean(entry))
    .slice(0, LECTURE_MAX_SAVED_ENTRIES)
}

function writeSavedStore(entries: LectureSavedEntry[]) {
  writeJsonStore(LECTURE_SAVED_STORAGE_KEY, entries.slice(0, LECTURE_MAX_SAVED_ENTRIES))
  notifyLectureLocalState()
}

export function buildLectureProgressEntryFromSong(
  song: ApiSong,
  positionSeconds: number,
  durationSeconds: number,
  completed = false,
  sessionNumber: number | null = null,
  sessionCount: number | null = null,
  categorySlug: string | null = null,
): LectureProgressEntry | null {
  if (!isLectureQueueSong(song)) return null
  const ids = parseLectureSongId(song.id)
  if (!ids) return null

  const now = new Date().toISOString()
  const safeDuration =
    durationSeconds > 0 ? durationSeconds : song.durationSeconds ?? null

  return {
    seriesId: ids.seriesId,
    sessionId: ids.sessionId,
    seriesTitle: song.album || 'Lecture course',
    sessionTitle: song.title,
    speakerName: song.artist || null,
    artworkUrl: song.artwork,
    sessionNumber,
    sessionCount,
    categorySlug: categorySlug ?? song.genre ?? null,
    positionSeconds: Math.max(0, positionSeconds),
    durationSeconds: safeDuration,
    lastPlayedAt: now,
    updatedAt: now,
    completed,
  }
}

export function upsertLectureProgress(entry: LectureProgressEntry) {
  const store = readProgressStore()
  store[entry.seriesId] = entry
  writeProgressStore(store)
}

export function removeLectureProgress(seriesId: string) {
  const store = readProgressStore()
  delete store[seriesId]
  writeProgressStore(store)
}

export function getLectureProgress(seriesId: string) {
  return readProgressStore()[seriesId] ?? null
}

export function getLectureSessionProgress(seriesId: string, sessionId: string) {
  const entry = getLectureProgress(seriesId)
  if (!entry || entry.sessionId !== sessionId) return null
  return entry
}

export function listLectureContinueLearning(limit = LECTURE_MAX_CONTINUE_ENTRIES) {
  return Object.values(readProgressStore())
    .filter((entry) =>
      shouldAppearInLectureContinueLearning(
        entry.positionSeconds,
        entry.durationSeconds,
        entry.completed,
      ),
    )
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit)
}

export function listLectureRecentlyPlayed(limit = LECTURE_MAX_RECENT_ENTRIES) {
  return readHistoryStore()
    .sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt))
    .slice(0, limit)
}

export function recordLectureHistory(entry: LectureHistoryEntry) {
  const existing = readHistoryStore().filter(
    (item) => !(item.seriesId === entry.seriesId && item.sessionId === entry.sessionId),
  )
  writeHistoryStore([entry, ...existing])
}

export function progressEntryToHistoryEntry(entry: LectureProgressEntry): LectureHistoryEntry {
  return {
    seriesId: entry.seriesId,
    sessionId: entry.sessionId,
    seriesTitle: entry.seriesTitle,
    sessionTitle: entry.sessionTitle,
    speakerName: entry.speakerName,
    artworkUrl: entry.artworkUrl,
    sessionNumber: entry.sessionNumber,
    durationSeconds: entry.durationSeconds,
    playedAt: entry.lastPlayedAt,
    completed: entry.completed,
  }
}

export function toggleSavedLectureSeries(entry: LectureSavedEntry) {
  const existing = readSavedStore()
  const index = existing.findIndex((item) => item.seriesId === entry.seriesId)
  if (index >= 0) {
    writeSavedStore(existing.filter((item) => item.seriesId !== entry.seriesId))
    return false
  }
  writeSavedStore([entry, ...existing])
  return true
}

export function isLectureSeriesSaved(seriesId: string) {
  return readSavedStore().some((item) => item.seriesId === seriesId)
}

export function listSavedLectureSeries(limit = LECTURE_MAX_SAVED_ENTRIES) {
  return readSavedStore()
    .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
    .slice(0, limit)
}

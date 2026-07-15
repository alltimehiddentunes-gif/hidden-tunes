import type { ApiSong } from '../api'
import {
  isAudiobookQueueSong,
  parseAudiobookSongId,
} from './audiobookPlaybackAdapter'

export const AUDIOBOOK_PROGRESS_STORAGE_KEY = 'audiobook-progress'
export const AUDIOBOOK_HISTORY_STORAGE_KEY = 'audiobook-history'

export const AUDIOBOOK_PROGRESS_THROTTLE_MS = 12_000
export const AUDIOBOOK_MIN_CONTINUE_SECONDS = 30
export const AUDIOBOOK_COMPLETION_RATIO = 0.95
export const AUDIOBOOK_COMPLETION_TAIL_SECONDS = 30
export const AUDIOBOOK_PREVIOUS_RESTART_SECONDS = 8
export const AUDIOBOOK_MAX_HISTORY_ENTRIES = 75
export const AUDIOBOOK_MAX_CONTINUE_ENTRIES = 8
export const AUDIOBOOK_MAX_RECENT_ENTRIES = 12

export function isAudiobookChapterCompleted(
  positionSeconds: number,
  durationSeconds: number | null,
) {
  if (!Number.isFinite(positionSeconds) || positionSeconds <= 0) return false
  if (!durationSeconds || durationSeconds <= 0) return false
  const remaining = durationSeconds - positionSeconds
  return positionSeconds / durationSeconds >= AUDIOBOOK_COMPLETION_RATIO
    || remaining <= AUDIOBOOK_COMPLETION_TAIL_SECONDS
}

export function shouldAppearInAudiobookContinueListening(
  positionSeconds: number,
  durationSeconds: number | null,
  completed: boolean,
) {
  if (completed) return false
  if (positionSeconds < AUDIOBOOK_MIN_CONTINUE_SECONDS) return false
  if (durationSeconds && durationSeconds > 0) {
    return !isAudiobookChapterCompleted(positionSeconds, durationSeconds)
  }
  return true
}

export type AudiobookProgressEntry = {
  bookId: string
  chapterId: string
  bookTitle: string
  chapterTitle: string
  authorName: string | null
  narratorName: string | null
  artworkUrl: string | null
  chapterNumber: number | null
  chapterCount: number | null
  positionSeconds: number
  durationSeconds: number | null
  lastPlayedAt: string
  updatedAt: string
  completed: boolean
}

export type AudiobookHistoryEntry = {
  bookId: string
  chapterId: string
  bookTitle: string
  chapterTitle: string
  authorName: string | null
  artworkUrl: string | null
  chapterNumber: number | null
  durationSeconds: number | null
  playedAt: string
  completed: boolean
}

const listeners = new Set<() => void>()

export type AudiobookLocalSnapshot = {
  continueListening: AudiobookProgressEntry[]
  recentlyPlayed: AudiobookHistoryEntry[]
}

let cachedLocalSnapshot: AudiobookLocalSnapshot | null = null

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

function notifyAudiobookLocalState() {
  cachedLocalSnapshot = null
  listeners.forEach((listener) => listener())
}

export function subscribeAudiobookLocalState(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getAudiobookLocalSnapshot(): AudiobookLocalSnapshot {
  if (!cachedLocalSnapshot) {
    cachedLocalSnapshot = {
      continueListening: listAudiobookContinueListening(),
      recentlyPlayed: listAudiobookRecentlyPlayed(),
    }
  }
  return cachedLocalSnapshot
}

type AudiobookProgressStore = Record<string, AudiobookProgressEntry>

function normalizeProgressEntry(raw: unknown): AudiobookProgressEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const bookId = typeof record.bookId === 'string' ? record.bookId.trim() : ''
  const chapterId = typeof record.chapterId === 'string' ? record.chapterId.trim() : ''
  const bookTitle = typeof record.bookTitle === 'string' ? record.bookTitle.trim() : ''
  const chapterTitle = typeof record.chapterTitle === 'string' ? record.chapterTitle.trim() : ''
  if (!bookId || !chapterId || !bookTitle || !chapterTitle) return null

  return {
    bookId,
    chapterId,
    bookTitle,
    chapterTitle,
    authorName: typeof record.authorName === 'string' ? record.authorName : null,
    narratorName: typeof record.narratorName === 'string' ? record.narratorName : null,
    artworkUrl:
      typeof record.artworkUrl === 'string' && record.artworkUrl.startsWith('http')
        ? record.artworkUrl
        : null,
    chapterNumber: Number.isFinite(Number(record.chapterNumber))
      ? Number(record.chapterNumber)
      : null,
    chapterCount: Number.isFinite(Number(record.chapterCount))
      ? Number(record.chapterCount)
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

function normalizeHistoryEntry(raw: unknown): AudiobookHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const bookId = typeof record.bookId === 'string' ? record.bookId.trim() : ''
  const chapterId = typeof record.chapterId === 'string' ? record.chapterId.trim() : ''
  const bookTitle = typeof record.bookTitle === 'string' ? record.bookTitle.trim() : ''
  const chapterTitle = typeof record.chapterTitle === 'string' ? record.chapterTitle.trim() : ''
  if (!bookId || !chapterId || !bookTitle || !chapterTitle) return null

  return {
    bookId,
    chapterId,
    bookTitle,
    chapterTitle,
    authorName: typeof record.authorName === 'string' ? record.authorName : null,
    artworkUrl:
      typeof record.artworkUrl === 'string' && record.artworkUrl.startsWith('http')
        ? record.artworkUrl
        : null,
    chapterNumber: Number.isFinite(Number(record.chapterNumber))
      ? Number(record.chapterNumber)
      : null,
    durationSeconds: Number.isFinite(Number(record.durationSeconds))
      ? Math.max(0, Number(record.durationSeconds))
      : null,
    playedAt: typeof record.playedAt === 'string' ? record.playedAt : new Date().toISOString(),
    completed: record.completed === true,
  }
}

function readProgressStore(): AudiobookProgressStore {
  const raw = readJsonStore<unknown>(AUDIOBOOK_PROGRESS_STORAGE_KEY, {})
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const store: AudiobookProgressStore = {}
  for (const [key, value] of Object.entries(raw)) {
    const entry = normalizeProgressEntry(value)
    if (entry) store[key] = entry
  }
  return store
}

function writeProgressStore(store: AudiobookProgressStore) {
  writeJsonStore(AUDIOBOOK_PROGRESS_STORAGE_KEY, store)
  notifyAudiobookLocalState()
}

function readHistoryStore(): AudiobookHistoryEntry[] {
  const raw = readJsonStore<unknown>(AUDIOBOOK_HISTORY_STORAGE_KEY, [])
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => normalizeHistoryEntry(entry))
    .filter((entry): entry is AudiobookHistoryEntry => Boolean(entry))
    .slice(0, AUDIOBOOK_MAX_HISTORY_ENTRIES)
}

function writeHistoryStore(entries: AudiobookHistoryEntry[]) {
  writeJsonStore(AUDIOBOOK_HISTORY_STORAGE_KEY, entries.slice(0, AUDIOBOOK_MAX_HISTORY_ENTRIES))
  notifyAudiobookLocalState()
}

function extractNarratorFromSong(song: ApiSong): string | null {
  const tag = song.tags.find((entry) => entry.startsWith('narrator:'))
  if (!tag) return null
  return tag.slice('narrator:'.length).trim() || null
}

export function buildAudiobookProgressEntryFromSong(
  song: ApiSong,
  positionSeconds: number,
  durationSeconds: number,
  completed = false,
  chapterNumber: number | null = null,
  chapterCount: number | null = null,
): AudiobookProgressEntry | null {
  if (!isAudiobookQueueSong(song)) return null
  const ids = parseAudiobookSongId(song.id)
  if (!ids) return null

  const now = new Date().toISOString()
  const safeDuration =
    durationSeconds > 0 ? durationSeconds : song.durationSeconds ?? null

  return {
    bookId: ids.bookId,
    chapterId: ids.chapterId,
    bookTitle: song.album || 'Audiobook',
    chapterTitle: song.title,
    authorName: song.artist || null,
    narratorName: extractNarratorFromSong(song),
    artworkUrl: song.artwork,
    chapterNumber,
    chapterCount,
    positionSeconds: Math.max(0, positionSeconds),
    durationSeconds: safeDuration,
    lastPlayedAt: now,
    updatedAt: now,
    completed,
  }
}

export function upsertAudiobookProgress(entry: AudiobookProgressEntry) {
  const store = readProgressStore()
  store[entry.bookId] = entry
  writeProgressStore(store)
}

export function removeAudiobookProgress(bookId: string) {
  const store = readProgressStore()
  delete store[bookId]
  writeProgressStore(store)
}

export function getAudiobookProgress(bookId: string) {
  return readProgressStore()[bookId] ?? null
}

export function getAudiobookChapterProgress(bookId: string, chapterId: string) {
  const entry = getAudiobookProgress(bookId)
  if (!entry || entry.chapterId !== chapterId) return null
  return entry
}

export function listAudiobookContinueListening(limit = AUDIOBOOK_MAX_CONTINUE_ENTRIES) {
  return Object.values(readProgressStore())
    .filter((entry) =>
      shouldAppearInAudiobookContinueListening(
        entry.positionSeconds,
        entry.durationSeconds,
        entry.completed,
      ),
    )
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit)
}

export function listAudiobookRecentlyPlayed(limit = AUDIOBOOK_MAX_RECENT_ENTRIES) {
  return readHistoryStore()
    .sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt))
    .slice(0, limit)
}

export function recordAudiobookHistory(entry: AudiobookHistoryEntry) {
  const existing = readHistoryStore().filter(
    (item) => !(item.bookId === entry.bookId && item.chapterId === entry.chapterId),
  )
  writeHistoryStore([entry, ...existing])
}

export function progressEntryToHistoryEntry(entry: AudiobookProgressEntry): AudiobookHistoryEntry {
  return {
    bookId: entry.bookId,
    chapterId: entry.chapterId,
    bookTitle: entry.bookTitle,
    chapterTitle: entry.chapterTitle,
    authorName: entry.authorName,
    artworkUrl: entry.artworkUrl,
    chapterNumber: entry.chapterNumber,
    durationSeconds: entry.durationSeconds,
    playedAt: entry.lastPlayedAt,
    completed: entry.completed,
  }
}

import type { ApiSong } from '../api'
import {
  extractPodcastEpisodeId,
  isPodcastQueueSong,
} from './podcastPlaybackAdapter'

export const PODCAST_PROGRESS_STORAGE_KEY = 'podcast-progress'
export const PODCAST_HISTORY_STORAGE_KEY = 'podcast-history'

export const PODCAST_PROGRESS_THROTTLE_MS = 12_000
export const PODCAST_MIN_CONTINUE_SECONDS = 30
export const PODCAST_COMPLETION_RATIO = 0.95
export const PODCAST_COMPLETION_TAIL_SECONDS = 30
export const PODCAST_MAX_HISTORY_ENTRIES = 75
export const PODCAST_MAX_CONTINUE_ENTRIES = 8
export const PODCAST_MAX_RECENT_ENTRIES = 12

/**
 * Completion rule: mark complete when at least 95% played or within the final 30 seconds.
 */
export function isPodcastEpisodeCompleted(
  positionSeconds: number,
  durationSeconds: number | null,
) {
  if (!Number.isFinite(positionSeconds) || positionSeconds <= 0) return false
  if (!durationSeconds || durationSeconds <= 0) return false
  const remaining = durationSeconds - positionSeconds
  return positionSeconds / durationSeconds >= PODCAST_COMPLETION_RATIO
    || remaining <= PODCAST_COMPLETION_TAIL_SECONDS
}

export function shouldAppearInContinueListening(
  positionSeconds: number,
  durationSeconds: number | null,
  completed: boolean,
) {
  if (completed) return false
  if (positionSeconds < PODCAST_MIN_CONTINUE_SECONDS) return false
  if (durationSeconds && durationSeconds > 0) {
    return !isPodcastEpisodeCompleted(positionSeconds, durationSeconds)
  }
  return true
}

export type PodcastProgressEntry = {
  episodeId: string
  showId: string
  episodeTitle: string
  showTitle: string
  artworkUrl: string | null
  positionSeconds: number
  durationSeconds: number | null
  publishedAt: string | null
  episodeNumber: number | null
  seasonNumber: number | null
  lastPlayedAt: string
  updatedAt: string
  completed: boolean
}

export type PodcastHistoryEntry = {
  episodeId: string
  showId: string
  episodeTitle: string
  showTitle: string
  artworkUrl: string | null
  durationSeconds: number | null
  publishedAt: string | null
  episodeNumber: number | null
  seasonNumber: number | null
  playedAt: string
  completed: boolean
}

const listeners = new Set<() => void>()

export function subscribePodcastLocalState(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notifyPodcastLocalState() {
  listeners.forEach((listener) => listener())
}

type PodcastProgressStore = Record<string, PodcastProgressEntry>

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

function normalizeProgressEntry(raw: unknown): PodcastProgressEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const episodeId = typeof record.episodeId === 'string' ? record.episodeId.trim() : ''
  const showId = typeof record.showId === 'string' ? record.showId.trim() : ''
  const episodeTitle = typeof record.episodeTitle === 'string' ? record.episodeTitle.trim() : ''
  const showTitle = typeof record.showTitle === 'string' ? record.showTitle.trim() : ''
  if (!episodeId || !episodeTitle) return null

  const positionSeconds = Number.isFinite(Number(record.positionSeconds))
    ? Math.max(0, Number(record.positionSeconds))
    : 0
  const durationSeconds = Number.isFinite(Number(record.durationSeconds))
    ? Math.max(0, Number(record.durationSeconds))
    : null

  return {
    episodeId,
    showId,
    episodeTitle,
    showTitle: showTitle || 'Podcast',
    artworkUrl:
      typeof record.artworkUrl === 'string' && record.artworkUrl.startsWith('http')
        ? record.artworkUrl
        : null,
    positionSeconds,
    durationSeconds,
    publishedAt: typeof record.publishedAt === 'string' ? record.publishedAt : null,
    episodeNumber: Number.isFinite(Number(record.episodeNumber))
      ? Number(record.episodeNumber)
      : null,
    seasonNumber: Number.isFinite(Number(record.seasonNumber))
      ? Number(record.seasonNumber)
      : null,
    lastPlayedAt:
      typeof record.lastPlayedAt === 'string' ? record.lastPlayedAt : new Date().toISOString(),
    updatedAt:
      typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
    completed: record.completed === true,
  }
}

function normalizeHistoryEntry(raw: unknown): PodcastHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const episodeId = typeof record.episodeId === 'string' ? record.episodeId.trim() : ''
  const episodeTitle = typeof record.episodeTitle === 'string' ? record.episodeTitle.trim() : ''
  if (!episodeId || !episodeTitle) return null

  return {
    episodeId,
    showId: typeof record.showId === 'string' ? record.showId.trim() : '',
    episodeTitle,
    showTitle:
      typeof record.showTitle === 'string' && record.showTitle.trim()
        ? record.showTitle.trim()
        : 'Podcast',
    artworkUrl:
      typeof record.artworkUrl === 'string' && record.artworkUrl.startsWith('http')
        ? record.artworkUrl
        : null,
    durationSeconds: Number.isFinite(Number(record.durationSeconds))
      ? Math.max(0, Number(record.durationSeconds))
      : null,
    publishedAt: typeof record.publishedAt === 'string' ? record.publishedAt : null,
    episodeNumber: Number.isFinite(Number(record.episodeNumber))
      ? Number(record.episodeNumber)
      : null,
    seasonNumber: Number.isFinite(Number(record.seasonNumber))
      ? Number(record.seasonNumber)
      : null,
    playedAt: typeof record.playedAt === 'string' ? record.playedAt : new Date().toISOString(),
    completed: record.completed === true,
  }
}

export function readPodcastProgressStore(): PodcastProgressStore {
  const raw = readJsonStore<unknown>(PODCAST_PROGRESS_STORAGE_KEY, {})
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const store: PodcastProgressStore = {}
  for (const [key, value] of Object.entries(raw)) {
    const entry = normalizeProgressEntry(value)
    if (entry) store[key] = entry
  }
  return store
}

function writePodcastProgressStore(store: PodcastProgressStore) {
  writeJsonStore(PODCAST_PROGRESS_STORAGE_KEY, store)
  notifyPodcastLocalState()
}

export function readPodcastHistoryStore(): PodcastHistoryEntry[] {
  const raw = readJsonStore<unknown>(PODCAST_HISTORY_STORAGE_KEY, [])
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => normalizeHistoryEntry(entry))
    .filter((entry): entry is PodcastHistoryEntry => Boolean(entry))
    .slice(0, PODCAST_MAX_HISTORY_ENTRIES)
}

function writePodcastHistoryStore(entries: PodcastHistoryEntry[]) {
  writeJsonStore(
    PODCAST_HISTORY_STORAGE_KEY,
    entries.slice(0, PODCAST_MAX_HISTORY_ENTRIES),
  )
  notifyPodcastLocalState()
}

export function buildPodcastProgressEntryFromSong(
  song: ApiSong,
  positionSeconds: number,
  durationSeconds: number,
  completed = false,
): PodcastProgressEntry | null {
  if (!isPodcastQueueSong(song)) return null
  const episodeId = extractPodcastEpisodeId(song.id)
  if (!episodeId) return null

  const now = new Date().toISOString()
  const safeDuration =
    durationSeconds > 0 ? durationSeconds : song.durationSeconds ?? null

  return {
    episodeId,
    showId: song.albumId ?? '',
    episodeTitle: song.title,
    showTitle: song.artist || song.album || 'Podcast',
    artworkUrl: song.artwork,
    positionSeconds: Math.max(0, positionSeconds),
    durationSeconds: safeDuration,
    publishedAt: song.createdAt,
    episodeNumber: null,
    seasonNumber: null,
    lastPlayedAt: now,
    updatedAt: now,
    completed,
  }
}

export function upsertPodcastProgress(entry: PodcastProgressEntry) {
  const store = readPodcastProgressStore()
  store[entry.episodeId] = entry
  writePodcastProgressStore(store)
}

export function removePodcastProgress(episodeId: string) {
  const store = readPodcastProgressStore()
  delete store[episodeId]
  writePodcastProgressStore(store)
}

export function getPodcastProgress(episodeId: string) {
  return readPodcastProgressStore()[episodeId] ?? null
}

export function listPodcastContinueListening(limit = PODCAST_MAX_CONTINUE_ENTRIES) {
  return Object.values(readPodcastProgressStore())
    .filter((entry) =>
      shouldAppearInContinueListening(
        entry.positionSeconds,
        entry.durationSeconds,
        entry.completed,
      ),
    )
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit)
}

export function listPodcastRecentlyPlayed(limit = PODCAST_MAX_RECENT_ENTRIES) {
  return readPodcastHistoryStore()
    .sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt))
    .slice(0, limit)
}

export function listPodcastProgressForShow(showId: string) {
  const cleanId = showId.trim()
  if (!cleanId) return []
  return Object.values(readPodcastProgressStore())
    .filter(
      (entry) =>
        entry.showId === cleanId
        && shouldAppearInContinueListening(
          entry.positionSeconds,
          entry.durationSeconds,
          entry.completed,
        ),
    )
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}

export function recordPodcastHistory(entry: PodcastHistoryEntry) {
  const history = readPodcastHistoryStore().filter(
    (item) => item.episodeId !== entry.episodeId,
  )
  history.unshift(entry)
  writePodcastHistoryStore(history)
}

export function progressEntryToEpisodeMeta(
  entry: PodcastProgressEntry,
): import('./types').PodcastEpisodeMeta {
  return {
    id: entry.episodeId,
    showId: entry.showId,
    showTitle: entry.showTitle,
    title: entry.episodeTitle,
    description: null,
    artworkUrl: entry.artworkUrl,
    durationSeconds: entry.durationSeconds,
    publishedAt: entry.publishedAt,
    episodeNumber: entry.episodeNumber,
    seasonNumber: entry.seasonNumber,
    isVerified: true,
    lastCheckedAt: null,
  }
}

export function historyEntryToEpisodeMeta(
  entry: PodcastHistoryEntry,
): import('./types').PodcastEpisodeMeta {
  return {
    id: entry.episodeId,
    showId: entry.showId,
    showTitle: entry.showTitle,
    title: entry.episodeTitle,
    description: null,
    artworkUrl: entry.artworkUrl,
    durationSeconds: entry.durationSeconds,
    publishedAt: entry.publishedAt,
    episodeNumber: entry.episodeNumber,
    seasonNumber: entry.seasonNumber,
    isVerified: true,
    lastCheckedAt: null,
  }
}

export function progressEntryToHistoryEntry(
  entry: PodcastProgressEntry,
): PodcastHistoryEntry {
  return {
    episodeId: entry.episodeId,
    showId: entry.showId,
    episodeTitle: entry.episodeTitle,
    showTitle: entry.showTitle,
    artworkUrl: entry.artworkUrl,
    durationSeconds: entry.durationSeconds,
    publishedAt: entry.publishedAt,
    episodeNumber: entry.episodeNumber,
    seasonNumber: entry.seasonNumber,
    playedAt: entry.lastPlayedAt,
    completed: entry.completed,
  }
}

import type {
  DesktopPlaylist,
  DesktopPlaylistItem,
  PlaylistsStoreV1,
  PlaylistItemType,
} from './types'
import {
  PLAYLISTS_SCHEMA_VERSION,
  PLAYLISTS_STORAGE_KEY,
  isPlaylistItemType,
  playlistItemKey,
} from './types'

const listeners = new Set<() => void>()
let cachedStore: PlaylistsStoreV1 | null = null

function nowIso() {
  return new Date().toISOString()
}

function readRaw(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(PLAYLISTS_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeRaw(value: string) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(PLAYLISTS_STORAGE_KEY, value)
  } catch {
    // quota / private mode
  }
}

export function normalizePlaylistItem(raw: unknown): DesktopPlaylistItem | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  const type = row.type
  if (!id || !title || !isPlaylistItemType(type)) return null

  const base = {
    id,
    type,
    title,
    addedAt:
      typeof row.addedAt === 'string' && Number.isFinite(Date.parse(row.addedAt))
        ? row.addedAt
        : nowIso(),
    subtitle: typeof row.subtitle === 'string' ? row.subtitle : null,
    artwork: typeof row.artwork === 'string' ? row.artwork : null,
    duration: typeof row.duration === 'number' ? row.duration : null,
    parentId: typeof row.parentId === 'string' ? row.parentId : null,
    metadata: row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : null,
  }

  switch (type) {
    case 'song':
      return {
        ...base,
        type: 'song',
        artist: typeof row.artist === 'string' ? row.artist : null,
        album: typeof row.album === 'string' ? row.album : null,
      }
    case 'podcast_episode':
      return {
        ...base,
        type: 'podcast_episode',
        showId: typeof row.showId === 'string' ? row.showId : base.parentId,
        showTitle: typeof row.showTitle === 'string' ? row.showTitle : base.subtitle,
      }
    case 'motivational':
      return {
        ...base,
        type: 'motivational',
        programId: typeof row.programId === 'string' ? row.programId : base.parentId,
      }
    case 'lecture':
      return {
        ...base,
        type: 'lecture',
        seriesId: typeof row.seriesId === 'string' ? row.seriesId : base.parentId,
      }
    case 'audiobook_chapter':
      return {
        ...base,
        type: 'audiobook_chapter',
        bookId: typeof row.bookId === 'string' ? row.bookId : base.parentId,
        chapterId: typeof row.chapterId === 'string' ? row.chapterId : id,
        bookTitle: typeof row.bookTitle === 'string' ? row.bookTitle : base.subtitle,
      }
    default:
      return null
  }
}

export function normalizePlaylist(raw: unknown): DesktopPlaylist | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  if (!id || !title) return null
  const itemsRaw = Array.isArray(row.items) ? row.items : []
  const items: DesktopPlaylistItem[] = []
  const seen = new Set<string>()
  for (const entry of itemsRaw) {
    const item = normalizePlaylistItem(entry)
    if (!item) continue
    const key = playlistItemKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    items.push(item)
  }
  return {
    id,
    title,
    description: typeof row.description === 'string' ? row.description : null,
    createdAt:
      typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt))
        ? row.createdAt
        : nowIso(),
    updatedAt:
      typeof row.updatedAt === 'string' && Number.isFinite(Date.parse(row.updatedAt))
        ? row.updatedAt
        : nowIso(),
    items,
  }
}

export function parsePlaylistsStore(raw: unknown): PlaylistsStoreV1 | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (row.version !== PLAYLISTS_SCHEMA_VERSION || !Array.isArray(row.playlists)) return null
  const playlists = row.playlists.map(normalizePlaylist).filter(Boolean) as DesktopPlaylist[]
  return {
    version: PLAYLISTS_SCHEMA_VERSION,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : nowIso(),
    playlists,
  }
}

function emptyStore(): PlaylistsStoreV1 {
  return {
    version: PLAYLISTS_SCHEMA_VERSION,
    updatedAt: nowIso(),
    playlists: [],
  }
}

function readStore(): PlaylistsStoreV1 {
  const raw = readRaw()
  if (!raw) return emptyStore()
  try {
    const parsed = parsePlaylistsStore(JSON.parse(raw))
    return parsed ?? emptyStore()
  } catch {
    return emptyStore()
  }
}

function persist(store: PlaylistsStoreV1) {
  const next: PlaylistsStoreV1 = {
    version: PLAYLISTS_SCHEMA_VERSION,
    updatedAt: nowIso(),
    playlists: store.playlists,
  }
  writeRaw(JSON.stringify(next))
  cachedStore = next
  for (const listener of listeners) listener()
}

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function getPlaylistsStore(): PlaylistsStoreV1 {
  if (!cachedStore) cachedStore = readStore()
  return cachedStore
}

export function subscribeDesktopPlaylists(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function listPlaylists(): DesktopPlaylist[] {
  return getPlaylistsStore().playlists.slice()
}

export function getPlaylist(playlistId: string): DesktopPlaylist | null {
  return getPlaylistsStore().playlists.find((entry) => entry.id === playlistId) ?? null
}

export function createPlaylist(title: string, description?: string | null): DesktopPlaylist {
  const store = readStore()
  const trimmed = title.trim() || 'New playlist'
  const playlist: DesktopPlaylist = {
    id: newId('pl'),
    title: trimmed,
    description: description?.trim() || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    items: [],
  }
  persist({ ...store, playlists: [playlist, ...store.playlists] })
  return playlist
}

export function createPlaylistWithItems(
  title: string,
  description: string | null | undefined,
  items: DesktopPlaylistItem[],
): { playlist: DesktopPlaylist; added: number; invalid: number; duplicates: number } | null {
  const trimmed = title.trim()
  if (!trimmed) return null
  const normalized: DesktopPlaylistItem[] = []
  const seen = new Set<string>()
  let invalid = 0
  let duplicates = 0
  for (const raw of items) {
    const item = normalizePlaylistItem(raw)
    if (!item) { invalid += 1; continue }
    const key = playlistItemKey(item)
    if (seen.has(key)) { duplicates += 1; continue }
    seen.add(key)
    normalized.push(item)
  }
  if (normalized.length === 0) return null
  const store = readStore()
  const playlist: DesktopPlaylist = {
    id: newId('pl'), title: trimmed, description: description?.trim() || null,
    createdAt: nowIso(), updatedAt: nowIso(), items: normalized,
  }
  persist({ ...store, playlists: [playlist, ...store.playlists] })
  return { playlist, added: normalized.length, invalid, duplicates }
}

export function renamePlaylist(playlistId: string, title: string): DesktopPlaylist | null {
  const store = readStore()
  const trimmed = title.trim()
  if (!trimmed) return null
  let updated: DesktopPlaylist | null = null
  const playlists = store.playlists.map((entry) => {
    if (entry.id !== playlistId) return entry
    updated = { ...entry, title: trimmed, updatedAt: nowIso() }
    return updated
  })
  if (!updated) return null
  persist({ ...store, playlists })
  return updated
}

export function deletePlaylist(playlistId: string): boolean {
  const store = readStore()
  const next = store.playlists.filter((entry) => entry.id !== playlistId)
  if (next.length === store.playlists.length) return false
  persist({ ...store, playlists: next })
  return true
}

export function addItemToPlaylist(
  playlistId: string,
  item: DesktopPlaylistItem,
): { ok: boolean; duplicate?: boolean; playlist?: DesktopPlaylist } {
  const normalized = normalizePlaylistItem(item)
  if (!normalized) return { ok: false }
  const store = readStore()
  const index = store.playlists.findIndex((entry) => entry.id === playlistId)
  if (index < 0) return { ok: false }
  const playlist = store.playlists[index]
  const key = playlistItemKey(normalized)
  if (playlist.items.some((entry) => playlistItemKey(entry) === key)) {
    return { ok: true, duplicate: true, playlist }
  }
  const updated: DesktopPlaylist = {
    ...playlist,
    updatedAt: nowIso(),
    items: [...playlist.items, normalized],
  }
  const playlists = store.playlists.slice()
  playlists[index] = updated
  persist({ ...store, playlists })
  return { ok: true, playlist: updated }
}

export type AddPlaylistItemsResult = {
  ok: boolean
  added: number
  duplicates: number
  invalid: number
  playlist?: DesktopPlaylist
}

/** Add a selection in one canonical write while preserving input order. */
export function addItemsToPlaylist(
  playlistId: string,
  items: DesktopPlaylistItem[],
): AddPlaylistItemsResult {
  const store = readStore()
  const index = store.playlists.findIndex((entry) => entry.id === playlistId)
  if (index < 0) return { ok: false, added: 0, duplicates: 0, invalid: items.length }
  const playlist = store.playlists[index]
  const seen = new Set(playlist.items.map(playlistItemKey))
  const additions: DesktopPlaylistItem[] = []
  let duplicates = 0
  let invalid = 0
  for (const raw of items) {
    const item = normalizePlaylistItem(raw)
    if (!item) {
      invalid += 1
      continue
    }
    const key = playlistItemKey(item)
    if (seen.has(key)) {
      duplicates += 1
      continue
    }
    seen.add(key)
    additions.push(item)
  }
  if (additions.length === 0) {
    return { ok: true, added: 0, duplicates, invalid, playlist }
  }
  const updated: DesktopPlaylist = {
    ...playlist,
    updatedAt: nowIso(),
    items: [...playlist.items, ...additions],
  }
  const playlists = store.playlists.slice()
  playlists[index] = updated
  persist({ ...store, playlists })
  return { ok: true, added: additions.length, duplicates, invalid, playlist: updated }
}

export function removeItemFromPlaylist(
  playlistId: string,
  type: PlaylistItemType,
  id: string,
): DesktopPlaylist | null {
  const store = readStore()
  const index = store.playlists.findIndex((entry) => entry.id === playlistId)
  if (index < 0) return null
  const playlist = store.playlists[index]
  const key = `${type}:${id.trim()}`
  const items = playlist.items.filter((entry) => playlistItemKey(entry) !== key)
  if (items.length === playlist.items.length) return playlist
  const updated: DesktopPlaylist = { ...playlist, items, updatedAt: nowIso() }
  const playlists = store.playlists.slice()
  playlists[index] = updated
  persist({ ...store, playlists })
  return updated
}

export function reorderPlaylistItems(
  playlistId: string,
  fromIndex: number,
  toIndex: number,
): DesktopPlaylist | null {
  const store = readStore()
  const index = store.playlists.findIndex((entry) => entry.id === playlistId)
  if (index < 0) return null
  const playlist = store.playlists[index]
  if (
    fromIndex < 0
    || toIndex < 0
    || fromIndex >= playlist.items.length
    || toIndex >= playlist.items.length
    || fromIndex === toIndex
  ) {
    return playlist
  }
  const items = playlist.items.slice()
  const [moved] = items.splice(fromIndex, 1)
  items.splice(toIndex, 0, moved)
  const updated: DesktopPlaylist = { ...playlist, items, updatedAt: nowIso() }
  const playlists = store.playlists.slice()
  playlists[index] = updated
  persist({ ...store, playlists })
  return updated
}

/** Test helper — wipe cache after harness mutates localStorage. */
export function __resetPlaylistsCacheForTests() {
  cachedStore = null
}

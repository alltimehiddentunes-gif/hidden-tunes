import type { ApiSong } from '../api'
import {
  apiSongToQueueItem,
  inferQueueItemType,
  queueItemToApiSong,
} from './family'
import { loadQueueStore, saveQueueStore } from './persistence'
import { QUEUE_MAX_ITEMS, QUEUE_STORAGE_KEY, type QueueStoreV1 } from './types'

/** True when the song belongs in the typed audio queue (not TV/Sports). */
export function isPersistableQueueSong(song: ApiSong | null | undefined): boolean {
  return inferQueueItemType(song) != null
}

export function songsToQueueItems(songs: ApiSong[]) {
  const items = []
  for (const song of songs) {
    const item = apiSongToQueueItem(song)
    if (item) items.push(item)
  }
  return items
}

export function storeToApiSongs(store: QueueStoreV1): ApiSong[] {
  return store.items.map((item) => queueItemToApiSong(item))
}

export function findSongIndexById(queue: ApiSong[], songId: string): number {
  const clean = songId.trim()
  if (!clean) return -1
  return queue.findIndex((entry) => entry.id === clean)
}

/**
 * Explicit enqueue — skips when same song.id exists unless allowDuplicate.
 * (Typed identity policy is enforced when converting through DesktopQueueItem ops.)
 */
export function enqueueSong(
  queue: ApiSong[],
  song: ApiSong,
  options?: { allowDuplicate?: boolean },
): { queue: ApiSong[]; added: boolean; index: number } {
  if (!options?.allowDuplicate) {
    const existing = findSongIndexById(queue, song.id)
    if (existing >= 0) {
      return { queue, added: false, index: existing }
    }
  }
  if (queue.length >= QUEUE_MAX_ITEMS) {
    return { queue, added: false, index: -1 }
  }
  return { queue: [...queue, song], added: true, index: queue.length }
}

export function insertPlayNext(
  queue: ApiSong[],
  activeIndex: number,
  song: ApiSong,
  options?: { allowDuplicate?: boolean },
): { queue: ApiSong[]; added: boolean; index: number } {
  if (!options?.allowDuplicate) {
    const existing = findSongIndexById(queue, song.id)
    if (existing >= 0) {
      return { queue, added: false, index: existing }
    }
  }
  if (queue.length >= QUEUE_MAX_ITEMS) {
    return { queue, added: false, index: -1 }
  }
  const insertAt = activeIndex >= 0 ? Math.min(activeIndex + 1, queue.length) : queue.length
  const next = [...queue.slice(0, insertAt), song, ...queue.slice(insertAt)]
  return { queue: next, added: true, index: insertAt }
}

/**
 * Active removal policy:
 * When removing active item: promote next item as active index
 * (do not auto-play — caller plays). If no next, set activeIndex=-1.
 */
export function removeAtIndex(
  queue: ApiSong[],
  activeIndex: number,
  removeIndex: number,
): { queue: ApiSong[]; activeIndex: number; removedActive: boolean } {
  if (removeIndex < 0 || removeIndex >= queue.length) {
    return { queue, activeIndex, removedActive: false }
  }
  const removedActive = removeIndex === activeIndex
  const next = queue.filter((_, index) => index !== removeIndex)
  let nextActive = activeIndex
  if (next.length === 0) {
    nextActive = -1
  } else if (removeIndex < activeIndex) {
    nextActive = activeIndex - 1
  } else if (removedActive) {
    // Promote following item (same index after removal), or clear if none.
    nextActive = removeIndex < next.length ? removeIndex : -1
  }
  return { queue: next, activeIndex: nextActive, removedActive }
}

export function moveIndex(
  queue: ApiSong[],
  activeIndex: number,
  from: number,
  to: number,
): { queue: ApiSong[]; activeIndex: number } {
  if (from < 0 || from >= queue.length || to < 0 || to >= queue.length || from === to) {
    return { queue, activeIndex }
  }
  const next = [...queue]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  let nextActive = activeIndex
  if (activeIndex === from) nextActive = to
  else if (from < activeIndex && to >= activeIndex) nextActive = activeIndex - 1
  else if (from > activeIndex && to <= activeIndex) nextActive = activeIndex + 1
  return { queue: next, activeIndex: nextActive }
}

/** Persist ApiSong queue snapshot via typed store. Never writes an autoplay flag. */
export function persistQueueSnapshot(input: {
  songs: ApiSong[]
  activeIndex: number
  queueContext?: string | null
  queueTitle?: string | null
}): QueueStoreV1 {
  void input.queueContext
  void input.queueTitle
  const items = songsToQueueItems(input.songs).slice(0, QUEUE_MAX_ITEMS)
  const activeIndex =
    items.length === 0
      ? -1
      : input.activeIndex >= 0 && input.activeIndex < items.length
        ? input.activeIndex
        : -1
  const store: QueueStoreV1 = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items,
    activeIndex,
  }
  saveQueueStore(store)
  return store
}

export function clearPersistedQueue() {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(QUEUE_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Restore ApiSong[] from persistence.
 * NEVER autoplay — returns songs + activeIndex only; caller decides playback.
 */
export function restoreQueueSongs(): {
  songs: ApiSong[]
  activeIndex: number
  queueContext: string | null
  queueTitle: string | null
} | null {
  const store = loadQueueStore()
  if (!store.items.length) return null
  const songs = storeToApiSongs(store)
  if (songs.length === 0) return null
  return {
    songs,
    activeIndex: store.activeIndex,
    queueContext: null,
    queueTitle: null,
  }
}

export function loadPersistedQueue(): QueueStoreV1 | null {
  const store = loadQueueStore()
  return store.items.length === 0 ? null : store
}

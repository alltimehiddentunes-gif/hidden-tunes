import { findQueueIndexByTypedIdentity, newQueueId } from './identity'
import type { DesktopQueueItem, QueueState } from './types'
import { QUEUE_MAX_ITEMS } from './types'

export type EnqueueOptions = {
  /**
   * Explicit enqueue skips when the same typed identity (`type:id`) is already present,
   * unless `allowDuplicate` is true.
   */
  allowDuplicate?: boolean
}

function clampActiveIndex(items: DesktopQueueItem[], activeIndex: number): number {
  if (items.length === 0) return -1
  if (activeIndex < 0) return -1
  if (activeIndex >= items.length) return items.length - 1
  return activeIndex
}

function withCap(items: DesktopQueueItem[]): DesktopQueueItem[] {
  return items.length > QUEUE_MAX_ITEMS ? items.slice(0, QUEUE_MAX_ITEMS) : items
}

function ensureQueueId(item: DesktopQueueItem): DesktopQueueItem {
  if (item.queueId?.trim()) return item
  return { ...item, queueId: newQueueId() }
}

export function emptyQueueState(): QueueState {
  return { items: [], activeIndex: -1 }
}

/**
 * Append one item.
 * Duplicate policy: skips when typed identity already present unless allowDuplicate.
 */
export function enqueue(
  state: QueueState,
  item: DesktopQueueItem,
  options?: EnqueueOptions,
): QueueState {
  const nextItem = ensureQueueId(item)
  if (!options?.allowDuplicate) {
    const existing = findQueueIndexByTypedIdentity(state.items, nextItem.type, nextItem.id)
    if (existing >= 0) return state
  }
  const items = withCap([...state.items, nextItem])
  return {
    items,
    activeIndex: clampActiveIndex(items, state.activeIndex),
  }
}

/** Append many items (each subject to the same duplicate policy). */
export function enqueueMany(
  state: QueueState,
  items: DesktopQueueItem[],
  options?: EnqueueOptions,
): QueueState {
  let next = state
  for (const item of items) {
    next = enqueue(next, item, options)
  }
  return next
}

/**
 * playNow activates an existing typed identity, or inserts + activates.
 * Duplicate policy: identity match → activate existing (no second copy).
 */
export function playNow(state: QueueState, item: DesktopQueueItem): QueueState {
  const nextItem = ensureQueueId(item)
  const existing = findQueueIndexByTypedIdentity(state.items, nextItem.type, nextItem.id)
  if (existing >= 0) {
    return { items: state.items, activeIndex: existing }
  }

  const insertAt = state.activeIndex >= 0 ? state.activeIndex : 0
  const items = [...state.items]
  items.splice(insertAt, 0, nextItem)
  const capped = withCap(items)
  return {
    items: capped,
    activeIndex: clampActiveIndex(capped, insertAt),
  }
}

/** Insert after the active item (or append when none). Does not change activeIndex. */
export function playNext(state: QueueState, item: DesktopQueueItem): QueueState {
  const nextItem = ensureQueueId(item)
  const insertAt = state.activeIndex >= 0 ? state.activeIndex + 1 : state.items.length
  const items = [...state.items]
  items.splice(insertAt, 0, nextItem)
  const capped = withCap(items)
  return {
    items: capped,
    activeIndex: clampActiveIndex(capped, state.activeIndex),
  }
}

/**
 * Remove by queueId.
 *
 * Active removal policy:
 * When removing active item: promote next item as active index
 * (do not auto-play in pure ops — caller plays). If no next, set activeIndex=-1.
 */
export function remove(state: QueueState, queueId: string): QueueState {
  const index = state.items.findIndex((item) => item.queueId === queueId)
  if (index < 0) return state

  const items = state.items.filter((_, i) => i !== index)
  let activeIndex = state.activeIndex

  if (state.activeIndex === index) {
    // Promote the following item (same index after removal), or clear.
    activeIndex = index < items.length ? index : -1
  } else if (state.activeIndex > index) {
    activeIndex = state.activeIndex - 1
  }

  return {
    items,
    activeIndex: clampActiveIndex(items, activeIndex),
  }
}

/** Move item from → to and adjust activeIndex. */
export function move(state: QueueState, from: number, to: number): QueueState {
  if (
    from < 0
    || to < 0
    || from >= state.items.length
    || to >= state.items.length
    || from === to
  ) {
    return state
  }

  const items = [...state.items]
  const [spliced] = items.splice(from, 1)
  items.splice(to, 0, spliced)

  let activeIndex = state.activeIndex
  if (activeIndex === from) {
    activeIndex = to
  } else if (from < activeIndex && to >= activeIndex) {
    activeIndex -= 1
  } else if (from > activeIndex && to <= activeIndex) {
    activeIndex += 1
  }

  return {
    items,
    activeIndex: clampActiveIndex(items, activeIndex),
  }
}

export function clear(): QueueState {
  return emptyQueueState()
}

export function setActiveIndex(state: QueueState, index: number): QueueState {
  return {
    items: state.items,
    activeIndex: clampActiveIndex(state.items, index),
  }
}

export function replaceQueue(
  items: DesktopQueueItem[],
  startIndex = 0,
): QueueState {
  const nextItems = withCap(items.map(ensureQueueId))
  if (nextItems.length === 0) return emptyQueueState()
  const activeIndex =
    startIndex < 0 || startIndex >= nextItems.length ? 0 : startIndex
  return { items: nextItems, activeIndex }
}

/** Next active index helper. wrap=false → -1 at end. */
export function nextIndex(
  state: QueueState,
  options?: { wrap?: boolean },
): number {
  if (state.items.length === 0) return -1
  if (state.activeIndex < 0) return 0
  const candidate = state.activeIndex + 1
  if (candidate < state.items.length) return candidate
  return options?.wrap ? 0 : -1
}

/** Previous active index helper. wrap=false → -1 at start. */
export function previousIndex(
  state: QueueState,
  options?: { wrap?: boolean },
): number {
  if (state.items.length === 0) return -1
  if (state.activeIndex < 0) return state.items.length - 1
  const candidate = state.activeIndex - 1
  if (candidate >= 0) return candidate
  return options?.wrap ? state.items.length - 1 : -1
}

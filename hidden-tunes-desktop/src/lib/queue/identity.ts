import type { DesktopQueueItem, DesktopQueueItemType } from './types'

/** Typed identity key — used for playNow activate / enqueue duplicate policy. */
export function queueItemIdentity(type: DesktopQueueItemType, id: string): string {
  return `${type}:${String(id || '').trim()}`
}

export function queueItemKey(item: Pick<DesktopQueueItem, 'type' | 'id'>): string {
  return queueItemIdentity(item.type, item.id)
}

/** Stable unique id per queue entry (allows intentional duplicates when allowDuplicate). */
export function newQueueId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // ignore
  }
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Find first queue index matching typed identity (`type:id`).
 * playNow activates an existing match; enqueue skips when a match exists (unless allowDuplicate).
 */
export function findQueueIndexByTypedIdentity(
  items: readonly DesktopQueueItem[],
  type: DesktopQueueItemType,
  id: string,
): number {
  const key = queueItemIdentity(type, id)
  return items.findIndex((item) => queueItemKey(item) === key)
}

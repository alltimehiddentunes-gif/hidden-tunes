/** Unified typed playback history — separate from Library / Downloads / Playlists. */

export const HISTORY_STORAGE_KEY = 'ht-desktop:history:v1'
export const HISTORY_MIGRATION_FLAG_KEY = 'ht-desktop:history:v1:migrated'
export const HISTORY_SCHEMA_VERSION = 1
export const HISTORY_MAX_ENTRIES = 400

export const HISTORY_ITEM_TYPES = [
  'song',
  'radio',
  'podcast_episode',
  'audiobook_chapter',
  'tv',
  'motivational',
  'lecture',
] as const

export type HistoryItemType = (typeof HISTORY_ITEM_TYPES)[number]

export type DesktopHistoryItem = {
  id: string
  type: HistoryItemType
  title: string
  playedAt: string
  subtitle?: string | null
  artwork?: string | null
  durationSeconds?: number | null
  /** Last known position for finite media. Never for live Radio. */
  positionSeconds?: number | null
  completed?: boolean
  parentId?: string | null
  isMature?: boolean
  contentRating?: string | null
  metadata?: Record<string, unknown> | null
}

export type HistoryStoreV1 = {
  version: typeof HISTORY_SCHEMA_VERSION
  updatedAt: string
  items: DesktopHistoryItem[]
}

export type ContinueListeningItem = DesktopHistoryItem & {
  resumePositionSeconds: number
}

export function historyItemIdentity(type: HistoryItemType, id: string) {
  return `${type}:${id.trim()}`
}

export function historyItemKey(item: Pick<DesktopHistoryItem, 'type' | 'id'>) {
  return historyItemIdentity(item.type, item.id)
}

export function isHistoryItemType(value: unknown): value is HistoryItemType {
  return typeof value === 'string' && (HISTORY_ITEM_TYPES as readonly string[]).includes(value)
}

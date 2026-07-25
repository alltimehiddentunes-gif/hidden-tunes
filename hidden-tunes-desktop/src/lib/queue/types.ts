/** Typed desktop queue contract — wraps the existing ApiSong queue without a second provider. */

export const QUEUE_STORAGE_KEY = 'ht-desktop:queue:v1'
export const QUEUE_SCHEMA_VERSION = 1
export const QUEUE_MAX_ITEMS = 500
/** Previous: restart current finite item when elapsed exceeds this threshold (seconds). */
export const QUEUE_PREVIOUS_RESTART_SECONDS = 3

/**
 * Persistable typed audio-queue families.
 * TV / Sports remain session video owners (shared video element) and are not persisted here.
 * Downloads keep their original family — never remapped to a generic offline type.
 */
export const DESKTOP_QUEUE_ITEM_TYPES = [
  'song',
  'radio',
  'podcast_episode',
  'audiobook_chapter',
  'motivational',
  'lecture',
] as const

/** Legacy Phase-6 WIP discriminator — migrated on load to original family + localDownloadId. */
export const LEGACY_OFFLINE_QUEUE_ITEM_TYPE = 'offline_audio' as const

export type DesktopQueueItemType = (typeof DESKTOP_QUEUE_ITEM_TYPES)[number]

/**
 * TV / Sports stay session video owners.
 * Optional session-only entries may be omitted from persistence and are not part of this union.
 */
export type DesktopQueueItem = {
  /** Unique entry id (uuid or type:sourceId:instance). */
  queueId: string
  type: DesktopQueueItemType
  /** Family source id (raw, without song-id prefix). */
  id: string
  title: string
  addedAt: string
  artist?: string | null
  subtitle?: string | null
  showTitle?: string | null
  bookTitle?: string | null
  seriesTitle?: string | null
  artwork?: string | null
  duration?: number | null
  parentId?: string | null
  chapterId?: string | null
  episodeId?: string | null
  /** When set, item resolves from verified Downloads — family remains original. */
  localDownloadId?: string | null
  isLive?: boolean
  isMature?: boolean
  contentRating?: string | null
  metadata?: Record<string, unknown> | null
}

export type QueueStoreV1 = {
  version: 1
  updatedAt: string
  items: DesktopQueueItem[]
  /** -1 if none. NEVER autoplay on restore — caller decides playback. */
  activeIndex: number
}

export type QueueState = {
  items: DesktopQueueItem[]
  activeIndex: number
}

export function isDesktopQueueItemType(value: unknown): value is DesktopQueueItemType {
  return typeof value === 'string' && (DESKTOP_QUEUE_ITEM_TYPES as readonly string[]).includes(value)
}

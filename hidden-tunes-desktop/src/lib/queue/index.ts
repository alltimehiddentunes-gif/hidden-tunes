export {
  DESKTOP_QUEUE_ITEM_TYPES,
  LEGACY_OFFLINE_QUEUE_ITEM_TYPE,
  QUEUE_MAX_ITEMS,
  QUEUE_PREVIOUS_RESTART_SECONDS,
  QUEUE_SCHEMA_VERSION,
  QUEUE_STORAGE_KEY,
  isDesktopQueueItemType,
} from './types'
export type {
  DesktopQueueItem,
  DesktopQueueItemType,
  QueueState,
  QueueStoreV1,
} from './types'

export {
  findQueueIndexByTypedIdentity,
  newQueueId,
  queueItemIdentity,
  queueItemKey,
} from './identity'

export {
  apiSongToQueueItem,
  canSeekQueueTrack,
  familyLabelForSong,
  inferOriginalFamilyType,
  inferQueueItemType,
  queueItemToApiSong,
  songHasLocalDownloadMarker,
} from './family'
export type { ApiSongToQueueItemExtras } from './family'

export { resolvePlaybackCapabilities } from './capabilities'
export type { PlaybackCapabilities } from './capabilities'

export {
  emptyQueueStore,
  loadQueueStore,
  normalizeQueueItem,
  normalizeQueueStore,
  sanitizeQueueMetadata,
  saveQueueStore,
} from './persistence'

export {
  clear,
  emptyQueueState,
  enqueue,
  enqueueMany,
  move,
  nextIndex,
  playNext,
  playNow,
  previousIndex,
  remove,
  replaceQueue,
  setActiveIndex,
} from './operations'
export type { EnqueueOptions } from './operations'

export { emitQueueDiagnostic } from './diagnostics'
export type { QueueDiagnosticEvent } from './diagnostics'

/** ApiSong-level helpers used by DesktopPlaybackProvider (wraps typed foundation). */
export {
  clearPersistedQueue,
  enqueueSong,
  findSongIndexById,
  insertPlayNext,
  isPersistableQueueSong,
  loadPersistedQueue,
  moveIndex,
  persistQueueSnapshot,
  removeAtIndex,
  restoreQueueSongs,
  songsToQueueItems,
  storeToApiSongs,
} from './apiBridge'

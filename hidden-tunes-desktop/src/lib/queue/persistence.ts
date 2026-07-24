import {
  QUEUE_MAX_ITEMS,
  QUEUE_SCHEMA_VERSION,
  QUEUE_STORAGE_KEY,
  type DesktopQueueItem,
  type QueueStoreV1,
  isDesktopQueueItemType,
} from './types'
import { newQueueId } from './identity'
import { emitQueueDiagnostic } from './diagnostics'

function nowIso() {
  return new Date().toISOString()
}

function readRaw(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(QUEUE_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeRaw(value: string) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(QUEUE_STORAGE_KEY, value)
  } catch {
    // Storage may be unavailable or full — ignore safely.
  }
}

const SECRET_KEY_RE = /(token|secret|password|auth|cookie|authorization|api[_-]?key|bearer)/i
const URL_KEY_RE = /(url|uri|href|stream|src|source|endpoint)/i

function isHttpLike(value: string): boolean {
  const trimmed = value.trim().toLowerCase()
  return (
    trimmed.startsWith('http://')
    || trimmed.startsWith('https://')
    || trimmed.startsWith('blob:')
    || trimmed.startsWith('data:')
  )
}

/** Strip secrets and remote stream URLs from metadata. Keep non-URL scalars. */
export function sanitizeQueueMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(metadata)) {
    if (SECRET_KEY_RE.test(key)) continue
    if (typeof value === 'string') {
      if (URL_KEY_RE.test(key) && isHttpLike(value)) continue
      if (isHttpLike(value) && !value.trim().toLowerCase().startsWith('ht-download://')) continue
      out[key] = value
      continue
    }
    if (value == null || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
      continue
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      const nested = sanitizeQueueMetadata(value as Record<string, unknown>)
      if (nested && Object.keys(nested).length > 0) out[key] = nested
    }
  }

  return Object.keys(out).length > 0 ? out : null
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function normalizeQueueItem(raw: unknown): DesktopQueueItem | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (!isDesktopQueueItemType(row.type)) return null

  const id = trimOrNull(row.id)
  const title = trimOrNull(row.title)
  if (!id || !title) return null

  const addedAt =
    typeof row.addedAt === 'string' && Number.isFinite(Date.parse(row.addedAt))
      ? row.addedAt
      : nowIso()

  const queueId = trimOrNull(row.queueId) || newQueueId()

  return {
    queueId,
    type: row.type,
    id,
    title,
    addedAt,
    artist: trimOrNull(row.artist),
    subtitle: trimOrNull(row.subtitle),
    showTitle: trimOrNull(row.showTitle),
    bookTitle: trimOrNull(row.bookTitle),
    seriesTitle: trimOrNull(row.seriesTitle),
    artwork: trimOrNull(row.artwork),
    duration: typeof row.duration === 'number' && Number.isFinite(row.duration) ? row.duration : null,
    parentId: trimOrNull(row.parentId),
    chapterId: trimOrNull(row.chapterId),
    episodeId: trimOrNull(row.episodeId),
    localDownloadId: trimOrNull(row.localDownloadId),
    isLive: row.isLive === true || row.type === 'radio',
    isMature: row.isMature === true,
    contentRating: trimOrNull(row.contentRating),
    metadata: sanitizeQueueMetadata(
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : null,
    ),
  }
}

export function emptyQueueStore(): QueueStoreV1 {
  return {
    version: QUEUE_SCHEMA_VERSION,
    updatedAt: nowIso(),
    items: [],
    activeIndex: -1,
  }
}

/**
 * Normalize a malformed or partial store.
 * Clamps to QUEUE_MAX_ITEMS. Never restores autoplay — activeIndex only.
 */
export function normalizeQueueStore(raw: unknown): QueueStoreV1 {
  if (!raw || typeof raw !== 'object') return emptyQueueStore()
  const row = raw as Record<string, unknown>
  if (row.version !== QUEUE_SCHEMA_VERSION && row.version !== 1) {
    return emptyQueueStore()
  }

  const items = Array.isArray(row.items)
    ? (row.items.map(normalizeQueueItem).filter(Boolean) as DesktopQueueItem[])
    : []

  const clamped = items.slice(0, QUEUE_MAX_ITEMS)
  let activeIndex =
    typeof row.activeIndex === 'number' && Number.isFinite(row.activeIndex)
      ? Math.trunc(row.activeIndex)
      : -1

  if (clamped.length === 0) {
    activeIndex = -1
  } else if (activeIndex < -1 || activeIndex >= clamped.length) {
    activeIndex = -1
  }

  return {
    version: 1,
    updatedAt:
      typeof row.updatedAt === 'string' && Number.isFinite(Date.parse(row.updatedAt))
        ? row.updatedAt
        : nowIso(),
    items: clamped,
    activeIndex,
  }
}

/** Load persisted queue. NEVER autoplay on restore — returns store state only. */
export function loadQueueStore(): QueueStoreV1 {
  try {
    const raw = readRaw()
    if (!raw) return emptyQueueStore()
    const parsed = normalizeQueueStore(JSON.parse(raw))
    emitQueueDiagnostic('queue_store_loaded', {
      itemCount: parsed.items.length,
      activeIndex: parsed.activeIndex,
    })
    return parsed
  } catch {
    emitQueueDiagnostic('queue_store_load_failed', {})
    return emptyQueueStore()
  }
}

/** Persist queue — strips secrets / http stream URLs; never writes an autoplay flag. */
export function saveQueueStore(store: QueueStoreV1): void {
  const normalized = normalizeQueueStore(store)
  const payload: QueueStoreV1 = {
    version: 1,
    updatedAt: nowIso(),
    items: normalized.items.slice(0, QUEUE_MAX_ITEMS).map((item) => ({
      ...item,
      metadata: sanitizeQueueMetadata(item.metadata),
    })),
    activeIndex: normalized.activeIndex,
  }

  try {
    writeRaw(JSON.stringify(payload))
    emitQueueDiagnostic('queue_store_saved', {
      itemCount: payload.items.length,
      activeIndex: payload.activeIndex,
    })
  } catch {
    emitQueueDiagnostic('queue_store_save_failed', {})
  }
}

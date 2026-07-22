export const DESKTOP_DOWNLOAD_TYPES = [
  'song',
  'podcast_episode',
  'audiobook_chapter',
  'motivational',
  'lecture',
] as const

export type DesktopDownloadType = (typeof DESKTOP_DOWNLOAD_TYPES)[number]

export const DESKTOP_DOWNLOAD_STATUSES = [
  'queued',
  'resolving',
  'downloading',
  'paused',
  'completed',
  'failed',
  'removing',
  'missing',
  'invalid',
] as const

export type DesktopDownloadStatus = (typeof DESKTOP_DOWNLOAD_STATUSES)[number]

export type DesktopDownloadItem = {
  id: string
  type: DesktopDownloadType
  title: string
  downloadId: string
  status: DesktopDownloadStatus
  createdAt: string
  updatedAt: string
  subtitle?: string | null
  artwork?: string | null
  sourceId?: string | null
  parentId?: string | null
  showId?: string | null
  bookId?: string | null
  seriesId?: string | null
  chapterId?: string | null
  remoteUrlIdentity?: string | null
  localRelativePath?: string | null
  mimeType?: string | null
  fileSize?: number | null
  downloadedBytes?: number | null
  duration?: number | null
  checksum?: string | null
  expiresAt?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  retryCount?: number | null
  isMature?: boolean
  contentRating?: string | null
  supportsRange?: boolean
  metadata?: Record<string, unknown> | null
}

export type DownloadStartRequest = {
  type: DesktopDownloadType
  id: string
  title: string
  subtitle?: string | null
  artwork?: string | null
  parentId?: string | null
  showId?: string | null
  bookId?: string | null
  seriesId?: string | null
  chapterId?: string | null
  candidateUrl?: string
  duration?: number | null
  isMature?: boolean
  contentRating?: string | null
  metadata?: Record<string, unknown> | null
}

export type DownloadDiskUsage = {
  downloadsBytes: number
  partialBytes: number
  freeBytes: number | null
  rootLabel: string
  maxItemBytes: number
  minFreeReserveBytes: number
  maxConcurrent: number
}

export type DownloadabilityClass = 'downloadable' | 'stream_only' | 'unsupported' | 'unknown'

export function downloadIdentity(type: DesktopDownloadType, id: string) {
  return `${type}:${id.trim()}`
}

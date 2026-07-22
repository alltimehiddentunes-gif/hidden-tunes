import type { DesktopDownloadItem } from './types'

export function downloadControlLabel(item: DesktopDownloadItem | null | undefined): string {
  if (!item) return 'Download'
  if (item.status === 'completed') return 'Downloaded'
  if (item.status === 'queued') return 'Queued'
  if (item.status === 'resolving') return 'Preparing…'
  if (item.status === 'downloading') {
    const done = item.downloadedBytes || 0
    const total = item.fileSize || 0
    if (total > 0) {
      return `Downloading ${Math.min(100, Math.round((done / total) * 100))}%`
    }
    return 'Downloading…'
  }
  if (item.status === 'paused') return 'Paused'
  if (item.status === 'failed' || item.status === 'missing' || item.status === 'invalid') return 'Retry'
  return 'Download'
}

export function isActiveDownloadStatus(status: DesktopDownloadItem['status'] | undefined) {
  return status === 'queued' || status === 'resolving' || status === 'downloading'
}

/** Music may be offered only when a stable HTTPS media URL is already known. */
export function isStableMusicDownloadUrl(url: string | null | undefined) {
  if (typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed.startsWith('https://')) return false
  const lower = trimmed.toLowerCase()
  if (lower.includes('.m3u8') || lower.includes('/relay?')) return false
  return true
}

import { memo, useCallback, useMemo, useState } from 'react'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import {
  downloadItemToQueueSong,
  useDesktopConnectivity,
  useDesktopDownloads,
  type DesktopDownloadItem,
  type DesktopDownloadType,
} from '../../lib/downloads'

type DesktopDownloadsPageProps = {
  query?: string
  onPlayQueueSong: (
    song: ReturnType<typeof downloadItemToQueueSong>,
    queue: ReturnType<typeof downloadItemToQueueSong>[],
    startIndex: number,
    context: 'manual' | 'podcast' | 'audiobook' | 'motivational' | 'lecture',
    queueTitle: string,
  ) => void
}

const FILTERS: { id: 'all' | DesktopDownloadType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'song', label: 'Music' },
  { id: 'podcast_episode', label: 'Podcasts' },
  { id: 'audiobook_chapter', label: 'Audiobooks' },
  { id: 'motivational', label: 'Motivationals' },
  { id: 'lecture', label: 'Lectures' },
]

function formatBytes(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value < 0) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function progressLabel(item: DesktopDownloadItem) {
  if (item.status === 'downloading' || item.status === 'queued' || item.status === 'resolving') {
    const total = item.fileSize || 0
    const done = item.downloadedBytes || 0
    if (total > 0) return `${Math.min(99, Math.round((done / total) * 100))}%`
    return item.status === 'queued' ? 'Queued' : 'Downloading…'
  }
  if (item.status === 'completed') return 'Downloaded'
  if (item.status === 'failed') return item.errorMessage || 'Failed'
  if (item.status === 'missing') return 'File missing'
  if (item.status === 'corrupt') return item.errorMessage || 'Corrupt file'
  if (item.status === 'paused') return 'Cancelled — Retry to restart'
  if (item.status === 'invalid') return 'Invalid file'
  return item.status
}

function familyLabel(type: DesktopDownloadItem['type']) {
  switch (type) {
    case 'song':
      return 'Music'
    case 'podcast_episode':
      return 'Podcast'
    case 'audiobook_chapter':
      return 'Audiobook'
    case 'motivational':
      return 'Motivational'
    case 'lecture':
      return 'Lecture'
    default:
      return 'Download'
  }
}

function groupItems(items: DesktopDownloadItem[]) {
  return {
    downloading: items.filter((item) =>
      ['queued', 'resolving', 'downloading', 'paused'].includes(item.status),
    ),
    completed: items.filter((item) => item.status === 'completed'),
    failed: items.filter((item) => item.status === 'failed'),
    missing: items.filter((item) =>
      item.status === 'missing' || item.status === 'corrupt' || item.status === 'invalid',
    ),
  }
}

function playbackContextFor(type: DesktopDownloadItem['type']) {
  switch (type) {
    case 'podcast_episode':
      return 'podcast' as const
    case 'audiobook_chapter':
      return 'audiobook' as const
    case 'motivational':
      return 'motivational' as const
    case 'lecture':
      return 'lecture' as const
    default:
      return 'manual' as const
  }
}

export const DesktopDownloadsPage = memo(function DesktopDownloadsPage({
  query = '',
  onPlayQueueSong,
}: DesktopDownloadsPageProps) {
  const downloads = useDesktopDownloads()
  const { offline } = useDesktopConnectivity()
  const { currentTrack, stopPlayback } = useDesktopPlayback()
  const [filter, setFilter] = useState<'all' | DesktopDownloadType>('all')
  const [actionError, setActionError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return downloads.items.filter((item) => {
      if (filter !== 'all' && item.type !== filter) return false
      if (!q) return true
      const hay = [item.title, item.subtitle, familyLabel(item.type)].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [downloads.items, filter, query])

  const groups = useMemo(() => groupItems(filtered), [filtered])

  const availableFilters = useMemo(() => {
    return FILTERS.filter((entry) => {
      if (entry.id === 'all') return true
      return downloads.items.some((item) => item.type === entry.id)
    })
  }, [downloads.items])

  const handlePlay = useCallback(
    async (item: DesktopDownloadItem) => {
      setActionError(null)
      if (item.status !== 'completed') {
        setActionError('This download is not ready to play.')
        return
      }
      const playable = await downloads.getPlayableUrl(item.downloadId)
      if (!playable.ok || !playable.url) {
        setActionError(playable.errorMessage || 'The downloaded file is missing.')
        await downloads.refresh()
        return
      }
      const song = downloadItemToQueueSong(item, playable.url)
      onPlayQueueSong(song, [song], 0, playbackContextFor(item.type), 'Downloads')
    },
    [downloads, onPlayQueueSong],
  )

  const handleRemove = useCallback(
    async (item: DesktopDownloadItem) => {
      setActionError(null)
      if (currentTrack && (currentTrack as { offlineDownloadId?: string }).offlineDownloadId === item.downloadId) {
        await stopPlayback()
      }
      await downloads.remove(item.downloadId)
    },
    [currentTrack, downloads, stopPlayback],
  )

  const renderRow = (item: DesktopDownloadItem) => {
    const percent =
      item.fileSize && item.fileSize > 0
        ? Math.min(100, Math.round(((item.downloadedBytes || 0) / item.fileSize) * 100))
        : null

    return (
      <article key={item.downloadId} className="ht-downloads-row" data-download-type={item.type} data-download-status={item.status}>
        <div className="ht-downloads-row-copy">
          <span className="ht-downloads-row-type">{familyLabel(item.type)}</span>
          <h3>{item.title}</h3>
          <p>{item.subtitle || progressLabel(item)}</p>
          {percent != null && ['downloading', 'queued', 'resolving'].includes(item.status) ? (
            <div className="ht-downloads-progress" aria-hidden="true">
              <span style={{ width: `${percent}%` }} />
            </div>
          ) : null}
        </div>
        <div className="ht-downloads-row-actions">
          {item.status === 'completed' ? (
            <button type="button" className="btn-primary btn-sm" onClick={() => void handlePlay(item)}>
              Play
            </button>
          ) : null}
          {['queued', 'resolving', 'downloading'].includes(item.status) ? (
            <button type="button" className="btn-secondary btn-sm" onClick={() => void downloads.cancel(item.downloadId)}>
              Cancel
            </button>
          ) : null}
          {item.status === 'failed' || item.status === 'paused' || item.status === 'missing' ? (
            <button type="button" className="btn-secondary btn-sm" onClick={() => void downloads.resume(item.downloadId)}>
              Retry
            </button>
          ) : null}
          <button type="button" className="btn-ghost btn-sm" onClick={() => void handleRemove(item)}>
            Remove
          </button>
        </div>
      </article>
    )
  }

  return (
    <div className="ht-downloads-destination">
      <header className="ht-downloads-header">
        <h1 className="ht-downloads-title">Downloads</h1>
        <p className="ht-downloads-subtitle">
          Offline files stored on this device. Favorites stay in Library even if a download is removed.
        </p>
      </header>

      {!downloads.bridgeAvailable ? (
        <div className="ht-downloads-banner" role="status">
          Offline downloads require the desktop app shell. Open Hidden Tunes Desktop (Electron) to manage files.
        </div>
      ) : null}

      {offline ? (
        <div className="ht-downloads-banner ht-downloads-banner--offline" role="status">
          You appear to be offline. Completed downloads remain playable; new downloads need a connection.
        </div>
      ) : null}

      {downloads.diskUsage ? (
        <section className="ht-downloads-disk" aria-label="Disk usage">
          <span>Downloads {formatBytes(downloads.diskUsage.downloadsBytes)}</span>
          <span>Partial {formatBytes(downloads.diskUsage.partialBytes)}</span>
          <span>Free {formatBytes(downloads.diskUsage.freeBytes)}</span>
        </section>
      ) : null}

      <div className="ht-downloads-tabs" role="tablist" aria-label="Download filters">
        {availableFilters.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={filter === entry.id}
            className={`ht-downloads-tab${filter === entry.id ? ' is-active' : ''}`}
            onClick={() => setFilter(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {actionError || downloads.error ? (
        <div className="ht-downloads-error" role="alert">
          {actionError || downloads.error}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="ht-downloads-empty catalog-empty">
          <h2>No downloaded content</h2>
          <p>
            Download podcast episodes, audiobook chapters, or music from their pages. Radio and live TV cannot be downloaded.
          </p>
        </div>
      ) : (
        <div className="ht-downloads-groups">
          {groups.downloading.length > 0 ? (
            <section aria-labelledby="ht-dl-active">
              <h2 id="ht-dl-active">Downloading</h2>
              <div className="ht-downloads-list">{groups.downloading.map(renderRow)}</div>
            </section>
          ) : null}
          {groups.completed.length > 0 ? (
            <section aria-labelledby="ht-dl-done">
              <h2 id="ht-dl-done">Completed</h2>
              <div className="ht-downloads-list">{groups.completed.map(renderRow)}</div>
            </section>
          ) : null}
          {groups.failed.length > 0 ? (
            <section aria-labelledby="ht-dl-failed">
              <h2 id="ht-dl-failed">Failed</h2>
              <div className="ht-downloads-list">{groups.failed.map(renderRow)}</div>
            </section>
          ) : null}
          {groups.missing.length > 0 ? (
            <section aria-labelledby="ht-dl-missing">
              <h2 id="ht-dl-missing">Missing or unavailable</h2>
              <div className="ht-downloads-list">{groups.missing.map(renderRow)}</div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  )
})

import { memo, useMemo } from 'react'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import {
  buildPlayerQueueRows,
  buildPlayerQueueStats,
  PLAYER_QUEUE_PANEL_EMPTY_DETAIL,
  PLAYER_QUEUE_PANEL_EMPTY_TITLE,
} from '../../lib/playerQueueDisplay'
import { familyLabelForSong, resolvePlaybackCapabilities, songHasLocalDownloadMarker } from '../../lib/queue'
import { ArtworkImage } from '../ArtworkImage'

export const PlayerQueuePanel = memo(function PlayerQueuePanel({
  showHeader = false,
}: {
  showHeader?: boolean
}) {
  const {
    currentQueue,
    currentIndex,
    playQueueAtIndex,
    removeQueueItem,
    moveQueueItem,
    clearQueue,
  } = useDesktopPlayback()
  const queueRows = useMemo(
    () => buildPlayerQueueRows(currentQueue, currentIndex),
    [currentIndex, currentQueue],
  )
  const queueStats = useMemo(
    () => buildPlayerQueueStats(currentQueue, currentIndex),
    [currentIndex, currentQueue],
  )

  if (queueRows.length === 0) {
    return (
      <div className="player-queue-empty player-queue-empty--premium" role="tabpanel" aria-label="Queue">
        <p className="player-queue-empty-eyebrow">QUEUE</p>
        <p className="player-queue-empty-title">{PLAYER_QUEUE_PANEL_EMPTY_TITLE}</p>
        <p className="player-queue-empty-detail">{PLAYER_QUEUE_PANEL_EMPTY_DETAIL}</p>
      </div>
    )
  }

  return (
    <div className="player-queue-panel" role="tabpanel" aria-label="Queue" data-ht-queue-panel="true">
      <header className="player-queue-panel-header">
        {showHeader ? <h3 className="player-queue-panel-title">Queue</h3> : <h3 className="player-queue-panel-title">Up next</h3>}
        <span className="player-queue-panel-count">
          {queueStats.songCount} items · {queueStats.remainingCount} remaining
          {queueStats.remainingDurationLabel ? ` · ${queueStats.remainingDurationLabel}` : ''}
        </span>
        <button
          type="button"
          className="player-queue-clear"
          onClick={() => clearQueue()}
          aria-label="Clear queue"
        >
          Clear
        </button>
      </header>
      <ol className="player-queue-list">
        {queueRows.map((row) => {
          const caps = resolvePlaybackCapabilities(row.track)
          const family = familyLabelForSong(row.track)
          const live = caps.isLive
          const local = caps.isLocalDownload || songHasLocalDownloadMarker(row.track)
          return (
            <li
              key={row.key}
              className={
                (row.isCurrent ? 'is-current ' : '')
                + (row.isPrevious ? 'is-previous ' : '')
                + (row.status === 'played' ? 'is-played ' : '')
                + (row.isNext ? 'is-next ' : '')
              }
              data-ht-queue-status={row.status}
              data-ht-queue-family={family}
              data-ht-queue-local={local ? 'true' : undefined}
            >
              <button
                type="button"
                className="player-queue-row"
                onClick={() => playQueueAtIndex(row.queueIndex)}
                aria-current={row.isCurrent ? 'true' : undefined}
              >
                <span className="player-queue-index">{row.queueIndex + 1}</span>
                <ArtworkImage
                  src={row.artwork}
                  alt=""
                  seed={row.track.id}
                  label={row.title}
                />
                <span className="player-queue-copy">
                  <strong>{row.title}</strong>
                  <span>
                    {family}
                    {live ? ' · Live' : ''}
                    {local ? ' · Downloaded' : ''}
                    {row.artist ? ` · ${row.artist}` : ''}
                  </span>
                </span>
                <span className="player-queue-duration">{live ? 'LIVE' : row.duration}</span>
              </button>
              <div className="player-queue-row-actions">
                <button
                  type="button"
                  className="player-queue-move"
                  aria-label="Move up"
                  disabled={row.queueIndex <= 0}
                  onClick={() => moveQueueItem(row.queueIndex, row.queueIndex - 1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="player-queue-move"
                  aria-label="Move down"
                  disabled={row.queueIndex >= currentQueue.length - 1}
                  onClick={() => moveQueueItem(row.queueIndex, row.queueIndex + 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="player-queue-remove"
                  aria-label="Remove from queue"
                  onClick={() => removeQueueItem(row.queueIndex)}
                >
                  ✕
                </button>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
})

export const PlayerDetailsPanel = memo(function PlayerDetailsPanel({
  fields,
}: {
  fields: Array<{ label: string; value: string }>
}) {
  if (fields.length === 0) {
    return (
      <div className="player-details-empty" role="tabpanel" aria-label="Details">
        <p className="player-details-empty-title">No track selected</p>
        <p className="player-details-empty-detail">Play media to view details.</p>
      </div>
    )
  }

  return (
    <div className="player-details-panel" role="tabpanel" aria-label="Details">
      <dl className="player-details-list">
        {fields.map((field) => (
          <div key={field.label}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
})

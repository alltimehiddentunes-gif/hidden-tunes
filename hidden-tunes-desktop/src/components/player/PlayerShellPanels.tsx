import { memo, useMemo } from 'react'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import {
  buildPlayerQueueRows,
  buildPlayerQueueStats,
  PLAYER_QUEUE_PANEL_EMPTY_DETAIL,
  PLAYER_QUEUE_PANEL_EMPTY_TITLE,
} from '../../lib/playerQueueDisplay'
import { ArtworkImage } from '../ArtworkImage'

export const PlayerQueuePanel = memo(function PlayerQueuePanel({
  showHeader = false,
}: {
  showHeader?: boolean
}) {
  const { currentQueue, currentIndex, playQueueAtIndex } = useDesktopPlayback()
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
    <div className="player-queue-panel" role="tabpanel" aria-label="Queue">
      {showHeader ? (
        <header className="player-queue-panel-header">
          <h3 className="player-queue-panel-title">Queue</h3>
          <span className="player-queue-panel-count">
            {queueStats.songCount} tracks · {queueStats.remainingCount} remaining · {queueStats.remainingDurationLabel}
          </span>
        </header>
      ) : null}
      <ol className="player-queue-list">
        {queueRows.map((row) => (
          <li
            key={row.key}
            className={
              (row.isCurrent ? 'is-current ' : '')
              + (row.isPrevious ? 'is-previous ' : '')
              + (row.status === 'played' ? 'is-played ' : '')
              + (row.isNext ? 'is-next ' : '')
            }
            data-ht-queue-status={row.status}
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
                <span>{row.artist}</span>
              </span>
              <span className="player-queue-duration">{row.duration}</span>
            </button>
          </li>
        ))}
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

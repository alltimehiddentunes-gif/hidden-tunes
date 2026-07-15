import {
  memo,
  useCallback,
  useMemo,
  useState,
} from 'react'
import type { ApiSong } from '../../lib/api'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import {
  buildPlayerQueueStats,
  buildPlayerUpNextRows,
} from '../../lib/playerQueueDisplay'
import { resolveAutoNextBasis } from '../../lib/playbackSourceContext'
import { resolvePlayerArtist, resolvePlayerTitle, resolvePlayerTrackArtwork } from '../../lib/playerDisplayMetadata'
import { ArtworkImage } from '../ArtworkImage'

type UpNextPanelProps = {
  currentTrack: ApiSong | null
  isPlaying: boolean
  isLoading: boolean
  isActive: boolean
  onBrowseMusic?: () => void
}

const UpNextQueueRow = memo(function UpNextQueueRow({
  row,
  displayIndex,
  onPlay,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  row: ReturnType<typeof buildPlayerUpNextRows>[number]
  displayIndex: number
  onPlay: (index: number) => void
  onRemove: (index: number) => void
  onMoveUp: (index: number) => void
  onMoveDown: (index: number) => void
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  return (
    <li className="music-up-next-row" data-next={row.isNext ? 'true' : 'false'}>
      <button
        type="button"
        className="music-up-next-row-main"
        onClick={() => onPlay(row.queueIndex)}
        onDoubleClick={() => onPlay(row.queueIndex)}
      >
        <span className="music-up-next-row-position">{displayIndex}</span>
        <ArtworkImage src={row.artwork} alt="" seed={row.track.id} label={row.title} />
        <span className="music-up-next-row-copy">
          <strong>{row.title}</strong>
          <span>{row.artist}</span>
        </span>
        <span className="music-up-next-row-duration">{row.duration}</span>
      </button>
      <div className="music-up-next-row-menu-wrap" data-open={menuOpen ? 'true' : 'false'}>
        <button
          type="button"
          className="music-up-next-row-menu-btn"
          aria-label={`More actions for ${row.title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          ⋮
        </button>
        {menuOpen ? (
          <div className="music-up-next-row-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { onPlay(row.queueIndex); closeMenu() }}>
              Play now
            </button>
            {canMoveUp ? (
              <button type="button" role="menuitem" onClick={() => { onMoveUp(row.queueIndex); closeMenu() }}>
                Move up
              </button>
            ) : null}
            {canMoveDown ? (
              <button type="button" role="menuitem" onClick={() => { onMoveDown(row.queueIndex); closeMenu() }}>
                Move down
              </button>
            ) : null}
            <button type="button" role="menuitem" onClick={() => { onRemove(row.queueIndex); closeMenu() }}>
              Remove
            </button>
          </div>
        ) : null}
      </div>
    </li>
  )
})

export const UpNextPanel = memo(function UpNextPanel({
  currentTrack,
  isPlaying,
  isLoading,
  isActive,
  onBrowseMusic,
}: UpNextPanelProps) {
  const {
    currentQueue,
    currentIndex,
    queueTitle,
    queueContext,
    queueSeedType,
    autoNextEnabled,
    setAutoNextEnabled,
    clearUpcomingQueue,
    playQueueAtIndex,
    removeUpcomingAtIndex,
    moveQueueItem,
  } = useDesktopPlayback()

  const [menuOpen, setMenuOpen] = useState(false)
  const upcomingTracks = useMemo(
    () => (currentIndex >= 0 ? currentQueue.slice(currentIndex + 1) : []),
    [currentIndex, currentQueue],
  )
  const upcomingRows = useMemo(
    () => buildPlayerUpNextRows(upcomingTracks, currentIndex, 200),
    [currentIndex, upcomingTracks],
  )
  const queueStats = useMemo(
    () => buildPlayerQueueStats(currentQueue, currentIndex),
    [currentIndex, currentQueue],
  )
  const autoNextBasis = useMemo(
    () => resolveAutoNextBasis(queueContext, queueSeedType),
    [queueContext, queueSeedType],
  )

  const playingTitle = currentTrack ? resolvePlayerTitle(currentTrack) : 'Nothing is playing'
  const playingArtist = currentTrack ? resolvePlayerArtist(currentTrack) : 'Unknown Artist'
  const playingArtwork = currentTrack ? resolvePlayerTrackArtwork(currentTrack) : null

  const handleClearUpcoming = useCallback(() => {
    clearUpcomingQueue()
    setMenuOpen(false)
  }, [clearUpcomingQueue])

  if (!currentTrack) {
    return (
      <aside className="music-up-next-panel" aria-label="Up next">
        <div className="music-up-next-empty">
          <p className="music-up-next-empty-title">Nothing is playing</p>
          <p className="music-up-next-empty-detail">Choose a song from Music to begin.</p>
          {onBrowseMusic ? (
            <button type="button" className="music-up-next-browse-btn" onClick={onBrowseMusic}>
              Browse Music
            </button>
          ) : null}
        </div>
      </aside>
    )
  }

  return (
    <aside className="music-up-next-panel" aria-label="Up next">
      <header className="music-up-next-header">
        <div className="music-up-next-header-copy">
          <h2>{queueTitle?.trim() || 'Up Next'}</h2>
          <span className="music-up-next-stats">
            {queueStats.remainingCount} tracks · {queueStats.remainingDurationLabel}
          </span>
        </div>
        <div className="music-up-next-header-actions" data-open={menuOpen ? 'true' : 'false'}>
          <button
            type="button"
            className="music-up-next-menu-btn"
            aria-label="Queue actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            •••
          </button>
          {menuOpen ? (
            <div className="music-up-next-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                disabled={upcomingRows.length === 0}
                onClick={handleClearUpcoming}
              >
                Clear upcoming
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <section className="music-up-next-playing" aria-label="Playing now">
        <p className="music-up-next-section-label">PLAYING NOW</p>
        <div
          className="music-up-next-playing-card"
          data-playing={isActive && isPlaying ? 'true' : 'false'}
          data-loading={isActive && isLoading ? 'true' : 'false'}
        >
          <ArtworkImage src={playingArtwork} alt="" seed={currentTrack.id} label={playingTitle} priority />
          <div className="music-up-next-playing-copy">
            <strong>{playingTitle}</strong>
            <span>{playingArtist}</span>
          </div>
          {isActive && isPlaying ? (
            <span className="music-up-next-equalizer" aria-hidden="true">
              <span /><span /><span />
            </span>
          ) : null}
        </div>
      </section>

      <section className="music-up-next-auto" aria-label="Auto next">
        <div className="music-up-next-auto-copy">
          <p className="music-up-next-section-label">AUTO NEXT</p>
          <strong>Continue with similar music</strong>
          <span>Based on: {autoNextBasis}</span>
        </div>
        <label className="music-up-next-toggle">
          <span className="sr-only">{autoNextEnabled ? 'Auto next on' : 'Auto next off'}</span>
          <input
            type="checkbox"
            checked={autoNextEnabled}
            onChange={(event) => setAutoNextEnabled(event.target.checked)}
            aria-label={autoNextEnabled ? 'Disable Auto Next' : 'Enable Auto Next'}
          />
          <span className="music-up-next-toggle-track" aria-hidden="true" />
        </label>
      </section>

      <div className="music-up-next-list-wrap">
        {upcomingRows.length === 0 ? (
          <div className="music-up-next-queue-empty">
            <p className="music-up-next-queue-empty-title">Your queue is empty</p>
            <p className="music-up-next-queue-empty-detail">
              {autoNextEnabled
                ? 'Add songs or let Auto Next keep listening after this track.'
                : 'Add songs or enable Auto Next to keep listening.'}
            </p>
          </div>
        ) : (
          <ol className="music-up-next-list">
            {upcomingRows.map((row, offset) => (
              <UpNextQueueRow
                key={row.key}
                row={row}
                displayIndex={offset + 1}
                onPlay={playQueueAtIndex}
                onRemove={removeUpcomingAtIndex}
                onMoveUp={(index) => moveQueueItem(index, index - 1)}
                onMoveDown={(index) => moveQueueItem(index, index + 1)}
                canMoveUp={offset > 0}
                canMoveDown={offset < upcomingRows.length - 1}
              />
            ))}
          </ol>
        )}
      </div>
    </aside>
  )
})

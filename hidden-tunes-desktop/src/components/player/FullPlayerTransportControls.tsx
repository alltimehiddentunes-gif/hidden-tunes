import { memo } from 'react'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'

export const FullPlayerTransportControls = memo(function FullPlayerTransportControls({
  activeTrackId,
  showShuffleRepeat = true,
}: {
  activeTrackId: string | null
  showShuffleRepeat?: boolean
}) {
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    isPlaying,
    isLoading,
    shuffleEnabled,
    repeatMode,
    pause,
    resume,
    next,
    previous,
    toggleShuffle,
    toggleRepeat,
  } = useDesktopPlayback()

  const isActive = Boolean(activeTrackId && currentTrack?.id === activeTrackId)
  const hasPrevious = isActive && (
    currentIndex > 0 || (repeatMode === 'all' && currentQueue.length > 1)
  )
  const hasNext = isActive && (
    (currentIndex >= 0 && currentIndex < currentQueue.length - 1) || repeatMode !== 'off'
  )
  const showPlaying = isActive && isPlaying
  const showLoading = isActive && isLoading

  const handlePlayPause = () => {
    if (!isActive || isLoading) return
    if (isPlaying) {
      pause()
      return
    }
    resume()
  }

  const playLabel = showLoading
    ? 'Loading track'
    : showPlaying
      ? 'Pause'
      : isActive
        ? 'Play'
        : 'Play (select a track)'

  const repeatLabel = repeatMode === 'one'
    ? 'Repeat one'
    : repeatMode === 'all'
      ? 'Repeat all'
      : 'Repeat off'

  return (
    <div className="transport-controls psd-player-transport" role="group" aria-label="Playback controls">
      {showShuffleRepeat ? (
        <button
          type="button"
          className={
            'psd-player-transport-btn psd-player-transport-btn--shuffle'
            + (shuffleEnabled ? ' is-active' : '')
          }
          onClick={toggleShuffle}
          disabled={!isActive}
          aria-label={shuffleEnabled ? 'Shuffle on' : 'Shuffle off'}
          aria-pressed={shuffleEnabled}
          title={shuffleEnabled ? 'Shuffle on' : 'Shuffle off'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
          </svg>
        </button>
      ) : null}
      <button
        type="button"
        className="psd-player-transport-btn psd-player-transport-btn--skip"
        onClick={previous}
        disabled={!hasPrevious}
        aria-label={hasPrevious ? 'Previous track' : 'Previous track unavailable'}
        title={hasPrevious ? 'Previous track' : 'Previous track unavailable'}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
        </svg>
      </button>
      <button
        type="button"
        className={
          'psd-player-transport-btn psd-player-transport-btn--play'
          + (showPlaying ? ' is-active' : '')
          + (showLoading ? ' is-loading' : '')
        }
        onClick={handlePlayPause}
        disabled={!isActive || isLoading}
        aria-label={playLabel}
        aria-busy={showLoading}
        title={playLabel}
      >
        {showLoading ? (
          <span className="player-spinner player-spinner--transport" aria-hidden="true" />
        ) : showPlaying ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7L8 5z" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="psd-player-transport-btn psd-player-transport-btn--skip"
        onClick={next}
        disabled={!hasNext}
        aria-label={hasNext ? 'Next track' : 'Next track unavailable'}
        title={hasNext ? 'Next track' : 'Next track unavailable'}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 18l8.5-6L6 6v12zm10-12h2v12h-2V6z" />
        </svg>
      </button>
      {showShuffleRepeat ? (
        <button
          type="button"
          className={
            'psd-player-transport-btn psd-player-transport-btn--repeat'
            + (repeatMode !== 'off' ? ' is-active' : '')
            + (repeatMode === 'one' ? ' is-repeat-one' : '')
          }
          onClick={toggleRepeat}
          disabled={!isActive}
          aria-label={repeatLabel}
          aria-pressed={repeatMode !== 'off'}
          title={repeatLabel}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M17 1l4 4-4 4" />
            <path d="M3 11V9a4 4 0 014-4h14" />
            <path d="M7 23l-4-4 4-4" />
            <path d="M21 13v2a4 4 0 01-4 4H3" />
          </svg>
        </button>
      ) : null}
    </div>
  )
})

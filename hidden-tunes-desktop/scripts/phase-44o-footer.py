#!/usr/bin/env python3
"""Phase 44O — Footer player PSD reconstruction + wiring."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'src/App.tsx'
CSS = ROOT / 'src/App.css'


def read(path: Path) -> str:
    return path.read_text(encoding='utf-8').replace('\r\n', '\n').replace('\r', '\n')


def write(path: Path, text: str) -> None:
    raw = path.read_bytes()
    newline = '\r\n' if b'\r\n' in raw else '\n'
    path.write_bytes(text.replace('\n', newline).encode('utf-8'))


app = read(APP)

transport_old = """const PlaybackTransportControls = memo(function PlaybackTransportControls({
  activeTrackId,
  className = 'player-controls',
}: {
  activeTrackId: string | null
  className?: string
}) {
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    isPlaying,
    isLoading,
    pause,
    resume,
    next,
    previous,
  } = useDesktopPlayback()

  const isActive = Boolean(activeTrackId && currentTrack?.id === activeTrackId)
  const hasPrevious = isActive && currentIndex > 0
  const hasNext =
    isActive && currentIndex >= 0 && currentIndex < currentQueue.length - 1
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

  return (
    <div className={`transport-controls ${className}`} role="group" aria-label="Playback controls">
      <button
        type="button"
        className="control-btn control-btn--skip"
        onClick={previous}
        disabled={!hasPrevious}
        aria-label={hasPrevious ? 'Previous track' : 'Previous track unavailable'}
        title={hasPrevious ? 'Previous track' : 'Previous track unavailable'}
      >
        <span className="control-btn-icon control-btn-icon--skip" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
          </svg>
        </span>
      </button>
      <button
        type="button"
        className={
          'control-btn play'
          + (showPlaying ? ' is-active' : '')
          + (showLoading ? ' is-loading' : '')
          + (!isActive ? ' is-idle' : '')
        }
        onClick={handlePlayPause}
        disabled={!isActive || isLoading}
        aria-label={playLabel}
        aria-busy={showLoading}
        title={playLabel}
      >
        <span className="control-btn-icon control-btn-icon--play" aria-hidden="true">
          {showLoading ? (
            <span className="player-spinner player-spinner--transport" />
          ) : showPlaying ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
          )}
        </span>
      </button>
      <button
        type="button"
        className="control-btn control-btn--skip"
        onClick={next}
        disabled={!hasNext}
        aria-label={hasNext ? 'Next track' : 'Next track unavailable'}
        title={hasNext ? 'Next track' : 'Next track unavailable'}
      >
        <span className="control-btn-icon control-btn-icon--skip" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zm10-12h2v12h-2V6z" />
          </svg>
        </span>
      </button>
    </div>
  )
})"""

transport_new = """const PlaybackTransportControls = memo(function PlaybackTransportControls({
  activeTrackId,
  className = 'player-controls',
  showShuffleRepeat = false,
}: {
  activeTrackId: string | null
  className?: string
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
    <div className={`transport-controls ${className}`} role="group" aria-label="Playback controls">
      {showShuffleRepeat ? (
        <button
          type="button"
          className={`control-btn control-btn--shuffle${shuffleEnabled ? ' is-active' : ''}`}
          onClick={toggleShuffle}
          disabled={!isActive}
          aria-label={shuffleEnabled ? 'Shuffle on' : 'Shuffle off'}
          aria-pressed={shuffleEnabled}
          title={shuffleEnabled ? 'Shuffle on' : 'Shuffle off'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
          </svg>
        </button>
      ) : null}
      <button
        type="button"
        className="control-btn control-btn--skip"
        onClick={previous}
        disabled={!hasPrevious}
        aria-label={hasPrevious ? 'Previous track' : 'Previous track unavailable'}
        title={hasPrevious ? 'Previous track' : 'Previous track unavailable'}
      >
        <span className="control-btn-icon control-btn-icon--skip" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
          </svg>
        </span>
      </button>
      <button
        type="button"
        className={
          'control-btn play'
          + (showPlaying ? ' is-active' : '')
          + (showLoading ? ' is-loading' : '')
          + (!isActive ? ' is-idle' : '')
        }
        onClick={handlePlayPause}
        disabled={!isActive || isLoading}
        aria-label={playLabel}
        aria-busy={showLoading}
        title={playLabel}
      >
        <span className="control-btn-icon control-btn-icon--play" aria-hidden="true">
          {showLoading ? (
            <span className="player-spinner player-spinner--transport" />
          ) : showPlaying ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
          )}
        </span>
      </button>
      <button
        type="button"
        className="control-btn control-btn--skip"
        onClick={next}
        disabled={!hasNext}
        aria-label={hasNext ? 'Next track' : 'Next track unavailable'}
        title={hasNext ? 'Next track' : 'Next track unavailable'}
      >
        <span className="control-btn-icon control-btn-icon--skip" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zm10-12h2v12h-2V6z" />
          </svg>
        </span>
      </button>
      {showShuffleRepeat ? (
        <button
          type="button"
          className={
            'control-btn control-btn--repeat'
            + (repeatMode !== 'off' ? ' is-active' : '')
            + (repeatMode === 'one' ? ' is-repeat-one' : '')
          }
          onClick={toggleRepeat}
          disabled={!isActive}
          aria-label={repeatLabel}
          aria-pressed={repeatMode !== 'off'}
          title={repeatLabel}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M17 1l4 4-4 4" />
            <path d="M3 11V9a4 4 0 014-4h14" />
            <path d="M7 23l-4-4 4-4" />
            <path d="M21 13v2a4 4 0 01-4 4H3" />
          </svg>
        </button>
      ) : null}
    </div>
  )
})"""

if transport_old not in app:
    raise SystemExit('PlaybackTransportControls block not found')
app = app.replace(transport_old, transport_new)

app = app.replace(
    '<PlaybackTransportControls activeTrackId={displayTrack?.id ?? null} />',
    '<PlaybackTransportControls activeTrackId={displayTrack?.id ?? null} showShuffleRepeat />',
)

player_patch_start = """  const progressTrackRef = useRef<HTMLDivElement>(null)
  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isSeekingRef = useRef(false)
  const isAdjustingVolumeRef = useRef(false)

  const displayTrack = track ?? currentTrack
  const title = displayTrack?.title ?? 'Nothing playing'
  const artist = displayTrack?.artist ?? 'Select a song to begin'"""

player_patch_end = """  const progressTrackRef = useRef<HTMLDivElement>(null)
  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const volumeBeforeMuteRef = useRef(1)
  const isSeekingRef = useRef(false)
  const isAdjustingVolumeRef = useRef(false)

  const hasPlayback = Boolean(currentTrack && currentQueue.length > 0 && currentIndex >= 0)
  const displayTrack = hasPlayback ? (track ?? currentTrack) : null
  const title = displayTrack?.title ?? 'Nothing playing'
  const artist = displayTrack?.artist ?? 'Select a song to begin'
  const albumLabel = displayTrack?.album ?? (hasPlayback ? queueTitle ?? null : null)
  const qualityLabel = hasPlayback
    ? (
      resolveSearchRowQualityBadge(displayTrack) !== 'SONG'
        ? resolveSearchRowQualityBadge(displayTrack)
        : AUDIO_QUALITY_MODE_LABELS[audioQualityMode]
    )
    : null"""

if player_patch_start not in app:
    raise SystemExit('PlayerBar state block not found')
app = app.replace(player_patch_start, player_patch_end)

app = app.replace(
    """  const isBarActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)""",
    """  const isBarActive = hasPlayback && Boolean(displayTrack && currentTrack?.id === displayTrack.id)""",
)

app = app.replace(
    """      className={`player-bar player-bar--${barState}`}
      aria-label="Player"
      data-playing={isPlaying ? 'true' : 'false'}
      data-loading={isLoading ? 'true' : 'false'}
    >""",
    """      className={`player-bar player-bar--${barState}`}
      aria-label="Player"
      data-playing={isPlaying ? 'true' : 'false'}
      data-loading={isLoading ? 'true' : 'false'}
      data-idle={hasPlayback ? 'false' : 'true'}
    >""",
)

app = app.replace(
    """          <h4>{title}</h4>
          <p>{artist}</p>
          <div className="player-track-actions" aria-hidden="true">
            <button type="button" className="player-inline-icon-btn" tabIndex={-1}><PsdIconHeart /></button>
            <button type="button" className="player-inline-icon-btn" tabIndex={-1}><PsdIconMore /></button>
          </div>""",
    """          <h4>{title}</h4>
          <p>{artist}</p>
          {albumLabel ? <p className="player-album-label">{albumLabel}</p> : null}
          {qualityLabel ? <span className="player-quality-pill">{qualityLabel}</span> : null}""",
)

volume_btn_old = """        <button
          type="button"
          className="control-btn"
          aria-label={
            volume <= 0
              ? 'Volume muted'
              : volume < 0.35
                ? 'Volume low'
                : 'Volume'
          }
          tabIndex={-1}
        >"""

volume_btn_new = """        <button
          type="button"
          className="control-btn player-volume-toggle"
          aria-label={
            volume <= 0
              ? 'Unmute'
              : volume < 0.35
                ? 'Volume low'
                : 'Mute'
          }
          onClick={() => {
            if (volume <= 0) {
              setVolume(volumeBeforeMuteRef.current > 0 ? volumeBeforeMuteRef.current : 0.7)
              return
            }
            volumeBeforeMuteRef.current = volume
            setVolume(0)
          }}
        >"""

if volume_btn_old not in app:
    raise SystemExit('PlayerBar volume button block not found')
app = app.replace(volume_btn_old, volume_btn_new, 1)

write(APP, app)

css = read(CSS)
css_block = """
/* —— Phase 44O: Footer player PSD parity + wiring —— */
.player-bar[data-idle='true'] .player-meta h4 {
  color: rgba(245, 243, 250, 0.72);
}

.player-album-label {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--psd-metadata);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-quality-pill {
  display: inline-flex;
  margin-top: 6px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent-gold-bright);
  background: rgba(255, 186, 61, 0.1);
  border: 1px solid rgba(255, 186, 61, 0.22);
}

.control-btn--shuffle.is-active,
.control-btn--repeat.is-active {
  color: var(--accent-gold-bright);
  background: rgba(255, 186, 61, 0.12);
}

.control-btn--repeat.is-repeat-one {
  color: var(--accent-violet-soft);
  background: rgba(168, 85, 247, 0.14);
}

.player-volume-toggle {
  cursor: pointer;
}

.transport-controls .control-btn--shuffle,
.transport-controls .control-btn--repeat {
  width: 32px;
  height: 32px;
}

"""
if 'Phase 44O: Footer player' not in css:
    marker_css = '/* —— Phase 44N:'
    if marker_css in css:
        css = css.replace(marker_css, css_block + marker_css)
    else:
        css = css.replace('/* —— Player —— */', css_block + '/* —— Player —— */', 1)
    write(CSS, css)

print('Phase 44O footer patch applied')

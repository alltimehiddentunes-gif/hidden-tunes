#!/usr/bin/env python3
"""Phase 44P — Full-screen player foundation PSD reconstruction + wiring."""
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


def must_replace(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Missing block: {label}')
    return text.replace(old, new, 1)


app = read(APP)
css = read(CSS)

FOUNDATION = """
function usePlayerShellState(preferredTrack: ApiSong | null = null) {
  const playback = useDesktopPlayback()
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    queueTitle,
    isPlaying,
    isLoading,
    positionSeconds,
    durationSeconds,
    audioQualityMode,
    getUpcomingTracks,
  } = playback

  const displayTrack = currentTrack ?? preferredTrack ?? null
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)
  const liveProgressMax = isActive && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax
  const progressValue = liveProgressValue
  const progressPercent = progressMax > 0
    ? Math.min(100, (progressValue / progressMax) * 100)
    : 0
  const displayTitle = displayTrack?.title ?? 'Nothing playing'
  const displayArtist = displayTrack?.artist ?? 'Select a song to begin'
  const displayAlbum = displayTrack?.album ?? (isActive ? queueTitle ?? null : null)
  const qualityLabel = displayTrack && isActive
    ? (
      resolveSearchRowQualityBadge(displayTrack) !== 'SONG'
        ? resolveSearchRowQualityBadge(displayTrack)
        : AUDIO_QUALITY_MODE_LABELS[audioQualityMode]
    )
    : null
  const activeTrackId = displayTrack?.id ?? null

  return {
    ...playback,
    displayTrack,
    isActive,
    liveProgressMax,
    progressMax,
    progressValue,
    progressPercent,
    displayTitle,
    displayArtist,
    displayAlbum,
    qualityLabel,
    activeTrackId,
    getUpcomingTracks,
  }
}

function usePlayerShellChrome(onClose: () => void) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])
}

function PlayerLyricsEmptyState({ artist }: { artist?: string | null }) {
  return (
    <div className="player-lyrics-empty">
      <p className="player-lyrics-empty-title">Lyrics unavailable</p>
      <p className="player-lyrics-empty-detail">
        Synced lyrics are not available for this track in the desktop catalog yet.
      </p>
      {artist ? <p className="player-lyrics-empty-credit">Written by {artist}</p> : null}
    </div>
  )
}

function PlayerQueuePanel() {
  const { currentQueue, currentIndex, playQueueAtIndex } = useDesktopPlayback()
  const visibleQueue = currentIndex >= 0
    ? currentQueue.slice(currentIndex)
    : []

  if (visibleQueue.length === 0) {
    return (
      <div className="player-queue-empty" role="tabpanel" aria-label="Queue">
        <p className="player-queue-empty-title">Queue is empty</p>
        <p className="player-queue-empty-detail">Play a song to populate your queue.</p>
      </div>
    )
  }

  return (
    <div className="player-queue-panel" role="tabpanel" aria-label="Queue">
      <ol className="player-queue-list">
        {visibleQueue.map((song, offset) => {
          const queueIndex = currentIndex + offset
          const isCurrent = offset === 0
          return (
            <li key={`${song.id}-${queueIndex}`} className={isCurrent ? 'is-current' : ''}>
              <button
                type="button"
                className="player-queue-row"
                onClick={() => playQueueAtIndex(queueIndex)}
              >
                <span className="player-queue-index">{queueIndex + 1}</span>
                <ArtworkImage
                  src={song.artwork ?? null}
                  alt=""
                  seed={song.id}
                  label={song.title}
                />
                <span className="player-queue-copy">
                  <strong>{song.title}</strong>
                  <span>{song.artist}</span>
                </span>
                <span className="player-queue-duration">{formatSongDurationLabel(song)}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function PlayerDetailsPanel({
  track,
  albumLabel,
  qualityLabel,
}: {
  track: ApiSong | null
  albumLabel?: string | null
  qualityLabel?: string | null
}) {
  if (!track) {
    return (
      <div className="player-details-empty" role="tabpanel" aria-label="Details">
        <p className="player-details-empty-title">No track selected</p>
        <p className="player-details-empty-detail">Play a song to view track details.</p>
      </div>
    )
  }

  return (
    <div className="player-details-panel" role="tabpanel" aria-label="Details">
      <dl className="player-details-list">
        <div>
          <dt>Title</dt>
          <dd>{track.title}</dd>
        </div>
        <div>
          <dt>Artist</dt>
          <dd>{track.artist}</dd>
        </div>
        {albumLabel ? (
          <div>
            <dt>Album</dt>
            <dd>{albumLabel}</dd>
          </div>
        ) : null}
        {track.album ? (
          <div>
            <dt>Release</dt>
            <dd>{track.album}</dd>
          </div>
        ) : null}
        {qualityLabel ? (
          <div>
            <dt>Quality</dt>
            <dd>{qualityLabel}</dd>
          </div>
        ) : null}
        {track.durationSeconds != null && track.durationSeconds > 0 ? (
          <div>
            <dt>Duration</dt>
            <dd>{formatPlaybackTime(track.durationSeconds)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  )
}

"""

app = must_replace(
    app,
    '\n\nconst CinemaPlayerShell = memo(function CinemaPlayerShell({',
    f'\n{FOUNDATION}\nconst CinemaPlayerShell = memo(function CinemaPlayerShell({{',
    'insert foundation',
)

FULL_TRANSPORT_OLD = """const FullPlayerTransportControls = memo(function FullPlayerTransportControls({
  activeTrackId,
  hideDecorativeControls = false,
}: {
  activeTrackId: string | null
  hideDecorativeControls?: boolean
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
    <div className="transport-controls psd-player-transport" role="group" aria-label="Playback controls">
      {!hideDecorativeControls ? (
        <button
          type="button"
          className="psd-player-transport-btn psd-player-transport-btn--shuffle"
          aria-label="Shuffle"
          title="Shuffle"
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
        <span className="psd-player-transport-play-icon" aria-hidden="true">
          {showLoading ? (
            <span className="player-spinner player-spinner--transport" />
          ) : showPlaying ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
          )}
        </span>
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
      {!hideDecorativeControls ? (
        <button
          type="button"
          className="psd-player-transport-btn psd-player-transport-btn--repeat"
          aria-label="Repeat"
          title="Repeat"
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
})"""

FULL_TRANSPORT_NEW = """const FullPlayerTransportControls = memo(function FullPlayerTransportControls({
  activeTrackId,
  hideDecorativeControls = false,
}: {
  activeTrackId: string | null
  hideDecorativeControls?: boolean
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
      {!hideDecorativeControls ? (
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
        <span className="psd-player-transport-play-icon" aria-hidden="true">
          {showLoading ? (
            <span className="player-spinner player-spinner--transport" />
          ) : showPlaying ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
          )}
        </span>
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
      {!hideDecorativeControls ? (
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
})"""

app = must_replace(app, FULL_TRANSPORT_OLD, FULL_TRANSPORT_NEW, 'FullPlayerTransportControls')

CINEMA_STATE_OLD = """  const {
    currentTrack,
    isPlaying,
    isLoading,
    positionSeconds,
    durationSeconds,
    seekTo,
    volume,
    setVolume,
  } = useDesktopPlayback()

  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isAdjustingVolumeRef = useRef(false)
  const [playerTab, setPlayerTab] = useState<'lyrics' | 'queue' | 'details'>('lyrics')

  const displayTrack = currentTrack ?? preferredTrack
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)
  const liveProgressMax = isActive && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax > 0 ? liveProgressMax : PSD_PLAYER_DURATION_SECONDS
  const progressValue = liveProgressMax > 0
    ? liveProgressValue
    : PSD_PLAYER_POSITION_SECONDS
  const progressPercent = progressMax > 0
    ? Math.min(100, (progressValue / progressMax) * 100)
    : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))

  const displayTitle = displayTrack?.title ?? PSD_PLAYER_TITLE
  const displayArtist = displayTrack?.artist ?? PSD_PLAYER_ARTIST
  const displayAlbum = displayTrack?.album ?? PSD_PLAYER_SOURCE_ALBUM
  const activeTrackId = displayTrack?.id ?? null"""

CINEMA_STATE_NEW = """  const {
    displayTrack,
    isActive,
    isPlaying,
    isLoading,
    liveProgressMax,
    progressMax,
    progressValue,
    progressPercent,
    displayTitle,
    displayArtist,
    displayAlbum,
    qualityLabel,
    activeTrackId,
    seekTo,
    volume,
    setVolume,
  } = usePlayerShellState(preferredTrack)

  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isAdjustingVolumeRef = useRef(false)
  const [playerTab, setPlayerTab] = useState<'lyrics' | 'queue' | 'details'>('lyrics')
  const volumePercent = Math.min(100, Math.max(0, volume * 100))"""

app = must_replace(app, CINEMA_STATE_OLD, CINEMA_STATE_NEW, 'CinemaPlayerShell state')

CINEMA_EFFECTS_OLD = """  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="cinema-player cinema-player--psd cinema-player--psd-master\""""

CINEMA_EFFECTS_NEW = """  usePlayerShellChrome(onClose)

  return (
    <div
      className="cinema-player cinema-player--psd cinema-player--psd-master\""""

app = must_replace(app, CINEMA_EFFECTS_OLD, CINEMA_EFFECTS_NEW, 'CinemaPlayerShell chrome')

replacements = [
    (
        """        <button
          type="button"
          className="psd-player-topbar-btn psd-player-topbar-btn--menu"
          aria-label="More options"
        >
          <PsdIconMore />
        </button>""",
        """        <span className="psd-player-topbar-btn psd-player-topbar-btn--menu" aria-hidden="true" />""",
        'cinema topbar menu',
    ),
    (
        """            <div className="psd-player-master-actions" role="group" aria-label="Track actions">
              <button type="button" className="psd-player-master-action" aria-label="Favorite">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#a855f7" aria-hidden="true">
                  <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
                </svg>
              </button>
              <button type="button" className="psd-player-master-action" aria-label="Share">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
                </svg>
              </button>
              <button type="button" className="psd-player-master-action" aria-label="More options">
                <PsdIconMore />
              </button>
            </div>""",
        '',
        'cinema master actions',
    ),
    (
        """          {playerTab === 'lyrics' ? (
            <div className="psd-player-master-lyrics" role="tabpanel" aria-label="Lyrics">
              <span className="psd-player-master-quote" aria-hidden="true">“</span>
              <div className="psd-player-master-lyrics-body">
                {PSD_PLAYER_LYRICS_LINES.map((line) => (
                  <p
                    key={line.text}
                    className={`psd-player-master-lyric-line psd-player-master-lyric-line--${line.tier}`}
                  >
                    {line.text}
                  </p>
                ))}
              </div>
              <p className="psd-player-master-lyrics-credit">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Written by {displayArtist}
              </p>
            </div>
          ) : null}

          {playerTab === 'queue' ? (
            <div className="psd-player-master-panel-placeholder" role="tabpanel" aria-label="Queue">
              <p>Queue</p>
            </div>
          ) : null}

          {playerTab === 'details' ? (
            <div className="psd-player-master-panel-placeholder" role="tabpanel" aria-label="Details">
              <p>Details</p>
            </div>
          ) : null}""",
        """          {playerTab === 'lyrics' ? (
            <div className="psd-player-master-lyrics" role="tabpanel" aria-label="Lyrics">
              <PlayerLyricsEmptyState artist={displayArtist} />
            </div>
          ) : null}

          {playerTab === 'queue' ? <PlayerQueuePanel /> : null}

          {playerTab === 'details' ? (
            <PlayerDetailsPanel
              track={displayTrack}
              albumLabel={displayAlbum}
              qualityLabel={qualityLabel}
            />
          ) : null}""",
        'cinema tabs',
    ),
    (
        """          <div className="psd-player-master-badges" aria-label="Audio quality">
            <span className="psd-player-master-badge-pill psd-player-master-badge-pill--flac">FLAC</span>
            <span className="psd-player-master-badge-pill">24-bit</span>
            <span className="psd-player-master-badge-pill">48kHz</span>
            <span className="psd-player-master-badge-pill psd-player-master-badge-pill--icon" aria-label="Spatial audio">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M8 9v6M16 9v6M12 5v14" />
              </svg>
            </span>
          </div>""",
        """          {qualityLabel ? (
            <div className="psd-player-master-badges" aria-label="Audio quality">
              <span className="psd-player-master-badge-pill">{qualityLabel}</span>
            </div>
          ) : null}""",
        'cinema quality badges',
    ),
    (
        """            <button type="button" className="psd-player-master-utility" aria-label="Brightness">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            </button>
""",
        '',
        'cinema brightness',
    ),
    (
        """          <p className="psd-player-topbar-source">
            <strong>{displayAlbum}</strong>""",
        """          <p className="psd-player-topbar-source">
            <strong>{displayAlbum ?? 'Your Library'}</strong>""",
        'cinema album fallback',
    ),
    (
        """  const progressMax = liveProgressMax > 0 ? liveProgressMax : PSD_PLAYER_DURATION_SECONDS
  const progressValue = liveProgressMax > 0 ? liveProgressValue : PSD_PLAYER_POSITION_SECONDS""",
        """  const progressMax = liveProgressMax
  const progressValue = liveProgressValue""",
        'progress fallback standard',
    ),
    (
        """  const progressMax = liveProgressMax > 0 ? liveProgressMax : PSD_PLAYER_DURATION_SECONDS
  const progressValue = liveProgressMax > 0
    ? liveProgressValue
    : PSD_PLAYER_POSITION_SECONDS""",
        """  const progressMax = liveProgressMax
  const progressValue = liveProgressValue""",
        'progress fallback multiline',
    ),
    (
        """  const progressMax = liveProgressMax > 0 ? liveProgressMax : PSD_PLAYER4_DURATION_SECONDS
  const progressValue = liveProgressMax > 0 ? liveProgressValue : PSD_PLAYER4_POSITION_SECONDS""",
        """  const progressMax = liveProgressMax
  const progressValue = liveProgressValue""",
        'progress fallback player4',
    ),
    (
        'const displayTitle = displayTrack?.title ?? PSD_PLAYER_TITLE',
        "const displayTitle = displayTrack?.title ?? 'Nothing playing'",
        'displayTitle',
    ),
    (
        'const displayArtist = displayTrack?.artist ?? PSD_PLAYER_ARTIST',
        "const displayArtist = displayTrack?.artist ?? 'Select a song to begin'",
        'displayArtist',
    ),
    (
        'const displayAlbum = displayTrack?.album ?? PSD_WAVEFORM_ALBUM',
        'const displayAlbum = displayTrack?.album ?? null',
        'waveform album',
    ),
    (
        'const displayAlbum = displayTrack?.album ?? PSD_LYRICS_ALBUM',
        'const displayAlbum = displayTrack?.album ?? null',
        'lyrics album',
    ),
    (
        'const displayArtist = displayTrack?.artist ?? PSD_PLAYER2_ARTIST',
        "const displayArtist = displayTrack?.artist ?? 'Select a song to begin'",
        'player2 artist',
    ),
    (
        'const displayAlbum = displayTrack?.album ?? PSD_PLAYER2_ALBUM',
        'const displayAlbum = displayTrack?.album ?? null',
        'player2 album',
    ),
    (
        'const nextTitle = upcomingTrack?.title ?? PSD_PLAYER2_NEXT_TITLE',
        "const nextTitle = upcomingTrack?.title ?? 'Up next'",
        'player2 next title',
    ),
    (
        'const nextArtist = upcomingTrack?.artist ?? PSD_PLAYER2_NEXT_ARTIST',
        "const nextArtist = upcomingTrack?.artist ?? ''",
        'player2 next artist',
    ),
    (
        'const displayArtist = displayTrack?.artist ?? PSD_PLAYER3_ARTIST',
        "const displayArtist = displayTrack?.artist ?? 'Select a song to begin'",
        'player3 artist',
    ),
    (
        'const displayTitle = displayTrack?.title ?? PSD_PLAYER4_TITLE',
        "const displayTitle = displayTrack?.title ?? 'Nothing playing'",
        'player4 title',
    ),
    (
        'const displayArtist = displayTrack?.artist ?? PSD_PLAYER4_ARTIST',
        "const displayArtist = displayTrack?.artist ?? 'Select a song to begin'",
        'player4 artist',
    ),
    (
        'const displayAlbum = displayTrack?.album ?? PSD_PLAYER4_SOURCE',
        'const displayAlbum = displayTrack?.album ?? null',
        'player4 album',
    ),
    (
        'if (upcomingTracks.length === 0) return PSD_PLAYER3_UP_NEXT',
        'if (upcomingTracks.length === 0) return []',
        'player3 up next empty',
    ),
    (
        'if (upcomingTracks.length === 0) return PSD_PLAYER4_UP_NEXT',
        'if (upcomingTracks.length === 0) return []',
        'player4 up next empty',
    ),
    (
        """        : PSD_PLAYER4_UP_NEXT[index]?.duration ?? '3:56',""",
        "        : '—',",
        'player4 duration fallback',
    ),
    (
        'const queueCount = currentQueue.length > 0 ? String(currentQueue.length) : PSD_PLAYER3_STATS.songs',
        "const queueCount = currentQueue.length > 0 ? String(currentQueue.length) : '0'",
        'player3 queue count',
    ),
    (
        """        label={displayTrack?.title ?? PSD_PLAYER2_TITLE_TOP}""",
        '        label={displayTitle}',
        'player2 backdrop label 1',
    ),
    (
        """                  label={displayTrack?.title ?? PSD_PLAYER2_TITLE_TOP}""",
        '                  label={displayTitle}',
        'player2 backdrop label 2',
    ),
    (
        """              <h1 className="player2-title">
                <span>{PSD_PLAYER2_TITLE_TOP}</span>
                <span className="player2-title-mid">{PSD_PLAYER2_TITLE_MID}</span>
                <span>{PSD_PLAYER2_TITLE_BOTTOM}</span>
              </h1>""",
        '              <h1 className="player2-title">{displayTitle}</h1>',
        'player2 title hero',
    ),
    (
        """              <p className="player2-meta">{displayAlbum} • {PSD_PLAYER2_YEAR}</p>
              <div className="player2-track-actions">
                <button type="button" className="player2-heart" aria-label="Favorite">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#a855f7" aria-hidden="true">
                    <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
                  </svg>
                </button>
                <span className="player2-mastered-badge">
                  <PsdWaveformStrip className="player2-mastered-wave" />
                  MASTERED
                </span>
                <button type="button" className="player2-track-menu" aria-label="More options">
                  <PsdIconMore />
                </button>
              </div>""",
        """              <p className="player2-meta">{displayAlbum ?? "Album"}</p>""",
        'player2 meta actions',
    ),
    (
        """            <button type="button" className="player2-header-menu" aria-label="More options">
              <PsdIconMore />
            </button>""",
        '            <span className="player2-header-menu" aria-hidden="true" />',
        'player2 header menu',
    ),
    (
        """              <button type="button" className="player2-art-play" aria-label="Play from artwork">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>""",
        '',
        'player2 art play',
    ),
    (
        """            <div className="player2-quality-badges">
              <span className="player2-quality-flac">FLAC</span>
              <span className="player2-quality-spec">24-BIT / 48KHZ</span>
            </div>""",
        '',
        'player2 fake quality',
    ),
    (
        """              <strong className="player2-device-model">{PSD_PLAYER2_DEVICE}</strong>""",
        '              <strong className="player2-device-model">Desktop Output</strong>',
        'player2 device',
    ),
    (
        """          <div className="player2-lyrics-active">
            <span className="player2-lyrics-quote" aria-hidden="true">“</span>
            {PSD_PLAYER2_LYRICS_ACTIVE.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <div className="player2-lyrics-scroll">
            {PSD_PLAYER2_LYRICS_BODY.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>""",
        '          <PlayerLyricsEmptyState artist={displayArtist} />',
        'player2 lyrics',
    ),
    (
        """        label={displayTrack?.title ?? PSD_PLAYER3_TITLE_MAIN}""",
        '        label={displayTitle}',
        'player3 backdrop label',
    ),
    (
        """                {PSD_PLAYER3_SOURCE}""",
        '{displayAlbum ?? "Your Library"}',
        'player3 source',
    ),
    (
        """                  label={displayTrack?.title ?? PSD_PLAYER3_TITLE_MAIN}""",
        '                  label={displayTitle}',
        'player3 disc label',
    ),
    (
        """                <span className="player3-disc-time">{PSD_PLAYER3_DISC_TIME}</span>""",
        '                <span className="player3-disc-time">{formatPlaybackTime(progressValue)}</span>',
        'player3 disc time',
    ),
    (
        """                  <div className="player3-lyrics-body">
                    {PSD_PLAYER3_LYRICS.map((line, index) => (
                      <p key={line} className={index < 3 ? 'is-active' : ''}>{line}</p>
                    ))}
                  </div>""",
        '                  <PlayerLyricsEmptyState artist={displayArtist} />',
        'player3 lyrics',
    ),
    (
        """              <span className="player3-title-script">{PSD_PLAYER3_TITLE_SCRIPT}</span>
              <h1 className="player3-title-main">{PSD_PLAYER3_TITLE_MAIN}</h1>""",
        '              <h1 className="player3-title-main">{displayTitle}</h1>',
        'player3 title',
    ),
    (
        """            <div className="player3-track-actions">
              <button type="button" className="player3-action" aria-label="Favorite">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
                </svg>
              </button>
              <span className="player3-vip-master">VIP MASTER</span>
              <button type="button" className="player3-action" aria-label="More options">
                <PsdIconMore />
              </button>
            </div>""",
        '',
        'player3 actions',
    ),
    (
        """                  <p>{PSD_PLAYER3_SOURCE} • {PSD_PLAYER3_STATS.duration}</p>""",
        '                  <p>{displayAlbum ?? "Your Library"}</p>',
        'player3 details meta',
    ),
    (
        """                <strong>{PSD_PLAYER3_STATS.duration}</strong>""",
        '                <strong>{formatPlaybackTime(progressMax)}</strong>',
        'player3 stats duration',
    ),
    (
        """                <strong>{PSD_PLAYER3_STATS.plays}</strong>""",
        '                <strong>—</strong>',
        'player3 stats plays',
    ),
    (
        """                <p className="player4-meta">{displayAlbum} • {PSD_PLAYER4_YEAR}</p>""",
        '                <p className="player4-meta">{displayAlbum ?? "Album"}</p>',
        'player4 meta',
    ),
    (
        """                  <button type="button" className="player4-shuffle-btn" aria-label="Shuffle">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                      <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                    </svg>
                    <span>Shuffle</span>
                  </button>
                  <button type="button" className="player4-more-btn" aria-label="More options">
                    <PsdIconMore />
                  </button>""",
        '',
        'player4 shuffle more',
    ),
    (
        """                {PSD_PLAYER4_LYRICS.map((line) => (
                  <p key={line}>{line}</p>
                ))}""",
        '                <PlayerLyricsEmptyState artist={displayArtist} />',
        'player4 lyrics',
    ),
    (
        """            <button type="button" className="player4-go-premium">Go Premium</button>""",
        '',
        'player4 go premium',
    ),
    (
        """                <div className="player5-track-actions">
                  <button type="button" className="player5-heart-btn is-active" aria-label="Favorite">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 1.01 4.5 2.09C13.09 4.01 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  </button>
                  <button type="button" className="player5-library-btn">+ Add to Library</button>
                  <button type="button" className="player5-more-btn" aria-label="More options">
                    <PsdIconMore />
                  </button>
                </div>""",
        '',
        'player5 actions',
    ),
    (
        """                <p className="player5-meta">{displayAlbum} • {PSD_PLAYER5_YEAR}</p>""",
        '                <p className="player5-meta">{displayAlbum ?? "Album"}</p>',
        'player5 meta',
    ),
    (
        """                  {PSD_PLAYER5_LYRICS.map((line, index) => (
                    <p key={line} className={index < 3 ? 'is-active' : ''}>{line}</p>
                  ))}""",
        '                  <PlayerLyricsEmptyState artist={displayArtist} />',
        'player5 lyrics',
    ),
    (
        """        <div className="psd-waveform-lyrics" aria-live="polite">
          {PSD_WAVEFORM_LYRICS.map((line) => (
            <p key={line}><em>{line}</em></p>
          ))}
        </div>""",
        """        <div className="psd-waveform-lyrics" aria-live="polite">
          <PlayerLyricsEmptyState artist={displayArtist} />
        </div>""",
        'waveform lyrics',
    ),
    (
        """        <button type="button" className="psd-waveform-topbar-btn" aria-label="More options">
          <PsdIconMore />
        </button>""",
        '        <span className="psd-waveform-topbar-btn" aria-hidden="true" />',
        'waveform menu',
    ),
    (
        """          <button type="button" className="psd-waveform-footer-btn" aria-label="Cast">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <rect x="5" y="2" width="14" height="20" rx="2" />
              <path d="M12 18h.01" />
            </svg>
          </button>
""",
        '',
        'waveform cast',
    ),
    (
        """        <div className="psd-lyrics-stack" aria-live="polite">
          {PSD_LYRICS_LINES.map((line, index) => (
            <p
              key={`${line.tier}-${index}`}
              className={`psd-lyrics-line psd-lyrics-line--${line.tier}`}
            >
              {line.text}
            </p>
          ))}
        </div>""",
        """        <div className="psd-lyrics-stack" aria-live="polite">
          <PlayerLyricsEmptyState artist={displayArtist} />
        </div>""",
        'fullscreen lyrics stack',
    ),
    (
        """        <div className="psd-lyrics-mid-controls">
          <button type="button" className="psd-lyrics-share-btn" aria-label="Share">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
              <path d="M16 6l-4-4-4 4M12 2v13" />
            </svg>
          </button>
          <button type="button" className="psd-lyrics-more-btn" aria-label="More options">
            <PsdIconMore />
          </button>
        </div>

""",
        '',
        'lyrics share more',
    ),
]

for old, new, label in replacements:
    if old not in app:
        raise SystemExit(f'Missing replacement: {label}')
    app = app.replace(old, new, 1)

# Player2 needs displayTitle - add after displayArtist line
PLAYER2_TITLE_INSERT_OLD = """  const displayArtist = displayTrack?.artist ?? 'Select a song to begin'
  const displayAlbum = displayTrack?.album ?? null
  const activeTrackId = displayTrack?.id ?? null
  const upcomingTrack = getUpcomingTracks()[0] ?? null"""

PLAYER2_TITLE_INSERT_NEW = """  const displayTitle = displayTrack?.title ?? 'Nothing playing'
  const displayArtist = displayTrack?.artist ?? 'Select a song to begin'
  const displayAlbum = displayTrack?.album ?? null
  const activeTrackId = displayTrack?.id ?? null
  const upcomingTrack = getUpcomingTracks()[0] ?? null"""

app = must_replace(app, PLAYER2_TITLE_INSERT_OLD, PLAYER2_TITLE_INSERT_NEW, 'player2 displayTitle')

# Player3 needs displayTitle
PLAYER3_TITLE_INSERT_OLD = """  const displayArtist = displayTrack?.artist ?? 'Select a song to begin'
  const activeTrackId = displayTrack?.id ?? null
  const upcomingTracks = getUpcomingTracks()"""

PLAYER3_TITLE_INSERT_NEW = """  const displayTitle = displayTrack?.title ?? 'Nothing playing'
  const displayArtist = displayTrack?.artist ?? 'Select a song to begin'
  const activeTrackId = displayTrack?.id ?? null
  const upcomingTracks = getUpcomingTracks()"""

app = must_replace(app, PLAYER3_TITLE_INSERT_OLD, PLAYER3_TITLE_INSERT_NEW, 'player3 displayTitle')

# Wire player4 shuffle - add toggleShuffle to destructure
PLAYER4_SHUFFLE_OLD = """    pause,
    resume,
    getUpcomingTracks,
  } = useDesktopPlayback()"""

PLAYER4_SHUFFLE_NEW = """    pause,
    resume,
    shuffleEnabled,
    toggleShuffle,
    getUpcomingTracks,
  } = useDesktopPlayback()"""

app = must_replace(app, PLAYER4_SHUFFLE_OLD, PLAYER4_SHUFFLE_NEW, 'player4 shuffle destructure')

# Player5 displayTitle if missing
if 'const displayTitle = displayTrack?.title ?? PSD_PLAYER5_TITLE' in app:
    app = app.replace(
        'const displayTitle = displayTrack?.title ?? PSD_PLAYER5_TITLE',
        "const displayTitle = displayTrack?.title ?? 'Nothing playing'",
        1,
    )

if 'const displayArtist = displayTrack?.artist ?? PSD_PLAYER5_ARTIST' in app:
    app = app.replace(
        'const displayArtist = displayTrack?.artist ?? PSD_PLAYER5_ARTIST',
        "const displayArtist = displayTrack?.artist ?? 'Select a song to begin'",
        1,
    )

if 'const displayAlbum = displayTrack?.album ?? PSD_PLAYER5_SOURCE' in app:
    app = app.replace(
        'const displayAlbum = displayTrack?.album ?? PSD_PLAYER5_SOURCE',
        'const displayAlbum = displayTrack?.album ?? null',
        1,
    )

# Player5 stats and queue count
app = app.replace(
    'const queueCount = currentQueue.length > 0 ? String(currentQueue.length) : PSD_PLAYER5_STATS.songs',
    "const queueCount = currentQueue.length > 0 ? String(currentQueue.length) : '0'",
    1,
)

app = app.replace(
    """                <strong>{PSD_PLAYER5_STATS.duration}</strong>""",
    '                <strong>{formatPlaybackTime(progressMax)}</strong>',
    1,
)

app = app.replace(
    """                <strong>{PSD_PLAYER5_STATS.plays}</strong>""",
    '                <strong>—</strong>',
    1,
)

app = app.replace(
    """                <strong>{PSD_PLAYER5_STATS.likes}</strong>""",
    '                <strong>—</strong>',
    1,
)

# Replace player shell body lock effects with usePlayerShellChrome (not the hook definition).
SHELL_CHROME_OLD = """  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])"""

SHELL_CHROME_NEW = '  usePlayerShellChrome(onClose)'

for _ in range(12):
    if SHELL_CHROME_OLD not in app:
        break
    app = app.replace(SHELL_CHROME_OLD, SHELL_CHROME_NEW, 1)

CSS_BLOCK = """
/* —— Phase 44P: Full-screen player foundation wiring —— */
.player-lyrics-empty {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 1.5rem 0;
  color: rgba(255, 255, 255, 0.72);
}

.player-lyrics-empty-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.92);
}

.player-lyrics-empty-detail,
.player-lyrics-empty-credit,
.player-queue-empty-detail,
.player-details-empty-detail {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.58);
}

.player-queue-empty,
.player-details-empty {
  padding: 1.5rem 0;
}

.player-queue-empty-title,
.player-details-empty-title {
  margin: 0 0 0.35rem;
  font-size: 1rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
}

.player-queue-panel {
  max-height: 100%;
  overflow: auto;
}

.player-queue-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.player-queue-row {
  width: 100%;
  display: grid;
  grid-template-columns: 2rem 2.75rem 1fr auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.45rem 0.5rem;
  border: 0;
  border-radius: 0.65rem;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.player-queue-row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.player-queue-list .is-current .player-queue-row {
  background: rgba(168, 85, 247, 0.14);
}

.player-queue-copy {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.player-queue-copy strong,
.player-queue-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-queue-copy span {
  font-size: 0.82rem;
  opacity: 0.72;
}

.player-queue-duration {
  font-size: 0.82rem;
  opacity: 0.7;
}

.player-details-list {
  margin: 0;
  display: grid;
  gap: 0.85rem;
}

.player-details-list div {
  display: grid;
  gap: 0.2rem;
}

.player-details-list dt {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
}

.player-details-list dd {
  margin: 0;
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.9);
}

.psd-player-transport-btn.is-active {
  color: #c084fc;
}

.psd-player-transport-btn.is-repeat-one::after {
  content: '1';
  position: absolute;
  right: 0.15rem;
  bottom: 0.1rem;
  font-size: 0.55rem;
  font-weight: 700;
}
"""

if 'Phase 44P' not in css:
    css = css.rstrip() + CSS_BLOCK

write(APP, app)
write(CSS, css)
print('Phase 44P player foundation applied.')

import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ArtworkImage } from '../ArtworkImage'
import { HiddenTunesBrandMark } from '../HiddenTunesBrandMark'
import { FullPlayerTransportControls } from './FullPlayerTransportControls'
import { PlayerQueuePanel } from './PlayerShellPanels'
import { PlayerModeLauncher } from '../PlayerModeLauncher'
import {
  useDesktopPlayback,
  useDesktopPlaybackProgress,
} from '../../context/DesktopPlaybackProvider'
import { formatPlaybackTime } from '../../lib/player/formatPlaybackTime'
import {
  PLAYER_IDLE_ARTIST,
  PLAYER_IDLE_TITLE,
  resolvePlayerShellMetadata,
  resolvePlayerSubtitle,
} from '../../lib/playerDisplayMetadata'
import { familyLabelForSong, resolvePlaybackCapabilities } from '../../lib/queue'
import { isMusicCatalogSong } from '../../lib/home/isMusicCatalogSong'
import { useMusicLikes } from '../../lib/home/useMusicLikes'
import type { NowPlayingStyle } from '../../lib/nowPlayingStyle'
import { apiSongToPlaylistItem, usePlaylistPicker } from '../playlists/playlistPicker'

type DesktopPersistentPlayerProps = {
  onOpenPlayerByStyle: (style: NowPlayingStyle) => void
  onNavigateHome?: () => void
  onOpenQueuePage?: () => void
}

function NeonEqBadge({ isPlaying }: { isPlaying: boolean }) {
  return (
    <span
      className={`ht-player-eq${isPlaying ? ' is-playing' : ''}`}
      aria-hidden="true"
    >
      <i /><i /><i />
    </span>
  )
}

function trackLooksExplicit(track: { tags?: string[]; genre?: string | null } | null): boolean {
  if (!track) return false
  if (track.tags?.some((t) => /mature|adult|explicit/i.test(t))) return true
  return /adult|mature|explicit/i.test(track.genre || '')
}

/**
 * Persistent desktop Now Playing rail — Hidden Tunes Player page adapted for sidebar.
 * View over DesktopPlaybackProvider only — does not own audio/video/queue.
 */
export const DesktopPersistentPlayer = memo(function DesktopPersistentPlayer({
  onOpenPlayerByStyle,
  onNavigateHome,
  onOpenQueuePage,
}: DesktopPersistentPlayerProps) {
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    queueTitle,
    isPlaying,
    isLoading,
    error,
    volume,
    audioQualityMode,
    autoNextEnabled,
    setAutoNextEnabled,
    seekTo,
    setVolume,
    clearUpcomingQueue,
    getUpcomingTracks,
  } = useDesktopPlayback()
  const { positionSeconds, durationSeconds } = useDesktopPlaybackProgress()
  const { isLiked, toggleLiked } = useMusicLikes()
  const { openPlaylistPicker } = usePlaylistPicker()

  const progressTrackRef = useRef<HTMLDivElement>(null)
  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const volumeBeforeMuteRef = useRef(1)
  const scrollFrameRef = useRef<number | null>(null)
  const isSeekingRef = useRef(false)
  const isAdjustingVolumeRef = useRef(false)
  const [scrubSeconds, setScrubSeconds] = useState<number | null>(null)
  const [queueOpen, setQueueOpen] = useState(true)
  const [compactHero, setCompactHero] = useState(false)

  const handleRailScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = event.currentTarget.scrollTop
    if (scrollFrameRef.current != null) return
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      setCompactHero(scrollTop > 96)
      scrollFrameRef.current = null
    })
  }, [])

  const activeTrack =
    currentIndex >= 0 ? (currentTrack ?? currentQueue[currentIndex] ?? null) : null
  const hasPlayback = Boolean(activeTrack && currentQueue.length > 0 && currentIndex >= 0)

  const shellMetadata = useMemo(
    () => resolvePlayerShellMetadata({
      currentTrack: activeTrack,
      preferredTrack: null,
      queueTitle,
      audioQualityMode,
    }),
    [activeTrack, audioQualityMode, queueTitle],
  )

  const caps = useMemo(
    () => resolvePlaybackCapabilities(activeTrack),
    [activeTrack],
  )

  const familyLabel = useMemo(
    () => (activeTrack ? familyLabelForSong(activeTrack) : null),
    [activeTrack],
  )

  const subtitle = resolvePlayerSubtitle(activeTrack)
  const displayTitle = hasPlayback ? shellMetadata.displayTitle : PLAYER_IDLE_TITLE
  const displayArtist = hasPlayback ? shellMetadata.displayArtist : PLAYER_IDLE_ARTIST
  const displayAlbum = hasPlayback ? shellMetadata.displayAlbum : null
  const displayArtwork = hasPlayback ? shellMetadata.displayArtwork : null
  const isExplicit = trackLooksExplicit(activeTrack)

  const showShuffleRepeat = Boolean(activeTrack)
    && caps.family === 'song'

  const canLikeTrack = Boolean(activeTrack && isMusicCatalogSong(activeTrack))
  const trackLiked = canLikeTrack && activeTrack ? isLiked(activeTrack.id) : false

  const progressMax = !hasPlayback || !caps.showFiniteProgress || !caps.seek
    ? 0
    : (durationSeconds > 0 ? durationSeconds : 0)
  const progressValue = scrubSeconds ?? (progressMax > 0 ? Math.min(positionSeconds, progressMax) : 0)
  const progressPercent =
    progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0
  const remainingSeconds = progressMax > 0 ? Math.max(0, progressMax - progressValue) : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))
  const canClearQueue = getUpcomingTracks().length > 0

  const sessionContext = useMemo(() => {
    if (!hasPlayback) return 'Hidden Tunes'
    if (caps.isLive) return familyLabel ?? 'Live'
    return displayAlbum || queueTitle || familyLabel || 'Hidden Tunes'
  }, [caps.isLive, displayAlbum, familyLabel, hasPlayback, queueTitle])

  const statusLabel = !hasPlayback
    ? null
    : isLoading
      ? 'LOADING'
      : isPlaying
        ? (caps.isLive ? 'LIVE' : 'PLAYING')
        : 'PAUSED'

  const resolveSeekSeconds = useCallback(
    (clientX: number) => {
      const trackEl = progressTrackRef.current
      if (!trackEl || progressMax <= 0) return null
      const rect = trackEl.getBoundingClientRect()
      if (rect.width <= 0) return null
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * progressMax
    },
    [progressMax],
  )

  const resolveVolume = useCallback((clientX: number) => {
    const trackEl = volumeTrackRef.current
    if (!trackEl) return null
    const rect = trackEl.getBoundingClientRect()
    if (rect.width <= 0) return null
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }, [])

  const handleSeekClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!hasPlayback || progressMax <= 0 || isLoading || isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!hasPlayback || progressMax <= 0 || isLoading) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds == null) return
    isSeekingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    setScrubSeconds(seconds)
    seekTo(seconds)
  }

  const handleSeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) setScrubSeconds(seconds)
  }

  const handleSeekPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    isSeekingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (scrubSeconds != null) seekTo(scrubSeconds)
    setScrubSeconds(null)
  }

  const handleVolumeClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isAdjustingVolumeRef.current) return
    const nextVolume = resolveVolume(event.clientX)
    if (nextVolume != null) setVolume(nextVolume)
  }

  const handleVolumePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const nextVolume = resolveVolume(event.clientX)
    if (nextVolume == null) return
    isAdjustingVolumeRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    setVolume(nextVolume)
  }

  const handleVolumePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isAdjustingVolumeRef.current) return
    const nextVolume = resolveVolume(event.clientX)
    if (nextVolume != null) setVolume(nextVolume)
  }

  const handleVolumePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isAdjustingVolumeRef.current) return
    isAdjustingVolumeRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleMuteToggle = () => {
    if (volume <= 0) {
      setVolume(volumeBeforeMuteRef.current > 0 ? volumeBeforeMuteRef.current : 0.7)
      return
    }
    volumeBeforeMuteRef.current = volume
    setVolume(0)
  }

  return (
    <aside
      className="queue-rail queue-rail--workspace now-playing-rail now-playing-rail--psd ht-persistent-player ht-player-page"
      aria-label="Now playing"
      data-playing={isPlaying ? 'true' : 'false'}
      data-loading={isLoading ? 'true' : 'false'}
      data-idle={hasPlayback ? 'false' : 'true'}
      data-family={caps.family}
      data-live={caps.isLive ? 'true' : 'false'}
      data-ht-persistent-player="true"
    >
      <div className="ht-player-ambient" aria-hidden="true">
        <span className="ht-player-orb ht-player-orb--purple" />
        <span className="ht-player-orb ht-player-orb--cyan" />
      </div>

      <div
        className="now-playing-rail-inner ht-persistent-player-inner ht-player-page-inner"
        data-compact-hero={compactHero ? 'true' : 'false'}
        onScroll={handleRailScroll}
        tabIndex={0}
        aria-label="Now playing and queue"
      >
        <header className="ht-player-header">
          <div className="ht-player-header-copy">
            <p className="ht-player-session-label">Now Playing</p>
            <p className="ht-player-session-context">{sessionContext}</p>
          </div>
          <div className="ht-player-header-chips">
            {hasPlayback && familyLabel ? (
              <span className="ht-persistent-player-family">{familyLabel}</span>
            ) : null}
            {hasPlayback && caps.isLive ? (
              <span className="ht-persistent-player-live" aria-label="Live">LIVE</span>
            ) : null}
            {hasPlayback && caps.isLocalDownload ? (
              <span className="ht-persistent-player-local">Downloaded</span>
            ) : null}
          </div>
        </header>

        {!hasPlayback ? (
          <section className="ht-persistent-player-empty ht-player-empty" aria-label="Nothing playing">
            <div className="ht-persistent-player-empty-art" aria-hidden="true">
              <HiddenTunesBrandMark className="ht-persistent-player-brand-mark" />
            </div>
            <h3 className="ht-persistent-player-empty-title">Nothing Playing</h3>
            <p className="ht-persistent-player-empty-copy">
              Ready when you are — choose something from Home to start listening. Your Hidden Tunes player lives here.
            </p>
            <div className="ht-persistent-player-empty-actions">
              {onNavigateHome ? (
                <button type="button" className="ht-persistent-player-empty-btn" onClick={onNavigateHome}>
                  Browse Home
                </button>
              ) : null}
              {onOpenQueuePage ? (
                <button
                  type="button"
                  className="ht-persistent-player-empty-btn ht-persistent-player-empty-btn--ghost"
                  onClick={onOpenQueuePage}
                >
                  Open Queue
                </button>
              ) : null}
            </div>
            <div className="ht-player-empty-transport" aria-hidden="true">
              <FullPlayerTransportControls activeTrackId={null} showShuffleRepeat />
            </div>
          </section>
        ) : (
          <>
            <section className="ht-player-chrome" aria-label="Current media">
              <div className="ht-player-art-stage">
                <span className="ht-player-art-halo" aria-hidden="true" />
                <div className={`ht-player-art-ring${isPlaying ? ' is-playing' : ''}`}>
                  <div className="ht-player-art-frame">
                    <ArtworkImage
                      src={displayArtwork}
                      alt=""
                      seed={activeTrack?.id ?? 'persistent-player'}
                      label={displayTitle}
                      variant="circle"
                      priority
                    />
                    {isLoading ? (
                      <span className="rail-psd-art-spinner player-spinner" aria-hidden="true" />
                    ) : null}
                  </div>
                </div>
                <NeonEqBadge isPlaying={isPlaying && !isLoading} />
              </div>

              <div className="ht-player-meta">
                {statusLabel ? (
                  <span className={`ht-player-status-pill${caps.isLive ? ' is-live' : ''}`}>
                    {statusLabel}
                  </span>
                ) : null}
                <div className="ht-player-title-row">
                  <h3 className="ht-player-track-title rail-psd-track-title" title={displayTitle}>
                    {displayTitle}
                  </h3>
                  {isExplicit ? (
                    <span className="ht-player-explicit" title="Explicit">E</span>
                  ) : null}
                </div>
                <p className="ht-player-track-artist rail-psd-track-artist" title={displayArtist}>
                  {displayArtist}
                </p>
                {displayAlbum ? (
                  <p className="ht-player-track-album rail-psd-track-album" title={displayAlbum}>{displayAlbum}</p>
                ) : null}
                {subtitle ? (
                  <p className="ht-persistent-player-subtitle">{subtitle}</p>
                ) : null}

                <div className="ht-player-meta-actions">
                  {canLikeTrack && activeTrack ? (
                    <button
                      type="button"
                      className={`ht-player-favorite${trackLiked ? ' is-liked' : ''}`}
                      aria-label={trackLiked ? `Unlike ${displayTitle}` : `Favorite ${displayTitle}`}
                      aria-pressed={trackLiked}
                      onClick={() => toggleLiked(activeTrack.id, activeTrack)}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill={trackLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                        <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
                      </svg>
                      <span>Favorite</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`ht-player-queue-toggle${queueOpen ? ' is-active' : ''}`}
                    onClick={() => setQueueOpen((open) => !open)}
                    aria-pressed={queueOpen}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                    </svg>
                    <span>Queue</span>
                  </button>
                </div>
              </div>

              {error ? (
                <p className="ht-persistent-player-error" role="alert">{error}</p>
              ) : null}

              {caps.showFiniteProgress && caps.seek ? (
                <div
                  className="ht-player-progress"
                  style={{ ['--ht-player-progress' as string]: `${progressPercent}%` }}
                  role="group"
                  aria-label="Playback progress"
                >
                  <div
                    ref={progressTrackRef}
                    className={
                      'ht-player-progress-track'
                      + (progressMax > 0 ? ' is-interactive' : '')
                    }
                    role="slider"
                    aria-label="Seek position"
                    aria-valuemin={0}
                    aria-valuemax={Math.round(progressMax)}
                    aria-valuenow={Math.round(progressValue)}
                    aria-disabled={progressMax <= 0 || isLoading}
                    onClick={handleSeekClick}
                    onPointerDown={handleSeekPointerDown}
                    onPointerMove={handleSeekPointerMove}
                    onPointerUp={handleSeekPointerUp}
                    onPointerCancel={handleSeekPointerUp}
                  >
                    <div className="ht-player-progress-fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="ht-player-progress-times" aria-hidden="true">
                    <span>{formatPlaybackTime(progressValue)}</span>
                    <span>
                      {progressMax > 0
                        ? `-${formatPlaybackTime(remainingSeconds)}`
                        : '—'}
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  className="ht-persistent-player-live-progress ht-player-live-status"
                  role="status"
                  aria-label={caps.isLive ? 'Live status' : 'Playback status'}
                >
                  {caps.isLive ? <span className="ht-persistent-player-live">LIVE</span> : null}
                  <span>
                    {isLoading
                      ? 'Connecting'
                      : caps.isLive
                        ? (isPlaying ? 'On air · Live stream' : 'Paused')
                        : (isPlaying ? 'Playing' : 'Paused')}
                  </span>
                </div>
              )}

              <div className="ht-player-transport-dock">
                <FullPlayerTransportControls
                  activeTrackId={activeTrack?.id ?? null}
                  showShuffleRepeat={showShuffleRepeat}
                />
              </div>
            </section>

            {queueOpen ? (
              <section className="ht-player-queue-section ht-persistent-player-queue" aria-label="Queue">
                <div className="ht-player-queue-toolbar">
                  <p className="ht-player-card-eyebrow">Up Next <span>{getUpcomingTracks().length} items</span></p>
                  {isMusicCatalogSong(activeTrack) ? (
                    <button
                      type="button"
                      className="ht-player-clear-upcoming"
                      aria-pressed={autoNextEnabled}
                      onClick={() => setAutoNextEnabled(!autoNextEnabled)}
                    >
                      Auto-Next {autoNextEnabled ? 'On' : 'Off'}
                    </button>
                  ) : null}
                  {activeTrack && isMusicCatalogSong(activeTrack) ? <button type="button" className="ht-player-favorite" aria-label={`Add ${displayTitle} to playlist`} onClick={() => openPlaylistPicker({ items: [apiSongToPlaylistItem(activeTrack)], source: 'now-playing' })}><span>+ Playlist</span></button> : null}
                  {canClearQueue ? (
                    <button
                      type="button"
                      className="ht-player-clear-upcoming"
                      onClick={() => clearUpcomingQueue()}
                    >
                      Clear upcoming
                    </button>
                  ) : null}
                </div>
                <PlayerQueuePanel showHeader={false} />
              </section>
            ) : null}
          </>
        )}

        <footer className="ht-player-footer ht-persistent-player-footer">
          <div className="ht-player-volume-card" role="group" aria-label="Volume">
            <p className="ht-player-card-eyebrow">Volume</p>
            <div className="ht-player-volume-row">
              <button
                type="button"
                className="control-btn ht-persistent-player-mute"
                aria-label={volume <= 0 ? 'Unmute' : 'Mute'}
                onClick={handleMuteToggle}
              >
                {volume <= 0 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M11 5L6 9H3v6h3l5 4V5z" />
                    <path d="M23 9l-6 6M17 9l6 6" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M11 5L6 9H3v6h3l5 4V5z" />
                    <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
                  </svg>
                )}
              </button>
              <div
                ref={volumeTrackRef}
                className="ht-player-volume-track"
                style={{ ['--ht-player-volume' as string]: `${volumePercent}%` }}
                role="slider"
                aria-label="Volume"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(volumePercent)}
                onClick={handleVolumeClick}
                onPointerDown={handleVolumePointerDown}
                onPointerMove={handleVolumePointerMove}
                onPointerUp={handleVolumePointerUp}
                onPointerCancel={handleVolumePointerUp}
              >
                <div className="ht-player-volume-fill" style={{ width: `${volumePercent}%` }} />
              </div>
            </div>
          </div>
          <PlayerModeLauncher
            hasPlayback={hasPlayback}
            onOpenPlayerByStyle={onOpenPlayerByStyle}
            variant="sidebar"
          />
        </footer>
      </div>
    </aside>
  )
})

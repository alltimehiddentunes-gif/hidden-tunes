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

type DesktopPersistentPlayerProps = {
  onOpenPlayerByStyle: (style: NowPlayingStyle) => void
  onNavigateHome?: () => void
  onOpenQueuePage?: () => void
}

function BrandWaveformMark() {
  return (
    <svg className="brand-waveform ht-persistent-player-brand-mark" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect x="3" y="14" width="3" height="10" rx="1.5" fill="url(#htPersistWaveGold)" />
      <rect x="9" y="8" width="3" height="22" rx="1.5" fill="url(#htPersistWaveGold)" />
      <rect x="15" y="12" width="3" height="14" rx="1.5" fill="url(#htPersistWaveGold)" />
      <rect x="21" y="5" width="3" height="28" rx="1.5" fill="url(#htPersistWaveGold)" />
      <rect x="27" y="10" width="3" height="18" rx="1.5" fill="url(#htPersistWaveGold)" />
      <defs>
        <linearGradient id="htPersistWaveGold" x1="18" y1="4" x2="18" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFBA3D" />
          <stop offset="1" stopColor="#E8B923" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/**
 * Persistent desktop Now Playing rail.
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
    seekTo,
    setVolume,
    clearUpcomingQueue,
    getUpcomingTracks,
  } = useDesktopPlayback()
  const { positionSeconds, durationSeconds } = useDesktopPlaybackProgress()
  const { isLiked, toggleLiked } = useMusicLikes()

  const progressTrackRef = useRef<HTMLDivElement>(null)
  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const volumeBeforeMuteRef = useRef(1)
  const isSeekingRef = useRef(false)
  const isAdjustingVolumeRef = useRef(false)
  const [scrubSeconds, setScrubSeconds] = useState<number | null>(null)
  const [queueOpen, setQueueOpen] = useState(true)

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
  const volumePercent = Math.min(100, Math.max(0, volume * 100))
  const canClearQueue = getUpcomingTracks().length > 0

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
      className="queue-rail queue-rail--workspace now-playing-rail now-playing-rail--psd ht-persistent-player"
      aria-label="Now playing"
      data-playing={isPlaying ? 'true' : 'false'}
      data-loading={isLoading ? 'true' : 'false'}
      data-idle={hasPlayback ? 'false' : 'true'}
      data-family={caps.family}
      data-ht-persistent-player="true"
    >
      <div className="now-playing-rail-inner ht-persistent-player-inner">
        <header className="rail-psd-header ht-persistent-player-header">
          <h2 className="rail-psd-title">Now Playing</h2>
          {hasPlayback && familyLabel ? (
            <span className="ht-persistent-player-family">{familyLabel}</span>
          ) : null}
          {hasPlayback && caps.isLive ? (
            <span className="ht-persistent-player-live" aria-label="Live">LIVE</span>
          ) : null}
          {hasPlayback && caps.isLocalDownload ? (
            <span className="ht-persistent-player-local">Downloaded</span>
          ) : null}
        </header>

        {!hasPlayback ? (
          <section className="ht-persistent-player-empty" aria-label="Nothing playing">
            <div className="ht-persistent-player-empty-art" aria-hidden="true">
              <BrandWaveformMark />
            </div>
            <h3 className="ht-persistent-player-empty-title">Nothing Playing</h3>
            <p className="ht-persistent-player-empty-copy">
              Choose music, radio, podcasts, audiobooks, TV or another playable item
            </p>
            <div className="ht-persistent-player-empty-actions">
              {onNavigateHome ? (
                <button type="button" className="ht-persistent-player-empty-btn" onClick={onNavigateHome}>
                  Continue Listening
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
          </section>
        ) : (
          <>
            <section className="rail-psd-stage" aria-label="Current media">
              <div className="rail-psd-art-shell">
                <span className="rail-psd-art-glow" aria-hidden="true" />
                <div className="rail-psd-art-frame">
                  <ArtworkImage
                    src={activeTrack?.artwork ?? null}
                    alt=""
                    seed={activeTrack?.id ?? 'persistent-player'}
                    label={displayTitle}
                    priority
                  />
                  {isLoading ? (
                    <span className="rail-psd-art-spinner player-spinner" aria-hidden="true" />
                  ) : null}
                </div>
                {canLikeTrack && activeTrack ? (
                  <button
                    type="button"
                    className={`ht-persistent-player-like${trackLiked ? ' is-liked' : ''}`}
                    aria-label={trackLiked ? `Unlike ${displayTitle}` : `Like ${displayTitle}`}
                    aria-pressed={trackLiked}
                    onClick={() => toggleLiked(activeTrack.id, activeTrack)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={trackLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                      <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
                    </svg>
                  </button>
                ) : null}
              </div>

              <div className="rail-psd-track-head">
                <div className="rail-psd-title-row">
                  <h3 className="rail-psd-track-title">{displayTitle}</h3>
                </div>
                <p className="rail-psd-track-artist">
                  <span>{displayArtist}</span>
                </p>
                {displayAlbum ? (
                  <p className="rail-psd-track-album">{displayAlbum}</p>
                ) : null}
                {subtitle ? (
                  <p className="ht-persistent-player-subtitle">{subtitle}</p>
                ) : null}
              </div>

              {error ? (
                <p className="ht-persistent-player-error" role="alert">{error}</p>
              ) : null}

              {caps.showFiniteProgress && caps.seek ? (
                <div
                  className="rail-psd-progress-wrap"
                  style={{ ['--rail-psd-progress' as string]: `${progressPercent}%` }}
                  role="group"
                  aria-label="Playback progress"
                >
                  <div
                    ref={progressTrackRef}
                    className={
                      'rail-psd-progress-track'
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
                    <div className="rail-psd-progress-fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="rail-psd-progress-times" aria-hidden="true">
                    <span>{formatPlaybackTime(progressValue)}</span>
                    <span>{progressMax > 0 ? formatPlaybackTime(progressMax) : '—'}</span>
                  </div>
                </div>
              ) : (
                <div
                  className="ht-persistent-player-live-progress"
                  role="status"
                  aria-label={caps.isLive ? 'Live status' : 'Playback status'}
                >
                  {caps.isLive ? <span className="ht-persistent-player-live">LIVE</span> : null}
                  <span>
                    {isLoading
                      ? 'Connecting'
                      : caps.isLive
                        ? (isPlaying ? 'On air' : 'Paused')
                        : (isPlaying ? 'Playing' : 'Paused')}
                  </span>
                </div>
              )}

              <div className="rail-psd-transport-wrap">
                <FullPlayerTransportControls
                  activeTrackId={activeTrack?.id ?? null}
                  showShuffleRepeat={showShuffleRepeat}
                />
              </div>
            </section>

            <div className="rail-psd-actions ht-persistent-player-actions">
              <button
                type="button"
                className={`rail-psd-action${queueOpen ? ' is-active' : ''}`}
                onClick={() => setQueueOpen((open) => !open)}
                aria-pressed={queueOpen}
              >
                Queue
              </button>
              {canClearQueue ? (
                <button
                  type="button"
                  className="rail-psd-action"
                  onClick={() => clearUpcomingQueue()}
                >
                  Clear upcoming
                </button>
              ) : null}
            </div>

            {queueOpen ? (
              <section className="rail-psd-queue-section ht-persistent-player-queue" aria-label="Queue">
                <PlayerQueuePanel showHeader />
              </section>
            ) : null}
          </>
        )}

        <footer className="rail-psd-footer ht-persistent-player-footer">
          <div className="rail-psd-volume" role="group" aria-label="Volume">
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
              className="rail-psd-volume-track"
              style={{ ['--rail-psd-volume' as string]: `${volumePercent}%` }}
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
              <div className="rail-psd-volume-fill" style={{ width: `${volumePercent}%` }} />
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

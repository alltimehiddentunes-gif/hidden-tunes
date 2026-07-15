import { memo, useCallback, useMemo } from 'react'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import { ArtworkImage } from '../ArtworkImage'
import { isTvQueueSong } from '../../lib/tv/tvPlaybackAdapter'
import { isTvFavorite, toggleTvFavorite } from '../../lib/tv/tvLocalState'

type TvNowPlayingPanelProps = {
  onBrowseAll: () => void
  onBrowseFeatured: () => void
}

function getVideoElement(): HTMLVideoElement | null {
  const node = document.querySelector('video[data-ht-tv-playback="true"]')
  return node instanceof HTMLVideoElement ? node : null
}

export const TvNowPlayingPanel = memo(function TvNowPlayingPanel({
  onBrowseAll,
  onBrowseFeatured,
}: TvNowPlayingPanelProps) {
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    isPlaying,
    isLoading,
    error,
    volume,
    setVolume,
    pause,
    resume,
    queueContext,
  } = useDesktopPlayback()

  const activeTrack =
    currentIndex >= 0 ? (currentTrack ?? currentQueue[currentIndex] ?? null) : null
  const isTvActive = Boolean(activeTrack && isTvQueueSong(activeTrack))

  const isFavorite = useMemo(() => {
    if (!activeTrack) return false
    const channelId = activeTrack.id.replace(/^tv-/, '')
    return isTvFavorite(channelId)
  }, [activeTrack])

  const handleToggleFavorite = useCallback(() => {
    if (!activeTrack) return
    const channelId = activeTrack.id.replace(/^tv-/, '')
    toggleTvFavorite(channelId)
  }, [activeTrack])

  const handleStop = useCallback(() => {
    const video = getVideoElement()
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    pause()
  }, [pause])

  const handleFullscreen = useCallback(async () => {
    const video = getVideoElement()
    if (!video) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      await video.requestFullscreen()
    } catch {
      // Fullscreen may be unavailable — ignore safely.
    }
  }, [])

  const handlePictureInPicture = useCallback(async () => {
    const video = getVideoElement()
    if (!video || !document.pictureInPictureEnabled) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
        return
      }
      await video.requestPictureInPicture()
    } catch {
      // PiP may be unavailable in this Electron build.
    }
  }, [])

  const handleMuteToggle = useCallback(() => {
    setVolume(volume <= 0 ? 0.85 : 0)
  }, [setVolume, volume])

  if (!isTvActive) {
    return (
      <aside className="tv-rail tv-rail--discover" aria-label="TV discovery">
        <header className="tv-rail-header">
          <h2>Discover More</h2>
        </header>
        <div className="tv-discover-links">
          <button type="button" className="tv-discover-card" onClick={onBrowseFeatured}>
            <strong>Featured channels</strong>
            <span>Hand-picked live stations</span>
          </button>
          <button type="button" className="tv-discover-card" onClick={onBrowseAll}>
            <strong>Browse all channels</strong>
            <span>Explore the full TV catalog</span>
          </button>
        </div>
        <p className="tv-rail-note">Schedule unavailable.</p>
      </aside>
    )
  }

  return (
    <aside className="tv-rail tv-rail--now-playing" aria-label="Now playing on TV">
      <header className="tv-rail-header">
        <h2>Now Playing on TV</h2>
        <span className="tv-live-badge">LIVE</span>
      </header>

      <div className="tv-rail-art">
        <ArtworkImage
          src={activeTrack?.artwork ?? null}
          alt=""
          seed={activeTrack?.id ?? 'tv-rail'}
          label={activeTrack?.title ?? 'TV'}
          priority
        />
      </div>

      <div className="tv-rail-meta">
        <h3>{activeTrack?.title}</h3>
        <p>{activeTrack?.artist}</p>
        {queueContext === 'tv' ? (
          <p className="tv-rail-status">
            {isLoading ? 'Connecting…' : isPlaying ? 'Live' : 'Paused'}
          </p>
        ) : null}
        {error ? <p className="tv-rail-error" role="alert">{error}</p> : null}
      </div>

      <div className="tv-rail-controls" role="group" aria-label="TV playback controls">
        <button
          type="button"
          className={`tv-rail-btn${isFavorite ? ' is-active' : ''}`}
          onClick={handleToggleFavorite}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          ♥
        </button>
        <button
          type="button"
          className="tv-rail-btn tv-rail-btn--gold"
          onClick={() => {
            if (isLoading) return
            if (isPlaying) {
              pause()
              return
            }
            void resume()
          }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <button type="button" className="tv-rail-btn" onClick={handleStop} aria-label="Stop">
          ■
        </button>
        <button type="button" className="tv-rail-btn" onClick={handleMuteToggle} aria-label={volume <= 0 ? 'Unmute' : 'Mute'}>
          {volume <= 0 ? '🔇' : '🔊'}
        </button>
        <button type="button" className="tv-rail-btn" onClick={() => void handleFullscreen()} aria-label="Fullscreen">
          ⛶
        </button>
        <button
          type="button"
          className="tv-rail-btn"
          onClick={() => void handlePictureInPicture()}
          aria-label="Picture in picture"
        >
          ⧉
        </button>
      </div>

      <section className="tv-rail-section" aria-labelledby="tv-upnext-heading">
        <h3 id="tv-upnext-heading">Coming Up Next</h3>
        <p className="tv-rail-note">Schedule unavailable.</p>
      </section>

      <section className="tv-rail-section" aria-labelledby="tv-discover-heading">
        <h3 id="tv-discover-heading">Discover More</h3>
        <div className="tv-discover-links tv-discover-links--compact">
          <button type="button" className="tv-discover-card" onClick={onBrowseFeatured}>
            <strong>Featured channels</strong>
          </button>
          <button type="button" className="tv-discover-card" onClick={onBrowseAll}>
            <strong>Browse all channels</strong>
          </button>
        </div>
      </section>
    </aside>
  )
})

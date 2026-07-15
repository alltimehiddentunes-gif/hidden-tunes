import { memo, useCallback, useMemo } from 'react'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import { isTvQueueSong } from '../../lib/tv/tvPlaybackAdapter'
import { isTvFavorite, toggleTvFavorite } from '../../lib/tv/tvLocalState'
import { acquireTvVideoPlaybackService } from '../../lib/tv/tvVideoPlayback'
import { TvVideoSurface } from './TvVideoSurface'

type TvNowPlayingPanelProps = {
  onBrowseAll: () => void
  onBrowseFeatured: () => void
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
    stopPlayback,
  } = useDesktopPlayback()

  const activeTrack =
    currentIndex >= 0 ? (currentTrack ?? currentQueue[currentIndex] ?? null) : null
  const isTvActive = Boolean(activeTrack && isTvQueueSong(activeTrack))

  const channelId = activeTrack?.id.replace(/^tv-/, '') ?? ''
  const pipSupported = useMemo(() => acquireTvVideoPlaybackService().supportsPictureInPicture(), [])

  const isFavorite = useMemo(() => {
    if (!channelId) return false
    return isTvFavorite(channelId)
  }, [channelId])

  const handleToggleFavorite = useCallback(() => {
    if (!channelId) return
    toggleTvFavorite(channelId)
  }, [channelId])

  const handlePlayPause = useCallback(() => {
    if (isLoading) return
    if (isPlaying) {
      pause()
      return
    }
    void resume()
  }, [isLoading, isPlaying, pause, resume])

  const handleStop = useCallback(() => {
    void stopPlayback()
  }, [stopPlayback])

  const handleFullscreen = useCallback(async () => {
    const surface = document.querySelector('.tv-video-surface')
    if (!(surface instanceof HTMLElement)) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      await surface.requestFullscreen()
    } catch {
      const video = acquireTvVideoPlaybackService().getVideoElement()
      try {
        await video.requestFullscreen()
      } catch {
        // Fullscreen may be unavailable — ignore safely.
      }
    }
  }, [])

  const handlePictureInPicture = useCallback(async () => {
    if (!pipSupported) return
    const video = acquireTvVideoPlaybackService().getVideoElement()
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
        return
      }
      await video.requestPictureInPicture()
    } catch {
      // PiP may be unavailable in this Electron build.
    }
  }, [pipSupported])

  const handleMuteToggle = useCallback(() => {
    setVolume(volume <= 0 ? 0.85 : 0)
  }, [setVolume, volume])

  if (!isTvActive || !activeTrack) {
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

      <TvVideoSurface
        channelId={channelId}
        title={activeTrack.title}
        artworkUrl={activeTrack.artwork}
        isLoading={isLoading}
        isPlaying={isPlaying}
        error={error}
        volume={volume}
        onPlayPause={handlePlayPause}
        onMuteToggle={handleMuteToggle}
        onVolumeChange={setVolume}
        onStop={handleStop}
        onFullscreen={() => void handleFullscreen()}
        onPictureInPicture={() => void handlePictureInPicture()}
        pipSupported={pipSupported}
        volumeMuted={volume <= 0}
      />

      <div className="tv-rail-meta">
        <div className="tv-rail-meta-row">
          <div>
            <h3>{activeTrack.title}</h3>
            <p>{activeTrack.artist}</p>
          </div>
          <button
            type="button"
            className={`tv-favorite-btn tv-favorite-btn--inline${isFavorite ? ' is-active' : ''}`}
            onClick={handleToggleFavorite}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            ♥
          </button>
        </div>
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

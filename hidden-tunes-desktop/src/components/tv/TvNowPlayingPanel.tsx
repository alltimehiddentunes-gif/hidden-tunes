import { memo, useCallback, useMemo, useState } from 'react'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import { isMotivationalVideoSong } from '../../lib/motivationals/motivationalPlaybackAdapter'
import { requiresVideoSurface } from '../../lib/player/resolveActivePlayerSurface'
import { resolvePlaybackCapabilities } from '../../lib/queue/capabilities'
import { isSportsQueueSong } from '../../lib/sports/sportsPlaybackAdapter'
import { isTvQueueSong } from '../../lib/tv/tvPlaybackAdapter'
import {
  resolveTvChannelTransportAvailability,
} from '../../lib/tv/tvChannelTransport'
import { isTvFavorite, toggleTvFavorite } from '../../lib/tv/tvLocalState'
import { acquireTvVideoPlaybackService } from '../../lib/tv/tvVideoPlayback'
import { TvVideoSurface } from './TvVideoSurface'
import type { VideoSurfaceLayout } from '../../lib/player/resolveVideoSurfaceLayout'

type TvNowPlayingPanelProps = {
  onBrowseAll: () => void
  onBrowseFeatured: () => void
  /** Presentation shell only — does not change the shared video owner. */
  videoLayout?: Exclude<VideoSurfaceLayout, 'none'>
}

type VideoFamily = 'tv' | 'sports' | 'motivational'

function resolveVideoFamily(track: Parameters<typeof isTvQueueSong>[0]): VideoFamily | null {
  if (!track) return null
  if (isTvQueueSong(track)) return 'tv'
  if (isSportsQueueSong(track)) return 'sports'
  if (isMotivationalVideoSong(track)) return 'motivational'
  return null
}

/**
 * Shared visible video rail for TV, Sports, and Motivational video.
 * Mounts the single HtmlVideoPlaybackService element via TvVideoSurface.
 * TV-only chrome (favorites, channel discover, LIVE) stays gated to TV.
 */
export const TvNowPlayingPanel = memo(function TvNowPlayingPanel({
  onBrowseAll,
  onBrowseFeatured,
  videoLayout = 'tv-cinema',
}: TvNowPlayingPanelProps) {
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    isPlaying,
    isLoading,
    error,
    volume,
    repeatMode,
    setVolume,
    pause,
    resume,
    next,
    previous,
    stopPlayback,
  } = useDesktopPlayback()

  const activeTrack =
    currentIndex >= 0 ? (currentQueue[currentIndex] ?? currentTrack ?? null) : null
  const videoFamily = resolveVideoFamily(activeTrack)
  const isVideoActive = Boolean(activeTrack && requiresVideoSurface(activeTrack))
  const isTvActive = videoFamily === 'tv'
  const capabilities = useMemo(
    () => resolvePlaybackCapabilities(activeTrack),
    [activeTrack],
  )

  const surfaceId = activeTrack?.id ?? ''
  const channelId = isTvActive ? activeTrack!.id.replace(/^tv-/, '') : surfaceId
  const pipSupported = useMemo(() => acquireTvVideoPlaybackService().supportsPictureInPicture(), [])
  const [cssFullscreenActive, setCssFullscreenActive] = useState(false)

  const transport = useMemo(() => {
    if (isTvActive) {
      return resolveTvChannelTransportAvailability({
        isActive: true,
        currentIndex,
        queueLength: currentQueue.length,
        isLoading,
        repeatMode,
      })
    }
    // Sports: no next/prev per capabilities. Motivational: allow when queue supports it.
    const hasPrevious = Boolean(capabilities.previous && currentIndex > 0)
    const hasNext = Boolean(
      capabilities.next && currentIndex >= 0 && currentIndex < currentQueue.length - 1,
    )
    return {
      hasPrevious,
      hasNext,
      canChangeChannel: !isLoading && (hasPrevious || hasNext),
    }
  }, [
    capabilities.next,
    capabilities.previous,
    currentIndex,
    currentQueue.length,
    isLoading,
    isTvActive,
    repeatMode,
  ])

  const isFavorite = useMemo(() => {
    if (!isTvActive || !channelId) return false
    return isTvFavorite(channelId)
  }, [channelId, isTvActive])

  const handleToggleFavorite = useCallback(() => {
    if (!isTvActive || !channelId || !activeTrack) return
    toggleTvFavorite(channelId, {
      title: activeTrack.title,
      channelName: activeTrack.album,
      artworkUrl: activeTrack.artwork,
      category: activeTrack.genre,
    })
  }, [activeTrack, channelId, isTvActive])

  const handlePlayPause = useCallback(() => {
    if (isLoading) return
    if (isPlaying) {
      pause()
      return
    }
    void resume()
  }, [isLoading, isPlaying, pause, resume])

  const handlePrevious = useCallback(() => {
    if (!transport.hasPrevious || !transport.canChangeChannel) return
    previous()
  }, [previous, transport.canChangeChannel, transport.hasPrevious])

  const handleNext = useCallback(() => {
    if (!transport.hasNext || !transport.canChangeChannel) return
    next()
  }, [next, transport.canChangeChannel, transport.hasNext])

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
      if (cssFullscreenActive) {
        setCssFullscreenActive(false)
        return
      }
      await surface.requestFullscreen()
    } catch {
      // Keep the common video-and-controls root intact when the platform API
      // is unavailable. Fullscreening the video alone strands our overlays.
      setCssFullscreenActive(true)
    }
  }, [cssFullscreenActive])

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

  if (!isVideoActive || !activeTrack || !videoFamily) {
    return (
      <aside className="tv-rail tv-rail--discover" aria-label="TV discovery" data-video-layout={videoLayout}>
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

  const headerTitle =
    videoFamily === 'tv'
      ? 'Now Playing on TV'
      : videoFamily === 'sports'
        ? 'Now Playing — Sports'
        : 'Now Playing — Motivational'

  const railAria =
    videoFamily === 'tv'
      ? 'Now playing on TV'
      : videoFamily === 'sports'
        ? 'Now playing Sports video'
        : 'Now playing Motivational video'

  const showLiveBadge = videoFamily === 'tv' || (videoFamily === 'sports' && capabilities.isLive)

  const upcoming = currentIndex >= 0
    ? currentQueue
      .slice(currentIndex + 1, currentIndex + 4)
      .filter((track) => {
        if (videoFamily === 'tv') return isTvQueueSong(track)
        if (videoFamily === 'sports') return isSportsQueueSong(track)
        return isMotivationalVideoSong(track)
      })
    : []

  return (
    <aside
      className={`tv-rail tv-rail--now-playing${videoLayout === 'motivational-contained' ? ' tv-rail--motivational-contained' : ''}`}
      aria-label={railAria}
      data-video-family={videoFamily}
      data-video-layout={videoLayout}
    >
      <header className="tv-rail-header">
        <h2>{headerTitle}</h2>
        {showLiveBadge ? <span className="tv-live-badge">LIVE</span> : null}
      </header>

      <TvVideoSurface
        channelId={channelId}
        title={activeTrack.title}
        artworkUrl={activeTrack.artwork}
        isLoading={isLoading}
        isPlaying={isPlaying}
        error={error}
        volume={volume}
        hasPrevious={transport.hasPrevious}
        hasNext={transport.hasNext}
        channelSwitchLocked={!transport.canChangeChannel}
        onPrevious={handlePrevious}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onMuteToggle={handleMuteToggle}
        onVolumeChange={setVolume}
        onStop={handleStop}
        onFullscreen={() => void handleFullscreen()}
        onPictureInPicture={() => void handlePictureInPicture()}
        pipSupported={pipSupported}
        volumeMuted={volume <= 0}
        cssFullscreenActive={cssFullscreenActive}
        showLiveBadge={showLiveBadge}
        ariaLabel={`Video for ${activeTrack.title}`}
        transportGroupLabel={videoFamily === 'tv' ? 'Channel transport' : 'Session transport'}
        previousLabel={videoFamily === 'tv' ? 'Previous channel' : 'Previous'}
        nextLabel={videoFamily === 'tv' ? 'Next channel' : 'Next'}
        volumeLabel="Volume"
        videoLayout={videoLayout}
      />

      <div className="tv-rail-meta">
        <div className="tv-rail-meta-row">
          <div>
            <h3>{activeTrack.title}</h3>
            <p>{activeTrack.artist}</p>
          </div>
          {isTvActive ? (
            <button
              type="button"
              className={`tv-favorite-btn tv-favorite-btn--inline${isFavorite ? ' is-active' : ''}`}
              onClick={handleToggleFavorite}
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              ♥
            </button>
          ) : null}
        </div>
      </div>

      <section className="tv-rail-section" aria-labelledby="tv-upnext-heading">
        <h3 id="tv-upnext-heading">Coming Up Next</h3>
        {upcoming.length > 0 ? (
          <ul className="tv-upnext-list">
            {upcoming.map((track) => (
              <li key={track.id}>{track.title}</li>
            ))}
          </ul>
        ) : (
          <p className="tv-rail-note">
            {videoFamily === 'tv' ? 'End of this channel list.' : 'No more items in this queue.'}
          </p>
        )}
      </section>

      {isTvActive ? (
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
      ) : null}
    </aside>
  )
})

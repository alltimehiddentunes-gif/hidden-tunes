import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { ArtworkImage } from '../ArtworkImage'
import { acquireTvVideoPlaybackService } from '../../lib/tv/tvVideoPlayback'
import type { VideoSurfaceLayout } from '../../lib/player/resolveVideoSurfaceLayout'

type TvVideoSurfaceProps = {
  channelId: string
  title: string
  artworkUrl: string | null
  isLoading: boolean
  isPlaying: boolean
  error: string | null
  volume: number
  hasPrevious: boolean
  hasNext: boolean
  channelSwitchLocked: boolean
  onPrevious: () => void
  onPlayPause: () => void
  onNext: () => void
  onMuteToggle: () => void
  onVolumeChange: (volume: number) => void
  onStop: () => void
  onFullscreen: () => void
  onPictureInPicture: () => void
  pipSupported: boolean
  volumeMuted: boolean
  cssFullscreenActive?: boolean
  /** TV live streams only — Sports/Motivational must not invent LIVE. */
  showLiveBadge?: boolean
  ariaLabel?: string
  transportGroupLabel?: string
  previousLabel?: string
  nextLabel?: string
  volumeLabel?: string
  videoLayout?: Exclude<VideoSurfaceLayout, 'none'>
}

export const TvVideoSurface = memo(function TvVideoSurface({
  channelId,
  title,
  artworkUrl,
  isLoading,
  isPlaying,
  error,
  volume,
  hasPrevious,
  hasNext,
  channelSwitchLocked,
  onPrevious,
  onPlayPause,
  onNext,
  onMuteToggle,
  onVolumeChange,
  onStop,
  onFullscreen,
  onPictureInPicture,
  pipSupported,
  volumeMuted,
  cssFullscreenActive = false,
  showLiveBadge = true,
  ariaLabel,
  transportGroupLabel = 'Channel transport',
  previousLabel = 'Previous channel',
  nextLabel = 'Next channel',
  volumeLabel = 'TV volume',
  videoLayout = 'tv-cinema',
}: TvVideoSurfaceProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const controlsTimerRef = useRef<number | null>(null)
  const [hasVideoFrames, setHasVideoFrames] = useState(false)
  const [nativeFullscreenActive, setNativeFullscreenActive] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)

  const fullscreenActive = nativeFullscreenActive || cssFullscreenActive

  const clearControlsTimer = useCallback(() => {
    if (controlsTimerRef.current == null) return
    window.clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = null
  }, [])

  const showControls = useCallback(() => {
    clearControlsTimer()
    setControlsVisible(true)
    if (!fullscreenActive || !isPlaying || isLoading || error) return
    controlsTimerRef.current = window.setTimeout(() => {
      const surface = surfaceRef.current
      if (surface?.contains(document.activeElement)) return
      setControlsVisible(false)
      controlsTimerRef.current = null
    }, 3000)
  }, [clearControlsTimer, error, fullscreenActive, isLoading, isPlaying])

  useEffect(() => {
    const syncFullscreen = () => {
      setNativeFullscreenActive(document.fullscreenElement === surfaceRef.current)
    }
    document.addEventListener('fullscreenchange', syncFullscreen)
    syncFullscreen()
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  useEffect(() => {
    showControls()
    return clearControlsTimer
  }, [clearControlsTimer, showControls])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined

    const service = acquireTvVideoPlaybackService()
    service.mount(mount)

    const video = service.getVideoElement()
    const syncFrames = () => {
      setHasVideoFrames(video.videoWidth > 0 && video.videoHeight > 0)
    }

    video.addEventListener('loadedmetadata', syncFrames)
    video.addEventListener('resize', syncFrames)
    video.addEventListener('playing', syncFrames)
    syncFrames()

    return () => {
      video.removeEventListener('loadedmetadata', syncFrames)
      video.removeEventListener('resize', syncFrames)
      video.removeEventListener('playing', syncFrames)
      service.unmount()
      setHasVideoFrames(false)
    }
  }, [])

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      showControls()
      const target = event.target as HTMLElement | null
      if (
        target
        && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }

      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault()
        onPlayPause()
        return
      }
      if (event.key === 'Escape' && cssFullscreenActive) {
        event.preventDefault()
        onFullscreen()
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        if (hasPrevious && !channelSwitchLocked) onPrevious()
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (hasNext && !channelSwitchLocked) onNext()
        return
      }
      if (event.key.toLowerCase() === 'm') {
        event.preventDefault()
        onMuteToggle()
        return
      }
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        onFullscreen()
      }
    },
    [channelSwitchLocked, cssFullscreenActive, hasNext, hasPrevious, onFullscreen, onMuteToggle, onNext, onPlayPause, onPrevious, showControls],
  )

  const showArtwork = isLoading || !hasVideoFrames
  const previousDisabled = !hasPrevious || channelSwitchLocked
  const nextDisabled = !hasNext || channelSwitchLocked
  const playDisabled = isLoading

  return (
    <div
      ref={surfaceRef}
      className={`tv-video-surface${cssFullscreenActive ? ' is-css-fullscreen' : ''}`}
      data-video-layout={videoLayout}
      data-fullscreen={fullscreenActive}
      data-controls-visible={!fullscreenActive || controlsVisible || !isPlaying || isLoading || Boolean(error)}
      tabIndex={0}
      role="region"
      aria-label={ariaLabel ?? `Live video for ${title}`}
      onKeyDown={handleKeyDown}
      onPointerMove={showControls}
      onPointerDown={showControls}
      onTouchStart={showControls}
      onFocusCapture={showControls}
      onBlurCapture={showControls}
    >
      <div ref={mountRef} className="tv-video-surface-mount" />
      {showArtwork ? (
        <div className="tv-video-surface-poster" aria-hidden={hasVideoFrames}>
          <ArtworkImage
            src={artworkUrl}
            alt=""
            seed={channelId}
            label={title}
            priority
          />
          {isLoading ? <span className="tv-video-surface-spinner" aria-hidden="true" /> : null}
        </div>
      ) : null}
      {error ? (
        <div className="tv-video-surface-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      <div className="tv-video-surface-overlay">
        {showLiveBadge ? <span className="tv-live-badge">LIVE</span> : null}
        <span className="tv-video-surface-state">
          {error ? 'Unavailable' : isLoading ? 'Connecting…' : isPlaying ? (showLiveBadge ? 'On air' : 'Playing') : 'Paused'}
        </span>
      </div>
      <div className="tv-video-surface-toolbar" role="toolbar" aria-label="Video controls">
        <div className="tv-video-surface-transport" role="group" aria-label={transportGroupLabel}>
          <button
            type="button"
            className="tv-rail-btn tv-rail-btn--skip"
            onClick={onPrevious}
            disabled={previousDisabled}
            aria-label={hasPrevious ? previousLabel : `${previousLabel} unavailable`}
            title={hasPrevious ? previousLabel : `${previousLabel} unavailable`}
          >
            ⏮
          </button>
          <button
            type="button"
            className="tv-rail-btn tv-rail-btn--gold"
            onClick={onPlayPause}
            disabled={playDisabled}
            aria-label={isLoading ? 'Connecting' : isPlaying ? 'Pause' : 'Play'}
            aria-busy={isLoading}
          >
            {isLoading ? '…' : isPlaying ? '❚❚' : '▶'}
          </button>
          <button
            type="button"
            className="tv-rail-btn tv-rail-btn--skip"
            onClick={onNext}
            disabled={nextDisabled}
            aria-label={hasNext ? nextLabel : `${nextLabel} unavailable`}
            title={hasNext ? nextLabel : `${nextLabel} unavailable`}
          >
            ⏭
          </button>
        </div>
        <button type="button" className="tv-rail-btn tv-rail-btn--secondary" onClick={onMuteToggle} aria-label={volumeMuted ? 'Unmute' : 'Mute'}>
          {volumeMuted ? '🔇' : '🔊'}
        </button>
        <input
          type="range"
          className="tv-video-surface-volume"
          min={0}
          max={1}
          step={0.01}
          value={volumeMuted ? 0 : volume}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
          aria-label={volumeLabel}
        />
        <button type="button" className="tv-rail-btn tv-rail-btn--secondary" onClick={onStop} aria-label="Stop">
          ■
        </button>
        {pipSupported ? (
          <button type="button" className="tv-rail-btn tv-rail-btn--secondary" onClick={onPictureInPicture} aria-label="Picture in picture">
            ⧉
          </button>
        ) : null}
        <button type="button" className="tv-rail-btn tv-rail-btn--secondary" onClick={onFullscreen} aria-label="Fullscreen">
          ⛶
        </button>
      </div>
    </div>
  )
})

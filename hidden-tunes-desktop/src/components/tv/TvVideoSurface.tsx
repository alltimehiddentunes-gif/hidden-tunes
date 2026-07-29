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
}: TvVideoSurfaceProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const [hasVideoFrames, setHasVideoFrames] = useState(false)

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
    [channelSwitchLocked, hasNext, hasPrevious, onFullscreen, onMuteToggle, onNext, onPlayPause, onPrevious],
  )

  const showArtwork = isLoading || !hasVideoFrames
  const previousDisabled = !hasPrevious || channelSwitchLocked
  const nextDisabled = !hasNext || channelSwitchLocked
  const playDisabled = isLoading

  return (
    <div
      ref={surfaceRef}
      className="tv-video-surface"
      tabIndex={0}
      role="region"
      aria-label={`Live video for ${title}`}
      onKeyDown={handleKeyDown}
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
        <span className="tv-live-badge">LIVE</span>
        <span className="tv-video-surface-state">
          {error ? 'Unavailable' : isLoading ? 'Connecting…' : isPlaying ? 'On air' : 'Paused'}
        </span>
      </div>
      <div className="tv-video-surface-toolbar" role="toolbar" aria-label="TV video controls">
        <div className="tv-video-surface-transport" role="group" aria-label="Channel transport">
          <button
            type="button"
            className="tv-rail-btn tv-rail-btn--skip"
            onClick={onPrevious}
            disabled={previousDisabled}
            aria-label={hasPrevious ? 'Previous channel' : 'Previous channel unavailable'}
            title={hasPrevious ? 'Previous channel' : 'Previous channel unavailable'}
          >
            ⏮
          </button>
          <button
            type="button"
            className="tv-rail-btn tv-rail-btn--gold"
            onClick={onPlayPause}
            disabled={playDisabled}
            aria-label={isLoading ? 'Connecting channel' : isPlaying ? 'Pause' : 'Play'}
            aria-busy={isLoading}
          >
            {isLoading ? '…' : isPlaying ? '❚❚' : '▶'}
          </button>
          <button
            type="button"
            className="tv-rail-btn tv-rail-btn--skip"
            onClick={onNext}
            disabled={nextDisabled}
            aria-label={hasNext ? 'Next channel' : 'Next channel unavailable'}
            title={hasNext ? 'Next channel' : 'Next channel unavailable'}
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
          aria-label="TV volume"
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

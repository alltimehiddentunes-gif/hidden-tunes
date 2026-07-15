import { memo, useCallback, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useDesktopPlaybackProgress } from '../../context/DesktopPlaybackProvider'
import { formatPlaybackTime } from '../../lib/player/formatPlaybackTime'

type MusicNowPlayingProgressProps = {
  isActive: boolean
  isLoading: boolean
  seekTo: (seconds: number) => void
}

export const MusicNowPlayingProgress = memo(function MusicNowPlayingProgress({
  isActive,
  isLoading,
  seekTo,
}: MusicNowPlayingProgressProps) {
  const { positionSeconds, durationSeconds } = useDesktopPlaybackProgress()
  const progressTrackRef = useRef<HTMLDivElement>(null)
  const isSeekingRef = useRef(false)
  const [scrubSeconds, setScrubSeconds] = useState<number | null>(null)

  const progressMax = durationSeconds > 0 ? durationSeconds : 0
  const progressValue = scrubSeconds ?? (progressMax > 0 ? Math.min(positionSeconds, progressMax) : 0)
  const progressPercent = progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0
  const canSeek = isActive && progressMax > 0 && !isLoading

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

  const handleSeekClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!canSeek || isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canSeek) return
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

  const remaining = progressMax > 0 ? Math.max(0, progressMax - progressValue) : 0

  return (
    <div className="music-now-playing-progress" role="group" aria-label="Playback progress">
      <span className="music-now-playing-progress-time">{formatPlaybackTime(progressValue)}</span>
      <div
        ref={progressTrackRef}
        className={`music-now-playing-progress-track${canSeek ? ' is-interactive' : ''}`}
        role="slider"
        aria-label="Seek position"
        aria-valuemin={0}
        aria-valuemax={Math.round(progressMax)}
        aria-valuenow={Math.round(progressValue)}
        aria-disabled={!canSeek}
        onClick={handleSeekClick}
        onPointerDown={handleSeekPointerDown}
        onPointerMove={handleSeekPointerMove}
        onPointerUp={handleSeekPointerUp}
        onPointerCancel={handleSeekPointerUp}
      >
        <div className="music-now-playing-progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>
      <span className="music-now-playing-progress-time">
        {progressMax > 0 ? `-${formatPlaybackTime(remaining)}` : '—'}
      </span>
    </div>
  )
})

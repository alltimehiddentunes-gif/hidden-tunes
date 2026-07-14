import { memo, useLayoutEffect, useMemo, useRef, useCallback } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { premiumAudioVisualizerEngine } from '../lib/premiumAudioVisualizer'
import { buildSeededWaveformHeights } from '../lib/premiumAudioVisualizer/waveformSeed'

type PremiumReactiveWaveformProps = {
  trackId: string | null
  progressPercent: number
  progressMax: number
  isLoading: boolean
  onSeek: (seconds: number) => void
  className?: string
  barCount?: number
}

export const PremiumReactiveWaveform = memo(function PremiumReactiveWaveform({
  trackId,
  progressPercent,
  progressMax,
  isLoading,
  onSeek,
  className = 'rail-waveform premium-reactive-waveform',
  barCount = 36,
}: PremiumReactiveWaveformProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const barRefs = useRef<(HTMLSpanElement | null)[]>([])
  const isSeekingRef = useRef(false)
  const registrationRef = useRef({
    root: null as HTMLDivElement | null,
    bars: [] as HTMLSpanElement[],
    baseHeights: [] as number[],
    barCount,
    progressPercent: 0,
  })

  const baseHeights = useMemo(
    () => buildSeededWaveformHeights(trackId ?? 'idle-rail', barCount),
    [barCount, trackId],
  )

  registrationRef.current.progressPercent = progressPercent
  registrationRef.current.baseHeights = baseHeights
  registrationRef.current.barCount = barCount

  useLayoutEffect(() => {
    const root = trackRef.current
    if (!root || progressMax <= 0) return undefined

    const bars = barRefs.current.filter((bar): bar is HTMLSpanElement => Boolean(bar))
    registrationRef.current.root = root
    registrationRef.current.bars = bars

    return premiumAudioVisualizerEngine.registerWaveform(registrationRef.current)
  }, [barCount, baseHeights, progressMax])

  const resolveSeekSeconds = useCallback(
    (clientX: number) => {
      const trackEl = trackRef.current
      if (!trackEl || progressMax <= 0) return null
      const rect = trackEl.getBoundingClientRect()
      if (rect.width <= 0) return null
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * progressMax
    },
    [progressMax],
  )

  const handleSeekClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (progressMax <= 0 || isLoading || isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) onSeek(seconds)
  }

  const handleSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (progressMax <= 0 || isLoading) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds == null) return
    isSeekingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    onSeek(seconds)
  }

  const handleSeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) onSeek(seconds)
  }

  const handleSeekPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    isSeekingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div
      ref={trackRef}
      className={className}
      data-premium-waveform="rail"
      data-ht-waveform-idle={progressMax <= 0 ? 'true' : 'false'}
      data-ht-waveform-loading={isLoading ? 'true' : 'false'}
      role="slider"
      aria-label="Playback position"
      aria-valuemin={0}
      aria-valuemax={progressMax > 0 ? progressMax : 0}
      aria-valuenow={progressMax > 0 ? (progressPercent / 100) * progressMax : 0}
      aria-disabled={progressMax <= 0 || isLoading}
      onClick={handleSeekClick}
      onPointerDown={handleSeekPointerDown}
      onPointerMove={handleSeekPointerMove}
      onPointerUp={handleSeekPointerUp}
      onPointerCancel={handleSeekPointerUp}
    >
      {baseHeights.map((height, index) => (
        <span
          key={index}
          ref={(element) => {
            barRefs.current[index] = element
          }}
          className="rail-waveform-bar"
          style={{ ['--ht-bar-base' as string]: `${height}%` }}
          aria-hidden="true"
        />
      ))}
    </div>
  )
})

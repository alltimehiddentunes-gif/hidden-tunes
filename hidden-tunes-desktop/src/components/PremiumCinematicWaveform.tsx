import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import { premiumAudioVisualizerEngine } from '../lib/premiumAudioVisualizer'
import { buildSeededWaveformHeights } from '../lib/premiumAudioVisualizer/waveformSeed'

const CINEMATIC_BAR_COUNT = 64

export const PremiumCinematicWaveform = memo(function PremiumCinematicWaveform({
  className = '',
  trackId = null,
  progressPercent = 0,
  isActive = true,
}: {
  className?: string
  trackId?: string | null
  progressPercent?: number
  isActive?: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const barRefs = useRef<(HTMLSpanElement | null)[]>([])
  const registrationRef = useRef({
    root: null as HTMLDivElement | null,
    bars: [] as HTMLSpanElement[],
    baseHeights: [] as number[],
    barCount: CINEMATIC_BAR_COUNT,
    progressPercent: 0,
  })

  const baseHeights = useMemo(
    () => buildSeededWaveformHeights(trackId ?? 'idle-cinematic', CINEMATIC_BAR_COUNT),
    [trackId],
  )

  registrationRef.current.progressPercent = progressPercent
  registrationRef.current.baseHeights = baseHeights

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !isActive || !trackId) return undefined

    const bars = barRefs.current.filter((bar): bar is HTMLSpanElement => Boolean(bar))
    registrationRef.current.root = root
    registrationRef.current.bars = bars

    return premiumAudioVisualizerEngine.registerWaveform(registrationRef.current)
  }, [baseHeights, isActive, trackId])

  return (
    <div
      ref={rootRef}
      className={`psd-cinematic-waveform premium-cinematic-waveform ${className}`.trim()}
      data-premium-waveform="cinematic"
      data-ht-waveform-idle={!isActive || !trackId ? 'true' : 'false'}
      aria-hidden="true"
    >
      {baseHeights.map((height, index) => (
        <span
          key={index}
          ref={(element) => {
            barRefs.current[index] = element
          }}
          style={{ ['--ht-bar-base' as string]: `${height}%`, ['--bar-index' as string]: index }}
          aria-hidden="true"
        />
      ))}
    </div>
  )
})

import { useEffect, type ReactNode } from 'react'
import { useDesktopPlayback } from '../context/DesktopPlaybackProvider'
import { premiumAudioVisualizerEngine } from '../lib/premiumAudioVisualizer'
import { usePremiumAudioVisualizerBoot } from '../lib/premiumAudioVisualizer/usePremiumAudioVisualizer'

export function PremiumAudioVisualizerProvider({ children }: { children: ReactNode }) {
  const {
    isPlaying,
    currentTrack,
    positionSeconds,
    durationSeconds,
    volume,
  } = useDesktopPlayback()

  usePremiumAudioVisualizerBoot()

  useEffect(() => {
    premiumAudioVisualizerEngine.setPlaybackState({
      isPlaying,
      trackId: currentTrack?.id ?? null,
      positionSeconds,
      durationSeconds,
      volume,
    })
  }, [currentTrack?.id, durationSeconds, isPlaying, positionSeconds, volume])

  return children
}

import { useEffect, type ReactNode } from 'react'
import {
  useDesktopPlayback,
  useDesktopPlaybackProgress,
} from '../context/DesktopPlaybackProvider'
import { premiumAudioVisualizerEngine } from '../lib/premiumAudioVisualizer'

export function PremiumAudioVisualizerProvider({ children }: { children: ReactNode }) {
  const {
    isPlaying,
    currentTrack,
    volume,
  } = useDesktopPlayback()
  const { durationSeconds } = useDesktopPlaybackProgress()

  useEffect(() => {
    if (!isPlaying) {
      premiumAudioVisualizerEngine.stop()
      return
    }

    premiumAudioVisualizerEngine.start()
    return () => {
      premiumAudioVisualizerEngine.stop()
    }
  }, [isPlaying])

  useEffect(() => {
    premiumAudioVisualizerEngine.setPlaybackState({
      isPlaying,
      trackId: currentTrack?.id ?? null,
      positionSeconds: 0,
      durationSeconds,
      volume,
    })
  }, [currentTrack?.id, durationSeconds, isPlaying, volume])

  return children
}

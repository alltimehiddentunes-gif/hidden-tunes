export type PremiumVisualizerPlaybackState = {
  isPlaying: boolean
  trackId: string | null
  positionSeconds: number
  durationSeconds: number
  volume: number
}

export type PremiumVisualizerSnapshot = {
  waveformBars: readonly number[]
  energyLevel: number
  bassEnergy: number
  midEnergy: number
  trebleEnergy: number
  isAudioReactive: boolean
  isFallback: boolean
  isPlaying: boolean
}

export type PremiumWaveformRegistration = {
  root: HTMLElement | null
  bars: HTMLElement[]
  baseHeights: number[]
  barCount: number
  progressPercent: number
}

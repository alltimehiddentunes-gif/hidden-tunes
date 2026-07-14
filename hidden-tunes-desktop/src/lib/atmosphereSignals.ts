import type { PremiumVisualizerSnapshot } from './premiumAudioVisualizer/types'
import type { AtmosphereIntensityMode } from './atmospherePreferences'

/**
 * Normalized atmosphere motion signals (0–1) derived from the singleton visualizer.
 *
 * - energy/loudness: overall activity suitable for glow and veil strength
 * - bass/mids/highs: frequency-weighted bands from the existing analyser snapshot
 * - calmness: inverse activity — high when the scene should rest
 * - pulse: short-term rhythmic emphasis from waveform variance
 * - motion: combined drive for ambient drift (scaled by user intensity)
 * - intensity: effective atmosphere expressiveness after settings
 *
 * When `isFallback` is true, values are progress/seed driven — not real FFT analysis.
 */
export type AtmosphereSignals = {
  energy: number
  bass: number
  mids: number
  highs: number
  loudness: number
  calmness: number
  pulse: number
  motion: number
  intensity: number
  isAudioReactive: boolean
  isFallback: boolean
  isPlaying: boolean
}

export type AtmosphereSignalSettings = {
  atmosphereEnabled: boolean
  atmosphereIntensity: AtmosphereIntensityMode
}

const INTENSITY_EXPRESSIVENESS: Record<AtmosphereIntensityMode, number> = {
  off: 0,
  low: 0.38,
  medium: 0.68,
  high: 0.88,
  cinema: 1,
}

/** Dampen seeded/progress fallback so it never mimics real analysis aggressively */
const FALLBACK_DAMPING = 0.52

const MINIMAL_SIGNALS: Omit<AtmosphereSignals, 'isPlaying'> = {
  energy: 0.035,
  bass: 0.03,
  mids: 0.028,
  highs: 0.025,
  loudness: 0.03,
  calmness: 0.94,
  pulse: 0.04,
  motion: 0.02,
  intensity: 0.03,
  isAudioReactive: false,
  isFallback: true,
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function derivePulse(snapshot: PremiumVisualizerSnapshot): number {
  if (!snapshot.isPlaying) return 0.06

  const bars = snapshot.waveformBars
  if (bars.length === 0) {
    return clamp01(snapshot.energyLevel * 0.42)
  }

  let sum = 0
  for (const bar of bars) sum += bar
  const mean = sum / bars.length

  let variance = 0
  for (const bar of bars) variance += Math.abs(bar - mean)
  const normalizedVariance = variance / bars.length

  return clamp01(normalizedVariance * 0.85 + snapshot.energyLevel * 0.35)
}

function applySourceDamping(
  snapshot: PremiumVisualizerSnapshot,
  value: number,
): number {
  if (!snapshot.isFallback) return value
  return value * FALLBACK_DAMPING
}

export function buildMinimalAtmosphereSignals(
  isPlaying = false,
): AtmosphereSignals {
  return {
    ...MINIMAL_SIGNALS,
    isPlaying,
  }
}

export function buildAtmosphereSignals(
  snapshot: PremiumVisualizerSnapshot,
  settings: AtmosphereSignalSettings,
): AtmosphereSignals {
  if (!settings.atmosphereEnabled || settings.atmosphereIntensity === 'off') {
    return buildMinimalAtmosphereSignals(snapshot.isPlaying)
  }

  const expressiveness = INTENSITY_EXPRESSIVENESS[settings.atmosphereIntensity]
  const playingMix = snapshot.isPlaying ? 1 : 0.22

  const rawEnergy = applySourceDamping(snapshot, snapshot.energyLevel)
  const rawBass = applySourceDamping(snapshot, snapshot.bassEnergy)
  const rawMids = applySourceDamping(snapshot, snapshot.midEnergy)
  const rawHighs = applySourceDamping(snapshot, snapshot.trebleEnergy)

  const energy = clamp01(rawEnergy * expressiveness * playingMix + 0.02)
  const bass = clamp01(rawBass * expressiveness * playingMix + 0.015)
  const mids = clamp01(rawMids * expressiveness * playingMix + 0.015)
  const highs = clamp01(rawHighs * expressiveness * playingMix + 0.01)

  const loudness = clamp01(
    energy * 0.55 + bass * 0.28 + mids * 0.12 + highs * 0.05,
  )

  const pulse = clamp01(derivePulse(snapshot) * expressiveness * playingMix + 0.03)
  const motion = clamp01((energy * 0.5 + pulse * 0.5) * expressiveness * playingMix + 0.02)
  const calmness = clamp01(1 - loudness * (0.82 + expressiveness * 0.12))
  const intensity = clamp01(expressiveness * Math.max(energy, pulse * 0.75))

  return {
    energy,
    bass,
    mids,
    highs,
    loudness,
    calmness,
    pulse,
    motion,
    intensity,
    isAudioReactive: snapshot.isAudioReactive && !snapshot.isFallback,
    isFallback: snapshot.isFallback,
    isPlaying: snapshot.isPlaying,
  }
}

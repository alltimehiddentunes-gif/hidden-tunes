import { useMemo } from 'react'
import { useAtmosphere } from '../context/AtmosphereContext'
import {
  buildAtmosphereSignals,
  type AtmosphereSignals,
} from './atmosphereSignals'
import { usePremiumAudioVisualizer } from './premiumAudioVisualizer/usePremiumAudioVisualizer'

/**
 * Shared atmosphere motion signals from the singleton PremiumAudioVisualizerEngine.
 * Reuses the visualizer's throttled useSyncExternalStore subscription — no extra rAF loop.
 */
export function useAtmosphereSignals(): AtmosphereSignals {
  const snapshot = usePremiumAudioVisualizer()
  const { atmosphereEnabled, atmosphereIntensity } = useAtmosphere()

  return useMemo(
    () => buildAtmosphereSignals(snapshot, { atmosphereEnabled, atmosphereIntensity }),
    [atmosphereEnabled, atmosphereIntensity, snapshot],
  )
}

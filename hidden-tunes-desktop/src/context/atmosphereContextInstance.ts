import { createContext } from 'react'
import type { AtmosphereDefinition, AtmosphereId } from '../types/atmosphere'
import type { AtmosphereIntensityMode } from '../lib/atmospherePreferences'

export type AtmosphereContextValue = {
  activeAtmosphereId: AtmosphereId
  setActiveAtmosphereId: (id: AtmosphereId) => void
  atmosphereIntensity: AtmosphereIntensityMode
  setAtmosphereIntensity: (intensity: AtmosphereIntensityMode) => void
  atmosphereEnabled: boolean
  setAtmosphereEnabled: (enabled: boolean) => void
  resolvedAtmosphere: AtmosphereDefinition
  availableAtmospheres: AtmosphereDefinition[]
}

export const AtmosphereContext = createContext<AtmosphereContextValue | null>(null)

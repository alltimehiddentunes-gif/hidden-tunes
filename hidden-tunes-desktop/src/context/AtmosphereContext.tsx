import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'
import {
  getAtmosphereById,
  getDefaultAtmosphere,
  listAtmospheres,
} from '../lib/atmosphereManager'
import {
  DEFAULT_ATMOSPHERE_INTENSITY,
  parseAtmosphereIntensityMode,
  parseStoredAtmosphereEnabled,
  type AtmosphereIntensityMode,
} from '../lib/atmospherePreferences'
import {
  DESKTOP_PREFERENCE_KEYS,
  usePersistedPreference,
} from '../lib/localPreferences'
import type { AtmosphereDefinition, AtmosphereId } from '../types/atmosphere'
import { parseAtmosphereId } from '../types/atmosphere'

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

const AtmosphereContext = createContext<AtmosphereContextValue | null>(null)

export function AtmosphereProvider({ children }: { children: ReactNode }) {
  const defaultAtmosphere = useMemo(() => getDefaultAtmosphere(), [])

  const [activeAtmosphereId, setActiveAtmosphereIdState] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.atmosphereId,
    defaultAtmosphere.id,
    parseAtmosphereId,
  )

  const [atmosphereEnabled, setAtmosphereEnabled] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.atmosphereEnabled,
    true,
    parseStoredAtmosphereEnabled,
  )

  const [atmosphereIntensity, setAtmosphereIntensity] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.atmosphereIntensity,
    DEFAULT_ATMOSPHERE_INTENSITY,
    parseAtmosphereIntensityMode,
  )

  const setActiveAtmosphereId = useCallback(
    (id: AtmosphereId) => {
      setActiveAtmosphereIdState(id)
    },
    [setActiveAtmosphereIdState],
  )

  const resolvedAtmosphere = useMemo(
    () => getAtmosphereById(activeAtmosphereId) ?? getDefaultAtmosphere(),
    [activeAtmosphereId],
  )

  const availableAtmospheres = useMemo(() => listAtmospheres(), [])

  const value = useMemo<AtmosphereContextValue>(
    () => ({
      activeAtmosphereId,
      setActiveAtmosphereId,
      atmosphereIntensity,
      setAtmosphereIntensity,
      atmosphereEnabled,
      setAtmosphereEnabled,
      resolvedAtmosphere,
      availableAtmospheres,
    }),
    [
      activeAtmosphereId,
      atmosphereEnabled,
      atmosphereIntensity,
      availableAtmospheres,
      resolvedAtmosphere,
      setActiveAtmosphereId,
      setAtmosphereEnabled,
      setAtmosphereIntensity,
    ],
  )

  return (
    <AtmosphereContext.Provider value={value}>
      {children}
    </AtmosphereContext.Provider>
  )
}

export function useAtmosphere(): AtmosphereContextValue {
  const value = useContext(AtmosphereContext)
  if (!value) {
    throw new Error('useAtmosphere must be used within AtmosphereProvider')
  }
  return value
}

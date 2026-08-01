import {
  useCallback,
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
} from '../lib/atmospherePreferences'
import {
  DESKTOP_PREFERENCE_KEYS,
  usePersistedPreference,
} from '../lib/localPreferences'
import type { AtmosphereId } from '../types/atmosphere'
import { parseAtmosphereId } from '../types/atmosphere'
import {
  AtmosphereContext,
  type AtmosphereContextValue,
} from './atmosphereContextInstance'

export type { AtmosphereContextValue }

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

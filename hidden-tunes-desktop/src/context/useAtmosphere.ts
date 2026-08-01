import { useContext } from 'react'
import {
  AtmosphereContext,
  type AtmosphereContextValue,
} from './atmosphereContextInstance'

export type { AtmosphereContextValue }

export function useAtmosphere(): AtmosphereContextValue {
  const value = useContext(AtmosphereContext)
  if (!value) {
    throw new Error('useAtmosphere must be used within AtmosphereProvider')
  }
  return value
}

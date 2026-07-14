export const ATMOSPHERE_INTENSITY_MODES = [
  'off',
  'low',
  'medium',
  'high',
  'cinema',
] as const

export type AtmosphereIntensityMode = (typeof ATMOSPHERE_INTENSITY_MODES)[number]

export const DEFAULT_ATMOSPHERE_INTENSITY: AtmosphereIntensityMode = 'medium'

export const ATMOSPHERE_INTENSITY_LABELS: Record<AtmosphereIntensityMode, string> = {
  off: 'Off',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  cinema: 'Cinema',
}

export const ATMOSPHERE_INTENSITY_DESCRIPTIONS: Record<AtmosphereIntensityMode, string> = {
  off: 'Atmosphere visuals paused',
  low: 'Subtle ambient presence',
  medium: 'Balanced immersion',
  high: 'Richer glow and motion',
  cinema: 'Maximum depth for full-screen listening',
}

export function parseAtmosphereIntensityMode(value: unknown): AtmosphereIntensityMode | null {
  return typeof value === 'string' &&
    ATMOSPHERE_INTENSITY_MODES.includes(value as AtmosphereIntensityMode)
    ? (value as AtmosphereIntensityMode)
    : null
}

export function parseStoredAtmosphereEnabled(value: unknown): boolean | null {
  if (value === true || value === false) return value
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

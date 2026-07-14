import type { PlayerBackgroundType } from '../data/artworkRegistry'
import type { NowPlayingStyle } from '../lib/nowPlayingStyle'
import type { VisualSceneId } from '../lib/visualScenes'

export const ATMOSPHERE_IDS = [
  'midnight-reflection',
  'neon-rain',
  'golden-horizon',
  'ocean-drift',
  'worship-sanctuary',
  'afro-sunset',
  'healing-slowly',
  'night-drive',
] as const

export type AtmosphereId = (typeof ATMOSPHERE_IDS)[number]

export type AtmosphereMood = 'violet' | 'cyan' | 'rose' | 'mint'

export type AtmosphereIntensityProfile = 'subtle' | 'balanced' | 'immersive'

export type AtmosphereMotionProfile = 'still' | 'gentle' | 'flowing' | 'cinematic'

/** Procedural visual preset — maps to Visual Engine v1 scene ids today. */
export type AtmosphereVisualTheme = VisualSceneId

export type AtmosphereDefinition = {
  id: AtmosphereId
  name: string
  description: string
  mood: AtmosphereMood
  visualTheme: AtmosphereVisualTheme
  /** Key in `worldArtwork` (artworkRegistry) */
  artworkKey: string
  playerBackgroundKey: PlayerBackgroundType
  intensityProfile: AtmosphereIntensityProfile
  colorMood: string
  motionProfile: AtmosphereMotionProfile
  supportedPlayerModes: readonly NowPlayingStyle[]
  defaultEnabled: boolean
  /** Emotional world card ids (`ew-*`) that resolve to this atmosphere */
  worldCardIds: readonly string[]
  /** Listening scene ids from sceneListening that resolve to this atmosphere */
  listeningSceneIds: readonly string[]
}

export function parseAtmosphereId(value: unknown): AtmosphereId | null {
  return typeof value === 'string' && ATMOSPHERE_IDS.includes(value as AtmosphereId)
    ? (value as AtmosphereId)
    : null
}

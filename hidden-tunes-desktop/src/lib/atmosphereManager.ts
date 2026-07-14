import { normalizeArtworkKey } from '../data/artworkRegistry'
import {
  ATMOSPHERE_LIST,
  ATMOSPHERE_REGISTRY,
  getAtmosphereRegistryEntry,
} from '../data/atmosphereRegistry'
import type { ApiSong } from './api'
import { deriveListeningAtmosphere } from './listeningContext'
import type { NowPlayingStyle } from './nowPlayingStyle'
import {
  getTimeAwareHomeScene,
  type VisualSceneId,
} from './visualScenes'
import type {
  AtmosphereDefinition,
  AtmosphereId,
  AtmosphereMood,
} from '../types/atmosphere'

const DEFAULT_ATMOSPHERE_ID: AtmosphereId = 'midnight-reflection'

const PLAYER_MODE_ATMOSPHERE: Record<NowPlayingStyle, AtmosphereId> = {
  'player-1': 'night-drive',
  'player-2': 'midnight-reflection',
  'player-3': 'golden-horizon',
  'player-4': 'midnight-reflection',
  'player-5': 'ocean-drift',
}

const VISUAL_THEME_ATMOSPHERE: Record<VisualSceneId, AtmosphereId> = {
  'midnight-drive': 'night-drive',
  'healing-sunday': 'worship-sanctuary',
  'afro-sunset': 'afro-sunset',
  'piano-rain': 'neon-rain',
  'deep-focus': 'golden-horizon',
  'slow-love': 'healing-slowly',
  'rainy-apartment': 'midnight-reflection',
  'neon-city': 'neon-rain',
  'ocean-reflection': 'ocean-drift',
  'mountain-fog': 'healing-slowly',
}

const MOOD_THEME_OVERRIDES: Partial<Record<VisualSceneId, Partial<Record<AtmosphereMood, AtmosphereId>>>> = {
  'rainy-apartment': {
    violet: 'neon-rain',
    cyan: 'midnight-reflection',
  },
  'afro-sunset': {
    rose: 'afro-sunset',
    cyan: 'golden-horizon',
  },
}

const worldCardIndex = new Map<string, AtmosphereId>()
const listeningSceneIndex = new Map<string, AtmosphereId>()
const atmosphereNameIndex = new Map<string, AtmosphereId>()

for (const atmosphere of ATMOSPHERE_LIST) {
  const nameKey = normalizeArtworkKey(atmosphere.name)
  if (nameKey) atmosphereNameIndex.set(nameKey, atmosphere.id)

  for (const cardId of atmosphere.worldCardIds) {
    worldCardIndex.set(cardId, atmosphere.id)
    worldCardIndex.set(normalizeArtworkKey(cardId), atmosphere.id)
  }

  for (const sceneId of atmosphere.listeningSceneIds) {
    listeningSceneIndex.set(sceneId, atmosphere.id)
    listeningSceneIndex.set(normalizeArtworkKey(sceneId), atmosphere.id)
  }
}

export function getAtmosphereById(id: AtmosphereId): AtmosphereDefinition | null {
  return ATMOSPHERE_REGISTRY[id] ?? null
}

export function listAtmospheres(): AtmosphereDefinition[] {
  return ATMOSPHERE_LIST.filter((entry) => entry.defaultEnabled)
}

export function getDefaultAtmosphere(): AtmosphereDefinition {
  const homeScene = getTimeAwareHomeScene()
  const id = resolveAtmosphereIdFromVisualTheme(homeScene) ?? DEFAULT_ATMOSPHERE_ID
  return getAtmosphereRegistryEntry(id)
}

export function resolveAtmosphereForTrack(
  track: ApiSong | null,
  catalog: ApiSong[],
): AtmosphereDefinition {
  const listening = deriveListeningAtmosphere(track, catalog)
  const id = resolveAtmosphereIdFromVisualTheme(listening.sceneId, listening.mood)
    ?? DEFAULT_ATMOSPHERE_ID
  return getAtmosphereRegistryEntry(id)
}

export function resolveAtmosphereForWorld(input: {
  cardId?: string | null
  sceneId?: string | null
  title?: string | null
}): AtmosphereDefinition {
  if (input.cardId) {
    const byCard = worldCardIndex.get(input.cardId)
      ?? worldCardIndex.get(normalizeArtworkKey(input.cardId))
    if (byCard) return getAtmosphereRegistryEntry(byCard)
  }

  if (input.sceneId) {
    const byScene = listeningSceneIndex.get(input.sceneId)
      ?? listeningSceneIndex.get(normalizeArtworkKey(input.sceneId))
    if (byScene) return getAtmosphereRegistryEntry(byScene)
  }

  if (input.title) {
    const byTitle = atmosphereNameIndex.get(normalizeArtworkKey(input.title))
    if (byTitle) return getAtmosphereRegistryEntry(byTitle)
  }

  return getDefaultAtmosphere()
}

export function resolveAtmosphereForPlayerMode(mode: NowPlayingStyle): AtmosphereDefinition {
  const id = PLAYER_MODE_ATMOSPHERE[mode] ?? DEFAULT_ATMOSPHERE_ID
  return getAtmosphereRegistryEntry(id)
}

function resolveAtmosphereIdFromVisualTheme(
  visualTheme: VisualSceneId,
  mood?: AtmosphereMood,
): AtmosphereId | null {
  if (mood) {
    const override = MOOD_THEME_OVERRIDES[visualTheme]?.[mood]
    if (override) return override
  }
  return VISUAL_THEME_ATMOSPHERE[visualTheme] ?? null
}

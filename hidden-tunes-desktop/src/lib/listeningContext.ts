import type { ApiSong } from './api'
import type { QueueContext } from './desktopPlayback/types'
import { buildEmotionalLanes, type BuiltEmotionalLane } from './emotionalDiscovery'
import { buildListeningScenes, type BuiltListeningScene } from './sceneListening'
import {
  getTimeAwareHomeScene,
  resolveVisualScene,
  type VisualSceneId,
} from './visualScenes'

export type ListeningMood = 'violet' | 'cyan' | 'rose' | 'mint'

export type ListeningAtmosphere = {
  sceneId: VisualSceneId
  mood: ListeningMood
}

export type ListeningContextLines = {
  eyebrow: string
  atmosphereLine: string | null
  insightLine: string | null
  contextPills: string[]
}

type ListeningCatalogIndex = {
  lanes: BuiltEmotionalLane[]
  scenes: BuiltListeningScene[]
  laneByTrackId: Map<string, BuiltEmotionalLane>
  sceneByTrackId: Map<string, BuiltListeningScene>
  sceneById: Map<string, BuiltListeningScene>
}

let cachedCatalogRef: ApiSong[] | null = null
let cachedCatalogIndex: ListeningCatalogIndex | null = null

function getListeningCatalogIndex(catalog: ApiSong[]): ListeningCatalogIndex {
  if (cachedCatalogRef === catalog && cachedCatalogIndex) {
    return cachedCatalogIndex
  }

  const lanes = buildEmotionalLanes(catalog, { minTracks: 1 })
  const scenes = buildListeningScenes(catalog, { minTracks: 1 })
  const laneByTrackId = new Map<string, BuiltEmotionalLane>()
  const sceneByTrackId = new Map<string, BuiltListeningScene>()
  const sceneById = new Map<string, BuiltListeningScene>()

  for (const lane of lanes) {
    for (const trackId of lane.songIds) {
      if (!laneByTrackId.has(trackId)) {
        laneByTrackId.set(trackId, lane)
      }
    }
  }

  for (const scene of scenes) {
    sceneById.set(scene.id, scene)
    for (const trackId of scene.songIds) {
      if (!sceneByTrackId.has(trackId)) {
        sceneByTrackId.set(trackId, scene)
      }
    }
  }

  cachedCatalogRef = catalog
  cachedCatalogIndex = {
    lanes,
    scenes,
    laneByTrackId,
    sceneByTrackId,
    sceneById,
  }
  return cachedCatalogIndex
}

export function getListeningScenesForCatalog(catalog: ApiSong[]): BuiltListeningScene[] {
  return getListeningCatalogIndex(catalog).scenes
}

function findPrimaryLaneForTrack(catalog: ApiSong[], trackId: string) {
  return getListeningCatalogIndex(catalog).laneByTrackId.get(trackId) ?? null
}

function findPrimarySceneForTrack(catalog: ApiSong[], trackId: string) {
  return getListeningCatalogIndex(catalog).sceneByTrackId.get(trackId) ?? null
}

export function findListeningSceneById(
  catalog: ApiSong[],
  sceneId: string,
): BuiltListeningScene | null {
  return getListeningCatalogIndex(catalog).sceneById.get(sceneId) ?? null
}

function resolveTrackMood(track: ApiSong): ListeningMood | undefined {
  const text = `${track.mood ?? ''} ${track.title}`.toLowerCase()
  if (/night|midnight|neon|city|violet|dream/.test(text)) return 'violet'
  if (/focus|calm|mint|flow|quiet|deep/.test(text)) return 'mint'
  if (/love|heart|rose|tender|warm|soft/.test(text)) return 'rose'
  if (/cyan|drive|pulse|electric|ocean/.test(text)) return 'cyan'
  return undefined
}

export function deriveListeningAtmosphere(
  track: ApiSong | null,
  catalog: ApiSong[],
): ListeningAtmosphere {
  if (!track) {
    return { sceneId: getTimeAwareHomeScene(), mood: 'violet' }
  }

  const scene = findPrimarySceneForTrack(catalog, track.id)
  if (scene) {
    return { sceneId: scene.visualSceneId, mood: scene.mood }
  }

  const lane = findPrimaryLaneForTrack(catalog, track.id)
  if (lane) {
    return {
      sceneId: resolveVisualScene({ seed: lane.label, mood: lane.mood }),
      mood: lane.mood,
    }
  }

  const mood = resolveTrackMood(track)
  return {
    sceneId: resolveVisualScene({ seed: track.title, mood }),
    mood: mood ?? 'violet',
  }
}

export function buildListeningContext(input: {
  track: ApiSong | null
  catalog: ApiSong[]
  queueContext: QueueContext
  queueTitle?: string
  queueInsight?: string | null
  isPlaying?: boolean
  isLoading?: boolean
  isActive?: boolean
}): ListeningContextLines {
  const {
    track,
    catalog,
    queueContext,
    queueTitle,
    queueInsight,
    isPlaying = false,
    isLoading = false,
    isActive = true,
  } = input

  const eyebrow = !track || !isActive
    ? 'Listening'
    : isLoading
      ? 'Loading'
      : isPlaying
        ? 'Now playing'
        : 'Paused'

  const pills: string[] = []
  const lane = track ? findPrimaryLaneForTrack(catalog, track.id) : null
  const scene = track ? findPrimarySceneForTrack(catalog, track.id) : null

  if (queueContext === 'radio') {
    if (queueTitle) {
      pills.push(queueTitle)
    } else {
      pills.push('Radio station')
    }
  } else if (queueContext === 'podcast') {
    if (queueTitle) {
      pills.push(queueTitle)
    } else {
      pills.push('Podcast episode')
    }
  } else if (queueTitle?.startsWith('In this scene')) {
    pills.push(queueTitle)
  } else if (queueTitle?.startsWith('For this mood')) {
    pills.push(queueTitle)
  } else if (queueContext === 'scene' && queueTitle) {
    pills.push(queueTitle)
  }

  const suppressLaneScenePills =
    queueContext === 'radio'
    || queueContext === 'podcast'
    || Boolean(queueTitle?.startsWith('In this scene'))
    || Boolean(queueTitle?.startsWith('For this mood'))

  if (!suppressLaneScenePills) {
    if (lane && !pills.some((pill) => pill.includes(lane.label))) {
      pills.push(`Lane · ${lane.label}`)
    }

    if (scene && !pills.some((pill) => pill.includes(scene.label))) {
      pills.push(`Scene · ${scene.label}`)
    }
  }

  let atmosphereLine: string | null = null
  if (!queueTitle && scene && lane) {
    atmosphereLine = `${scene.label} within ${lane.label}`
  } else if (!queueTitle && scene) {
    atmosphereLine = `Set in ${scene.label}`
  } else if (!queueTitle && lane) {
    atmosphereLine = `Carried by ${lane.label}`
  }

  return {
    eyebrow,
    atmosphereLine,
    insightLine: queueInsight ?? null,
    contextPills: pills.slice(0, 3),
  }
}

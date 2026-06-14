import type { ApiSong } from './api'
import { inferSongGenre, normalizeLookupKey } from './catalogIndexes'
import type { VisualSceneId } from './visualScenes'

export type SceneListeningMood = 'violet' | 'cyan' | 'rose' | 'mint'

export type ListeningSceneDefinition = {
  id: string
  label: string
  subtitle: string
  mood: SceneListeningMood
  visualSceneId: VisualSceneId
  moods: string[]
  genres: string[]
  tags: string[]
  titleHints: string[]
}

export type BuiltListeningScene = ListeningSceneDefinition & {
  trackCount: number
  topSignals: string[]
  songIds: string[]
}

const MIN_SCENE_SCORE = 2

export const LISTENING_SCENE_DEFINITIONS: ListeningSceneDefinition[] = [
  {
    id: 'midnight-drive',
    label: 'Midnight Drive',
    subtitle: 'Late-night highway hum and neon roadlines',
    mood: 'cyan',
    visualSceneId: 'midnight-drive',
    moods: ['night', 'midnight', 'late', 'drive', 'nocturne'],
    genres: ['jazz', 'ambient', 'pop'],
    tags: ['night', 'late', 'drive', 'midnight'],
    titleHints: ['midnight', 'drive', 'lunar', 'dusk', 'highway', '3am', 'night'],
  },
  {
    id: 'rainy-window',
    label: 'Rainy Window',
    subtitle: 'Soft rain, dim light, and reflective calm',
    mood: 'cyan',
    visualSceneId: 'rainy-apartment',
    moods: ['rain', 'melancholy', 'calm', 'reflective'],
    genres: ['ambient', 'acoustic', 'jazz'],
    tags: ['rain', 'storm', 'calm', 'reflect'],
    titleHints: ['rain', 'window', 'storm', 'smoke', 'glass', 'echo', 'piano'],
  },
  {
    id: 'focus-room',
    label: 'Focus Room',
    subtitle: 'Clear headspace and steady concentration',
    mood: 'mint',
    visualSceneId: 'deep-focus',
    moods: ['focus', 'work', 'flow', 'steady', 'clarity'],
    genres: ['ambient', 'acoustic', 'electronic'],
    tags: ['focus', 'work', 'study', 'flow', 'deep'],
    titleHints: ['focus', 'flow', 'work', 'mind', 'monk', 'deep', 'quiet'],
  },
  {
    id: 'heartbreak-recovery',
    label: 'Heartbreak Recovery',
    subtitle: 'Tender healing after emotional weight',
    mood: 'rose',
    visualSceneId: 'slow-love',
    moods: ['heartbreak', 'heal', 'recovery', 'tender', 'love'],
    genres: ['love', 'acoustic', 'gospel'],
    tags: ['heart', 'miss', 'heal', 'love', 'tender', 'recovery'],
    titleHints: ['heart', 'miss', 'love', 'collapse', 'soft', 'safe', 'heal', 'break'],
  },
  {
    id: 'sunday-morning',
    label: 'Sunday Morning',
    subtitle: 'Unhurried warmth and gentle daylight',
    mood: 'rose',
    visualSceneId: 'healing-sunday',
    moods: ['morning', 'sunday', 'warm', 'gentle', 'calm'],
    genres: ['acoustic', 'gospel', 'ambient'],
    tags: ['morning', 'sunday', 'warm', 'gentle', 'calm'],
    titleHints: ['sunday', 'morning', 'golden', 'bloom', 'hour', 'gentle', 'warm'],
  },
  {
    id: 'city-lights',
    label: 'City Lights',
    subtitle: 'Urban shimmer and electric afterglow',
    mood: 'violet',
    visualSceneId: 'neon-city',
    moods: ['city', 'urban', 'neon', 'electric', 'night'],
    genres: ['pop', 'electronic', 'jazz'],
    tags: ['city', 'neon', 'urban', 'glow', 'lights'],
    titleHints: ['city', 'neon', 'lights', 'glow', 'urban', 'skyline', 'chrome'],
  },
]

function formatSignal(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function collectSongText(song: ApiSong) {
  return normalizeLookupKey(
    `${song.title} ${song.album} ${song.artist} ${song.description ?? ''}`,
  )
}

function scoreSongForScene(song: ApiSong, scene: ListeningSceneDefinition) {
  let score = 0
  const signals = new Set<string>()

  const songMood = normalizeLookupKey(song.mood)
  const songGenre = normalizeLookupKey(song.genre)
  const inferredGenre = inferSongGenre(song)
  const songTags = (song.tags ?? [])
    .map((tag) => normalizeLookupKey(tag))
    .filter(Boolean)
  const text = collectSongText(song)

  for (const mood of scene.moods) {
    if (!songMood) continue
    if (songMood.includes(mood) || mood.includes(songMood)) {
      score += 4
      signals.add(song.mood?.trim() || mood)
    }
  }

  for (const genre of scene.genres) {
    const matches =
      songGenre === genre ||
      inferredGenre === genre ||
      text.includes(genre)
    if (!matches) continue
    score += 3
    signals.add(song.genre?.trim() || genre)
  }

  for (const tag of scene.tags) {
    const tagMatch = songTags.some(
      (entry) => entry.includes(tag) || tag.includes(entry),
    )
    if (tagMatch || text.includes(tag)) {
      score += tagMatch ? 2 : 1
      signals.add(tag)
    }
  }

  for (const hint of scene.titleHints) {
    if (!text.includes(hint)) continue
    score += 1
    signals.add(hint)
  }

  return { score, signals: [...signals] }
}

function rankTopSignals(signalCounts: Map<string, number>) {
  return [...signalCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([signal]) => formatSignal(signal))
}

export function buildListeningScenes(
  songs: ApiSong[],
  options?: { minTracks?: number },
): BuiltListeningScene[] {
  const minTracks = options?.minTracks ?? 2
  const buckets = new Map<
    string,
    { songs: ApiSong[]; signalCounts: Map<string, number> }
  >()

  for (const scene of LISTENING_SCENE_DEFINITIONS) {
    buckets.set(scene.id, { songs: [], signalCounts: new Map() })
  }

  for (const song of songs) {
    for (const scene of LISTENING_SCENE_DEFINITIONS) {
      const result = scoreSongForScene(song, scene)
      if (result.score < MIN_SCENE_SCORE) continue

      const bucket = buckets.get(scene.id)
      if (!bucket) continue

      bucket.songs.push(song)
      for (const signal of result.signals) {
        const key = normalizeLookupKey(signal)
        if (!key) continue
        bucket.signalCounts.set(key, (bucket.signalCounts.get(key) ?? 0) + 1)
      }
    }
  }

  return LISTENING_SCENE_DEFINITIONS.map((scene) => {
    const bucket = buckets.get(scene.id) ?? { songs: [], signalCounts: new Map() }
    return {
      ...scene,
      trackCount: bucket.songs.length,
      topSignals: rankTopSignals(bucket.signalCounts),
      songIds: bucket.songs.map((entry) => entry.id),
    }
  })
    .filter((scene) => scene.trackCount >= minTracks)
    .sort((a, b) => b.trackCount - a.trackCount)
}

export function filterSongsByListeningScene(
  songs: ApiSong[],
  sceneId: string | null,
): ApiSong[] {
  if (!sceneId) return songs

  const scene = buildListeningScenes(songs, { minTracks: 1 }).find(
    (entry) => entry.id === sceneId,
  )
  if (!scene) return []

  const allowedIds = new Set(scene.songIds)
  return songs.filter((song) => allowedIds.has(song.id))
}

export function findListeningScene(
  scenes: BuiltListeningScene[],
  sceneId: string | null,
) {
  if (!sceneId) return null
  return scenes.find((scene) => scene.id === sceneId) ?? null
}

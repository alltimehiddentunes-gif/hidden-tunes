import type { ApiSong } from './api'
import { inferSongGenre, normalizeLookupKey } from './catalogIndexes'

export type EmotionalLaneMood = 'violet' | 'cyan' | 'rose' | 'mint'

export type EmotionalLaneDefinition = {
  id: string
  label: string
  subtitle: string
  mood: EmotionalLaneMood
  moods: string[]
  genres: string[]
  tags: string[]
  titleHints: string[]
}

export type BuiltEmotionalLane = EmotionalLaneDefinition & {
  trackCount: number
  topSignals: string[]
  songIds: string[]
}

const MIN_LANE_SCORE = 2

export const EMOTIONAL_LANE_DEFINITIONS: EmotionalLaneDefinition[] = [
  {
    id: 'calm-drift',
    label: 'Calm & Drift',
    subtitle: 'Soft edges and unhurried atmosphere',
    mood: 'mint',
    moods: ['calm', 'relax', 'peace', 'sleep', 'ambient', 'chill', 'quiet'],
    genres: ['ambient', 'acoustic'],
    tags: ['calm', 'relax', 'focus', 'sleep', 'chill'],
    titleHints: ['drift', 'bloom', 'quiet', 'soft', 'slow', 'gentle', 'hush'],
  },
  {
    id: 'late-night',
    label: 'Late Night Glow',
    subtitle: 'Nocturnal warmth and after-hours shimmer',
    mood: 'violet',
    moods: ['night', 'late', 'nocturne', 'dream', 'midnight'],
    genres: ['jazz', 'ambient', 'pop'],
    tags: ['night', 'late', 'dream', 'glow'],
    titleHints: ['night', 'midnight', 'lunar', 'dusk', 'neon', 'moon', '3am', 'after'],
  },
  {
    id: 'heartfelt',
    label: 'Heartfelt & Tender',
    subtitle: 'Intimate feeling and emotional closeness',
    mood: 'rose',
    moods: ['love', 'tender', 'heart', 'intimate', 'warm'],
    genres: ['love', 'acoustic', 'gospel'],
    tags: ['love', 'heart', 'miss', 'safe', 'shelter', 'tender'],
    titleHints: ['love', 'heart', 'miss', 'safe', 'kiss', 'hold', 'warm', 'tender'],
  },
  {
    id: 'focus-flow',
    label: 'Focus & Flow',
    subtitle: 'Steady rhythm for deep work and clarity',
    mood: 'cyan',
    moods: ['focus', 'work', 'flow', 'steady', 'clarity'],
    genres: ['ambient', 'electronic', 'acoustic'],
    tags: ['focus', 'work', 'flow', 'study', 'deep'],
    titleHints: ['focus', 'flow', 'work', 'steady', 'mind', 'monk', 'deep'],
  },
  {
    id: 'electric-pulse',
    label: 'Electric Pulse',
    subtitle: 'Charged energy and forward momentum',
    mood: 'cyan',
    moods: ['energy', 'party', 'pulse', 'electric', 'upbeat'],
    genres: ['pop', 'amapiano', 'electronic'],
    tags: ['party', 'hits', 'pulse', 'energy', 'dance'],
    titleHints: ['neon', 'pulse', 'electric', 'party', 'drive', 'rush', 'spark'],
  },
  {
    id: 'cinematic-weight',
    label: 'Cinematic Weight',
    subtitle: 'Expansive emotion with filmic gravity',
    mood: 'violet',
    moods: ['cinematic', 'epic', 'dramatic', 'emotional'],
    genres: ['jazz', 'ambient', 'acoustic'],
    tags: ['cinematic', 'film', 'score', 'epic'],
    titleHints: ['cinematic', 'horizon', 'cathedral', 'dust', 'waltz', 'prayer', 'echo'],
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

function scoreSongForLane(song: ApiSong, lane: EmotionalLaneDefinition) {
  let score = 0
  const signals = new Set<string>()

  const songMood = normalizeLookupKey(song.mood)
  const songGenre = normalizeLookupKey(song.genre)
  const inferredGenre = inferSongGenre(song)
  const songTags = (song.tags ?? [])
    .map((tag) => normalizeLookupKey(tag))
    .filter(Boolean)
  const text = collectSongText(song)

  for (const mood of lane.moods) {
    if (!songMood) continue
    if (songMood.includes(mood) || mood.includes(songMood)) {
      score += 4
      signals.add(song.mood?.trim() || mood)
    }
  }

  for (const genre of lane.genres) {
    const matches =
      songGenre === genre ||
      inferredGenre === genre ||
      text.includes(genre)
    if (!matches) continue
    score += 3
    signals.add(song.genre?.trim() || genre)
  }

  for (const tag of lane.tags) {
    const tagMatch = songTags.some(
      (entry) => entry.includes(tag) || tag.includes(entry),
    )
    if (tagMatch || text.includes(tag)) {
      score += tagMatch ? 2 : 1
      signals.add(tag)
    }
  }

  for (const hint of lane.titleHints) {
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

export function buildEmotionalLanes(
  songs: ApiSong[],
  options?: { minTracks?: number },
): BuiltEmotionalLane[] {
  const minTracks = options?.minTracks ?? 2
  const buckets = new Map<
    string,
    { songs: ApiSong[]; signalCounts: Map<string, number> }
  >()

  for (const lane of EMOTIONAL_LANE_DEFINITIONS) {
    buckets.set(lane.id, { songs: [], signalCounts: new Map() })
  }

  for (const song of songs) {
    let bestLane: EmotionalLaneDefinition | null = null
    let bestScore = 0
    let bestSignals: string[] = []

    for (const lane of EMOTIONAL_LANE_DEFINITIONS) {
      const result = scoreSongForLane(song, lane)
      if (result.score > bestScore) {
        bestScore = result.score
        bestLane = lane
        bestSignals = result.signals
      }
    }

    if (!bestLane || bestScore < MIN_LANE_SCORE) continue

    const bucket = buckets.get(bestLane.id)
    if (!bucket) continue

    bucket.songs.push(song)
    for (const signal of bestSignals) {
      const key = normalizeLookupKey(signal)
      if (!key) continue
      bucket.signalCounts.set(key, (bucket.signalCounts.get(key) ?? 0) + 1)
    }
  }

  return EMOTIONAL_LANE_DEFINITIONS.map((lane) => {
    const bucket = buckets.get(lane.id) ?? { songs: [], signalCounts: new Map() }
    return {
      ...lane,
      trackCount: bucket.songs.length,
      topSignals: rankTopSignals(bucket.signalCounts),
      songIds: bucket.songs.map((song) => song.id),
    }
  })
    .filter((lane) => lane.trackCount >= minTracks)
    .sort((a, b) => b.trackCount - a.trackCount)
}

export function filterSongsByEmotionalLane(
  songs: ApiSong[],
  laneId: string | null,
): ApiSong[] {
  if (!laneId) return songs

  const lane = buildEmotionalLanes(songs, { minTracks: 1 }).find(
    (entry) => entry.id === laneId,
  )
  if (!lane) return []

  const allowedIds = new Set(lane.songIds)
  return songs.filter((song) => allowedIds.has(song.id))
}

export function findEmotionalLane(
  lanes: BuiltEmotionalLane[],
  laneId: string | null,
) {
  if (!laneId) return null
  return lanes.find((lane) => lane.id === laneId) ?? null
}

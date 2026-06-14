import type { ApiSong } from './api'
import { inferSongGenre, normalizeLookupKey } from './catalogIndexes'
import { buildEmotionalLanes } from './emotionalDiscovery'
import { buildListeningScenes } from './sceneListening'

export type RadioSeedType =
  | 'song'
  | 'artist'
  | 'album'
  | 'emotional-lane'
  | 'listening-scene'

export type RadioSeed = {
  type: RadioSeedType
  id: string
  label: string
  song?: ApiSong
  artistId?: string | null
  artistName?: string
  albumId?: string | null
  albumName?: string
  laneId?: string
  sceneId?: string
}

export type ScoredRadioCandidate = {
  song: ApiSong
  score: number
  signals: string[]
}

export type BuiltRadioStation = {
  seed: RadioSeed
  title: string
  subtitle: string
  candidates: ScoredRadioCandidate[]
  tracks: ApiSong[]
  trackCount: number
}

const RADIO_CANDIDATE_LIMIT = 20
const MIN_CANDIDATE_SCORE = 2

type RadioScoringContext = {
  referenceSongs: ApiSong[]
  seedLaneIds: Set<string>
  seedSceneIds: Set<string>
  songLaneMap: Map<string, Set<string>>
  songSceneMap: Map<string, Set<string>>
}

function collectSongText(song: ApiSong) {
  return normalizeLookupKey(
    `${song.title} ${song.album} ${song.artist} ${song.description ?? ''}`,
  )
}

function songsShareArtist(a: ApiSong, b: ApiSong) {
  if (a.artistId && b.artistId) return a.artistId === b.artistId
  const aKey = normalizeLookupKey(a.artist)
  const bKey = normalizeLookupKey(b.artist)
  return Boolean(aKey && bKey && aKey === bKey)
}

function songsShareAlbum(a: ApiSong, b: ApiSong) {
  if (a.albumId && b.albumId) return a.albumId === b.albumId
  const aKey = normalizeLookupKey(a.album)
  const bKey = normalizeLookupKey(b.album)
  return Boolean(aKey && bKey && aKey === bKey)
}

function sharedTags(a: ApiSong, b: ApiSong) {
  const aTags = new Set((a.tags ?? []).map((tag) => normalizeLookupKey(tag)).filter(Boolean))
  return (b.tags ?? [])
    .map((tag) => normalizeLookupKey(tag))
    .filter((tag) => tag && aTags.has(tag))
}

function buildMembershipMaps(catalog: ApiSong[]) {
  const songLaneMap = new Map<string, Set<string>>()
  const songSceneMap = new Map<string, Set<string>>()

  for (const lane of buildEmotionalLanes(catalog, { minTracks: 1 })) {
    for (const songId of lane.songIds) {
      const bucket = songLaneMap.get(songId) ?? new Set<string>()
      bucket.add(lane.id)
      songLaneMap.set(songId, bucket)
    }
  }

  for (const scene of buildListeningScenes(catalog, { minTracks: 1 })) {
    for (const songId of scene.songIds) {
      const bucket = songSceneMap.get(songId) ?? new Set<string>()
      bucket.add(scene.id)
      songSceneMap.set(songId, bucket)
    }
  }

  return { songLaneMap, songSceneMap }
}

function scoreRadioCandidate(candidate: ApiSong, context: RadioScoringContext) {
  let score = 0
  const signals = new Set<string>()
  const reference = context.referenceSongs[0]

  for (const ref of context.referenceSongs) {
    if (songsShareArtist(candidate, ref)) {
      score += 5
      signals.add(candidate.artist)
    }
    if (songsShareAlbum(candidate, ref)) {
      score += 4
      signals.add(candidate.album)
    }
  }

  if (reference) {
    const refGenre = inferSongGenre(reference)
    const candidateGenre = inferSongGenre(candidate)
    if (refGenre === candidateGenre && refGenre !== 'hidden-tunes') {
      score += 3
      signals.add(refGenre)
    }

    const refMood = normalizeLookupKey(reference.mood)
    const candidateMood = normalizeLookupKey(candidate.mood)
    if (refMood && candidateMood && refMood === candidateMood) {
      score += 3
      signals.add(reference.mood?.trim() || refMood)
    }

    for (const tag of sharedTags(reference, candidate)) {
      score += 2
      signals.add(tag)
    }

    const refText = collectSongText(reference)
    const candidateText = collectSongText(candidate)
    const refTokens = refText.split(/\s+/).filter((token) => token.length >= 4)
    for (const token of refTokens) {
      if (!candidateText.includes(token)) continue
      score += 1
      if (signals.size < 6) signals.add(token)
    }
  }

  const candidateLanes = context.songLaneMap.get(candidate.id) ?? new Set<string>()
  for (const laneId of context.seedLaneIds) {
    if (!candidateLanes.has(laneId)) continue
    score += 3
    signals.add(`lane:${laneId}`)
  }

  const candidateScenes = context.songSceneMap.get(candidate.id) ?? new Set<string>()
  for (const sceneId of context.seedSceneIds) {
    if (!candidateScenes.has(sceneId)) continue
    score += 3
    signals.add(`scene:${sceneId}`)
  }

  return {
    score,
    signals: [...signals]
      .filter((signal) => !signal.startsWith('lane:') && !signal.startsWith('scene:'))
      .slice(0, 4)
      .map((signal) =>
        signal
          .split(/[\s_-]+/)
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' '),
      ),
  }
}

function resolveReferenceSongs(catalog: ApiSong[], seed: RadioSeed) {
  if (seed.type === 'song' && seed.song) {
    return [seed.song]
  }

  if (seed.type === 'artist') {
    return catalog.filter((song) => {
      if (seed.artistId && song.artistId) return song.artistId === seed.artistId
      return (
        normalizeLookupKey(song.artist) === normalizeLookupKey(seed.artistName ?? '')
      )
    })
  }

  if (seed.type === 'album') {
    return catalog.filter((song) => {
      if (seed.albumId && song.albumId) return song.albumId === seed.albumId
      return (
        normalizeLookupKey(song.album) === normalizeLookupKey(seed.albumName ?? '')
      )
    })
  }

  if (seed.type === 'emotional-lane' && seed.laneId) {
    const lane = buildEmotionalLanes(catalog, { minTracks: 1 }).find(
      (entry) => entry.id === seed.laneId,
    )
    if (!lane) return []
    return catalog.filter((song) => lane.songIds.includes(song.id))
  }

  if (seed.type === 'listening-scene' && seed.sceneId) {
    const scene = buildListeningScenes(catalog, { minTracks: 1 }).find(
      (entry) => entry.id === seed.sceneId,
    )
    if (!scene) return []
    return catalog.filter((song) => scene.songIds.includes(song.id))
  }

  return []
}

function resolveSeedLanesAndScenes(
  catalog: ApiSong[],
  seed: RadioSeed,
  songLaneMap: Map<string, Set<string>>,
  songSceneMap: Map<string, Set<string>>,
) {
  const seedLaneIds = new Set<string>()
  const seedSceneIds = new Set<string>()

  if (seed.type === 'emotional-lane' && seed.laneId) {
    seedLaneIds.add(seed.laneId)
  }

  if (seed.type === 'listening-scene' && seed.sceneId) {
    seedSceneIds.add(seed.sceneId)
  }

  const referenceSongs = resolveReferenceSongs(catalog, seed)
  for (const song of referenceSongs) {
    for (const laneId of songLaneMap.get(song.id) ?? []) seedLaneIds.add(laneId)
    for (const sceneId of songSceneMap.get(song.id) ?? []) seedSceneIds.add(sceneId)
  }

  return { referenceSongs, seedLaneIds, seedSceneIds }
}

export function createSongRadioSeed(song: ApiSong): RadioSeed {
  return {
    type: 'song',
    id: song.id,
    label: song.title,
    song,
  }
}

export function createArtistRadioSeed(song: ApiSong): RadioSeed {
  return {
    type: 'artist',
    id: song.artistId ?? normalizeLookupKey(song.artist),
    label: song.artist,
    song,
    artistId: song.artistId,
    artistName: song.artist,
  }
}

export function createAlbumRadioSeed(song: ApiSong): RadioSeed {
  return {
    type: 'album',
    id: song.albumId ?? normalizeLookupKey(song.album),
    label: song.album,
    song,
    albumId: song.albumId,
    albumName: song.album,
  }
}

export function createLaneRadioSeed(laneId: string, laneLabel: string): RadioSeed {
  return {
    type: 'emotional-lane',
    id: laneId,
    label: laneLabel,
    laneId,
  }
}

export function createSceneRadioSeed(sceneId: string, sceneLabel: string): RadioSeed {
  return {
    type: 'listening-scene',
    id: sceneId,
    label: sceneLabel,
    sceneId,
  }
}

export function resolveRadioSeed(input: {
  catalog: ApiSong[]
  browseSongs: ApiSong[]
  selectedLaneId: string | null
  selectedLaneLabel?: string | null
  selectedSceneId: string | null
  selectedSceneLabel?: string | null
}): RadioSeed | null {
  const { catalog, browseSongs, selectedLaneId, selectedLaneLabel, selectedSceneId, selectedSceneLabel } =
    input

  if (selectedSceneId && selectedSceneLabel) {
    return createSceneRadioSeed(selectedSceneId, selectedSceneLabel)
  }

  if (selectedLaneId && selectedLaneLabel) {
    return createLaneRadioSeed(selectedLaneId, selectedLaneLabel)
  }

  const anchor = browseSongs[0] ?? catalog[0] ?? null
  if (!anchor) return null

  return createSongRadioSeed(anchor)
}

export function buildRadioStation(
  catalog: ApiSong[],
  seed: RadioSeed,
  options?: { limit?: number },
): BuiltRadioStation | null {
  if (catalog.length < 2) return null

  const limit = options?.limit ?? RADIO_CANDIDATE_LIMIT
  const { songLaneMap, songSceneMap } = buildMembershipMaps(catalog)
  const { referenceSongs, seedLaneIds, seedSceneIds } = resolveSeedLanesAndScenes(
    catalog,
    seed,
    songLaneMap,
    songSceneMap,
  )

  if (referenceSongs.length === 0 && seed.type !== 'song') return null

  const excludeIds = new Set<string>()
  if (seed.type === 'song' && seed.song) {
    excludeIds.add(seed.song.id)
  } else {
    for (const song of referenceSongs) excludeIds.add(song.id)
  }

  const context: RadioScoringContext = {
    referenceSongs: referenceSongs.length > 0 ? referenceSongs : seed.song ? [seed.song] : [],
    seedLaneIds,
    seedSceneIds,
    songLaneMap,
    songSceneMap,
  }

  const scored = catalog
    .filter((song) => !excludeIds.has(song.id))
    .map((song) => {
      const result = scoreRadioCandidate(song, context)
      return { song, score: result.score, signals: result.signals }
    })
    .filter((entry) => entry.score >= MIN_CANDIDATE_SCORE)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.song.title.localeCompare(b.song.title)
    })
    .slice(0, limit)

  const seedTrack =
    seed.type === 'song' && seed.song
      ? seed.song
      : referenceSongs[0] ?? null

  const tracks = seedTrack
    ? [seedTrack, ...scored.filter((entry) => entry.song.id !== seedTrack.id).map((entry) => entry.song)]
    : scored.map((entry) => entry.song)

  if (tracks.length === 0) return null

  const title = `Radio · ${seed.label}`
  const subtitle =
    seed.type === 'song'
      ? `Seeded from ${seed.label}`
      : seed.type === 'artist'
        ? `Artist station around ${seed.label}`
        : seed.type === 'album'
          ? `Album station around ${seed.label}`
          : seed.type === 'emotional-lane'
            ? `Lane station · ${seed.label}`
            : `Scene station · ${seed.label}`

  return {
    seed,
    title,
    subtitle,
    candidates: scored,
    tracks,
    trackCount: tracks.length,
  }
}

export function describeRadioSeed(seed: RadioSeed) {
  switch (seed.type) {
    case 'song':
      return `Song seed · ${seed.label}`
    case 'artist':
      return `Artist seed · ${seed.label}`
    case 'album':
      return `Album seed · ${seed.label}`
    case 'emotional-lane':
      return `Emotional lane · ${seed.label}`
    case 'listening-scene':
      return `Listening scene · ${seed.label}`
    default:
      return seed.label
  }
}

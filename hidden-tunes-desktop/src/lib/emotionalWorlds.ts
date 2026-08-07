import type { ApiSong } from './api'
import { isPlayableMediaUrl } from './desktopPlayback/isPlayableMediaUrl'

export type EmotionalWorldId = 'calm' | 'chill' | 'happy' | 'romantic' | 'motivational' | 'melancholy' | 'energetic'

export type EmotionalWorldProfile = {
  id: EmotionalWorldId
  title: string
  descriptor: string
  meaning: string
  primary: string[]
  secondary: string[]
  genres: string[]
  excluded: string[]
  artwork: string
}

export const EMOTIONAL_WORLDS: EmotionalWorldProfile[] = [
  { id: 'calm', title: 'Calm', descriptor: 'Stillness for a softer mind', meaning: 'Peaceful, healing, spacious and unhurried.', primary: ['calm', 'peaceful', 'serene', 'healing', 'relax', 'soft'], secondary: ['ambient', 'gentle', 'quiet', 'sleep', 'meditation', 'piano'], genres: ['ambient', 'acoustic', 'classical', 'instrumental'], excluded: ['hype', 'party', 'workout', 'aggressive'], artwork: '/artwork/worlds/emotional-world-calm.png' },
  { id: 'chill', title: 'Chill', descriptor: 'Easy grooves after dark', meaning: 'Laid-back, cool, vibey and effortlessly relaxed.', primary: ['chill', 'laid back', 'lofi', 'vibe', 'relaxed'], secondary: ['night', 'smooth', 'groove', 'cool', 'lounge'], genres: ['lofi', 'r&b', 'soul', 'jazz', 'electronic'], excluded: ['aggressive', 'hardcore', 'workout'], artwork: '/artwork/worlds/emotional-world-chill.png' },
  { id: 'happy', title: 'Happy', descriptor: 'Warmth that lifts the room', meaning: 'Bright, joyful, feel-good and optimistic.', primary: ['happy', 'joy', 'joyful', 'feel good', 'uplifting', 'bright'], secondary: ['sunny', 'celebration', 'smile', 'golden', 'fun'], genres: ['pop', 'afrobeats', 'dance', 'funk'], excluded: ['sad', 'heartbreak', 'lonely', 'melancholy'], artwork: '/artwork/worlds/emotional-world-happy.png' },
  { id: 'romantic', title: 'Romantic', descriptor: 'Tender songs for two', meaning: 'Love, intimacy, affection and emotional closeness.', primary: ['romantic', 'romance', 'love', 'intimate', 'tender'], secondary: ['affection', 'heart', 'slow', 'velvet', 'warm'], genres: ['r&b', 'soul', 'love', 'acoustic'], excluded: ['workout', 'aggressive', 'party', 'heartbreak'], artwork: '/artwork/worlds/emotional-world-romantic.png' },
  { id: 'motivational', title: 'Motivational', descriptor: 'Courage in forward motion', meaning: 'Drive, hope, focus, confidence and ascent.', primary: ['motivational', 'motivation', 'inspiring', 'inspiration', 'confidence', 'triumph'], secondary: ['focus', 'hope', 'courage', 'rise', 'power', 'win'], genres: ['pop', 'hip hop', 'gospel', 'electronic'], excluded: ['sleep', 'heartbreak', 'melancholy', 'lonely'], artwork: '/artwork/worlds/emotional-world-motivational.png' },
  { id: 'melancholy', title: 'Melancholy', descriptor: 'Beauty in the ache', meaning: 'Heartbreak, solitude, sadness and deep reflection.', primary: ['melancholy', 'sad', 'heartbreak', 'lonely', 'sorrow'], secondary: ['reflective', 'emotional', 'rain', 'miss', 'blue', 'slow'], genres: ['soul', 'blues', 'acoustic', 'piano', 'jazz'], excluded: ['hype', 'party', 'workout', 'celebration'], artwork: '/artwork/worlds/emotional-world-melancholy.png' },
  { id: 'energetic', title: 'Energetic', descriptor: 'A pulse built for movement', meaning: 'Hype, workout, momentum and kinetic release.', primary: ['energetic', 'energy', 'hype', 'workout', 'power', 'party'], secondary: ['dance', 'movement', 'fast', 'club', 'pulse'], genres: ['dance', 'electronic', 'afrobeats', 'hip hop', 'rock'], excluded: ['sleep', 'calm', 'sad', 'ambient'], artwork: '/artwork/worlds/emotional-world-energetic.png' },
]

export type EmotionalWorldCatalog = { exact: ApiSong[]; broadened: ApiSong[]; tracks: ApiSong[]; topScore: number; lowScore: number }

const normalize = (value: string | null | undefined) => (value ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
const contains = (haystack: string, needle: string) => haystack.includes(normalize(needle))

function scoreSong(song: ApiSong, world: EmotionalWorldProfile) {
  const mood = normalize(song.mood)
  const genre = normalize(song.genre)
  const tags = (song.tags ?? []).map(normalize).join(' ')
  const context = normalize(`${song.title} ${song.album} ${song.description ?? ''}`)
  const all = `${mood} ${genre} ${tags} ${context}`
  if (world.excluded.some((token) => contains(all, token))) return -20
  let score = 0
  for (const token of world.primary) {
    if (contains(mood, token)) score += 8
    if (contains(tags, token)) score += 6
    if (contains(context, token)) score += 2
  }
  for (const token of world.secondary) {
    if (contains(mood, token)) score += 4
    if (contains(tags, token)) score += 3
    if (contains(context, token)) score += 1
  }
  for (const token of world.genres) if (contains(genre, token)) score += 3
  return score
}

export function buildEmotionalWorldCatalog(songs: ApiSong[], world: EmotionalWorldProfile): EmotionalWorldCatalog {
  const ranked = songs
    .filter((song) => isPlayableMediaUrl(song.audioUrl) || isPlayableMediaUrl(song.previewUrl) || isPlayableMediaUrl(song.highQualityUrl))
    .map((song, index) => ({ song, index, score: scoreSong(song, world) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
  const exact = ranked.filter((entry) => entry.score >= 8)
  const broadened = ranked.filter((entry) => entry.score >= 3 && entry.score < 8)
  const selected = [...exact, ...broadened].slice(0, 100)
  return { exact: exact.map((entry) => entry.song), broadened: broadened.map((entry) => entry.song), tracks: selected.map((entry) => entry.song), topScore: selected[0]?.score ?? 0, lowScore: selected.at(-1)?.score ?? 0 }
}

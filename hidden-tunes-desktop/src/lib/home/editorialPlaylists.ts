import type { ApiSong } from '../api'
import { sortSongsList } from '../api'
import { filterSongsByListeningScene } from '../sceneListening'

export type EditorialPlaylistSpec = {
  id: string
  title: string
  aliases?: readonly string[]
  description: string
  owner: string
  sceneId: string
  showMoon?: boolean
}

export const EDITORIAL_PLAYLIST_SPECS: EditorialPlaylistSpec[] = [
  {
    id: 'night-drive',
    title: 'Night Drive',
    aliases: ['late night drive'],
    description: 'Late nights, open roads and the perfect soundtrack.',
    owner: 'Hidden Tunes',
    sceneId: 'midnight-drive',
    showMoon: true,
  },
  {
    id: 'deep-focus',
    title: 'Deep Focus',
    description: 'Clear headspace and steady concentration.',
    owner: 'Hidden Tunes',
    sceneId: 'focus-room',
  },
  {
    id: 'afro-vibes',
    title: 'Afro Vibes',
    description: 'Warm grooves and golden-hour rhythm.',
    owner: 'Hidden Tunes',
    sceneId: 'sunday-morning',
  },
  {
    id: 'chill-relax',
    title: 'Chill & Relax',
    aliases: ['chill vibes'],
    description: 'Soft calm for unwinding and reflection.',
    owner: 'Hidden Tunes',
    sceneId: 'heartbreak-recovery',
  },
  {
    id: 'workout-mix',
    title: 'Workout Mix',
    description: 'High-energy momentum to keep you moving.',
    owner: 'Hidden Tunes',
    sceneId: 'city-lights',
  },
  {
    id: 'rainy-day-comfort',
    title: 'Rainy Day Comfort',
    description: 'Rain-lit calm and gentle comfort.',
    owner: 'Hidden Tunes',
    sceneId: 'rainy-window',
  },
]

export function resolveEditorialPlaylistSpec(query: string): EditorialPlaylistSpec {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return EDITORIAL_PLAYLIST_SPECS[0]
  const matched = EDITORIAL_PLAYLIST_SPECS.find((spec) => {
    if (spec.id.toLowerCase() === normalized) return true
    if (spec.title.toLowerCase() === normalized) return true
    return spec.aliases?.some((alias) => alias.toLowerCase() === normalized) ?? false
  })
  return matched ?? EDITORIAL_PLAYLIST_SPECS[0]
}

export function resolveEditorialPlaylistTracks(songs: ApiSong[], sceneId: string) {
  return sortSongsList(filterSongsByListeningScene(songs, sceneId), 'latest')
}

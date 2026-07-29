export type MusicGenreDefinition = {
  id: string
  label: string
  slug: string
  backendValues: string[]
  aliases: string[]
  requestValue: string
  artwork?: string
}

export const MUSIC_GENRES: readonly MusicGenreDefinition[] = [
  { id: 'afrobeats', label: 'Afrobeats', slug: 'afrobeats', requestValue: 'afrobeat', backendValues: ['Afrobeats', 'Afrobeat', 'Afrobeat ,Afro fusion', 'Afrobeat, Afro Soul'], aliases: ['afrobeat', 'afro-beats', 'afro beats'] },
  { id: 'hip-hop', label: 'Hip-Hop', slug: 'hip-hop', requestValue: 'hip-hop', backendValues: ['Hip-Hop / Rap'], aliases: ['hip hop', 'hiphop', 'rap'] },
  { id: 'r-and-b', label: 'R&B', slug: 'r-and-b', requestValue: 'soul', backendValues: ['R&B', 'R&B / Soul'], aliases: ['r&b', 'rnb', 'rhythm and blues', 'r and b'] },
  { id: 'pop', label: 'Pop', slug: 'pop', requestValue: 'pop', backendValues: ['Pop', 'Pop , country', 'Pop, Country'], aliases: ['popular'] },
  { id: 'rock', label: 'Rock', slug: 'rock', requestValue: 'rock', backendValues: ['Rock'], aliases: [] },
  { id: 'dance', label: 'Dance', slug: 'dance', requestValue: 'edm', backendValues: ['EDM'], aliases: ['edm', 'electronic dance'] },
  { id: 'jazz', label: 'Jazz', slug: 'jazz', requestValue: 'jazz', backendValues: ['Jazz', 'Jazz, Instrumentals', 'French Café Jazz & Chanson'], aliases: [] },
  { id: 'classical', label: 'Classical', slug: 'classical', requestValue: 'classical', backendValues: ['Classical'], aliases: [] },
  { id: 'gospel', label: 'Gospel', slug: 'gospel', requestValue: 'gospel', backendValues: ['Gospel', 'Gospel, Worship, Pop', 'Gospel Pop', 'Gospel / Worship'], aliases: ['christian gospel', 'worship'] },
  { id: 'country', label: 'Country', slug: 'country', requestValue: 'country', backendValues: ['Country', 'Country, Love', 'Love country'], aliases: [] },
  { id: 'latin', label: 'Latin', slug: 'latin', requestValue: 'latin', backendValues: ['Latin', 'Latin Pop'], aliases: ['latin pop'] },
  { id: 'reggae', label: 'Reggae', slug: 'reggae', requestValue: 'reggae', backendValues: ['Reggae'], aliases: [] },
] as const

const normalize = (value: string) => value.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function getMusicGenreBySlug(slug: string): MusicGenreDefinition | null {
  const key = normalize(slug)
  return MUSIC_GENRES.find((genre) => normalize(genre.slug) === key) ?? null
}

export function getMusicGenreByLabelOrAlias(value: string): MusicGenreDefinition | null {
  const key = normalize(value)
  return MUSIC_GENRES.find((genre) =>
    [genre.label, genre.slug, ...genre.aliases].some((candidate) => normalize(candidate) === key),
  ) ?? null
}

export const createMusicGenreIntent = (slug: string) => `genre:${slug}`

export function parseMusicGenreIntent(value: string): MusicGenreDefinition | null {
  const match = value.trim().match(/^genre:([a-z0-9-]+)$/i)
  return match ? getMusicGenreBySlug(match[1]) : null
}

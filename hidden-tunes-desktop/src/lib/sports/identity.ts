/** Stable Sports fixture identity — never collide with TV/Radio/Library ids. */

export const SPORTS_IDENTITY_PREFIX = 'sports:'
export const SPORTS_SONG_ID_PREFIX = 'sports-'

export function sportsFixtureIdentity(id: string): string {
  const clean = String(id || '').trim()
  return `${SPORTS_IDENTITY_PREFIX}${clean}`
}

export function sportsFixtureSongId(id: string): string {
  const clean = String(id || '').trim()
  return `${SPORTS_SONG_ID_PREFIX}${clean}`
}

export function extractSportsFixtureIdFromIdentity(identity: string): string | null {
  const trimmed = String(identity || '').trim()
  if (!trimmed.startsWith(SPORTS_IDENTITY_PREFIX)) return null
  const id = trimmed.slice(SPORTS_IDENTITY_PREFIX.length).trim()
  return id || null
}

export function extractSportsFixtureIdFromSongId(songId: string): string | null {
  const trimmed = String(songId || '').trim()
  if (!trimmed.startsWith(SPORTS_SONG_ID_PREFIX)) return null
  const id = trimmed.slice(SPORTS_SONG_ID_PREFIX.length).trim()
  return id || null
}

export function isSportsFixtureIdentity(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith(SPORTS_IDENTITY_PREFIX) && value.length > SPORTS_IDENTITY_PREFIX.length)
}

export function isSportsSongId(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith(SPORTS_SONG_ID_PREFIX) && value.length > SPORTS_SONG_ID_PREFIX.length)
}

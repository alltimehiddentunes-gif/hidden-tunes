import type { MusicGenreDefinition } from '../musicGenres'

// Search-only registry; does not change navigation or the browse taxonomy.
export const MUSIC_SEARCH_GENRES: readonly (readonly [string, readonly string[], readonly string[]])[] = [
  ["Country",[],["Country Rock","Country Pop","Americana","Country, Love","Love country","Pop, Country","Pop , country"]],
  ["Amapiano",[],[]],
  ["Blues",[],["Soul Blues"]],
  ["Soul Blues",[],["Blues"]],
  ["Gospel",[],["Gospel / Worship","Gospel/Worship","Gospel Pop","Gospel, Worship, Pop"]],
  ["Reggae",[],["Reggae / Dancehall","Reggae/Dancehall"]],
  ["Reggae/Dancehall",["Reggae / Dancehall"],["Reggae","Dancehall"]],
  ["Rock",[],["Alternative Rock","Classic Rock","Indie Rock","Hard Rock","Pop Rock","Country Rock"]],
  ["R&B",["RnB","r and b","rhythm and blues"],["R&B / Soul","R&B/Soul"]],
  ["R&B/Soul",["R&B / Soul"],["R&B","RnB"]],
  ["Pop",[],["Pop, Country","Pop , country","Country Pop","Pop Rock","Gospel Pop","Latin Pop"]],
  ["Afrobeats",["Afrobeat","afro beats","afro-beats"],["Afrobeat ,Afro fusion","Afrobeat, Afro Soul"]],
  ["Afropop",["afro pop","afro-pop"],[]],
  ["Highlife",[],[]],
  ["Hiplife",[],[]],
  ["Hip-Hop",["Hip Hop","hiphop"],["Hip-Hop / Rap","Hip-Hop/Rap","Rap"]],
  ["Hip-Hop/Rap",["Hip-Hop / Rap","Hip Hop / Rap"],["Hip-Hop","Hip Hop","Rap"]],
  ["Rap",[],["Hip-Hop / Rap","Hip-Hop/Rap","Hip-Hop","Hip Hop"]],
  ["Dancehall",[],["Reggae / Dancehall","Reggae/Dancehall"]],
  ["Jazz",[],["Jazz, Instrumentals","French Café Jazz & Chanson"]]
]

export function normalizeGenre(value: string) {
  return value.normalize('NFKD').replace(/\p{Mark}+/gu, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

const searchDefinitions: MusicGenreDefinition[] = MUSIC_SEARCH_GENRES.map(([label, aliases, family]) => {
  const slug = normalizeGenre(label).replace(/ /g, '-')
  return { id: slug, slug, label, aliases: [...aliases], requestValue: label, backendValues: [label, ...aliases, ...family] }
})

export function resolveSearchGenre(value: string): MusicGenreDefinition | null {
  const key = normalizeGenre(value)
  return searchDefinitions.find(intent => [intent.label, ...intent.aliases].some(alias => normalizeGenre(alias) === key)) ?? null
}

export function searchGenreRank(value: string, intent: MusicGenreDefinition | null) {
  if (!intent) return 0
  const key = normalizeGenre(value)
  if ([intent.label, ...intent.aliases].some(label => normalizeGenre(label) === key)) return 2
  return intent.backendValues.some(label => normalizeGenre(label) === key) ? 1 : 0
}

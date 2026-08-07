import type { ApiAlbum, ApiArtist, ApiSong } from '../api'
import { getMusicGenreByLabelOrAlias, type MusicGenreDefinition } from '../musicGenres'

export const SEARCH_TOP_MATCH_CONFIDENCE = 0.78

export const SEARCH_RELEVANCE_WEIGHTS = {
  exactTitle: 100,
  exactGenre: 96,
  exactArtist: 94,
  exactAlbum: 92,
  prefix: 68,
  allTokens: 56,
  genreTag: 52,
  metadataToken: 18,
  zeroTokenPenalty: -48,
} as const

export type RankedSearchSong = {
  item: ApiSong
  score: number
  confidence: number
  reasons: string[]
}

export const normalizeSearchText = (value: string) =>
  value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export const tokenizeSearchQuery = (value: string) =>
  [...new Set(normalizeSearchText(value).split(' ').filter(Boolean))]

export function resolveExactGenreIntent(query: string): MusicGenreDefinition | null {
  return getMusicGenreByLabelOrAlias(query)
}

function includesAll(haystack: string, tokens: string[]) {
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token))
}

export function rankSearchSongs(songs: ApiSong[], query: string): RankedSearchSong[] {
  const normalizedQuery = normalizeSearchText(query)
  const tokens = tokenizeSearchQuery(query)
  const unique = new Map<string, ApiSong>()
  for (const song of songs) if (!unique.has(song.id)) unique.set(song.id, song)

  return [...unique.values()].map((item) => {
    const title = normalizeSearchText(item.title)
    const artist = normalizeSearchText(item.artist)
    const album = normalizeSearchText(item.album)
    const genre = normalizeSearchText(item.genre ?? '')
    const metadata = normalizeSearchText([item.title, item.artist, item.album, item.genre, item.mood, ...item.tags].filter(Boolean).join(' '))
    const reasons: string[] = []
    let score = 0
    if (title === normalizedQuery) { score += SEARCH_RELEVANCE_WEIGHTS.exactTitle; reasons.push('exact title') }
    if (artist === normalizedQuery) { score += SEARCH_RELEVANCE_WEIGHTS.exactArtist; reasons.push('exact artist') }
    if (album === normalizedQuery) { score += SEARCH_RELEVANCE_WEIGHTS.exactAlbum; reasons.push('exact album') }
    if (genre === normalizedQuery || genre.split(' ').includes(normalizedQuery)) { score += SEARCH_RELEVANCE_WEIGHTS.exactGenre; reasons.push('exact genre') }
    if (title.startsWith(normalizedQuery) || artist.startsWith(normalizedQuery) || album.startsWith(normalizedQuery)) { score += SEARCH_RELEVANCE_WEIGHTS.prefix; reasons.push('prefix match') }
    if (includesAll(metadata, tokens)) { score += SEARCH_RELEVANCE_WEIGHTS.allTokens; reasons.push('all query tokens') }
    const tokenHits = tokens.filter((token) => metadata.includes(token)).length
    score += tokenHits * SEARCH_RELEVANCE_WEIGHTS.metadataToken
    if (tokens.length > 0 && tokenHits === 0) { score += SEARCH_RELEVANCE_WEIGHTS.zeroTokenPenalty; reasons.push('zero-token penalty') }
    return { item, score, confidence: Math.max(0, Math.min(1, score / 150)), reasons }
  }).sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
}

export function rankArtists(artists: ApiArtist[], query: string) {
  const q = normalizeSearchText(query)
  return [...artists].sort((a, b) => {
    const score = (artist: ApiArtist) => normalizeSearchText(artist.name) === q ? 100 : normalizeSearchText(artist.name).startsWith(q) ? 68 : normalizeSearchText(artist.name).includes(q) ? 36 : 0
    return score(b) - score(a) || a.name.localeCompare(b.name)
  })
}

export function rankAlbums(albums: ApiAlbum[], query: string) {
  const q = normalizeSearchText(query)
  return [...albums].sort((a, b) => {
    const score = (album: ApiAlbum) => normalizeSearchText(album.title) === q ? 100 : normalizeSearchText(album.title).startsWith(q) ? 68 : normalizeSearchText(album.title).includes(q) ? 36 : 0
    return score(b) - score(a) || a.title.localeCompare(b.title)
  })
}

export function qualifiesForTopMatch(result: RankedSearchSong | null | undefined) {
  return Boolean(result && result.confidence >= SEARCH_TOP_MATCH_CONFIDENCE && !result.reasons.includes('zero-token penalty'))
}

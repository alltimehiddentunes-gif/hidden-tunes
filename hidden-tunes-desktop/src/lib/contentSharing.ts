export const HIDDEN_TUNES_WEB_ORIGIN = 'https://hiddentunes.com' as const

export type ShareableContent =
  | { type: 'artist'; id: string; title: string }
  | { type: 'track'; id: string; title: string; artist?: string | null }
  | { type: 'album'; id: string; title: string; artist?: string | null }
  | { type: 'radioStation'; id: string; title: string }
  | { type: 'podcast'; id: string; title: string }
  | { type: 'podcastEpisode'; showId: string; episodeId: string; title: string; podcastTitle?: string | null }
  | { type: 'audiobook'; id: string; title: string; author?: string | null }
  | { type: 'audiobookChapter'; bookId: string; chapterId: string; title: string }
  | { type: 'tvChannel'; id: string; title: string }
  | { type: 'motivational'; id: string; title: string }
  | { type: 'lecture'; id: string; title: string }

export type ParsedHiddenTunesContent =
  | { type: Exclude<ShareableContent['type'], 'podcastEpisode' | 'audiobookChapter'>; id: string }
  | { type: 'podcastEpisode'; showId: string; episodeId: string }
  | { type: 'audiobookChapter'; bookId: string; chapterId: string }

const singleSegmentRoutes = {
  artist: '/artists', track: '/tracks', album: '/albums', radioStation: '/radio/stations',
  podcast: '/podcasts', audiobook: '/audiobooks', tvChannel: '/tv/channels',
  motivational: '/motivationals', lecture: '/lectures',
} as const
const forbiddenIdCharacters = /[\\/\u0000-\u001f\u007f]/

export function requireStableContentId(value: string, label = 'content ID'): string {
  const id = value.trim()
  if (!id || id.length > 200 || forbiddenIdCharacters.test(id)) throw new Error(`Invalid ${label}`)
  let decoded = id
  for (let pass = 0; pass < 3; pass += 1) {
    let next: string
    try { next = decodeURIComponent(decoded) } catch { throw new Error(`Invalid ${label}`) }
    if (next === decoded) break
    decoded = next
  }
  if (!decoded || decoded === '.' || decoded === '..' || forbiddenIdCharacters.test(decoded)) throw new Error(`Invalid ${label}`)
  return id
}

const segment = (value: string, label?: string) => encodeURIComponent(requireStableContentId(value, label))

export function canonicalPathForContent(content: ShareableContent): string {
  if (content.type === 'podcastEpisode') return `/podcasts/${segment(content.showId, 'podcast ID')}/episodes/${segment(content.episodeId, 'episode ID')}`
  if (content.type === 'audiobookChapter') return `/audiobooks/${segment(content.bookId, 'audiobook ID')}/chapters/${segment(content.chapterId, 'chapter ID')}`
  return `${singleSegmentRoutes[content.type]}/${segment(content.id)}`
}

export function canonicalUrlForContent(content: ShareableContent): string {
  const url = `${HIDDEN_TUNES_WEB_ORIGIN}${canonicalPathForContent(content)}`
  if (url.length > 2048) throw new Error('Canonical URL is too long')
  return url
}

export function shareMessageForContent(content: ShareableContent): string {
  const title = content.title.trim() || 'Hidden Tunes'; const suffix = canonicalUrlForContent(content)
  if (content.type === 'artist' || content.type === 'podcast') return `Discover ${title} on Hidden Tunes.\n${suffix}`
  if (content.type === 'track' || content.type === 'album') return `Listen to ${title}${content.artist?.trim() ? ` by ${content.artist.trim()}` : ''} on Hidden Tunes.\n${suffix}`
  if (content.type === 'radioStation') return `Listen to ${title} live on Hidden Tunes.\n${suffix}`
  if (content.type === 'podcastEpisode') return `Listen to ${title}${content.podcastTitle?.trim() ? ` from ${content.podcastTitle.trim()}` : ''} on Hidden Tunes.\n${suffix}`
  if (content.type === 'audiobook') return `Listen to ${title}${content.author?.trim() ? ` by ${content.author.trim()}` : ''} on Hidden Tunes.\n${suffix}`
  if (content.type === 'tvChannel') return `Watch ${title} on Hidden Tunes.\n${suffix}`
  return `Listen to ${title} on Hidden Tunes.\n${suffix}`
}

export function isExactHiddenTunesUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'hiddentunes.com' && url.port === '' && url.username === '' && url.password === ''
  } catch { return false }
}

const decodedSegment = (value: string): string | null => {
  try { const decoded = decodeURIComponent(value); requireStableContentId(decoded); return decoded } catch { return null }
}

export function parseHiddenTunesUrl(value: string): ParsedHiddenTunesContent | null {
  if (!isExactHiddenTunesUrl(value)) return null
  const url = new URL(value)
  if (url.search || url.hash || value.length > 2048) return null
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length === 4 && parts[0] === 'podcasts' && parts[2] === 'episodes') {
    const showId = decodedSegment(parts[1]); const episodeId = decodedSegment(parts[3])
    return showId && episodeId ? { type: 'podcastEpisode', showId, episodeId } : null
  }
  if (parts.length === 4 && parts[0] === 'audiobooks' && parts[2] === 'chapters') {
    const bookId = decodedSegment(parts[1]); const chapterId = decodedSegment(parts[3])
    return bookId && chapterId ? { type: 'audiobookChapter', bookId, chapterId } : null
  }
  const id = parts.length === 2 ? decodedSegment(parts[1]) : parts.length === 3 ? decodedSegment(parts[2]) : null
  const type = parts.length === 2
    ? ({ artists: 'artist', tracks: 'track', albums: 'album', podcasts: 'podcast', audiobooks: 'audiobook', motivationals: 'motivational', lectures: 'lecture' } as const)[parts[0] as 'artists']
    : parts.length === 3 && parts[0] === 'radio' && parts[1] === 'stations' ? 'radioStation'
      : parts.length === 3 && parts[0] === 'tv' && parts[1] === 'channels' ? 'tvChannel' : null
  return type && id ? { type, id } : null
}

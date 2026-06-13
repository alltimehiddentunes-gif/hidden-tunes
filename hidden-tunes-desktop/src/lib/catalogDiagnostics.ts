const PREFIX = '[ht-catalog]'

function shouldLog() {
  return import.meta.env.DEV
}

export function logCatalogFetch(stats: {
  songCount: number
  albumCount: number
  artistCount: number
  durationMs: number
  source: 'live' | 'cache'
}) {
  if (!shouldLog()) return
  console.info(`${PREFIX} fetch`, stats)
}

export function logCatalogCacheHit(stats: { songCount: number; cachedAt: string }) {
  if (!shouldLog()) return
  console.info(`${PREFIX} cache hit`, stats)
}

export function logCatalogCacheMiss() {
  if (!shouldLog()) return
  console.info(`${PREFIX} cache miss`)
}

export function logCatalogIndexBuild(stats: {
  songCount: number
  durationMs: number
  songsById: number
  songsByArtistId: number
  songsByAlbumId: number
  songsByMood: number
  songsByGenre: number
}) {
  if (!shouldLog()) return
  console.info(`${PREFIX} index build`, stats)
}

export function logCatalogSearch(stats: {
  queryLength: number
  resultCount: number
  durationMs: number
  capped: boolean
  skipped: boolean
  mode?: 'default' | 'lightweight' | 'full'
}) {
  if (!shouldLog()) return
  console.info(`${PREFIX} search`, stats)
}

export function logArtistResolve(stats: {
  artistId: string
  resultCount: number
  durationMs: number
  source: 'id' | 'name' | 'tracks' | 'none'
}) {
  if (!shouldLog()) return
  console.info(`${PREFIX} artist resolve`, stats)
}

export function logAlbumResolve(stats: {
  albumId: string
  resultCount: number
  durationMs: number
  source: 'id' | 'name' | 'none'
}) {
  if (!shouldLog()) return
  console.info(`${PREFIX} album resolve`, stats)
}

export function logQueueExtension(stats: {
  seedType: string
  addedCount: number
  durationMs: number
  inspectedCount: number
}) {
  if (!shouldLog()) return
  console.info(`${PREFIX} queue extension`, stats)
}

export function logAudioVersionSelection(stats: {
  selectedTier: string
  hasUltraLight: boolean
  hasStandard: boolean
  hasHighQuality: boolean
  hasLossless: boolean
}) {
  if (!shouldLog()) return
  console.info('[ht-audio-version]', stats)
}

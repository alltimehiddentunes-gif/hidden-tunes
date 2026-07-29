/**
 * Safe catalog/metadata display normalisation.
 * Does not invent names or counts. Rejects blank/mojibake text for UI.
 */

/** Common UTF-8→legacy→UTF-8 mojibake fingerprints (do not "repair" — reject). */
const MOJIBAKE_RE =
  /(?:Ã.|Â.|â€.|â€™|â€œ|â€˜|├[âó]|┬.|Ô[Çé]|Ôé¼|�|ï¿½)/

const GENERIC_ALBUM_TITLES = new Set(['singles', 'album', 'unknown album', 'untitled album', 'untitled'])

export function isMojibakeText(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false
  return MOJIBAKE_RE.test(value)
}

/**
 * Trim, reject blanks and known mojibake. Returns null when unsuitable for display.
 */
export function normalizeCatalogDisplayText(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed) return null
  if (isMojibakeText(trimmed)) return null
  // Reject leftover object-stringification / placeholder noise
  if (/^\[object\s/i.test(trimmed)) return null
  return trimmed
}

export function normalizeCatalogArtistLabel(
  value: string | null | undefined,
  options?: { allowUnknownFallback?: boolean },
): string | null {
  const cleaned = normalizeCatalogDisplayText(value)
  if (!cleaned) {
    return options?.allowUnknownFallback ? 'Unknown artist' : null
  }
  const lowered = cleaned.toLowerCase()
  if (lowered === 'unknown artist' || lowered === 'unknown') {
    return options?.allowUnknownFallback ? 'Unknown artist' : null
  }
  return cleaned
}

/**
 * Album title for cards. Keeps genuine "Singles" from catalog when it is the
 * only title, but callers should avoid duplicating it as secondary meta.
 */
export function normalizeCatalogAlbumTitle(
  value: string | null | undefined,
): string | null {
  return normalizeCatalogDisplayText(value)
}

export function isGenericAlbumTitle(value: string | null | undefined): boolean {
  const cleaned = normalizeCatalogDisplayText(value)
  if (!cleaned) return true
  return GENERIC_ALBUM_TITLES.has(cleaned.toLowerCase())
}

/**
 * Build secondary meta without duplicate segments, blank parts, or "0 songs".
 */
export function formatCatalogMetaParts(
  parts: Array<string | null | undefined>,
  separator = ' · ',
): string | null {
  const cleaned: string[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    const text = normalizeCatalogDisplayText(part)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    cleaned.push(text)
  }
  if (cleaned.length === 0) return null
  return cleaned.join(separator)
}

export function formatSongCountLabel(
  count: number | null | undefined,
  options?: { noun?: 'song' | 'track'; omitZero?: boolean },
): string | null {
  if (count == null || !Number.isFinite(count) || count < 0) return null
  const omitZero = options?.omitZero !== false
  if (omitZero && count === 0) return null
  const noun = options?.noun ?? 'song'
  const rounded = Math.floor(count)
  return `${rounded} ${rounded === 1 ? noun : `${noun}s`}`
}

/**
 * Album card secondary line: year + track count when available.
 * Omits "0 songs/tracks". Skips repeating a generic album title.
 */
export function formatAlbumCardSecondary(input: {
  title?: string | null
  releaseYear?: number | null
  trackCount?: number | null
}): string | null {
  const year =
    typeof input.releaseYear === 'number' && Number.isFinite(input.releaseYear)
      ? `Released ${input.releaseYear}`
      : null
  const tracks = formatSongCountLabel(input.trackCount, { noun: 'track', omitZero: true })
  return formatCatalogMetaParts([year, tracks])
}

/**
 * Song secondary line: artist · album, omitting blanks/mojibake/duplicates.
 */
export function formatSongCardSecondary(input: {
  artist?: string | null
  album?: string | null
}): string | null {
  const artist = normalizeCatalogArtistLabel(input.artist)
  const album = normalizeCatalogAlbumTitle(input.album)
  // Avoid "Singles · Singles" style duplication with title handled by caller
  return formatCatalogMetaParts([artist, album])
}

/** Pick first usable string field from catalog row variants. */
export function pickCatalogString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string') {
      const cleaned = normalizeCatalogDisplayText(value)
      if (cleaned) return cleaned
    }
  }
  return null
}

/**
 * Resolve album title from flat or nested API shapes without String(object).
 */
export function pickAlbumTitleFromRecord(
  record: Record<string, unknown>,
): string | null {
  const direct = pickCatalogString(record, ['album_title', 'albumTitle'])
  if (direct) return direct

  const albumField = record.album
  if (typeof albumField === 'string') {
    return normalizeCatalogDisplayText(albumField)
  }
  if (albumField && typeof albumField === 'object' && !Array.isArray(albumField)) {
    const nested = albumField as Record<string, unknown>
    return pickCatalogString(nested, ['title', 'name', 'album_title', 'albumTitle'])
  }

  const albumsField = record.albums
  if (albumsField && typeof albumsField === 'object' && !Array.isArray(albumsField)) {
    const nested = albumsField as Record<string, unknown>
    return pickCatalogString(nested, ['title', 'name', 'album_title', 'albumTitle'])
  }

  return null
}

export function pickArtistNameFromRecord(
  record: Record<string, unknown>,
): string | null {
  const direct = pickCatalogString(record, ['artist', 'artist_name', 'artistName'])
  if (direct) return direct
  const nested = record.artists
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return pickCatalogString(nested as Record<string, unknown>, ['name', 'title'])
  }
  return null
}

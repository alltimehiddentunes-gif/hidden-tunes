import { createHash } from 'node:crypto'

export const TV_ARTWORK_ORIGIN = 'https://pub-cdc7ab995ca34ff1b3f95453a8024aa3.r2.dev'

export function normalizeTvArtworkUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const url = new URL(raw)
    if (url.origin !== TV_ARTWORK_ORIGIN) return null
    if (!/^\/(covers|artists)\//.test(url.pathname) || url.pathname.includes('..') || url.pathname.includes('\\')) return null
    return `${TV_ARTWORK_ORIGIN}${url.pathname}`
  } catch { return null }
}

export function tvArtworkHash(normalizedUrl) {
  return createHash('sha256').update(normalizedUrl, 'utf8').digest('hex').slice(0, 24)
}

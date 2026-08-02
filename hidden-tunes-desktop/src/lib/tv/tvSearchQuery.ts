/**
 * Desktop TV search query helpers — keep aligned with mobile `utils/tvSearchQuery.ts`
 * and backend `lib/tvPublicSearchQuery.ts` (hyphen normalisation + country→ISO).
 */

export function normalizeTvSearchQuery(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

import { TV_COUNTRY_DISPLAY_LABELS } from './formatTvChannelDisplay'

const COUNTRY_ALIASES: Record<string, string> = {
  'great britain': 'GB', britain: 'GB', uk: 'GB',
  'united states of america': 'US', usa: 'US',
  uae: 'AE', 'republic of korea': 'KR',
}

const TV_SEARCH_COUNTRY_NAME_TO_CODE = Object.entries(TV_COUNTRY_DISPLAY_LABELS)
  .reduce<Record<string, string>>((map, [code, name]) => {
    if (code !== 'UK') map[normalizeTvSearchQuery(name).toLowerCase()] = code
    return map
  }, { ...COUNTRY_ALIASES })

const COUNTRY_MATCHES = Object.entries(TV_SEARCH_COUNTRY_NAME_TO_CODE)
  .sort(([left], [right]) => right.length - left.length)

export function resolveTvSearchCountryCode(rawQuery: string): string | null {
  const key = normalizeTvSearchQuery(rawQuery).toLowerCase()
  if (!key) return null
  const upper = key.toUpperCase()
  if (/^[A-Z]{2}$/.test(upper) && TV_COUNTRY_DISPLAY_LABELS[upper]) return upper
  return TV_SEARCH_COUNTRY_NAME_TO_CODE[key] ?? null
}

export type TvSearchIntent = { country: string | null; query: string | null }

/** Split pure or edge-qualified country intent from ordinary catalogue text. */
export function classifyTvSearchQuery(rawQuery: string): TvSearchIntent {
  const normalized = normalizeTvSearchQuery(rawQuery)
  const exactCountry = resolveTvSearchCountryCode(normalized)
  if (exactCountry) return { country: exactCountry, query: null }

  const lower = normalized.toLowerCase()
  for (const [alias, code] of COUNTRY_MATCHES) {
    if (lower.startsWith(`${alias} `)) {
      return { country: code, query: normalized.slice(alias.length).trim() || null }
    }
    if (lower.endsWith(` ${alias}`)) {
      return { country: code, query: normalized.slice(0, -alias.length).trim() || null }
    }
  }
  const tokens = normalized.split(' ')
  for (const edge of [0, tokens.length - 1]) {
    const code = resolveTvSearchCountryCode(tokens[edge] || '')
    if (code) {
      tokens.splice(edge, 1)
      return { country: code, query: tokens.join(' ').trim() || null }
    }
  }
  return { country: null, query: normalized || null }
}

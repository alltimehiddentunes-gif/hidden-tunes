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

const TV_SEARCH_COUNTRY_NAME_TO_CODE: Record<string, string> = {
  afghanistan: 'AF',
  argentina: 'AR',
  australia: 'AU',
  brazil: 'BR',
  canada: 'CA',
  china: 'CN',
  egypt: 'EG',
  france: 'FR',
  germany: 'DE',
  ghana: 'GH',
  india: 'IN',
  ireland: 'IE',
  italy: 'IT',
  jamaica: 'JM',
  japan: 'JP',
  kenya: 'KE',
  mexico: 'MX',
  netherlands: 'NL',
  nigeria: 'NG',
  'south africa': 'ZA',
  spain: 'ES',
  'united kingdom': 'GB',
  'great britain': 'GB',
  uk: 'GB',
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  venezuela: 'VE',
}

export function resolveTvSearchCountryCode(rawQuery: string): string | null {
  const key = normalizeTvSearchQuery(rawQuery).toLowerCase()
  if (!key) return null
  return TV_SEARCH_COUNTRY_NAME_TO_CODE[key] ?? null
}

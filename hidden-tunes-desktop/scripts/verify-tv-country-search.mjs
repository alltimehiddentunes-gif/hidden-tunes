import assert from 'node:assert/strict'
import fs from 'node:fs'

const search = fs.readFileSync(new URL('../src/lib/tv/tvSearchQuery.ts', import.meta.url), 'utf8')
const api = fs.readFileSync(new URL('../src/lib/tv/tvCatalogApi.ts', import.meta.url), 'utf8')
const page = fs.readFileSync(new URL('../src/lib/tv/useTvPageData.ts', import.meta.url), 'utf8')
const globalSearch = fs.readFileSync(new URL('../src/lib/search/useGlobalDesktopSearch.ts', import.meta.url), 'utf8')
const globalSections = fs.readFileSync(new URL('../src/components/search/GlobalSearchSections.tsx', import.meta.url), 'utf8')

for (const token of ['TV_COUNTRY_DISPLAY_LABELS', 'classifyTvSearchQuery', "country: scopedCountry", 'intent.query']) {
  assert.ok(search.includes(token) || api.includes(token), `missing canonical country-search token: ${token}`)
}
assert.ok(!api.includes('mergeTvSearchChannels'), 'country search must not merge incompatible q/country pages')
assert.ok(page.includes('searchTvChannels(trimmedSearch'), 'TV page must use shared country search')
assert.ok(page.includes('country: effectiveSelectedRegion'), 'scoped search must retain region')
assert.ok(page.includes('category,'), 'scoped search must retain category')
assert.ok(globalSearch.includes('searchTvChannels'), 'global Search must use shared TV search')
assert.ok(globalSections.includes("onNavigateNav('tv')"), 'global TV results must retain TV routing')
assert.ok(api.includes("throw new Error('TV catalogue returned an invalid response')"), 'parser failure must surface as error')
console.log('TV country-search static contract: PASS')

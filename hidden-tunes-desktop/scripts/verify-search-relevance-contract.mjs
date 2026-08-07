import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
const css = fs.readFileSync(path.join(root, 'src/App.css'), 'utf8')
const ranking = fs.readFileSync(path.join(root, 'src/lib/search/musicSearchRanking.ts'), 'utf8')
const provider = fs.readFileSync(path.join(root, 'src/context/DesktopPlaybackProvider.tsx'), 'utf8')
let passed = 0
let failed = 0
const check = (name, condition) => {
  if (condition) { passed += 1; console.log(`PASS ${name}`) }
  else { failed += 1; console.error(`FAIL ${name}`) }
}

check('canonical-ranking-module', app.includes("from './lib/search/musicSearchRanking'"))
check('plain-exact-genre-intent', app.includes('parseMusicGenreIntent(query) ?? resolveExactGenreIntent(query)'))
check('exact-genre-weight', ranking.includes('exactGenre: 96'))
check('exact-artist-weight', ranking.includes('exactArtist: 94'))
check('zero-token-penalty', ranking.includes('zeroTokenPenalty: -48'))
check('canonical-id-deduplication', ranking.includes("if (!unique.has(song.id)) unique.set(song.id, song)"))
check('named-confidence-threshold', ranking.includes('SEARCH_TOP_MATCH_CONFIDENCE = 0.78'))
check('top-match-confidence-gate', app.includes('qualifiesForTopMatch(rankedTopSong)'))
check('genre-outranks-weak-song', ranking.indexOf('exactGenre: 96') >= 0 && ranking.indexOf('metadataToken: 18') >= 0)
check('abort-controller-newest-query', app.includes('const controller = new AbortController()') && app.includes('remoteSearchGen.current'))
check('stale-results-cleared-while-loading', app.includes('setRemoteSongs([])') && app.includes('remoteSearchLoading || isSearchPending'))
check('categorized-query-preserving-tabs', app.includes("setSearchTab('songs')") && app.includes('matchedArtists.length') && app.includes('matchedAlbums.length'))
check('shared-music-session', app.includes("genreDefinition ? 'genre' : 'search'") && app.includes('onOpenSong('))
check('single-audio-owner-protected', (provider.match(/new Audio\(|<audio/g) ?? []).length <= 1)
check('heading-not-clipped', css.includes('.psd-search-page-header') && css.includes('overflow: visible'))
check('no-decorative-top-waveform', !app.includes('psd-search-top-result-waveform'))
check('compact-top-match', css.includes('grid-template-columns: 92px minmax(0, 1fr) auto') && css.includes('min-height: 0'))
check('premium-no-result-state', app.includes('<CatalogEmpty') && app.includes('No matches found'))
check('horizontal-overflow-guard', app.includes('psd-search-destination'))

console.log(`\nSearch relevance contract: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

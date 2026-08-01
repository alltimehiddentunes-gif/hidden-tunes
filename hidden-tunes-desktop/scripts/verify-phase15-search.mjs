/**
 * Phase 15 — Search + genre coverage certification (static).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

let passed = 0
let failed = 0
function check(label, cond, detail = '') {
  if (cond) {
    passed += 1
    console.log(`PASS: ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const app = read('src/App.tsx')
const hook = read('src/lib/search/useGlobalDesktopSearch.ts')
const genres = read('src/lib/musicGenres.ts')
const discover = read('src/components/music/MusicDiscoverPage.tsx')
const section = read('src/components/music/MusicSectionContent.tsx')
const home = read('src/components/home/MusicHomePage.tsx')
const lectures = read('src/lib/lectures/useDiscoverLectureSearch.ts')

check('registry-has-12', (genres.match(/id: '/g) || []).length >= 12 && genres.includes('MUSIC_GENRES'))
check('home-registry-intents', home.includes('MUSIC_GENRES.map') && home.includes('createMusicGenreIntent'))
check('discover-registry-intents', discover.includes('MUSIC_GENRES.map') && discover.includes('createMusicGenreIntent(genre.slug)'))
check('discover-no-free-text-genre-fallback', !discover.includes('getMusicGenreByLabelOrAlias') && !/onBrowseSearch\(definition \? createMusicGenreIntent/.test(discover))
check('section-registry-intents', section.includes('MUSIC_GENRES.map') && section.includes("data-genre-registry=\"music-section\""))
check('section-no-free-text-genre-fallback', !section.includes('getMusicGenreByLabelOrAlias'))
check('show-no-matches-respects-global', app.includes('!globalSearch.hasRemoteResults') && app.includes('!globalSearch.hasFamilyErrors'))
check('music-search-error-ui', app.includes('data-search-error="music"') && app.includes('Retry music search'))
check('free-text-load-more', app.includes("data-search-load-more={genreDefinition ? 'genre' : 'query'}") || app.includes('data-search-load-more={genreDefinition ? "genre" : "query"}'))
check('load-more-supports-query', app.includes('searchMusicSongsPage') && app.includes('Load more songs'))
check('load-more-gen-guard', app.includes('if (gen !== remoteSearchGen.current) return') && app.includes('remoteLoadingMore'))
check('lecture-error-keeps-courses', lectures.includes('Keep prior courses on failure'))
check('global-family-error-flags', hook.includes('hasFamilyErrors') && hook.includes('isFamilyLoading'))
check('stale-request-guard', hook.includes('requestRef') && hook.includes('requestId !== requestRef.current'))
check('genre-catalogue-marker', app.includes('data-music-genre-catalogue'))
check('playback-owner-intact', fs.existsSync(path.join(root, 'src/context/DesktopPlaybackProvider.tsx')))

if (failed > 0) {
  console.error(`\nverify:phase15-search FAILED (${failed} failing, ${passed} passing)`)
  process.exit(1)
}
console.log(`\nverify:phase15-search PASS (${passed} checks)`)

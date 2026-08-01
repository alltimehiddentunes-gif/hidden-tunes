/**
 * Static interaction contract checks for Phase 7 Home music redesign.
 * Does not launch Electron — verifies source contracts only.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const homePath = path.join(root, 'src/components/home/MusicHomePage.tsx')
const src = fs.readFileSync(homePath, 'utf8')

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    process.exitCode = 1
    return
  }
  console.log(`PASS: ${msg}`)
}

assert(src.includes('music-home-listening-hero'), 'Listening hero class present')
assert(src.includes('playHero'), 'Hero play handler present')
assert(src.includes('onOpenAlbum(card.album)'), 'Album card body opens album details')
assert(src.includes('music-home-album-play'), 'Visible album Play control present')
assert(src.includes('playAlbumCollection(card)'), 'Album Play uses playAlbumCollection')
assert(!src.includes('HOME_CHARTS'), 'Fabricated Top Charts array removed')
assert(!src.includes('Top 100'), 'Fabricated Top 100 copy removed')
assert(!src.includes('Feel Every Beat'), 'Promotional script hero copy removed')
assert(src.includes("context: 'home'") || src.includes("'home'"), 'Home playback context preserved')
assert(src.includes("seedType: 'album'"), 'Album seedType preserved')
assert(src.includes("navKey: 'recent'"), 'Recently Played quick access present')

if (process.exitCode) {
  console.error('verify-music-home-interactions FAILED')
  process.exit(1)
}
console.log('verify-music-home-interactions PASS')

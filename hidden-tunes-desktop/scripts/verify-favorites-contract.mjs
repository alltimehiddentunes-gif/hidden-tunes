import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const app = read('src/App.tsx')
const css = read('src/App.css')
const likes = read('src/lib/home/musicLikesStorage.ts')
const provider = read('src/context/DesktopPlaybackProvider.tsx')
const locales = fs.readdirSync(path.join(root, 'src/localization/locales')).filter((file) => file.endsWith('.ts'))
let passed = 0
let failed = 0
const check = (label, condition) => {
  if (condition) { passed += 1; console.log(`PASS: ${label}`) }
  else { failed += 1; console.error(`FAIL: ${label}`) }
}

check('header count derives from canonical liked songs', /likedSongIds[\s\S]{0,100}\.map\(\(songId\) => indexes\.songsById\.get\(songId\)\)/.test(app))
check('stored favorites are canonical-id deduplicated', likes.includes('seen.has(entry.songId)'))
check('duration derives from displayed canonical songs', app.includes('likedSongs.reduce((sum, song) => sum + (song.durationSeconds ?? 0), 0)'))
check('collage uses real favorite artwork', app.includes('collageSongs') && app.includes('song.artwork'))
check('search is scoped to likedSongs', app.includes('likedSongs.filter((song)'))
check('recent sort has stable title/id fallback', app.includes('return dateOrder || titleOrder || a.id.localeCompare(b.id)'))
check('alphabetical sort has stable id fallback', app.includes('return titleOrder || a.id.localeCompare(b.id)'))
check('play all filters instant-playable results', app.includes('visiblePlayableSongs') && app.includes('selectInstantPlayableUrl(song)'))
check('shuffle is a permutation of visible playable results', app.includes('shuffleSongQueue(visiblePlayableSongs)'))
check('queue source context is favorites', app.includes("'favorites', 'Liked Songs'"))
check('unfavorite does not mutate playback provider', !likes.includes('stopPlayback') && !likes.includes('clearQueue'))
check('sidebar release uses shared shell behavior', !css.includes('.psd-liked-destination .player-sidebar'))
check('unsupported favorite types remain hidden', !app.includes('psd-liked-albums-tab') && !app.includes('psd-liked-artists-tab'))
check('one playback provider mount remains', (app.match(/<DesktopPlaybackProvider>/g) ?? []).length === 1)
check('one audio owner remains', (read('src/lib/desktopPlayback/HtmlAudioPlaybackService.ts').match(/new Audio\(/g) ?? []).length === 1)
check('one queue owner remains', provider.includes('const [currentQueue, setCurrentQueue]') && !app.includes('const [favoritesQueue'))
check('all locale dictionaries contain Favorites copy', locales.length === 20 && locales.every((file) => read(`src/localization/locales/${file}`).includes('favoritesCollectionTitle:')))

console.log(`\nFavorites contract: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

/**
 * Cross-media Search identity and routing regression checks.
 * Run: node scripts/verify-search-routing-repair.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const ui = read('src/components/search/GlobalSearchSections.tsx')
const app = read('src/App.tsx')
const tvAdapter = read('src/lib/tv/tvPlaybackAdapter.ts')
const radioAdapter = read('src/lib/radio/radioPlaybackAdapter.ts')
const searchWiring = app.slice(app.indexOf('<GlobalSearchSections'), app.indexOf('/>', app.indexOf('<GlobalSearchSections')))

let failures = 0
function check(label, condition) {
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${label}`)
  if (!condition) failures += 1
}

check('TV callback receives canonical typed payload', ui.includes('onPlayTv?: (channel: TvChannelMeta) => void'))
check('Radio callback receives canonical typed payload', ui.includes('onPlayRadio?: (station: RadioStationMeta) => void'))
check('TV card opens TV destination', ui.includes("onClick={() => onNavigateNav('tv')}"))
check('Radio card opens Radio destination', ui.includes("onClick={() => onNavigateNav('radio')}"))
check('TV Play dispatches the original channel', ui.includes('onPlayTv?.(channel)'))
check('Radio Play dispatches the original station', ui.includes('onPlayRadio?.(station)'))
check('TV Play cannot trigger card navigation', /aria-label={`Play \${channel\.title}`}[\s\S]*?event\.stopPropagation\(\)[\s\S]*?onPlayTv\?\.\(channel\)/.test(ui))
check('Radio Play cannot trigger card navigation', /aria-label={`Play \${station\.name}`}[\s\S]*?event\.stopPropagation\(\)[\s\S]*?onPlayRadio\?\.\(station\)/.test(ui))
check('Search does not rebuild a partial TV result', !searchWiring.includes('onPlayTv={(channelId, title, artwork)'))
check('Search does not rebuild a partial Radio result', !searchWiring.includes('onPlayRadio={(stationId, title, artwork)'))
check('TV playback retains TV queue context', app.includes("playQueue(apiQueue, safeIndex, 'tv', queueTitle"))
check('Radio playback retains Radio queue context', app.includes("playQueue(apiQueue, safeIndex, 'radio', queueTitle"))
check('TV identity is namespaced from music IDs', tvAdapter.includes("TV_SONG_ID_PREFIX = 'tv-'"))
check('Radio identity is namespaced from music IDs', radioAdapter.includes("RADIO_SONG_ID_PREFIX = 'radio-'"))
check('Unknown Search family has no Music fallback', !/default\s*:[\s\S]{0,160}(openMusic|navigateNav\(['\"]music)/.test(ui))
check('Podcast show opens its detail handler', ui.includes('onOpenPodcastShow?.(show.id)'))
check('Audiobook opens its detail handler', ui.includes('onOpenAudiobook?.(book.id)'))
check('Motivational opens its program handler', ui.includes('onOpenMotivational?.(session.programId || session.id)'))
check('Sports exposes navigation only', ui.includes("onClick={() => onNavigateNav('sports')}") && !ui.includes('onPlaySports'))
check('Search song playback remains route-independent', app.includes("'discover',") && app.includes("context === 'home' || context === 'discover'"))
check('Section search submit cannot redirect to global Music-shaped Search', app.includes("activeNavKey === 'home'\n                      ? () => navigatePage('discover', 'search')") && !app.includes("if (activeNavKey === 'music' && query)"))

console.log(`\nSearch routing repair: ${21 - failures} passed, ${failures} failed`)
if (failures) process.exit(1)

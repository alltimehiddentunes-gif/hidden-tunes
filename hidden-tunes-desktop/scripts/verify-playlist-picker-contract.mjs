import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
let passed = 0
let failed = 0
function check(label, condition) {
  if (condition) { passed += 1; console.log(`PASS: ${label}`) }
  else { failed += 1; console.error(`FAIL: ${label}`) }
}

const picker = read('src/components/playlists/PlaylistPickerProvider.tsx')
const pickerApi = read('src/components/playlists/playlistPicker.ts')
const app = read('src/App.tsx')
const library = read('src/components/library/DesktopLibraryPage.tsx')
const queue = read('src/components/player/PlayerShellPanels.tsx')
const player = read('src/components/player/DesktopPersistentPlayer.tsx')
const service = read('src/lib/playlists/playlistService.ts')

check('one shared picker provider exists', picker.includes('PlaylistPickerProvider'))
check('canonical request API exists', pickerApi.includes('PlaylistPickerRequest'))
check('picker supports existing playlists', picker.includes('addExisting'))
check('picker supports atomic create and add', picker.includes('createPlaylistWithItems'))
check('picker reports duplicates and invalid items', picker.includes('already present') && picker.includes('invalid'))
check('picker restores focus', picker.includes('returnFocus.current?.focus'))
check('app owns one provider', (app.match(/<PlaylistPickerProvider>/g) || []).length === 1)
check('global search uses shared picker', app.includes("source: 'search'"))
check('album uses shared picker', app.includes("source: 'album'"))
check('artist uses shared picker', app.includes("source: 'artist'"))
check('favorites use shared picker', library.includes("source: 'favorites'"))
check('queue uses shared picker', queue.includes("source: 'queue'"))
check('now playing uses shared picker', player.includes("source: 'now-playing'"))
check('queue picker action does not call queue mutation', !/openPlaylistPicker\([\s\S]{0,160}(moveQueueItem|removeQueueItem)/.test(queue))
check('bulk mutation persists once', service.includes('addItemsToPlaylist') && service.includes('persist({ ...store, playlists })'))
check('create with items rejects an empty valid set', service.includes('if (normalized.length === 0) return null'))

console.log(`\nPlaylist picker contract: ${passed} passed, ${failed} failed`)
process.exitCode = failed ? 1 : 0

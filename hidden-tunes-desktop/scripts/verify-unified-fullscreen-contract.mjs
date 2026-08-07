import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const app = read('src/App.tsx')
const shell = read('src/components/player/PremiumFullscreenShell.tsx')
const adapter = read('src/lib/player/mediaAdapter.ts')
const css = read('src/App.css')

assert.equal((app.match(/<PremiumFullscreenShell/g) || []).length, 1, 'one canonical audio full-screen shell is expected')
assert.doesNotMatch(app, /NonMusicFullscreenPlayer/, 'parallel non-Music full-screen layouts are forbidden')
assert.doesNotMatch(app, /<PremiumVideoNowPlaying/, 'TV must not bypass the canonical shell')
assert.doesNotMatch(app, /videoPresentation=\{isExpandedVideoSession/, 'restored TV must not enter the expanded shell')
for (const kind of ['music', 'radio', 'podcast', 'audiobook', 'motivational', 'lecture', 'tv']) {
  assert.match(adapter, new RegExp(`'${kind}'`), `${kind} must have a typed adapter`)
}
assert.match(adapter, /const seekable = kind !== 'radio' && kind !== 'tv'/, 'Radio and live TV use live progress mode')
assert.match(adapter, /const showLyrics = kind === 'music'/, 'Lyrics remain Music-only')
assert.match(adapter, /queueTabLabel: kind === 'audiobook' \? 'Chapters' : 'Queue'/, 'Audiobooks expose chapters')
assert.match(shell, /adapter\.kind === 'music' \? <nav/, 'normal Music navigation must not render for non-Music variants')
assert.match(shell, /adapter\.kind === 'music' \? <PlayerModeSwitcher/, 'Music visual modes remain protected and Music-only')
assert.match(shell, /adapter\.liveIndicator/, 'canonical shell must render live progress state')
assert.match(shell, /adapter\.seekable/, 'canonical shell must render seekable progress state')
assert.match(shell, /adapter\.showLyrics/, 'canonical drawer must suppress unsupported Lyrics')
assert.match(shell, /skipRelative\(-30\)/)
assert.match(shell, /audiobookPlaybackRate/)
assert.doesNotMatch(shell, /adapter\.kind === 'tv' && videoPresentation/, 'TV video injection must remain removed')
assert.equal((css.match(/\.premium-fullscreen-shell\[data-media-kind='music'\]/g) || []).length, 0, 'shell geometry must not be Music-exclusive')
assert.ok((css.match(/\.premium-fullscreen-shell\[data-media-kind\]/g) || []).length > 20, 'all typed variants must inherit authoritative shell geometry')
assert.doesNotMatch(css, /\.nonmusic-fullscreen/, 'parallel full-screen styling is forbidden')
assert.doesNotMatch(app, /isRadioExpanded|isPodcastExpanded|isAudiobookFullScreen/, 'separate expanded state flags are forbidden')

console.log('Unified full-screen player contract: PASS')

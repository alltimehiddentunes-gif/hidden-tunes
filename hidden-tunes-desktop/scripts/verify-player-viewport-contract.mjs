import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const provider = readFileSync(new URL('../src/context/DesktopPlaybackProvider.tsx', import.meta.url), 'utf8')

const finalOwnership = css.slice(css.lastIndexOf('/* Permanent viewport ownership: compact transport + title-bar-safe immersive shell. */'))
assert.ok(finalOwnership.length > 0, 'final viewport ownership block must exist')
assert.match(finalOwnership, /--bottom-player-height:\s*80px/)
assert.match(finalOwnership, /height:\s*var\(--bottom-player-height\)/)
assert.match(finalOwnership, /max-height:\s*var\(--bottom-player-height\)/)
assert.match(finalOwnership, /--footer-player-height:\s*var\(--bottom-player-height\)/)
assert.match(finalOwnership, /inset:\s*var\(--desktop-titlebar-height\) 0 0/)
assert.match(finalOwnership, /max-height:\s*calc\(100dvh - var\(--desktop-titlebar-height\)\)/)
assert.match(finalOwnership, /html\.ht-os-fullscreen[^{]+\{[^}]*inset:\s*0/s)
assert.match(finalOwnership, /grid-template-rows:[^;]*minmax\(0, 1fr\)/)
assert.match(finalOwnership, /\.player-queue-list[^{]+\{[^}]*overflow-y:\s*auto/s)
assert.match(finalOwnership, /@media \(max-height: 780px\)/)
assert.doesNotMatch(finalOwnership, /height:\s*100vh/)

assert.equal((app.match(/<PlayerBar\b/g) || []).length, 1, 'one compact footer presentation must be mounted')
assert.equal((provider.match(/new HtmlAudioPlaybackService\b/g) || []).length, 1, 'one audio owner must remain')

console.log('Player viewport contract passed: 80px footer and title-bar-safe immersive bounds')

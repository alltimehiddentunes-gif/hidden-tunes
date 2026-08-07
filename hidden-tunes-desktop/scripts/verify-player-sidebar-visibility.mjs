import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
const preferences = readFileSync(new URL('../src/lib/localPreferences.ts', import.meta.url), 'utf8')

assert.match(preferences, /playerSidebarVisibility: 'player-sidebar-visibility'/)
assert.match(preferences, /parseStoredPlayerSidebarVisibility/)
assert.match(app, /DESKTOP_PREFERENCE_KEYS\.playerSidebarVisibility/)
assert.match(app, /aria-label=\{isPlayerSidebarVisible \? 'Hide Now Playing sidebar' : 'Show Now Playing sidebar'\}/)
assert.match(app, /aria-controls="now-playing-sidebar"/)
assert.match(app, /aria-expanded=\{isPlayerSidebarVisible\}/)
assert.match(app, /data-sidebar-visibility=\{isPlayerSidebarVisible \? 'visible' : 'hidden'\}/)
assert.match(app, /data-player-sidebar=\{hasQueueRail \? 'visible' : 'hidden'\}/)
assert.match(app, /inert=\{!isPlayerSidebarVisible \|\| anyPlayerShellVisible \? true : undefined\}/)
assert.match(css, /\.conditional-player-rail\[data-sidebar-visibility='hidden'\]/)
assert.match(css, /\.app-shell\[data-player-sidebar='hidden'\] \.main-composition\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/)
assert.match(css, /\.app-shell\[data-player-sidebar='visible'\] \.main-composition\s*\{\s*grid-template-columns: minmax\(0, 1fr\) var\(--active-player-width\);/)
assert.match(css, /\.player-sidebar-toggle--show\s*\{\s*right: 0;/)
assert.match(css, /visibility: hidden;[\s\S]*pointer-events: none;/)
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)

const toggleHandler = app.match(/onClick=\{\(\) => setPlayerSidebarVisibility\([^\n]+\)\}/)?.[0] ?? ''
assert.ok(toggleHandler, 'sidebar toggle must only update the persisted shell preference')
assert.doesNotMatch(toggleHandler, /pause\(|currentTrack|currentQueue|startMediaSession/i)

console.log('Player sidebar visibility contract: PASS')

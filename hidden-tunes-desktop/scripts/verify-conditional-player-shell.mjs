import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8')
const provider = readFileSync(resolve(root, 'src/context/DesktopPlaybackProvider.tsx'), 'utf8')
const css = readFileSync(resolve(root, 'src/App.css'), 'utf8')
const home = readFileSync(resolve(root, 'src/components/home/MusicHomePage.tsx'), 'utf8')

const checks = [
  ['session visibility derives from currentTrack', app.includes('const hasActiveMediaSession = Boolean(currentTrack?.id)')],
  ['right player is conditional', app.includes('{hasActiveMediaSession ? (')],
  ['bottom player is conditional', app.includes('{hasActiveMediaSession && !lyricsOpen')],
  ['shell publishes active-session state', app.includes('data-has-active-media={hasActiveMediaSession')],
  ['stop clears authoritative track', provider.includes('currentTrackRef.current = null') && provider.includes('setCurrentTrack(null)')],
  ['pause does not clear authoritative track', /const pause = useCallback[\s\S]*?setIsPlaying\(false\)/.test(provider)],
  ['idle layout has no player column', css.includes(".app-shell[data-has-active-media='false'] .main-composition")],
  ['active layout reserves player column', css.includes(".app-shell[data-has-active-media='true'] .main-composition")],
  ['reduced motion is respected', css.includes('@media (prefers-reduced-motion: reduce)')],
  ['Home uses authoritative currentTrack session', home.includes('const hasActiveMediaSession = Boolean(currentTrack?.id)')],
  ['idle Home owns editorial mix', home.includes("setShowEditorialMix(true)") && home.includes('aria-label="My Music Mix"')],
  ['active Home owns compact quick access', home.includes('music-home-active-quick-access') && home.includes('QUICK_ACCESS.map')],
  ['active Home removes editorial column width', css.includes('.music-home-reference-top.is-active-session') && css.includes('grid-template-columns: minmax(0, 1fr)')],
  ['Home session transition is restrained', css.includes('220ms ease-out')],
  ['Home exit disables interactions', css.includes('.music-home-mix-column.is-exiting') && css.includes('pointer-events: none')],
]

for (const [label, passed] of checks) {
  assert.equal(passed, true, `FAIL: ${label}`)
  console.log(`PASS: ${label}`)
}

console.log('Conditional player shell checks passed.')

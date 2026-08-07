import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const app = read('src/App.tsx')
const shell = read('src/components/player/PremiumFullscreenShell.tsx')
const auto = read('src/lib/useAutoOpenPreferredPlayer.ts')
const preload = read('electron/preload.js')
const main = read('electron/main.js')

const checks = [
  ['30-second named inactivity threshold', /AUTO_OPEN_PLAYER_IDLE_MS = 30_000/.test(auto)],
  ['five-minute manual-dismiss cooldown', /AUTO_OPEN_PLAYER_DISMISS_COOLDOWN_MS = 5 \* 60_000/.test(auto)],
  ['automatic entry restricted to music', /!state\.isMusicTrack/.test(auto) && /isMusicCatalogSong\(currentTrack\)/.test(app)],
  ['paused, loading, error and empty states blocked', /!state\.isPlaying \|\| state\.isLoading \|\| state\.hasPlaybackError/.test(auto)],
  ['focus and visibility required', /document\.visibilityState !== 'visible'/.test(auto) && /!document\.hasFocus\(\)/.test(auto)],
  ['typing and modal interactions blocked', /hasBlockingInteraction/.test(auto) && /\[role="dialog"\]/.test(auto)],
  ['high-frequency pointer activity throttled', /POINTER_ACTIVITY_THROTTLE_MS/.test(auto)],
  ['activity, fullscreen and visibility listeners cleaned up', /removeEventListener\('pointermove'/.test(auto) && /unsubscribe\?\.\(\)/.test(auto)],
  ['OS fullscreen uses narrow preload bridge', /isFullScreen/.test(preload) && /setFullScreen/.test(preload) && /BrowserWindow\.fromWebContents/.test(main)],
  ['manual exit cooldown is wired', /markPlayerManuallyDismissed\(\)/.test(app)],
  ['Music navigation remaps to Home', /navKey === 'music' \? 'home' : navKey/.test(app)],
  ['underlying route remains mounted for restoration', /premium-player-overlay/.test(shell) && !/setActivePage\([^)]*now/i.test(app)],
  ['real queue, lyrics and details integrations retained', /PlayerQueuePanel/.test(shell) && /PlayerLyricsPanel/.test(shell) && /PlayerDetailsPanel/.test(shell)],
  ['single playback owner retained', /usePlayerShellState/.test(shell) && !/new Audio\(|<audio/.test(shell)],
  ['truthful unsupported claims absent', !/Dolby Atmos|Lossless|24-bit|Studio Pro|Living Room|verified artist/i.test(shell)],
]

let failed = 0
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${label}`)
  if (!pass) failed += 1
}
if (failed) process.exit(1)
console.log(`Now Playing contract: ${checks.length} passed, 0 failed`)

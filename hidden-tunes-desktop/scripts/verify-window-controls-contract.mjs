import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const main = read('electron/main.js')
const preload = read('electron/preload.js')
const app = read('src/App.tsx')
const controls = read('src/components/DesktopWindowControls.tsx')
const css = read('src/App.css')

assert.match(main, /frame:\s*process\.platform\s*===\s*['"]darwin['"]/, 'macOS must retain native traffic lights while Windows/Linux use custom chrome')
assert.match(main, /titleBarStyle:\s*['"]hiddenInset['"]/, 'macOS native traffic lights must use a safe inset title bar')
assert.equal((main.match(/new BrowserWindow\s*\(/g) || []).length, 1, 'exactly one BrowserWindow owner is expected')
assert.match(main, /requestSingleInstanceLock\(\)/)
assert.match(main, /second-instance/)
assert.match(main, /isMinimized\(\).*restore\(\)/s)
assert.match(main, /getNormalBounds\(\)/)
assert.match(main, /getDisplayMatching\(proposed\)/)
assert.doesNotMatch(main, /hide\(\).*ht-window-close/s, 'Close must not silently hide to tray')

for (const channel of ['minimize', 'toggle-maximize', 'close', 'get-state']) {
  assert.match(main, new RegExp(`ipcMain\\.handle\\('ht-window-${channel}'`))
  assert.match(preload, new RegExp(`ipcRenderer\\.invoke\\('ht-window-${channel}'`))
}
assert.match(main, /getValidatedSenderWindow/)
assert.doesNotMatch(preload, /exposeInMainWorld\([^]*ipcRenderer\s*[,}]/, 'raw ipcRenderer must not be exposed')
assert.match(preload, /removeListener\('ht-window-state-changed'/)

assert.equal((app.match(/<DesktopWindowControls\s*\/>/g) || []).length, 1, 'one persistent title bar must be mounted')
assert.match(controls, /isMaximized \? <RestoreIcon \/> : <MaximizeIcon \/>/)
assert.match(controls, /aria-label="Minimize window"/)
assert.match(controls, /aria-label=\{isMaximized \? 'Restore window' : 'Maximize window'\}/)
assert.match(controls, /aria-label=\{t\(['"]common\.close['"]\)\}/, 'close control must use the localized accessible label')
assert.match(css, /-webkit-app-region:\s*drag/)
assert.match(css, /-webkit-app-region:\s*no-drag/)
assert.match(css, /\.desktop-window-controls button:focus-visible/)
assert.match(css, /z-index:\s*50000/, 'controls must stay above route and player overlays')

console.log('Window controls contract passed')

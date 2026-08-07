import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const app = read('src/App.tsx')
const launch = read('src/components/LaunchScreen.tsx')
const persistent = read('src/components/player/DesktopPersistentPlayer.tsx')
const fullscreen = read('src/components/player/PremiumFullscreenShell.tsx')
const main = read('electron/main.js')
const html = read('index.html')
const pkg = JSON.parse(read('package.json'))

const checks = [
  ['official renderer source exists', fs.existsSync(path.join(root, 'public/brand/hidden-tunes-official.png'))],
  ['official renderer mark exists', fs.existsSync(path.join(root, 'public/brand/hidden-tunes-mark.png'))],
  ['multi-resolution Windows icon exists', fs.existsSync(path.join(root, 'build/icon.ico'))],
  ['shared sidebar brand component', app.includes('<HiddenTunesBrandMark className="brand-logo-mark"') && !app.includes('function BrandWaveformMark')],
  ['launch brand component', launch.includes('<HiddenTunesBrandMark') && !launch.includes('>HT<')],
  ['persistent player brand component', persistent.includes('<HiddenTunesBrandMark') && !persistent.includes('function BrandWaveformMark')],
  ['fullscreen brand component', fullscreen.includes('<HiddenTunesBrandMark') && !fullscreen.includes('>HT</div>')],
  ['BrowserWindow icon configured', main.includes('icon: getBrandIconPath()') && main.includes('process.resourcesPath')],
  ['renderer favicon configured', html.includes('/brand/hidden-tunes-mark.png') && !html.includes('favicon.svg')],
  ['Windows executable and installer configured', pkg.build?.win?.icon === 'build/icon.ico' && pkg.build?.nsis?.installerIcon === 'build/icon.ico' && pkg.build?.nsis?.uninstallerIcon === 'build/icon.ico'],
  ['packaged icon resource configured', pkg.build?.extraResources?.some((item) => item.from === 'build/icon.png' && item.to === 'brand/icon.png')],
]

let failures = 0
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${label}`)
  if (!pass) failures += 1
}
if (failures) process.exitCode = 1
else console.log(`Branding contract: ${checks.length} passed, 0 failed`)

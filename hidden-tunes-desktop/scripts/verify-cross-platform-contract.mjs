import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const main = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8')
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.js'), 'utf8')
const failures = []
const check = (condition, message) => { if (!condition) failures.push(message) }

check(pkg.build?.win?.target?.[0]?.arch?.includes('x64'), 'Windows x64 NSIS target is required')
check(pkg.build?.mac?.target?.[0]?.arch?.includes('x64') && pkg.build.mac.target[0].arch.includes('arm64'), 'macOS x64 and arm64 targets are required')
check(pkg.build?.linux?.target?.some((target) => target.target === 'AppImage') && pkg.build.linux.target.some((target) => target.target === 'deb'), 'Linux AppImage and deb targets are required')
check(main.includes("frame: process.platform === 'darwin'"), 'macOS must retain native window chrome')
check(main.includes("process.platform !== 'darwin'"), 'macOS last-window lifecycle must differ from Windows/Linux')
check(main.includes('Menu.setApplicationMenu'), 'native application menu is required')
check(main.includes('contextIsolation: true'), 'context isolation must remain enabled')
check(main.includes('nodeIntegration: false'), 'Node integration must remain disabled')
check(main.includes('sandbox: true'), 'renderer sandbox must remain enabled')
check(main.includes('webSecurity: true') && !main.includes('webSecurity: false'), 'web security must remain enabled')
check(!/require\(["']fs["']\)/.test(preload), 'preload must not expose unrestricted filesystem access')

if (failures.length) {
  console.error(`Cross-platform contract failed (${failures.length}):`)
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('Cross-platform contract: PASS')

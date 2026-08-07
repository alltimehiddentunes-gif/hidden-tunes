import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const executable = path.join(root, 'release', 'win-unpacked', 'Hidden Tunes Desktop.exe')
const icon = path.join(root, 'build', 'icon.ico')
const rcedit = path.join(root, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe')

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('npm.cmd', ['run', 'build'])
run('npx.cmd', ['electron-builder', '--dir', '--win', 'dir'])
run(rcedit, [
  executable,
  '--set-file-version', '1.0.0',
  '--set-product-version', '1.0.0',
  '--set-version-string', 'ProductName', 'Hidden Tunes Desktop',
  '--set-version-string', 'FileDescription', 'Hidden Tunes Desktop',
  '--set-version-string', 'CompanyName', 'Hidden Tunes',
  '--set-version-string', 'LegalCopyright', 'Copyright Hidden Tunes',
  '--set-icon', icon,
])
run('npx.cmd', [
  'electron-builder',
  '--win',
  'nsis',
  '--x64',
  '--prepackaged',
  path.join(root, 'release', 'win-unpacked'),
])

/**
 * Phase 6 lifecycle smoke — packaged renderer boots without sync throw.
 * Run: electron scripts/smoke-eslint-lifecycle.mjs
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const require = createRequire(import.meta.url)
const { app, BrowserWindow } = require('electron')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: join(root, 'electron', 'preload.js'),
    },
  })

  const consoleErrors = []
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) consoleErrors.push(String(message))
  })

  await win.loadFile(join(root, 'dist', 'index.html'))
  await new Promise((r) => setTimeout(r, 2500))

  const probe = await win.webContents.executeJavaScript(`({
    hasRoot: Boolean(document.getElementById('root')),
    rootChildren: document.getElementById('root')?.childElementCount ?? 0,
    title: document.title,
  })`)

  assert.equal(probe.hasRoot, true, 'root mount present')
  assert.ok(probe.rootChildren > 0, 'React tree rendered children')
  assert.match(String(probe.title), /Hidden Tunes/i)

  const fatal = consoleErrors.filter((m) =>
    /TypeError|ReferenceError|Cannot read|Maximum update depth/i.test(m),
  )
  assert.equal(fatal.length, 0, `no fatal renderer errors: ${fatal.join(' | ')}`)

  console.log('PASS: packaged renderer boot', probe)
  console.log('PASS: consoleErrors=', consoleErrors.length, '(non-fatal allowed)')
  console.log('smoke-eslint-lifecycle PASS')
  win.destroy()
  app.exit(0)
}).catch((error) => {
  console.error('smoke-eslint-lifecycle FAIL', error)
  app.exit(1)
})

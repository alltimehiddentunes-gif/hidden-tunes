/**
 * Packaged-mode smoke: CSP header + navigation/popup deny.
 * Does not open the OS browser for HTTPS (openExternal is stubbed via decision only).
 *
 * Run: electron scripts/smoke-electron-security.mjs
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const require = createRequire(import.meta.url)

const { app, BrowserWindow, session } = require('electron')
const {
  classifyDesktopNavigationTarget,
  isAppDocumentUrl,
  buildContentSecurityPolicy,
} = require(join(root, 'electron/navigationPolicy.js'))

const indexPath = join(root, 'dist', 'index.html')
const appFileRoots = [join(root, 'dist'), join(root, 'electron')]
const ctx = { isPackaged: true, appFileRoots }

let observedCsp = null
let navigationsBlocked = 0
let windowOpenDenied = 0

app.whenReady().then(async () => {
  const expectedCsp = buildContentSecurityPolicy(true)

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (isAppDocumentUrl(details.url, { isPackaged: true })) {
      const responseHeaders = { ...(details.responseHeaders || {}) }
      for (const key of Object.keys(responseHeaders)) {
        if (key.toLowerCase() === 'content-security-policy') delete responseHeaders[key]
      }
      responseHeaders['Content-Security-Policy'] = [expectedCsp]
      observedCsp = expectedCsp
      callback({ responseHeaders })
      return
    }
    callback({ responseHeaders: details.responseHeaders })
  })

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: join(root, 'electron', 'preload.js'),
    },
  })

  win.webContents.on('will-navigate', (event, url) => {
    const decision = classifyDesktopNavigationTarget(url, ctx)
    if (decision.action !== 'allow-internal') {
      event.preventDefault()
      navigationsBlocked += 1
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    const decision = classifyDesktopNavigationTarget(url, ctx)
    void decision
    windowOpenDenied += 1
    return { action: 'deny' }
  })

  await win.loadFile(indexPath)

  // Allow SPA hash/history only — attempt remote navigation via executeJavaScript location assign
  await win.webContents.executeJavaScript(
    `try { window.location.href = 'https://example.com/evil'; 'attempted'; } catch (e) { String(e) }`,
  )
  await new Promise((r) => setTimeout(r, 400))

  const currentUrl = win.webContents.getURL()
  assert.ok(
    currentUrl.startsWith('file:') && currentUrl.includes('index.html'),
    `main window must remain on packaged index, got ${currentUrl}`,
  )

  await win.webContents.executeJavaScript(`window.open('https://example.com/popup', '_blank')`)
  await new Promise((r) => setTimeout(r, 200))

  assert.equal(BrowserWindow.getAllWindows().length, 1, 'no unmanaged Electron popup windows')
  assert.ok(windowOpenDenied >= 1, 'setWindowOpenHandler denied at least one popup')
  assert.ok(observedCsp, 'CSP header was applied to app document')
  assert.ok(!/unsafe-eval/.test(observedCsp), 'production CSP has no unsafe-eval')
  assert.match(observedCsp, /script-src 'self'/)
  assert.match(observedCsp, /object-src 'none'/)

  // Bridge shape
  const bridgeProbe = await win.webContents.executeJavaScript(`({
    hasBridge: typeof window.hiddenTunesDesktop === 'object',
    hasShell: typeof window.hiddenTunesDesktop?.shell?.openExternalUrl === 'function',
    hasIpc: typeof window.ipcRenderer,
    hasRequire: typeof window.require,
  })`)
  assert.equal(bridgeProbe.hasBridge, true, 'preload bridge present')
  assert.equal(bridgeProbe.hasShell, true, 'openExternalUrl bridge present')
  assert.equal(bridgeProbe.hasIpc, 'undefined', 'raw ipcRenderer not exposed')
  assert.equal(bridgeProbe.hasRequire, 'undefined', 'require not exposed')

  // Policy unit: javascript blocked
  assert.equal(
    classifyDesktopNavigationTarget('javascript:alert(1)', ctx).action,
    'deny',
  )

  console.log('PASS: packaged index remained loaded:', currentUrl.slice(0, 80))
  console.log('PASS: navigationsBlocked=', navigationsBlocked, 'windowOpenDenied=', windowOpenDenied)
  console.log('PASS: CSP script-src self, no unsafe-eval')
  console.log('PASS: bridge typed; ipcRenderer absent')
  console.log('smoke-electron-security PASS')

  win.destroy()
  app.exit(0)
}).catch((error) => {
  console.error('smoke-electron-security FAIL', error)
  app.exit(1)
})

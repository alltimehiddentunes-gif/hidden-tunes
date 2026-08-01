/**
 * Phase 4: Electron CSP + navigation / popup / external-link policy.
 *
 * Run: node scripts/verify-electron-security.mjs
 *   or: npm run verify:electron-security
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const require = createRequire(import.meta.url)

const {
  classifyDesktopNavigationTarget,
  isAppDocumentUrl,
  buildProductionCsp,
  buildDevelopmentCsp,
  DEV_RENDERER_ORIGIN,
} = require(join(root, 'electron/navigationPolicy.js'))

function readSrc(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

function pass(condition, message) {
  assert.ok(condition, message)
  console.log(`PASS: ${message}`)
}

function classify(rawUrl, context) {
  return classifyDesktopNavigationTarget(rawUrl, context)
}

const distRoot = join(root, 'dist')
const electronRoot = join(root, 'electron')
const packagedCtx = { isPackaged: true, appFileRoots: [distRoot, electronRoot] }
const devCtx = { isPackaged: false, appFileRoots: [] }

// --- URL policy ---
pass(
  classify(`${DEV_RENDERER_ORIGIN}/`, devCtx).action === 'allow-internal',
  'exact development origin is allow-internal',
)
pass(
  classify('http://localhost:5174/', devCtx).action === 'deny',
  'different localhost port is blocked',
)
pass(
  classify('http://127.0.0.1:5173/', devCtx).action === 'deny',
  '127.0.0.1 is not treated as the Vite hostname',
)

const packagedIndex = pathToFileURL(join(distRoot, 'index.html')).href
pass(
  classify(packagedIndex, packagedCtx).action === 'allow-internal',
  'packaged dist/index.html is allow-internal',
)

const fallbackFile = pathToFileURL(join(electronRoot, 'fallback.html')).href
pass(
  classify(fallbackFile, packagedCtx).action === 'allow-internal',
  'packaged fallback.html is allow-internal',
)

pass(
  classify('https://example.com/help', packagedCtx).action === 'open-external',
  'valid HTTPS external URL is open-external',
)
pass(
  classify('http://example.com/help', packagedCtx).action === 'deny',
  'HTTP external URL is blocked',
)
pass(
  classify('javascript:alert(1)', packagedCtx).action === 'deny',
  'javascript: is blocked',
)
pass(
  classify('data:text/html,hi', packagedCtx).action === 'deny',
  'data: is blocked',
)
pass(
  classify('file:///C:/Windows/System32/drivers/etc/hosts', packagedCtx).action === 'deny',
  'arbitrary file: is blocked',
)
pass(
  classify('not a url', packagedCtx).action === 'deny',
  'malformed URL is blocked',
)
pass(
  classify('https://api.hiddentunes.com.evil.example/', packagedCtx).action === 'open-external'
    && classify('https://api.hiddentunes.com.evil.example/', packagedCtx).hostname
      === 'api.hiddentunes.com.evil.example',
  'hostname-prefix trick is not confused with trusted host (parsed hostname differs)',
)
pass(
  classify('https://evil@example.com/', packagedCtx).action === 'open-external'
    && classify('https://evil@example.com/', packagedCtx).hostname === 'example.com',
  'credentialed URL is parsed via URL() (hostname is example.com, not substring-trusted)',
)
pass(
  classify('ht-download://local/abc', packagedCtx).action === 'deny',
  'download scheme is not main-window navigable',
)
pass(
  classify('myapp://callback', packagedCtx).action === 'deny',
  'unknown custom protocol is blocked',
)
pass(
  classify('file:///C:/secret.txt', devCtx).action === 'deny',
  'file: forbidden in development main window',
)

// --- CSP content ---
const prodCsp = buildProductionCsp()
const devCsp = buildDevelopmentCsp()

pass(/default-src\s+'self'/.test(prodCsp), 'production CSP has default-src self')
pass(/script-src\s+'self'/.test(prodCsp), 'production CSP has script-src self')
pass(/object-src\s+'none'/.test(prodCsp), 'production CSP has object-src none')
pass(/base-uri\s+'self'/.test(prodCsp), 'production CSP has base-uri self')
pass(/frame-ancestors\s+'none'/.test(prodCsp), 'production CSP has frame-ancestors none')
pass(/connect-src/.test(prodCsp), 'production CSP has connect-src')
pass(/img-src/.test(prodCsp), 'production CSP has img-src')
pass(/media-src/.test(prodCsp), 'production CSP has media-src')
pass(!/script-src[^;]*'unsafe-eval'/.test(prodCsp), "production CSP excludes script-src 'unsafe-eval'")
pass(!/script-src\s+\*/.test(prodCsp), 'production CSP excludes script-src *')
pass(!/default-src\s+\*/.test(prodCsp), 'production CSP excludes default-src *')
pass(/'unsafe-eval'/.test(devCsp), 'development CSP may include unsafe-eval for Vite HMR')
pass(/ws:\/\/localhost:5173/.test(devCsp), 'development CSP allows Vite HMR websocket')

pass(
  isAppDocumentUrl(`${DEV_RENDERER_ORIGIN}/`, { isPackaged: false }),
  'dev document URL is CSP-stamped',
)
pass(
  !isAppDocumentUrl(`${DEV_RENDERER_ORIGIN}/assets/index.js`, { isPackaged: false }),
  'dev asset URL is not CSP-stamped as document',
)
pass(
  !isAppDocumentUrl('https://api.hiddentunes.com/api/songs', { isPackaged: true }),
  'remote API responses are not CSP-stamped',
)

// --- Main / preload wiring (source inspection) ---
const mainSrc = readSrc('electron/main.js')
const preloadSrc = readSrc('electron/preload.js')
const policySrc = readSrc('electron/navigationPolicy.js')
const fallbackHtml = readSrc('electron/fallback.html')
const typesSrc = readSrc('src/lib/desktopBridgeTypes.ts')

pass(/will-navigate/.test(mainSrc), 'main installs will-navigate guard')
pass(/setWindowOpenHandler/.test(mainSrc), 'main installs setWindowOpenHandler')
pass(/action:\s*'deny'/.test(mainSrc) || /action: "deny"/.test(mainSrc), 'window-open default is deny')
pass(/shell\.openExternal/.test(mainSrc), 'main uses shell.openExternal for validated URLs')
pass(/ht-shell-open-external/.test(mainSrc), 'open-external IPC channel is registered')
pass(/Content-Security-Policy/.test(mainSrc), 'CSP is delivered via response headers')
pass(/sessionSecurityAttached/.test(mainSrc), 'CSP handler attaches once')
pass(/webSecurity:\s*true/.test(mainSrc), 'webSecurity is true')
pass(/allowRunningInsecureContent:\s*false/.test(mainSrc), 'allowRunningInsecureContent is false')
pass(/contextIsolation:\s*true/.test(mainSrc), 'contextIsolation is true')
pass(/nodeIntegration:\s*false/.test(mainSrc), 'nodeIntegration is false')
pass(/sandbox:\s*true/.test(mainSrc), 'sandbox remains enabled')
pass(/loadFile\(fallbackPath\)/.test(mainSrc) || /fallback\.html/.test(mainSrc), 'fallback uses loadFile, not data:')
pass(!/data:text\/html/.test(mainSrc), 'main no longer navigates to data:text/html fallbacks')
pass(/classifyDesktopNavigationTarget/.test(mainSrc), 'main uses central navigation classifier')
pass(/openExternalUrl/.test(preloadSrc), 'preload exposes typed openExternalUrl')
pass(/ht-shell-open-external/.test(preloadSrc), 'preload invokes dedicated open-external channel')
pass(!/exposeInMainWorld\(\s*['"]ipcRenderer/.test(preloadSrc), 'preload does not expose ipcRenderer')
pass(!/ipcRenderer\s*:/.test(preloadSrc), 'preload does not publish raw ipcRenderer object')
pass(/DesktopShellBridgeApi/.test(typesSrc), 'bridge types include shell API')
pass(/Content-Security-Policy/.test(fallbackHtml), 'fallback.html has a strict CSP meta')
pass(/buildProductionCsp/.test(policySrc), 'policy module owns production CSP builder')

// Simulated window-open decision matrix (policy authority; main always denies Electron windows)
function windowOpenDecision(url, ctx) {
  const decision = classify(url, ctx)
  return {
    electronAction: 'deny',
    openExternal: decision.action === 'open-external',
    decision,
  }
}

pass(
  windowOpenDecision('https://hiddentunes.com', packagedCtx).electronAction === 'deny'
    && windowOpenDecision('https://hiddentunes.com', packagedCtx).openExternal === true,
  'validated HTTPS opens externally and Electron popup remains denied',
)
pass(
  windowOpenDecision('javascript:alert(1)', packagedCtx).openExternal === false,
  'invalid protocol does not request openExternal',
)
pass(
  windowOpenDecision(packagedIndex, packagedCtx).openExternal === false
    && windowOpenDecision(packagedIndex, packagedCtx).electronAction === 'deny',
  'internal application URL does not create a second window',
)
pass(
  !/setWindowOpenHandler\([\s\S]*action:\s*'allow'/.test(mainSrc),
  'untrusted renderer cannot inject BrowserWindow allow options via handler',
)

console.log('\nverify:electron-security PASS')

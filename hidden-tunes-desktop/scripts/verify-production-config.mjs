/**
 * Production / runtime configuration validation for desktop catalog.
 * Runs without launching Electron.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const require = createRequire(import.meta.url)

const {
  resolveMainRuntimeConfig,
  resolveSportsPilotToken,
  parseHttpsUrl,
  PRODUCTION_EXPRESS_ALLOWLIST,
  PRODUCTION_ADMIN_ALLOWLIST,
} = require('../electron/runtimeConfig.js')

let passed = 0
function ok(name, condition) {
  assert.ok(condition, name)
  passed += 1
  console.log(`  ✓ ${name}`)
}

console.log('Phase 7A — production config')

{
  const missing = resolveMainRuntimeConfig({ isPackaged: true, env: {} })
  ok(
    'packaged uses allowlisted Express production default',
    missing.ok
      && missing.expressCatalogBaseUrl === 'https://api.hiddentunes.com'
      && missing.warnings.some((warning) => /allowlisted production default/i.test(warning)),
  )
}

{
  const config = resolveMainRuntimeConfig({
    isPackaged: true,
    env: { VITE_EXPRESS_CATALOG_API_URL: 'https://localhost:3000' },
  })
  ok(
    'packaged rejects localhost',
    !config.ok && config.errors.some((e) => /localhost|invalid|forbidden/i.test(JSON.stringify(config.errors))),
  )
}

{
  const config = resolveMainRuntimeConfig({
    isPackaged: true,
    env: { VITE_EXPRESS_CATALOG_API_URL: 'https://evil.example.com' },
  })
  ok(
    'packaged rejects non-allowlisted host',
    !config.ok && config.errors.some((e) => /not allowlisted/i.test(e)),
  )
}

{
  const parsed = parseHttpsUrl('http://api.hiddentunes.com', { allowLocalhost: false })
  ok('production requires HTTPS', !parsed.ok && parsed.reason === 'https-required')
}

{
  const parsed = parseHttpsUrl('https://api.hiddentunes.com/', { allowLocalhost: false })
  ok(
    'trailing slash normalised',
    parsed.ok && parsed.url === 'https://api.hiddentunes.com',
  )
}

{
  const parsed = parseHttpsUrl('not-a-url', { allowLocalhost: false })
  ok('invalid URL rejected', !parsed.ok && parsed.reason === 'invalid-url')
}

{
  const config = resolveMainRuntimeConfig({
    isPackaged: true,
    env: {
      VITE_EXPRESS_CATALOG_API_URL: 'https://hidden-tunes-api.onrender.com/',
      VITE_CATALOG_ADMIN_API_URL: 'https://admin.hiddentunes.com/',
    },
  })
  ok(
    'packaged rejects retired Render Express URL',
    !config.ok && config.errors.some((error) => error.includes('not allowlisted')),
  )
}

{
  const config = resolveMainRuntimeConfig({ isPackaged: false, env: {} })
  ok(
    'development defaults to the production Express catalog',
    Boolean(config.expressCatalogBaseUrl)
      && !/localhost/i.test(config.expressCatalogBaseUrl || ''),
  )
}

{
  const config = resolveMainRuntimeConfig({
    isPackaged: false,
    env: { VITE_EXPRESS_CATALOG_API_URL: 'https://127.0.0.1:8443' },
  })
  ok(
    'development may use localhost when explicit',
    config.ok && /127\.0\.0\.1/.test(config.expressCatalogBaseUrl || ''),
  )
}

{
  const rendererSrc = fs.readFileSync(
    path.join(ROOT, 'src/lib/config/desktopRuntimeConfig.ts'),
    'utf8',
  )
  const bridgeSrc = fs.readFileSync(
    path.join(ROOT, 'src/lib/desktopCatalogBridge.ts'),
    'utf8',
  )
  const preloadSrc = fs.readFileSync(path.join(ROOT, 'electron/preload.js'), 'utf8')
  const mainSrc = fs.readFileSync(path.join(ROOT, 'electron/main.js'), 'utf8')
  const runtimeSrc = fs.readFileSync(path.join(ROOT, 'electron/runtimeConfig.js'), 'utf8')

  ok(
    'renderer config type has no sports token field',
    !rendererSrc.includes('sportsPrivatePilotToken'),
  )
  ok(
    'packaged renderer bridge refuses Vite sports token',
    bridgeSrc.includes('if (info?.isPackaged) return null')
      && bridgeSrc.includes('if (import.meta.env?.PROD) return null'),
  )
  ok('main process owns sports token resolver', typeof resolveSportsPilotToken === 'function')
  ok(
    'sports token stays in main runtimeConfig',
    runtimeSrc.includes('resolveSportsPilotToken')
      && runtimeSrc.includes('HT_SPORTS_PRIVATE_PILOT_TOKEN'),
  )
  ok(
    'preload exposes only allowlisted runtime.getInfo',
    preloadSrc.includes('runtime:')
      && preloadSrc.includes("getInfo: () => ipcRenderer.sendSync('ht-runtime-info')")
      && !preloadSrc.includes('exposeInMainWorld(\'process\'')
      && !preloadSrc.includes('require(\'fs\')'),
  )
  ok(
    'preload does not expose raw ipcRenderer',
    !preloadSrc.includes('ipcRenderer: ipcRenderer')
      && !preloadSrc.includes('ipc: ipcRenderer'),
  )
  ok(
    'main registers ht-runtime-info diagnostics only',
    mainSrc.includes("ipcMain.on('ht-runtime-info'")
      && mainSrc.includes('getRuntimeDiagnostics'),
  )
  ok(
    'allowlists are non-empty',
    PRODUCTION_EXPRESS_ALLOWLIST.size >= 1 && PRODUCTION_ADMIN_ALLOWLIST.size >= 1,
  )
  ok(
    'diagnostics payload omits secrets',
    runtimeSrc.includes('sportsPilotConfigured')
      && !runtimeSrc.includes('return {') === false
      && !/getRuntimeDiagnostics[\s\S]*token:/.test(runtimeSrc),
  )
}

console.log(`\nproduction-config: ${passed} checks passed`)

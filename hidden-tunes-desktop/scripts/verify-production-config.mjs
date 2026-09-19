/**
 * Production / runtime configuration validation for desktop catalog.
 * Runs without launching Electron.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import vm from 'node:vm'

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
    'renderer bridge has no private token environment path',
    !bridgeSrc.includes('SPORTS_PRIVATE_PILOT_TOKEN')
      && !bridgeSrc.includes('resolveBrowserSportsPilotToken'),
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

{
  const runtimeSrc = fs.readFileSync(path.join(ROOT, 'electron/runtimeConfig.js'), 'utf8')
  const bridgeSrc = fs.readFileSync(path.join(ROOT, 'electron/catalogBridge.js'), 'utf8')
  const htToken = 'synthetic-main-only-pilot-credential'
  const viteToken = 'synthetic-vite-pilot-must-not-resolve'

  function loadRuntime(env, isPackaged) {
    const context = {
      module: { exports: {} },
      process: { env },
      URL,
      require: (name) => {
        assert.equal(name, 'electron')
        return { app: { isPackaged } }
      },
    }
    vm.runInNewContext(runtimeSrc, context)
    return context.module.exports
  }

  for (const isPackaged of [true, false]) {
    const mode = isPackaged ? 'packaged production' : 'development'
    const baseEnv = { NODE_ENV: isPackaged ? 'production' : 'development' }
    const cases = [
      ['HT token', { HT_SPORTS_PRIVATE_PILOT_TOKEN: htToken }, htToken],
      ['no token', {}, null],
      ['Vite token only', { VITE_SPORTS_PRIVATE_PILOT_TOKEN: viteToken }, null],
      ['HT wins over Vite', { HT_SPORTS_PRIVATE_PILOT_TOKEN: htToken, VITE_SPORTS_PRIVATE_PILOT_TOKEN: viteToken }, htToken],
      ['short HT does not fall back', { HT_SPORTS_PRIVATE_PILOT_TOKEN: 'short', VITE_SPORTS_PRIVATE_PILOT_TOKEN: viteToken }, null],
      ['blank HT does not fall back', { HT_SPORTS_PRIVATE_PILOT_TOKEN: ' ', VITE_SPORTS_PRIVATE_PILOT_TOKEN: viteToken }, null],
      ['HT whitespace trimmed', { HT_SPORTS_PRIVATE_PILOT_TOKEN: ` ${htToken} ` }, htToken],
    ]
    for (const [label, env, expected] of cases) {
      const runtime = loadRuntime({ ...baseEnv, ...env }, isPackaged)
      ok(`${mode}: ${label}`, runtime.resolveSportsPilotToken() === expected)
      const diagnostics = runtime.getRuntimeDiagnostics(isPackaged)
      ok(`${mode}: ${label} diagnostics are accurate and contain no credential`,
        diagnostics.sportsPilotConfigured === Boolean(expected)
        && !JSON.stringify(diagnostics).includes(htToken)
        && !JSON.stringify(diagnostics).includes(viteToken))

      const context = {
        module: { exports: {} }, URL,
        require: (name) => name === './runtimeConfig' ? runtime : { app: { isPackaged } },
      }
      // Exercise the real header builder without making network requests.
      vm.runInNewContext(`${bridgeSrc}\nmodule.exports.auditHeaders = buildCatalogHeaders;`, context)
      const headers = context.module.exports.auditHeaders()
      ok(`${mode}: ${label} request header follows resolver`,
        expected ? headers['X-Hidden-Tunes-Sports-Pilot'] === expected
          : !Object.hasOwn(headers, 'X-Hidden-Tunes-Sports-Pilot'))
    }
  }

  function assertNoTokenLiteral(content, tokens) {
    assert.ok(!tokens.some((token) => token.length >= 16 && content.includes(token)),
      'Renderer bundle contains pilot credential material (value redacted)')
  }
  assert.throws(() => assertNoTokenLiteral(`const leaked = '${viteToken}'`, [viteToken]))
  ok('renderer token literal fails leak check', true)
  assertNoTokenLiteral('const name = "HT_SPORTS_PRIVATE_PILOT_TOKEN"', [htToken, viteToken])
  ok('variable name alone is not reported as a leaked credential', true)

  const referenceTokens = [
    process.env.HT_SPORTS_PRIVATE_PILOT_TOKEN,
    process.env.VITE_SPORTS_PRIVATE_PILOT_TOKEN,
    process.env.SPORTS_PRIVATE_PILOT_TOKEN,
  ].filter((value) => typeof value === 'string' && value.trim().length >= 16)
    .map((value) => value.trim())
  const dist = path.join(ROOT, 'dist')
  if (referenceTokens.length && fs.existsSync(dist)) {
    for (const name of fs.readdirSync(dist, { recursive: true })) {
      const file = path.join(dist, name)
      if (fs.statSync(file).isFile()) assertNoTokenLiteral(fs.readFileSync(file, 'utf8'), referenceTokens)
    }
    ok('existing renderer artifact excludes supplied reference tokens', true)
  } else {
    console.log('  SKIP: real-token renderer artifact clearance requires dist and a reference token; synthetic rejection passed')
  }
}

console.log(`\nproduction-config: ${passed} checks passed`)

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import {
  PILOT_KEYS, rendererDefines, rendererSecretBoundary,
  assertRendererConfig, assertRendererSource, assertNoPilotMaterial,
} from './rendererEnv.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const asar = require('@electron/asar')
const values = ['synthetic-vite-boundary-20260906', 'synthetic-ht-boundary-20260906', 'synthetic-server-boundary-20260906']
let passed = 0
function pass(name, run) { run(); passed++; console.log(`PASS: ${name}`) }
const env = {
  VITE_SUPABASE_URL: 'https://public.example.com',
  VITE_SPORTS_PRIVATE_PILOT_TOKEN: values[0],
  HT_SPORTS_PRIVATE_PILOT_TOKEN: values[1],
  SPORTS_PRIVATE_PILOT_TOKEN: values[2],
  VITE_SUPABASE_URL_PRIVATE_SUFFIX: values[0],
  VITE_CROSSPLAY_LOCAL_JWT: 'local-development-only',
}
pass('public configuration retained, unlisted and private keys excluded', () => {
  const result = rendererDefines(env, false)
  assert.deepEqual(Object.keys(result), ['import.meta.env.VITE_SUPABASE_URL'])
  assert.equal(JSON.parse(result['import.meta.env.VITE_SUPABASE_URL']), env.VITE_SUPABASE_URL)
})
pass('local crossplay config remains development-only', () => {
  assert.ok(rendererDefines(env, true)['import.meta.env.VITE_CROSSPLAY_LOCAL_JWT'])
  assertNoPilotMaterial(JSON.stringify(rendererDefines(env, true)), values)
})
for (const source of [
  'window.leak = import.meta.env.VITE_SPORTS_PRIVATE_PILOT_TOKEN',
  'window.leak = JSON.stringify(process.env)',
  "window.leak = process['env']",
  'window.leak = process?.env',
  "contextBridge.exposeInMainWorld('environment', process.env)",
  `contextBridge.exposeInMainWorld('credential', '${values[1]}')`,
]) pass('malicious renderer/preload source rejected', () => assert.throws(() => assertRendererSource(source, values)))
for (const define of [
  { 'import.meta.env.VITE_SPORTS_PRIVATE_PILOT_TOKEN': JSON.stringify(values[0]) },
  { 'process.env': JSON.stringify(env) },
  { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(values[0]) },
]) pass('malicious Vite define rejected', () => assert.throws(() => assertRendererConfig([], {}, define, false, values)))
pass('automatic VITE prefix rejected', () => assert.throws(() => assertRendererConfig('VITE_', {}, {}, false)))
pass('unexpected resolved environment rejected', () => assert.throws(() => assertRendererConfig([], env, {}, false)))
pass('synthetic token literal in chunk rejected', () => assert.throws(() => assertNoPilotMaterial(`const credential='${values[0]}'`, values)))

// Run real Vite builds for adversarial fixtures, not just validator unit tests.
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-renderer-security-'))
let fixtureCount = 0
async function fixture(name, source, extra = {}, preload) {
  const dir = path.join(fixtureRoot, String(++fixtureCount))
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/main.js'), source)
  fs.writeFileSync(path.join(dir, 'index.html'), '<script type="module" src="/src/main.js"></script>')
  if (preload) {
    fs.mkdirSync(path.join(dir, 'electron'))
    fs.writeFileSync(path.join(dir, 'electron/preload.js'), preload)
  }
  const run = () => build({ root: dir, configFile: false, envPrefix: [], logLevel: 'silent',
    plugins: [rendererSecretBoundary(dir, values)], build: { write: false }, ...extra })
  await assert.rejects(run)
  passed++; console.log(`PASS: real build rejects ${name}`)
}
await fixture('direct pilot env access', 'console.log(import.meta.env.VITE_SPORTS_PRIVATE_PILOT_TOKEN)')
await fixture('define injection', 'console.log(import.meta.env)', { define: { 'import.meta.env.VITE_SPORTS_PRIVATE_PILOT_TOKEN': JSON.stringify(values[0]) } })
await fixture('process environment serialization', 'console.log(JSON.stringify(process.env))')
await fixture('preload exposure', 'console.log("safe")', {}, "contextBridge.exposeInMainWorld('environment',process.env)")
await fixture('hard-coded private literal', `console.log('${values[0]}')`)
await fixture('generated private asset', 'console.log("safe")', {
  plugins: [rendererSecretBoundary(path.join(fixtureRoot, String(fixtureCount + 1)), values), {
    name: 'malicious-generated-asset-fixture',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'leaked.txt', source: values[0] }) },
  }],
})

// Execute the real preload with synthetic process credentials; inspect only its
// exposed surface and returned runtime diagnostics, never a real user session.
pass('actual preload exposes no credential or environment object', () => {
  const runtimeContext = { module: { exports: {} }, process: { env }, URL }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'electron/runtimeConfig.js'), 'utf8'), runtimeContext)
  const runtime = runtimeContext.module.exports
  assert.equal(runtime.resolveSportsPilotToken(), values[1])
  const exposed = {}
  const ipc = { sendSync: () => runtime.getRuntimeDiagnostics(true), invoke: () => Promise.resolve(null), on() {}, removeListener() {} }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'electron/preload.js'), 'utf8'), {
    process: { env }, require: () => ({ contextBridge: { exposeInMainWorld: (key, value) => { exposed[key] = value } }, ipcRenderer: ipc }),
  })
  assertNoPilotMaterial(JSON.stringify(exposed), values)
  assertNoPilotMaterial(JSON.stringify(exposed.hiddenTunesDesktop.runtime.getInfo()), values)
  assert.ok(exposed.hiddenTunesDesktop.runtime.getInfo().sportsPilotConfigured)
})

if (process.argv.includes('--production')) {
  const old = Object.fromEntries(PILOT_KEYS.map((key) => [key, process.env[key]]))
  const oldCwd = process.cwd()
  try {
    PILOT_KEYS.forEach((key, i) => { process.env[key] = values[i] })
    process.chdir(root)
    const out = path.join(fixtureRoot, 'production-renderer')
    await build({ root, configFile: path.join(root, 'vite.config.ts'), mode: 'production', logLevel: 'silent', build: { outDir: out, sourcemap: true } })
    for (const name of fs.readdirSync(out, { recursive: true })) {
      const file = path.join(out, name)
      if (fs.statSync(file).isFile()) assertNoPilotMaterial(fs.readFileSync(file).toString('utf8'), values)
    }
    passed++; console.log('PASS: actual production JS/assets/source maps exclude all pilot names and synthetic values')
    const staging = path.join(fixtureRoot, 'package')
    fs.mkdirSync(staging)
    fs.cpSync(out, path.join(staging, 'dist'), { recursive: true })
    fs.cpSync(path.join(root, 'electron'), path.join(staging, 'electron'), { recursive: true })
    fs.copyFileSync(path.join(root, 'package.json'), path.join(staging, 'package.json'))
    const archive = path.join(fixtureRoot, 'app.asar')
    await asar.createPackage(staging, archive)
    for (const name of asar.listPackage(archive)) {
      const file = name.replace(/^[/\\]/, '')
      const stat = asar.statFile(archive, file)
      if (stat.files || stat.link) continue
      const data = asar.extractFile(archive, file).toString('utf8')
      assert.ok(!values.some((value) => data.includes(value)), 'Packaged synthetic credential detected (redacted)')
      assert.ok(!/(^|[/\\])\.env($|\.)/.test(file), 'Packaged env file detected')
      if (/^dist[/\\]/.test(file)) assertNoPilotMaterial(data, values)
    }
    passed++; console.log('PASS: staged ASAR/resources contain no synthetic credentials or .env; renderer names absent')
    const packagedRuntime = { module: { exports: {} }, process: { env }, URL }
    vm.runInNewContext(asar.extractFile(archive, 'electron/runtimeConfig.js').toString(), packagedRuntime)
    assert.equal(packagedRuntime.module.exports.resolveSportsPilotToken(), values[1])
    assertNoPilotMaterial(JSON.stringify(packagedRuntime.module.exports.getRuntimeDiagnostics(true)), values)
    passed++; console.log('PASS: ASAR main process retains HT injection without exposing diagnostic credentials')
    console.log(`AUDIT_ASAR: ${archive}`)
  } finally {
    process.chdir(oldCwd)
    for (const key of PILOT_KEYS) {
      if (old[key] === undefined) delete process.env[key]
      else process.env[key] = old[key]
    }
  }
}
console.log(`renderer-secret-boundary: ${passed} checks passed`)

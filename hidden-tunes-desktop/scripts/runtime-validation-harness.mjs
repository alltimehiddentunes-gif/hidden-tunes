import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const root = path.resolve(import.meta.dirname, '..')
const viteEntry = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Vite readiness timeout after ${timeoutMs}ms: ${url}`)
}

function capture(child, stream, sink) {
  child[stream]?.setEncoding('utf8')
  child[stream]?.on('data', (chunk) => {
    sink.push(chunk)
    process[stream === 'stdout' ? 'stdout' : 'stderr'].write(chunk)
  })
}

async function stopOwned(child) {
  if (!child || child.exitCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGTERM')
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 1500))])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 1500))])
  }
  child.stdout?.destroy()
  child.stderr?.destroy()
}

export async function runRuntimeValidation(scriptName, options = {}) {
  const timeoutMs = options.timeoutMs ?? 75_000
  const viteReadyMs = options.viteReadyMs ?? 20_000
  const port = await reservePort()
  const marker = `ht-validation-${Date.now()}-${process.pid}`
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), `${marker}-`))
  const userDataDir = path.join(runDir, 'user-data')
  const logDir = path.join(runDir, 'logs')
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.mkdirSync(logDir, { recursive: true })
  const url = `http://127.0.0.1:${port}`
  const stdout = []
  const stderr = []
  let vite = null
  let electron = null
  let timedOut = false
  let cleanupStarted = false
  let exitCode = null
  let exitSignal = null
  let spawnError = null
  const diagnosticsPath = path.join(logDir, 'harness-diagnostics.json')
  const writeDiagnostics = (classification = 'running') => fs.writeFileSync(diagnosticsPath, JSON.stringify({
    scriptName,
    command: electron ? [electronPath, '--disable-gpu', '--disable-software-rasterizer', '--disable-gpu-compositing', '--disable-gpu-rasterization', '--use-gl=disabled', `--user-data-dir=${userDataDir}`, path.join(root, 'scripts', scriptName)] : null,
    cwd: root,
    environment: { HT_VALIDATE_URL: url, HT_VALIDATION_MARKER: marker, HT_VALIDATION_LOG_DIR: logDir, HT_VALIDATION_TITLE_SUFFIX: ' [Validation]' },
    validationProfilePath: userDataDir,
    viteUrl: url,
    vitePid: vite?.pid ?? null,
    electronPid: electron?.pid ?? null,
    exitCode,
    exitSignal,
    cleanupAlreadyStarted: cleanupStarted,
    timeoutTriggered: timedOut,
    appQuitObserved: null,
    rendererGoneReason: null,
    mainError: spawnError ? String(spawnError?.stack || spawnError) : null,
    classification,
  }, null, 2))

  try {
    vite = spawn(process.execPath, [viteEntry, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd: root,
      env: { ...process.env, HT_VALIDATION_MARKER: marker },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    capture(vite, 'stdout', stdout)
    capture(vite, 'stderr', stderr)
    await waitForUrl(url, viteReadyMs)

    electron = spawn(electronPath, ['--disable-gpu', '--disable-software-rasterizer', '--disable-gpu-compositing', '--disable-gpu-rasterization', '--use-gl=disabled', `--user-data-dir=${userDataDir}`, path.join(root, 'scripts', scriptName)], {
      cwd: root,
      env: {
        ...process.env,
        HT_VALIDATE_URL: url,
        HT_VALIDATION_MARKER: marker,
        HT_VALIDATION_LOG_DIR: logDir,
        HT_VALIDATION_TITLE_SUFFIX: ' [Validation]',
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    capture(electron, 'stdout', stdout)
    capture(electron, 'stderr', stderr)
    writeDiagnostics('running')

    exitCode = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        timedOut = true
        void stopOwned(electron)
        reject(new Error(`Validation timeout after ${timeoutMs}ms: ${scriptName}`))
      }, timeoutMs)
      electron.once('error', (error) => { clearTimeout(timer); spawnError = error; reject(error) })
      electron.once('exit', (code, signal) => { clearTimeout(timer); exitSignal = signal; resolve(code ?? 1) })
    })
    writeDiagnostics(exitCode === 0 ? 'normal clean exit' : 'app-requested quit or main-process failure')
    return { scriptName, exitCode, timedOut, marker, port, runDir, ownedPids: { vite: vite.pid, electron: electron.pid } }
  } catch (error) {
    fs.writeFileSync(path.join(logDir, 'harness-error.json'), JSON.stringify({
      scriptName, marker, port, timedOut, error: String(error?.stack || error),
      ownedPids: { vite: vite?.pid ?? null, electron: electron?.pid ?? null },
    }, null, 2))
    throw error
  } finally {
    cleanupStarted = true
    await stopOwned(electron)
    await stopOwned(vite)
    fs.writeFileSync(path.join(logDir, 'stdout.log'), stdout.join(''))
    fs.writeFileSync(path.join(logDir, 'stderr.log'), stderr.join(''))
    const classification = timedOut ? 'timeout termination' : spawnError ? 'main-process crash' : exitSignal ? 'external termination' : exitCode === 0 ? 'normal clean exit' : exitCode === null ? 'forced cleanup' : 'app-requested quit or main-process failure'
    writeDiagnostics(classification)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const scriptName = process.argv[2]
  if (!scriptName) {
    console.error('Usage: node scripts/runtime-validation-harness.mjs <validate-*.mjs> [timeout-ms]')
    process.exit(2)
  }
  try {
    const result = await runRuntimeValidation(scriptName, { timeoutMs: Number(process.argv[3]) || undefined })
    console.log(`\nOwned validation PIDs: vite=${result.ownedPids.vite} electron=${result.ownedPids.electron}`)
    console.log(`Validation port: ${result.port}`)
    console.log(`Validation evidence: ${result.runDir}`)
    process.exitCode = result.exitCode
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}

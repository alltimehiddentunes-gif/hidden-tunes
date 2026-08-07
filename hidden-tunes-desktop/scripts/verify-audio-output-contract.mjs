import fs from 'node:fs'

const engine = fs.readFileSync(new URL('../src/lib/premiumAudioVisualizer/engine.ts', import.meta.url), 'utf8')
const guard = "document.documentElement.dataset.htVisualizerAudioGraph !== 'enabled'"
const guardIndex = engine.indexOf(guard)
const sourceIndex = engine.indexOf('createMediaElementSource(audio)')

const checks = [
  ['visualizer defaults to non-intercepting progress fallback', guardIndex >= 0],
  ['media-element interception remains behind explicit diagnostic opt-in', sourceIndex > guardIndex && guardIndex >= 0],
  ['fallback documents suspended-context silence regression', engine.includes('advancing but silent element')],
]

let failed = 0
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${label}`)
  if (!pass) failed += 1
}
if (failed) process.exitCode = 1
else console.log(`Audio output contract: ${checks.length} passed, 0 failed`)

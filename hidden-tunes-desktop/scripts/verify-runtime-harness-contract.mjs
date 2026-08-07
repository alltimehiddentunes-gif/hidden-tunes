import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./runtime-validation-harness.mjs', import.meta.url), 'utf8')

assert.match(source, /server\.listen\(0, '127\.0\.0\.1'/, 'validation must allocate an isolated loopback port')
assert.match(source, /fs\.mkdtempSync/, 'validation must use an isolated temporary profile')
assert.match(source, /--user-data-dir=/, 'Electron must receive the isolated profile')
assert.match(source, /HT_VALIDATION_MARKER/, 'owned validation processes must carry an explicit marker')
assert.match(source, /HT_VALIDATION_LOG_DIR/, 'validation must have a unique log directory')
assert.match(source, /Vite readiness timeout/, 'Vite readiness must be bounded')
assert.match(source, /Validation timeout/, 'Electron test completion must be bounded')
assert.match(source, /finally\s*\{[^]*stopOwned\(electron\)[^]*stopOwned\(vite\)/, 'cleanup must run in finally')
assert.doesNotMatch(source, /Get-Process|taskkill|pkill|killall/, 'harness must never scan or terminate unrelated processes')
assert.match(source, /vite\.pid/, 'owned Vite PID must be recorded')
assert.match(source, /electron\.pid/, 'owned Electron PID must be recorded')

console.log('Bounded runtime harness contract: PASS')

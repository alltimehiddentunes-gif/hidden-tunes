import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const root = path.resolve(import.meta.dirname, '..')
const localesDir = path.join(root, 'src', 'localization', 'locales')
const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8')
const preference = fs.readFileSync(path.join(root, 'src', 'localization', 'preference.ts'), 'utf8')
const supported = fs.readFileSync(path.join(root, 'src', 'localization', 'supportedLocales.ts'), 'utf8')

function loadDictionary(code) {
  const source = fs.readFileSync(path.join(localesDir, `${code}.ts`), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(js, { module, exports: module.exports }, { filename: `${code}.ts` })
  return module.exports.default
}

function flatten(value, prefix = '', output = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key
    if (typeof child === 'string') output.set(full, child)
    else if (child && typeof child === 'object') flatten(child, full, output)
  }
  return output
}

const codes = [...supported.matchAll(/code:\s*"([^"]+)"/g)].map((match) => match[1])
const english = flatten(loadDictionary('en'))
let failed = false

console.log(`Localization coverage (${english.size} required mobile-parity keys)`)
for (const code of codes) {
  const dictionary = flatten(loadDictionary(code))
  const missing = [...english.keys()].filter((key) => !dictionary.get(key)?.trim())
  const fallback = missing.length
  const coverage = ((english.size - missing.length) / english.size * 100).toFixed(2)
  console.log(`${code.padEnd(5)} present=${String(english.size - missing.length).padStart(3)} missing=${String(missing.length).padStart(3)} fallback=${String(fallback).padStart(3)} coverage=${coverage}% rtl=${code === 'ar'} ready=${missing.length === 0}`)
  if (missing.length) failed = true
}

const contracts = [
  ['one localization owner', (app.match(/<LocalizationProvider>/g) ?? []).length === 1],
  ['owner above playback', app.indexOf('<LocalizationProvider>') < app.indexOf('<DesktopPlaybackProvider>')],
  ['saved preference overrides system locale', preference.includes('readStoredLocale() ?? detectSystemLocale()')],
  ['mobile persistence key retained', preference.includes("'hiddenTunes.selectedLocale'")],
  ['language switch does not restart', !fs.readFileSync(path.join(root, 'src', 'localization', 'LocalizationProvider.tsx'), 'utf8').includes('reload(')],
  ['all 20 mobile language codes retained', codes.length === 20],
  ['Arabic RTL retained', supported.includes('return locale === "ar" ? "rtl" : "ltr"')],
]

for (const [name, pass] of contracts) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`)
  if (!pass) failed = true
}

if (failed) process.exitCode = 1

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const root = path.resolve(import.meta.dirname, '..')
const srcRoot = path.join(root, 'src')
const applicationAttributes = new Set(['aria-label', 'aria-description', 'placeholder', 'title', 'alt'])
const ignoredFiles = new Set(['localization/LocalizationProvider.tsx'])

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    return entry.isDirectory() ? filesIn(absolute) : absolute.endsWith('.tsx') ? [absolute] : []
  })
}

function normalize(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function looksApplicationOwned(value) {
  const text = normalize(value)
  if (!text || !/[A-Za-z]/.test(text)) return false
  if (/^(Hidden Tunes|HT)$/i.test(text)) return false
  if (/^(https?:|[A-Z0-9_.-]{2,})$/.test(text)) return false
  return true
}

const findings = []
for (const file of filesIn(srcRoot)) {
  const relative = path.relative(srcRoot, file).replaceAll('\\', '/')
  if (ignoredFiles.has(relative)) continue
  const sourceText = fs.readFileSync(file, 'utf8')
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  function visit(node) {
    if (ts.isJsxText(node)) {
      const text = normalize(node.text)
      if (looksApplicationOwned(text)) findings.push({ file: relative, line: source.getLineAndCharacterOfPosition(node.pos).line + 1, kind: 'jsx', text })
    }
    if (ts.isJsxAttribute(node) && applicationAttributes.has(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const text = normalize(node.initializer.text)
      if (looksApplicationOwned(text)) findings.push({ file: relative, line: source.getLineAndCharacterOfPosition(node.pos).line + 1, kind: node.name.getText(source), text })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

const byArea = new Map()
for (const item of findings) {
  const area = item.file === 'App.tsx' ? 'App/shell' : item.file.split('/').slice(0, 2).join('/')
  byArea.set(area, (byArea.get(area) ?? 0) + 1)
}

console.log(`Application-owned hardcoded candidates: ${findings.length}`)
for (const [area, count] of [...byArea].sort((a, b) => b[1] - a[1])) console.log(`${String(count).padStart(4)}  ${area}`)
if (process.argv.includes('--details')) for (const item of findings) console.log(`${item.file}:${item.line}\t${item.kind}\t${item.text}`)

function classify(item) {
  if (item.file.startsWith('components/sports/')) return 'DEFERRED_SPORTS'
  if (/^(?:&(?:ldquo|rdquo|amp|apos|quot|nbsp);|[·+—–|:/])+$/i.test(item.text)) return 'G_FALSE_POSITIVE'
  if (/^(?:Hidden|Tunes)$/i.test(item.text)) return 'G_FALSE_POSITIVE'
  if (item.kind !== 'jsx') return 'F_ACCESSIBILITY_USER_FACING'
  return 'A_USER_FACING_APPLICATION_STRING'
}

if (process.argv.includes('--triage')) {
  const triaged = findings.map((item) => ({ ...item, classification: classify(item) }))
  const counts = Object.fromEntries([...new Set(triaged.map((item) => item.classification))].sort().map((classification) => [classification, triaged.filter((item) => item.classification === classification).length]))
  const releaseCandidates = triaged.filter((item) => item.classification !== 'DEFERRED_SPORTS')
  const actualBlockers = releaseCandidates.filter((item) => item.classification === 'A_USER_FACING_APPLICATION_STRING' || item.classification === 'F_ACCESSIBILITY_USER_FACING')
  console.log(`Release candidates excluding Sports: ${releaseCandidates.length}`)
  console.log(`Real user-facing hardcoded strings: ${actualBlockers.length}`)
  console.log(`Legitimate exceptions/false positives: ${releaseCandidates.length - actualBlockers.length}`)
  console.log(`Deferred Sports: ${triaged.length - releaseCandidates.length}`)
  console.log(JSON.stringify({ totalCandidates: findings.length, releaseCandidates: releaseCandidates.length, actualBlockers: actualBlockers.length, legitimateExceptions: releaseCandidates.length - actualBlockers.length, deferredSports: triaged.length - releaseCandidates.length, counts, findings: triaged }, null, 2))
}

if (process.argv.includes('--fail') && findings.length) process.exitCode = 1

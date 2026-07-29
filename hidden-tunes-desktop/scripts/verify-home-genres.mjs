import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const registryPath = path.join(ROOT, 'src/lib/musicGenres.ts')
const registrySource = fs.readFileSync(registryPath, 'utf8')
const compiled = ts.transpileModule(registrySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const module = { exports: {} }
new Function('exports', 'module', compiled)(module.exports, module)
const { MUSIC_GENRES, createMusicGenreIntent, parseMusicGenreIntent } = module.exports

const homeSource = fs.readFileSync(path.join(ROOT, 'src/components/home/MusicHomePage.tsx'), 'utf8')
const appSource = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8')
const apiSource = fs.readFileSync(path.join(ROOT, 'src/lib/api.ts'), 'utf8')
const serviceSource = fs.readFileSync(path.join(ROOT, 'src/lib/musicCatalog/catalogService.ts'), 'utf8')

const pass = (name, condition) => {
  assert.ok(condition, name)
  console.log(`PASS: ${name}`)
}

pass('all 12 Home genres exist', MUSIC_GENRES.length === 12)
pass('canonical slugs are unique', new Set(MUSIC_GENRES.map((genre) => genre.slug)).size === 12)
pass('all genres have production request values', MUSIC_GENRES.every((genre) => genre.requestValue))
pass('alias normalisation works', parseMusicGenreIntent(createMusicGenreIntent('r-and-b'))?.label === 'R&B')
pass('Home uses the authoritative registry', homeSource.includes('MUSIC_GENRES.map'))
pass('Home uses explicit genre intent', homeSource.includes('createMusicGenreIntent(genre.slug)'))
pass('Home genre tiles do not call generic label search', !homeSource.includes('onBrowseSearch(label)'))
pass('ordinary free-text search remains', appSource.includes('searchMusicSongsPage({'))
pass('genre destination uses genre loader', appSource.includes('loadMusicGenreSongsPage({'))
pass('genre request builder emits genre parameter', apiSource.includes("params.set('genre', genre)"))
pass('pagination retains genre request value', serviceSource.includes("resource: 'genre-songs'"))
pass('genre pagination deduplicates canonical IDs', appSource.includes('new Set(previous.map((song) => song.id))'))
pass('genre playback reuses existing onOpenSong', appSource.includes("`${genreDefinition.label} catalogue`"))
pass('genre empty state differs from search', appSource.includes('content is currently available'))

const base = 'https://hidden-tunes-api.onrender.com/api/songs'
const report = []
for (const genre of MUSIC_GENRES) {
  const started = Date.now()
  const valid = []
  const seenIds = new Set()
  let page = 1
  let responseCount = 0
  while (true) {
    const response = await fetch(`${base}?limit=40&page=${page}&genre=${encodeURIComponent(genre.requestValue)}`)
    assert.equal(response.status, 200, `${genre.label} page ${page} status`)
    const rows = await response.json()
    assert.ok(Array.isArray(rows), `${genre.label} page ${page} response is an array`)
    responseCount += rows.length
    for (const song of rows) {
      if (!genre.backendValues.includes(song.genre) || seenIds.has(song.id)) continue
      seenIds.add(song.id)
      valid.push(song)
    }
    if (rows.length < 40) break
    page += 1
  }
  report.push({
    label: genre.label,
    slug: genre.slug,
    requestValue: genre.requestValue,
    pages: page,
    responseCount,
    validCount: valid.length,
    durationMs: Date.now() - started,
    playableCount: valid.filter((song) => song.audioUrl || song.previewUrl || song.streamUrl).length,
  })
}

console.table(report)
console.log(`Home genre verification: ${MUSIC_GENRES.length} production destinations checked`)

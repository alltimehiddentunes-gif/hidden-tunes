import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MUSIC_SEARCH_GENRES, normalizeGenre, resolveGenreIntent, genreRank, genreOrClause, fetchGenrePage } from '../services/musicSearchGenres.js'

for (const [label, aliases, family] of MUSIC_SEARCH_GENRES) {
  test(`normalization and explicit family: ${label}`, () => {
    const intent = resolveGenreIntent(label)
    for (const alias of [label, ...aliases]) {
      assert.equal(resolveGenreIntent('  ' + alias.toUpperCase() + '  '), intent)
      assert.equal(genreRank(alias, intent), 2)
    }
    for (const related of family) assert.equal(genreRank(related, intent), 1)
    assert.equal(genreRank('unrelated', intent), 0)
  })
}
test('genre intent is whole-term only, not title/mood substrings', () => {
  for (const query of ['Country Roads', 'Pop Smoke', 'Rockabye', 'Jazz Artist', '', '%']) assert.equal(resolveGenreIntent(query), null)
  assert.equal(normalizeGenre('Ｈｉｐ－Ｈｏｐ'), normalizeGenre('Hip Hop'))
  assert.equal(resolveGenreIntent('RnB'), resolveGenreIntent('R&B'))
})
test('comma genre labels are quoted PostgREST values', () => {
  assert.equal(genreOrClause(['Pop, Country']), 'genre.ilike."Pop, Country"')
})
test('500 unrelated title matches cannot consume genre slots', async () => {
  const irrelevant = Array.from({ length: 501 }, (_, id) => ({ id, title: 'Country', genre: 'Rap' }))
  const exact = Array.from({ length: 30 }, (_, id) => ({ id: 'c' + id, genre: 'Country' }))
  let calls = 0
  const page = await fetchGenrePage(resolveGenreIntent('Country'), { offset: 0, limit: 20 }, async (labels, offset, limit) => {
    calls++
    const rows = [...irrelevant, ...exact].filter(row => labels.includes(row.genre))
    return { data: rows.slice(offset, offset + limit), count: rows.length, error: null }
  })
  assert.equal(calls, 1)
  assert.equal(page.data.length, 20)
  assert.ok(page.data.every(row => row.genre === 'Country'))
})
test('tier-first pagination crosses exact/family boundary without duplicates', async () => {
  const rows = [{ id: 1, genre: 'R&B' }, { id: 2, genre: 'R&B' }, { id: 3, genre: 'R&B / Soul' }, { id: 4, genre: 'R&B / Soul' }]
  const fetchTier = async (labels, offset, limit) => {
    const matches = rows.filter(row => labels.includes(row.genre))
    return { data: matches.slice(offset, offset + limit), count: matches.length, error: null }
  }
  const first = await fetchGenrePage(resolveGenreIntent('R&B'), { offset: 0, limit: 3 }, fetchTier)
  const second = await fetchGenrePage(resolveGenreIntent('R&B'), { offset: 3, limit: 3 }, fetchTier)
  assert.deepEqual(first.data.map(row => row.id), [1, 2, 3])
  assert.deepEqual(second.data.map(row => row.id), [4])
})
test('no-supply genre is empty, not unrelated recommendations', async () => {
  const result = await fetchGenrePage(resolveGenreIntent('Rock'), { offset: 0, limit: 20 }, async () => ({ data: [], count: 0, error: null }))
  assert.deepEqual(result.data, [])
})
test('database failures and missing counts are not presented as successful empty matches', async () => {
  const error = { message: 'unavailable' }
  assert.equal((await fetchGenrePage(resolveGenreIntent('Pop'), { offset: 0, limit: 20 }, async () => ({ error }))).error, error)
  assert.ok((await fetchGenrePage(resolveGenreIntent('Pop'), { offset: 0, limit: 20 }, async () => ({ data: [], error: null }))).error)
})

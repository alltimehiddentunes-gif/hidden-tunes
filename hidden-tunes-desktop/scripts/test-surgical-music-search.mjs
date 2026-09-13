import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { MUSIC_SEARCH_GENRES as backendGenres } from '../../hidden-tunes-backend/services/musicSearchGenres.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const ts = require('typescript')
const cache = new Map()
function loadTs(file) {
  if (cache.has(file)) return cache.get(file)
  const source = fs.readFileSync(file, 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext('(function(require,module,exports){' + js + '\n})', {})(name => loadTs(path.resolve(path.dirname(file), name + '.ts')), module, module.exports)
  cache.set(file, module.exports)
  return module.exports
}
const ranking = loadTs(path.join(root, 'src/lib/search/musicSearchRanking.ts'))
const genres = loadTs(path.join(root, 'src/lib/search/musicGenreIntent.ts'))
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
const ast = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const topBar = ast.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast) === 'HomeTopBar'))
assert.ok(topBar)
const topBarJs = ts.transpileModule(topBar.getText(ast), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2023 } }).outputText
const song = (id, title, genre, artist = 'Artist') => ({ id, title, artist, genre, album: 'Album', tags: [], mood: null })

test('frontend/backend search normalization registries remain identical', () => {
  assert.equal(JSON.stringify(genres.MUSIC_SEARCH_GENRES), JSON.stringify(backendGenres))
  assert.equal(genres.resolveSearchGenre('R&B'), genres.resolveSearchGenre('rnb'))
})
for (const query of ['Country', 'Amapiano', 'Blues', 'Gospel', 'Reggae', 'Rock', 'R&B', 'Pop']) {
  test('genre before misleading exact title: ' + query, () => {
    const result = ranking.rankSearchSongs([song('text', query, 'unrelated', query), song('genre', 'Quiet Song', query)], query)
    assert.equal(result[0].item.id, 'genre')
  })
}
test('accepted genre aliases and families survive client refinement', () => {
  for (const [query, field] of [['rnb', 'R&B / Soul'], ['hip hop', 'Hip-Hop / Rap'], ['reggae', 'Reggae / Dancehall'], ['blues', 'Soul Blues']]) {
    assert.equal(ranking.rankSearchSongs([song('g', 'Quiet', field), song('x', query, 'unrelated')], query)[0].item.id, 'g')
  }
})
test('artist/title/free text behavior and Unicode normalization retained', () => {
  assert.equal(ranking.rankSearchSongs([song('partial', 'North', 'Jazz', 'Ada Band'), song('exact', 'Other', 'Jazz', 'Ada')], 'Ada')[0].item.id, 'exact')
  assert.equal(ranking.rankSearchSongs([song('x', 'Elsewhere', 'Jazz'), song('t', 'Night Train', 'Jazz')], 'Night Train')[0].item.id, 't')
  assert.equal(ranking.rankSearchSongs([song('x', 'Night Train', 'Jazz', 'Ada')], 'Ada Night').length, 1)
  assert.equal(ranking.rankSearchSongs([song('x', 'Elsewhere', 'Jazz')], 'no such record').length, 0)
  assert.equal(ranking.normalizeSearchText('  Café 東京  '), 'cafe 東京')
})

function formHarness(mode) {
  const cells = []
  const timers = new Map()
  let cursor = 0, timerId = 0, committed = '', submitted = 0, navigation = 0
  const sandbox = {
    SEARCH_INPUT_COMMIT_MS: 200,
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    memo: fn => fn,
    useState: initial => {
      const index = cursor++
      if (!(index in cells)) cells[index] = initial
      return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value }]
    },
    useRef: initial => {
      const index = cursor++
      if (!(index in cells)) cells[index] = { current: initial }
      return cells[index]
    },
    useEffect: () => {},
    useCallback: fn => fn,
    useLocalization: () => ({ t: value => value }),
    window: { setTimeout: fn => { timers.set(++timerId, fn); return timerId }, clearTimeout: id => timers.delete(id) },
  }
  const component = vm.runInNewContext(topBarJs + ';HomeTopBar', sandbox)
  const props = mode === 'home'
    ? { onSearchSubmit: value => { committed = value; submitted++ }, onOpenDiscover: () => navigation++ }
    : { variant: 'search', searchValue: '', onSearchChange: value => { committed = value }, onSearchSubmit: () => submitted++ }
  const render = () => { cursor = 0; return component(props) }
  const find = (node, type) => {
    if (!node || typeof node !== 'object') return null
    if (node.type === type) return node
    return node.props?.children?.flat(Infinity).map(child => find(child, type)).find(Boolean)
  }
  let tree = render()
  return {
    type(value) { find(tree, 'input').props.onChange({ target: { value } }); tree = render() },
    submit() { let prevented = false; find(tree, 'form').props.onSubmit({ preventDefault() { prevented = true } }); assert.ok(prevented) },
    flush() { for (const fn of [...timers.values()]) fn(); timers.clear() },
    state() { return { committed: committed.trim(), submitted, navigation, pendingTimers: timers.size } },
  }
}
for (const mode of ['home', 'search']) {
  for (const submit of ['Enter', 'Numpad Enter', 'virtual form submit']) {
    test(mode + ': ' + submit + ' uses visible query once, cancels stale debounce', () => {
      const form = formHarness(mode)
      for (const value of ['C', 'Co', 'Cou', 'Coun', 'Country']) form.type(value)
      form.submit()
      assert.equal(form.state().committed, 'Country')
      assert.equal(form.state().submitted, 1)
      assert.equal(form.state().pendingTimers, 0)
      form.flush()
      assert.equal(form.state().committed, 'Country')
      assert.equal(form.state().navigation, mode === 'home' ? 1 : 0)
    })
  }
}
test('Search consumes committed query without a second delayed replay', () => {
  const discover = app.slice(app.indexOf('function DiscoverPage('), app.indexOf('function DiscoverPage(') + 6000)
  assert.match(discover, /const debouncedQuery = textQuery/)
  assert.doesNotMatch(discover, /useDebouncedValue\(textQuery/)
})
test('backend genre order and family candidates are not discarded by client', () => {
  assert.match(app, /const items = result.items/)
  assert.doesNotMatch(app, /genreDefinition.backendValues.includes\(song.genre\)/)
  assert.match(app, /genreDefinition\s*\? remoteSongs/)
})

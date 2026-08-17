import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [about, app, bootstrap, navigation, worlds, htaccess, download] = await Promise.all([
  readFile(new URL('../src/components/about/PublicAboutPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/webBrowserBootstrap.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/webNavigationBridge.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/emotionalWorlds.ts', import.meta.url), 'utf8'),
  readFile(new URL('../deploy/hostinger-root.htaccess', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/download/PublicDownloadPage.tsx', import.meta.url), 'utf8'),
])

const ids = ['calm', 'chill', 'happy', 'romantic', 'motivational', 'melancholy', 'energetic']
for (const id of ids) {
  assert.ok(worlds.includes(`id: '${id}'`), `authoritative world missing: ${id}`)
  assert.ok(bootstrap.includes(`'${id}'`), `browser route allowlist missing: ${id}`)
}
assert.equal((worlds.match(/id: '/g) ?? []).length, ids.length, 'unexpected authoritative World count')
assert.match(about, /EMOTIONAL_WORLDS\.map/)
assert.match(about, /onNavigateRoute\(\{ kind: 'emotional-world', id: world\.id \}\)/)
assert.doesNotMatch(about, /href=\{`\/emotional-worlds/)
for (const misleading of ['Healing', 'Peace', 'Heartbreak', 'Focus', 'Confidence', 'Nostalgia', 'Renewal']) {
  assert.ok(!about.includes(`['${misleading}'`), `misleading World alias remains: ${misleading}`)
}
assert.match(bootstrap, /EMOTIONAL_WORLD_IDS\.has\(id\)/)
assert.match(bootstrap, /page: 'not-found'/)
assert.match(navigation, /'emotional-world'/)
assert.match(app, /selectedWorldId=\{selectedEmotionalWorldId\}/)
assert.match(app, /<PublicDownloadPage onNavigate=\{navigateNav\}/)
assert.match(download, /data-web-information-route="download"/)
assert.match(htaccess, /emotional-worlds\)\/\[\^\/.\]\+/)
assert.match(htaccess, /RewriteRule \^\(\.\*\)\$ staging\/\$1 \[END\]/)

console.log(`PASS about-routes: ${ids.length} canonical Worlds, bridge navigation, Download preservation, branded invalid-route shell`)

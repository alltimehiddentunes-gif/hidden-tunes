import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const source = await readFile(new URL('./deploy-hidden-tunes-web.mjs', import.meta.url), 'utf8')
for (const required of ['--dry-run', '--production', '--rollback', '72.61.152.132', '65002', 'u489896272', '/home/u489896272/domains/hiddentunes.com/public_html', 'catalog-api', 'BatchMode=yes', 'staging-rollback-']) assert.ok(source.includes(required), `missing ${required}`)
for (const required of ['HT_COMMITTED_DESKTOP_DIST', 'resolve(tmpdir())']) assert.ok(source.includes(required), `missing ${required}`)
assert.match(source, /process\.platform === 'win32' && command\.endsWith\('\.cmd'\)/)
for (const forbidden of ['vercel', 'render.com', 'rm -rf', 'git clean', 'git reset', 'git stash', 'wp-config get']) assert.ok(!source.toLowerCase().includes(forbidden), `forbidden ${forbidden}`)
assert.match(source, /grep -q .*catalog-api/)
assert.match(source, /test ! -e .*rollback/)
console.log('direct Website deploy contract: PASS')

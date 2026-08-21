import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFile(join(root, relative), 'utf8')

const REQUIRED_PHRASES = [
  'Privacy Policy',
  'Hidden Tunes',
  'com.hiddentunes.app',
  '21 August 2026',
  'support [at] hiddentunes.com',
  'Supabase Authentication',
  'Follow',
  'Cross Play',
  'playback position',
  'stored on the device',
  'Hostinger',
  'api.hiddentunes.com',
  'admin.hiddentunes.com',
  'YouTube',
  'Audius',
  'Internet Archive',
  'HTTPS',
  'We do not sell personal information',
  'email support [at] hiddentunes.com',
  'Children',
  'more than one country',
  'iOS and Android',
  'Apple',
  'Delete Account under Profile, then Account',
  'recent authentication',
  'account-specific session caches',
]

const [
  policyTs,
  privacyPage,
  privacyCss,
  privacyHtml,
  htaccess,
  app,
  launchGate,
  bootstrap,
  aboutVerify,
  platform404,
] = await Promise.all([
  read('src/legal/privacyPolicyContent.ts'),
  read('src/components/legal/PublicPrivacyPage.tsx'),
  read('src/components/legal/PublicPrivacyPage.css'),
  read('public/privacy.html'),
  read('deploy/hostinger-root.htaccess'),
  read('src/App.tsx'),
  read('src/components/LaunchGate.tsx'),
  read('src/lib/webBrowserBootstrap.ts'),
  read('scripts/verify-about-routes.mjs'),
  read('../../HiddenTunes-Web/platform/404.html'),
])

for (const phrase of REQUIRED_PHRASES) {
  assert.ok(policyTs.includes(phrase), `policy source missing: ${phrase}`)
  assert.ok(privacyHtml.includes(phrase), `static privacy.html missing: ${phrase}`)
}

assert.match(privacyPage, /data-web-information-route="privacy"/)
assert.match(privacyPage, /PRIVACY_POLICY_SECTIONS/)
assert.match(privacyPage, /href="\/privacy"/)
assert.doesNotMatch(privacyPage, /contentEditable|contenteditable/)
assert.doesNotMatch(privacyHtml, /contenteditable/i)
assert.match(privacyHtml, /<!doctype html>/i)
assert.match(privacyHtml, /<article/)
assert.match(privacyHtml, /viewport/)
assert.match(privacyCss, /@media \(max-width: 720px\)/)
assert.match(privacyHtml, /@media \(max-width: 720px\)/)
assert.match(htaccess, /RewriteRule \^privacy\/\?\$ staging\/privacy\.html \[END,NC\]/)
assert.doesNotMatch(htaccess, /privacy\|terms/)
assert.match(htaccess, /RewriteRule \^\(\?:about\|download\|/)
assert.match(htaccess, /RewriteRule \^\(\.\*\)\$ staging\/\$1 \[END\]/)
assert.match(app, /<PublicPrivacyPage onNavigate=\{navigateNav\}/)
assert.match(app, /support@hiddentunes.com/)
assert.match(launchGate, /\/privacy/)
assert.match(bootstrap, /\['\/privacy', \{ kind: 'page', page: 'privacy' \}\]/)
assert.match(privacyHtml, /href="\/"/)
assert.match(privacyHtml, /href="\/about"/)
assert.match(privacyHtml, /href="\/privacy"/)
assert.match(privacyPage, /href="\/privacy"/)
assert.match(aboutVerify, /page: 'not-found'/)
assert.match(platform404, /Page not found/)
assert.ok(!privacyHtml.includes('accounts are not required'), 'stale no-account claim leaked into public policy')
assert.ok(!policyTs.includes('accounts are not required'), 'stale no-account claim leaked into policy source')

console.log('PASS privacy-policy: static HTML, SPA page, Hostinger privacy rewrite, 404 contract preserved')

/**
 * Phase 5: Premium honesty — no invented entitlements, prices, or upgrade paths.
 *
 * Run: node scripts/verify-premium-honesty.mjs
 *   or: npm run verify:premium-honesty
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function readSrc(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

function pass(condition, message) {
  assert.ok(condition, message)
  console.log(`PASS: ${message}`)
}

// Compile-check the TS module via a thin CJS mirror is awkward — assert source + App wiring.
const presentation = readSrc('src/lib/premium/premiumPresentation.ts')
const app = readSrc('src/App.tsx')
const home = readSrc('src/components/home/MusicHomePage.tsx')
const lectures = readSrc('src/components/lectures/LecturesPage.tsx')
const motivationals = readSrc('src/components/motivationals/MotivationalsPage.tsx')

pass(
  /checkoutAvailable:\s*false/.test(presentation),
  'membership checkout is explicitly unavailable',
)
pass(
  /entitlementAuthority:\s*'none'/.test(presentation),
  'no fake entitlement authority',
)
pass(
  /Local profile — no membership/.test(presentation),
  'neutral account status is defined',
)
pass(
  /Not available on this desktop preview/.test(presentation),
  'membership status is honest',
)
pass(
  /Checkout and billing are not connected/.test(presentation),
  'billing status is honest',
)

pass(/DESKTOP_INCLUDED_CAPABILITIES/.test(presentation), 'included capabilities list exists')
pass(/MEMBERSHIP_COMING_SOON/.test(presentation), 'coming-soon membership list exists')
pass(
  /id: 'offline'[\s\S]*status: 'included'/.test(presentation),
  'downloads/offline is included (not falsely coming-soon)',
)
pass(
  /id: 'cinema'[\s\S]*status: 'included'/.test(presentation),
  'player layouts are included (not falsely coming-soon)',
)
pass(
  /id: 'billing'[\s\S]*status: 'coming-soon'/.test(presentation),
  'billing remains coming-soon',
)

pass(!/PREMIUM_PLAN_SPECS/.test(app), 'invented plan specs removed from App')
pass(!/priceLabel/.test(app), 'no price labels in App Premium UI')
pass(!/Best value/.test(app), 'no invented Best value plan badge')
pass(!/psd-premium-plan-cta/.test(app), 'no plan purchase CTAs remain')
pass(!/Go Premium/.test(app), 'sidebar does not say Go Premium')
pass(!/Unlock every world/i.test(app), 'sidebar does not claim Unlock every world')
pass(!/Unlock Every World/.test(app), 'Premium hero does not claim Unlock Every World')
pass(!/Manage in Settings/.test(app), 'no false Manage membership in Settings CTA')
pass(!/Compare plans/.test(app), 'no Compare plans CTA without real plans')
pass(!/Preview pricing/.test(app), 'no preview pricing copy')
pass(!/\$\d/.test(app), 'no invented dollar prices in App')

pass(/Membership (coming soon|purchasing unavailable)/i.test(app), 'sidebar hints membership unavailable honestly')
pass(/Membership preview/.test(app), 'Premium page uses Membership preview heading')
pass(/PREMIUM_MEMBERSHIP\.accountStatusLabel/.test(app), 'sidebar uses canonical account status')
pass(/PREMIUM_MEMBERSHIP\.membershipStatusLabel/.test(app), 'Settings/Premium share membership status')
pass(/PREMIUM_MEMBERSHIP\.billingStatusLabel/.test(app), 'Settings shows billing status')
pass(/View account status/.test(app), 'Premium notice routes to account status, not fake manage')
pass(/DESKTOP_INCLUDED_CAPABILITIES\.map/.test(app), 'Premium page lists included capabilities')
pass(/MEMBERSHIP_COMING_SOON\.map/.test(app), 'Premium page lists coming-soon membership items')
pass(/onNavigateNav\('downloads'\)/.test(app), 'included offline capability can open Downloads')

pass(!/Premium conversations/.test(home), 'Home podcasts hint is not Premium-branded')
pass(/Shows and episodes/.test(home), 'Home podcasts hint is catalogue-honest')
pass(!/Premium courses/.test(lectures), 'Lectures subtitle is not Premium-branded')
pass(!/Premium mindset/.test(motivationals), 'Motivationals subtitle is not Premium-branded')

// No hardcoded isPremium entitlement in renderer sources (narrow check)
const entitlementHits = [
  'isPremium',
  'premiumUser',
  'hasPremium',
  'subscriptionStatus',
  'isEntitled',
].filter((token) => new RegExp(`\\b${token}\\b`).test(app))
pass(entitlementHits.length === 0, 'App does not hardcode Premium entitlement flags')

console.log('\nverify:premium-honesty PASS')

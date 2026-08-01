#!/usr/bin/env node
/**
 * Phase 9 product honesty contract (static).
 * Run: node scripts/verify-phase9-product-honesty.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let passed = 0
let failed = 0

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`PASS: ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel))
}

check('sportsFlags defaults streams off', /VITE_SPORTS_STREAMS_ENABLED',\s*false/.test(read('src/lib/sports/sportsFlags.ts')))
check('dispatch blocks streams-off', /!areSportsStreamsEnabled\(\)/.test(read('src/lib/sports/dispatchSportsPlayback.ts')))
check('Sports page uses canOfferPlay', read('src/components/sports/DesktopSportsPage.tsx').includes('canOfferPlay'))
check('Details hide Play when streams off', /streamsEnabled && fixture\.isPlayable/.test(read('src/components/sports/SportsFixtureDetails.tsx')))
check('Music stub dishonest copy removed', !/Offline downloads are not available on desktop yet/.test(read('src/components/music/MusicSectionContent.tsx')))
check('Music Downloads opens real destination', read('src/components/music/MusicSectionContent.tsx').includes('onOpenDownloads'))
check('MusicWorkspace wires onOpenDownloads', read('src/components/music/MusicWorkspace.tsx').includes('onOpenDownloads'))
check('App MusicPage opens downloads nav', /onOpenDownloads=\{\(\) => onNavigateNav\('downloads'\)\}/.test(read('src/App.tsx')))
check('accountGate exists', exists('src/lib/account/accountGate.ts'))
check('AccountRequiredDialog exists', exists('src/components/account/AccountRequiredDialog.tsx'))
check('App uses AccountRequiredDialog', read('src/App.tsx').includes('AccountRequiredDialog'))
check('Follow uses resolveAccountGate', read('src/App.tsx').includes("resolveAccountGate('follow'"))
check('Auth sign-in available when configured', read('src/App.tsx').includes('signInUiAvailable: authConfigured'))
check('Sidebar not Hidden Listener', !/Hidden Listener/.test(read('src/App.tsx')))
check('Sidebar membership purchasing unavailable', /Membership purchasing unavailable/.test(read('src/App.tsx')))
check('Fake accent glow slider removed', !/Accent glow intensity/.test(read('src/App.tsx')))
check('Settings updates not available', /Automatic updates are not configured/.test(read('src/App.tsx')))
check('Notifications not “coming soon”', !/Notifications coming soon/.test(read('src/components/music/GlobalTopNav.tsx')))
check('Premium checkout still unavailable', /checkoutAvailable:\s*false/.test(read('src/lib/premium/premiumPresentation.ts')))
check('Playback provider file unchanged ownership', /DesktopPlaybackProvider/.test(read('src/context/DesktopPlaybackProvider.tsx')))

console.log(`\nPhase 9 honesty: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

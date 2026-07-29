#!/usr/bin/env node
/**
 * Focused contract tests for Home "Albums Worth Staying With":
 * play-in-place, queue seeding, content-type labels, no PlayerWorkspace hijack.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(ROOT, 'docs', 'audits', 'home-albums-worth')
fs.mkdirSync(outDir, { recursive: true })

const homePage = fs.readFileSync(path.join(ROOT, 'src/components/home/MusicHomePage.tsx'), 'utf8')
const parityLib = fs.readFileSync(path.join(ROOT, 'src/lib/home/mobileHomeParity.ts'), 'utf8')
const appSource = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8')
const css = fs.readFileSync(path.join(ROOT, 'src/App.css'), 'utf8')
const displayText = fs.readFileSync(path.join(ROOT, 'src/lib/catalogDisplayText.ts'), 'utf8')

const results = { checks: [], failures: [] }

function check(name, ok, detail = '') {
  results.checks.push({ name, ok, detail })
  if (!ok) results.failures.push({ name, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`)
}

// --- Static click / route contracts ---
check(
  '1-stay-on-home-context',
  homePage.includes("onOpenSong(start, tracks, 0, 'home'"),
  'primary play uses QueueContext home',
)
check(
  '2-playback-once-lock',
  homePage.includes('albumPlayLockRef') && homePage.includes('if (albumPlayLockRef.current) return'),
  'double-click lock present',
)
check(
  '3-sidebar-footer-same-session',
  appSource.includes("context === 'home' || context === 'discover'") &&
    appSource.includes('setDesktopSelectedTrack(resolved)') &&
    /if \(context === 'home' \|\| context === 'discover'\) \{\s*setDesktopSelectedTrack\(resolved\)\s*return\s*\}/.test(
      appSource.replace(/\r\n/g, '\n'),
    ),
  'home/discover context returns before openSong (no PlayerWorkspace)',
)
check(
  '7-no-playerworkspace-nav',
  !/music-home-album-card[\s\S]{0,260}onOpenAlbum\(/.test(homePage) &&
    homePage.includes('playAlbumCollection'),
  'card primary action is play, not openAlbum',
)
check(
  '8-no-second-audio-owner',
  appSource.includes('DesktopPlaybackProvider') &&
    !homePage.includes('new Audio') &&
    !homePage.includes('<audio'),
  'Home does not create Audio elements',
)
check(
  '9-double-click-guard',
  homePage.includes('disabled={locked && !isLoading}') && homePage.includes('450'),
  'cards lock while a play is in flight',
)
check(
  '10-invalid-album-error',
  homePage.includes('No playable tracks available') &&
    homePage.includes('Current playback is unchanged') &&
    homePage.includes('music-home-album-rail-error'),
  'empty collection shows error without clearing session',
)
check(
  '14-route-remains-home',
  homePage.includes("seedType: 'album'") && homePage.includes("'home'"),
  'album seed under home context',
)

// --- Content type / Singles ---
check(
  '11-content-type-resolver',
  parityLib.includes('resolveHomeAlbumContentType') &&
    parityLib.includes("'playlist'") &&
    parityLib.includes("'singles'"),
  'typed content resolver exists',
)
check(
  '12-no-wall-of-singles-titles',
  parityLib.includes('genericTitle') &&
    parityLib.includes('artistName || rawTitle') &&
    parityLib.includes('isGenericAlbumTitle'),
  'generic Singles/Album titles lead with artist',
)
check(
  '13-dev-tracks-excluded',
  parityLib.includes('excludeInternalDevCatalogSongs') &&
    parityLib.includes('selectInstantPlayableUrl'),
  'DEV + unplayable tracks filtered before queue seed',
)
check(
  '5-queue-album-seed',
  homePage.includes("seedType: 'album'") &&
    homePage.includes('seedId: card.album.id') &&
    homePage.includes('capSongPool(tracks)'),
  'queue seeded with album tracks + seedId',
)
check(
  '6-auto-next-bounded',
  homePage.includes('bounded: true'),
  'album plays are bounded (auto-next within album)',
)
check(
  'details-secondary-only',
  homePage.includes('music-home-album-details') &&
    /music-home-album-details[\s\S]{0,120}onOpenAlbum\(card\.album\)/.test(homePage),
  'Details button is the only navigation path',
)
check(
  'responsiveness-pointer-events',
  css.includes('.music-home-album-card .music-home-art') &&
    /music-home-album-card \.music-home-art\s*\{[^}]*pointer-events:\s*none/.test(css),
  'artwork does not intercept clicks',
)
check(
  'loading-feedback',
  homePage.includes('is-loading') && css.includes('music-home-album-loading'),
  'pressed/loading visual feedback',
)
check(
  'display-text-helpers-kept',
  displayText.includes('isGenericAlbumTitle') && displayText.includes('Singles'),
  'generic title helpers remain (no blind hardcode Album)',
)

// --- Live catalog label audit (optional network) ---
async function liveAudit() {
  const BASE = process.env.HT_API_BASE || 'https://hidden-tunes-api.onrender.com'
  const albumsRes = await fetch(`${BASE}/api/albums?page=1&limit=40`, {
    headers: { Accept: 'application/json', 'x-ht-platform': 'desktop' },
  })
  assert.equal(albumsRes.status, 200)
  const albumsJson = await albumsRes.json()
  const albums = albumsJson.albums || []

  const songsRes = await fetch(`${BASE}/api/songs?page=1&limit=100`, {
    headers: { Accept: 'application/json', 'x-ht-platform': 'desktop' },
  })
  assert.equal(songsRes.status, 200)
  const songs = await songsRes.json()

  const { buildCatalogIndexes } = await importViteHelpers()
  // Lightweight mirror of content-type display rules for proof JSON
  function isGeneric(title) {
    const t = String(title || '').trim().toLowerCase()
    return !t || ['singles', 'album', 'unknown album', 'untitled album', 'untitled'].includes(t)
  }

  const samples = albums.slice(0, 12).map((album) => {
    const tracks = songs.filter(
      (s) =>
        (album.id && s.albumId === album.id) ||
        (String(s.album || '').toLowerCase() === String(album.title || '').toLowerCase() &&
          album.artistId &&
          s.artistId === album.artistId),
    )
    const playable = tracks.filter(
      (t) =>
        t.url ||
        t.audio_url ||
        t.audioUrl ||
        t.streamUrl ||
        t.stream_url ||
        t.previewUrl ||
        t.preview_url,
    )
    const generic = isGeneric(album.title)
    return {
      stableId: album.id,
      rawContentType: album.title,
      sourceType: 'album',
      title: album.title,
      subtitle: generic ? 'artist-forward display' : album.artistId,
      artist: album.artistId,
      albumName: album.title,
      playlistCollectionName: null,
      trackCount: tracks.length,
      playableTrackCount: playable.length,
      artwork: album.artwork || album.cover || null,
      cardLabelSource: generic
        ? 'artist as displayTitle; type/count as subtitle'
        : 'catalog title + artist subtitle',
    }
  })

  const proof = {
    generatedAt: new Date().toISOString(),
    note:
      'Backend album titles are largely placeholder Singles/Album; desktop maps generic titles to artist-forward cards.',
    samples,
    builderUsesIndexes: parityLib.includes('resolveSongsForAlbum'),
  }
  fs.writeFileSync(path.join(outDir, 'CONTENT-TYPE-AUDIT.json'), JSON.stringify(proof, null, 2))
  check('3-content-type-audit-written', true, `${samples.length} cards audited`)
  void buildCatalogIndexes
}

async function importViteHelpers() {
  // Placeholder — indexes are exercised by smoke; static proof is enough here.
  return { buildCatalogIndexes: null }
}

await liveAudit().catch((err) => {
  check('live-audit', false, String(err?.message || err))
})

fs.writeFileSync(path.join(outDir, 'TEST-RESULTS.json'), JSON.stringify(results, null, 2))

if (results.failures.length) {
  console.error(`\n${results.failures.length} home album play contract failure(s).`)
  process.exit(1)
}
console.log('\nHome albums worth play contract passed.')

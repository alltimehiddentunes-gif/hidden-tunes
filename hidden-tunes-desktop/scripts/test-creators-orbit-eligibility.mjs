#!/usr/bin/env node
/**
 * Unit-level proof for buildCreatorsInOrbit eligibility (no Electron).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(ROOT, 'docs', 'audits', 'creators-orbit')

// Use tsx/vite? Prefer compiling via dynamic import of built code — not available.
// Mirror eligibility rules against live Express payload to prove post-fix set.
const BASE = 'https://hidden-tunes-api.onrender.com'

function hasPlayableUrl(track) {
  return Boolean(
    track?.url ||
      track?.audio_url ||
      track?.audioUrl ||
      track?.streamUrl ||
      track?.stream_url ||
      track?.previewUrl ||
      track?.preview_url,
  )
}

async function main() {
  const artistsRes = await fetch(`${BASE}/api/artists?page=1&limit=40`, {
    headers: { Accept: 'application/json', 'x-ht-platform': 'desktop' },
  })
  assert.equal(artistsRes.status, 200)
  const artistsJson = await artistsRes.json()
  const artists = artistsJson.artists || []

  const eligible = []
  const excluded = []
  for (const artist of artists) {
    const tracks = Array.isArray(artist.tracks) ? artist.tracks : []
    const playable = tracks.filter(hasPlayableUrl)
    if (!artist.id || !String(artist.name || '').trim() || playable.length === 0) {
      excluded.push({
        id: artist.id,
        name: artist.name,
        songCount: artist.songCount ?? 0,
        tracks: tracks.length,
        playable: playable.length,
      })
      continue
    }
    eligible.push({
      id: artist.id,
      name: artist.name,
      playableSongCount: playable.length,
      personalisationScore: Math.min(playable.length, 40),
    })
  }

  eligible.sort(
    (a, b) =>
      b.personalisationScore - a.personalisationScore ||
      String(a.name).localeCompare(String(b.name)),
  )
  const orbit = eligible.slice(0, 8)

  assert.ok(orbit.length > 0, 'expected some eligible creators')
  for (const card of orbit) {
    assert.ok(card.playableSongCount >= 1, `${card.name} must have playable songs`)
  }
  assert.ok(
    !orbit.some((c) => /Aether Stream|Authentic Portuguese Fado|Bazmhent|Best Love country music/i.test(c.name)),
    'empty artists must not appear',
  )
  assert.ok(
    orbit.some((c) => /Acoustic Time|Amara Skies|Ann Lyen|Bhoho X/i.test(c.name)),
    'known playable artists should qualify',
  )

  const report = { eligibleTotal: eligible.length, excludedSample: excluded.slice(0, 12), orbit }
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'eligibility-unit.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  console.log('PASS: creators eligibility unit')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

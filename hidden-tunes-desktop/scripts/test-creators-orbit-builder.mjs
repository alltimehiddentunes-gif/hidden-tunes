#!/usr/bin/env node
/**
 * Bundle + unit-test buildCreatorsInOrbit against live Express artists payload.
 */
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(ROOT, 'docs', 'audits', 'creators-orbit')
const bundlePath = path.join(outDir, '_parity-bundle.mjs')

execSync(
  `npx esbuild src/lib/home/mobileHomeParity.ts --bundle --platform=neutral --format=esm --outfile=${JSON.stringify(bundlePath)} --log-level=error --define:import.meta.env.DEV=false`,
  { cwd: ROOT, stdio: 'inherit' },
)

const parity = await import(`file://${bundlePath.replace(/\\/g, '/')}?t=${Date.now()}`)
const { buildCreatorsInOrbit } = parity

function normalizeSong(track, artist) {
  return {
    id: String(track.id),
    title: String(track.title || 'Untitled'),
    artist: String(track.artist || artist.name || ''),
    artistId: track.artistId || track.artist_id || artist.id,
    album: String(track.album || ''),
    albumId: track.albumId || track.album_id || null,
    genre: track.genre || null,
    mood: track.mood || null,
    tags: [],
    description: null,
    artwork: track.artwork || track.cover || null,
    previewUrl: track.previewUrl || track.preview_url || null,
    audioUrl: track.audioUrl || track.audio_url || track.url || track.streamUrl || null,
    highQualityUrl: track.highQualityUrl || null,
    audioVersions: null,
    durationSeconds: track.duration_seconds || track.duration || null,
    createdAt: track.created_at || null,
  }
}

const base = 'https://hidden-tunes-api.onrender.com'
const artistsJson = await (
  await fetch(`${base}/api/artists?page=1&limit=40`, {
    headers: { Accept: 'application/json', 'x-ht-platform': 'desktop' },
  })
).json()
const rawArtists = artistsJson.artists || []

const artists = rawArtists.map((a) => ({
  id: String(a.id),
  name: String(a.name || ''),
  artwork: a.artwork || a.image_url || null,
  songCount: a.songCount ?? 0,
  tracks: (Array.isArray(a.tracks) ? a.tracks : []).map((t) => normalizeSong(t, a)),
}))

const indexes = {
  songsById: new Map(),
  songsByArtistId: new Map(),
  songsByArtistName: new Map(),
}

const empty = buildCreatorsInOrbit([], indexes, [], 8)
assert.equal(empty.length, 0, 'empty artists → empty section input')

const orbit = buildCreatorsInOrbit(artists, indexes, [], 8)
assert.ok(orbit.length > 0, 'expected eligible creators')
for (const card of orbit) {
  assert.ok(card.playableSongCount >= 1, `${card.artist.name} playable`)
  assert.ok(card.artist.id)
  assert.ok(card.artist.name.trim())
}
assert.ok(
  !orbit.some((c) =>
    /Aether Stream|Authentic Portuguese Fado|Bazmhent|Best Love country music/i.test(c.artist.name),
  ),
  'empty artists excluded',
)
assert.ok(
  orbit.some((c) => /Acoustic Time|Amara Skies|Ann Lyen|Bhoho X/i.test(c.artist.name)),
  'known playable artists included',
)

const report = {
  emptyLen: empty.length,
  orbit: orbit.map((c) => ({
    id: c.artist.id,
    name: c.artist.name,
    playableSongCount: c.playableSongCount,
    personalisationScore: c.personalisationScore,
  })),
}
fs.writeFileSync(path.join(outDir, 'builder-unit.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
console.log('PASS: buildCreatorsInOrbit unit')

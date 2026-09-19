#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'docs', 'audits', 'production-music-relationships.json')
const BASE = (process.env.HT_API_BASE || 'https://api.hiddentunes.com').replace(/\/$/, '')
const HEADERS = { Accept: 'application/json', 'x-ht-platform': 'desktop' }

async function getJson(pathname) {
  const response = await fetch(`${BASE}${pathname}`, { headers: HEADERS })
  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()
  assert.equal(response.status, 200, `${pathname} status ${response.status}`)
  assert.match(contentType, /application\/json/i, `${pathname} must return JSON`)
  return { json: JSON.parse(text), status: response.status, contentType }
}

function list(payload, key) {
  if (Array.isArray(payload)) return payload
  return Array.isArray(payload?.[key]) ? payload[key] : []
}

function playable(song) {
  return Boolean(song?.url || song?.audio_url || song?.audioUrl || song?.streamUrl || song?.stream_url || song?.previewUrl || song?.preview_url)
}

function norm(value) {
  return String(value || '').trim().toLocaleLowerCase().normalize('NFKC')
}

const health = await getJson('/health')
const artistResponse = await getJson('/api/artists?page=1&limit=40')
const albumResponse = await getJson('/api/albums?page=1&limit=40')
const artists = list(artistResponse.json, 'artists')
const albums = list(albumResponse.json, 'albums')
const songs = []
for (let page = 1; page <= 100; page += 1) {
  const response = await getJson(`/api/songs?page=${page}&limit=100`)
  const rows = list(response.json, 'songs')
  songs.push(...rows)
  if (rows.length < 100) break
}

const playableSongs = songs.filter(playable)
const artistAudit = artists.slice(0, 20).map((artist) => {
  const resolved = playableSongs.filter((song) =>
    (artist.id && (song.artistId === artist.id || song.artist_id === artist.id))
    || norm(song.artist || song.artist_name) === norm(artist.name),
  )
  const expected = Number(artist.songCount || 0)
  return {
    id: artist.id,
    name: artist.name,
    expectedSongCount: expected,
    resolvedPlayableSongs: new Set(resolved.map((song) => song.id)).size,
    falseZero: expected > 0 && resolved.length === 0,
  }
})

const albumAudit = albums.slice(0, 20).map((album) => {
  const resolved = playableSongs.filter((song) => {
    const songAlbumId = song.albumId || song.album_id
    if (album.id && songAlbumId) return songAlbumId === album.id
    if (norm(song.album || song.album_title) !== norm(album.title)) return false
    const songArtistId = song.artistId || song.artist_id
    return Boolean(album.artistId && songArtistId && album.artistId === songArtistId)
  })
  return {
    id: album.id,
    title: album.title,
    artistId: album.artistId,
    resolvedPlayableTracks: new Set(resolved.map((song) => song.id)).size,
    falseZero: resolved.length === 0,
  }
})

async function probeAudio(song) {
  const url = song.url || song.audio_url || song.audioUrl || song.streamUrl || song.stream_url || song.previewUrl || song.preview_url
  const response = await fetch(url, { headers: { Range: 'bytes=0-1' } })
  return { id: song.id, title: song.title, status: response.status, contentType: response.headers.get('content-type'), ok: response.status === 200 || response.status === 206 }
}

const playback = []
for (const song of playableSongs.slice(0, 5)) playback.push(await probeAudio(song))

const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  deploymentHost: new URL(BASE).hostname,
  health: { status: health.status, contentType: health.contentType, body: health.json },
  catalog: { artistsFetched: artists.length, albumsFetched: albums.length, songsFetched: songs.length, playableSongs: playableSongs.length },
  artistAudit,
  albumAudit,
  artistFalseZeroCount: artistAudit.filter((row) => row.falseZero).length,
  albumFalseZeroCount: albumAudit.filter((row) => row.falseZero).length,
  playback,
  htmlApiResponses: 0,
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
assert.equal(report.artistFalseZeroCount, 0, 'false-zero artists')
assert.equal(report.albumFalseZeroCount, 0, 'false-zero albums')
assert.ok(playback.length === 5 && playback.every((row) => row.ok), 'five media probes')
console.log('PASS: production Artist/Album relationship audit')

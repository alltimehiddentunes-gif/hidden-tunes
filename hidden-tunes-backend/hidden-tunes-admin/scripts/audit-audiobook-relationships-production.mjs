#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'reports', 'audiobook-relationship-audit.json')
const BASE = (process.env.AUDIOBOOK_VERIFY_BASE_URL || 'https://admin.hiddentunes.com').replace(/\/$/, '')

async function json(pathname) {
  const response = await fetch(`${BASE}${pathname}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) })
  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()
  return { status: response.status, contentType, body: contentType.includes('application/json') ? JSON.parse(text) : null, bodyType: contentType.includes('application/json') ? 'json' : 'non-json' }
}

const browse = await json('/api/audiobooks?limit=20&page=1')
assert.equal(browse.status, 200)
assert.equal(browse.bodyType, 'json')
const books = browse.body?.items || browse.body?.audiobooks || []
const rows = []

for (const book of books.slice(0, 20)) {
  const detail = await json(`/api/audiobooks/${encodeURIComponent(book.id)}?chapter_limit=100`)
  const chapters = detail.body?.chapters || []
  const playable = []
  const rejected = []
  for (const chapter of chapters) {
    const play = await json(`/api/audiobooks/${encodeURIComponent(book.id)}/chapters/play?from=${encodeURIComponent(chapter.id)}`)
    const queue = play.body?.chapters || []
    if (play.status === 200 && queue.length > 0 && queue[0]?.audio_url) playable.push(chapter.id)
    else rejected.push({ chapterId: chapter.id, status: play.status, error: play.body?.error || 'unavailable' })
  }
  rows.push({
    bookId: book.id,
    title: book.title,
    sourceId: book.source_id || null,
    expectedChapters: Number(book.chapter_count || 0),
    resolvedChapters: chapters.length,
    playableChapters: playable.length,
    rejected: rejected.length,
    reason: detail.status !== 200 ? `detail_status_${detail.status}` : Number(book.chapter_count || 0) > 0 && chapters.length === 0 ? 'chapter_count_without_relationship_rows' : rejected.length ? 'chapter_files_unavailable' : null,
  })
}

const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  audited: rows.length,
  falseZeroBooks: rows.filter((row) => row.expectedChapters > 0 && row.resolvedChapters === 0).length,
  playableBooks: rows.filter((row) => row.playableChapters > 0).length,
  rows,
}
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))

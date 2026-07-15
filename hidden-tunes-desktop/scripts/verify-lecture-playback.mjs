#!/usr/bin/env node
/**
 * Verifies lectures catalog browse + lesson play resolution against production admin API.
 * Run: npm run verify:lecture-play
 */
const API_BASE = process.env.HT_LECTURE_API_BASE ?? 'https://admin.hiddentunes.com'

async function fetchJson(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${path}`)
  }
  return response.json()
}

async function probeMedia(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1' },
      signal: controller.signal,
      redirect: 'follow',
    })
    return {
      ok: response.ok || response.status === 206,
      status: response.status,
      contentType: response.headers.get('content-type'),
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: null,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function main() {
  console.log('[ht-lecture-verify] fetching categories…')
  const categoriesPayload = await fetchJson('/api/lectures/categories')
  const categories = Array.isArray(categoriesPayload.categories)
    ? categoriesPayload.categories
    : []
  if (categories.length === 0) {
    throw new Error('No lecture categories returned')
  }

  const slug = String(categories[0].slug ?? '').trim()
  if (!slug) throw new Error('First lecture category missing slug')

  console.log(`[ht-lecture-verify] browsing category "${slug}"…`)
  const browse = await fetchJson(`/api/lectures/category/${encodeURIComponent(slug)}?limit=5`)
  const lectures = Array.isArray(browse.lectures) ? browse.lectures : []
  if (lectures.length === 0) {
    throw new Error(`No lectures in category ${slug}`)
  }

  const series = lectures[0]
  const seriesId = String(series.id ?? '').trim()
  const seriesTitle = String(series.title ?? seriesId)
  if (!seriesId) throw new Error('Lecture series missing id')

  console.log(`[ht-lecture-verify] loading series detail "${seriesTitle}"…`)
  const detail = await fetchJson(`/api/lectures/items/${encodeURIComponent(seriesId)}?limit=5`)
  const lessons = Array.isArray(detail.lessons) ? detail.lessons : []
  if (lessons.length === 0) {
    throw new Error(`No lessons for series ${seriesId}`)
  }

  const lesson = lessons[0]
  const lessonId = String(lesson.id ?? '').trim()
  if (!lessonId) throw new Error('Lesson missing id')

  console.log(`[ht-lecture-verify] resolving play for lesson ${lessonId}…`)
  const play = await fetchJson(
    `/api/lectures/items/${encodeURIComponent(seriesId)}/play?lessonId=${encodeURIComponent(lessonId)}`,
  )
  const playableUrl = typeof play.playableUrl === 'string' ? play.playableUrl.trim() : ''
  if (!playableUrl.startsWith('http')) {
    throw new Error('Play resolver returned no playableUrl')
  }

  console.log('[ht-lecture-verify] probing media bytes…')
  const media = await probeMedia(playableUrl)
  if (!media.ok) {
    throw new Error(
      `Media probe failed (status=${media.status}). ${media.error ?? ''}`.trim(),
    )
  }

  console.log('[PASS] Lecture browse → detail → play')
  console.log(`  category: ${slug}`)
  console.log(`  series: ${seriesId}`)
  console.log(`  lesson: ${lessonId}`)
  console.log(`  playableUrl: ${playableUrl.slice(0, 96)}…`)
  console.log(`  media status: ${media.status}`)
  console.log(`  content-type: ${media.contentType ?? 'unknown'}`)
  console.log('[ht-lecture-verify] all checks passed')
}

main().catch((error) => {
  console.error('[ht-lecture-verify] FAIL:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})

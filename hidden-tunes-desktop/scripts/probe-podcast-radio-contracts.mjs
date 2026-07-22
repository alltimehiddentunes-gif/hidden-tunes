#!/usr/bin/env node
/**
 * Production contract probe for desktop Podcast + Radio catalog paths.
 * Does not mutate backend data. Run from hidden-tunes-desktop:
 *   node scripts/probe-podcast-radio-contracts.mjs
 */
const BASE = process.env.HT_CATALOG_BASE || 'https://admin.hiddentunes.com'

const rows = []

function record(row) {
  rows.push(row)
  const mark = row.ok ? 'PASS' : 'FAIL'
  console.log(
    `${mark} ${row.status ?? '—'} ${row.ms}ms ${row.label} count=${row.count ?? '—'} ${row.note || ''}`,
  )
}

async function probe(label, path, assert) {
  const url = `${BASE}${path}`
  const t0 = Date.now()
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    const ms = Date.now() - t0
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    const result = {
      label,
      path,
      status: res.status,
      ms,
      ok: res.ok,
      count: null,
      note: '',
      playable: null,
      delivery: null,
      pagination: json?.pagination ?? null,
    }
    if (typeof assert === 'function') {
      assert(result, json, text)
    }
    record(result)
    return { result, json }
  } catch (error) {
    record({
      label,
      path,
      status: null,
      ms: Date.now() - t0,
      ok: false,
      count: null,
      note: error instanceof Error ? error.message : String(error),
    })
    return { result: null, json: null }
  }
}

function countArray(json, key) {
  return Array.isArray(json?.[key]) ? json[key].length : 0
}

async function main() {
  console.log(`Base: ${BASE}`)
  console.log('--- Podcasts ---')

  await probe('pod-categories', '/api/podcasts/categories', (r, j) => {
    r.count = countArray(j, 'categories')
    r.ok = r.status === 200 && r.count > 0
  })

  await probe('pod-featured', '/api/podcasts/featured?page=1&limit=12', (r, j) => {
    r.count = countArray(j, 'shows')
    r.note = `total=${j?.pagination?.total ?? '?'}`
    // Featured may be empty in production — desktop falls back to shows.
    r.ok = r.status === 200
  })

  await probe('pod-shows', '/api/podcasts/shows?page=1&limit=24', (r, j) => {
    r.count = countArray(j, 'shows')
    r.ok = r.status === 200 && r.count > 0
    r.note = `total=${j?.pagination?.total ?? '?'}`
  })

  await probe('pod-search-jazz', '/api/podcasts/shows?page=1&limit=24&q=jazz', (r, j) => {
    r.count = countArray(j, 'shows')
    r.ok = r.status === 200 && r.count > 0
  })

  await probe(
    'pod-search-empty',
    '/api/podcasts/shows?page=1&limit=24&q=zzzxnotfound999',
    (r, j) => {
      r.count = countArray(j, 'shows')
      r.ok = r.status === 200 && r.count === 0
    },
  )

  await probe(
    'pod-episodes-unscoped (must stay avoided by desktop)',
    '/api/podcasts/episodes?page=1&limit=8',
    (r, j) => {
      r.count = countArray(j, 'episodes')
      r.ok = r.status === 500
      r.note = j?.details || j?.error || 'expected production 500'
    },
  )

  await probe(
    'pod-episodes-q (must stay avoided by desktop)',
    '/api/podcasts/episodes?page=1&limit=8&q=jazz',
    (r, j) => {
      r.count = countArray(j, 'episodes')
      r.ok = r.status === 500
      r.note = j?.details || j?.error || 'expected production 500'
    },
  )

  await probe(
    'pod-episodes-category',
    '/api/podcasts/episodes?page=1&limit=8&category=music',
    (r, j) => {
      r.count = countArray(j, 'episodes')
      r.ok = r.status === 200 && r.count > 0
    },
  )

  const showProbe = await probe(
    'pod-show-detail',
    '/api/podcasts/shows?page=1&limit=1',
    (r, j) => {
      r.count = countArray(j, 'shows')
      r.ok = r.status === 200 && r.count === 1
    },
  )
  const showId = showProbe.json?.shows?.[0]?.id
  if (showId) {
    await probe(`pod-episodes-by-show`, `/api/podcasts/episodes?show_id=${showId}&page=1&limit=5`, (r, j) => {
      r.count = countArray(j, 'episodes')
      r.ok = r.status === 200 && r.count > 0
    })
    const eps = await probe(
      'pod-episode-play',
      `/api/podcasts/episodes?show_id=${showId}&page=1&limit=1`,
      (r, j) => {
        r.count = countArray(j, 'episodes')
        r.ok = r.status === 200
      },
    )
    const epId = eps.json?.episodes?.[0]?.id
    if (epId) {
      await probe(`pod-play`, `/api/podcasts/episodes/${epId}/play`, (r, j) => {
        const url = typeof j?.audio_url === 'string' ? j.audio_url : ''
        r.playable = url.startsWith('http')
        r.ok = r.status === 200 && r.playable
        r.note = url.slice(0, 64)
      })
    }
  }

  await probe(
    'pod-invalid-show',
    '/api/podcasts/shows/00000000-0000-0000-0000-000000000000',
    (r) => {
      r.ok = r.status === 404
    },
  )

  console.log('--- Radio ---')

  await probe('rad-browse', '/api/radio/stations?page=1&limit=32', (r, j) => {
    r.count = countArray(j, 'stations')
    r.ok = r.status === 200 && r.count > 0
    r.note = `total=${j?.pagination?.total ?? '?'}`
  })

  await probe('rad-page2', '/api/radio/stations?page=2&limit=32', (r, j) => {
    r.count = countArray(j, 'stations')
    r.ok = r.status === 200 && r.count > 0
  })

  await probe('rad-search-bbc', '/api/radio/stations?q=bbc&page=1&limit=40', (r, j) => {
    r.count = countArray(j, 'stations')
    r.ok = r.status === 200 && r.count > 0
  })

  await probe(
    'rad-search-empty',
    '/api/radio/stations?q=zzzxnotfound999&page=1&limit=40',
    (r, j) => {
      r.count = countArray(j, 'stations')
      r.ok = r.status === 200 && r.count === 0
    },
  )

  const sex = await probe(
    'rad-sex-sound',
    '/api/radio/stations?q=Sex%20Sound%20Radio&page=1&limit=5',
    (r, j) => {
      const station = j?.stations?.[0]
      r.count = countArray(j, 'stations')
      r.ok = r.status === 200 && r.count === 1 && station?.is_mature === true
      r.note = `name=${station?.name} mature=${station?.is_mature} rating=${station?.content_rating}`
    },
  )
  const sexId = sex.json?.stations?.[0]?.id
  if (sexId) {
    await probe(`rad-sex-play`, `/api/radio/stations/${sexId}/play`, (r, j) => {
      const url = typeof j?.stream_url === 'string' ? j.stream_url : ''
      r.delivery = j?.delivery ?? null
      r.playable = url.startsWith('http')
      r.ok = r.status === 200 && r.playable
      r.note = `delivery=${r.delivery} ${url.slice(0, 80)}`
    })
  }

  const browse = await probe('rad-play-sample', '/api/radio/stations?page=1&limit=3', (r, j) => {
    r.count = countArray(j, 'stations')
    r.ok = r.status === 200
  })
  for (const station of browse.json?.stations ?? []) {
    await probe(`rad-play:${station.name}`, `/api/radio/stations/${station.id}/play`, (r, j) => {
      const url = typeof j?.stream_url === 'string' ? j.stream_url : ''
      r.delivery = j?.delivery ?? null
      r.playable = url.startsWith('https')
      r.ok = r.status === 200 && r.playable
      r.note = `delivery=${r.delivery}`
    })
  }

  await probe(
    'rad-dead-play',
    '/api/radio/stations/00000000-0000-0000-0000-000000000000/play',
    (r) => {
      r.ok = r.status === 404 || r.status === 400
    },
  )

  const failed = rows.filter((row) => !row.ok)
  console.log(`\n${rows.length - failed.length}/${rows.length} probes met expectations`)
  if (failed.length) {
    console.error('Unexpected failures:')
    for (const row of failed) console.error(` - ${row.label}: ${row.status} ${row.note}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

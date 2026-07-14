import assert from 'node:assert/strict'
import {
  getPodcastLocalSnapshot,
  subscribePodcastLocalState,
  upsertPodcastProgress,
  type PodcastProgressEntry,
} from '../src/lib/podcasts/podcastProgressStorage'

const storage = new Map<string, string>()

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem(key: string) {
      return storage.get(key) ?? null
    },
    setItem(key: string, value: string) {
      storage.set(key, value)
    },
    removeItem(key: string) {
      storage.delete(key)
    },
    clear() {
      storage.clear()
    },
  },
})

function makeEntry(
  episodeId: string,
  positionSeconds: number,
): PodcastProgressEntry {
  const now = '2026-07-14T12:00:00.000Z'
  return {
    episodeId,
    showId: 'show-1',
    episodeTitle: `Episode ${episodeId}`,
    showTitle: 'Test Show',
    artworkUrl: null,
    positionSeconds,
    durationSeconds: 3600,
    publishedAt: now,
    episodeNumber: 1,
    seasonNumber: 1,
    lastPlayedAt: now,
    updatedAt: now,
    completed: false,
  }
}

function main() {
  const first = getPodcastLocalSnapshot()
  const second = getPodcastLocalSnapshot()
  assert.equal(first, second, 'snapshot reference must stay stable across reads')

  let notifications = 0
  const unsubscribe = subscribePodcastLocalState(() => {
    notifications += 1
  })

  upsertPodcastProgress(makeEntry('episode-a', 45))
  const afterWrite = getPodcastLocalSnapshot()
  assert.notEqual(first, afterWrite, 'snapshot should change after a material write')
  assert.equal(notifications, 1, 'listeners should be notified once for a material write')

  upsertPodcastProgress(makeEntry('episode-a', 45))
  assert.equal(
    getPodcastLocalSnapshot(),
    afterWrite,
    'duplicate progress writes must not create a new snapshot',
  )
  assert.equal(notifications, 1, 'duplicate progress writes must not notify listeners')

  unsubscribe()
  console.log('podcast local state snapshot test ok')
}

main()

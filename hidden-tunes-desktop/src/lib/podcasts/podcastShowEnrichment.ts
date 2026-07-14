import { fetchPodcastShow } from './podcastCatalogApi'
import type { PodcastEpisodeMeta, PodcastShowMeta } from './types'

const MAX_MISSING_SHOW_FETCHES = 8
const SHOW_FETCH_CONCURRENCY = 3

function buildShowTitleMap(shows: PodcastShowMeta[]) {
  const map = new Map<string, string>()
  for (const show of shows) {
    if (show.id && show.title) {
      map.set(show.id, show.title)
    }
  }
  return map
}

async function fetchMissingShows(
  showIds: string[],
  signal?: AbortSignal,
): Promise<PodcastShowMeta[]> {
  const results: PodcastShowMeta[] = []
  let index = 0

  async function worker() {
    while (index < showIds.length) {
      if (signal?.aborted) return
      const showId = showIds[index]
      index += 1
      try {
        const response = await fetchPodcastShow(showId, signal)
        results.push(response.show)
      } catch {
        // Skip unavailable show metadata — episode title still renders.
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(SHOW_FETCH_CONCURRENCY, showIds.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

export async function enrichPodcastEpisodesWithShowTitles(
  episodes: PodcastEpisodeMeta[],
  knownShows: PodcastShowMeta[],
  signal?: AbortSignal,
): Promise<PodcastEpisodeMeta[]> {
  if (episodes.length === 0) return episodes

  const titleByShowId = buildShowTitleMap(knownShows)

  const missingShowIds = Array.from(
    new Set(
      episodes
        .filter((episode) => episode.showId && !episode.showTitle && !titleByShowId.has(episode.showId))
        .map((episode) => episode.showId),
    ),
  ).slice(0, MAX_MISSING_SHOW_FETCHES)

  if (missingShowIds.length > 0 && !signal?.aborted) {
    const fetchedShows = await fetchMissingShows(missingShowIds, signal)
    for (const show of fetchedShows) {
      titleByShowId.set(show.id, show.title)
    }
    knownShows = [...knownShows, ...fetchedShows]
  }

  return episodes.map((episode) => ({
    ...episode,
    showTitle: episode.showTitle ?? titleByShowId.get(episode.showId) ?? null,
  }))
}

export function mergePodcastShowMaps(...groups: PodcastShowMeta[][]) {
  const map = new Map<string, PodcastShowMeta>()
  for (const group of groups) {
    for (const show of group) {
      map.set(show.id, show)
    }
  }
  return map
}

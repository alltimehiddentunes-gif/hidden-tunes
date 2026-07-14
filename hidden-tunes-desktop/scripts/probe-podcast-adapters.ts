import {
  fetchPodcastCategories,
  fetchPodcastEpisodes,
  fetchPodcastFeaturedShows,
  resolvePodcastPlayUrl,
} from '../src/lib/podcasts/podcastCatalogApi.ts'
import { podcastEpisodeToApiSong } from '../src/lib/podcasts/podcastPlaybackAdapter.ts'

async function main() {
  const categories = await fetchPodcastCategories()
  console.log(`categories: ${categories.length}`)
  if (categories[0]) {
    console.log('sample category', {
      id: categories[0].id,
      slug: categories[0].slug,
      name: categories[0].name,
      sortOrder: categories[0].sortOrder,
    })
  }

  const featured = await fetchPodcastFeaturedShows({ page: 1, limit: 3 })
  console.log('featured pagination', featured.pagination)
  console.log(`featured shows: ${featured.shows.length}`)

  const episodesResponse = await fetchPodcastEpisodes({ page: 1, limit: 3 })
  console.log('episodes pagination', episodesResponse.pagination)
  console.log(`episodes: ${episodesResponse.episodes.length}`)

  const paginationFields = episodesResponse.pagination
  for (const key of ['page', 'limit', 'total', 'totalPages', 'hasMore'] as const) {
    if (!(key in paginationFields)) {
      throw new Error(`Pagination missing field: ${key}`)
    }
  }

  const firstEpisode = episodesResponse.episodes[0]
  if (firstEpisode) {
    const queueSong = podcastEpisodeToApiSong(firstEpisode)
    const hasBrowseAudio = Boolean(queueSong.audioUrl || queueSong.previewUrl)
    console.log('browse queue song has audio url', hasBrowseAudio)
    if (hasBrowseAudio) {
      throw new Error('Episode browse mapping must not include audio URLs.')
    }

    const episodeKeys = Object.keys(firstEpisode)
    if (episodeKeys.some((key) => key.toLowerCase().includes('audio'))) {
      throw new Error('Normalized episode meta must not expose audio fields.')
    }

    console.log('queue song id prefix', queueSong.id.startsWith('podcast-'))

    const play = await resolvePodcastPlayUrl(firstEpisode.id)
    console.log('play resolver invoked', Boolean(play?.audioUrl?.startsWith('http')))
    if (!play?.audioUrl?.startsWith('http')) {
      throw new Error('Play resolver must return a playable URL when invoked.')
    }
  } else {
    console.log('play resolver skipped — no episodes returned')
  }

  console.log('probe ok')
}

main().catch((error) => {
  console.error('probe failed', error instanceof Error ? error.message : error)
  process.exitCode = 1
})

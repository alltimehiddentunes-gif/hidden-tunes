export type PodcastPagination = {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

/** Metadata-only public show — no episode audio in browse responses. */
export type PodcastShowMeta = {
  id: string
  slug: string
  title: string
  description: string | null
  artworkUrl: string | null
  hostName: string | null
  primaryCategory: string | null
  categories: string[]
  language: string | null
  publisher: string | null
  episodeCount: number
  isFeatured: boolean
  isExclusive: boolean
  isVerified: boolean
  lastCheckedAt: string | null
}

/** Metadata-only public episode — audio_url excluded from browse normalization. */
export type PodcastEpisodeMeta = {
  id: string
  showId: string
  showTitle: string | null
  title: string
  description: string | null
  artworkUrl: string | null
  durationSeconds: number | null
  publishedAt: string | null
  episodeNumber: number | null
  seasonNumber: number | null
  isVerified: boolean
  lastCheckedAt: string | null
}

export type PodcastCategoryMeta = {
  id: string
  name: string
  slug: string
  description: string | null
  sortOrder: number
}

export type PodcastShowsResponse = {
  success: boolean
  shows: PodcastShowMeta[]
  pagination: PodcastPagination
}

export type PodcastEpisodesResponse = {
  success: boolean
  episodes: PodcastEpisodeMeta[]
  shows: PodcastShowMeta[]
  pagination: PodcastPagination
}

export type PodcastShowDetailResponse = {
  success: boolean
  show: PodcastShowMeta
}

export type PodcastPlayResponse = {
  success: boolean
  episodeId: string
  showId: string
  title: string
  audioUrl: string
  durationSeconds: number | null
  publishedAt: string | null
}

export type PodcastTabId = string

export type PodcastQueueContextMeta = {
  mediaType: 'podcast'
  episodeId: string
  showId: string
  showTitle: string
  publishedAt: string | null
}

export type PlayPodcastEpisodeOptions = {
  show?: PodcastShowMeta | null
  resumePositionSeconds?: number | null
}

export type PlayPodcastEpisodeHandler = (
  episode: PodcastEpisodeMeta,
  queue: PodcastEpisodeMeta[],
  startIndex: number,
  queueTitle: string,
  options?: PlayPodcastEpisodeOptions,
) => void

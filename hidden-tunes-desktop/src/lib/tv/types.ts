export type TvPagination = {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

/** Metadata-only public TV channel — no stream URL in browse responses. */
export type TvChannelMeta = {
  id: string
  title: string
  channelName: string | null
  artworkUrl: string | null
  country: string | null
  language: string | null
  categories: string[]
  tags: string[]
  isFeatured: boolean
  reliabilityScore: number
  streamProtocol: string | null
  streamIsHttps: boolean
  description: string | null
}

export type TvCategoryMeta = {
  id: string
  name: string
  slug: string
  parentSlug: string | null
  count: number
}

export type TvRegionMeta = {
  id: string
  name: string
  code: string | null
  count: number
}

export type TvCatalogResponse = {
  success: boolean
  channels: TvChannelMeta[]
  pagination: TvPagination
}

export type TvPlayResponse = {
  success: boolean
  id: string
  stream_url: string
  embed_url?: string | null
  source_type?: string | null
  source_id?: string | null
}

export type TvFilterId =
  | 'all'
  | 'featured'
  | 'movies'
  | 'series'
  | 'news'
  | 'sports'
  | 'documentaries'
  | 'kids'
  | 'genres'

export const TV_PAGE_SIZE = 40
export const TV_SEARCH_MIN_LENGTH = 2

export type RadioPagination = {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

/** Metadata-only public station — no stream URL in browse responses. */
export type RadioStationMeta = {
  id: string
  name: string
  artworkUrl: string | null
  country: string | null
  countryCode: string | null
  language: string | null
  tags: string[]
  categories: string[]
  bitrate: number | null
  codec: string | null
  qualityScore: number
  reliabilityScore: number
  isFeatured: boolean
  popularity: {
    votes: number
    clickCount: number
  }
}

export type RadioCategoryMeta = {
  id: string
  name: string
  count: number
}

export type RadioCountryMeta = {
  id: string
  name: string
  code: string | null
  count: number
}

export type RadioStationsResponse = {
  success: boolean
  stations: RadioStationMeta[]
  pagination: RadioPagination
}

export type RadioPlayResponse = {
  success: boolean
  id: string
  stream_url: string
  source_type?: string | null
  source_station_uuid?: string | null
}

export type RadioTabId =
  | 'all'
  | 'featured'
  | 'music'
  | 'news'
  | 'talk'
  | 'sports'
  | 'culture'
  | 'moods'
  | 'countries'

export type MotivationalPagination = {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

/** Metadata-only program — no playable URLs in browse responses. */
export type MotivationalProgramMeta = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  description: string | null
  artworkUrl: string | null
  creatorId: string | null
  categorySlug: string | null
  language: string | null
  country: string | null
  contentRating: string | null
  programType: string | null
  sessionCount: number
  totalDurationSeconds: number | null
  isFeatured: boolean
  publishedAt: string | null
  /** True when browse row maps a single catalog item, not a multi-session program. */
  isStandaloneItem?: boolean
  mediaType?: 'audio' | 'video' | 'stream' | 'embed'
}

/** Metadata-only session — audio resolves on play. */
export type MotivationalSessionMeta = {
  id: string
  programId: string | null
  title: string
  description: string | null
  artworkUrl: string | null
  speakerName: string | null
  category: string | null
  subcategory: string | null
  categorySlug: string | null
  language: string | null
  country: string | null
  durationSeconds: number | null
  seasonNumber: number | null
  episodeNumber: number | null
  sortOrder: number
  publishedAt: string | null
  isFeatured: boolean
  mediaType?: 'audio' | 'video' | 'stream' | 'embed'
}

export type MotivationalCategoryMeta = {
  id: string
  slug: string
  name: string
  title: string
  description: string | null
  sortOrder: number
  itemCount: number
}

export type MotivationalProgramsResponse = {
  success: boolean
  programs: MotivationalProgramMeta[]
  pagination: MotivationalPagination
}

export type MotivationalBrowseResponse = {
  success: boolean
  category: MotivationalCategoryMeta | null
  programs: MotivationalProgramMeta[]
  pagination: MotivationalPagination
}

export type MotivationalSearchResponse = {
  success: boolean
  sessions: MotivationalSessionMeta[]
  pagination: MotivationalPagination
}

export type MotivationalProgramDetailResponse = {
  success: boolean
  program: MotivationalProgramMeta
  sessions: MotivationalSessionMeta[]
  pagination: MotivationalPagination
  standalone: boolean
}

export type MotivationalPlayResponse = {
  success: boolean
  sessionId: string
  audioUrl: string
  mediaType: 'audio' | 'video' | 'stream' | 'embed'
  mimeType: string | null
  width: number | null
  height: number | null
  durationSeconds: number | null
  artworkUrl: string | null
  title: string
  speakerName: string | null
}

export type PlayMotivationalSessionHandler = (
  program: MotivationalProgramMeta,
  session: MotivationalSessionMeta,
  queue: MotivationalSessionMeta[],
  startIndex: number,
  queueTitle: string,
  options?: {
    resumePositionSeconds?: number | null
  },
) => void

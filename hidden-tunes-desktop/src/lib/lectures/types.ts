export type LectureMediaType = 'audio' | 'video'

export type LecturePagination = {
  page: number
  limit: number
  total: number | null
  totalPages: number | null
  hasMore: boolean
}

export type LectureCategory = {
  id: string
  slug: string
  name: string
  description?: string | null
  artworkUrl?: string | null
  itemCount?: number
  sortOrder?: number
}

export type LectureSpeaker = {
  id?: string
  name: string
  artworkUrl?: string | null
  biography?: string | null
}

export type LectureInstitution = {
  id?: string
  name: string
  artworkUrl?: string | null
}

export type LectureSeries = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  description: string | null
  artworkUrl: string | null
  speaker: LectureSpeaker | null
  institution: LectureInstitution | null
  category: LectureCategory | null
  subject: string | null
  language: string | null
  country: string | null
  sessionCount: number
  totalDurationSeconds: number | null
  isFeatured: boolean
  isVerified: boolean
  publishedAt: string | null
  difficulty: string | null
  topicTags: string[]
  mediaType: LectureMediaType | null
}

export type LectureItem = {
  id: string
  seriesId: string
  title: string
  description: string | null
  artworkUrl: string | null
  mediaType: LectureMediaType
  durationSeconds: number | null
  publishedAt: string | null
  speaker: LectureSpeaker | null
  institution: LectureInstitution | null
  category: LectureCategory | null
  subject: string | null
  seriesTitle: string | null
  sessionNumber: number | null
  language: string | null
  country: string | null
  playable: boolean
  sortOrder: number
}

export type LecturePlayResolution = {
  success: boolean
  seriesId: string
  itemId: string
  mediaType: LectureMediaType
  playbackUrl: string
  mimeType: string | null
  durationSeconds: number | null
  title: string
}

export type LectureBrowseResponse = {
  success: boolean
  category: LectureCategory | null
  series: LectureSeries[]
  pagination: LecturePagination
}

export type LectureSearchResponse = {
  success: boolean
  query: string
  series: LectureSeries[]
  pagination: LecturePagination
}

export type LectureSeriesDetailResponse = {
  success: boolean
  series: LectureSeries
  sessions: LectureItem[]
  pagination: LecturePagination
}

export type PlayLectureSessionHandler = (
  series: LectureSeries,
  session: LectureItem,
  queue: LectureItem[],
  startIndex: number,
  queueTitle: string,
  options?: {
    resumePositionSeconds?: number | null
  },
) => void

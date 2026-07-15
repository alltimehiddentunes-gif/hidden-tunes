export type AudiobookPagination = {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

/** Metadata-only — no playable URLs in browse responses. */
export type AudiobookBookMeta = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  description: string | null
  coverUrl: string | null
  authorName: string | null
  narratorName: string | null
  seriesTitle: string | null
  seriesPosition: number | null
  categorySlug: string | null
  categories: string[]
  language: string | null
  publisher: string | null
  durationSeconds: number | null
  chapterCount: number
  isFeatured: boolean
  isVerified: boolean
  publishedAt: string | null
  createdAt: string | null
}

/** Metadata-only chapter — audio resolves on play. */
export type AudiobookChapterMeta = {
  id: string
  bookId: string
  title: string
  description: string | null
  chapterNumber: number | null
  durationSeconds: number | null
  publishedAt: string | null
  createdAt: string | null
}

export type AudiobookCategoryMeta = {
  id: string
  slug: string
  name: string
  title: string
  sortOrder: number
  itemCount: number
}

export type AudiobookBooksResponse = {
  success: boolean
  category: AudiobookCategoryMeta | null
  books: AudiobookBookMeta[]
  pagination: AudiobookPagination
}

export type AudiobookDetailResponse = {
  success: boolean
  audiobook: AudiobookBookMeta
  chapters: AudiobookChapterMeta[]
}

export type AudiobookChapterPlayItem = AudiobookChapterMeta & {
  audioUrl: string
}

export type AudiobookChapterPlayResponse = {
  success: boolean
  bookId: string
  audiobook: AudiobookBookMeta
  fromChapterId: string
  startIndex: number
  chapters: AudiobookChapterPlayItem[]
}

export type AudiobookBookPlayResponse = {
  success: boolean
  bookId: string
  title: string
  audioUrl: string
  durationSeconds: number | null
}

export type PlayAudiobookChapterHandler = (
  book: AudiobookBookMeta,
  chapter: AudiobookChapterMeta,
  queue: AudiobookChapterMeta[],
  startIndex: number,
  queueTitle: string,
  options?: {
    resumePositionSeconds?: number | null
  },
) => void

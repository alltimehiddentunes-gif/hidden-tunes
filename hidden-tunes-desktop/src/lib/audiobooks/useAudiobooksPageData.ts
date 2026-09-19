import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchAudiobookBooks,
  fetchAudiobookCategories,
  fetchAudiobookCategory,
  searchAudiobooks,
} from './audiobookCatalogApi'
import type {
  AudiobookBookMeta,
  AudiobookCategoryMeta,
  AudiobookPagination,
} from './types'

const SEARCH_DEBOUNCE_MS = 280
const FEATURED_LIMIT = 12
const BROWSE_LIMIT = 40
const AUDIOBOOKS_PAGE_SNAPSHOT_TTL_MS = 5 * 60 * 1000
const AUDIOBOOKS_PAGE_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000

type AudiobooksPageSnapshot = {
  categories: AudiobookCategoryMeta[]
  browseBooks: AudiobookBookMeta[]
  pagination: AudiobookPagination | null
  browseCursor: string | null
  cachedAt: number
}

let audiobooksPageSnapshot: AudiobooksPageSnapshot | null = null

function readAudiobooksPageSnapshot() {
  if (!audiobooksPageSnapshot) return null
  const ageMs = Date.now() - audiobooksPageSnapshot.cachedAt
  if (ageMs > AUDIOBOOKS_PAGE_SNAPSHOT_MAX_AGE_MS) {
    audiobooksPageSnapshot = null
    return null
  }
  return {
    snapshot: audiobooksPageSnapshot,
    fresh: ageMs <= AUDIOBOOKS_PAGE_SNAPSHOT_TTL_MS,
  }
}

function readError(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

function isCancelledError(reason: unknown) {
  return (
    (reason instanceof DOMException && reason.name === 'AbortError')
    || (reason instanceof Error && reason.name === 'AbortError')
    || (reason instanceof Error && /cancelled|canceled|aborted/i.test(reason.message))
  )
}

function deriveFeaturedBooks(books: AudiobookBookMeta[]) {
  const explicitlyFeatured = books
    .filter((book) => book.isFeatured)
    .slice(0, FEATURED_LIMIT)
  return explicitlyFeatured.length > 0
    ? explicitlyFeatured
    : books.slice(0, FEATURED_LIMIT)
}

function dedupeBooks(previous: AudiobookBookMeta[], incoming: AudiobookBookMeta[]) {
  const seen = new Set(previous.map((book) => book.id))
  const merged = [...previous]
  for (const book of incoming) {
    if (seen.has(book.id)) continue
    seen.add(book.id)
    merged.push(book)
  }
  return merged
}

export function useAudiobooksPageData(
  searchQuery: string,
  categorySlug: string | null,
  languageFilter: string | null = null,
) {
  const trimmedSearch = searchQuery.trim()
  const effectiveCategorySlug = trimmedSearch ? null : categorySlug
  const effectiveLanguageFilter = trimmedSearch || effectiveCategorySlug
    ? null
    : languageFilter
  const filteredView =
    trimmedSearch.length > 0
    || Boolean(effectiveCategorySlug)
    || Boolean(effectiveLanguageFilter)
  const contentQueryKey = filteredView
    ? [trimmedSearch, effectiveCategorySlug ?? '', effectiveLanguageFilter ?? ''].join('|')
    : 'default'

  const [initialSnapshot] = useState(() => readAudiobooksPageSnapshot())
  const [categories, setCategories] = useState<AudiobookCategoryMeta[]>(
    () => initialSnapshot?.snapshot.categories ?? [],
  )
  const [browseBooks, setBrowseBooks] = useState<AudiobookBookMeta[]>(
    () => initialSnapshot?.snapshot.browseBooks ?? [],
  )
  const [searchBooks, setSearchBooks] = useState<AudiobookBookMeta[]>([])
  const [browsePagination, setBrowsePagination] = useState<AudiobookPagination | null>(
    () => initialSnapshot?.snapshot.pagination ?? null,
  )
  const [filteredPagination, setFilteredPagination] = useState<AudiobookPagination | null>(null)
  const [browseCursor, setBrowseCursor] = useState<string | null>(
    () => initialSnapshot?.snapshot.browseCursor ?? null,
  )
  const [filteredCursor, setFilteredCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(() => !initialSnapshot)
  const [contentLoading, setContentLoading] = useState(filteredView)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contentError, setContentError] = useState<string | null>(null)

  const bootstrapRef = useRef(0)
  const contentRef = useRef(0)
  const loadMoreRef = useRef(0)
  const contentAbortRef = useRef<AbortController | null>(null)
  const loadMoreAbortRef = useRef<AbortController | null>(null)
  const loadMorePendingRef = useRef(false)
  const browseBooksRef = useRef(initialSnapshot?.snapshot.browseBooks ?? [])
  const searchBooksRef = useRef<AudiobookBookMeta[]>([])
  const contentQueryKeyRef = useRef(contentQueryKey)

  useEffect(() => {
    const controller = new AbortController()
    const requestId = ++bootstrapRef.current

    if (!initialSnapshot?.fresh) {
      void (async () => {
        await Promise.resolve()
        if (controller.signal.aborted || requestId !== bootstrapRef.current) return
        setLoading(true)
        setError(null)

        try {
          const [categoriesResult, browseResult] = await Promise.allSettled([
            fetchAudiobookCategories(controller.signal),
            fetchAudiobookBooks({ page: 1, limit: BROWSE_LIMIT }, controller.signal),
          ])

          if (controller.signal.aborted || requestId !== bootstrapRef.current) return

          if (categoriesResult.status === 'fulfilled') {
            setCategories(categoriesResult.value)
          }

          if (browseResult.status === 'fulfilled') {
            const response = browseResult.value
            browseBooksRef.current = response.books
            setBrowseBooks(response.books)
            setBrowseCursor(response.pagination.nextCursor ?? null)
            setBrowsePagination(response.pagination)
            setError(null)
          } else if (!isCancelledError(browseResult.reason) && browseBooksRef.current.length === 0) {
            setError(readError(browseResult.reason, 'Could not load audiobooks.'))
          }

          if (
            categoriesResult.status === 'fulfilled'
            && browseResult.status === 'fulfilled'
            && browseResult.value.books.length > 0
          ) {
            audiobooksPageSnapshot = {
              categories: categoriesResult.value,
              browseBooks: browseResult.value.books,
              pagination: browseResult.value.pagination,
              browseCursor: browseResult.value.pagination.nextCursor ?? null,
              cachedAt: Date.now(),
            }
          }
        } catch (reason) {
          if (
            controller.signal.aborted
            || requestId !== bootstrapRef.current
            || isCancelledError(reason)
          ) return
          if (browseBooksRef.current.length === 0) {
            setError(readError(reason, 'Could not load audiobooks.'))
          }
        } finally {
          if (!controller.signal.aborted && requestId === bootstrapRef.current) {
            setLoading(false)
          }
        }
      })()
    }

    return () => {
      bootstrapRef.current += 1
      controller.abort()
    }
  }, [initialSnapshot])

  useEffect(() => {
    if (contentQueryKeyRef.current === contentQueryKey) return
    contentQueryKeyRef.current = contentQueryKey
    searchBooksRef.current = []
    contentAbortRef.current?.abort()
    loadMoreAbortRef.current?.abort()
    loadMoreRef.current += 1
    loadMorePendingRef.current = false

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setSearchBooks([])
      setFilteredPagination(null)
      setFilteredCursor(null)
      setContentError(null)
      setContentLoading(filteredView)
      setLoadingMore(false)
    })
    return () => {
      cancelled = true
    }
  }, [contentQueryKey, filteredView])

  useEffect(() => {
    contentAbortRef.current?.abort()
    const controller = new AbortController()
    contentAbortRef.current = controller
    const requestId = ++contentRef.current
    const requestQueryKey = contentQueryKey

    if (!filteredView) {
      return () => controller.abort()
    }

    const timer = globalThis.setTimeout(() => {
      setContentLoading(true)
      setContentError(null)

      void (async () => {
        try {
          const response = await (trimmedSearch
            ? searchAudiobooks(trimmedSearch, { page: 1, limit: BROWSE_LIMIT }, controller.signal)
            : effectiveCategorySlug
              ? fetchAudiobookCategory(
                  effectiveCategorySlug,
                  { page: 1, limit: BROWSE_LIMIT },
                  controller.signal,
                )
              : fetchAudiobookBooks(
                  {
                    page: 1,
                    limit: BROWSE_LIMIT,
                    language: effectiveLanguageFilter,
                  },
                  controller.signal,
                ))

          if (
            controller.signal.aborted
            || requestId !== contentRef.current
            || requestQueryKey !== contentQueryKeyRef.current
          ) return

          searchBooksRef.current = response.books
          setSearchBooks(response.books)
          setFilteredPagination(response.pagination)
          setFilteredCursor(response.pagination.nextCursor ?? null)
          setContentError(null)
        } catch (reason) {
          if (
            controller.signal.aborted
            || requestId !== contentRef.current
            || requestQueryKey !== contentQueryKeyRef.current
            || isCancelledError(reason)
          ) return
          setContentError(readError(reason, 'Could not load audiobook results.'))
        } finally {
          if (
            !controller.signal.aborted
            && requestId === contentRef.current
            && requestQueryKey === contentQueryKeyRef.current
          ) {
            setContentLoading(false)
          }
        }
      })()
    }, trimmedSearch ? SEARCH_DEBOUNCE_MS : 0)

    return () => {
      globalThis.clearTimeout(timer)
      controller.abort()
    }
  }, [
    contentQueryKey,
    effectiveCategorySlug,
    effectiveLanguageFilter,
    filteredView,
    trimmedSearch,
  ])

  useEffect(() => {
    return () => {
      loadMoreRef.current += 1
      loadMorePendingRef.current = false
      loadMoreAbortRef.current?.abort()
    }
  }, [])

  const pagination = filteredView ? filteredPagination : browsePagination
  const currentCursor = filteredView ? filteredCursor : browseCursor

  const loadMore = useCallback(() => {
    if (!pagination?.hasMore || loading || loadMorePendingRef.current) return

    loadMorePendingRef.current = true
    loadMoreAbortRef.current?.abort()
    const controller = new AbortController()
    loadMoreAbortRef.current = controller
    const requestId = ++loadMoreRef.current
    const requestQueryKey = contentQueryKey
    setLoadingMore(true)

    const request = trimmedSearch
      ? searchAudiobooks(
          trimmedSearch,
          { page: (pagination.page || 1) + 1, limit: BROWSE_LIMIT },
          controller.signal,
        )
      : effectiveCategorySlug
        ? fetchAudiobookCategory(
            effectiveCategorySlug,
            { page: (pagination.page || 1) + 1, limit: BROWSE_LIMIT },
            controller.signal,
          )
        : fetchAudiobookBooks(
            {
              page: (pagination.page || 1) + 1,
              limit: BROWSE_LIMIT,
              cursor: currentCursor,
              language: effectiveLanguageFilter,
            },
            controller.signal,
          )

    void request
      .then((response) => {
        if (
          controller.signal.aborted
          || requestId !== loadMoreRef.current
          || requestQueryKey !== contentQueryKeyRef.current
        ) return

        if (filteredView) {
          const nextBooks = dedupeBooks(searchBooksRef.current, response.books)
          searchBooksRef.current = nextBooks
          setSearchBooks(nextBooks)
          setFilteredPagination(response.pagination)
          setFilteredCursor(response.pagination.nextCursor ?? null)
        } else {
          const nextBooks = dedupeBooks(browseBooksRef.current, response.books)
          browseBooksRef.current = nextBooks
          setBrowseBooks(nextBooks)
          setBrowsePagination(response.pagination)
          setBrowseCursor(response.pagination.nextCursor ?? null)
        }
      })
      .catch((reason) => {
        if (!isCancelledError(reason)) return undefined
        return undefined
      })
      .finally(() => {
        if (
          !controller.signal.aborted
          && requestId === loadMoreRef.current
          && requestQueryKey === contentQueryKeyRef.current
        ) {
          loadMorePendingRef.current = false
          setLoadingMore(false)
        }
      })
  }, [
    contentQueryKey,
    currentCursor,
    effectiveCategorySlug,
    effectiveLanguageFilter,
    filteredView,
    loading,
    pagination,
    setBrowseBooks,
    setBrowseCursor,
    setBrowsePagination,
    setFilteredCursor,
    setFilteredPagination,
    setLoadingMore,
    setSearchBooks,
    trimmedSearch,
  ])

  const featuredBooks = useMemo(
    () => deriveFeaturedBooks(browseBooks),
    [browseBooks],
  )

  const visibleBooks = useMemo(
    () => (filteredView ? searchBooks : browseBooks),
    [browseBooks, filteredView, searchBooks],
  )

  const newBooks = useMemo(
    () => [...browseBooks]
      .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))
      .slice(0, 12),
    [browseBooks],
  )

  const popularBooks = useMemo(
    () => [...browseBooks]
      .filter((book) => book.isVerified)
      .slice(0, 12),
    [browseBooks],
  )

  const languageOptions = useMemo(() => {
    const values = new Set<string>()
    for (const book of browseBooks) {
      if (book.language?.trim()) values.add(book.language.trim())
    }
    return [...values].sort((a, b) => a.localeCompare(b))
  }, [browseBooks])

  return {
    categories,
    featuredBooks,
    browseBooks,
    visibleBooks,
    newBooks,
    popularBooks,
    pagination,
    loading,
    contentLoading,
    loadingMore,
    error,
    contentError,
    filteredView,
    languageOptions,
    loadMore,
  }
}

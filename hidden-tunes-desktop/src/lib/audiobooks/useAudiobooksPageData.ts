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

function readError(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

export function useAudiobooksPageData(searchQuery: string, categorySlug: string | null) {
  const [categories, setCategories] = useState<AudiobookCategoryMeta[]>([])
  const [featuredBooks, setFeaturedBooks] = useState<AudiobookBookMeta[]>([])
  const [browseBooks, setBrowseBooks] = useState<AudiobookBookMeta[]>([])
  const [searchBooks, setSearchBooks] = useState<AudiobookBookMeta[]>([])
  const [pagination, setPagination] = useState<AudiobookPagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contentError, setContentError] = useState<string | null>(null)
  const bootstrapRef = useRef(0)
  const browseRef = useRef(0)
  const browseAbortRef = useRef<AbortController | null>(null)

  const trimmedSearch = searchQuery.trim()
  const filteredView = trimmedSearch.length > 0 || Boolean(categorySlug)

  useEffect(() => {
    const requestId = ++bootstrapRef.current
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    Promise.all([
      fetchAudiobookCategories(controller.signal),
      fetchAudiobookBooks({ page: 1, limit: FEATURED_LIMIT }, controller.signal),
      fetchAudiobookBooks({ page: 1, limit: BROWSE_LIMIT }, controller.signal),
    ])
      .then(([nextCategories, featuredResponse, browseResponse]) => {
        if (requestId !== bootstrapRef.current) return
        setCategories(nextCategories)
        setFeaturedBooks(
          featuredResponse.books.filter((book) => book.isFeatured).slice(0, FEATURED_LIMIT).length > 0
            ? featuredResponse.books.filter((book) => book.isFeatured).slice(0, FEATURED_LIMIT)
            : featuredResponse.books.slice(0, FEATURED_LIMIT),
        )
        setBrowseBooks(browseResponse.books)
        setPagination(browseResponse.pagination)
      })
      .catch((reason) => {
        if (requestId !== bootstrapRef.current) return
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(readError(reason, 'Could not load audiobooks.'))
      })
      .finally(() => {
        if (requestId === bootstrapRef.current) setLoading(false)
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    browseAbortRef.current?.abort()
    const controller = new AbortController()
    browseAbortRef.current = controller
    const requestId = ++browseRef.current

    if (!filteredView) {
      setSearchBooks([])
      setContentError(null)
      setContentLoading(false)
      return () => controller.abort()
    }

    setContentLoading(true)
    setContentError(null)

    const timer = window.setTimeout(() => {
      const request = trimmedSearch
        ? searchAudiobooks(trimmedSearch, { page: 1, limit: BROWSE_LIMIT }, controller.signal)
        : categorySlug
          ? fetchAudiobookCategory(categorySlug, { page: 1, limit: BROWSE_LIMIT }, controller.signal)
          : fetchAudiobookBooks({ page: 1, limit: BROWSE_LIMIT }, controller.signal)

      request
        .then((response) => {
          if (requestId !== browseRef.current) return
          setSearchBooks(response.books)
          setPagination(response.pagination)
        })
        .catch((reason) => {
          if (requestId !== browseRef.current) return
          if (reason instanceof DOMException && reason.name === 'AbortError') return
          setContentError(readError(reason, 'Could not load audiobook results.'))
          setSearchBooks([])
        })
        .finally(() => {
          if (requestId === browseRef.current) setContentLoading(false)
        })
    }, trimmedSearch ? SEARCH_DEBOUNCE_MS : 0)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [categorySlug, filteredView, trimmedSearch])

  const loadMore = useCallback(() => {
    if (!pagination?.hasMore || loadingMore) return
    const nextPage = pagination.page + 1
    const controller = new AbortController()
    setLoadingMore(true)

    const request = trimmedSearch
      ? searchAudiobooks(trimmedSearch, { page: nextPage, limit: BROWSE_LIMIT }, controller.signal)
      : categorySlug
        ? fetchAudiobookCategory(categorySlug, { page: nextPage, limit: BROWSE_LIMIT }, controller.signal)
        : fetchAudiobookBooks({ page: nextPage, limit: BROWSE_LIMIT }, controller.signal)

    request
      .then((response) => {
        setPagination(response.pagination)
        if (filteredView) {
          setSearchBooks((previous) => [...previous, ...response.books])
        } else {
          setBrowseBooks((previous) => [...previous, ...response.books])
        }
      })
      .catch(() => undefined)
      .finally(() => setLoadingMore(false))
  }, [categorySlug, filteredView, loadingMore, pagination, trimmedSearch])

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

  const heroBook = useMemo(
    () => featuredBooks[0] ?? browseBooks[0] ?? null,
    [browseBooks, featuredBooks],
  )

  return {
    categories,
    featuredBooks,
    browseBooks,
    visibleBooks,
    newBooks,
    popularBooks,
    heroBook,
    pagination,
    loading,
    contentLoading,
    loadingMore,
    error,
    contentError,
    filteredView,
    loadMore,
  }
}

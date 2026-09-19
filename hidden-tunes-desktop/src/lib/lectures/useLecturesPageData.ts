import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchLectureCategories,
  fetchLectureCategory,
  fetchLectureItems,
  isLectureRequestCancellation,
  searchLectures,
} from './lectureCatalogApi'
import type { LectureCategory, LecturePagination, LectureSeries } from './types'

const SEARCH_DEBOUNCE_MS = 300
const FEATURED_LIMIT = 12
const SECTION_LIMIT = 12
const BROWSE_LIMIT = 40
const LECTURES_PAGE_SNAPSHOT_TTL_MS = 5 * 60 * 1000
const LECTURES_PAGE_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000

type LecturesPageSnapshot = {
  categories: LectureCategory[]
  series: LectureSeries[]
  pagination: LecturePagination
  cachedAt: number
}

let lecturesPageSnapshot: LecturesPageSnapshot | null = null

function readLecturesPageSnapshot() {
  if (!lecturesPageSnapshot) return null
  const ageMs = Date.now() - lecturesPageSnapshot.cachedAt
  if (ageMs > LECTURES_PAGE_SNAPSHOT_MAX_AGE_MS) {
    lecturesPageSnapshot = null
    return null
  }
  return {
    snapshot: lecturesPageSnapshot,
    fresh: ageMs <= LECTURES_PAGE_SNAPSHOT_TTL_MS,
  }
}

export type LecturesMediaFilter = 'all' | 'audio' | 'video'

function readError(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

function dedupeSeries(seriesList: LectureSeries[]) {
  const seen = new Set<string>()
  const next: LectureSeries[] = []
  for (const series of seriesList) {
    if (seen.has(series.id)) continue
    seen.add(series.id)
    next.push(series)
  }
  return next
}

function applyVisibleFilters(
  seriesList: LectureSeries[],
  mediaFilter: LecturesMediaFilter,
  languageFilter: string | null,
) {
  let next = seriesList

  if (languageFilter) {
    const normalizedLanguage = languageFilter.toLowerCase()
    next = next.filter((entry) => entry.language?.toLowerCase() === normalizedLanguage)
  }

  if (mediaFilter === 'audio') {
    next = next.filter((entry) => entry.mediaType !== 'video')
  } else if (mediaFilter === 'video') {
    next = next.filter((entry) => entry.mediaType === 'video')
  }

  return next
}
export function useLecturesPageData(
  searchQuery: string,
  categorySlug: string | null,
  mediaFilter: LecturesMediaFilter = 'all',
  languageFilter: string | null = null,
) {
  const [initialSnapshot] = useState(() => readLecturesPageSnapshot())
  const [categories, setCategories] = useState<LectureCategory[]>(
    () => initialSnapshot?.snapshot.categories ?? [],
  )
  const [browseSeries, setBrowseSeries] = useState<LectureSeries[]>(
    () => initialSnapshot?.snapshot.series ?? [],
  )
  const [filteredSeries, setFilteredSeries] = useState<LectureSeries[]>([])
  const [browsePagination, setBrowsePagination] = useState<LecturePagination | null>(
    () => initialSnapshot?.snapshot.pagination ?? null,
  )
  const [filteredPagination, setFilteredPagination] = useState<LecturePagination | null>(null)
  const [loading, setLoading] = useState(() => !initialSnapshot)
  const [filteredContentLoading, setFilteredContentLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [browseError, setBrowseError] = useState<string | null>(null)
  const [filteredError, setFilteredError] = useState<string | null>(null)
  const [bootstrapRetryNonce, setBootstrapRetryNonce] = useState(0)
  const [contentRetryNonce, setContentRetryNonce] = useState(0)
  const bootstrapRef = useRef(0)
  const browseRef = useRef(0)
  const loadMoreRef = useRef(0)
  const browseAbortRef = useRef<AbortController | null>(null)
  const loadMoreAbortRef = useRef<AbortController | null>(null)
  const categoriesRef = useRef(categories)
  const browseSeriesRef = useRef(browseSeries)
  const filteredSeriesRef = useRef(filteredSeries)
  const defaultRefreshInFlightRef = useRef(false)
  const filteredRequestInFlightRef = useRef(false)
  const loadMoreInFlightRef = useRef(false)

  const trimmedSearch = searchQuery.trim()
  const filteredView =
    trimmedSearch.length > 0 || Boolean(categorySlug) || mediaFilter !== 'all' || Boolean(languageFilter)
  const filteredQueryKey = [trimmedSearch, categorySlug ?? '', mediaFilter, languageFilter ?? ''].join('|')
  const filteredQueryKeyRef = useRef('')
  const pagination = filteredView ? filteredPagination : browsePagination
  const contentLoading = filteredView && filteredContentLoading
  const contentError = filteredView ? filteredError : browseError
  const setContentError = useCallback((message: string | null) => {
    if (filteredView) setFilteredError(message)
    else setBrowseError(message)
  }, [filteredView])

  useEffect(() => {
    categoriesRef.current = categories
    browseSeriesRef.current = browseSeries
    filteredSeriesRef.current = filteredSeries
  }, [browseSeries, categories, filteredSeries])
  useEffect(() => {
    if (initialSnapshot?.fresh && bootstrapRetryNonce === 0) return

    const requestId = ++bootstrapRef.current
    const controller = new AbortController()

    void (async () => {
      await Promise.resolve()
      if (requestId !== bootstrapRef.current) return
      defaultRefreshInFlightRef.current = true
      loadMoreAbortRef.current?.abort()
      loadMoreRef.current += 1
      loadMoreInFlightRef.current = false
      setLoadingMore(false)
      if (browseSeriesRef.current.length === 0) setLoading(true)
      setError(null)
      setBrowseError(null)

      const categoriesRequest = (async () => {
        try {
          const nextCategories = await fetchLectureCategories(controller.signal)
          if (requestId !== bootstrapRef.current) return
          categoriesRef.current = nextCategories
          setCategories(nextCategories)
          if (lecturesPageSnapshot) {
            lecturesPageSnapshot = {
              ...lecturesPageSnapshot,
              categories: nextCategories,
            }
          }
        } catch (reason) {
          if (requestId !== bootstrapRef.current) return
          if (isLectureRequestCancellation(reason, controller.signal)) return
          // Categories are an optional refinement. The global list remains usable without them.
        }
      })()

      const itemsRequest = (async () => {
        try {
          const response = await fetchLectureItems(
            { page: 1, limit: BROWSE_LIMIT },
            controller.signal,
          )
          if (requestId !== bootstrapRef.current) return

          const nextSeries = dedupeSeries(response.series)
          browseSeriesRef.current = nextSeries
          setBrowseSeries(nextSeries)
          setBrowsePagination(response.pagination)
          setError(null)
          setBrowseError(null)
          lecturesPageSnapshot = {
            categories: categoriesRef.current,
            series: nextSeries,
            pagination: response.pagination,
            cachedAt: Date.now(),
          }
        } catch (reason) {
          if (requestId !== bootstrapRef.current) return
          if (isLectureRequestCancellation(reason, controller.signal)) return
          if (browseSeriesRef.current.length > 0) {
            setBrowseError(readError(reason, 'We couldn\u2019t load Lectures right now.'))
          } else {
            setError(readError(reason, 'We couldn\u2019t load Lectures right now.'))
          }
        } finally {
          if (requestId === bootstrapRef.current && !controller.signal.aborted) {
            defaultRefreshInFlightRef.current = false
            setLoading(false)
          }
        }
      })()

      await Promise.allSettled([categoriesRequest, itemsRequest])
    })()

    return () => {
      controller.abort()
      defaultRefreshInFlightRef.current = false
    }
  }, [bootstrapRetryNonce, initialSnapshot])
  useEffect(() => {
    if (!filteredView) {
      browseAbortRef.current?.abort()
      loadMoreAbortRef.current?.abort()
      browseRef.current += 1
      loadMoreRef.current += 1
      filteredRequestInFlightRef.current = false
      loadMoreInFlightRef.current = false
      queueMicrotask(() => {
        setFilteredContentLoading(false)
        setLoadingMore(false)
        setFilteredError(null)
      })
      return
    }

    browseAbortRef.current?.abort()
    loadMoreAbortRef.current?.abort()
    loadMoreRef.current += 1
    loadMoreInFlightRef.current = false
    const controller = new AbortController()
    browseAbortRef.current = controller
    const requestId = ++browseRef.current
    filteredRequestInFlightRef.current = true
    const queryChanged = filteredQueryKeyRef.current !== filteredQueryKey
    filteredQueryKeyRef.current = filteredQueryKey

    queueMicrotask(() => {
      if (requestId !== browseRef.current) return
      setLoadingMore(false)
      setFilteredContentLoading(true)
      setFilteredError(null)
      if (queryChanged) {
        filteredSeriesRef.current = []
        setFilteredSeries([])
        setFilteredPagination(null)
      }
    })

    const timer = window.setTimeout(() => {
      void (async () => {
        await Promise.resolve()
        if (requestId !== browseRef.current) return
        try {
          let series: LectureSeries[] = []
          let nextPagination: LecturePagination | null = null

          if (trimmedSearch) {
            const searchResponse = await searchLectures(
              trimmedSearch,
              { page: 1, limit: BROWSE_LIMIT },
              controller.signal,
            )
            series = searchResponse.series
            nextPagination = searchResponse.pagination
          } else if (categorySlug) {
            const categoryResponse = await fetchLectureCategory(
              categorySlug,
              { page: 1, limit: BROWSE_LIMIT },
              controller.signal,
            )
            series = categoryResponse.series
            nextPagination = categoryResponse.pagination
          } else {
            const browseResponse = await fetchLectureItems({ page: 1, limit: BROWSE_LIMIT }, controller.signal)
            series = browseResponse.series
            nextPagination = browseResponse.pagination
          }

          if (requestId !== browseRef.current) return
          const visibleSeries = applyVisibleFilters(series, mediaFilter, languageFilter)
          filteredSeriesRef.current = visibleSeries
          setFilteredSeries(visibleSeries)
          setFilteredPagination(nextPagination)
          setFilteredError(null)
        } catch (reason) {
          if (requestId !== browseRef.current) return
          if (isLectureRequestCancellation(reason, controller.signal)) return
          setContentError(readError(reason, 'Unable to load lecture results.'))
        } finally {
          if (requestId === browseRef.current) {
            filteredRequestInFlightRef.current = false
            setFilteredContentLoading(false)
          }
        }
      })()
    }, trimmedSearch ? SEARCH_DEBOUNCE_MS : 0)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
      if (requestId === browseRef.current) filteredRequestInFlightRef.current = false
    }
  }, [
    categorySlug,
    contentRetryNonce,
    filteredQueryKey,
    filteredView,
    languageFilter,
    mediaFilter,
    setContentError,
    trimmedSearch,
  ])
  const loadMore = useCallback(() => {
    if (
      !pagination?.hasMore
      || loadMoreInFlightRef.current
      || (filteredView ? filteredRequestInFlightRef.current : defaultRefreshInFlightRef.current)
    ) return

    loadMoreAbortRef.current?.abort()
    const requestId = ++loadMoreRef.current
    const controller = new AbortController()
    loadMoreAbortRef.current = controller
    loadMoreInFlightRef.current = true
    setLoadingMore(true)
    if (filteredView) setFilteredError(null)
    else setBrowseError(null)

    void (async () => {
      try {
        const nextPage = (pagination.page ?? 1) + 1
        let series: LectureSeries[] = []
        let nextPagination: LecturePagination | null = null

        if (trimmedSearch) {
          const searchResponse = await searchLectures(
            trimmedSearch,
            { page: nextPage, limit: pagination.limit },
            controller.signal,
          )
          series = searchResponse.series
          nextPagination = searchResponse.pagination
        } else if (categorySlug) {
          const categoryResponse = await fetchLectureCategory(
            categorySlug,
            { page: nextPage, limit: pagination.limit },
            controller.signal,
          )
          series = categoryResponse.series
          nextPagination = categoryResponse.pagination
        } else {
          const browseResponse = await fetchLectureItems(
            { page: nextPage, limit: pagination.limit },
            controller.signal,
          )
          series = browseResponse.series
          nextPagination = browseResponse.pagination
        }

        if (requestId !== loadMoreRef.current) return
        const visibleSeries = applyVisibleFilters(series, mediaFilter, languageFilter)

        if (filteredView) {
          setFilteredSeries((previous) => {
            const next = dedupeSeries([...previous, ...visibleSeries])
            filteredSeriesRef.current = next
            return next
          })
          setFilteredPagination(nextPagination)
          setFilteredError(null)
        } else {
          setBrowseSeries((previous) => {
            const next = dedupeSeries([...previous, ...visibleSeries])
            browseSeriesRef.current = next
            return next
          })
          setBrowsePagination(nextPagination)
          setBrowseError(null)
        }
      } catch (reason) {
        if (requestId !== loadMoreRef.current) return
        if (isLectureRequestCancellation(reason, controller.signal)) return
        setContentError(readError(reason, 'Unable to load more lectures.'))
      } finally {
        if (requestId === loadMoreRef.current) {
          loadMoreInFlightRef.current = false
          setLoadingMore(false)
        }
      }
    })()
  }, [categorySlug, filteredView, languageFilter, mediaFilter, pagination, setContentError, trimmedSearch])

  useEffect(() => () => {
    browseAbortRef.current?.abort()
    loadMoreAbortRef.current?.abort()
    browseRef.current += 1
    loadMoreRef.current += 1
    filteredRequestInFlightRef.current = false
    loadMoreInFlightRef.current = false
  }, [])

  const retry = useCallback(() => {
    if (filteredView) setContentRetryNonce((value) => value + 1)
    else setBootstrapRetryNonce((value) => value + 1)
  }, [filteredView])

  const featuredSeries = useMemo(() => {
    const featured = browseSeries.filter((series) => series.isFeatured).slice(0, FEATURED_LIMIT)
    return featured.length > 0 ? featured : browseSeries.slice(0, FEATURED_LIMIT)
  }, [browseSeries])

  const popularSeries = useMemo(
    () => browseSeries.slice(0, SECTION_LIMIT),
    [browseSeries],
  )

  const recentSeries = useMemo(
    () => [...browseSeries]
      .sort((a, b) => Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? ''))
      .slice(0, SECTION_LIMIT),
    [browseSeries],
  )

  const heroSeries = useMemo(() => {
    if (featuredSeries.length > 0) return featuredSeries[0]
    if (popularSeries.length > 0) return popularSeries[0]
    if (browseSeries.length > 0) return browseSeries[0]
    return null
  }, [browseSeries, featuredSeries, popularSeries])

  const speakersRail = useMemo(() => {
    const map = new Map<string, LectureSeries>()
    for (const series of browseSeries) {
      const name = series.speaker?.name?.trim()
      if (!name || map.has(name)) continue
      map.set(name, series)
      if (map.size >= SECTION_LIMIT) break
    }
    return [...map.values()]
  }, [browseSeries])

  const institutionsRail = useMemo(() => {
    const map = new Map<string, LectureSeries>()
    for (const series of browseSeries) {
      const name = series.institution?.name?.trim()
      if (!name || map.has(name)) continue
      map.set(name, series)
      if (map.size >= SECTION_LIMIT) break
    }
    return [...map.values()]
  }, [browseSeries])

  const languagesRail = useMemo(() => {
    const set = new Set<string>()
    for (const series of browseSeries) {
      if (series.language) set.add(series.language)
    }
    return [...set].slice(0, 8)
  }, [browseSeries])

  return {
    categories,
    featuredSeries,
    popularSeries,
    recentSeries,
    browseSeries,
    filteredSeries,
    heroSeries,
    speakersRail,
    institutionsRail,
    languagesRail,
    pagination,
    loading: filteredView ? false : loading,
    contentLoading,
    loadingMore,
    error: filteredView ? null : error,
    contentError,
    filteredView,
    loadMore,
    retry,
  }
}

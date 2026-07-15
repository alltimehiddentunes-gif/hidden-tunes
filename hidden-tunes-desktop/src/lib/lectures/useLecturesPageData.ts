import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchLectureCategories,
  fetchLectureCategory,
  fetchLectureItems,
  searchLectures,
} from './lectureCatalogApi'
import type { LectureCategory, LecturePagination, LectureSeries } from './types'

const SEARCH_DEBOUNCE_MS = 300
const FEATURED_LIMIT = 12
const SECTION_LIMIT = 12
const BROWSE_LIMIT = 40

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

export function useLecturesPageData(
  searchQuery: string,
  categorySlug: string | null,
  mediaFilter: LecturesMediaFilter = 'all',
  languageFilter: string | null = null,
) {
  const [categories, setCategories] = useState<LectureCategory[]>([])
  const [featuredSeries, setFeaturedSeries] = useState<LectureSeries[]>([])
  const [popularSeries, setPopularSeries] = useState<LectureSeries[]>([])
  const [recentSeries, setRecentSeries] = useState<LectureSeries[]>([])
  const [browseSeries, setBrowseSeries] = useState<LectureSeries[]>([])
  const [filteredSeries, setFilteredSeries] = useState<LectureSeries[]>([])
  const [pagination, setPagination] = useState<LecturePagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contentError, setContentError] = useState<string | null>(null)
  const bootstrapRef = useRef(0)
  const browseRef = useRef(0)
  const loadMoreRef = useRef(0)
  const browseAbortRef = useRef<AbortController | null>(null)

  const trimmedSearch = searchQuery.trim()
  const filteredView =
    trimmedSearch.length > 0 || Boolean(categorySlug) || mediaFilter !== 'all' || Boolean(languageFilter)

  useEffect(() => {
    const requestId = ++bootstrapRef.current
    const controller = new AbortController()

    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const nextCategories = await fetchLectureCategories(controller.signal)
        if (requestId !== bootstrapRef.current) return
        setCategories(nextCategories)

        // Sample a few categories (page size 8 each) for a diversified home — never full catalog.
        const sampleSlugs = nextCategories.slice(0, 5).map((category) => category.slug)
        const categoryPages = await Promise.all(
          sampleSlugs.map((slug) =>
            fetchLectureCategory(slug, { page: 1, limit: 8 }, controller.signal),
          ),
        )
        if (requestId !== bootstrapRef.current) return

        const all = dedupeSeries(categoryPages.flatMap((page) => page.series))
        const featured = all.filter((series) => series.isFeatured).slice(0, FEATURED_LIMIT)
        setFeaturedSeries(featured.length > 0 ? featured : all.slice(0, FEATURED_LIMIT))
        setPopularSeries(all.slice(0, SECTION_LIMIT))
        setRecentSeries(
          [...all]
            .sort((a, b) => Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? ''))
            .slice(0, SECTION_LIMIT),
        )
        setBrowseSeries(all.slice(0, BROWSE_LIMIT))
        setPagination({
          page: 1,
          limit: BROWSE_LIMIT,
          total: null,
          totalPages: null,
          hasMore: nextCategories.length > sampleSlugs.length || all.length >= BROWSE_LIMIT,
        })
      } catch (reason) {
        if (requestId !== bootstrapRef.current) return
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(readError(reason, 'We couldn\u2019t load Lectures right now.'))
      } finally {
        if (requestId === bootstrapRef.current) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!filteredView) {
      setFilteredSeries([])
      setContentError(null)
      setContentLoading(false)
      return
    }

    browseAbortRef.current?.abort()
    const controller = new AbortController()
    browseAbortRef.current = controller
    const requestId = ++browseRef.current

    const timer = window.setTimeout(() => {
      void (async () => {
        setContentLoading(true)
        setContentError(null)
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

          if (languageFilter) {
            series = series.filter(
              (entry) => entry.language?.toLowerCase() === languageFilter.toLowerCase(),
            )
          }

          if (mediaFilter === 'audio') {
            series = series.filter((entry) => entry.mediaType !== 'video')
          } else if (mediaFilter === 'video') {
            series = series.filter((entry) => entry.mediaType === 'video')
          }

          setFilteredSeries(series)
          setPagination(nextPagination)
        } catch (reason) {
          if (requestId !== browseRef.current) return
          if (reason instanceof DOMException && reason.name === 'AbortError') return
          setContentError(readError(reason, 'Unable to load lecture results.'))
          setFilteredSeries([])
        } finally {
          if (requestId === browseRef.current) setContentLoading(false)
        }
      })()
    }, trimmedSearch ? SEARCH_DEBOUNCE_MS : 0)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [trimmedSearch, categorySlug, mediaFilter, languageFilter, filteredView])

  const loadMore = useCallback(() => {
    if (!pagination?.hasMore || loadingMore) return

    const requestId = ++loadMoreRef.current
    const controller = new AbortController()
    setLoadingMore(true)

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

        const mergeInto = filteredView ? setFilteredSeries : setBrowseSeries
        mergeInto((previous) => dedupeSeries([...previous, ...series]))
        setPagination(nextPagination)
      } catch (reason) {
        if (requestId !== loadMoreRef.current) return
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setContentError(readError(reason, 'Unable to load more lectures.'))
      } finally {
        if (requestId === loadMoreRef.current) setLoadingMore(false)
      }
    })()
  }, [categorySlug, filteredView, loadingMore, pagination, trimmedSearch])

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
    loading,
    contentLoading,
    loadingMore,
    error,
    contentError,
    filteredView,
    loadMore,
  }
}

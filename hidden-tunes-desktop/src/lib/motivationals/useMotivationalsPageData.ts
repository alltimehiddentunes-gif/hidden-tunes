import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchMotivationalCategories,
  fetchMotivationalItems,
  fetchMotivationalPrograms,
  searchMotivationals,
  sessionToStandaloneProgram,
} from './motivationalCatalogApi'
import type {
  MotivationalCategoryMeta,
  MotivationalPagination,
  MotivationalProgramMeta,
} from './types'

const SEARCH_DEBOUNCE_MS = 280
const FEATURED_LIMIT = 12
const SECTION_LIMIT = 12
const BROWSE_LIMIT = 40

export type MotivationalsMediaFilter = 'all' | 'audio' | 'video'

type BrowsePagination = MotivationalPagination & { nextCursor?: string | null }
type CatalogSource = 'programs' | 'items'
type FilterSource = CatalogSource | 'search' | null

function readError(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

function dedupePrograms(programs: MotivationalProgramMeta[]) {
  const seen = new Set<string>()
  const next: MotivationalProgramMeta[] = []
  for (const program of programs) {
    if (seen.has(program.id)) continue
    seen.add(program.id)
    next.push(program)
  }
  return next
}

function isVideoProgram(program: MotivationalProgramMeta) {
  return program.mediaType === 'video' || program.mediaType === 'stream'
}

function isAudioProgram(program: MotivationalProgramMeta) {
  return !isVideoProgram(program)
}

export function useMotivationalsPageData(
  searchQuery: string,
  categorySlug: string | null,
  mediaFilter: MotivationalsMediaFilter = 'all',
  languageFilter: string | null = null,
  countryFilter: string | null = null,
) {
  const [categories, setCategories] = useState<MotivationalCategoryMeta[]>([])
  const [featuredPrograms, setFeaturedPrograms] = useState<MotivationalProgramMeta[]>([])
  const [audioPrograms, setAudioPrograms] = useState<MotivationalProgramMeta[]>([])
  const [videoPrograms, setVideoPrograms] = useState<MotivationalProgramMeta[]>([])
  const [browsePrograms, setBrowsePrograms] = useState<MotivationalProgramMeta[]>([])
  const [filteredPrograms, setFilteredPrograms] = useState<MotivationalProgramMeta[]>([])
  const [browsePagination, setBrowsePagination] = useState<BrowsePagination | null>(null)
  const [filteredPagination, setFilteredPagination] = useState<BrowsePagination | null>(null)
  const [browseCursor, setBrowseCursor] = useState<string | null>(null)
  const [filteredCursor, setFilteredCursor] = useState<string | null>(null)
  const [catalogSource, setCatalogSource] = useState<CatalogSource | null>(null)
  const [loading, setLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contentError, setContentError] = useState<string | null>(null)
  const categoriesRef = useRef(0)
  const bootstrapRef = useRef(0)
  const browseRef = useRef(0)
  const loadMoreRef = useRef(0)
  const browseAbortRef = useRef<AbortController | null>(null)
  const loadMoreAbortRef = useRef<AbortController | null>(null)

  const trimmedSearch = searchQuery.trim()
  const filteredView =
    trimmedSearch.length > 0
    || Boolean(categorySlug)
    || mediaFilter !== 'all'
    || Boolean(languageFilter)
    || Boolean(countryFilter)

  const browseMediaType = mediaFilter === 'audio' || mediaFilter === 'video' ? mediaFilter : null
  const filterSource: FilterSource = trimmedSearch ? 'search' : catalogSource

  useEffect(() => {
    const requestId = ++categoriesRef.current
    const controller = new AbortController()

    void (async () => {
      try {
        const nextCategories = await fetchMotivationalCategories(controller.signal)
        if (controller.signal.aborted || requestId !== categoriesRef.current) return
        setCategories(nextCategories)
      } catch {
        // Categories are auxiliary. Their slow/error state must not block primary content.
      }
    })()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const requestId = ++bootstrapRef.current
    const controller = new AbortController()

    void (async () => {
      setLoading(true)
      setError(null)

      try {
        const [programsResult, itemsResult] = await Promise.allSettled([
          fetchMotivationalPrograms({ page: 1, limit: BROWSE_LIMIT }, controller.signal),
          fetchMotivationalItems({ limit: BROWSE_LIMIT }, controller.signal),
        ])

        if (controller.signal.aborted || requestId !== bootstrapRef.current) return

        let source: CatalogSource
        let nextPrograms: MotivationalProgramMeta[]
        let nextPagination: BrowsePagination
        let nextCursor: string | null

        if (programsResult.status === 'fulfilled' && programsResult.value.programs.length > 0) {
          source = 'programs'
          nextPrograms = programsResult.value.programs
          nextPagination = programsResult.value.pagination
          nextCursor = null
        } else if (itemsResult.status === 'fulfilled') {
          source = 'items'
          nextPrograms = itemsResult.value.programs
          nextPagination = itemsResult.value.pagination
          nextCursor = itemsResult.value.pagination.nextCursor
        } else {
          const reason = itemsResult.reason
            ?? (programsResult.status === 'rejected' ? programsResult.reason : null)
          throw reason instanceof Error
            ? reason
            : new Error('We couldn\u2019t load Motivationals right now.')
        }

        const featured = nextPrograms.filter((program) => program.isFeatured)
        setCatalogSource(source)
        setFeaturedPrograms(
          (featured.length > 0 ? featured : nextPrograms).slice(0, FEATURED_LIMIT),
        )
        setAudioPrograms(nextPrograms.filter(isAudioProgram).slice(0, SECTION_LIMIT))
        setVideoPrograms(nextPrograms.filter(isVideoProgram).slice(0, SECTION_LIMIT))
        setBrowsePrograms(nextPrograms)
        setBrowsePagination(nextPagination)
        setBrowseCursor(nextCursor)
      } catch (reason) {
        if (controller.signal.aborted || requestId !== bootstrapRef.current) return
        setError(readError(reason, 'We couldn\u2019t load Motivationals right now.'))
      } finally {
        if (!controller.signal.aborted && requestId === bootstrapRef.current) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    browseAbortRef.current?.abort()
    loadMoreAbortRef.current?.abort()
    loadMoreAbortRef.current = null
    loadMoreRef.current += 1

    const controller = new AbortController()
    browseAbortRef.current = controller
    const requestId = ++browseRef.current
    const resetTimer = window.setTimeout(() => {
      if (controller.signal.aborted || requestId !== browseRef.current) return
      setLoadingMore(false)
      setContentLoading(filteredView)
      setContentError(null)
      setFilteredPrograms([])
      setFilteredPagination(null)
      setFilteredCursor(null)
    }, 0)

    if (!filteredView) {
      return () => {
        window.clearTimeout(resetTimer)
        controller.abort()
        loadMoreAbortRef.current?.abort()
        loadMoreAbortRef.current = null
        loadMoreRef.current += 1
      }
    }

    if (!filterSource) {
      return () => {
        window.clearTimeout(resetTimer)
        controller.abort()
        loadMoreAbortRef.current?.abort()
        loadMoreAbortRef.current = null
        loadMoreRef.current += 1
      }
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = filterSource === 'search'
            ? await searchMotivationals(trimmedSearch, { page: 1, limit: BROWSE_LIMIT }, controller.signal).then(
                (searchResponse) => ({
                  programs: searchResponse.sessions.map(sessionToStandaloneProgram),
                  pagination: searchResponse.pagination,
                  nextCursor: null as string | null,
                }),
              )
            : filterSource === 'items'
              ? await fetchMotivationalItems(
                  {
                    limit: BROWSE_LIMIT,
                    cursor: null,
                    category: categorySlug,
                    mediaType: browseMediaType,
                    language: languageFilter,
                    country: countryFilter,
                  },
                  controller.signal,
                ).then((itemsResponse) => ({
                  programs: itemsResponse.programs,
                  pagination: itemsResponse.pagination,
                  nextCursor: itemsResponse.pagination.nextCursor,
                }))
              : await fetchMotivationalPrograms(
                  { page: 1, limit: BROWSE_LIMIT, category: categorySlug },
                  controller.signal,
                ).then((programsResponse) => ({
                  programs: programsResponse.programs,
                  pagination: programsResponse.pagination,
                  nextCursor: null as string | null,
                }))

          if (controller.signal.aborted || requestId !== browseRef.current) return
          setFilteredPrograms(response.programs)
          setFilteredPagination(response.pagination)
          setFilteredCursor(response.nextCursor)
        } catch (reason) {
          if (controller.signal.aborted || requestId !== browseRef.current) return
          setContentError(readError(reason, 'Could not load motivational results.'))
          setFilteredPrograms([])
          setFilteredPagination(null)
          setFilteredCursor(null)
        } finally {
          if (!controller.signal.aborted && requestId === browseRef.current) setContentLoading(false)
        }
      })()
    }, trimmedSearch ? SEARCH_DEBOUNCE_MS : 0)

    return () => {
      window.clearTimeout(resetTimer)
      window.clearTimeout(timer)
      controller.abort()
      loadMoreAbortRef.current?.abort()
      loadMoreAbortRef.current = null
      loadMoreRef.current += 1
    }
  }, [
    browseMediaType,
    categorySlug,
    countryFilter,
    filteredView,
    filterSource,
    languageFilter,
    trimmedSearch,
  ])

  const pagination = filteredView ? filteredPagination : browsePagination
  const activeCursor = filteredView ? filteredCursor : browseCursor

  const loadMore = useCallback(() => {
    if (!pagination?.hasMore || loadingMore || loadMoreAbortRef.current) return
    if (!filterSource && filteredView) return

    const requestId = ++loadMoreRef.current
    const controller = new AbortController()
    loadMoreAbortRef.current = controller
    setLoadingMore(true)

    void (async () => {
      try {
        const response = filterSource === 'search'
          ? await searchMotivationals(
              trimmedSearch,
              { page: (pagination.page ?? 1) + 1, limit: BROWSE_LIMIT },
              controller.signal,
            ).then((searchResponse) => ({
              programs: searchResponse.sessions.map(sessionToStandaloneProgram),
              pagination: searchResponse.pagination,
              nextCursor: null as string | null,
            }))
          : catalogSource === 'items'
            ? await fetchMotivationalItems(
                {
                  limit: BROWSE_LIMIT,
                  cursor: activeCursor,
                  category: categorySlug,
                  mediaType: browseMediaType,
                  language: languageFilter,
                  country: countryFilter,
                },
                controller.signal,
              ).then((itemsResponse) => ({
                programs: itemsResponse.programs,
                pagination: itemsResponse.pagination,
                nextCursor: itemsResponse.pagination.nextCursor,
              }))
            : await fetchMotivationalPrograms(
                {
                  page: (pagination.page ?? 1) + 1,
                  limit: BROWSE_LIMIT,
                  category: categorySlug,
                },
                controller.signal,
              ).then((programsResponse) => ({
                programs: programsResponse.programs,
                pagination: programsResponse.pagination,
                nextCursor: null as string | null,
              }))

        if (controller.signal.aborted || requestId !== loadMoreRef.current) return

        if (filteredView) {
          setFilteredPagination(response.pagination)
          setFilteredCursor(response.nextCursor)
          setFilteredPrograms((previous) => dedupePrograms([...previous, ...response.programs]))
        } else {
          setBrowsePagination(response.pagination)
          setBrowseCursor(response.nextCursor)
          setBrowsePrograms((previous) => dedupePrograms([...previous, ...response.programs]))
        }
      } catch {
        // Ignore pagination failures.
      } finally {
        if (!controller.signal.aborted && requestId === loadMoreRef.current) setLoadingMore(false)
        if (loadMoreAbortRef.current === controller) loadMoreAbortRef.current = null
      }
    })()
  }, [
    activeCursor,
    browseMediaType,
    catalogSource,
    categorySlug,
    countryFilter,
    filterSource,
    filteredView,
    languageFilter,
    loadingMore,
    pagination,
    trimmedSearch,
  ])

  const visiblePrograms = useMemo(
    () => (filteredView ? filteredPrograms : browsePrograms),
    [browsePrograms, filteredPrograms, filteredView],
  )

  const heroProgram = useMemo(
    () => featuredPrograms[0] ?? browsePrograms[0] ?? null,
    [browsePrograms, featuredPrograms],
  )

  const popularSpeakers = useMemo(() => {
    const counts = new Map<string, number>()
    for (const program of browsePrograms) {
      const speaker = program.subtitle?.trim()
      if (!speaker) continue
      counts.set(speaker, (counts.get(speaker) || 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([name]) => name)
  }, [browsePrograms])

  return {
    categories,
    featuredPrograms,
    audioPrograms,
    videoPrograms,
    browsePrograms,
    visiblePrograms,
    heroProgram,
    popularSpeakers,
    pagination,
    loading,
    contentLoading,
    loadingMore,
    error,
    contentError,
    filteredView,
    loadMore,
    isSearchView: trimmedSearch.length > 0,
  }
}

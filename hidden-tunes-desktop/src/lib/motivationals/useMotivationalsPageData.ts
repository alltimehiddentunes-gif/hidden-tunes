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
  const [pagination, setPagination] = useState<BrowsePagination | null>(null)
  const [browseCursor, setBrowseCursor] = useState<string | null>(null)
  const [useItemsCatalog, setUseItemsCatalog] = useState(false)
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
    trimmedSearch.length > 0
    || Boolean(categorySlug)
    || mediaFilter !== 'all'
    || Boolean(languageFilter)
    || Boolean(countryFilter)

  const browseMediaType = mediaFilter === 'audio' || mediaFilter === 'video' ? mediaFilter : null

  useEffect(() => {
    const requestId = ++bootstrapRef.current
    const controller = new AbortController()

    void (async () => {
      setLoading(true)
      setError(null)

      try {
        const [nextCategories, featuredResponse, browseResponse, itemsResponse, audioResponse, videoResponse] =
          await Promise.all([
            fetchMotivationalCategories(controller.signal),
            fetchMotivationalPrograms(
              { page: 1, limit: FEATURED_LIMIT, featuredOnly: true },
              controller.signal,
            ),
            fetchMotivationalPrograms({ page: 1, limit: BROWSE_LIMIT }, controller.signal),
            fetchMotivationalItems({ limit: BROWSE_LIMIT }, controller.signal),
            fetchMotivationalItems(
              { limit: SECTION_LIMIT, mediaType: 'audio' },
              controller.signal,
            ),
            fetchMotivationalItems(
              { limit: SECTION_LIMIT, mediaType: 'video' },
              controller.signal,
            ),
          ])

        if (requestId !== bootstrapRef.current) return

        setCategories(nextCategories)

        const programsAvailable = browseResponse.programs.length > 0
        setUseItemsCatalog(!programsAvailable)

        if (programsAvailable) {
          setFeaturedPrograms(
            featuredResponse.programs.length > 0
              ? featuredResponse.programs.slice(0, FEATURED_LIMIT)
              : browseResponse.programs.filter((program) => program.isFeatured).slice(0, FEATURED_LIMIT),
          )
          setAudioPrograms(
            browseResponse.programs.filter(isAudioProgram).slice(0, SECTION_LIMIT),
          )
          setVideoPrograms(
            browseResponse.programs.filter(isVideoProgram).slice(0, SECTION_LIMIT),
          )
          setBrowsePrograms(browseResponse.programs)
          setPagination(browseResponse.pagination)
          setBrowseCursor(null)
          return
        }

        const featuredItems = itemsResponse.programs.filter((program) => program.isFeatured)
        setFeaturedPrograms(
          featuredItems.length > 0
            ? featuredItems.slice(0, FEATURED_LIMIT)
            : itemsResponse.programs.slice(0, FEATURED_LIMIT),
        )
        setAudioPrograms(audioResponse.programs.slice(0, SECTION_LIMIT))
        setVideoPrograms(videoResponse.programs.slice(0, SECTION_LIMIT))
        setBrowsePrograms(itemsResponse.programs)
        setPagination(itemsResponse.pagination)
        setBrowseCursor(itemsResponse.pagination.nextCursor)
      } catch (reason) {
        if (requestId !== bootstrapRef.current) return
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(readError(reason, 'We couldn\u2019t load Motivationals right now.'))
      } finally {
        if (requestId === bootstrapRef.current) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    browseAbortRef.current?.abort()
    const controller = new AbortController()
    browseAbortRef.current = controller
    const requestId = ++browseRef.current

    if (!filteredView) {
      return () => controller.abort()
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        setContentLoading(true)
        setContentError(null)

        try {
          const response = trimmedSearch
            ? await searchMotivationals(trimmedSearch, { page: 1, limit: BROWSE_LIMIT }, controller.signal).then(
                (searchResponse) => ({
                  programs: searchResponse.sessions.map(sessionToStandaloneProgram),
                  pagination: searchResponse.pagination,
                  nextCursor: null as string | null,
                }),
              )
            : useItemsCatalog
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

          if (requestId !== browseRef.current) return
          setFilteredPrograms(response.programs)
          setPagination(response.pagination)
          setBrowseCursor(response.nextCursor)
        } catch (reason) {
          if (requestId !== browseRef.current) return
          if (reason instanceof DOMException && reason.name === 'AbortError') return
          setContentError(readError(reason, 'Could not load motivational results.'))
          setFilteredPrograms([])
        } finally {
          if (requestId === browseRef.current) setContentLoading(false)
        }
      })()
    }, trimmedSearch ? SEARCH_DEBOUNCE_MS : 0)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [
    browseMediaType,
    categorySlug,
    countryFilter,
    filteredView,
    languageFilter,
    trimmedSearch,
    useItemsCatalog,
  ])

  const loadMore = useCallback(() => {
    if (!pagination?.hasMore || loadingMore) return
    const requestId = ++loadMoreRef.current
    const controller = new AbortController()
    setLoadingMore(true)

    void (async () => {
      try {
        const response = trimmedSearch
          ? await searchMotivationals(
              trimmedSearch,
              { page: (pagination.page ?? 1) + 1, limit: BROWSE_LIMIT },
              controller.signal,
            ).then((searchResponse) => ({
              programs: searchResponse.sessions.map(sessionToStandaloneProgram),
              pagination: searchResponse.pagination,
              nextCursor: null as string | null,
            }))
          : useItemsCatalog
            ? await fetchMotivationalItems(
                {
                  limit: BROWSE_LIMIT,
                  cursor: browseCursor,
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

        if (requestId !== loadMoreRef.current) return

        setPagination(response.pagination)
        setBrowseCursor(response.nextCursor)
        if (filteredView) {
          setFilteredPrograms((previous) => dedupePrograms([...previous, ...response.programs]))
        } else {
          setBrowsePrograms((previous) => dedupePrograms([...previous, ...response.programs]))
        }
      } catch {
        // Ignore pagination failures.
      } finally {
        if (requestId === loadMoreRef.current) setLoadingMore(false)
      }
    })()
  }, [
    browseCursor,
    browseMediaType,
    categorySlug,
    countryFilter,
    filteredView,
    languageFilter,
    loadingMore,
    pagination,
    trimmedSearch,
    useItemsCatalog,
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

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
const BROWSE_LIMIT = 40

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

export function useMotivationalsPageData(searchQuery: string, categorySlug: string | null) {
  const [categories, setCategories] = useState<MotivationalCategoryMeta[]>([])
  const [featuredPrograms, setFeaturedPrograms] = useState<MotivationalProgramMeta[]>([])
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
  const browseAbortRef = useRef<AbortController | null>(null)

  const trimmedSearch = searchQuery.trim()
  const filteredView = trimmedSearch.length > 0 || Boolean(categorySlug)

  useEffect(() => {
    const requestId = ++bootstrapRef.current
    const controller = new AbortController()

    void (async () => {
      setLoading(true)
      setError(null)

      try {
        const [nextCategories, featuredResponse, browseResponse, itemsResponse] = await Promise.all([
          fetchMotivationalCategories(controller.signal),
          fetchMotivationalPrograms(
            { page: 1, limit: FEATURED_LIMIT, featuredOnly: true },
            controller.signal,
          ),
          fetchMotivationalPrograms({ page: 1, limit: BROWSE_LIMIT }, controller.signal),
          fetchMotivationalItems({ limit: BROWSE_LIMIT }, controller.signal),
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
                  { limit: BROWSE_LIMIT, category: categorySlug },
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
  }, [categorySlug, filteredView, trimmedSearch, useItemsCatalog])

  const loadMore = useCallback(() => {
    if (!pagination?.hasMore || loadingMore) return
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
        setLoadingMore(false)
      }
    })()
  }, [
    browseCursor,
    categorySlug,
    filteredView,
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

  return {
    categories,
    featuredPrograms,
    browsePrograms,
    visiblePrograms,
    heroProgram,
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

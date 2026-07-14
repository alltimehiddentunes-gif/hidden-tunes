import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchPodcastCategories,
  fetchPodcastEpisodes,
  fetchPodcastFeaturedShows,
  fetchPodcastShows,
} from './podcastCatalogApi'
import { enrichPodcastEpisodesWithShowTitles } from './podcastShowEnrichment'
import type {
  PodcastCategoryMeta,
  PodcastEpisodeMeta,
  PodcastPagination,
  PodcastShowMeta,
  PodcastTabId,
} from './types'

const SEARCH_DEBOUNCE_MS = 280
const FEATURED_SHOWS_LIMIT = 12
const BROWSE_SHOWS_LIMIT = 24
const EPISODES_LIMIT = 16
const FALLBACK_SHOWS_LIMIT = 12

export type PodcastFeaturedSource = 'featured' | 'fallback' | 'browse' | 'empty'

function readError(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

function resolveCategoryFilter(
  activeTab: PodcastTabId,
  selectedCategorySlug: string | null,
  categories: PodcastCategoryMeta[],
) {
  if (selectedCategorySlug) return selectedCategorySlug

  if (activeTab === 'all') return null

  const match = categories.find(
    (category) =>
      category.slug === activeTab
      || category.id === activeTab
      || category.slug.toLowerCase() === activeTab.toLowerCase(),
  )

  return match?.slug ?? activeTab
}

function isFilteredView(activeTab: PodcastTabId, searchQuery: string) {
  return searchQuery.trim().length > 0 || activeTab !== 'all'
}

export function usePodcastsPageData(activeTab: PodcastTabId, searchQuery: string) {
  const [featuredShows, setFeaturedShows] = useState<PodcastShowMeta[]>([])
  const [fallbackShows, setFallbackShows] = useState<PodcastShowMeta[]>([])
  const [browseShows, setBrowseShows] = useState<PodcastShowMeta[]>([])
  const [catalogEpisodes, setCatalogEpisodes] = useState<PodcastEpisodeMeta[]>([])
  const [browseEpisodes, setBrowseEpisodes] = useState<PodcastEpisodeMeta[]>([])
  const [categories, setCategories] = useState<PodcastCategoryMeta[]>([])
  const [showsPagination, setShowsPagination] = useState<PodcastPagination | null>(null)
  const [episodesPagination, setEpisodesPagination] = useState<PodcastPagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(false)
  const [showsLoadingMore, setShowsLoadingMore] = useState(false)
  const [episodesLoadingMore, setEpisodesLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contentError, setContentError] = useState<string | null>(null)
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string | null>(null)
  const bootstrapRequestRef = useRef(0)
  const browseRequestRef = useRef(0)
  const browseAbortRef = useRef<AbortController | null>(null)
  const knownShowsRef = useRef<PodcastShowMeta[]>([])

  const trimmedSearch = searchQuery.trim()
  const filteredView = isFilteredView(activeTab, trimmedSearch)

  const rememberShows = useCallback((shows: PodcastShowMeta[]) => {
    if (shows.length === 0) return
    const map = new Map(knownShowsRef.current.map((show) => [show.id, show]))
    for (const show of shows) {
      map.set(show.id, show)
    }
    knownShowsRef.current = Array.from(map.values())
  }, [])

  const enrichEpisodes = useCallback(
    async (episodes: PodcastEpisodeMeta[], signal?: AbortSignal) => {
      return enrichPodcastEpisodesWithShowTitles(
        episodes,
        knownShowsRef.current,
        signal,
      )
    },
    [],
  )

  const loadBootstrap = useCallback(async () => {
    const requestId = ++bootstrapRequestRef.current
    setLoading(true)
    setError(null)
    setContentError(null)
    knownShowsRef.current = []

    try {
      const [categoriesResult, featuredResult, episodesResult] = await Promise.allSettled([
        fetchPodcastCategories(),
        fetchPodcastFeaturedShows({ page: 1, limit: FEATURED_SHOWS_LIMIT }),
        fetchPodcastEpisodes({ page: 1, limit: EPISODES_LIMIT }),
      ])

      if (requestId !== bootstrapRequestRef.current) return

      const failures: string[] = []
      let nextFeatured: PodcastShowMeta[] = []
      let nextFallback: PodcastShowMeta[] = []
      let nextEpisodes: PodcastEpisodeMeta[] = []
      let nextCategories: PodcastCategoryMeta[] = []

      if (categoriesResult.status === 'fulfilled') {
        nextCategories = categoriesResult.value
      } else {
        failures.push(readError(categoriesResult.reason, 'Failed to load categories.'))
      }

      if (featuredResult.status === 'fulfilled') {
        nextFeatured = featuredResult.value.shows
        rememberShows(nextFeatured)
      } else {
        failures.push(readError(featuredResult.reason, 'Failed to load featured shows.'))
      }

      if (episodesResult.status === 'fulfilled') {
        rememberShows(episodesResult.value.shows)
        nextEpisodes = await enrichEpisodes(episodesResult.value.episodes)
        setEpisodesPagination(episodesResult.value.pagination)
      } else {
        failures.push(readError(episodesResult.reason, 'Failed to load latest episodes.'))
      }

      if (nextFeatured.length === 0) {
        try {
          const fallbackResponse = await fetchPodcastShows({
            page: 1,
            limit: FALLBACK_SHOWS_LIMIT,
          })
          if (requestId !== bootstrapRequestRef.current) return
          nextFallback = fallbackResponse.shows
          rememberShows(nextFallback)
          setShowsPagination(fallbackResponse.pagination)
        } catch (fallbackError) {
          failures.push(readError(fallbackError, 'Failed to load podcast shows.'))
        }
      } else if (featuredResult.status === 'fulfilled') {
        setShowsPagination(featuredResult.value.pagination)
      }

      if (requestId !== bootstrapRequestRef.current) return

      setCategories(nextCategories)
      setFeaturedShows(nextFeatured)
      setFallbackShows(nextFallback)
      setCatalogEpisodes(nextEpisodes)
      setBrowseShows([])
      setBrowseEpisodes([])

      const hasRenderableData =
        nextCategories.length > 0
        || nextFeatured.length > 0
        || nextFallback.length > 0
        || nextEpisodes.length > 0

      if (!hasRenderableData) {
        setError(failures[0] ?? 'Failed to load podcast catalog.')
      }
    } catch (err) {
      if (requestId !== bootstrapRequestRef.current) return
      setError(readError(err, 'Failed to load podcast catalog.'))
    } finally {
      if (requestId === bootstrapRequestRef.current) {
        setLoading(false)
      }
    }
  }, [enrichEpisodes, rememberShows])

  const runBrowse = useCallback(
    async (requestId: number, signal: AbortSignal) => {
      const category = resolveCategoryFilter(activeTab, selectedCategorySlug, categories)

      if (!filteredView) {
        if (requestId !== browseRequestRef.current) return
        setBrowseShows([])
        setBrowseEpisodes([])
        setContentError(null)
        return
      }

      const [showsResponse, episodesResponse] = await Promise.all([
        fetchPodcastShows(
          {
            page: 1,
            limit: BROWSE_SHOWS_LIMIT,
            query: trimmedSearch || undefined,
            category: category ?? undefined,
          },
          signal,
        ),
        fetchPodcastEpisodes(
          {
            page: 1,
            limit: EPISODES_LIMIT,
            query: trimmedSearch || undefined,
            category: category ?? undefined,
          },
          signal,
        ),
      ])

      if (signal.aborted || requestId !== browseRequestRef.current) return

      rememberShows([...showsResponse.shows, ...episodesResponse.shows])
      const enrichedEpisodes = await enrichEpisodes(episodesResponse.episodes, signal)

      if (signal.aborted || requestId !== browseRequestRef.current) return

      setBrowseShows(showsResponse.shows)
      setBrowseEpisodes(enrichedEpisodes)
      setShowsPagination(showsResponse.pagination)
      setEpisodesPagination(episodesResponse.pagination)
      setContentError(null)
    },
    [
      activeTab,
      categories,
      enrichEpisodes,
      filteredView,
      rememberShows,
      selectedCategorySlug,
      trimmedSearch,
    ],
  )

  const loadBrowse = useCallback(async () => {
    browseAbortRef.current?.abort()

    if (!isFilteredView(activeTab, trimmedSearch)) {
      setBrowseShows([])
      setBrowseEpisodes([])
      setContentError(null)
      return
    }

    const controller = new AbortController()
    browseAbortRef.current = controller

    const requestId = ++browseRequestRef.current
    setContentLoading(true)
    setContentError(null)

    try {
      await runBrowse(requestId, controller.signal)
    } catch (err) {
      if (controller.signal.aborted || requestId !== browseRequestRef.current) return
      setBrowseShows([])
      setBrowseEpisodes([])
      setContentError(readError(err, 'Failed to load podcasts.'))
    } finally {
      if (requestId === browseRequestRef.current) {
        setContentLoading(false)
      }
    }
  }, [activeTab, runBrowse, trimmedSearch])

  useEffect(() => {
    void loadBootstrap()
  }, [loadBootstrap])

  useEffect(() => {
    if (activeTab === 'all') {
      setSelectedCategorySlug(null)
    }
  }, [activeTab])

  useEffect(() => {
    if (loading) return

    const timer = globalThis.setTimeout(() => {
      void loadBrowse()
    }, trimmedSearch ? SEARCH_DEBOUNCE_MS : 0)

    return () => {
      globalThis.clearTimeout(timer)
      browseAbortRef.current?.abort()
    }
  }, [activeTab, categories, loading, loadBrowse, selectedCategorySlug, trimmedSearch])

  const latestEpisodes = filteredView ? browseEpisodes : catalogEpisodes

  const featuredSectionShows = useMemo(() => {
    if (filteredView) return browseShows
    if (featuredShows.length > 0) return featuredShows
    return fallbackShows
  }, [browseShows, fallbackShows, featuredShows, filteredView])

  const featuredSource = useMemo<PodcastFeaturedSource>(() => {
    if (filteredView) return browseShows.length > 0 ? 'browse' : 'empty'
    if (featuredShows.length > 0) return 'featured'
    if (fallbackShows.length > 0) return 'fallback'
    return 'empty'
  }, [browseShows.length, fallbackShows.length, featuredShows.length, filteredView])

  const loadMoreShows = useCallback(async () => {
    if (!showsPagination?.hasMore || showsLoadingMore) return

    const category = resolveCategoryFilter(activeTab, selectedCategorySlug, categories)
    const nextPage = showsPagination.page + 1
    setShowsLoadingMore(true)

    try {
      if (filteredView) {
        const response = await fetchPodcastShows({
          page: nextPage,
          limit: BROWSE_SHOWS_LIMIT,
          query: trimmedSearch || undefined,
          category: category ?? undefined,
        })
        rememberShows(response.shows)
        setBrowseShows((current) => [...current, ...response.shows])
        setShowsPagination(response.pagination)
        return
      }

      if (featuredShows.length > 0) {
        const response = await fetchPodcastFeaturedShows({
          page: nextPage,
          limit: FEATURED_SHOWS_LIMIT,
        })
        rememberShows(response.shows)
        setFeaturedShows((current) => [...current, ...response.shows])
        setShowsPagination(response.pagination)
        return
      }

      const response = await fetchPodcastShows({
        page: nextPage,
        limit: FALLBACK_SHOWS_LIMIT,
      })
      rememberShows(response.shows)
      setFallbackShows((current) => [...current, ...response.shows])
      setShowsPagination(response.pagination)
    } catch (err) {
      setContentError(readError(err, 'Failed to load more shows.'))
    } finally {
      setShowsLoadingMore(false)
    }
  }, [
    activeTab,
    categories,
    featuredShows.length,
    filteredView,
    rememberShows,
    selectedCategorySlug,
    showsLoadingMore,
    showsPagination,
    trimmedSearch,
  ])

  const loadMoreEpisodes = useCallback(async () => {
    if (!episodesPagination?.hasMore || episodesLoadingMore) return

    const category = resolveCategoryFilter(activeTab, selectedCategorySlug, categories)
    const nextPage = episodesPagination.page + 1
    setEpisodesLoadingMore(true)

    try {
      const response = await fetchPodcastEpisodes({
        page: nextPage,
        limit: EPISODES_LIMIT,
        query: filteredView ? trimmedSearch || undefined : undefined,
        category: filteredView ? category ?? undefined : undefined,
      })
      rememberShows(response.shows)
      const enriched = await enrichEpisodes(response.episodes)
      if (filteredView) {
        setBrowseEpisodes((current) => [...current, ...enriched])
      } else {
        setCatalogEpisodes((current) => [...current, ...enriched])
      }
      setEpisodesPagination(response.pagination)
    } catch (err) {
      setContentError(readError(err, 'Failed to load more episodes.'))
    } finally {
      setEpisodesLoadingMore(false)
    }
  }, [
    activeTab,
    categories,
    enrichEpisodes,
    episodesLoadingMore,
    episodesPagination,
    filteredView,
    rememberShows,
    selectedCategorySlug,
    trimmedSearch,
  ])

  const visibleTabs = useMemo(
    () => [
      { id: 'all' as PodcastTabId, label: 'All' },
      ...categories.map((category) => ({
        id: category.slug as PodcastTabId,
        label: category.name,
      })),
    ],
    [categories],
  )

  const categoryCards = useMemo(
    () =>
      categories.map((category) => ({
        id: category.id,
        slug: category.slug,
        label: category.name,
        description: category.description,
      })),
    [categories],
  )

  const hasRenderableContent =
    categories.length > 0
    || featuredSectionShows.length > 0
    || latestEpisodes.length > 0

  return {
    featuredSectionShows,
    featuredSource,
    latestEpisodes,
    categoryCards,
    categories,
    visibleTabs,
    loading,
    contentLoading,
    showsLoadingMore,
    episodesLoadingMore,
    error,
    contentError,
    showsPagination,
    episodesPagination,
    selectedCategorySlug,
    setSelectedCategorySlug,
    hasRenderableContent,
    loadMoreShows,
    loadMoreEpisodes,
    retry: loadBootstrap,
    retryBrowse: loadBrowse,
  }
}

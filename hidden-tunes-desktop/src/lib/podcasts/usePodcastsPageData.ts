import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchPodcastCategories,
  fetchPodcastEpisodes,
  fetchPodcastFeaturedShows,
  fetchPodcastShows,
  PodcastCatalogError,
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
const PODCASTS_PAGE_SNAPSHOT_TTL_MS = 5 * 60 * 1000
const PODCASTS_PAGE_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000

type PodcastsPageSnapshot = {
  categories: PodcastCategoryMeta[]
  featuredShows: PodcastShowMeta[]
  fallbackShows: PodcastShowMeta[]
  showsPagination: PodcastPagination | null
  cachedAt: number
}

let podcastsPageSnapshot: PodcastsPageSnapshot | null = null

function readPodcastsPageSnapshot() {
  if (!podcastsPageSnapshot) return null
  const ageMs = Date.now() - podcastsPageSnapshot.cachedAt
  if (ageMs > PODCASTS_PAGE_SNAPSHOT_MAX_AGE_MS) {
    podcastsPageSnapshot = null
    return null
  }
  return {
    snapshot: podcastsPageSnapshot,
    fresh: ageMs <= PODCASTS_PAGE_SNAPSHOT_TTL_MS,
  }
}

export type PodcastFeaturedSource = 'featured' | 'fallback' | 'browse' | 'empty'

function readError(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

function isCancelledError(reason: unknown, signal?: AbortSignal) {
  return (
    signal?.aborted === true
    || (reason instanceof PodcastCatalogError && reason.cancelled)
    || (reason instanceof DOMException && reason.name === 'AbortError')
    || (reason instanceof Error && reason.name === 'AbortError')
    || (reason instanceof Error && /cancelled|canceled|aborted/i.test(reason.message))
  )
}

function dedupeById<T extends { id: string }>(entries: T[]) {
  const byId = new Map<string, T>()
  for (const entry of entries) byId.set(entry.id, entry)
  return [...byId.values()]
}

/** Production global `/api/podcasts/episodes` (no show_id/category) times out with 500. */
function canFetchScopedEpisodes(options: {
  showId?: string | null
  category?: string | null
}) {
  return Boolean(options.showId?.trim() || options.category?.trim())
}

function isFilteredView(activeTab: PodcastTabId, searchQuery: string) {
  return searchQuery.trim().length > 0 || activeTab !== 'all'
}

export function usePodcastsPageData(activeTab: PodcastTabId, searchQuery: string) {
  const [initialSnapshot] = useState(() => readPodcastsPageSnapshot())
  const [featuredShows, setFeaturedShows] = useState<PodcastShowMeta[]>(
    () => initialSnapshot?.snapshot.featuredShows ?? [],
  )
  const [fallbackShows, setFallbackShows] = useState<PodcastShowMeta[]>(
    () => initialSnapshot?.snapshot.fallbackShows ?? [],
  )
  const [browseShows, setBrowseShows] = useState<PodcastShowMeta[]>([])
  const [browseEpisodes, setBrowseEpisodes] = useState<PodcastEpisodeMeta[]>([])
  const [categories, setCategories] = useState<PodcastCategoryMeta[]>(
    () => initialSnapshot?.snapshot.categories ?? [],
  )
  const [defaultShowsPagination, setDefaultShowsPagination] = useState<PodcastPagination | null>(
    () => initialSnapshot?.snapshot.showsPagination ?? null,
  )
  const [browseShowsPagination, setBrowseShowsPagination] = useState<PodcastPagination | null>(null)
  const [browseEpisodesPagination, setBrowseEpisodesPagination] = useState<PodcastPagination | null>(null)
  const [loading, setLoading] = useState(() => !initialSnapshot)
  const [contentLoading, setContentLoading] = useState(false)
  const [showsLoadingMore, setShowsLoadingMore] = useState(false)
  const [episodesLoadingMore, setEpisodesLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contentError, setContentError] = useState<string | null>(null)
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string | null>(null)
  const [bootstrapRetryNonce, setBootstrapRetryNonce] = useState(0)
  const [browseRetryNonce, setBrowseRetryNonce] = useState(0)
  const [browseDataIdentity, setBrowseDataIdentity] = useState<string | null>(null)
  const bootstrapRequestRef = useRef(0)
  const bootstrapAbortRef = useRef<AbortController | null>(null)
  const browseRequestRef = useRef(0)
  const browseAbortRef = useRef<AbortController | null>(null)
  const showsLoadMoreRequestRef = useRef(0)
  const showsLoadMoreAbortRef = useRef<AbortController | null>(null)
  const episodesLoadMoreRequestRef = useRef(0)
  const episodesLoadMoreAbortRef = useRef<AbortController | null>(null)
  const categoriesRef = useRef(categories)
  const featuredShowsRef = useRef(featuredShows)
  const fallbackShowsRef = useRef(fallbackShows)
  const defaultShowsPaginationRef = useRef(defaultShowsPagination)
  const browseShowsRef = useRef(browseShows)
  const browseEpisodesRef = useRef(browseEpisodes)
  const browseDataIdentityRef = useRef<string | null>(browseDataIdentity)
  const knownShowsRef = useRef<PodcastShowMeta[]>([
    ...featuredShows,
    ...fallbackShows,
  ])

  const trimmedSearch = searchQuery.trim()
  const filteredView = isFilteredView(activeTab, trimmedSearch)
  const effectiveSelectedCategorySlug = activeTab === 'all' ? null : selectedCategorySlug
  const category = effectiveSelectedCategorySlug ?? (activeTab === 'all' ? null : activeTab)
  const browseQueryKey = [activeTab, category ?? '', trimmedSearch].join('|')
  const browseIdentityMatches = browseDataIdentity === browseQueryKey

  useEffect(() => {
    categoriesRef.current = categories
    featuredShowsRef.current = featuredShows
    fallbackShowsRef.current = fallbackShows
    defaultShowsPaginationRef.current = defaultShowsPagination
    browseShowsRef.current = browseShows
    browseEpisodesRef.current = browseEpisodes
    browseDataIdentityRef.current = browseDataIdentity
  }, [
    browseDataIdentity,
    browseEpisodes,
    browseShows,
    categories,
    defaultShowsPagination,
    fallbackShows,
    featuredShows,
  ])

  const rememberShows = useCallback((shows: PodcastShowMeta[]) => {
    if (shows.length === 0) return
    knownShowsRef.current = dedupeById([...knownShowsRef.current, ...shows])
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

  useEffect(() => {
    if (initialSnapshot?.fresh && bootstrapRetryNonce === 0) return

    bootstrapAbortRef.current?.abort()
    showsLoadMoreAbortRef.current?.abort()
    episodesLoadMoreAbortRef.current?.abort()
    showsLoadMoreRequestRef.current += 1
    episodesLoadMoreRequestRef.current += 1
    const controller = new AbortController()
    bootstrapAbortRef.current = controller
    const requestId = ++bootstrapRequestRef.current

    queueMicrotask(() => {
      if (controller.signal.aborted || requestId !== bootstrapRequestRef.current) return
      if (featuredShowsRef.current.length === 0 && fallbackShowsRef.current.length === 0) {
        setLoading(true)
      }
      setError(null)
    })

    void (async () => {
      // Start the fallback with featured instead of serializing it behind the live empty response.
      const [categoriesResult, featuredResult, fallbackResult] = await Promise.allSettled([
        fetchPodcastCategories(controller.signal),
        fetchPodcastFeaturedShows(
          { page: 1, limit: FEATURED_SHOWS_LIMIT },
          controller.signal,
        ),
        fetchPodcastShows(
          { page: 1, limit: FALLBACK_SHOWS_LIMIT },
          controller.signal,
        ),
      ])

      if (controller.signal.aborted || requestId !== bootstrapRequestRef.current) return

      const failures: string[] = []
      let nextCategories = categoriesRef.current
      let nextFeatured = featuredShowsRef.current
      let nextFallback = fallbackShowsRef.current
      let nextPagination = defaultShowsPaginationRef.current
      let acceptedCategoriesRefresh = false
      let acceptedShowRefresh = false

      if (categoriesResult.status === 'fulfilled' && categoriesResult.value.length > 0) {
        nextCategories = categoriesResult.value
        acceptedCategoriesRefresh = true
      } else if (
        categoriesResult.status === 'rejected'
        && !isCancelledError(categoriesResult.reason, controller.signal)
      ) {
        failures.push(readError(categoriesResult.reason, 'Failed to load categories.'))
      }

      if (featuredResult.status === 'rejected' && !isCancelledError(featuredResult.reason, controller.signal)) {
        failures.push(readError(featuredResult.reason, 'Failed to load featured shows.'))
      }
      if (fallbackResult.status === 'rejected' && !isCancelledError(fallbackResult.reason, controller.signal)) {
        failures.push(readError(fallbackResult.reason, 'Failed to load podcast shows.'))
      }

      if (featuredResult.status === 'fulfilled' && featuredResult.value.shows.length > 0) {
        nextFeatured = featuredResult.value.shows
        nextFallback = []
        nextPagination = featuredResult.value.pagination
        acceptedShowRefresh = true
      } else if (fallbackResult.status === 'fulfilled' && fallbackResult.value.shows.length > 0) {
        nextFeatured = []
        nextFallback = fallbackResult.value.shows
        nextPagination = fallbackResult.value.pagination
        acceptedShowRefresh = true
      }

      categoriesRef.current = nextCategories
      featuredShowsRef.current = nextFeatured
      fallbackShowsRef.current = nextFallback
      defaultShowsPaginationRef.current = nextPagination
      rememberShows([...nextFeatured, ...nextFallback])
      setCategories(nextCategories)
      setFeaturedShows(nextFeatured)
      setFallbackShows(nextFallback)
      setDefaultShowsPagination(nextPagination)

      const hasRenderableData =
        nextCategories.length > 0 || nextFeatured.length > 0 || nextFallback.length > 0
      setError(hasRenderableData ? null : failures[0] ?? null)

      if (
        categoriesResult.status === 'fulfilled'
        && featuredResult.status === 'fulfilled'
        && fallbackResult.status === 'fulfilled'
        && acceptedCategoriesRefresh
        && acceptedShowRefresh
      ) {
        podcastsPageSnapshot = {
          categories: nextCategories,
          featuredShows: nextFeatured,
          fallbackShows: nextFallback,
          showsPagination: nextPagination,
          cachedAt: Date.now(),
        }
      }
    })().catch((reason) => {
      if (requestId !== bootstrapRequestRef.current || isCancelledError(reason, controller.signal)) return
      if (
        categoriesRef.current.length === 0
        && featuredShowsRef.current.length === 0
        && fallbackShowsRef.current.length === 0
      ) {
        setError(readError(reason, 'Failed to load podcast catalog.'))
      }
    }).finally(() => {
      if (requestId === bootstrapRequestRef.current && !controller.signal.aborted) {
        setLoading(false)
      }
    })

    return () => {
      controller.abort()
      if (bootstrapAbortRef.current === controller) bootstrapAbortRef.current = null
    }
  }, [bootstrapRetryNonce, initialSnapshot, rememberShows])

  useEffect(() => {
    showsLoadMoreAbortRef.current?.abort()
    episodesLoadMoreAbortRef.current?.abort()
    showsLoadMoreRequestRef.current += 1
    episodesLoadMoreRequestRef.current += 1

    if (!filteredView) {
      browseAbortRef.current?.abort()
      const resetRequestId = ++browseRequestRef.current
      let cancelled = false
      queueMicrotask(() => {
        if (cancelled || resetRequestId !== browseRequestRef.current) return
        setContentLoading(false)
        setContentError(null)
        setShowsLoadingMore(false)
        setEpisodesLoadingMore(false)
      })
      return () => {
        cancelled = true
      }
    }

    browseAbortRef.current?.abort()
    const controller = new AbortController()
    browseAbortRef.current = controller
    const requestId = ++browseRequestRef.current
    const requestIdentity = browseQueryKey
    const sameIdentity = browseDataIdentityRef.current === requestIdentity

    if (!sameIdentity) {
      browseShowsRef.current = []
      browseEpisodesRef.current = []
    }

    queueMicrotask(() => {
      if (controller.signal.aborted || requestId !== browseRequestRef.current) return
      setContentLoading(true)
      setContentError(null)
      setShowsLoadingMore(false)
      setEpisodesLoadingMore(false)
      if (!sameIdentity) {
        setBrowseShows([])
        setBrowseEpisodes([])
        setBrowseShowsPagination(null)
        setBrowseEpisodesPagination(null)
      }
    })

    const timer = globalThis.setTimeout(() => {
      void (async () => {
        const showsPromise = fetchPodcastShows(
          {
            page: 1,
            limit: BROWSE_SHOWS_LIMIT,
            query: trimmedSearch || undefined,
            category: category ?? undefined,
          },
          controller.signal,
        )
        // Never issue the production-broken unscoped or q-only episode request.
        const episodesPromise = canFetchScopedEpisodes({ category }) && !trimmedSearch
          ? fetchPodcastEpisodes(
              { page: 1, limit: EPISODES_LIMIT, category: category ?? undefined },
              controller.signal,
            )
          : Promise.resolve(null)

        const [showsResult, episodesResult] = await Promise.allSettled([
          showsPromise,
          episodesPromise,
        ])

        if (controller.signal.aborted || requestId !== browseRequestRef.current) return

        const failures: string[] = []
        let committed = false

        if (showsResult.status === 'fulfilled') {
          const nextShows = showsResult.value.shows
          rememberShows(nextShows)
          browseShowsRef.current = nextShows
          setBrowseShows(nextShows)
          setBrowseShowsPagination(showsResult.value.pagination)
          committed = true
        } else if (!isCancelledError(showsResult.reason, controller.signal)) {
          failures.push(readError(showsResult.reason, 'Failed to load podcast shows.'))
        }

        if (episodesResult.status === 'fulfilled') {
          const response = episodesResult.value
          const nextEpisodes = response?.episodes ?? []
          if (response) rememberShows(response.shows)
          browseEpisodesRef.current = nextEpisodes
          setBrowseEpisodes(nextEpisodes)
          setBrowseEpisodesPagination(response?.pagination ?? null)
          committed = true

          // Base rows commit above; show-title refinement is intentionally secondary.
          if (response && nextEpisodes.length > 0) {
            void enrichEpisodes(nextEpisodes, controller.signal).then((enriched) => {
              if (
                controller.signal.aborted
                || requestId !== browseRequestRef.current
                || browseDataIdentityRef.current !== requestIdentity
              ) return
              browseEpisodesRef.current = enriched
              setBrowseEpisodes(enriched)
            })
          }
        } else if (!isCancelledError(episodesResult.reason, controller.signal)) {
          failures.push(readError(episodesResult.reason, 'Failed to load podcast episodes.'))
        }

        if (committed || !sameIdentity) {
          browseDataIdentityRef.current = requestIdentity
          setBrowseDataIdentity(requestIdentity)
        }

        const visibleShows = sameIdentity || committed ? browseShowsRef.current : []
        const visibleEpisodes = sameIdentity || committed ? browseEpisodesRef.current : []
        setContentError(
          visibleShows.length === 0 && visibleEpisodes.length === 0
            ? failures[0] ?? null
            : null,
        )
      })().catch((reason) => {
        if (requestId !== browseRequestRef.current || isCancelledError(reason, controller.signal)) return
        if (!sameIdentity) {
          browseDataIdentityRef.current = requestIdentity
          setBrowseDataIdentity(requestIdentity)
        }
        const hasSameIdentityRows =
          sameIdentity
          && (browseShowsRef.current.length > 0 || browseEpisodesRef.current.length > 0)
        setContentError(
          hasSameIdentityRows ? null : readError(reason, 'Failed to load podcasts.'),
        )
      }).finally(() => {
        if (requestId === browseRequestRef.current && !controller.signal.aborted) {
          setContentLoading(false)
        }
      })
    }, trimmedSearch ? SEARCH_DEBOUNCE_MS : 0)

    return () => {
      globalThis.clearTimeout(timer)
      controller.abort()
      if (browseAbortRef.current === controller) browseAbortRef.current = null
    }
  }, [
    browseQueryKey,
    browseRetryNonce,
    category,
    enrichEpisodes,
    filteredView,
    rememberShows,
    trimmedSearch,
  ])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setSelectedCategorySlug(null)
    })
    return () => {
      cancelled = true
    }
  }, [activeTab])

  const featuredSectionShows = useMemo(() => {
    if (filteredView) return browseIdentityMatches ? browseShows : []
    if (featuredShows.length > 0) return featuredShows
    return fallbackShows
  }, [
    browseIdentityMatches,
    browseShows,
    fallbackShows,
    featuredShows,
    filteredView,
  ])

  const latestEpisodes = filteredView && browseIdentityMatches ? browseEpisodes : []

  const featuredSource = useMemo<PodcastFeaturedSource>(() => {
    if (filteredView) return featuredSectionShows.length > 0 ? 'browse' : 'empty'
    if (featuredShows.length > 0) return 'featured'
    if (fallbackShows.length > 0) return 'fallback'
    return 'empty'
  }, [fallbackShows.length, featuredSectionShows.length, featuredShows.length, filteredView])

  const showsPagination = filteredView
    ? (browseIdentityMatches ? browseShowsPagination : null)
    : defaultShowsPagination
  const episodesPagination = filteredView && browseIdentityMatches
    ? browseEpisodesPagination
    : null

  const loadMoreShows = useCallback(() => {
    if (!showsPagination?.hasMore || showsLoadingMore || contentLoading) return

    showsLoadMoreAbortRef.current?.abort()
    const controller = new AbortController()
    showsLoadMoreAbortRef.current = controller
    const requestId = ++showsLoadMoreRequestRef.current
    const requestIdentity = filteredView ? browseQueryKey : 'default'
    setShowsLoadingMore(true)
    setContentError(null)

    void (async () => {
      const nextPage = showsPagination.page + 1
      const response = filteredView
        ? await fetchPodcastShows(
            {
              page: nextPage,
              limit: BROWSE_SHOWS_LIMIT,
              query: trimmedSearch || undefined,
              category: category ?? undefined,
            },
            controller.signal,
          )
        : featuredShows.length > 0
          ? await fetchPodcastFeaturedShows(
              { page: nextPage, limit: FEATURED_SHOWS_LIMIT },
              controller.signal,
            )
          : await fetchPodcastShows(
              { page: nextPage, limit: FALLBACK_SHOWS_LIMIT },
              controller.signal,
            )

      if (controller.signal.aborted || requestId !== showsLoadMoreRequestRef.current) return
      if (filteredView && browseDataIdentityRef.current !== requestIdentity) return

      rememberShows(response.shows)
      if (filteredView) {
        setBrowseShows((current) => {
          const next = dedupeById([...current, ...response.shows])
          browseShowsRef.current = next
          return next
        })
        setBrowseShowsPagination(response.pagination)
      } else if (featuredShows.length > 0) {
        setFeaturedShows((current) => {
          const next = dedupeById([...current, ...response.shows])
          featuredShowsRef.current = next
          return next
        })
        setDefaultShowsPagination(response.pagination)
      } else {
        setFallbackShows((current) => {
          const next = dedupeById([...current, ...response.shows])
          fallbackShowsRef.current = next
          return next
        })
        setDefaultShowsPagination(response.pagination)
      }
    })().catch((reason) => {
      if (requestId !== showsLoadMoreRequestRef.current || isCancelledError(reason, controller.signal)) return
      setContentError(readError(reason, 'Failed to load more shows.'))
    }).finally(() => {
      if (requestId === showsLoadMoreRequestRef.current && !controller.signal.aborted) {
        setShowsLoadingMore(false)
      }
    })
  }, [
    browseQueryKey,
    category,
    contentLoading,
    featuredShows.length,
    filteredView,
    rememberShows,
    showsLoadingMore,
    showsPagination,
    trimmedSearch,
  ])

  const loadMoreEpisodes = useCallback(() => {
    if (!episodesPagination?.hasMore || episodesLoadingMore || contentLoading) return
    if (!canFetchScopedEpisodes({ category })) return

    episodesLoadMoreAbortRef.current?.abort()
    const controller = new AbortController()
    episodesLoadMoreAbortRef.current = controller
    const requestId = ++episodesLoadMoreRequestRef.current
    const requestIdentity = browseQueryKey
    setEpisodesLoadingMore(true)
    setContentError(null)

    void (async () => {
      const response = await fetchPodcastEpisodes(
        {
          page: episodesPagination.page + 1,
          limit: EPISODES_LIMIT,
          category: category ?? undefined,
        },
        controller.signal,
      )
      if (
        controller.signal.aborted
        || requestId !== episodesLoadMoreRequestRef.current
        || browseDataIdentityRef.current !== requestIdentity
      ) return

      rememberShows(response.shows)
      const baseEpisodes = response.episodes
      setBrowseEpisodes((current) => {
        const next = dedupeById([...current, ...baseEpisodes])
        browseEpisodesRef.current = next
        return next
      })
      setBrowseEpisodesPagination(response.pagination)

      const enriched = await enrichEpisodes(baseEpisodes, controller.signal)
      if (
        controller.signal.aborted
        || requestId !== episodesLoadMoreRequestRef.current
        || browseDataIdentityRef.current !== requestIdentity
      ) return
      setBrowseEpisodes((current) => {
        const next = dedupeById([...current, ...enriched])
        browseEpisodesRef.current = next
        return next
      })
    })().catch((reason) => {
      if (requestId !== episodesLoadMoreRequestRef.current || isCancelledError(reason, controller.signal)) return
      setContentError(readError(reason, 'Failed to load more episodes.'))
    }).finally(() => {
      if (requestId === episodesLoadMoreRequestRef.current && !controller.signal.aborted) {
        setEpisodesLoadingMore(false)
      }
    })
  }, [
    browseQueryKey,
    category,
    contentLoading,
    enrichEpisodes,
    episodesLoadingMore,
    episodesPagination,
    rememberShows,
  ])

  useEffect(() => () => {
    bootstrapAbortRef.current?.abort()
    browseAbortRef.current?.abort()
    showsLoadMoreAbortRef.current?.abort()
    episodesLoadMoreAbortRef.current?.abort()
    bootstrapRequestRef.current += 1
    browseRequestRef.current += 1
    showsLoadMoreRequestRef.current += 1
    episodesLoadMoreRequestRef.current += 1
  }, [])

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
    loading: filteredView ? false : loading,
    contentLoading: filteredView && (!browseIdentityMatches || contentLoading),
    showsLoadingMore,
    episodesLoadingMore,
    error: filteredView ? null : error,
    contentError: filteredView ? contentError : null,
    showsPagination,
    episodesPagination,
    selectedCategorySlug,
    setSelectedCategorySlug,
    hasRenderableContent,
    loadMoreShows,
    loadMoreEpisodes,
    retry: () => setBootstrapRetryNonce((value) => value + 1),
    retryBrowse: () => setBrowseRetryNonce((value) => value + 1),
  }
}

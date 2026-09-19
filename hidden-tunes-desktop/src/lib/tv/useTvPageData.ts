import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchTvCategories,
  fetchTvChannels,
  searchTvChannels,
} from './tvCatalogApi'
import { formatCountryLabel } from './formatTvChannelDisplay'
import type { TvCategoryMeta, TvChannelMeta, TvFilterId, TvRegionMeta } from './types'
import { TV_PAGE_SIZE, TV_SEARCH_MIN_LENGTH } from './types'

const SEARCH_DEBOUNCE_MS = 300
const TV_PAGE_SNAPSHOT_TTL_MS = 5 * 60 * 1000
const TV_PAGE_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000

type TvPageSnapshot = {
  featuredChannels: TvChannelMeta[]
  catalogChannels: TvChannelMeta[]
  categories: TvCategoryMeta[]
  regions: TvRegionMeta[]
  heroChannel: TvChannelMeta | null
  hasMore: boolean
  cachedAt: number
}

let tvPageSnapshot: TvPageSnapshot | null = null

function readTvPageSnapshot() {
  if (!tvPageSnapshot) return null
  const ageMs = Date.now() - tvPageSnapshot.cachedAt
  if (ageMs > TV_PAGE_SNAPSHOT_MAX_AGE_MS) {
    tvPageSnapshot = null
    return null
  }
  return {
    snapshot: tvPageSnapshot,
    fresh: ageMs <= TV_PAGE_SNAPSHOT_TTL_MS,
  }
}

const FILTER_CATEGORY_MAP: Partial<Record<TvFilterId, string>> = {
  movies: 'Movies',
  series: 'Series',
  news: 'News',
  sports: 'Sports',
  documentaries: 'Documentary',
  kids: 'Kids',
}

const CATEGORY_ICONS: Record<string, string> = {
  movies: '🎬',
  news: '📰',
  sports: '⚽',
  documentary: '🌍',
  documentaries: '🌍',
  entertainment: '📺',
  music: '🎵',
  kids: '🧸',
  gaming: '🎮',
  education: '📚',
  lifestyle: '✨',
  faith: '🙏',
  africa: '🌍',
}

const REGION_CATEGORY_NAMES = new Set([
  'Africa',
  'Europe',
  'Americas',
  'Asia',
  'Local TV',
])

function readError(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

function dedupeChannels(channels: TvChannelMeta[]) {
  const seen = new Set<string>()
  const result: TvChannelMeta[] = []
  for (const channel of channels) {
    if (seen.has(channel.id)) continue
    seen.add(channel.id)
    result.push(channel)
  }
  return result
}

function regionsFromFeaturedChannels(channels: TvChannelMeta[]): TvRegionMeta[] {
  const countries = new Map<string, string>()

  for (const channel of channels) {
    const country = channel.country?.trim()
    if (!country) continue
    const key = country.toLowerCase()
    if (!countries.has(key)) countries.set(key, country)
  }

  return [...countries.values()]
    .map((country) => ({
      id: country.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: formatCountryLabel(country) ?? country,
      code: country,
      count: 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 12)
}

function resolveFilterCategory(
  filter: TvFilterId,
  categories: TvCategoryMeta[],
): string | null {
  if (filter === 'all' || filter === 'featured' || filter === 'genres') return null
  const mapped = FILTER_CATEGORY_MAP[filter]
  if (!mapped) return null
  const match = categories.find(
    (entry) => entry.name.toLowerCase() === mapped.toLowerCase(),
  )
  return match?.name ?? null
}

export function useTvPageData(activeFilter: TvFilterId, searchQuery: string) {
  const trimmedSearch = searchQuery.trim()
  const isSearchMode = trimmedSearch.length >= TV_SEARCH_MIN_LENGTH
  const initialDefaultQuery = activeFilter === 'all' && !trimmedSearch
  const [initialSnapshot] = useState(() => readTvPageSnapshot())
  const initialCatalogSnapshot = initialDefaultQuery
    ? initialSnapshot?.snapshot ?? null
    : null
  const initialCatalogChannels = initialCatalogSnapshot?.catalogChannels ?? []
  const [featuredChannels, setFeaturedChannels] = useState<TvChannelMeta[]>(
    () => initialSnapshot?.snapshot.featuredChannels ?? [],
  )
  const [catalogChannels, setCatalogChannels] = useState<TvChannelMeta[]>(
    initialCatalogChannels,
  )
  const [categories, setCategories] = useState<TvCategoryMeta[]>(
    () => initialSnapshot?.snapshot.categories ?? [],
  )
  const [regions, setRegions] = useState<TvRegionMeta[]>(
    () => initialSnapshot?.snapshot.regions ?? [],
  )
  const [heroChannel, setHeroChannel] = useState<TvChannelMeta | null>(
    () => initialSnapshot?.snapshot.heroChannel ?? null,
  )
  const [loading, setLoading] = useState(() => !initialSnapshot)
  const [catalogLoading, setCatalogLoading] = useState(
    () => !initialCatalogSnapshot,
  )
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(
    () => initialCatalogSnapshot?.hasMore ?? false,
  )
  const [catalogRetryNonce, setCatalogRetryNonce] = useState(0)
  const [bootstrapReadyForSnapshot, setBootstrapReadyForSnapshot] = useState(false)
  const [catalogReadyForSnapshot, setCatalogReadyForSnapshot] = useState(false)

  const bootstrapRequestRef = useRef(0)
  const catalogRequestRef = useRef(0)
  const catalogAbortRef = useRef<AbortController | null>(null)
  const categoriesRef = useRef(categories)
  const heroChannelRef = useRef(heroChannel)
  const catalogChannelsRef = useRef(initialCatalogChannels)
  const hasBootstrapContentRef = useRef(
    featuredChannels.length > 0 || categories.length > 0,
  )
  const hasCatalogResponseRef = useRef(Boolean(initialCatalogSnapshot))
  const skipInitialCatalogRequestRef = useRef(
    initialDefaultQuery && initialSnapshot?.fresh === true,
  )

  const effectiveSelectedCategory = selectedCategory
  const effectiveSelectedRegion = selectedRegion

  const catalogQueryKey = [
    activeFilter,
    effectiveSelectedCategory ?? '',
    effectiveSelectedRegion ?? '',
    trimmedSearch,
  ].join('|')

  const catalogQueryKeyRef = useRef(catalogQueryKey)

  useEffect(() => {
    categoriesRef.current = categories
    heroChannelRef.current = heroChannel
    catalogChannelsRef.current = catalogChannels
  }, [catalogChannels, categories, heroChannel])

  const resetCatalogQuery = useCallback(() => {
    setPage(1)
    setCatalogChannels([])
    setHasMore(false)
    setCatalogError(null)
  }, [])

  const loadBootstrap = useCallback(async () => {
    await Promise.resolve()
    const requestId = ++bootstrapRequestRef.current
    setLoading(true)
    setError(null)
    setBootstrapReadyForSnapshot(false)

    const abort = new AbortController()

    try {
      const [categoriesResult, featuredResult] = await Promise.allSettled([
        fetchTvCategories(abort.signal),
        fetchTvChannels({ featured: true, limit: 12, signal: abort.signal }),
      ])

      if (requestId !== bootstrapRequestRef.current) return

      const failures: string[] = []

      if (categoriesResult.status === 'fulfilled') {
        const nextCategories = categoriesResult.value
          .filter((entry) => entry.name !== 'Featured')
          .slice(0, 24)
        setCategories(nextCategories)
        if (nextCategories.length > 0) hasBootstrapContentRef.current = true
      } else {
        failures.push(readError(categoriesResult.reason, 'Failed to load categories.'))
      }

      if (featuredResult.status === 'fulfilled') {
        const featured = featuredResult.value.channels
        setFeaturedChannels(featured)
        setHeroChannel(featured[0] ?? null)
        setRegions(regionsFromFeaturedChannels(featured))
        if (featured.length > 0) hasBootstrapContentRef.current = true
      } else {
        failures.push(readError(featuredResult.reason, 'Failed to load featured channels.'))
      }

      const hasRenderableData =
        (categoriesResult.status === 'fulfilled' && categoriesResult.value.length > 0)
        || (featuredResult.status === 'fulfilled' && featuredResult.value.channels.length > 0)

      setBootstrapReadyForSnapshot(
        categoriesResult.status === 'fulfilled' && featuredResult.status === 'fulfilled',
      )

      if (
        !hasRenderableData
        && !hasBootstrapContentRef.current
        && !hasCatalogResponseRef.current
      ) {
        setError(failures[0] ?? 'TV could not be loaded.')
      }
    } catch (err) {
      if (requestId !== bootstrapRequestRef.current) return
      if (err instanceof DOMException && err.name === 'AbortError') return
      setBootstrapReadyForSnapshot(false)
      setError(readError(err, 'TV could not be loaded.'))
    } finally {
      if (requestId === bootstrapRequestRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (initialSnapshot?.fresh) return
    const timer = globalThis.setTimeout(() => {
      void loadBootstrap()
    }, 0)
    return () => globalThis.clearTimeout(timer)
  }, [initialSnapshot, loadBootstrap])

  useEffect(() => {
    if (catalogQueryKeyRef.current === catalogQueryKey) return
    catalogQueryKeyRef.current = catalogQueryKey
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      resetCatalogQuery()
    })
    return () => {
      cancelled = true
    }
  }, [catalogQueryKey, resetCatalogQuery])

  useEffect(() => {
    const isDefaultFirstPage =
      activeFilter === 'all'
      && !effectiveSelectedCategory
      && !effectiveSelectedRegion
      && !trimmedSearch
      && page === 1

    if (skipInitialCatalogRequestRef.current && isDefaultFirstPage) {
      skipInitialCatalogRequestRef.current = false
      return
    }
    skipInitialCatalogRequestRef.current = false

    catalogAbortRef.current?.abort()
    const abort = new AbortController()
    catalogAbortRef.current = abort

    const requestId = ++catalogRequestRef.current
    const requestPage = page

    const timer = globalThis.setTimeout(() => {
      queueMicrotask(() => {
        setCatalogLoading(requestPage === 1 && catalogChannelsRef.current.length === 0)
        setLoadingMore(requestPage > 1)
        setCatalogError(null)
        if (isDefaultFirstPage) setCatalogReadyForSnapshot(false)
      })

      void (async () => {
        try {
          const category =
            effectiveSelectedCategory
            ?? resolveFilterCategory(activeFilter, categoriesRef.current)
            ?? undefined

          const response = isSearchMode
            ? await searchTvChannels(trimmedSearch, {
                  page: requestPage,
                  limit: TV_PAGE_SIZE,
                  category,
                  country: effectiveSelectedRegion,
                  signal: abort.signal,
                })
            : await fetchTvChannels({
                page: requestPage,
                limit: TV_PAGE_SIZE,
                featured: activeFilter === 'featured' ? true : undefined,
                category: category ?? undefined,
                country: effectiveSelectedRegion ?? undefined,
                signal: abort.signal,
              })

          if (requestId !== catalogRequestRef.current) return

          hasCatalogResponseRef.current = true
          setError(null)
          setCatalogChannels((previous) =>
            dedupeChannels(
              requestPage === 1 ? response.channels : [...previous, ...response.channels],
            ),
          )
          setHasMore(response.pagination.hasMore)
          if (isDefaultFirstPage) setCatalogReadyForSnapshot(true)

          if (
            requestPage === 1
            && response.channels.length > 0
            && !heroChannelRef.current
            && activeFilter === 'all'
            && !isSearchMode
          ) {
            setHeroChannel(response.channels[0])
          }
        } catch (err) {
          if (requestId !== catalogRequestRef.current) return
          if (err instanceof DOMException && err.name === 'AbortError') return
          if (isDefaultFirstPage) setCatalogReadyForSnapshot(false)
          if (requestPage === 1 && catalogChannelsRef.current.length === 0) {
            setCatalogChannels([])
          }
          setCatalogError(readError(err, 'Failed to load TV channels.'))
        } finally {
          if (requestId === catalogRequestRef.current) {
            setCatalogLoading(false)
            setLoadingMore(false)
          }
        }
      })()
    }, isSearchMode ? SEARCH_DEBOUNCE_MS : 0)

    return () => {
      globalThis.clearTimeout(timer)
      abort.abort()
    }
  }, [
    activeFilter,
    catalogRetryNonce,
    catalogQueryKey,
    effectiveSelectedCategory,
    effectiveSelectedRegion,
    isSearchMode,
    page,
    trimmedSearch,
  ])

  useEffect(() => {
    const isDefaultFirstPage =
      activeFilter === 'all'
      && !effectiveSelectedCategory
      && !effectiveSelectedRegion
      && !trimmedSearch
      && page === 1

    if (
      !isDefaultFirstPage
      || !bootstrapReadyForSnapshot
      || !catalogReadyForSnapshot
      || loading
      || catalogLoading
      || catalogError
    ) return
    if (featuredChannels.length === 0 && catalogChannels.length === 0) return

    tvPageSnapshot = {
      featuredChannels,
      catalogChannels,
      categories,
      regions,
      heroChannel,
      hasMore,
      cachedAt: Date.now(),
    }
  }, [
    activeFilter,
    bootstrapReadyForSnapshot,
    catalogChannels,
    catalogError,
    catalogLoading,
    catalogReadyForSnapshot,
    categories,
    effectiveSelectedCategory,
    effectiveSelectedRegion,
    featuredChannels,
    hasMore,
    heroChannel,
    loading,
    page,
    regions,
    trimmedSearch,
  ])

  const browseCategories = useMemo(() => {
    return categories
      .filter((entry) => !REGION_CATEGORY_NAMES.has(entry.name))
      .slice(0, 12)
      .map((entry) => ({
        id: entry.slug,
        label: entry.name,
        count: entry.count,
        icon: CATEGORY_ICONS[entry.slug] ?? CATEGORY_ICONS[entry.name.toLowerCase()] ?? '◎',
      }))
  }, [categories])

  const filterChips = useMemo(() => {
    const chips: { id: TvFilterId; label: string }[] = [
      { id: 'all', label: 'All Channels' },
    ]

    if (featuredChannels.length > 0) {
      chips.push({ id: 'featured', label: 'Featured' })
    }

    for (const [filterId, label, names] of [
      ['movies', 'Movies', ['Movies']],
      ['series', 'Series', ['Series']],
      ['news', 'News', ['News']],
      ['sports', 'Sports', ['Sports']],
      ['documentaries', 'Documentaries', ['Documentary', 'Documentaries']],
      ['kids', 'Kids', ['Kids']],
    ] as const) {
      const hasCategory = names.some((name) =>
        categories.some((entry) => entry.name.toLowerCase() === name.toLowerCase()),
      )
      if (hasCategory) {
        chips.push({ id: filterId, label })
      }
    }

    if (browseCategories.length > 0) {
      chips.push({ id: 'genres', label: 'Genres' })
    }

    return chips
  }, [browseCategories.length, categories, featuredChannels.length])

  const loadMore = useCallback(() => {
    if (!hasMore || catalogLoading || loadingMore) return
    setPage((current) => current + 1)
  }, [catalogLoading, hasMore, loadingMore])

  const retry = useCallback(() => {
    void loadBootstrap()
    setCatalogRetryNonce((value) => value + 1)
  }, [loadBootstrap])

  return {
    featuredChannels,
    catalogChannels,
    browseCategories,
    regions,
    heroChannel,
    filterChips,
    loading,
    catalogLoading,
    loadingMore,
    error,
    catalogError,
    selectedCategory,
    setSelectedCategory,
    selectedRegion,
    setSelectedRegion,
    hasMore,
    loadMore,
    retry,
    resetCatalogQuery,
  }
}

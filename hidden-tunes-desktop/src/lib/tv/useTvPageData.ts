import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchTvCategories,
  fetchTvCategoryCount,
  fetchTvChannels,
  fetchTvRegionsFromCountries,
  searchTvChannels,
} from './tvCatalogApi'
import type { TvCategoryMeta, TvChannelMeta, TvFilterId, TvRegionMeta } from './types'
import { TV_PAGE_SIZE, TV_SEARCH_MIN_LENGTH } from './types'

const SEARCH_DEBOUNCE_MS = 300

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
  const [featuredChannels, setFeaturedChannels] = useState<TvChannelMeta[]>([])
  const [catalogChannels, setCatalogChannels] = useState<TvChannelMeta[]>([])
  const [categories, setCategories] = useState<TvCategoryMeta[]>([])
  const [regions, setRegions] = useState<TvRegionMeta[]>([])
  const [heroChannel, setHeroChannel] = useState<TvChannelMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  const bootstrapRequestRef = useRef(0)
  const catalogRequestRef = useRef(0)
  const catalogAbortRef = useRef<AbortController | null>(null)

  const trimmedSearch = searchQuery.trim()
  const isSearchMode = trimmedSearch.length >= TV_SEARCH_MIN_LENGTH

  const loadBootstrap = useCallback(async () => {
    const requestId = ++bootstrapRequestRef.current
    setLoading(true)
    setError(null)

    const abort = new AbortController()

    try {
      const [categoriesResult, featuredResult] = await Promise.allSettled([
        fetchTvCategories(abort.signal),
        fetchTvChannels({ featured: true, limit: 12, signal: abort.signal }),
      ])

      if (requestId !== bootstrapRequestRef.current) return

      const failures: string[] = []

      if (categoriesResult.status === 'fulfilled') {
        const withCounts = await Promise.all(
          categoriesResult.value
            .filter((entry) => entry.name !== 'Featured')
            .slice(0, 24)
            .map(async (entry) => {
              try {
                const count = await fetchTvCategoryCount(entry.name, abort.signal)
                return count > 0 ? { ...entry, count } : null
              } catch {
                return null
              }
            }),
        )
        if (requestId !== bootstrapRequestRef.current) return
        setCategories(
          withCounts.filter((entry): entry is TvCategoryMeta => Boolean(entry)),
        )
      } else {
        failures.push(readError(categoriesResult.reason, 'Failed to load categories.'))
        setCategories([])
      }

      if (featuredResult.status === 'fulfilled') {
        const featured = featuredResult.value.channels
        setFeaturedChannels(featured)
        setHeroChannel(featured[0] ?? null)

        const countries = featured
          .map((channel) => channel.country)
          .filter((value): value is string => Boolean(value))
        if (countries.length > 0) {
          const regionRows = await fetchTvRegionsFromCountries(countries, abort.signal)
          if (requestId === bootstrapRequestRef.current) {
            setRegions(regionRows)
          }
        } else {
          setRegions([])
        }
      } else {
        failures.push(readError(featuredResult.reason, 'Failed to load featured channels.'))
        setFeaturedChannels([])
        setHeroChannel(null)
        setRegions([])
      }

      const hasRenderableData =
        (categoriesResult.status === 'fulfilled' && categoriesResult.value.length > 0)
        || (featuredResult.status === 'fulfilled' && featuredResult.value.channels.length > 0)

      if (!hasRenderableData) {
        setError(failures[0] ?? 'TV could not be loaded.')
      }
    } catch (err) {
      if (requestId !== bootstrapRequestRef.current) return
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(readError(err, 'TV could not be loaded.'))
    } finally {
      if (requestId === bootstrapRequestRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadBootstrap()
  }, [loadBootstrap])

  useEffect(() => {
    if (activeFilter !== 'genres') {
      setSelectedCategory(null)
    }
    if (activeFilter !== 'all') {
      setSelectedRegion(null)
    }
  }, [activeFilter])

  useEffect(() => {
    setPage(1)
    setCatalogChannels([])
    setHasMore(false)
  }, [activeFilter, selectedCategory, selectedRegion, trimmedSearch])

  useEffect(() => {
    if (loading) return

    catalogAbortRef.current?.abort()
    const abort = new AbortController()
    catalogAbortRef.current = abort

    const requestId = ++catalogRequestRef.current
    setCatalogLoading(page === 1)
    setLoadingMore(page > 1)
    setCatalogError(null)

    const timer = globalThis.setTimeout(() => {
      void (async () => {
        try {
          const category =
            selectedCategory
            ?? resolveFilterCategory(activeFilter, categories)
            ?? undefined

          const response = isSearchMode
            ? await searchTvChannels(trimmedSearch, {
                page,
                limit: TV_PAGE_SIZE,
                signal: abort.signal,
              })
            : await fetchTvChannels({
                page,
                limit: TV_PAGE_SIZE,
                featured: activeFilter === 'featured' ? true : undefined,
                category: category ?? undefined,
                country: selectedRegion ?? undefined,
                signal: abort.signal,
              })

          if (requestId !== catalogRequestRef.current) return

          setCatalogChannels((previous) =>
            dedupeChannels(page === 1 ? response.channels : [...previous, ...response.channels]),
          )
          setHasMore(response.pagination.hasMore)

          if (
            page === 1
            && response.channels.length > 0
            && !heroChannel
            && activeFilter === 'all'
            && !isSearchMode
          ) {
            setHeroChannel(response.channels[0])
          }
        } catch (err) {
          if (requestId !== catalogRequestRef.current) return
          if (err instanceof DOMException && err.name === 'AbortError') return
          if (page === 1) {
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
    categories,
    heroChannel,
    isSearchMode,
    loading,
    page,
    selectedCategory,
    selectedRegion,
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
    retry: loadBootstrap,
  }
}

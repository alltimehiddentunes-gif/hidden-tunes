import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchRadioCategories,
  fetchRadioCountries,
  fetchRadioStations,
} from './radioCatalogApi'
import type {
  RadioCategoryMeta,
  RadioCountryMeta,
  RadioStationMeta,
  RadioTabId,
} from './types'

const TAB_CATEGORY_MAP: Partial<Record<RadioTabId, string>> = {
  music: 'music',
  news: 'news',
  talk: 'talk',
  sports: 'sports',
  culture: 'culture',
  moods: 'moods',
}

const GENRE_CARD_IDS = ['pop', 'rock', 'hip hop', 'r&b', 'electronic', 'jazz'] as const
const SEARCH_DEBOUNCE_MS = 280
const RADIO_PAGE_SNAPSHOT_TTL_MS = 5 * 60 * 1000
const RADIO_PAGE_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000

type RadioPageSnapshot = {
  featuredStations: RadioStationMeta[]
  browseStations: RadioStationMeta[]
  categories: RadioCategoryMeta[]
  countries: RadioCountryMeta[]
  cachedAt: number
}

let radioPageSnapshot: RadioPageSnapshot | null = null

function readRadioPageSnapshot() {
  if (!radioPageSnapshot) return null
  const ageMs = Date.now() - radioPageSnapshot.cachedAt
  if (ageMs > RADIO_PAGE_SNAPSHOT_MAX_AGE_MS) {
    radioPageSnapshot = null
    return null
  }
  return {
    snapshot: radioPageSnapshot,
    fresh: ageMs <= RADIO_PAGE_SNAPSHOT_TTL_MS,
  }
}

function buildBrowseQueryKey(
  activeTab: RadioTabId,
  selectedCountry: string | null,
  selectedGenre: string | null,
  searchQuery: string,
) {
  return [activeTab, selectedCountry ?? '', selectedGenre ?? '', searchQuery].join('|')
}

function titleCaseCategory(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function readError(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

function isCancelledError(reason: unknown) {
  return (
    (reason instanceof DOMException && reason.name === 'AbortError')
    || (reason instanceof Error && reason.name === 'AbortError')
    || (reason instanceof Error && /cancelled|canceled|aborted/i.test(reason.message))
  )
}

export function useRadioPageData(activeTab: RadioTabId, searchQuery: string) {
  const trimmedSearch = searchQuery.trim()
  const [initialSnapshot] = useState(() => readRadioPageSnapshot())
  const initialDefaultQuery = activeTab === 'all' && !trimmedSearch
  const initialBrowseStations = initialDefaultQuery
    ? initialSnapshot?.snapshot.browseStations ?? []
    : []

  const [featuredStations, setFeaturedStations] = useState<RadioStationMeta[]>(
    () => initialSnapshot?.snapshot.featuredStations ?? [],
  )
  const [browseStations, setBrowseStations] = useState<RadioStationMeta[]>(
    initialBrowseStations,
  )
  const [categories, setCategories] = useState<RadioCategoryMeta[]>(
    () => initialSnapshot?.snapshot.categories ?? [],
  )
  const [countries, setCountries] = useState<RadioCountryMeta[]>(
    () => initialSnapshot?.snapshot.countries ?? [],
  )
  const [loading, setLoading] = useState(() => !initialSnapshot)
  const [stationsLoading, setStationsLoading] = useState(
    () => initialBrowseStations.length === 0,
  )
  const [error, setError] = useState<string | null>(null)
  const [stationsError, setStationsError] = useState<string | null>(null)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
  const [browseRetryNonce, setBrowseRetryNonce] = useState(0)
  const [bootstrapReadyForSnapshot, setBootstrapReadyForSnapshot] = useState(false)
  const [browseReadyForSnapshot, setBrowseReadyForSnapshot] = useState(false)

  const bootstrapRequestRef = useRef(0)
  const browseRequestRef = useRef(0)
  const bootstrapAbortRef = useRef<AbortController | null>(null)
  const browseAbortRef = useRef<AbortController | null>(null)
  const browseStationsRef = useRef(initialBrowseStations)
  const hasBootstrapContentRef = useRef(
    featuredStations.length > 0 || categories.length > 0 || countries.length > 0,
  )
  const hasPrimaryContentRef = useRef(initialBrowseStations.length > 0)
  const primarySettledRef = useRef(Boolean(initialSnapshot && initialDefaultQuery))
  const bootstrapSettledRef = useRef(Boolean(initialSnapshot))
  const bootstrapFailureRef = useRef<string | null>(null)
  const skipInitialBrowseRequestRef = useRef(
    initialSnapshot?.fresh === true && initialDefaultQuery,
  )

  const effectiveSelectedCountry = activeTab === 'countries' ? selectedCountry : null
  const effectiveSelectedGenre = activeTab === 'all' ? selectedGenre : null
  const browseQueryKey = buildBrowseQueryKey(
    activeTab,
    effectiveSelectedCountry,
    effectiveSelectedGenre,
    trimmedSearch,
  )
  const browseQueryKeyRef = useRef(browseQueryKey)
  const browseRowsKeyRef = useRef(browseQueryKey)

  useEffect(() => {
    browseStationsRef.current = browseStations
  }, [browseStations])

  const loadBootstrap = useCallback(async () => {
    bootstrapAbortRef.current?.abort()
    const controller = new AbortController()
    bootstrapAbortRef.current = controller
    const requestId = ++bootstrapRequestRef.current

    setLoading(true)
    setError(null)
    setBootstrapReadyForSnapshot(false)
    bootstrapSettledRef.current = false
    bootstrapFailureRef.current = null

    try {
      const [categoriesResult, countriesResult, featuredResult] = await Promise.allSettled([
        fetchRadioCategories(controller.signal),
        fetchRadioCountries(controller.signal),
        fetchRadioStations({ featured: true, limit: 12 }, controller.signal),
      ])

      if (controller.signal.aborted || requestId !== bootstrapRequestRef.current) return

      const failures: string[] = []

      if (categoriesResult.status === 'fulfilled') {
        setCategories(categoriesResult.value)
        if (categoriesResult.value.length > 0) hasBootstrapContentRef.current = true
      } else if (!isCancelledError(categoriesResult.reason)) {
        failures.push(readError(categoriesResult.reason, 'Failed to load categories.'))
      }

      if (countriesResult.status === 'fulfilled') {
        const nextCountries = countriesResult.value.slice(0, 12)
        setCountries(nextCountries)
        if (nextCountries.length > 0) hasBootstrapContentRef.current = true
      } else if (!isCancelledError(countriesResult.reason)) {
        failures.push(readError(countriesResult.reason, 'Failed to load countries.'))
      }

      if (featuredResult.status === 'fulfilled') {
        setFeaturedStations(featuredResult.value.stations)
        if (featuredResult.value.stations.length > 0) hasBootstrapContentRef.current = true
      } else if (!isCancelledError(featuredResult.reason)) {
        failures.push(readError(featuredResult.reason, 'Failed to load featured stations.'))
      }

      const allBootstrapRequestsSucceeded =
        categoriesResult.status === 'fulfilled'
        && countriesResult.status === 'fulfilled'
        && featuredResult.status === 'fulfilled'
      setBootstrapReadyForSnapshot(allBootstrapRequestsSucceeded)
      bootstrapSettledRef.current = true

      const hasRenderableData =
        (categoriesResult.status === 'fulfilled' && categoriesResult.value.length > 0)
        || (countriesResult.status === 'fulfilled' && countriesResult.value.length > 0)
        || (featuredResult.status === 'fulfilled' && featuredResult.value.stations.length > 0)

      if (!hasRenderableData && !hasBootstrapContentRef.current) {
        bootstrapFailureRef.current = failures[0] ?? 'Failed to load radio catalog.'
        if (primarySettledRef.current && !hasPrimaryContentRef.current) {
          setError(bootstrapFailureRef.current)
        }
      }
    } catch (err) {
      if (
        controller.signal.aborted
        || requestId !== bootstrapRequestRef.current
        || isCancelledError(err)
      ) return

      bootstrapSettledRef.current = true
      bootstrapFailureRef.current = readError(err, 'Failed to load radio catalog.')
      if (primarySettledRef.current && !hasPrimaryContentRef.current) {
        setError(bootstrapFailureRef.current)
      }
    } finally {
      if (!controller.signal.aborted && requestId === bootstrapRequestRef.current) {
        setLoading(false)
      }
    }
  }, [
    setBootstrapReadyForSnapshot,
    setCategories,
    setCountries,
    setError,
    setFeaturedStations,
    setLoading,
  ])

  useEffect(() => {
    const timer = initialSnapshot?.fresh
      ? null
      : globalThis.setTimeout(() => {
          void loadBootstrap()
        }, 0)

    return () => {
      if (timer !== null) globalThis.clearTimeout(timer)
      bootstrapRequestRef.current += 1
      bootstrapAbortRef.current?.abort()
    }
  }, [initialSnapshot, loadBootstrap])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (activeTab !== 'countries') setSelectedCountry(null)
      if (activeTab !== 'all') setSelectedGenre(null)
    })
    return () => {
      cancelled = true
    }
  }, [activeTab])

  useEffect(() => {
    if (browseQueryKeyRef.current === browseQueryKey) return
    browseQueryKeyRef.current = browseQueryKey
    browseRowsKeyRef.current = browseQueryKey
    browseStationsRef.current = []
    primarySettledRef.current = false
    hasPrimaryContentRef.current = false

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setBrowseStations([])
      setStationsError(null)
    })
    return () => {
      cancelled = true
    }
  }, [browseQueryKey])

  useEffect(() => {
    const isDefaultQuery =
      activeTab === 'all'
      && !effectiveSelectedCountry
      && !effectiveSelectedGenre
      && !trimmedSearch

    if (skipInitialBrowseRequestRef.current && isDefaultQuery) {
      skipInitialBrowseRequestRef.current = false
      setStationsLoading(false)
      return
    }
    skipInitialBrowseRequestRef.current = false

    browseAbortRef.current?.abort()
    const controller = new AbortController()
    browseAbortRef.current = controller
    const requestId = ++browseRequestRef.current
    const requestQueryKey = browseQueryKey

    const timer = globalThis.setTimeout(() => {
      setStationsLoading(true)
      setStationsError(null)
      if (isDefaultQuery) setBrowseReadyForSnapshot(false)

      void (async () => {
        try {
          const category =
            effectiveSelectedGenre
            ?? (activeTab !== 'all' && activeTab !== 'featured' && activeTab !== 'countries'
              ? TAB_CATEGORY_MAP[activeTab]
              : undefined)

          const response = await fetchRadioStations(
            {
              limit: 32,
              featured: activeTab === 'featured' ? true : undefined,
              category: category ?? undefined,
              country: effectiveSelectedCountry ?? undefined,
              query: trimmedSearch || undefined,
            },
            controller.signal,
          )

          if (
            controller.signal.aborted
            || requestId !== browseRequestRef.current
            || requestQueryKey !== browseQueryKeyRef.current
          ) return

          browseRowsKeyRef.current = requestQueryKey
          browseStationsRef.current = response.stations
          primarySettledRef.current = true
          hasPrimaryContentRef.current = response.stations.length > 0
          setBrowseStations(response.stations)
          setStationsError(null)
          setError(null)
          if (isDefaultQuery) setBrowseReadyForSnapshot(true)
        } catch (err) {
          if (
            controller.signal.aborted
            || requestId !== browseRequestRef.current
            || requestQueryKey !== browseQueryKeyRef.current
            || isCancelledError(err)
          ) return

          primarySettledRef.current = true
          const message = readError(err, 'Failed to load stations.')
          setStationsError(message)
          if (isDefaultQuery) setBrowseReadyForSnapshot(false)

          const hasRowsForCurrentQuery =
            browseRowsKeyRef.current === requestQueryKey
            && browseStationsRef.current.length > 0
          if (
            !hasRowsForCurrentQuery
            && bootstrapSettledRef.current
            && !hasBootstrapContentRef.current
          ) {
            setError(bootstrapFailureRef.current ?? message)
          }
        } finally {
          if (
            !controller.signal.aborted
            && requestId === browseRequestRef.current
            && requestQueryKey === browseQueryKeyRef.current
          ) {
            setStationsLoading(false)
          }
        }
      })()
    }, trimmedSearch ? SEARCH_DEBOUNCE_MS : 0)

    return () => {
      globalThis.clearTimeout(timer)
      controller.abort()
    }
  }, [
    activeTab,
    browseQueryKey,
    browseRetryNonce,
    effectiveSelectedCountry,
    effectiveSelectedGenre,
    trimmedSearch,
  ])

  useEffect(() => {
    const isDefaultQuery =
      activeTab === 'all'
      && !effectiveSelectedCountry
      && !effectiveSelectedGenre
      && !trimmedSearch

    if (
      !isDefaultQuery
      || !bootstrapReadyForSnapshot
      || !browseReadyForSnapshot
      || loading
      || stationsLoading
      || error
      || stationsError
      || browseStations.length === 0
    ) return

    radioPageSnapshot = {
      featuredStations,
      browseStations,
      categories,
      countries,
      cachedAt: Date.now(),
    }
  }, [
    activeTab,
    bootstrapReadyForSnapshot,
    browseReadyForSnapshot,
    browseStations,
    categories,
    countries,
    effectiveSelectedCountry,
    effectiveSelectedGenre,
    error,
    featuredStations,
    loading,
    stationsError,
    stationsLoading,
    trimmedSearch,
  ])

  const genreCards = (() => {
    const byId = new Map(categories.map((entry) => [entry.id.toLowerCase(), entry]))
    const cards = GENRE_CARD_IDS.map((id) => {
      const match =
        byId.get(id)
        ?? categories.find((entry) => entry.id.includes(id) || entry.name.toLowerCase().includes(id))
      if (!match) return null
      return {
        id: match.id,
        label: titleCaseCategory(match.name),
        count: match.count,
      }
    }).filter((entry): entry is { id: string; label: string; count: number } => Boolean(entry))

    if (cards.length > 0) return cards.slice(0, 6)

    return categories.slice(0, 6).map((entry) => ({
      id: entry.id,
      label: titleCaseCategory(entry.name),
      count: entry.count,
    }))
  })()

  const visibleStations = useMemo(() => {
    if (trimmedSearch) return browseStations
    if (activeTab === 'featured' && browseStations.length === 0 && featuredStations.length > 0) {
      return featuredStations
    }
    if (browseStations.length > 0) return browseStations
    if (
      activeTab === 'all'
      && !effectiveSelectedCountry
      && !effectiveSelectedGenre
      && featuredStations.length > 0
    ) {
      return featuredStations
    }
    return browseStations
  }, [
    activeTab,
    browseStations,
    effectiveSelectedCountry,
    effectiveSelectedGenre,
    featuredStations,
    trimmedSearch,
  ])

  const retry = useCallback(() => {
    void loadBootstrap()
    setBrowseRetryNonce((value) => value + 1)
  }, [loadBootstrap, setBrowseRetryNonce])

  return {
    featuredStations,
    visibleStations,
    genreCards,
    countries,
    loading,
    stationsLoading,
    error,
    stationsError,
    selectedCountry,
    setSelectedCountry,
    selectedGenre,
    setSelectedGenre,
    retry,
  }
}

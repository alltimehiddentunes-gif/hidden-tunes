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

function titleCaseCategory(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function useRadioPageData(activeTab: RadioTabId, searchQuery: string) {
  const [featuredStations, setFeaturedStations] = useState<RadioStationMeta[]>([])
  const [browseStations, setBrowseStations] = useState<RadioStationMeta[]>([])
  const [categories, setCategories] = useState<RadioCategoryMeta[]>([])
  const [countries, setCountries] = useState<RadioCountryMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [stationsLoading, setStationsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
  const requestRef = useRef(0)

  const trimmedSearch = searchQuery.trim()

  const loadBootstrap = useCallback(async () => {
    const requestId = ++requestRef.current
    setLoading(true)
    setError(null)

    try {
      const [nextCategories, nextCountries, featured] = await Promise.all([
        fetchRadioCategories(),
        fetchRadioCountries(),
        fetchRadioStations({ featured: true, limit: 12 }),
      ])

      if (requestId !== requestRef.current) return

      setCategories(nextCategories)
      setCountries(nextCountries.slice(0, 12))
      setFeaturedStations(featured.stations)
    } catch (err) {
      if (requestId !== requestRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load radio catalog.')
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadBootstrap()
  }, [loadBootstrap])

  useEffect(() => {
    if (activeTab !== 'countries') {
      setSelectedCountry(null)
    }
    if (activeTab === 'all' || activeTab === 'featured' || activeTab === 'countries') {
      setSelectedGenre(null)
    }
  }, [activeTab])

  useEffect(() => {
    const requestId = ++requestRef.current
    setStationsLoading(true)
    setError(null)

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const category =
            selectedGenre
            ?? (activeTab !== 'all' && activeTab !== 'featured' && activeTab !== 'countries'
              ? TAB_CATEGORY_MAP[activeTab]
              : undefined)

          const response = await fetchRadioStations({
            limit: 32,
            featured: activeTab === 'featured' ? true : undefined,
            category: category ?? undefined,
            country: selectedCountry ?? undefined,
            query: trimmedSearch || undefined,
          })

          if (requestId !== requestRef.current) return
          setBrowseStations(response.stations)
        } catch (err) {
          if (requestId !== requestRef.current) return
          setBrowseStations([])
          setError(err instanceof Error ? err.message : 'Failed to load stations.')
        } finally {
          if (requestId === requestRef.current) {
            setStationsLoading(false)
          }
        }
      })()
    }, trimmedSearch ? 280 : 0)

    return () => window.clearTimeout(timer)
  }, [activeTab, selectedCountry, selectedGenre, trimmedSearch])

  const genreCards = useMemo(() => {
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
  }, [categories])

  const visibleStations = useMemo(() => {
    if (activeTab === 'featured' && browseStations.length === 0 && featuredStations.length > 0) {
      return featuredStations
    }
    if (browseStations.length > 0) return browseStations
    if (activeTab === 'all' && featuredStations.length > 0) return featuredStations
    return browseStations
  }, [activeTab, browseStations, featuredStations])

  return {
    featuredStations,
    visibleStations,
    genreCards,
    countries,
    loading,
    stationsLoading,
    error,
    selectedCountry,
    setSelectedCountry,
    selectedGenre,
    setSelectedGenre,
    retry: loadBootstrap,
  }
}

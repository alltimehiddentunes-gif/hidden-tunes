import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchRadioStations } from '../radio/radioCatalogApi'
import { fetchPodcastShows } from '../podcasts/podcastCatalogApi'
import { searchAudiobooks } from '../audiobooks/audiobookCatalogApi'
import { searchMotivationals } from '../motivationals/motivationalCatalogApi'
import { searchTvChannels } from '../tv/tvCatalogApi'
import { searchSportsFixtures } from '../sports/sportsCatalogApi'
import { getLibraryItems } from '../library/libraryService'
import { filterLibraryItemsForDisplay } from '../library/matureFilter'
import { listPlaylists } from '../playlists/playlistService'
import { hasDesktopDownloadsBridge, listDesktopDownloads } from '../downloads/bridge'
import type { DesktopLibraryItem } from '../library/types'
import type { DesktopPlaylist } from '../playlists/types'
import type { DesktopDownloadItem } from '../downloads/types'
import type { RadioStationMeta } from '../radio/types'
import type { PodcastShowMeta } from '../podcasts/types'
import type { AudiobookBookMeta } from '../audiobooks/types'
import type { MotivationalSessionMeta } from '../motivationals/types'
import type { TvChannelMeta } from '../tv/types'
import type { DesktopSportsFixture } from '../sports/types'

/** First-page size — keep initial Discover search cheap. */
export const GLOBAL_SEARCH_INITIAL_LIMIT = 8
/** Continuation page size — still bounded; never hydrates the full catalog. */
export const GLOBAL_SEARCH_PAGE_LIMIT = 24
/** Local-only families stay preview-sized. */
const LOCAL_LIMIT = 8

export type GlobalSearchFamilyId =
  | 'radio'
  | 'podcastShows'
  | 'audiobooks'
  | 'motivationals'
  | 'tv'
  | 'sports'

export type GlobalSearchFamilyState<T> = {
  items: T[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  loadMoreError: string | null
  page: number
  hasMore: boolean
  total: number | null
}

function emptyFamily<T>(): GlobalSearchFamilyState<T> {
  return {
    items: [],
    loading: false,
    loadingMore: false,
    error: null,
    loadMoreError: null,
    page: 0,
    hasMore: false,
    total: null,
  }
}

function isAbort(reason: unknown) {
  return reason instanceof DOMException && reason.name === 'AbortError'
}

function readError(reason: unknown, fallback: string) {
  if (isAbort(reason)) return null
  return reason instanceof Error ? reason.message : fallback
}

function appendUniqueById<T>(
  previous: T[],
  next: T[],
  getId: (item: T) => string,
): T[] {
  if (next.length === 0) return previous
  const seen = new Set(previous.map(getId))
  const merged = [...previous]
  for (const item of next) {
    const id = getId(item)
    if (!id || seen.has(id)) continue
    seen.add(id)
    merged.push(item)
  }
  return merged
}

function readTotal(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * Multi-family Discover search with per-family abort + stale protection.
 * Podcast episode queries stay out of global search (shows only).
 * Page 1 stays small; continuation is explicit via loadMoreFamily.
 */
export function useGlobalDesktopSearch(debouncedQuery: string) {
  const trimmed = debouncedQuery.trim()
  const [radio, setRadio] = useState(emptyFamily<RadioStationMeta>())
  const [podcastShows, setPodcastShows] = useState(emptyFamily<PodcastShowMeta>())
  const [audiobooks, setAudiobooks] = useState(emptyFamily<AudiobookBookMeta>())
  const [motivationals, setMotivationals] = useState(emptyFamily<MotivationalSessionMeta>())
  const [tv, setTv] = useState(emptyFamily<TvChannelMeta>())
  const [sports, setSports] = useState(emptyFamily<DesktopSportsFixture>())
  const [downloads, setDownloads] = useState(emptyFamily<DesktopDownloadItem>())
  const requestRef = useRef(0)
  const queryRef = useRef(trimmed)
  queryRef.current = trimmed
  const radioRef = useRef(radio)
  const podcastRef = useRef(podcastShows)
  const audiobookRef = useRef(audiobooks)
  const motivationalRef = useRef(motivationals)
  const tvRef = useRef(tv)
  const sportsRef = useRef(sports)
  radioRef.current = radio
  podcastRef.current = podcastShows
  audiobookRef.current = audiobooks
  motivationalRef.current = motivationals
  tvRef.current = tv
  sportsRef.current = sports

  const library = useMemo<GlobalSearchFamilyState<DesktopLibraryItem>>(() => {
    if (!trimmed) return emptyFamily()
    const q = trimmed.toLowerCase()
    return {
      items: filterLibraryItemsForDisplay(getLibraryItems(), { includeMature: false })
        .filter((item) => `${item.title} ${item.subtitle || ''}`.toLowerCase().includes(q))
        .slice(0, LOCAL_LIMIT),
      loading: false,
      loadingMore: false,
      error: null,
      loadMoreError: null,
      page: 1,
      hasMore: false,
      total: null,
    }
  }, [trimmed])

  const playlists = useMemo<GlobalSearchFamilyState<DesktopPlaylist>>(() => {
    if (!trimmed) return emptyFamily()
    const q = trimmed.toLowerCase()
    return {
      items: listPlaylists()
        .filter((playlist) => playlist.title.toLowerCase().includes(q))
        .slice(0, LOCAL_LIMIT),
      loading: false,
      loadingMore: false,
      error: null,
      loadMoreError: null,
      page: 1,
      hasMore: false,
      total: null,
    }
  }, [trimmed])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- bounded multi-family search orchestration */
    if (!trimmed) {
      setRadio(emptyFamily())
      setPodcastShows(emptyFamily())
      setAudiobooks(emptyFamily())
      setMotivationals(emptyFamily())
      setTv(emptyFamily())
      setSports(emptyFamily())
      setDownloads(emptyFamily())
      return
    }

    const requestId = ++requestRef.current
    const controllers = Array.from({ length: 6 }, () => new AbortController())
    const q = trimmed.toLowerCase()
    const activeQuery = trimmed

    // Synchronous acknowledgement — do not defer loading behind microtasks.
    setRadio({ items: [], loading: true, loadingMore: false, error: null, loadMoreError: null, page: 0, hasMore: false, total: null })
    setPodcastShows({ items: [], loading: true, loadingMore: false, error: null, loadMoreError: null, page: 0, hasMore: false, total: null })
    setAudiobooks({ items: [], loading: true, loadingMore: false, error: null, loadMoreError: null, page: 0, hasMore: false, total: null })
    setMotivationals({ items: [], loading: true, loadingMore: false, error: null, loadMoreError: null, page: 0, hasMore: false, total: null })
    setTv({ items: [], loading: true, loadingMore: false, error: null, loadMoreError: null, page: 0, hasMore: false, total: null })
    setSports({ items: [], loading: true, loadingMore: false, error: null, loadMoreError: null, page: 0, hasMore: false, total: null })

    if (hasDesktopDownloadsBridge()) {
      listDesktopDownloads()
        .then((items) => {
          if (requestId !== requestRef.current || queryRef.current !== activeQuery) return
          setDownloads({
            items: items
              .filter((item) => item.isMature !== true)
              .filter((item) => `${item.title} ${item.subtitle || ''}`.toLowerCase().includes(q))
              .slice(0, LOCAL_LIMIT),
            loading: false,
            loadingMore: false,
            error: null,
            loadMoreError: null,
            page: 1,
            hasMore: false,
            total: null,
          })
        })
        .catch(() => {
          if (requestId !== requestRef.current || queryRef.current !== activeQuery) return
          setDownloads(emptyFamily())
        })
    } else {
      setDownloads(emptyFamily())
    }

    fetchRadioStations(
      { query: trimmed, limit: GLOBAL_SEARCH_INITIAL_LIMIT, page: 1 },
      controllers[0].signal,
    )
      .then((result) => {
        if (requestId !== requestRef.current || queryRef.current !== activeQuery) return
        setRadio({
          items: result.stations,
          loading: false,
          loadingMore: false,
          error: null,
          loadMoreError: null,
          page: result.pagination.page || 1,
          hasMore: Boolean(result.pagination.hasMore),
          total: readTotal(result.pagination.total),
        })
      })
      .catch((reason) => {
        if (requestId !== requestRef.current || queryRef.current !== activeQuery || isAbort(reason)) return
        setRadio({
          items: [],
          loading: false,
          loadingMore: false,
          error: readError(reason, 'Radio search unavailable.'),
          loadMoreError: null,
          page: 0,
          hasMore: false,
          total: null,
        })
      })

    fetchPodcastShows(
      { query: trimmed, limit: GLOBAL_SEARCH_INITIAL_LIMIT, page: 1 },
      controllers[1].signal,
    )
      .then((result) => {
        if (requestId !== requestRef.current || queryRef.current !== activeQuery) return
        setPodcastShows({
          items: result.shows,
          loading: false,
          loadingMore: false,
          error: null,
          loadMoreError: null,
          page: result.pagination.page || 1,
          hasMore: Boolean(result.pagination.hasMore),
          total: readTotal(result.pagination.total),
        })
      })
      .catch((reason) => {
        if (requestId !== requestRef.current || queryRef.current !== activeQuery || isAbort(reason)) return
        setPodcastShows({
          items: [],
          loading: false,
          loadingMore: false,
          error: readError(reason, 'Podcast search unavailable.'),
          loadMoreError: null,
          page: 0,
          hasMore: false,
          total: null,
        })
      })

    searchAudiobooks(trimmed, { page: 1, limit: GLOBAL_SEARCH_INITIAL_LIMIT }, controllers[2].signal)
      .then((result) => {
        if (requestId !== requestRef.current || queryRef.current !== activeQuery) return
        setAudiobooks({
          items: result.books,
          loading: false,
          loadingMore: false,
          error: null,
          loadMoreError: null,
          page: result.pagination.page || 1,
          hasMore: Boolean(result.pagination.hasMore),
          total: readTotal(result.pagination.total),
        })
      })
      .catch((reason) => {
        if (requestId !== requestRef.current || queryRef.current !== activeQuery || isAbort(reason)) return
        setAudiobooks({
          items: [],
          loading: false,
          loadingMore: false,
          error: readError(reason, 'Audiobook search unavailable.'),
          loadMoreError: null,
          page: 0,
          hasMore: false,
          total: null,
        })
      })

    searchMotivationals(trimmed, { page: 1, limit: GLOBAL_SEARCH_INITIAL_LIMIT }, controllers[3].signal)
      .then((result) => {
        if (requestId !== requestRef.current || queryRef.current !== activeQuery) return
        setMotivationals({
          items: result.sessions,
          loading: false,
          loadingMore: false,
          error: null,
          loadMoreError: null,
          page: result.pagination.page || 1,
          hasMore: Boolean(result.pagination.hasMore),
          total: readTotal(result.pagination.total),
        })
      })
      .catch((reason) => {
        if (requestId !== requestRef.current || queryRef.current !== activeQuery || isAbort(reason)) return
        setMotivationals({
          items: [],
          loading: false,
          loadingMore: false,
          error: readError(reason, 'Motivational search unavailable.'),
          loadMoreError: null,
          page: 0,
          hasMore: false,
          total: null,
        })
      })

    searchTvChannels(trimmed, {
      page: 1,
      limit: GLOBAL_SEARCH_INITIAL_LIMIT,
      signal: controllers[4].signal,
    })
      .then((result) => {
        if (requestId !== requestRef.current || queryRef.current !== activeQuery) return
        setTv({
          items: result.channels,
          loading: false,
          loadingMore: false,
          error: null,
          loadMoreError: null,
          page: result.pagination.page || 1,
          hasMore: Boolean(result.pagination.hasMore),
          total: readTotal(result.pagination.total),
        })
      })
      .catch((reason) => {
        if (requestId !== requestRef.current || queryRef.current !== activeQuery || isAbort(reason)) return
        setTv({
          items: [],
          loading: false,
          loadingMore: false,
          error: readError(reason, 'TV search unavailable.'),
          loadMoreError: null,
          page: 0,
          hasMore: false,
          total: null,
        })
      })

    searchSportsFixtures(trimmed, {
      page: 1,
      limit: GLOBAL_SEARCH_INITIAL_LIMIT,
      signal: controllers[5].signal,
    })
      .then((result) => {
        if (requestId !== requestRef.current || queryRef.current !== activeQuery) return
        if (!result.enabled) {
          setSports({
            items: [],
            loading: false,
            loadingMore: false,
            error: null,
            loadMoreError: null,
            page: 1,
            hasMore: false,
            total: null,
          })
          return
        }
        setSports({
          items: result.fixtures,
          loading: false,
          loadingMore: false,
          error: null,
          loadMoreError: null,
          page: 1,
          hasMore: Boolean(result.hasMore),
          total: null,
        })
      })
      .catch((reason) => {
        if (requestId !== requestRef.current || queryRef.current !== activeQuery || isAbort(reason)) return
        setSports({
          items: [],
          loading: false,
          loadingMore: false,
          error: readError(reason, 'Sports search unavailable.'),
          loadMoreError: null,
          page: 0,
          hasMore: false,
          total: null,
        })
      })

    return () => {
      for (const controller of controllers) controller.abort()
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [trimmed])

  const loadMoreFamily = useCallback(async (family: GlobalSearchFamilyId) => {
    const activeQuery = queryRef.current
    if (!activeQuery) return
    const requestId = requestRef.current

    const begin = <T,>(
      state: GlobalSearchFamilyState<T>,
      setState: (value: (prev: GlobalSearchFamilyState<T>) => GlobalSearchFamilyState<T>) => void,
    ) => {
      if (state.loading || state.loadingMore || !state.hasMore || state.page < 1) return null
      setState((prev) => ({ ...prev, loadingMore: true, loadMoreError: null }))
      return state.page + 1
    }

    try {
      if (family === 'radio') {
        const nextPage = begin(radioRef.current, setRadio)
        if (nextPage == null) return
        const result = await fetchRadioStations({
          query: activeQuery,
          page: nextPage,
          limit: GLOBAL_SEARCH_PAGE_LIMIT,
        })
        if (requestId !== requestRef.current || queryRef.current !== activeQuery) return
        setRadio((prev) => ({
          ...prev,
          items: appendUniqueById(prev.items, result.stations, (item) => item.id),
          loadingMore: false,
          loadMoreError: null,
          page: result.pagination.page || nextPage,
          hasMore: Boolean(result.pagination.hasMore),
          total: readTotal(result.pagination.total) ?? prev.total,
        }))
        return
      }

      if (family === 'podcastShows') {
        const nextPage = begin(podcastRef.current, setPodcastShows)
        if (nextPage == null) return
        const result = await fetchPodcastShows({
          query: activeQuery,
          page: nextPage,
          limit: GLOBAL_SEARCH_PAGE_LIMIT,
        })
        if (requestId !== requestRef.current || queryRef.current !== activeQuery) return
        setPodcastShows((prev) => ({
          ...prev,
          items: appendUniqueById(prev.items, result.shows, (item) => item.id),
          loadingMore: false,
          loadMoreError: null,
          page: result.pagination.page || nextPage,
          hasMore: Boolean(result.pagination.hasMore),
          total: readTotal(result.pagination.total) ?? prev.total,
        }))
        return
      }

      if (family === 'audiobooks') {
        const nextPage = begin(audiobookRef.current, setAudiobooks)
        if (nextPage == null) return
        const result = await searchAudiobooks(activeQuery, {
          page: nextPage,
          limit: GLOBAL_SEARCH_PAGE_LIMIT,
        })
        if (requestId !== requestRef.current || queryRef.current !== activeQuery) return
        setAudiobooks((prev) => ({
          ...prev,
          items: appendUniqueById(prev.items, result.books, (item) => item.id),
          loadingMore: false,
          loadMoreError: null,
          page: result.pagination.page || nextPage,
          hasMore: Boolean(result.pagination.hasMore),
          total: readTotal(result.pagination.total) ?? prev.total,
        }))
        return
      }

      if (family === 'motivationals') {
        const nextPage = begin(motivationalRef.current, setMotivationals)
        if (nextPage == null) return
        const result = await searchMotivationals(activeQuery, {
          page: nextPage,
          limit: GLOBAL_SEARCH_PAGE_LIMIT,
        })
        if (requestId !== requestRef.current || queryRef.current !== activeQuery) return
        setMotivationals((prev) => ({
          ...prev,
          items: appendUniqueById(prev.items, result.sessions, (item) => item.id),
          loadingMore: false,
          loadMoreError: null,
          page: result.pagination.page || nextPage,
          hasMore: Boolean(result.pagination.hasMore),
          total: readTotal(result.pagination.total) ?? prev.total,
        }))
        return
      }

      if (family === 'tv') {
        const nextPage = begin(tvRef.current, setTv)
        if (nextPage == null) return
        const result = await searchTvChannels(activeQuery, {
          page: nextPage,
          limit: GLOBAL_SEARCH_PAGE_LIMIT,
        })
        if (requestId !== requestRef.current || queryRef.current !== activeQuery) return
        setTv((prev) => ({
          ...prev,
          items: appendUniqueById(prev.items, result.channels, (item) => item.id),
          loadingMore: false,
          loadMoreError: null,
          page: result.pagination.page || nextPage,
          hasMore: Boolean(result.pagination.hasMore),
          total: readTotal(result.pagination.total) ?? prev.total,
        }))
        return
      }

      if (family === 'sports') {
        const nextPage = begin(sportsRef.current, setSports)
        if (nextPage == null) return
        const result = await searchSportsFixtures(activeQuery, {
          page: nextPage,
          limit: GLOBAL_SEARCH_PAGE_LIMIT,
        })
        if (requestId !== requestRef.current || queryRef.current !== activeQuery) return
        if (!result.enabled) {
          setSports((prev) => ({ ...prev, loadingMore: false, hasMore: false }))
          return
        }
        setSports((prev) => ({
          ...prev,
          items: appendUniqueById(prev.items, result.fixtures, (item) => item.id),
          loadingMore: false,
          loadMoreError: null,
          page: nextPage,
          hasMore: Boolean(result.hasMore),
        }))
      }
    } catch (reason) {
      if (requestId !== requestRef.current || queryRef.current !== activeQuery || isAbort(reason)) return
      const message = readError(reason, 'Could not load more results.')
      const patch = <T,>(
        setState: (value: (prev: GlobalSearchFamilyState<T>) => GlobalSearchFamilyState<T>) => void,
      ) => {
        setState((prev) => ({
          ...prev,
          loadingMore: false,
          loadMoreError: message,
        }))
      }
      if (family === 'radio') patch(setRadio)
      else if (family === 'podcastShows') patch(setPodcastShows)
      else if (family === 'audiobooks') patch(setAudiobooks)
      else if (family === 'motivationals') patch(setMotivationals)
      else if (family === 'tv') patch(setTv)
      else patch(setSports)
    }
  }, [])

  const radioView = trimmed ? radio : emptyFamily<RadioStationMeta>()
  const podcastView = trimmed ? podcastShows : emptyFamily<PodcastShowMeta>()
  const audiobookView = trimmed ? audiobooks : emptyFamily<AudiobookBookMeta>()
  const motivationalView = trimmed ? motivationals : emptyFamily<MotivationalSessionMeta>()
  const tvView = trimmed ? tv : emptyFamily<TvChannelMeta>()
  const sportsView = trimmed ? sports : emptyFamily<DesktopSportsFixture>()
  const downloadsView = trimmed ? downloads : emptyFamily<DesktopDownloadItem>()

  const hasRemoteResults = useMemo(
    () =>
      radioView.items.length
      + podcastView.items.length
      + audiobookView.items.length
      + motivationalView.items.length
      + tvView.items.length
      + sportsView.items.length
      + library.items.length
      + playlists.items.length
      + downloadsView.items.length
      > 0,
    [
      audiobookView.items.length,
      downloadsView.items.length,
      library.items.length,
      motivationalView.items.length,
      playlists.items.length,
      podcastView.items.length,
      radioView.items.length,
      sportsView.items.length,
      tvView.items.length,
    ],
  )

  const isFamilyLoading = Boolean(trimmed) && (
    radioView.loading
    || podcastView.loading
    || audiobookView.loading
    || motivationalView.loading
    || tvView.loading
    || sportsView.loading
    || downloadsView.loading
  )

  const hasFamilyErrors = Boolean(trimmed) && Boolean(
    radioView.error
    || podcastView.error
    || audiobookView.error
    || motivationalView.error
    || tvView.error
    || sportsView.error
    || downloadsView.error
  )

  return {
    radio: radioView,
    podcastShows: podcastView,
    audiobooks: audiobookView,
    motivationals: motivationalView,
    tv: tvView,
    sports: sportsView,
    library,
    playlists,
    downloads: downloadsView,
    hasRemoteResults,
    isFamilyLoading,
    hasFamilyErrors,
    active: trimmed.length > 0,
    loadMoreFamily,
  }
}

import { useEffect, useMemo, useRef, useState } from 'react'
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

const LIMIT = 8

export type GlobalSearchFamilyState<T> = {
  items: T[]
  loading: boolean
  error: string | null
}

function emptyFamily<T>(): GlobalSearchFamilyState<T> {
  return { items: [], loading: false, error: null }
}

function isAbort(reason: unknown) {
  return reason instanceof DOMException && reason.name === 'AbortError'
}

function readError(reason: unknown, fallback: string) {
  if (isAbort(reason)) return null
  return reason instanceof Error ? reason.message : fallback
}

/**
 * Multi-family Discover search with per-family abort + stale protection.
 * Podcast episode queries stay out of global search (shows only).
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

  const library = useMemo<GlobalSearchFamilyState<DesktopLibraryItem>>(() => {
    if (!trimmed) return emptyFamily()
    const q = trimmed.toLowerCase()
    return {
      items: filterLibraryItemsForDisplay(getLibraryItems(), { includeMature: false })
        .filter((item) => `${item.title} ${item.subtitle || ''}`.toLowerCase().includes(q))
        .slice(0, LIMIT),
      loading: false,
      error: null,
    }
  }, [trimmed])

  const playlists = useMemo<GlobalSearchFamilyState<DesktopPlaylist>>(() => {
    if (!trimmed) return emptyFamily()
    const q = trimmed.toLowerCase()
    return {
      items: listPlaylists()
        .filter((playlist) => playlist.title.toLowerCase().includes(q))
        .slice(0, LIMIT),
      loading: false,
      error: null,
    }
  }, [trimmed])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- bounded multi-family search orchestration */
    if (!trimmed) return

    const requestId = ++requestRef.current
    const controllers = Array.from({ length: 6 }, () => new AbortController())
    const q = trimmed.toLowerCase()

    setRadio({ items: [], loading: true, error: null })
    setPodcastShows({ items: [], loading: true, error: null })
    setAudiobooks({ items: [], loading: true, error: null })
    setMotivationals({ items: [], loading: true, error: null })
    setTv({ items: [], loading: true, error: null })
    setSports({ items: [], loading: true, error: null })

    if (hasDesktopDownloadsBridge()) {
      listDesktopDownloads()
        .then((items) => {
          if (requestId !== requestRef.current) return
          setDownloads({
            items: items
              .filter((item) => item.isMature !== true)
              .filter((item) => `${item.title} ${item.subtitle || ''}`.toLowerCase().includes(q))
              .slice(0, LIMIT),
            loading: false,
            error: null,
          })
        })
        .catch(() => {
          if (requestId !== requestRef.current) return
          setDownloads({ items: [], loading: false, error: null })
        })
    } else {
      setDownloads({ items: [], loading: false, error: null })
    }

    fetchRadioStations({ query: trimmed, limit: LIMIT, page: 1 }, controllers[0].signal)
      .then((result) => {
        if (requestId !== requestRef.current) return
        setRadio({ items: result.stations.slice(0, LIMIT), loading: false, error: null })
      })
      .catch((reason) => {
        if (requestId !== requestRef.current || isAbort(reason)) return
        setRadio({ items: [], loading: false, error: readError(reason, 'Radio search unavailable.') })
      })

    fetchPodcastShows({ query: trimmed, limit: LIMIT, page: 1 }, controllers[1].signal)
      .then((result) => {
        if (requestId !== requestRef.current) return
        setPodcastShows({ items: result.shows.slice(0, LIMIT), loading: false, error: null })
      })
      .catch((reason) => {
        if (requestId !== requestRef.current || isAbort(reason)) return
        setPodcastShows({ items: [], loading: false, error: readError(reason, 'Podcast search unavailable.') })
      })

    searchAudiobooks(trimmed, { page: 1, limit: LIMIT }, controllers[2].signal)
      .then((result) => {
        if (requestId !== requestRef.current) return
        setAudiobooks({ items: result.books.slice(0, LIMIT), loading: false, error: null })
      })
      .catch((reason) => {
        if (requestId !== requestRef.current || isAbort(reason)) return
        setAudiobooks({ items: [], loading: false, error: readError(reason, 'Audiobook search unavailable.') })
      })

    searchMotivationals(trimmed, { page: 1, limit: LIMIT }, controllers[3].signal)
      .then((result) => {
        if (requestId !== requestRef.current) return
        setMotivationals({ items: result.sessions.slice(0, LIMIT), loading: false, error: null })
      })
      .catch((reason) => {
        if (requestId !== requestRef.current || isAbort(reason)) return
        setMotivationals({
          items: [],
          loading: false,
          error: readError(reason, 'Motivational search unavailable.'),
        })
      })

    searchTvChannels(trimmed, { page: 1, limit: LIMIT, signal: controllers[4].signal })
      .then((result) => {
        if (requestId !== requestRef.current) return
        setTv({ items: result.channels.slice(0, LIMIT), loading: false, error: null })
      })
      .catch((reason) => {
        if (requestId !== requestRef.current || isAbort(reason)) return
        setTv({ items: [], loading: false, error: readError(reason, 'TV search unavailable.') })
      })

    searchSportsFixtures(trimmed, { limit: LIMIT, signal: controllers[5].signal })
      .then((result) => {
        if (requestId !== requestRef.current) return
        if (!result.enabled) {
          setSports({ items: [], loading: false, error: null })
          return
        }
        setSports({ items: result.fixtures.slice(0, LIMIT), loading: false, error: null })
      })
      .catch((reason) => {
        if (requestId !== requestRef.current || isAbort(reason)) return
        setSports({ items: [], loading: false, error: readError(reason, 'Sports search unavailable.') })
      })

    return () => {
      for (const controller of controllers) controller.abort()
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [trimmed])

  // Typed idles — emptyFamily() without a type param widens items to unknown
  // and collapses ReturnType<> for GlobalSearchSections.
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
    active: trimmed.length > 0,
  }
}

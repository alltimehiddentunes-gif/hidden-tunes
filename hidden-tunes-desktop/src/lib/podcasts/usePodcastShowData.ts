import { useCallback, useEffect, useRef, useState } from 'react'
import { PodcastCatalogError, fetchPodcastEpisodes, fetchPodcastShow } from './podcastCatalogApi'
import { enrichPodcastEpisodesWithShowTitles } from './podcastShowEnrichment'
import type { PodcastEpisodeMeta, PodcastPagination, PodcastShowMeta } from './types'

const EPISODES_PAGE_SIZE = 20

function readError(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

export function usePodcastShowData(showId: string | null) {
  const [show, setShow] = useState<PodcastShowMeta | null>(null)
  const [episodes, setEpisodes] = useState<PodcastEpisodeMeta[]>([])
  const [episodesPagination, setEpisodesPagination] = useState<PodcastPagination | null>(null)
  const [showLoading, setShowLoading] = useState(Boolean(showId))
  const [episodesLoading, setEpisodesLoading] = useState(Boolean(showId))
  const [episodesLoadingMore, setEpisodesLoadingMore] = useState(false)
  const [showError, setShowError] = useState<string | null>(null)
  const [showNotFound, setShowNotFound] = useState(false)
  const [episodesError, setEpisodesError] = useState<string | null>(null)
  const requestRef = useRef(0)
  const episodesAbortRef = useRef<AbortController | null>(null)

  const loadEpisodes = useCallback(
    async (targetShowId: string, page: number, signal?: AbortSignal, append = false) => {
      const response = await fetchPodcastEpisodes(
        {
          showId: targetShowId,
          page,
          limit: EPISODES_PAGE_SIZE,
        },
        signal,
      )

      const knownShows = show ? [show, ...response.shows] : response.shows
      const enriched = await enrichPodcastEpisodesWithShowTitles(
        response.episodes,
        knownShows,
        signal,
      )

      if (signal?.aborted) return

      setEpisodes((current) => (append ? [...current, ...enriched] : enriched))
      setEpisodesPagination(response.pagination)
      setEpisodesError(null)
    },
    [show],
  )

  const loadShowDetail = useCallback(async () => {
    const cleanId = showId?.trim()
    if (!cleanId) {
      setShow(null)
      setEpisodes([])
      setShowLoading(false)
      setEpisodesLoading(false)
      return
    }

    episodesAbortRef.current?.abort()
    const episodesController = new AbortController()
    episodesAbortRef.current = episodesController

    const requestId = ++requestRef.current
    setShowLoading(true)
    setEpisodesLoading(true)
    setShowError(null)
    setShowNotFound(false)
    setEpisodesError(null)
    setEpisodes([])
    setEpisodesPagination(null)

    let loadedShow: PodcastShowMeta | null = null

    try {
      const showResponse = await fetchPodcastShow(cleanId)
      if (requestId !== requestRef.current) return
      loadedShow = showResponse.show
      setShow(loadedShow)
      setShowLoading(false)
    } catch (error) {
      if (requestId !== requestRef.current) return
      setShow(null)
      setShowLoading(false)
      if (error instanceof PodcastCatalogError && error.status === 404) {
        setShowNotFound(true)
      } else {
        setShowError(readError(error, 'Failed to load podcast show.'))
      }
      setEpisodesLoading(false)
      return
    }

    try {
      const response = await fetchPodcastEpisodes(
        {
          showId: cleanId,
          page: 1,
          limit: EPISODES_PAGE_SIZE,
        },
        episodesController.signal,
      )

      if (requestId !== requestRef.current || episodesController.signal.aborted) return

      const knownShows = loadedShow ? [loadedShow, ...response.shows] : response.shows
      const enriched = await enrichPodcastEpisodesWithShowTitles(
        response.episodes,
        knownShows,
        episodesController.signal,
      )

      if (requestId !== requestRef.current || episodesController.signal.aborted) return

      setEpisodes(enriched)
      setEpisodesPagination(response.pagination)
    } catch (error) {
      if (requestId !== requestRef.current || episodesController.signal.aborted) return
      setEpisodes([])
      setEpisodesError(readError(error, 'Failed to load episodes.'))
    } finally {
      if (requestId === requestRef.current) {
        setEpisodesLoading(false)
      }
    }
  }, [showId])

  useEffect(() => {
    void loadShowDetail()
    return () => {
      episodesAbortRef.current?.abort()
    }
  }, [loadShowDetail])

  const loadMoreEpisodes = useCallback(async () => {
    const cleanId = showId?.trim()
    if (!cleanId || !episodesPagination?.hasMore || episodesLoadingMore) return

    setEpisodesLoadingMore(true)
    try {
      await loadEpisodes(cleanId, episodesPagination.page + 1, undefined, true)
    } catch (error) {
      setEpisodesError(readError(error, 'Failed to load more episodes.'))
    } finally {
      setEpisodesLoadingMore(false)
    }
  }, [episodesLoadingMore, episodesPagination, loadEpisodes, showId])

  const retryEpisodes = useCallback(async () => {
    const cleanId = showId?.trim()
    if (!cleanId || !show) return

    episodesAbortRef.current?.abort()
    const controller = new AbortController()
    episodesAbortRef.current = controller

    setEpisodesLoading(true)
    setEpisodesError(null)

    try {
      await loadEpisodes(cleanId, 1, controller.signal, false)
    } catch (error) {
      if (controller.signal.aborted) return
      setEpisodes([])
      setEpisodesError(readError(error, 'Failed to load episodes.'))
    } finally {
      setEpisodesLoading(false)
    }
  }, [loadEpisodes, show, showId])

  return {
    show,
    episodes,
    episodesPagination,
    showLoading,
    episodesLoading,
    episodesLoadingMore,
    showError,
    showNotFound,
    episodesError,
    loadMoreEpisodes,
    retryShow: loadShowDetail,
    retryEpisodes,
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDesktopConnectivity } from '../downloads/useDesktopConnectivity'
import {
  fetchSportsFixtureDetail,
  fetchSportsFixtures,
} from './sportsCatalogApi'
import type {
  DesktopSportsFixture,
  SportsBrowseFilter,
  SportsCatalogFilters,
  SportsFixtureDetailResult,
} from './types'
import { SPORTS_LIVE_REFRESH_MS, SPORTS_PAGE_SIZE } from './types'

function isAbortError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const name = String((error as { name?: string }).name || '')
  if (name === 'AbortError') return true
  const message = String((error as { message?: string }).message || '')
  return /aborted|AbortError|The operation was aborted/i.test(message)
}

function readError(error: unknown, offline: boolean) {
  if (offline) return 'A network connection is required.'
  if (error instanceof Error && error.message) return error.message
  return 'Sports could not be loaded.'
}

export type UseDesktopSportsOptions = {
  /** Active browse filter — Live / Upcoming / Completed. */
  filter?: Exclude<SportsBrowseFilter, 'all'>
  /** Pass false when the Sports route is inactive to stop live refresh. */
  pageActive?: boolean
  sport?: string | null
  catalogFilters?: SportsCatalogFilters
}

/**
 * Shell-friendly Sports browse hook.
 * Abort on filter change, stale-response protection, offline-aware, live refresh 45s.
 */
export function useDesktopSports(options: UseDesktopSportsOptions = {}) {
  const filter = options.filter || 'today'
  const pageActive = options.pageActive !== false
  const sport = options.sport?.trim() || null
  const date = options.catalogFilters?.date?.trim() || null
  const status = options.catalogFilters?.status?.trim() || null
  const country = options.catalogFilters?.country?.trim() || null
  const competition = options.catalogFilters?.competition?.trim() || null
  const { online, offline } = useDesktopConnectivity()

  const [fixtures, setFixtures] = useState<DesktopSportsFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const requestGenerationRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const filterRef = useRef(filter)

  const hasLiveFixture = fixtures.some((fixture) => fixture.status === 'live')

  const loadPage = useCallback(
    async (nextPage: number, mode: 'replace' | 'append', activeFilter: Exclude<SportsBrowseFilter, 'all'>) => {
      if (offline) {
        setError('A network connection is required.')
        setLoading(false)
        setLoadingMore(false)
        return
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const generation = ++requestGenerationRef.current

      if (mode === 'replace') {
        setLoading(true)
        setError(null)
      } else {
        setLoadingMore(true)
      }

      try {
        const result = await fetchSportsFixtures({
          filter: activeFilter,
          page: nextPage,
          limit: SPORTS_PAGE_SIZE,
          sport,
          date,
          status,
          country,
          competition,
          signal: controller.signal,
        })

        if (generation !== requestGenerationRef.current) return
        if (filterRef.current !== activeFilter) return

        setEnabled(result.enabled)
        setMessage(result.message ?? null)
        setHasMore(result.pagination.hasMore)
        setPage(result.pagination.page)
        setFixtures((prev) => {
          if (mode === 'replace') return result.fixtures
          const seen = new Set(prev.map((entry) => entry.id))
          const merged = [...prev]
          for (const fixture of result.fixtures) {
            if (seen.has(fixture.id)) continue
            seen.add(fixture.id)
            merged.push(fixture)
          }
          return merged
        })
        setError(null)
      } catch (reason) {
        if (isAbortError(reason) || controller.signal.aborted) return
        if (generation !== requestGenerationRef.current) return
        setError(readError(reason, offline))
        // Preserve proven prior content on refresh failure. Empty initial loads
        // still render the dedicated error state because fixtures is empty.
      } finally {
        if (generation === requestGenerationRef.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [competition, country, date, offline, sport, status],
  )

  const retry = useCallback(() => {
    void loadPage(1, 'replace', filter)
  }, [filter, loadPage])

  const loadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore || offline || !enabled) return
    void loadPage(page + 1, 'append', filter)
  }, [enabled, filter, hasMore, loadPage, loading, loadingMore, offline, page])

  const fetchDetail = useCallback(
    async (fixtureId: string, signal?: AbortSignal): Promise<SportsFixtureDetailResult> => {
      if (offline) {
        return {
          success: false,
          enabled: true,
          fixture: null,
          message: 'A network connection is required.',
        }
      }
      return fetchSportsFixtureDetail(fixtureId, signal)
    },
    [offline],
  )

  // Keep filterRef in sync for stale-response guards (effects only).
  useEffect(() => {
    filterRef.current = filter
  }, [filter])

  // Initial / filter change load
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- bounded browse orchestration with abort + stale guards */
    setPage(1)
    setHasMore(false)
    setFixtures([])
    void loadPage(1, 'replace', filter)
    return () => {
      abortRef.current?.abort()
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [competition, country, date, filter, loadPage, sport, status])

  // Live refresh — 45s only when appropriate
  useEffect(() => {
    if (!pageActive || offline || !online || !enabled) return
    if (filter !== 'live' && !hasLiveFixture) return
    if (typeof document === 'undefined') return

    let cancelled = false
    let timer: number | null = null

    const clearTimer = () => {
      if (timer != null) {
        window.clearTimeout(timer)
        timer = null
      }
    }

    const schedule = () => {
      clearTimer()
      if (document.visibilityState !== 'visible') return
      timer = window.setTimeout(async () => {
        if (cancelled) return
        if (document.visibilityState !== 'visible') {
          schedule()
          return
        }
        try {
          const result = await fetchSportsFixtures({
            filter,
            page: 1,
            limit: SPORTS_PAGE_SIZE,
            sport,
            date,
            status,
            country,
            competition,
          })
          if (cancelled) return
          if (filterRef.current !== filter) return
          setEnabled(result.enabled)
          setFixtures(result.fixtures)
          setHasMore(result.pagination.hasMore)
          setPage(1)
          setMessage(result.message ?? null)
        } catch {
          // Soft refresh failure — keep current list; don't spam errors.
        }
        if (!cancelled) schedule()
      }, SPORTS_LIVE_REFRESH_MS)
    }

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        clearTimer()
        return
      }
      schedule()
    }

    schedule()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      clearTimer()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [competition, country, date, enabled, filter, hasLiveFixture, offline, online, pageActive, sport, status])

  return {
    filter,
    fixtures,
    loading,
    loadingMore,
    error,
    enabled,
    hasMore,
    message,
    online,
    offline,
    retry,
    loadMore,
    fetchDetail,
    pageSize: SPORTS_PAGE_SIZE,
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLectureSeriesDetails, fetchLectureSeriesSessions } from './lectureCatalogApi'
import type { LectureItem, LecturePagination, LectureSeries } from './types'
import { sortSessions } from './normalization'

const EMPTY = {
  series: null as LectureSeries | null,
  sessions: [] as LectureItem[],
  pagination: null as LecturePagination | null,
  loading: true,
  loadingMore: false,
  error: null as string | null,
}

function dedupeSessions(sessions: LectureItem[]) {
  const seen = new Set<string>()
  const next: LectureItem[] = []
  for (const session of sessions) {
    if (seen.has(session.id)) continue
    seen.add(session.id)
    next.push(session)
  }
  return sortSessions(next)
}

export function useLectureSeriesData(seriesId: string) {
  const [series, setSeries] = useState<LectureSeries | null>(null)
  const [sessions, setSessions] = useState<LectureItem[]>([])
  const [pagination, setPagination] = useState<LecturePagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bootstrapRef = useRef(0)
  const loadMoreRef = useRef(0)

  useEffect(() => {
    const cleanId = seriesId.trim()
    if (!cleanId) {
      setSeries(null)
      setSessions([])
      setPagination(null)
      setLoading(false)
      setError('Lecture course not found.')
      return
    }

    const requestId = ++bootstrapRef.current
    const controller = new AbortController()

    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const detail = await fetchLectureSeriesDetails(cleanId, { page: 1, limit: 40 }, controller.signal)
        if (requestId !== bootstrapRef.current) return
        if (!detail) {
          setSeries(null)
          setSessions([])
          setPagination(null)
          setError('Lecture course not found.')
          return
        }
        setSeries(detail.series)
        setSessions(detail.sessions)
        setPagination(detail.pagination)
      } catch (reason) {
        if (requestId !== bootstrapRef.current) return
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'Unable to load this course.')
      } finally {
        if (requestId === bootstrapRef.current) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [seriesId])

  const loadMoreSessions = useCallback(() => {
    const cleanId = seriesId.trim()
    if (!cleanId || !pagination?.hasMore || loadingMore) return

    const requestId = ++loadMoreRef.current
    const controller = new AbortController()
    setLoadingMore(true)

    void (async () => {
      try {
        const nextPage = (pagination.page ?? 1) + 1
        const detail = await fetchLectureSeriesSessions(
          cleanId,
          { page: nextPage, limit: pagination.limit },
          controller.signal,
        )
        if (requestId !== loadMoreRef.current) return
        if (!detail) return
        setSeries(detail.series)
        setSessions((previous) => dedupeSessions([...previous, ...detail.sessions]))
        setPagination(detail.pagination)
      } catch (reason) {
        if (requestId !== loadMoreRef.current) return
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'Unable to load more sessions.')
      } finally {
        if (requestId === loadMoreRef.current) setLoadingMore(false)
      }
    })()
  }, [loadingMore, pagination, seriesId])

  if (!seriesId.trim()) {
    return { ...EMPTY, loadMoreSessions: () => undefined }
  }

  return {
    series,
    sessions,
    pagination,
    loading,
    loadingMore,
    error,
    loadMoreSessions,
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMotivationalProgram, fetchMotivationalProgramSessions } from './motivationalCatalogApi'
import type {
  MotivationalPagination,
  MotivationalProgramMeta,
  MotivationalSessionMeta,
} from './types'

function readError(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

function dedupeSessions(sessions: MotivationalSessionMeta[]) {
  const seen = new Set<string>()
  const next: MotivationalSessionMeta[] = []
  for (const session of sessions) {
    if (seen.has(session.id)) continue
    seen.add(session.id)
    next.push(session)
  }
  return next
}

const EMPTY_PROGRAM_STATE = {
  program: null as MotivationalProgramMeta | null,
  sessions: [] as MotivationalSessionMeta[],
  pagination: null as MotivationalPagination | null,
  standalone: false,
  loading: false,
  loadingMore: false,
  error: null as string | null,
}

export function useMotivationalProgramData(programId: string | null) {
  const cleanId = programId?.trim() ?? ''
  const [program, setProgram] = useState<MotivationalProgramMeta | null>(null)
  const [sessions, setSessions] = useState<MotivationalSessionMeta[]>([])
  const [pagination, setPagination] = useState<MotivationalPagination | null>(null)
  const [standalone, setStandalone] = useState(false)
  const [loading, setLoading] = useState(() => Boolean(cleanId))
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    if (!cleanId) return

    const requestId = ++requestRef.current
    const controller = new AbortController()

    void (async () => {
      setLoading(true)
      setError(null)

      try {
        const detail = await fetchMotivationalProgram(cleanId, controller.signal)
        if (requestId !== requestRef.current) return
        if (!detail) {
          setProgram(null)
          setSessions([])
          setPagination(null)
          setStandalone(false)
          setError('This motivational program could not be found.')
          return
        }
        setProgram(detail.program)
        setSessions(detail.sessions)
        setPagination(detail.pagination)
        setStandalone(detail.standalone)
      } catch (reason) {
        if (requestId !== requestRef.current) return
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setProgram(null)
        setSessions([])
        setPagination(null)
        setStandalone(false)
        setError(readError(reason, 'Could not load this motivational program.'))
      } finally {
        if (requestId === requestRef.current) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [cleanId])

  const loadMoreSessions = useCallback(() => {
    if (!cleanId || !pagination?.hasMore || loadingMore || standalone) return

    const nextPage = pagination.page + 1
    const controller = new AbortController()
    setLoadingMore(true)

    void (async () => {
      try {
        const detail = await fetchMotivationalProgramSessions(
          cleanId,
          { page: nextPage, limit: 40 },
          controller.signal,
        )
        if (!detail) return
        setPagination(detail.pagination)
        setSessions((previous) => dedupeSessions([...previous, ...detail.sessions]))
      } catch {
        // Ignore pagination failures.
      } finally {
        setLoadingMore(false)
      }
    })()
  }, [cleanId, loadingMore, pagination, standalone])

  if (!cleanId) {
    return { ...EMPTY_PROGRAM_STATE, loadMoreSessions: () => undefined }
  }

  return {
    program,
    sessions,
    pagination,
    standalone,
    loading,
    loadingMore,
    error,
    loadMoreSessions,
  }
}

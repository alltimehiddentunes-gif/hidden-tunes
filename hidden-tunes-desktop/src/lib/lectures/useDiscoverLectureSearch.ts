import { useEffect, useMemo, useRef, useState } from 'react'
import { searchLectures } from './lectureCatalogApi'
import type { LectureSeries } from './types'

export const DISCOVER_LECTURE_COURSE_LIMIT = 6
export const DISCOVER_LECTURE_SPEAKER_LIMIT = 6

export type DiscoverLectureSpeaker = {
  name: string
  seriesId: string
  artworkUrl: string | null
  courseCount: number
}

function readError(reason: unknown) {
  return reason instanceof Error ? reason.message : 'Unable to search lectures.'
}

/**
 * Bounded lecture search for Discover — never loads a full catalog page into memory.
 * Song-first Discover ranking is unaffected; this is a secondary group only.
 */
export function useDiscoverLectureSearch(debouncedQuery: string) {
  const [courses, setCourses] = useState<LectureSeries[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  const trimmed = debouncedQuery.trim()

  useEffect(() => {
    if (!trimmed) {
      setCourses([])
      setLoading(false)
      setError(null)
      return
    }

    const requestId = ++requestRef.current
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const response = await searchLectures(
          trimmed,
          { page: 1, limit: DISCOVER_LECTURE_COURSE_LIMIT },
          controller.signal,
        )
        if (requestId !== requestRef.current) return
        setCourses(response.series.slice(0, DISCOVER_LECTURE_COURSE_LIMIT))
      } catch (reason) {
        if (requestId !== requestRef.current) return
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setCourses([])
        setError(readError(reason))
      } finally {
        if (requestId === requestRef.current) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [trimmed])

  const speakers = useMemo(() => {
    const map = new Map<string, DiscoverLectureSpeaker>()
    for (const series of courses) {
      const name = series.speaker?.name?.trim()
      if (!name) continue
      const existing = map.get(name)
      if (existing) {
        existing.courseCount += 1
        continue
      }
      map.set(name, {
        name,
        seriesId: series.id,
        artworkUrl: series.artworkUrl,
        courseCount: 1,
      })
      if (map.size >= DISCOVER_LECTURE_SPEAKER_LIMIT) break
    }
    return [...map.values()]
  }, [courses])

  return {
    courses,
    speakers,
    loading,
    error,
    hasResults: courses.length > 0 || speakers.length > 0,
  }
}

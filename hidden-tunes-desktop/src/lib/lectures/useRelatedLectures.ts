import { useEffect, useRef, useState } from 'react'
import { fetchLectureCategory, isLectureRequestCancellation, searchLectures } from './lectureCatalogApi'
import type { LectureSeries } from './types'

const RELATED_LIMIT = 8

/**
 * Bounded related-course suggestions for the lecture detail page.
 * Prefer same speaker → same category; never include the current series.
 */
export function useRelatedLectures(series: LectureSeries | null) {
  const [related, setRelated] = useState<LectureSeries[]>([])
  const [loading, setLoading] = useState(false)
  const requestRef = useRef(0)
  const seriesId = series?.id ?? null
  const [prevSeriesId, setPrevSeriesId] = useState(seriesId)

  if (seriesId !== prevSeriesId) {
    setPrevSeriesId(seriesId)
    if (!seriesId) {
      setRelated([])
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!series?.id) return

    const requestId = ++requestRef.current
    const controller = new AbortController()

    void (async () => {
      await Promise.resolve()
      if (requestId !== requestRef.current) return
      setLoading(true)

      try {
        const collected: LectureSeries[] = []
        const seen = new Set<string>([series.id])

        const pushUnique = (items: LectureSeries[]) => {
          for (const item of items) {
            if (seen.has(item.id)) continue
            seen.add(item.id)
            collected.push(item)
            if (collected.length >= RELATED_LIMIT) return false
          }
          return true
        }

        const speakerName = series.speaker?.name?.trim()
        if (speakerName) {
          const speakerResults = await searchLectures(
            speakerName,
            { page: 1, limit: RELATED_LIMIT },
            controller.signal,
          )
          if (requestId !== requestRef.current) return
          if (!pushUnique(speakerResults.series)) {
            setRelated(collected)
            return
          }
        }

        const categorySlug = series.category?.slug
        if (categorySlug && collected.length < RELATED_LIMIT) {
          const categoryResults = await fetchLectureCategory(
            categorySlug,
            { page: 1, limit: RELATED_LIMIT },
            controller.signal,
          )
          if (requestId !== requestRef.current) return
          pushUnique(categoryResults.series)
        }

        if (requestId !== requestRef.current) return
        setRelated(collected.slice(0, RELATED_LIMIT))
      } catch (reason) {
        if (requestId !== requestRef.current) return
        if (isLectureRequestCancellation(reason, controller.signal)) return
        setRelated([])
      } finally {
        if (requestId === requestRef.current) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [
    series?.id,
    series?.speaker?.name,
    series?.category?.slug,
  ])

  return { related, loading }
}

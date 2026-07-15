import { categoryDisplayName } from './normalization'
import type { LectureItem, LectureSeries } from './types'

export function formatLectureDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return null
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes} min`
}

export function formatLectureSeriesSubtitle(series: LectureSeries) {
  const parts: string[] = []
  if (series.speaker?.name) parts.push(series.speaker.name)
  if (series.institution?.name && series.institution.name !== series.speaker?.name) {
    parts.push(series.institution.name)
  }
  if (series.category?.slug) {
    parts.push(lectureCategoryLabel(series.category.slug))
  }
  if (series.sessionCount > 0) {
    parts.push(`${series.sessionCount} ${series.sessionCount === 1 ? 'session' : 'sessions'}`)
  }
  return parts.join(' · ') || 'Educational course'
}

export function formatLectureSessionMetaLine(session: LectureItem) {
  const parts: string[] = []
  if (session.sessionNumber != null) parts.push(`Session ${session.sessionNumber}`)
  if (session.durationSeconds) parts.push(formatLectureDuration(session.durationSeconds) ?? '')
  if (session.mediaType === 'video') parts.push('Video')
  else parts.push('Audio')
  return parts.filter(Boolean).join(' · ') || 'Session'
}

export function lectureCategoryLabel(slug: string | null | undefined) {
  if (!slug) return 'Education'
  return categoryDisplayName(slug)
}

export function formatContinueLearningRemaining(
  positionSeconds: number,
  durationSeconds: number | null,
) {
  if (!durationSeconds || durationSeconds <= 0) return null
  const remaining = Math.max(0, durationSeconds - positionSeconds)
  return formatLectureDuration(remaining)
}

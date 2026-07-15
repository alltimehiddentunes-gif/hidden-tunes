import type { MotivationalProgramMeta, MotivationalSessionMeta } from './types'

export function formatMotivationalDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return '—'
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes} min`
}

export function formatMotivationalProgramSubtitle(program: MotivationalProgramMeta): string {
  const parts: string[] = []
  if (program.subtitle) parts.push(program.subtitle)
  if (program.categorySlug) parts.push(motivationalCategoryLabel(program.categorySlug))
  if (!program.isStandaloneItem && program.sessionCount > 0) {
    parts.push(`${program.sessionCount} ${program.sessionCount === 1 ? 'session' : 'sessions'}`)
  }
  if (program.totalDurationSeconds) {
    parts.push(formatMotivationalDuration(program.totalDurationSeconds))
  }
  return parts.join(' · ') || (program.isStandaloneItem ? 'Motivational' : 'Motivational program')
}

export function formatMotivationalSessionMetaLine(session: MotivationalSessionMeta): string {
  const parts: string[] = []
  if (session.episodeNumber != null) parts.push(`Session ${session.episodeNumber}`)
  if (session.durationSeconds) parts.push(formatMotivationalDuration(session.durationSeconds))
  if (session.publishedAt) parts.push(session.publishedAt.slice(0, 10))
  return parts.join(' · ') || 'Session'
}

export function motivationalCategoryLabel(slug: string | null | undefined): string {
  if (!slug) return 'Motivationals'
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

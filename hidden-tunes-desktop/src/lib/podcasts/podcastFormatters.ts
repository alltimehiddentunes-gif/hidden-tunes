export function formatPodcastDuration(seconds: number | null) {
  if (seconds == null || seconds <= 0) return null
  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`
}

export function formatPodcastPublishedDate(value: string | null) {
  if (!value) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(parsed))
}

export function formatPodcastEpisodeLabel(
  seasonNumber: number | null,
  episodeNumber: number | null,
) {
  if (seasonNumber != null && episodeNumber != null) {
    return `S${seasonNumber} · E${episodeNumber}`
  }
  if (episodeNumber != null) return `Ep. ${episodeNumber}`
  return null
}

export function formatPodcastShowSubtitle(show: {
  hostName: string | null
  primaryCategory: string | null
  publisher: string | null
}) {
  return show.hostName || show.primaryCategory || show.publisher || 'Podcast series'
}

export function formatPodcastEpisodeMetaLine(episode: {
  seasonNumber: number | null
  episodeNumber: number | null
  durationSeconds: number | null
  publishedAt: string | null
}) {
  const parts = [
    formatPodcastEpisodeLabel(episode.seasonNumber, episode.episodeNumber),
    formatPodcastDuration(episode.durationSeconds),
    formatPodcastPublishedDate(episode.publishedAt),
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

export function formatPodcastDescriptionExcerpt(
  value: string | null,
  maxLength = 160,
) {
  if (!value) return null
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`
}

const CATEGORY_ICONS: Record<string, string> = {
  business: '▣',
  comedy: '☺',
  education: '✦',
  health: '♥',
  news: '◉',
  society: '◎',
  technology: '⌁',
  'true-crime': '◎',
}

export function podcastCategoryIcon(slug: string) {
  const normalized = slug.trim().toLowerCase()
  return CATEGORY_ICONS[normalized] ?? (normalized.charAt(0).toUpperCase() || '◎')
}

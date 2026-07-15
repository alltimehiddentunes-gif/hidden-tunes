import type { ApiSong } from '../api'

/** Fisher–Yates copy shuffle for music library destination actions. */
export function shuffleSongQueue(songs: ApiSong[]): ApiSong[] {
  const next = [...songs]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = next[index]
    next[index] = next[swapIndex]!
    next[swapIndex] = current!
  }
  return next
}

export function formatPlayedAgoLabel(iso: string | null | undefined): string {
  if (!iso) return '—'
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return '—'
  const deltaMs = Math.max(0, Date.now() - time)
  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`
  return new Date(time).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function formatLikedDateLabel(iso: string | null | undefined): string {
  if (!iso) return '—'
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return '—'
  return new Date(time).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

import type { DesktopLibraryItem, DesktopLibraryItemType } from './types'

/**
 * Mature radio (and similar) must stay typed and saved, but stay out of the
 * general Library list until mature access is enabled.
 * Desktop has no mature-access UI yet — default gate is closed.
 */
export function isMatureLibraryAccessEnabled(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem('ht-desktop:mature-library-access') === '1'
  } catch {
    return false
  }
}

export function isMatureLibraryItem(item: DesktopLibraryItem): boolean {
  if (item.type === 'radio') {
    if (item.isMature === true) return true
    const rating = (item.contentRating || '').toLowerCase()
    return rating === 'adult' || rating === 'explicit' || rating === 'mature'
  }
  return false
}

export function filterLibraryItemsForDisplay(
  items: DesktopLibraryItem[],
  options?: { includeMature?: boolean; type?: DesktopLibraryItemType | 'all' },
): DesktopLibraryItem[] {
  const includeMature = options?.includeMature ?? isMatureLibraryAccessEnabled()
  const type = options?.type ?? 'all'
  return items.filter((item) => {
    if (type !== 'all' && item.type !== type) return false
    if (!includeMature && isMatureLibraryItem(item)) return false
    return true
  })
}

export function typeLabel(type: DesktopLibraryItemType): string {
  switch (type) {
    case 'song':
      return 'Music'
    case 'radio':
      return 'Radio'
    case 'podcast_show':
      return 'Podcast'
    case 'podcast_episode':
      return 'Episode'
    case 'audiobook':
      return 'Audiobook'
    case 'tv':
      return 'TV'
    case 'motivational':
      return 'Motivational'
    case 'lecture':
      return 'Lecture'
    case 'sports':
      return 'Sports'
    case 'legacy_unknown':
      return 'Unknown'
    default:
      return 'Saved'
  }
}

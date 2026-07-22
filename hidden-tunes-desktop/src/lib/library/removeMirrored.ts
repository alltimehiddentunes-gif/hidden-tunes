import { unlikeSong } from '../home/musicLikesStorage'
import {
  isLectureSeriesSaved,
  toggleSavedLectureSeries,
  type LectureSavedEntry,
} from '../lectures/lectureProgressStorage'
import { isTvFavorite, toggleTvFavorite } from '../tv/tvLocalState'
import type { DesktopLibraryItem } from './types'
import { removeFavorite } from './libraryService'

/**
 * Remove from typed Library and mirror legacy family stores via their
 * existing toggle helpers (which dual-write back into Library).
 */
export function removeLibraryItemMirrored(item: DesktopLibraryItem): void {
  switch (item.type) {
    case 'song':
      unlikeSong(item.id)
      return
    case 'tv':
      if (isTvFavorite(item.id)) {
        toggleTvFavorite(item.id)
        return
      }
      removeFavorite('tv', item.id)
      return
    case 'lecture': {
      if (isLectureSeriesSaved(item.id)) {
        const entry: LectureSavedEntry = {
          seriesId: item.id,
          seriesTitle: item.title,
          speakerName: 'speaker' in item ? (item.speaker ?? null) : null,
          artworkUrl: item.artwork ?? null,
          categorySlug: item.category ?? null,
          savedAt: item.addedAt,
        }
        toggleSavedLectureSeries(entry)
        return
      }
      removeFavorite('lecture', item.id)
      return
    }
    default:
      removeFavorite(item.type, item.id)
  }
}

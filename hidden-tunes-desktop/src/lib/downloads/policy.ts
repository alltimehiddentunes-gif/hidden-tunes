import type { DownloadabilityClass, DesktopDownloadType } from './types'

export function classifyDesktopDownloadability(
  family:
    | DesktopDownloadType
    | 'radio'
    | 'tv'
    | 'podcast_show'
    | 'sports'
    | 'audiobook'
    | 'lecture_series'
    | string,
): DownloadabilityClass {
  switch (family) {
    case 'song':
    case 'podcast_episode':
    case 'audiobook_chapter':
    case 'motivational':
    case 'lecture':
      return 'downloadable'
    case 'radio':
    case 'tv':
    case 'podcast_show':
    case 'sports':
    case 'audiobook': // book container — chapters only
    case 'lecture_series':
      return 'stream_only'
    default:
      return 'unsupported'
  }
}

export function downloadabilityLabel(value: DownloadabilityClass) {
  switch (value) {
    case 'downloadable':
      return 'Available offline'
    case 'stream_only':
      return 'Live stream — not downloadable'
    case 'unsupported':
      return 'Not available for offline use'
    default:
      return 'Offline availability unknown'
  }
}

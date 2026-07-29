import type { ApiSong } from '../api'
import { isTvQueueSong } from '../tv/tvPlaybackAdapter'

/**
 * Which right-rail player surface to mount for the active media session.
 *
 * Intentionally route-agnostic: browsing Music/Home/Podcasts must not flip
 * this while a TV channel (or other family) remains the active session.
 */
export type ActivePlayerSurface = 'tv' | 'audio'

/**
 * Resolve the persistent right-rail surface from the active playback track only.
 * Do not pass activeNavKey / activePage / pathname into this helper.
 */
export function resolveActivePlayerSurface(
  currentTrack: ApiSong | null | undefined,
): ActivePlayerSurface {
  if (currentTrack && isTvQueueSong(currentTrack)) return 'tv'
  return 'audio'
}
